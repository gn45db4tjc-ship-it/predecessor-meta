"""Free static publication, independent of the owner app and its saved data.

Only this module collects. The browser reads immutable, dated public bundles.
--preview-seed renders existing evidence without downloading or changing its dates.
"""
import argparse
import concurrent.futures
import copy
import datetime as dt
import gzip
import hashlib
import json
import os
import re
import threading
import time
from pathlib import Path
from urllib.parse import urlsplit

import predecessor_meta as base
from shared_server import public_bundle

ROOT = Path(__file__).resolve().parent
CONFIG = json.loads((ROOT / 'free_hosting.json').read_text(encoding='utf8'))
UTC = dt.timezone.utc


def read_json(path, default=None):
    try:
        return json.loads(Path(path).read_text(encoding='utf8'))
    except FileNotFoundError:
        return copy.deepcopy(default)


def write_json(path, value):
    base.atomic_write(Path(path), json.dumps(value, ensure_ascii=False, separators=(',', ':')))


def utc_time(value):
    date = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    if not date.tzinfo:
        raise ValueError('Publication timestamps require a time zone')
    return date.astimezone(UTC)


def daily_boundary(now):
    hour, minute = map(int, CONFIG['daily_utc'].split(':'))
    boundary = now.astimezone(UTC).replace(hour=hour, minute=minute, second=0, microsecond=0)
    return boundary if now >= boundary else boundary - dt.timedelta(days=1)


def live_signature(official):
    """Fingerprint current/released article content, not future announcements or check time."""
    if official.get('status') != 'verified':
        return None
    live = official.get('live', {})
    if live.get('status') != 'live' or not live.get('version') or not live.get('fingerprint'):
        return None
    # The preceding launch article can contain hotfix sections relevant to this balance patch.
    articles = [a for a in official.get('articles', []) if a.get('status') == 'live']
    rows = sorted((a['version'], a['fingerprint']) for a in articles)
    rows.append(('current', live['version'], live['fingerprint']))
    return hashlib.sha256(json.dumps(rows).encode()).hexdigest()


def collection_reason(state, official, now, manual=False):
    signature = live_signature(official)
    if manual:
        return 'Manual update'
    last = state.get('last_full_attempt_at')
    if not last or utc_time(last) < daily_boundary(now):
        return 'Daily update'
    # Remember attempts as well as successes: an unavailable source is not hammered every check.
    if signature and signature != state.get('last_attempted_signature'):
        return 'Live patch or hotfix article changed'
    transition = state.get('patch_transition_at')
    if (signature and transition and not state.get('blocked_in_last_full')
            and signature != state.get('last_completed_signature')
            and dt.timedelta(0) <= now-utc_time(transition) <= dt.timedelta(hours=CONFIG['patch_window_hours'])
            and now-utc_time(last) >= dt.timedelta(hours=CONFIG['patch_catchup_hours'])):
        return 'Patch-day source catch-up'
    return None


def patch_summary(official):
    live = official.get('live', {})
    return {
        'status': official.get('status', 'failed'),
        'checked_at': official.get('checked_at'),
        'version': live.get('version'), 'url': live.get('url', base.OFFICIAL_INDEX),
        'signature': live_signature(official), 'error': official.get('error'),
        'announcements': [{k: a.get(k) for k in ('version', 'release_date', 'url', 'title')}
                          for a in official.get('articles', []) if a.get('status') == 'announced'],
    }


def configure_collector(folder):
    folder = Path(folder).resolve()
    folder.mkdir(parents=True, exist_ok=True)
    # This directory is dedicated cloud/cache state; never use the installed owner's directory.
    base.DATA_DIR = folder
    base.SNAP_DIR = folder / 'snapshots'
    base.LATEST_BUNDLE = folder / 'latest_bundle.json'
    base.SETTINGS_FILE = folder / 'settings.json'
    base.OUT_HTML = folder / 'unused-export.html'


class RunFetchCache:
    """Deduplicate across cohorts, including failures; stop a blocked host for the entire run."""
    def __init__(self, fetch):
        self.fetch = fetch
        self.lock = threading.Lock()
        self.futures = {}
        self.blocked = set()

    def __call__(self, url, *args, **kwargs):
        host = urlsplit(url).netloc
        with self.lock:
            if host in self.blocked:
                raise base.SourceBlocked('This source was blocked earlier in this publication run: ' + host)
            future = self.futures.get(url)
            owner = future is None
            if owner:
                future = self.futures[url] = concurrent.futures.Future()
        if not owner:
            return future.result()
        try:
            result = self.fetch(url, *args, **kwargs)
            future.set_result(result)
            return result
        except Exception as error:
            if isinstance(error, base.SourceBlocked):
                with self.lock:
                    self.blocked.add(host)
            future.set_exception(error)
            raise


