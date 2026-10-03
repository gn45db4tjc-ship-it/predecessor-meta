"""Hourly freshness watchdog (freshness Phase 5, 2.46.0). Standard library only.

Reads the published manifest, the review queue index and its own saved state. It changes no data. For each missed
freshness target it names the problem, explains it and says when the next attempt is (docs/FRESHNESS-STATUS.md):

- a rank's core statistics or its Pred.gg cohort over 24 hours old;
- a failed or missing rank;
- a failed patch check;
- a publication not refreshed for 3 hours;
- a Windows collector quiet for more than 6 hours (it checks in every 3);
- a recheck queued for more than 24 hours (before 2.47.0: the current review packet due for more than 24 hours).

A problem seen in two consecutive hourly checks gets one GitHub issue, kept up to date and closed when the problem
clears (.github/workflows/watchdog.yml). The watchdog asks publish.yml for a refresh only where the publisher's own
rules allow it: no pause, block or exhausted retry, no scheduled attempt within the hour, no wait for the Windows
collector, and at most one request every 6 hours and two a day. GitHub cannot read Pred.gg, so a stale Pred.gg cohort
or a quiet collector is reported, never "fixed" by a cloud collection. Every miss is recorded in automation-state
(watchdog.json) when it starts and when it clears.
"""
import argparse
import datetime as dt
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SITE = 'https://gn45db4tjc-ship-it.github.io/predecessor-meta/'
CONFIG = json.loads((ROOT / 'free_hosting.json').read_text(encoding='utf-8'))
LIMITS = {
    'stats_hours': 24,              # target: no rank's core statistics over 24 hours
    'pred_hours': 24,               # the exact-patch Pred.gg cohort, collected by the Windows collector
    'collector_quiet_hours': 6,     # the collector checks in every 3 hours
    'publication_quiet_hours': 3,   # publish.yml runs every hour
    'queue_overdue_hours': 24,      # a due review packet waiting longer than a day
    'persist_minutes': 50,          # seen in two consecutive hourly checks before an issue or a refresh
    'cooldown_hours': 6,            # at most one refresh request every 6 hours
    'daily_refreshes': 2,           # and at most two a day
    'scheduled_within_hours': 1,    # a scheduled attempt this close is awaited
    'dispatch_memory_days': 7,
    'miss_log': 500,
}
LABEL = 'freshness-watchdog'
MARKER = re.compile(r'<!-- watchdog:([a-z-]+) -->')


def utc(value):
    """An aware UTC datetime from an ISO string, or None."""
    if not value or not isinstance(value, str):
        return None
    try:
        parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        return None
    return (parsed if parsed.tzinfo else parsed.replace(tzinfo=dt.timezone.utc)).astimezone(dt.timezone.utc)


def hours_since(value, now):
    when = utc(value)
    return None if when is None else (now - when).total_seconds() / 3600


def when_text(value):
    when = utc(value)
    return when.strftime('%Y-%m-%d %H:%M UTC') if when else 'not scheduled'


def label(rank, cohort=None):
    return (cohort or {}).get('label') or rank.capitalize() + '+'


def daily_boundary(now):
    hour, minute = map(int, CONFIG['daily_utc'].split(':'))
    boundary = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    return boundary if now >= boundary else boundary - dt.timedelta(days=1)


def next_scheduled(manifest):
    retry = manifest.get('required_retry') or {}
    if retry.get('pending') and retry.get('next_at'):
        return 'Next attempt: a required-source retry at ' + when_text(retry['next_at']) + '.'
    return 'Next scheduled attempt: ' + when_text(manifest.get('next_expected_attempt_at')) + '.'


def problem(pid, title, summary, details, next_attempt, refresh):
    return {'id': pid, 'title': title, 'summary': summary, 'details': details, 'next_attempt': next_attempt,
            'refresh': refresh}


