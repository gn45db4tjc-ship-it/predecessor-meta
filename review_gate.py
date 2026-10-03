"""Review auto-merge gate (freshness Phase 4, 2.47.0). Standard library only.

A review pull request from the scheduled reviewer (label `automated-review`) merges itself only when all of these hold
(STRATEGY-REVIEW-POLICY.md, "Current scheduling decision"):

- it touches guidance and review files only: reviewed_guidance.json, the same-patch supplement, docs/rechecks/
  (ledger and report) and SOURCE-MANIFEST.json entries for those files; no code;
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
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SITE = 'https://gn45db4tjc-ship-it.github.io/predecessor-meta/'
ALLOWED = (r'reviewed_guidance\.json', r'patch-[0-9.]+\.json', r'docs/rechecks/[0-9A-Za-z._-]+\.(json|md)', r'SOURCE-MANIFEST\.json')
HOLD_FILES = {'predecessor_meta.py': 'the validator would change', 'STRATEGY-REVIEW-POLICY.md': 'the review policy would change'}
ORDER = {'S': 0, 'A': 1, 'B': 2, 'C': 3}
VERDICTS = ('changed', 'checked and retained', 'unresolved')
PLAN_PARTS = ('core', 'finish', 'crest', 'augment', 'eternal', 'blessings')
SUPPLEMENT_SECTIONS = ('heroes', 'perks', 'definitions', 'corrections', 'hero_context')
MAX_GRADE_CHANGES = 10
VERIFY_MINUTES = 30


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


def evaluate(base, head, files, ledgers, supplements=(None, None), manifests=(None, None), nightly=(), auto_merge=False):
    """The gate's decision on one review PR. base/head: reviewed_guidance.json; ledgers: changed docs/rechecks/*.json."""
    failures, holds = scope(files)
    failures += manifest_scope(*manifests)
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


def nightly_conclusions():
    """Conclusions of the latest completed nightly live checks on main, newest first."""
    out = subprocess.run(['gh', 'run', 'list', '--workflow', 'live-check.yml', '--branch', 'main', '--status', 'completed',
                          '--limit', '2', '--json', 'conclusion'], capture_output=True, check=True, text=True).stdout
    return [r.get('conclusion') for r in json.loads(out)]


def fetch_json(url):
    request = urllib.request.Request(url + ('&' if '?' in url else '?') + 'gate=%d' % time.time(),
                                     headers={'User-Agent': 'predecessor-meta-review-gate', 'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read())


def fingerprint(sha):
    """guidance_fingerprint() of a commit, from the same bytes the cloud publisher reads."""
    digest = hashlib.sha256()
    supplement = next((p for p in git('ls-tree', '--name-only', sha).splitlines() if re.fullmatch(r'patch-[0-9.]+\.json', p)), 'patch-1.17.json')
    for path in ('reviewed_guidance.json', supplement):
        raw = show(sha, path)
        digest.update(raw if raw is not None else b'missing:' + path.encode('utf8'))
    return digest.hexdigest()[:16]


def live_state(site=SITE):
    manifest = fetch_json(site + 'manifest.json')
    ranks = {}
    for rank, cohort in (manifest.get('cohorts') or {}).items():
        bundle = fetch_json(site + cohort['url']) if cohort.get('url') else {}
        tiers = {'%s/%s' % (e['slug'], e['role']): e.get('tier')
                 for e in ((bundle.get('guidance') or {}).get('meta_review') or {}).get('entries') or []}
        ranks[rank] = {'fingerprint': bundle.get('guidance_fingerprint'), 'tiers': tiers}
    return ranks


def verified(ranks, expected_fp, expected_tiers):
    """Problems with the live site against the merged packet: every rank carries it, and the gold grades match."""
    problems = ['%s carries %s, not %s' % (r, s['fingerprint'], expected_fp) for r, s in ranks.items() if s['fingerprint'] != expected_fp]
    gold = (ranks.get('gold') or {}).get('tiers') or {}
    problems += ['gold %s is %s, not %s' % (k, gold.get(k), t) for k, t in expected_tiers.items() if gold.get(k) != t]
    return problems


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('command', choices=['scope', 'decide', 'validate-live', 'verify-live', 'update-manifest'])
    parser.add_argument('paths', nargs='*')
    parser.add_argument('--base'); parser.add_argument('--head'); parser.add_argument('--merge')
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
                          nightly=nightly_conclusions(), auto_merge=bool(config.get('review_auto_merge')))
        result['files'] = files
        if args.out:
            args.out.write_text(json.dumps(result, indent=1) + '\n', encoding='utf-8')
        print(json.dumps(result, indent=1))
        output = os.environ.get('GITHUB_OUTPUT')
        if output:
            with open(output, 'a', encoding='utf-8') as stream:
                stream.write('decision=%s\n' % result['decision'])
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
        expected_fp, tiers = fingerprint(args.merge), changes.get('expected_tiers') or {}
        deadline = time.time() + args.minutes * 60
        problems = ['not checked yet']
        while time.time() < deadline:
            try:
                problems = verified(live_state(), expected_fp, tiers)
            except OSError as error:
                problems = ['live site unreadable: %s' % error]
            if not problems:
                print('Live site carries packet %s on every rank; %d changed gold grades match.' % (expected_fp, len(tiers)))
                return 0
            time.sleep(60)
        print('Live verification failed after %d minutes: %s' % (args.minutes, '; '.join(problems)))
        return 1

    if args.command == 'update-manifest':
        path = ROOT / 'SOURCE-MANIFEST.json'
        manifest = json.loads(path.read_text(encoding='utf-8'))
        for name in sorted(set(manifest['files']) | {str(p.relative_to(ROOT)).replace('\\', '/') for p in (ROOT / 'docs' / 'rechecks').glob('*')}):
            if allowed(name) and (ROOT / name).is_file():
                manifest['files'][name] = hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
        path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
        print('SOURCE-MANIFEST.json review-file hashes refreshed')
        return 0
    return 2


if __name__ == '__main__':
    sys.exit(main())