def validate_public_bundle(bundle, bracket):
    if bracket not in base.BRACKETS or bundle.get('bracket', {}).get('segment') != bracket:
        raise ValueError('Published bundle has the wrong rank bracket')
    if not isinstance(bundle.get('heroes'), dict) or not bundle['heroes'] or not isinstance(bundle.get('tier_list'), list) or not bundle['tier_list']:
        raise ValueError('Published bundle is missing heroes or tier rows')
    utc_time(bundle['generated_at'])
    good, reason = base.bundle_is_complete(bundle)
    if not good:
        raise ValueError('Bundle is not a complete successful collection: ' + reason)
    return public_bundle(bundle)


def retain_success(bundle, folder):
    bracket = bundle.get('bracket', {}).get('segment')
    clean = validate_public_bundle(bundle, bracket)
    raw = json.dumps(clean, ensure_ascii=False, separators=(',', ':')).encode('utf8')
    target = Path(folder) / 'bundles' / (bracket + '.json.gz')
    target.parent.mkdir(parents=True, exist_ok=True)
    temp = target.with_suffix('.tmp')
    temp.write_bytes(gzip.compress(raw, mtime=0))
    os.replace(temp, target)
    return clean


def load_success(folder, bracket):
    target = Path(folder) / 'bundles' / (bracket + '.json.gz')
    if not target.exists():
        return None
    return validate_public_bundle(json.loads(gzip.decompress(target.read_bytes())), bracket)


def import_public_seed(path, folder):
    """Import a validated public snapshot without changing its date or replacing newer data."""
    seed = json.loads(gzip.decompress(Path(path).read_bytes()))
    bracket = seed.get('bracket', {}).get('segment')
    seed = validate_public_bundle(seed, bracket)
    previous = load_success(folder, bracket)
    if previous and utc_time(previous['generated_at']) >= utc_time(seed['generated_at']):
        return False
    retain_success(seed, folder)
    return True


def output_flag(name, value):
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf8') as stream:
            stream.write(name + '=' + str(value).lower() + '\n')


def publication_report(state):
    """Small public diagnostic: source failures remain inspectable without a website."""
    report = {key: state.get(key) for key in ('last_full_attempt_at', 'last_full_seconds')}
    report['patch_check'] = {key: state.get('patch_check', {}).get(key)
                             for key in ('status', 'checked_at', 'version', 'error')}
    report['cohorts'] = {}
    for bracket in CONFIG['brackets']:
        attempt = state.get('attempts', {}).get(bracket, {})
        report['cohorts'][bracket] = {
            key: attempt.get(key) for key in ('status', 'at', 'seconds')}
        report['cohorts'][bracket]['errors'] = [
            {key: error.get(key) for key in ('source', 'severity', 'detail')}
            for error in attempt.get('errors', [])]
    return report


def diagnose_pred(folder):
    """Explicit maintenance probe: one public page, no statistical collection."""
    folder = Path(folder)
    state = read_json(folder / 'publication.json', {})
    if state.get('blocked_in_last_full'):
        result = {'status': 'withheld', 'reason': 'Previous source block; no new request sent'}
    else:
        try:
            raw, http_status, seconds = base.http_get(base.PRED_BASE + '/heroes')
            scripts = re.findall(r'<script([^>]*)>', raw, re.I)
            # Report visible text and asset paths, never inline script values or challenge tokens.
            visible = re.sub(r'<(script|style)\b[^>]*>.*?</\1>', '', raw, flags=re.S | re.I)
            asset_paths = [urlsplit(src).path for attrs in scripts
                           for src in re.findall(r'\bsrc=["\']([^"\']+)["\']', attrs)]
            result = {'seconds': seconds, 'characters': len(raw),
                      'title': [base.clean_text(v)[:160] for v in re.findall(r'<title>(.*?)</title>', raw, re.S | re.I)],
                      'script_count': len(scripts), 'embedded_marker_count': raw.count('data-sveltekit-fetched'),
                      'http_status': http_status,
                      'headings': [base.clean_text(v)[:240] for v in re.findall(r'<h1\b[^>]*>(.*?)</h1>', visible, re.S | re.I)],
                      'noscript': [base.clean_text(v)[:240] for v in re.findall(r'<noscript\b[^>]*>(.*?)</noscript>', visible, re.S | re.I)],
                      'script_paths': asset_paths,
                      'sveltekit_markers': raw.count('sveltekit'),
                      'access_notice_markers': [v for v in ('challenge-platform', 'just a moment', 'access denied',
                                                          'verify you are human', 'enable javascript and cookies') if v in raw.lower()]}
            try:
                result.update(status='ok', payload_count=len(base.pred_payloads(raw)))
            except ValueError as error:
                result.update(status='failed', error=str(error))
        except Exception as error:
            result = {'status': 'failed', 'error': str(error)}
    result['checked_at'] = base.iso(base.now_utc())
    write_json(folder / 'pred-diagnostic.json', result)
    base.log('Pred.gg diagnostic: ' + json.dumps(result, ensure_ascii=False))
    return result


