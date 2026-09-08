"""Windows collector for the free website. No listening ports or AI account.

Uses the installed-source copy here, isolated cache/state, and a repository-only
publishing key. Only public data files are pushed to the data-updates branch.
"""
import argparse
import copy
import datetime as dt
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

import static_publish as publication
from shared_server import DataDirectoryLock

ROOT = Path(__file__).resolve().parent
PRIVATE = ROOT / '.local-publisher'
REPO = 'https://github.com/gn45db4tjc-ship-it/predecessor-meta.git'
PUSH_REPO = 'git@github.com:gn45db4tjc-ship-it/predecessor-meta.git'
BRANCH = 'data-updates'
CHECK_SECONDS = 3 * 3600


def due(state, now):
    last = state.get('last_check_at')
    if not last:
        return True
    age = now - publication.utc_time(last)
    return age.total_seconds() < 0 or age.total_seconds() >= CHECK_SECONDS


def export_feed(state_folder, out):
    out = Path(out); out.mkdir(parents=True, exist_ok=True)
    state = publication.read_json(Path(state_folder)/'publication.json', {})
    report = publication.publication_report(state)
    receipt = {'schema': 1, 'checked_at': state.get('patch_check', {}).get('checked_at'),
               'last_full_attempt_at': state.get('last_full_attempt_at'),
               'last_full_seconds': state.get('last_full_seconds'),
               'attempts': report['cohorts'], 'bundles': {}}
    if not receipt['checked_at']:
        raise ValueError('No completed local check is available to publish')
    publication.utc_time(receipt['checked_at'])
    for bracket in publication.CONFIG['brackets']:
        bundle = publication.load_success(state_folder, bracket)
        if bundle is None:
            continue
        raw = json.dumps(bundle, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()
        filename = bracket + '.json'
        publication.base.atomic_write(out/filename, raw.decode('utf8'))
        receipt['bundles'][bracket] = {'file': filename, 'sha256': hashlib.sha256(raw).hexdigest(),
                                      'generated_at': bundle['generated_at']}
    publication.write_json(out/'collector.json', receipt)
    return receipt


def git(args, cwd, *, push=False):
    executable = shutil.which('git') or r'C:\Program Files\Git\cmd\git.exe'
    hooks = PRIVATE/'empty-hooks'; hooks.mkdir(parents=True, exist_ok=True)
    command = [executable, '-c', 'http.sslBackend=openssl', '-c', 'credential.helper=',
               '-c', 'core.hooksPath='+str(hooks.resolve()),
               '-c', 'user.name=Predecessor Meta updater',
               '-c', 'user.email=predecessor-meta-updater@users.noreply.github.com']
    if push:
        key = PRIVATE/'ssh/windows_publisher_ed25519'
        known = PRIVATE/'ssh/known_hosts'
        if not key.is_file() or not known.is_file():
            raise RuntimeError('The Windows publishing connection has not been configured')
        # Paths are quoted for Git's shell; their contents are never read or logged here.
        config = PRIVATE/'ssh/config'
        if not config.is_file():
            raise RuntimeError('The Windows SSH configuration is missing')
        ssh = '"C:/Windows/System32/OpenSSH/ssh.exe" -F "'+config.as_posix()+'"'
        command += ['-c', 'core.sshCommand='+ssh]
    env = dict(os.environ, GIT_TERMINAL_PROMPT='0', GCM_INTERACTIVE='never')
    result = subprocess.run(command+list(args), cwd=cwd, env=env, capture_output=True,
                            text=True, timeout=180, creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    if result.returncode:
        raise RuntimeError('Publishing Git operation failed: '+result.stderr.strip()[:1500])
    return result.stdout.strip()


def publish_feed(state_folder):
    repo = PRIVATE/'data-repo'; repo.mkdir(parents=True, exist_ok=True)
    if not (repo/'.git').exists():
        git(['init', '-b', BRANCH], repo)
        git(['remote', 'add', 'origin', REPO], repo)
    if git(['remote', 'get-url', 'origin'], repo) != REPO:
        raise ValueError('Unexpected publisher repository; no push attempted')
    # Only read data from the remote. Never fetch or execute remote application code.
    remote = git(['ls-remote', '--heads', 'origin', 'refs/heads/'+BRANCH], repo)
    if remote:
        git(['fetch', '--no-tags', 'origin', BRANCH], repo)
        git(['merge', '--ff-only', 'FETCH_HEAD'], repo)
    receipt = export_feed(state_folder, repo)
    files = ['collector.json'] + [v['file'] for v in receipt['bundles'].values()]
    git(['add', '--']+files, repo)
    changed = git(['diff', '--cached', '--name-only'], repo).splitlines()
    if not set(changed).issubset(set(files)):
        raise ValueError('Unexpected staged file; publisher only permits public data files')
    if changed:
        git(['commit', '-m', 'Update dated public game data'], repo)
    # Push only this dedicated data branch. Never force-push or modify main.
    git(['push', PUSH_REPO, 'HEAD:refs/heads/'+BRANCH], repo, push=True)
    return {'commit': git(['rev-parse', 'HEAD'], repo), 'cohorts': sorted(receipt['bundles'])}


def run_once(*, force=False, collect_only=False, publish_only=False):
    PRIVATE.mkdir(parents=True, exist_ok=True)
    state_folder = PRIVATE/'state'; state_folder.mkdir(parents=True, exist_ok=True)
    with DataDirectoryLock(state_folder):
        status_path = PRIVATE/'updater.json'
        status = publication.read_json(status_path, {})
        now = publication.base.now_utc()
        check_due = force or due(status, now)
        if not publish_only and check_due:
            status.update(last_check_at=publication.base.iso(now), status='collecting')
            publication.write_json(status_path, status)
            config = publication.CONFIG
            try:
                publication.CONFIG = dict(config, cloud_collection_paused_reason=None)
                publication.run(state_folder, PRIVATE/'preview', manual=force)
            finally:
                publication.CONFIG = config
            status.update(status='collected', pending_publish=True)
            publication.write_json(status_path, status)
        if collect_only:
            return export_feed(state_folder, PRIVATE/'prepared-feed')
        if not status.get('pending_publish') and not publish_only and not check_due:
            return {'status':'not due'}
        try:
            result = publish_feed(state_folder)
            status.update(status='published', pending_publish=False,
                          last_published_at=publication.base.iso(publication.base.now_utc()), **result)
            status.pop('error', None)
        except Exception as error:
            status.update(status='publish failed', pending_publish=True, error=str(error))
            publication.write_json(status_path, status)
            raise
        publication.write_json(status_path, status)
        return status


def daemon():
    """Checks on sign-in/resume, then every three hours; source pulls retain daily policy."""
    PRIVATE.mkdir(parents=True, exist_ok=True)
    with DataDirectoryLock(PRIVATE):
        stop = PRIVATE/'stop'; stop.unlink(missing_ok=True)
        next_attempt = 0
        while not stop.exists():
            if time.time() >= next_attempt:
                next_attempt = time.time()+CHECK_SECONDS
                try:
                    publication.base.log(json.dumps(run_once(), ensure_ascii=False))
                except Exception as error:
                    publication.base.log('Windows updater: '+str(error))
            time.sleep(30)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--force',action='store_true')
    parser.add_argument('--collect-only',action='store_true')
    parser.add_argument('--publish-only',action='store_true')
    parser.add_argument('--daemon',action='store_true')
    parser.add_argument('--stop',action='store_true')
    args=parser.parse_args()
    if args.stop:
        PRIVATE.mkdir(parents=True,exist_ok=True);(PRIVATE/'stop').touch();return
    if args.daemon:
        PRIVATE.mkdir(parents=True,exist_ok=True)
        log=PRIVATE/'updater.log'
        if log.exists() and log.stat().st_size>2_000_000:
            os.replace(log,PRIVATE/'updater-previous.log')
        with log.open('a',encoding='utf8',buffering=1) as stream:
            sys.stdout=sys.stderr=stream
            try:daemon()
            except RuntimeError as error:print(error)
    else:print(json.dumps(run_once(force=args.force,collect_only=args.collect_only,publish_only=args.publish_only),ensure_ascii=False))


if __name__=='__main__':main()
