"""Review auto-merge gate (freshness Phase 4, 2.47.0). Standard library only.

A review pull request from the scheduled reviewer (label `automated-review`) merges itself only when all of these hold
(STRATEGY-REVIEW-POLICY.md, "Current scheduling decision"):

- it touches guidance and review files only: reviewed_guidance.json, the same-patch supplement, docs/rechecks/
  (ledger and report) and SOURCE-MANIFEST.json entries for those files, its line endings unchanged; no code;
- the validators, the Python and Node tests and the browser suites pass on a preview built from live data (the
  workflow's checks job), and CI is green;
- every changed entry has a complete ledger record: verdict, reason, uncertainties, review date and dated sources;
- no grade moves more than one step;
- nothing unresolved supports a newly endorsed choice;
- the pass is logged in guidance.recheck_log.

It is held for the owner (DECISION NEEDED) for a hero's first grade, a removed grade or plan, a policy exception, a
validator or policy change, or a pass that would change more than 10 grades. Auto-merge is on only while
free_hosting.json `review_auto_merge` is true on main and the nightly live check has passed on main for the last two
runs. After a merge the live site must carry the merged packet within 30 minutes; otherwise the merge is reverted.

Commands (used by .github/workflows/review-gate.yml):
  scope   --base SHA --head SHA                 only review files changed? (reads git; executes nothing from the PR)
  decide  --base SHA --head SHA --out FILE      the merge, hold, wait or fail decision
  validate-live BUNDLE...                       the packet validates against each live rank bundle
  verify-live --merge SHA --changes FILE        the live site carries the merged packet (polls up to 30 minutes)
  record  --pr N --head SHA --changes FILE      before the merge: a durable pending record (an issue) for it
  settle  --pr N                                after the merge: publish, verify, else revert and confirm the revert
  pending                                       how many pending records a resume would pick up
  resume                                        finish pending records whose own run stopped (scheduled)
  comment FILE                                  the PR comment for a decision
  update-manifest                               refresh SOURCE-MANIFEST.json hashes of changed review files
"""
import argparse
import datetime as dt
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SITE = 'https://gn45db4tjc-ship-it.github.io/predecessor-meta/'
# Every rank the site publishes (predecessor_meta.BRACKETS). The live check needs all of them: a manifest that lists
# fewer ranks, or none, is incomplete data, never a pass.
RANKS = ('bronze', 'silver', 'gold', 'platinum', 'diamond', 'master', 'paragon')
ALLOWED = (r'reviewed_guidance\.json', r'patch-[0-9.]+\.json', r'docs/rechecks/[0-9A-Za-z._-]+\.(json|md)', r'SOURCE-MANIFEST\.json')
HOLD_FILES = {'predecessor_meta.py': 'the validator would change', 'STRATEGY-REVIEW-POLICY.md': 'the review policy would change'}
ORDER = {'S': 0, 'A': 1, 'B': 2, 'C': 3}
VERDICTS = ('changed', 'checked and retained', 'unresolved')
PLAN_PARTS = ('core', 'finish', 'crest', 'augment', 'eternal', 'blessings')
SUPPLEMENT_SECTIONS = ('heroes', 'perks', 'definitions', 'corrections', 'hero_context')
MAX_GRADE_CHANGES = 10
VERIFY_MINUTES = 30
# The nightly live check runs once a day (live-check.yml), and GitHub drops some scheduled runs. Its newest completed
# run must have started within NIGHTLY_HOURS, the one before within a day more; an older success reads "expired"
# (audit #239 F7), so two old passes cannot keep auto-merge open after the nightly check stops running.
NIGHTLY_HOURS = 50
# Pending merges (audit #239 F2). The gate writes a record before it merges and updates it at each stage. A record
# the decide job left behind (cancelled, timed out, runner lost) is resumed by the scheduled resume job, but only once
# the decide job's 150-minute limit has certainly passed, and at most RESUME_LIMIT times.
PENDING_LABEL = 'review-gate-pending'
PENDING_MARK = '<!-- review-gate-pending -->'
RESUME_AFTER_MINUTES = 160
RESUME_LIMIT = 3
MERGED_WITHIN_MINUTES = 20   # a merge long after the record was written was not the gate's
# Only issues the workflow's own GITHUB_TOKEN opened are records: a person with Triage access can open and label an
# issue, but not as this account, and cannot edit its body (Codex security review of PR #243).
RECORD_AUTHOR = 'github-actions[bot]'


def zoned(value):
    try:
        parsed = dt.datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    except ValueError:
        return False
    return parsed.tzinfo is not None


def allowed(path):
    return any(re.fullmatch(p, path) for p in ALLOWED)


def scope(files):
    """(failures, holds) for the changed paths: anything outside review files fails, except the named holds."""
    failures, holds = [], []
    for path in files:
        if allowed(path):
            continue
        if path in HOLD_FILES:
            holds.append('DECISION NEEDED: %s (%s).' % (HOLD_FILES[path], path))
        else:
            failures.append('Touches a file outside guidance and review files: %s.' % path)
    return failures, holds