def check(manifest, review_index, now):
    """Every missed freshness target in this publication, as problems with a diagnosis and the next attempt."""
    if not isinstance(manifest, dict):
        return [problem('site-unreachable', 'The live manifest could not be read',
                        'The watchdog could not read manifest.json from the live site.',
                        ['Requested ' + SITE + 'manifest.json three times.'],
                        'Next attempt: the next hourly watchdog check.', False)]
    problems, cohorts = [], manifest.get('cohorts') or {}
    ranks = CONFIG.get('brackets') or list(cohorts)

    missing = [r for r in ranks if (cohorts.get(r) or {}).get('status') != 'available']
    if missing:
        problems.append(problem(
            'rank-missing', 'A rank has no available publication',
            'No available publication for ' + ', '.join(label(r, cohorts.get(r)) for r in missing) + '.',
            [label(r, cohorts.get(r)) + ': ' + ('not in the manifest' if r not in cohorts
                                                 else 'status ' + str(cohorts[r].get('status'))) for r in missing],
            next_scheduled(manifest), True))

    late, lines = [], []
    for rank in ranks:
        cohort = cohorts.get(rank)
        if not cohort or rank in missing:
            continue
        core = (cohort.get('health') or {}).get('core_statistics') or {}
        source = core.get('source') or 'core statistics'
        updated = core.get('updated_at') or ((cohort.get('source_dates') or {}).get('statz_hero_pages') or {}).get('fetched_at')
        age = hours_since(updated, now)
        if age is None or age > LIMITS['stats_hours']:
            late.append('%s (%s)' % (label(rank, cohort), 'no date' if age is None else '%.0f h' % age))
            lines.append('%s: %s %s (updated %s).' % (label(rank, cohort), source,
                                                    'has no date' if age is None else 'is %.1f hours old' % age, when_text(updated)))
    if late:
        problems.append(problem('stats-age', 'Rank statistics are over 24 hours old',
                                'Statistics older than 24 hours: ' + ', '.join(late) + '.', lines, next_scheduled(manifest), True))

    late, lines = [], []
    for rank in ranks:
        cohort = cohorts.get(rank)
        if not cohort or rank in missing:
            continue
        pred = (cohort.get('source_dates') or {}).get('pred_scoped') or {}
        age = hours_since(pred.get('fetched_at'), now)
        if pred.get('status') != 'ok' or age is None or age > LIMITS['pred_hours']:
            late.append(label(rank, cohort))
            lines.append('%s: Pred.gg cohort %s, fetched %s%s.' % (
                label(rank, cohort), pred.get('status') or 'missing', when_text(pred.get('fetched_at')),
                '' if age is None else ' (%.1f hours ago)' % age))
    if late:
        lines.append('Only the Windows collector can read Pred.gg; GitHub is blocked, so a cloud refresh cannot renew it. '
                     'The site falls back to the broader Statz dataset and labels it.')
        if (manifest.get('source_pauses') or {}).get('pred'):
            lines.append('Pred.gg collection is paused: ' + str(manifest['source_pauses']['pred']) + '.')
        problems.append(problem('pred-age', 'The Pred.gg cohort is not current',
                                'Pred.gg exact-patch cohort not current for: ' + ', '.join(late) + '.', lines,
                                "Next attempt: the Windows collector's next daily run from " + CONFIG['daily_utc'] +
                                ' UTC, if it is running.', False))

    failed = [(r, cohorts[r].get('last_attempt') or {}) for r in ranks
              if r in cohorts and r not in missing and (cohorts[r].get('last_attempt') or {}).get('status') not in (None, 'ok')]
    if failed:
        problems.append(problem(
            'attempt-failed', "A rank's last collection attempt did not finish",
            'Last attempt not ok for ' + ', '.join(label(r, cohorts[r]) for r, _ in failed) + '.',
            ['%s: %s at %s%s' % (label(r, cohorts[r]), a.get('status'), when_text(a.get('at')),
                                 (': ' + '; '.join(str(e) for e in a.get('errors') or [])) if a.get('errors') else '')
             for r, a in failed], next_scheduled(manifest), True))

    patch = manifest.get('patch_check') or {}
    if patch.get('status') != 'verified':
        problems.append(problem(
            'patch-check', 'The official patch check failed',
            'The live patch check is ' + str(patch.get('status') or 'missing') + '.',
            ['Checked %s%s.' % (when_text(patch.get('checked_at')), (': ' + str(patch['error'])) if patch.get('error') else '')],
            'Next attempt: the next hourly publication run (every hour at :23).', False))

    age = hours_since(manifest.get('published_at'), now)
    if age is None or age > LIMITS['publication_quiet_hours']:
        problems.append(problem(
            'publication-quiet', 'The site has not been republished for over 3 hours',
            'Last publication ' + ('has no date' if age is None else '%.1f hours ago' % age) + '.',
            ['publish.yml runs every hour; check its recent runs in Actions. Published ' + when_text(manifest.get('published_at')) + '.'],
            'Next attempt: the next hourly publication run (every hour at :23).', False))

    collector = manifest.get('local_collector') or {}
    age = hours_since(collector.get('checked_at'), now)
    if age is None or age > LIMITS['collector_quiet_hours']:
        problems.append(problem(
            'collector-quiet', 'The Windows collector has gone quiet',
            'No Windows collector check-in for ' + ('an unknown time' if age is None else '%.1f hours' % age) + '.',
            ['Last check-in %s (status %s). It checks in every 3 hours while it runs.' % (
                when_text(collector.get('checked_at')), collector.get('status') or 'unknown'),
             'It starts at sign-in from the Startup shortcut "Predecessor Meta Updater" (Win+R, shell:startup).',
             'This alert stays after Pred.gg API access works: the PC remains the fallback.'],
            'Next attempt: when the collector runs again; it checks in at start and every 3 hours.', False))

    # 2.47.0: the recheck queue (review/index.json rechecks) lists each item with the date it was first queued; one
    # waiting over 24 hours is overdue (the scheduled reviewer runs every 3 hours). Older indexes have only packets.
    rechecks = (review_index or {}).get('rechecks')
    if isinstance(rechecks, list):
        late = [r for r in rechecks if (hours_since(r.get('first_queued_at'), now) or 0) > LIMITS['queue_overdue_hours']]
        if late:
            problems.append(problem(
                'queue-overdue', 'Rechecks are overdue',
                '%d recheck%s queued for over 24 hours.' % (len(late), '' if len(late) == 1 else 's'),
                ['%s: queued %s (%.0f hours ago). %s' % (r.get('id'), when_text(r.get('first_queued_at')),
                                                         hours_since(r.get('first_queued_at'), now), r.get('reason') or '') for r in late],
                'Next attempt: the scheduled reviewer, every 3 hours (docs/RECHECK-RUNNER.md).', False))
        return problems
    # The queue's current state is its newest packet: older packets stay listed as history, superseded by later ones.
    packets = sorted((p for p in (review_index or {}).get('packets') or [] if utc(p.get('generated_at'))),
                     key=lambda p: utc(p['generated_at']))
    overdue = [p for p in packets[-1:]
               if p.get('review_due') and hours_since(p['generated_at'], now) > LIMITS['queue_overdue_hours']]
    if overdue:
        problems.append(problem(
            'queue-overdue', 'Review packets are overdue',
            'The current review packet has been due for over 24 hours.',
            ['%s: prepared %s (%.0f hours ago).' % (p.get('id'), when_text(p.get('generated_at')),
                                                   hours_since(p.get('generated_at'), now)) for p in overdue],
            'Next attempt: the scheduled reviewer, every 3 hours once it is set up (freshness Phase 4).', False))
    return problems