def render_site(folder, out, state):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    manifest = {'schema': 1, 'published_at': base.iso(base.now_utc()),
                'default_bracket': CONFIG['default_bracket'],
                'schedule': {'daily_utc': CONFIG['daily_utc'], 'patch_check_hours': CONFIG['patch_check_hours']},
                'patch_check': state.get('patch_check', {}), 'cohorts': {},
                'last_verified_patch_check': state.get('last_verified_patch_check'),
                'last_full_attempt_at': state.get('last_full_attempt_at')}
    manifest['collection_paused_reason'] = CONFIG.get('cloud_collection_paused_reason')
    for bracket in CONFIG['brackets']:
        bundle = load_success(folder, bracket)
        attempt = state.get('attempts', {}).get(bracket, {})
        entry = {'label': bracket.capitalize() + '+', 'last_attempt': attempt}
        if bundle:
            raw = json.dumps(bundle, ensure_ascii=False, separators=(',', ':')).encode('utf8')
            digest = hashlib.sha256(raw).hexdigest()
            relative = 'bundles/' + bracket + '-' + digest + '.json'
            target = out / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw)
            entry.update(url=relative, sha256=digest, generated_at=bundle['generated_at'],
                         patch=bundle.get('official', {}).get('live', {}).get('version'),
                         source_signature=live_signature(bundle.get('official', {})), status='available')
        else:
            entry['status'] = 'unavailable'
        manifest['cohorts'][bracket] = entry
    # A failed first collection must never deploy an empty replacement over a working site.
    available = any(c['status'] == 'available' for c in manifest['cohorts'].values())
    output_flag('publishable', available)
    if not available:
        return manifest
    config = {'mode': 'static', 'tool_version': base.VERSION, 'manifest': 'manifest.json'}
    html = base.render_html(None, config)
    marker = '// START CLIENT'
    if html.count(marker) != 1:
        raise ValueError('UI startup marker changed; static adapter needs review')
    html = html.replace(marker, (ROOT / 'static_client.js').read_text(encoding='utf8') + '\n' + marker, 1)
    (out / 'index.html').write_text(html, encoding='utf8')
    (out / '.nojekyll').write_text('', encoding='utf8')
    write_json(out / 'manifest.json', manifest)
    return manifest