def manifest_scope(base, head):
    """SOURCE-MANIFEST.json may change only in the hashes of review files."""
    if base is None or head is None:
        return []
    failures = []
    for key in set(base) | set(head):
        if key != 'files' and base.get(key) != head.get(key):
            failures.append('SOURCE-MANIFEST.json changes "%s"; a review may change only review-file hashes.' % key)
    files_b, files_h = base.get('files') or {}, head.get('files') or {}
    for path in set(files_b) | set(files_h):
        if files_b.get(path) != files_h.get(path) and not allowed(path):
            failures.append('SOURCE-MANIFEST.json changes the hash of %s.' % path)
    return failures


def line_endings(raw):
    crlf, lf = raw.count(b'\r\n'), raw.count(b'\n')
    return 'LF' if not crlf else 'CRLF' if crlf == lf else 'mixed'


def manifest_line_endings(base, head):
    """SOURCE-MANIFEST.json keeps the base's line endings: rewriting them is a whole-file diff that conflicts with other PRs."""
    if base is None or head is None:
        return []
    before, after = line_endings(base), line_endings(head)
    if before == after:
        return []
    return ['SOURCE-MANIFEST.json changes its line endings from %s to %s; keep them as on the base.' % (before, after)]


def entries(packet, key):
    guidance = (packet or {}).get('guidance') or {}
    rows = (guidance.get('meta_review') or {}).get('entries') if key == 'grades' else guidance.get('builds')
    return {(r.get('slug'), r.get('role')): r for r in rows or []}


def supplement_items(supplement):
    """Every reviewable item of a same-patch supplement, by (kind, key)."""
    items = {}
    for row in (supplement or {}).get('plans') or []:
        items[('plan', row.get('slug'), row.get('role'))] = row
    for section in SUPPLEMENT_SECTIONS:
        value = (supplement or {}).get(section)
        rows = value.items() if isinstance(value, dict) else ((r.get('id'), r) for r in value or [] if isinstance(r, dict))
        for key, row in rows:
            items[('mechanics', section, str(key))] = row
    return items


def ledger_records(ledgers):
    """Ledger entries by (kind, a, b): ('grade', slug, role), ('plan', slug, role) or ('mechanics', section, key)."""
    records = {}
    for path, ledger in ledgers.items():
        for row in (ledger or {}).get('entries') or []:
            kind = row.get('kind', 'grade')
            key = (kind, row.get('section'), str(row.get('key'))) if kind == 'mechanics' else (kind, row.get('slug'), row.get('role'))
            records[key] = dict(row, ledger=path)
    return records


def incomplete(record):
    """What a ledger record lacks, or '' when it is complete."""
    missing = []
    if record.get('verdict') not in VERDICTS:
        missing.append('a verdict (%s)' % ', '.join(VERDICTS))
    for field, label in (('reason', 'a reason'), ('limitation', 'its uncertainties (limitation)')):
        if not str(record.get(field) or '').strip():
            missing.append(label)
    if not zoned(record.get('reviewed_at')):
        missing.append('a zoned review date')
    sources = record.get('sources') or []
    if not sources or not all(isinstance(s, dict) and str(s.get('url', '')).startswith('https://') and zoned(s.get('fetched_at')) for s in sources):
        missing.append('dated https sources')
    return ', '.join(missing)