def persistent(state, pid, now):
    seen = utc(((state or {}).get('open') or {}).get(pid, {}).get('first_seen'))
    return seen is not None and now - seen >= dt.timedelta(minutes=LIMITS['persist_minutes'])


def refresh_decision(manifest, problems, state, now):
    """Whether to ask publish.yml for a refresh, by the publisher's own rules, and why."""
    fixable = [p for p in problems if p['refresh']]
    if not fixable:
        return {'dispatch': False, 'reason': 'Nothing a GitHub refresh can fix.'}
    if not any(persistent(state, p['id'], now) for p in fixable):
        return {'dispatch': False, 'reason': 'First sighting; the next check confirms it before any refresh.'}
    if manifest.get('collection_paused_reason'):
        return {'dispatch': False, 'reason': 'Collection is paused: ' + str(manifest['collection_paused_reason'])}
    if manifest.get('source_pauses'):
        return {'dispatch': False, 'reason': 'A source is paused (' + ', '.join(
            '%s: %s' % kv for kv in manifest['source_pauses'].items()) + '); no refresh is requested until it ends.'}
    retry = manifest.get('required_retry') or {}
    if retry.get('blocked'):
        return {'dispatch': False, 'reason': 'A source blocked the last collection; no automatic refresh is requested.'}
    if int(retry.get('attempts') or 0) >= int(retry.get('limit') or CONFIG.get('required_retry_limit', 2)):
        return {'dispatch': False, 'reason': 'The required-source retry limit (%s) is reached; the next daily collection tries again.'
                % (retry.get('limit') or CONFIG.get('required_retry_limit', 2))}
    if retry.get('pending'):
        return {'dispatch': False, 'reason': 'A required-source retry is already due at ' + when_text(retry.get('next_at')) + '.'}
    scheduled = utc(manifest.get('next_expected_attempt_at'))
    if scheduled and dt.timedelta(0) <= scheduled - now <= dt.timedelta(hours=LIMITS['scheduled_within_hours']):
        return {'dispatch': False, 'reason': 'A scheduled attempt at ' + when_text(manifest['next_expected_attempt_at']) + ' is within the hour.'}
    collector = manifest.get('local_collector') or {}
    checked = utc(collector.get('checked_at'))
    grace = dt.timedelta(hours=CONFIG.get('local_collector_daily_grace_hours', 5))
    if (collector.get('status') == 'connected' and checked
            and dt.timedelta(0) <= now - checked <= dt.timedelta(hours=CONFIG.get('local_collector_recent_hours', 4))
            and now - daily_boundary(now) < grace):
        return {'dispatch': False, 'reason': "Waiting for the Windows collector's daily run until "
                + when_text((daily_boundary(now) + grace).isoformat()) + ', as the publisher does.'}
    sent = sorted(t for t in (utc(d) for d in (state or {}).get('dispatches') or []) if t)
    if sent and now - sent[-1] < dt.timedelta(hours=LIMITS['cooldown_hours']):
        return {'dispatch': False, 'reason': 'Refresh cooldown: the watchdog asked for one at ' + when_text(sent[-1].isoformat()) + '.'}
    if len([t for t in sent if now - t < dt.timedelta(hours=24)]) >= LIMITS['daily_refreshes']:
        return {'dispatch': False, 'reason': '%d refreshes in the last 24 hours already; the next scheduled attempt follows.'
                % LIMITS['daily_refreshes']}
    return {'dispatch': True, 'reason': 'Refresh requested: ' + ' '.join(p['summary'] for p in fixable)}