def run(folder, out, *, manual=False, preview_seeds=(), check_only=False):
    folder = Path(folder).resolve()
    folder.mkdir(parents=True, exist_ok=True)
    state = read_json(folder / 'publication.json', {'schema': 1, 'attempts': {}})
    configure_collector(folder / 'collector')
    if preview_seeds:
        for path in preview_seeds:
            clean = retain_success(base.load_bundle(Path(path)), folder)
            if clean['bracket']['segment'] == CONFIG['default_bracket']:
                state['patch_check'] = patch_summary(clean.get('official', {}))
        # A seed is a dated preview, never a claim that a source was checked now.
        state['preview'] = True
        write_json(folder / 'publication.json', state)
        return render_site(folder, out, state)
    started = time.perf_counter()
    original_fetch, original_official = base.http_get, base.fetch_official
    base.http_get = RunFetchCache(original_fetch)
    try:
        base.log('Checking official release notes and embedded hotfixes before deciding on a full collection…')
        try:
            official = original_official()
        except Exception as error:
            official = {'status': 'failed', 'checked_at': base.iso(base.now_utc()), 'error': str(error)}
        previous_signature = state.get('patch_check', {}).get('signature') or state.get('last_attempted_signature')
        signature = live_signature(official)
        if previous_signature and signature and previous_signature != signature:
            state['patch_transition_at'] = base.iso(base.now_utc())
        state['patch_check'] = patch_summary(official)
        if signature:
            state['last_verified_patch_check'] = copy.deepcopy(state['patch_check'])
        now = base.now_utc()
        paused = CONFIG.get('cloud_collection_paused_reason')
        output_flag('collection_paused', bool(paused))
        reason = None if check_only or paused else collection_reason(state, official, now, manual)
        day = now.astimezone(UTC).date().isoformat()
        output_flag('maintenance_record', state.get('maintenance_day') != day)
        state['maintenance_day'] = day
        if reason:
            changed_patch = live_signature(official) != state.get('last_attempted_signature')
            state['last_full_attempt_at'] = base.iso(now)
            state['last_attempted_signature'] = live_signature(official)
            state['blocked_in_last_full'] = False
            # Checkpoint before any slow work. A crash cannot cause a retry storm.
            for bracket in CONFIG['brackets']:
                state['attempts'][bracket] = {'at': base.iso(now), 'status': 'interrupted',
                    'reason': reason, 'errors': [{'source': 'Daily collection', 'severity': 'error',
                    'detail': 'This collection did not finish. The last successful data is retained.'}]}
            write_json(folder / 'publication.json', state)
            base.fetch_official = lambda **kwargs: copy.deepcopy(official)
            for bracket in CONFIG['brackets']:
                attempt = state['attempts'][bracket]
                try:
                    previous = load_success(folder, bracket)
                    if previous:
                        base.save_bundle(previous, base.DATA_DIR / ('last_successful_' + bracket + '.json'))
                    bundle = base.collect_bundle(dict(base.DEFAULT_SETTINGS, bracket=bracket, open_browser=False,
                                                       force_history_refresh=changed_patch),
                                                 lambda message: base.log(bracket + ': ' + message))
                    complete, why = base.bundle_is_complete(bundle)
                    attempt.update(at=base.iso(base.now_utc()), status='ok' if complete else 'failed',
                                   seconds=bundle.get('timings', {}).get('cold_refresh_secs'),
                                   errors=[e for e in bundle.get('errors', []) if e.get('severity') == 'error'])
                    if complete:
                        retain_success(bundle, folder)
                        base.save_bundle(public_bundle(bundle), base.DATA_DIR / ('last_successful_' + bracket + '.json'))
                    elif not attempt['errors']:
                        attempt['errors'] = [{'source': 'Collection validation', 'severity': 'error', 'detail': why}]
                except Exception as error:
                    attempt.update(status='failed', errors=[{'source': 'Collection: ' + bracket,
                                   'severity': 'error', 'detail': str(error)}])
                state['blocked_in_last_full'] = state['blocked_in_last_full'] or any(
                    re.search(r'403|429|blocked|rate.limit', e.get('detail',''), re.I) for e in attempt.get('errors',[]))
                write_json(folder / 'publication.json', state)
            state['last_full_seconds'] = round(time.perf_counter() - started, 2)
            state['blocked_in_last_full'] = any(re.search(r'403|429|blocked|rate.limit', e.get('detail',''), re.I)
                for a in state['attempts'].values() for e in a.get('errors',[]))
            if all(a.get('status') == 'ok' for a in state['attempts'].values()):
                state['last_completed_signature'] = signature
            output_flag('full_attempt', True)
        else:
            base.log('Statistics collection paused: ' + paused if paused else
                     'Official-only maintenance check; no statistics requested.' if check_only else
                     'No daily update due and no changed live patch. Retaining the original sample dates.')
        write_json(folder / 'publication.json', state)
        report = publication_report(state)
        write_json(folder / 'publication-report.json', report)
        base.log('Publication diagnostic: ' + json.dumps(report, ensure_ascii=False))
        manifest = render_site(folder, out, state)
        failed = official.get('status') != 'verified' or (not paused and any(
            a.get('status') != 'ok' for a in state.get('attempts', {}).values()))
        output_flag('source_failed', failed)
        base.log(json.dumps({'full_collection_reason': reason, 'seconds': round(time.perf_counter()-started, 2),
                             'available_cohorts': [k for k, v in manifest['cohorts'].items() if v['status']=='available'],
                             'source_failed': failed}))
        return manifest
    finally:
        base.http_get, base.fetch_official = original_fetch, original_official


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--state-dir', type=Path, default=ROOT / '.cloud-state')
    parser.add_argument('--output', type=Path, default=ROOT / '_site')
    parser.add_argument('--manual', action='store_true')
    parser.add_argument('--diagnose-pred', action='store_true', help='Maintenance: inspect one public Pred.gg response without collecting statistics')
    parser.add_argument('--check-only', action='store_true', help='Developer/maintenance check of official notes without statistical collection')
    parser.add_argument('--preview-seed', type=Path, action='append', default=[])
    parser.add_argument('--import-public-seed', type=Path, action='append', default=[])
    args = parser.parse_args()
    if args.diagnose_pred:
        if args.manual or args.check_only or args.preview_seed:
            parser.error('--diagnose-pred cannot be combined with collection or preview flags')
        diagnose_pred(args.state_dir)
        return 0
    if args.manual and args.check_only: parser.error('--manual and --check-only cannot be combined')
    for path in args.import_public_seed:
        import_public_seed(path, args.state_dir)
    result = run(args.state_dir, args.output, manual=args.manual, preview_seeds=args.preview_seed, check_only=args.check_only)
    return 0 if any(c['status']=='available' for c in result['cohorts'].values()) else 1


if __name__ == '__main__':
    raise SystemExit(main())