def evaluate(base, head, files, ledgers, supplements=(None, None), manifests=(None, None), nightly=(), auto_merge=False,
             manifest_bytes=(None, None)):
    """The gate's decision on one review PR. base/head: reviewed_guidance.json; ledgers: changed docs/rechecks/*.json."""
    failures, holds = scope(files)
    failures += manifest_scope(*manifests)
    failures += manifest_line_endings(*manifest_bytes)
    records = ledger_records(ledgers)

    def require(key, label):
        record = records.get(key)
        if record is None:
            failures.append('No ledger record for %s.' % label)
            return None
        missing = incomplete(record)
        if missing:
            failures.append('The ledger record for %s lacks %s.' % (label, missing))
        if record.get('policy_exception'):
            holds.append('DECISION NEEDED: %s needs a policy exception: %s' % (label, record.get('policy_exception')))
        return record

    grades_b, grades_h = entries(base, 'grades'), entries(head, 'grades')
    moved = 0
    for key in sorted(set(grades_b) - set(grades_h)):
        holds.append('DECISION NEEDED: the grade for %s/%s would be removed.' % key)
    for key, entry in sorted(grades_h.items()):
        old = grades_b.get(key)
        if old == entry:
            continue
        label = 'the %s/%s grade' % key
        record = require(('grade',) + key, label)
        if old is None:
            holds.append('DECISION NEEDED: %s/%s would get its first grade (%s).' % (key + (entry.get('tier'),)))
            continue
        if entry.get('tier') != old.get('tier'):
            moved += 1
            if entry.get('tier') not in ORDER or old.get('tier') not in ORDER or abs(ORDER[entry['tier']] - ORDER[old['tier']]) > 1:
                failures.append('%s moves more than one step (%s to %s).' % (label.capitalize(), old.get('tier'), entry.get('tier')))
            if record and (record.get('old_tier'), record.get('tier')) != (old.get('tier'), entry.get('tier')):
                failures.append('The ledger for %s does not record the move %s to %s.' % (label, old.get('tier'), entry.get('tier')))
            raised = entry.get('tier') in ORDER and old.get('tier') in ORDER and ORDER[entry['tier']] < ORDER[old['tier']]
            if record and record.get('verdict') == 'unresolved' and raised:
                failures.append('An unresolved review supports raising %s.' % label)
    if moved > MAX_GRADE_CHANGES:
        holds.append('DECISION NEEDED: %d grades would change (more than %d).' % (moved, MAX_GRADE_CHANGES))

    plans_b, plans_h = entries(base, 'plans'), entries(head, 'plans')
    supp_b, supp_h = supplement_items(supplements[0]), supplement_items(supplements[1])
    for (kind, a, b), row in supp_h.items():
        if kind == 'plan':
            plans_h.setdefault((a, b), row)
    for (kind, a, b), row in supp_b.items():
        if kind == 'plan':
            plans_b.setdefault((a, b), row)
    for key in sorted(set(plans_b) - set(plans_h)):
        holds.append('DECISION NEEDED: the %s/%s build plan would be removed.' % key)
    for key, plan in sorted(plans_h.items()):
        old = plans_b.get(key)
        if old == plan:
            continue
        label = 'the %s/%s plan' % key
        record = require(('plan',) + key, label)
        endorsed = old is None or any(old.get(p) != plan.get(p) for p in PLAN_PARTS)
        result = ((plan.get('patch_review') or plan.get('maintenance_review') or {}).get('result'))
        if endorsed and (result == 'unresolved' or (record or {}).get('verdict') == 'unresolved'):
            failures.append('An unresolved review supports a newly endorsed choice in %s.' % label)
    for key, row in sorted(supp_h.items()):
        if key[0] == 'mechanics' and supp_b.get(key) != row:
            require(key, 'the supplement %s "%s"' % (key[1], key[2]))

    log_b = (base or {}).get('guidance', {}).get('recheck_log') or []
    new_log = [r for r in (head or {}).get('guidance', {}).get('recheck_log') or [] if r not in log_b]
    if not new_log:
        failures.append('The pass is not logged in guidance.recheck_log.')
    for row in new_log:
        if row.get('ledger') not in ledgers:
            failures.append('The logged pass cites %s, which this PR does not add or change.' % row.get('ledger'))

    if failures:
        decision = 'fail'
    elif holds:
        decision = 'hold'
    elif not auto_merge:
        decision, holds = 'wait', ['Auto-merge is off (free_hosting.json review_auto_merge on main).']
    elif list(nightly[:2]) != ['success', 'success']:
        decision, holds = 'wait', ['Auto-merge waits for two consecutive passing nightly live checks on main (last: %s).'
                                   % (', '.join(nightly[:2]) or 'none')]
    else:
        decision = 'merge'
    return {'decision': decision, 'failures': failures, 'holds': holds, 'grades_moved': moved,
            'changed_grades': sorted('%s/%s' % k for k, e in grades_h.items() if grades_b.get(k) != e),
            'expected_tiers': {'%s/%s' % k: e.get('tier') for k, e in grades_h.items() if grades_b.get(k) != e}}


def comment_text(result):
    """The PR comment for a decision."""
    head = {'merge': 'The review gate passed; merging, publishing and verifying the live site.',
            'hold': '**DECISION NEEDED.** The review gate holds this PR for the owner.',
            'wait': 'The review gate passed, but auto-merge is not on, so this PR waits for the owner.',
            'fail': 'The review gate failed; this PR cannot merge as it is.'}[result['decision']]
    lines = [head, '']
    lines += ['- ' + f for f in result.get('failures') or []] + ['- ' + h for h in result.get('holds') or []]
    if result.get('changed_grades'):
        lines += ['', 'Changed grades: ' + ', '.join(result['changed_grades']) + '.']
    lines += ['', 'Decided by `review_gate.py` (`.github/workflows/review-gate.yml`); the rules are in STRATEGY-REVIEW-POLICY.md.']
    return '\n'.join(lines)


# ---- git, GitHub and the live site ----

def git(*args, binary=False):
    out = subprocess.run(['git', *args], cwd=ROOT, capture_output=True, check=True).stdout
    return out if binary else out.decode('utf-8')


def show(sha, path):
    try:
        return git('show', '%s:%s' % (sha, path), binary=True)
    except subprocess.CalledProcessError:
        return None


def show_json(sha, path):
    raw = show(sha, path)
    return None if raw is None else json.loads(raw)


def changed_files(base, head):
    return [p for p in git('diff', '--name-only', '%s...%s' % (base, head)).splitlines() if p]


def nightly_conclusions(now=None, runs=None):
    """Conclusions of the latest completed nightly live checks on main, newest first; "expired" for a run that started
    too long ago (NIGHTLY_HOURS for the newest, a day more for the one before) or has no readable start time."""
    if runs is None:
        out = subprocess.run(['gh', 'run', 'list', '--workflow', 'live-check.yml', '--branch', 'main', '--status', 'completed',
                              '--limit', '2', '--json', 'conclusion,createdAt'], capture_output=True, check=True, text=True).stdout
        runs = json.loads(out)
    now = now or dt.datetime.now(dt.timezone.utc)
    conclusions = []
    for i, run in enumerate(runs):
        started = parse_time(run.get('createdAt'))
        fresh = started is not None and dt.timedelta(0) <= now - started <= dt.timedelta(hours=NIGHTLY_HOURS + 24 * i)
        conclusions.append(run.get('conclusion') if fresh else 'expired')
    return conclusions