def next_state(state, problems, decision, now):
    """The watchdog's saved state: open problems, recent refresh requests and the miss log (automation-state)."""
    state = state or {}
    previous, opened, misses = state.get('open') or {}, {}, list(state.get('misses') or [])
    stamp = now.isoformat()
    for p in problems:
        opened[p['id']] = {'first_seen': (previous.get(p['id']) or {}).get('first_seen') or stamp}
        if p['id'] not in previous:
            misses.append({'id': p['id'], 'event': 'started', 'at': stamp, 'summary': p['summary']})
    for pid, record in previous.items():
        if pid not in opened:
            start = utc(record.get('first_seen'))
            misses.append({'id': pid, 'event': 'cleared', 'at': stamp, 'started_at': record.get('first_seen'),
                           'hours': round((now - start).total_seconds() / 3600, 1) if start else None})
    keep = dt.timedelta(days=LIMITS['dispatch_memory_days'])
    dispatches = [d for d in state.get('dispatches') or [] if utc(d) and now - utc(d) <= keep]
    if decision.get('dispatch'):
        dispatches.append(stamp)
    return {'schema': 1, 'checked_at': stamp, 'open': opened, 'dispatches': dispatches,
            'misses': misses[-LIMITS['miss_log']:]}


def changed(old, new):
    """Whether the saved state differs in anything but its check time (so quiet hours make no commit)."""
    strip = lambda s: {k: v for k, v in (s or {}).items() if k != 'checked_at'}
    return strip(old) != strip(new)


def issue_text(p, decision):
    lines = ['<!-- watchdog:%s -->' % p['id'], '**' + p['summary'] + '**', '']
    lines += ['- ' + d for d in p['details']]
    lines += ['', p['next_attempt']]
    if p['refresh']:
        lines.append('Refresh: ' + decision.get('reason', ''))
    lines += ['', 'Managed by the hourly freshness watchdog (`.github/workflows/watchdog.yml`, `watchdog.py`). '
                  'It updates this issue while the problem lasts and closes it when the problem clears.']
    return 'Watchdog: ' + p['title'], '\n'.join(lines)


def sync_issues(problems, state, decision, api, now):
    """One open issue per persistent problem: created, kept current, closed when cleared. Other issues are untouched."""
    ours = {}
    for issue in api.list_open():
        found = MARKER.search(issue.get('body') or '')
        if found:
            ours.setdefault(found.group(1), issue)
    current = {p['id'] for p in problems}
    for p in problems:
        title, body = issue_text(p, decision)
        if p['id'] in ours:
            issue = ours[p['id']]
            if issue.get('body') != body or issue.get('title') != title:
                api.update(issue['number'], title, body)
        elif persistent(state, p['id'], now):
            api.create(title, body)
    for pid, issue in ours.items():
        if pid not in current:
            api.close(issue['number'], 'Cleared at %s: the watchdog no longer sees this problem.' % when_text(now.isoformat()))