def parse_time(value):
    """An ISO time with a zone, or None."""
    try:
        moment = dt.datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    except ValueError:
        return None
    return moment if moment.tzinfo is not None else None


def fetch_bytes(url):
    request = urllib.request.Request(url + ('&' if '?' in url else '?') + 'gate=%d' % time.time(),
                                     headers={'User-Agent': 'predecessor-meta-review-gate', 'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def fetch_json(url):
    return json.loads(fetch_bytes(url))


def fingerprint(sha):
    """guidance_fingerprint() of a commit, from the same bytes the cloud publisher reads."""
    digest = hashlib.sha256()
    supplement = next((p for p in git('ls-tree', '--name-only', sha).splitlines() if re.fullmatch(r'patch-[0-9.]+\.json', p)), 'patch-1.17.json')
    for path in ('reviewed_guidance.json', supplement):
        raw = show(sha, path)
        digest.update(raw if raw is not None else b'missing:' + path.encode('utf8'))
    return digest.hexdigest()[:16]


class LiveManifestError(ValueError):
    """The live manifest itself cannot be read as a publication: no rank on it can be trusted."""


def live_rank(site, rank, cohort, fetch):
    """One manifest entry: its bundle's packet fingerprint and gold tiers, or why it can't be trusted.
    The bundle must be on this site and its bytes must match the sha256 the manifest declares (PRED-M11 F1)."""
    if not isinstance(cohort, dict):
        return {'problem': '%s entry is not an object' % rank}
    url, declared = cohort.get('url'), cohort.get('sha256')
    if not isinstance(url, str) or not url:
        return {'problem': '%s has no published bundle' % rank}
    if not isinstance(declared, str) or not re.fullmatch(r'[0-9a-f]{64}', declared):
        return {'problem': '%s declares no valid sha256' % rank}
    target = urllib.parse.urljoin(site, url)
    if not target.startswith(site):
        return {'problem': '%s bundle is not on %s' % (rank, site)}
    raw = fetch(target)
    digest = hashlib.sha256(raw).hexdigest()
    if digest != declared:
        return {'problem': '%s bundle sha256 %s does not match the manifest %s' % (rank, digest[:12], declared[:12])}
    try:
        bundle = json.loads(raw)
    except ValueError:
        return {'problem': '%s bundle is not JSON' % rank}
    if not isinstance(bundle, dict):
        return {'problem': '%s bundle is not an object' % rank}
    review = (bundle.get('guidance') or {}).get('meta_review') if isinstance(bundle.get('guidance'), dict) else None
    entries = (review or {}).get('entries') if isinstance(review, dict) else None
    tiers = {'%s/%s' % (e.get('slug'), e.get('role')): e.get('tier')
             for e in (entries if isinstance(entries, list) else []) if isinstance(e, dict)}
    return {'fingerprint': bundle.get('guidance_fingerprint'), 'tiers': tiers}


def live_state(site=SITE, fetch=None):
    """Every rank the live manifest lists. A network error propagates (OSError) so verify-live retries;
    a manifest that is not a publication raises LiveManifestError, which verify-live also retries until its deadline."""
    fetch = fetch or fetch_bytes
    try:
        manifest = json.loads(fetch(site + 'manifest.json'))
    except ValueError as error:
        raise LiveManifestError('manifest.json is not JSON: %s' % error) from error
    cohorts = manifest.get('cohorts') if isinstance(manifest, dict) else None
    if not isinstance(cohorts, dict):
        raise LiveManifestError('manifest.json has no cohorts object')
    return {rank: live_rank(site, rank, cohort, fetch) for rank, cohort in cohorts.items()}


def available_ranks(ranks):
    """The ranks a live_state() reading shows with a trusted packet: the set a merge must keep (audit #239 F1)."""
    return sorted(r for r, s in ranks.items() if not s.get('problem') and s.get('fingerprint'))


def verified(ranks, expected_fp, expected_tiers, required=None):
    """Problems with the live site against the merged packet: every rank carries it, and the gold grades match.
    With `required` (the ranks live before the merge, recorded by decide), Gold+ and each of those ranks must be
    present and carry the packet; a rank that was not live before may stay unavailable (audit #239 F1). Without it
    every rank the site publishes must."""
    if required is not None:
        required = set(required) | {'gold'}
        problems = ['%s was live before the merge and is missing now' % r for r in sorted(required) if r not in ranks]
        ranks = {r: s for r, s in ranks.items() if r in required}
    else:
        problems = ['%s is missing from the live manifest' % r for r in RANKS if r not in ranks]
    problems += [s['problem'] for r, s in ranks.items() if s.get('problem')]
    problems += ['%s carries %s, not %s' % (r, s.get('fingerprint'), expected_fp) for r, s in ranks.items()
                 if not s.get('problem') and s.get('fingerprint') != expected_fp]
    gold = (ranks.get('gold') or {}).get('tiers') or {}
    problems += ['gold %s is %s, not %s' % (k, gold.get(k), t) for k, t in expected_tiers.items() if gold.get(k) != t]
    return problems


def verify_live(sha, tiers, required, minutes=VERIFY_MINUTES, state=None, sleep=None, clock=None):
    """Poll the live site until it carries the packet of `sha` (and the gold grades in `tiers`), or `minutes` pass.
    Returns the last problems, empty when verified. An unreadable or invalid answer is retried, never final."""
    state, sleep, clock = state or live_state, sleep or time.sleep, clock or time.time
    try:
        expected_fp = fingerprint(sha)
    except (subprocess.CalledProcessError, OSError) as error:
        # The commit is not in this checkout: never a crash that skips the revert, always a failed verification.
        problem = 'cannot read the packet of %s in this checkout: %s' % (sha, error)
        print('Live verification failed: ' + problem)
        return [problem]
    deadline = clock() + minutes * 60
    problems = ['not checked yet']
    while clock() < deadline:
        try:
            problems = verified(state(), expected_fp, tiers, required)
        except OSError as error:
            problems = ['live site unreadable: %s' % error]
        except ValueError as error:
            problems = ['live manifest invalid: %s' % error]
        if not problems:
            print('Live site carries packet %s on every %srank; %d changed gold grades match.'
                  % (expected_fp, 'previously live ' if required is not None else '', len(tiers)))
            return []
        sleep(60)
    print('Live verification failed after %d minutes: %s' % (minutes, '; '.join(problems)))
    return problems


class RevertError(RuntimeError):
    """The merge could not be reverted on main."""


def revert_on_main(merge, pr, push_url, git_run=None, attempts=3, sleep=None, before_push=None):
    """Revert `merge` on the newest main and push it; a push that main outran is retried from the new tip. A revert
    already on main (an earlier attempt that pushed before its run stopped) is reused, never repeated (audit #239 F2)."""
    git_run = git_run or (lambda *a: subprocess.run(['git', *a], capture_output=True, text=True))
    sleep = sleep or time.sleep
    last = ''
    for attempt in range(attempts):
        fetched = git_run('fetch', '-q', 'origin', 'main')
        if fetched.returncode:
            last = 'fetch failed: ' + fetched.stderr.strip()
            sleep(10)
            continue
        existing = git_run('log', 'origin/main', '--format=%H', '-n', '1', '--grep', 'This reverts commit %s' % merge).stdout.strip()
        if existing:
            return existing
        if git_run('merge-base', '--is-ancestor', merge, 'origin/main').returncode:
            raise RevertError('merge %s is not on main any more' % merge)
        git_run('checkout', '-q', '-B', 'revert-review-%s' % pr, 'origin/main')
        reverted = git_run('revert', '-m', '1', '--no-edit', merge)
        if reverted.returncode:
            git_run('revert', '--abort')
            raise RevertError('git revert of %s failed on main: %s' % (merge, (reverted.stderr or reverted.stdout).strip()))
        if before_push:
            before_push(attempt)
        pushed = git_run('-c', 'http.https://github.com/.extraheader=', 'push', '-q', push_url, 'HEAD:main')
        if not pushed.returncode:
            return git_run('rev-parse', 'HEAD').stdout.strip()
        last = 'push rejected: ' + pushed.stderr.strip()
        sleep(10)
    raise RevertError('could not push a revert of %s after %d attempts (%s)' % (merge, attempts, last))


class GateOps:
    """GitHub and git for the settle and resume commands (the gh CLI with GH_TOKEN; git pushes with WRITER)."""

    def __init__(self):
        self.repo = os.environ.get('GITHUB_REPOSITORY', 'gn45db4tjc-ship-it/predecessor-meta')
        self.run_url = '%s/%s/actions/runs/%s' % (os.environ.get('GITHUB_SERVER_URL', 'https://github.com'), self.repo,
                                                  os.environ.get('GITHUB_RUN_ID', 'local'))

    def gh(self, *args, check=True):
        done = subprocess.run(['gh', *args], capture_output=True, text=True)
        if check and done.returncode:
            raise RuntimeError('gh %s failed: %s' % (args[0], done.stderr.strip()))
        return done

    def now(self):
        return dt.datetime.now(dt.timezone.utc)

    def dispatch_publish(self):
        for attempt in range(3):
            if not self.gh('workflow', 'run', 'publish.yml', '--ref', 'main', check=False).returncode:
                return True
            time.sleep(20)
        return False

    def fetch_main(self):
        """The merge happens on GitHub, so its commit (and a revert pushed elsewhere) must be fetched before its
        packet can be fingerprinted (Codex review of PR #243)."""
        for attempt in range(3):
            if not subprocess.run(['git', 'fetch', '-q', 'origin', 'main'], capture_output=True).returncode:
                return True
            time.sleep(10)
        return False

    def verify(self, sha, tiers, required):
        self.fetch_main()
        return verify_live(sha, tiers, required)

    def merged(self, pr):
        data = json.loads(self.gh('api', 'repos/%s/pulls/%s' % (self.repo, pr)).stdout)
        if not data.get('merged'):
            return None
        return {'sha': data.get('merge_commit_sha'), 'head': (data.get('head') or {}).get('sha'), 'at': data.get('merged_at')}

    def revert(self, merge, pr):
        writer = os.environ.get('WRITER')
        if not writer:
            raise RevertError('no WRITER token to push the revert')
        return revert_on_main(merge, pr, 'https://x-access-token:%s@github.com/%s' % (writer, self.repo))

    def comment(self, pr, text):
        self.gh('pr', 'comment', str(pr), '--body', text, check=False)

    def alarm(self, title, body):
        """Open an issue for the owner. True only when GitHub created it."""
        self.gh('label', 'create', 'freshness-watchdog', '--force', '--color', 'b60205', check=False)
        for attempt in range(3):
            if not self.gh('issue', 'create', '--label', 'freshness-watchdog', '--title', title, '--body',
                           body + ' Run: ' + self.run_url, check=False).returncode:
                return True
            time.sleep(10)
        return False

    def save(self, record):
        record['updated_at'] = self.now().isoformat()
        body = record_body(record)
        if record.get('issue'):
            self.gh('api', '-X', 'PATCH', 'repos/%s/issues/%s' % (self.repo, record['issue']), '-f', 'body=' + body)
            return record
        self.gh('label', 'create', PENDING_LABEL, '--force', '--color', 'fbca04', check=False)
        made = json.loads(self.gh('api', 'repos/%s/issues' % self.repo, '-f', 'title=Review gate: merge of PR #%s in progress' % record['pr'],
                                  '-f', 'body=' + body, '-f', 'labels[]=' + PENDING_LABEL).stdout)
        record['issue'] = made['number']
        self.gh('api', '-X', 'PATCH', 'repos/%s/issues/%s' % (self.repo, record['issue']), '-f', 'body=' + record_body(record))
        return record

    def close(self, record):
        self.save(record)
        self.gh('api', '-X', 'PATCH', 'repos/%s/issues/%s' % (self.repo, record['issue']), '-f', 'state=closed')

    def open_records(self):
        issues = json.loads(self.gh('api', 'repos/%s/issues?labels=%s&state=open&per_page=100' % (self.repo, PENDING_LABEL)).stdout)
        records = []
        for issue in issues:
            if (issue.get('user') or {}).get('login') != RECORD_AUTHOR or issue.get('pull_request'):
                continue
            record = parse_record(issue.get('body'))
            if record is not None:
                record['issue'] = issue['number']
                # The time comes from GitHub, never from the body.
                record['created_at'] = issue.get('created_at')
                records.append(record)
        return records


def new_record(pr, head, changes, run_url, now=None):
    now = (now or dt.datetime.now(dt.timezone.utc)).isoformat()
    return {'pr': pr, 'head': head, 'stage': 'merging', 'expected_ranks': changes.get('expected_ranks'),
            'expected_tiers': changes.get('expected_tiers') or {}, 'merge': None, 'revert': None, 'problems': [],
            'attempts': 0, 'alarmed': [], 'created_at': now, 'updated_at': now, 'run_url': run_url}


def record_body(record):
    return ('%s\nThe review gate is merging PR #%s and has not finished: stage **%s**. It closes this issue when the live '
            'site is verified or the merge is reverted and the revert is live. If its run stops first, the scheduled '
            'resume finishes the job.\n\n```json\n%s\n```\n' % (PENDING_MARK, record.get('pr'), record.get('stage'),
                                                               json.dumps(record, indent=1, sort_keys=True)))


def parse_record(body):
    if not isinstance(body, str) or PENDING_MARK not in body:
        return None
    match = re.search(r'```json\n(.*?)\n```', body, re.S)
    try:
        record = json.loads(match.group(1)) if match else None
    except ValueError:
        return None
    return record if isinstance(record, dict) and isinstance(record.get('pr'), int) else None


def alarm_once(record, ops, key, title, body):
    """One alarm per record and problem, however often a resume retries it. An alarm GitHub did not create is not
    counted, so the next resume sends it again. Returns whether the owner has been told."""
    if key in record.setdefault('alarmed', []):
        return True
    if ops.alarm(title, body):
        record['alarmed'].append(key)
        return True
    return False


def bound(record, merged):
    """The record matches what GitHub says about its PR: merged at the recorded head, soon after the record was
    written, and (once known) as the recorded merge commit. Anything else is never verified, reverted or pushed."""
    created, at = parse_time(record.get('created_at')), parse_time((merged or {}).get('at'))
    return bool(merged and merged.get('sha') and merged.get('head') == record.get('head') and created and at
                and dt.timedelta(0) <= at - created <= dt.timedelta(minutes=MERGED_WITHIN_MINUTES)
                and (record.get('merge') is None or record.get('merge') == merged.get('sha')))


def settle(record, ops):
    """Finish a pending merge from its recorded stage (audit #239 F2): merging -> merged -> verified, or
    merged -> reverting -> reverted -> revert-confirmed. Each stage is saved before the next starts, so a run that
    stops anywhere leaves a record a later resume continues from. Returns the stage it ended on."""
    pr = record['pr']
    if record['stage'] in ('revert-confirmed', 'abandoned', 'refused'):
        # Finished, but the owner's notice was not delivered: send it, and close only once it is.
        return finish_with_notice(record, ops)
    if record['stage'] not in ('merging', 'merged', 'reverting', 'reverted'):
        return record['stage']
    merged = ops.merged(pr)
    if not bound(record, merged):
        if record['stage'] == 'merging':
            # Never merged by this gate: nothing to verify or revert.
            record['stage'] = 'not-merged'
            ops.close(record)
            return record['stage']
        # A later stage that GitHub does not back is refused outright: no verify, revert or push.
        record['notice'] = {'key': 'unbound', 'title': 'Review gate: refused a pending record for PR #%s' % pr,
                            'body': 'Issue #%s claims stage %s with merge %s, but GitHub does not show PR #%s merged at head %s '
                                    'as that commit within %d minutes of the record. Nothing was verified, reverted or pushed.'
                                    % (record.get('issue'), record['stage'], record.get('merge'), pr, record.get('head'),
                                       MERGED_WITHIN_MINUTES)}
        record['stage'] = 'refused'
        return finish_with_notice(record, ops)
    if record['stage'] == 'merging':
        record['merge'], record['stage'] = merged['sha'], 'merged'
        ops.save(record)
    if record['stage'] == 'merged':
        dispatched = ops.dispatch_publish()
        # Verify even when the dispatch failed: the hourly publication may still carry the merge. A failure
        # leads to the revert, never to an early exit with main merged and unverified.
        problems = ops.verify(record['merge'], record.get('expected_tiers') or {}, record.get('expected_ranks'))
        if not problems:
            ops.comment(pr, 'Merged as %s, published, and verified live: every rank carries the merged packet and the '
                            'changed Gold+ grades match.' % record['merge'])
            record['stage'] = 'verified'
            ops.close(record)
            return record['stage']
        record['problems'] = ([] if dispatched else ['publish.yml could not be dispatched']) + list(problems)
        record['stage'] = 'reverting'
        ops.save(record)
    if record['stage'] == 'reverting':
        try:
            record['revert'] = ops.revert(record['merge'], pr)
        except (RevertError, RuntimeError, OSError) as error:
            why = '; '.join(record.get('problems') or []) or 'not verified'
            record['problems'] = [why, 'revert failed: %s' % error]
            alarm_once(record, ops, 'not-reverted', 'Review gate: merge %s NOT reverted (PR #%s)' % (record['merge'], pr),
                       'Merge %s was not verified live (%s), and its revert failed: %s. main still holds it: revert it by '
                       'hand, or wait for the scheduled resume to try again.' % (record['merge'], why, error))
            ops.save(record)
            return record['stage']
        record['stage'] = 'reverted'
        ops.save(record)
        ops.comment(pr, 'The merged packet was not published and verified live within %d minutes, so merge %s was '
                        'reverted as %s. See the review gate run for the diagnosis.' % (VERIFY_MINUTES, record['merge'], record['revert']))
    if record['stage'] == 'reverted':
        ops.dispatch_publish()
        # Confirm the reverted packet on every rank that was live before the merge; the merged grades are not expected.
        problems = ops.verify(record['revert'], {}, record.get('expected_ranks'))
        if not problems:
            record['stage'] = 'revert-confirmed'
            record['notice'] = {'key': 'reverted', 'title': 'Review gate reverted PR #%s' % pr,
                                'body': 'Merge %s did not verify on the live site and was reverted as %s; the live site '
                                        'carries the reverted packet again.' % (record['merge'], record['revert'])}
            return finish_with_notice(record, ops)
        record['problems'] = list(problems)
        alarm_once(record, ops, 'revert-not-live', 'Review gate: revert of %s not confirmed live (PR #%s)' % (record['merge'], pr),
                   'Merge %s did not verify and was reverted as %s on main, but the live site did not carry the reverted '
                   'packet (%s). The scheduled resume checks again.' % (record['merge'], record['revert'], '; '.join(problems)))
        ops.save(record)
    return record['stage']


def finish_with_notice(record, ops):
    """Close a finished record once its notice reached the owner; otherwise keep it open for the next resume."""
    notice = record.get('notice') or {}
    if alarm_once(record, ops, notice.get('key', 'notice'), notice.get('title', 'Review gate: PR #%s' % record['pr']),
                  notice.get('body', 'The review gate finished PR #%s at stage %s.' % (record['pr'], record['stage']))):
        ops.close(record)
    else:
        ops.save(record)
    return record['stage']


def due_records(records, now=None):
    """Records whose writing run has certainly stopped (its job limit passed since the last update)."""
    now = now or dt.datetime.now(dt.timezone.utc)
    due = []
    for record in records:
        updated = parse_time(record.get('updated_at'))
        if updated is None or now - updated >= dt.timedelta(minutes=RESUME_AFTER_MINUTES):
            due.append(record)
    return due


def resume(ops, now=None):
    """Continue each stopped pending record; after RESUME_LIMIT tries it is handed to the owner and closed."""
    outcomes = {}
    for record in due_records(ops.open_records(), now or ops.now()):
        record['attempts'] = int(record.get('attempts') or 0) + 1
        if record['attempts'] > RESUME_LIMIT and record.get('stage') not in ('revert-confirmed', 'abandoned', 'refused'):
            stage = record.get('stage')
            record['stage'] = 'abandoned'
            record['notice'] = {'key': 'abandoned', 'title': 'Review gate: gave up on PR #%s at stage %s' % (record['pr'], stage),
                                'body': 'The review gate could not finish PR #%s after %d resumes (stage %s, merge %s, revert %s, '
                                        'last problems: %s). Check main and the live site by hand.'
                                        % (record['pr'], RESUME_LIMIT, stage, record.get('merge'), record.get('revert'),
                                           '; '.join(record.get('problems') or []) or 'none')}
            finish_with_notice(record, ops)
        else:
            ops.save(record)
            settle(record, ops)
        outcomes[str(record['pr'])] = record['stage']
    return outcomes


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('command', choices=['scope', 'decide', 'comment', 'validate-live', 'verify-live', 'update-manifest',
                                            'record', 'settle', 'pending', 'resume'])
    parser.add_argument('paths', nargs='*')
    parser.add_argument('--base'); parser.add_argument('--head'); parser.add_argument('--merge'); parser.add_argument('--pr')
    parser.add_argument('--out', type=Path); parser.add_argument('--changes', type=Path)
    parser.add_argument('--minutes', type=int, default=VERIFY_MINUTES)
    args = parser.parse_args(argv)

    if args.command == 'scope':
        files = changed_files(args.base, args.head)
        failures, holds = scope(files)
        print('\n'.join(failures + holds) or 'Only review files changed: ' + ', '.join(files))
        return 1 if failures else 0

    if args.command == 'decide':
        files = changed_files(args.base, args.head)
        ledgers = {p: show_json(args.head, p) for p in files if re.fullmatch(r'docs/rechecks/[0-9A-Za-z._-]+\.json', p)}
        supplement = next((p for p in files if re.fullmatch(r'patch-[0-9.]+\.json', p)), None)
        config = show_json(args.base, 'free_hosting.json') or {}
        result = evaluate(show_json(args.base, 'reviewed_guidance.json'), show_json(args.head, 'reviewed_guidance.json'), files, ledgers,
                          supplements=(show_json(args.base, supplement), show_json(args.head, supplement)) if supplement else (None, None),
                          manifests=(show_json(args.base, 'SOURCE-MANIFEST.json'), show_json(args.head, 'SOURCE-MANIFEST.json'))
                          if 'SOURCE-MANIFEST.json' in files else (None, None),
                          manifest_bytes=(show(args.base, 'SOURCE-MANIFEST.json'), show(args.head, 'SOURCE-MANIFEST.json'))
                          if 'SOURCE-MANIFEST.json' in files else (None, None),
                          nightly=nightly_conclusions(), auto_merge=bool(config.get('review_auto_merge')))
        result['files'] = files
        # The ranks live before the merge, so verification afterwards requires each of them (audit #239 F1). An
        # unreadable site records None, and verification then requires every rank the site publishes.
        try:
            result['expected_ranks'] = available_ranks(live_state())
        except (OSError, ValueError) as error:
            result['expected_ranks'] = None
            print('Live ranks before the merge are unreadable (%s); verification will require every rank.' % error, file=sys.stderr)
        if args.out:
            args.out.write_text(json.dumps(result, indent=1) + '\n', encoding='utf-8')
        print(json.dumps(result, indent=1))
        output = os.environ.get('GITHUB_OUTPUT')
        if output:
            with open(output, 'a', encoding='utf-8') as stream:
                stream.write('decision=%s\n' % result['decision'])
        return 0

    if args.command == 'comment':
        print(comment_text(json.loads(Path(args.paths[0]).read_text(encoding='utf-8'))))
        return 0

    if args.command == 'validate-live':
        sys.path.insert(0, str(ROOT))
        import predecessor_meta as app
        packet = json.loads((ROOT / 'reviewed_guidance.json').read_text(encoding='utf-8'))
        for path in args.paths:
            app.validate_guidance_packet(json.loads(json.dumps(packet)), json.loads(Path(path).read_text(encoding='utf-8')))
            print('valid against ' + path)
        return 0

    if args.command == 'verify-live':
        changes = json.loads(args.changes.read_text(encoding='utf-8')) if args.changes else {}
        problems = verify_live(args.merge, changes.get('expected_tiers') or {}, changes.get('expected_ranks'), args.minutes)
        return 1 if problems else 0

    if args.command == 'record':
        ops = GateOps()
        changes = json.loads(args.changes.read_text(encoding='utf-8'))
        record = new_record(int(args.pr), args.head, changes, ops.run_url)
        ops.save(record)
        print('Pending record for PR #%s: issue #%s' % (args.pr, record['issue']))
        return 0

    if args.command == 'settle':
        ops = GateOps()
        record = next((r for r in ops.open_records() if r.get('pr') == int(args.pr)), None)
        if record is None:
            print('No pending record for PR #%s.' % args.pr)
            return 1
        return 0 if settle(record, ops) == 'verified' else 1

    if args.command == 'pending':
        due = due_records(GateOps().open_records())
        print('%d pending record(s) to resume' % len(due))
        output = os.environ.get('GITHUB_OUTPUT')
        if output:
            with open(output, 'a', encoding='utf-8') as stream:
                stream.write('count=%d\n' % len(due))
        return 0

    if args.command == 'resume':
        outcomes = resume(GateOps())
        print(json.dumps(outcomes))
        return 0

    if args.command == 'update-manifest':
        path = ROOT / 'SOURCE-MANIFEST.json'
        manifest = json.loads(path.read_text(encoding='utf-8'))
        for name in sorted(set(manifest['files']) | {str(p.relative_to(ROOT)).replace('\\', '/') for p in (ROOT / 'docs' / 'rechecks').glob('*')}):
            if allowed(name) and (ROOT / name).is_file():
                manifest['files'][name] = hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
        # Bytes, not text mode: on Windows text mode writes CRLF and rewrites every line (PR #131).
        path.write_bytes((json.dumps(manifest, indent=2, ensure_ascii=False) + '\n').encode('utf-8'))
        print('SOURCE-MANIFEST.json review-file hashes refreshed')
        return 0
    return 2


if __name__ == '__main__':
    sys.exit(main())