class GitHubIssues:
    """The few issue calls the watchdog needs, through the REST API with the workflow's token."""

    def __init__(self, repo, token):
        self.repo, self.token = repo, token

    def call(self, method, path, data=None):
        request = urllib.request.Request('https://api.github.com/repos/' + self.repo + path, method=method,
                                         data=None if data is None else json.dumps(data).encode(),
                                         headers={'Authorization': 'Bearer ' + self.token,
                                                  'Accept': 'application/vnd.github+json',
                                                  'X-GitHub-Api-Version': '2022-11-28',
                                                  'User-Agent': 'predecessor-meta-watchdog'})
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read()
        return json.loads(raw) if raw else None

    def ensure_label(self):
        try:
            self.call('POST', '/labels', {'name': LABEL, 'color': 'b60205',
                                          'description': 'Opened and closed by the hourly freshness watchdog'})
        except urllib.error.HTTPError as error:
            if error.code != 422:   # 422: the label already exists
                raise

    def list_open(self):
        rows = self.call('GET', '/issues?state=open&per_page=100&labels=' + LABEL) or []
        return [r for r in rows if 'pull_request' not in r]

    def create(self, title, body):
        return self.call('POST', '/issues', {'title': title, 'body': body, 'labels': [LABEL]})['number']

    def update(self, number, title, body):
        self.call('PATCH', '/issues/%d' % number, {'title': title, 'body': body})

    def close(self, number, comment):
        self.call('POST', '/issues/%d/comments' % number, {'body': comment})
        self.call('PATCH', '/issues/%d' % number, {'state': 'closed', 'state_reason': 'completed'})


def fetch_json(url, attempts=3):
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(url + ('&' if '?' in url else '?') + 'watchdog=%d' % time.time(),
                                             headers={'User-Agent': 'predecessor-meta-watchdog', 'Cache-Control': 'no-cache'})
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.loads(response.read())
        except (OSError, ValueError):
            if attempt + 1 < attempts:
                time.sleep(10)
    return None


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--state', type=Path, help='saved watchdog state (automation-state/watchdog.json)')
    parser.add_argument('--out', type=Path, help='where to write the next state')
    parser.add_argument('--manifest', type=Path, help='read this manifest instead of the live one')
    parser.add_argument('--review-index', type=Path, help='read this review index instead of the live one')
    parser.add_argument('--site', default=SITE)
    parser.add_argument('--sync-issues', action='store_true', help='open, update and close GitHub issues')
    args = parser.parse_args(argv)
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
    state = {}
    if args.state and args.state.exists():
        try:
            state = json.loads(args.state.read_text(encoding='utf-8') or '{}')
        except ValueError:
            state = {}
    manifest = json.loads(args.manifest.read_text(encoding='utf-8')) if args.manifest else fetch_json(args.site + 'manifest.json')
    index = (json.loads(args.review_index.read_text(encoding='utf-8')) if args.review_index
             else fetch_json(args.site + 'review/index.json') if manifest is not None else None)
    problems = check(manifest, index, now)
    decision = refresh_decision(manifest or {}, problems, state, now)
    new = next_state(state, problems, decision, now)
    if args.sync_issues:
        api = GitHubIssues(os.environ['GITHUB_REPOSITORY'], os.environ['GITHUB_TOKEN'])
        api.ensure_label()
        sync_issues(problems, new, decision, api, now)
    if args.out:
        args.out.write_text(json.dumps(new, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')
    for p in problems:
        print('%s %s %s' % ('PERSISTENT' if persistent(new, p['id'], now) else 'first-seen', p['id'], p['summary']))
    print('refresh: ' + ('requested' if decision['dispatch'] else 'not requested') + ' - ' + decision['reason'])
    if not problems:
        print('All freshness targets met.')
    output = os.environ.get('GITHUB_OUTPUT')
    if output:
        with open(output, 'a', encoding='utf-8') as stream:
            stream.write('dispatch=%s\nchanged=%s\n' % (str(decision['dispatch']).lower(), str(changed(state, new)).lower()))
    return 0


if __name__ == '__main__':
    sys.exit(main())
