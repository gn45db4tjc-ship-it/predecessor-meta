"""Freshness Phase 5 (2.46.0): the hourly watchdog's decision logic (watchdog.py).

The watchdog reads the published manifest and review index and its own saved state; it changes no data. These tests
use dated synthetic manifests shaped like the live one. Probe first: on main 0880cbe no watchdog exists, so a rank
whose statistics are days old, a quiet Windows collector or a failed patch check raises nothing."""
import copy
import datetime as dt
import unittest

import watchdog

NOW = dt.datetime(2026, 10, 3, 18, 41, tzinfo=dt.timezone.utc)
RANKS = ('gold', 'bronze', 'silver', 'platinum', 'diamond', 'paragon')


def iso(hours_ago):
    return (NOW - dt.timedelta(hours=hours_ago)).isoformat()


def manifest(age=2.0, pred_age=2.0, collector_age=2.0, **extra):
    cohorts = {}
    for rank in RANKS:
        cohorts[rank] = {
            'label': rank.capitalize() + '+', 'status': 'available', 'collection_status': 'complete',
            'generated_at': iso(age), 'last_attempt': {'status': 'ok', 'at': iso(age), 'errors': []},
            'source_dates': {'statz_hero_pages': {'status': 'ok', 'fetched_at': iso(age)},
                             'pred_scoped': {'status': 'ok', 'fetched_at': iso(pred_age)}},
            'health': {'core_statistics': {'state': 'Current', 'updated_at': iso(age), 'source': 'Statz hero pages'}}}
    m = {'schema': 2, 'published_at': iso(0.5), 'app': {'version': '2.46.0'},
         'patch_check': {'status': 'verified', 'checked_at': iso(0.5), 'version': '1.17', 'error': None},
         'last_full_attempt_at': iso(age), 'next_expected_attempt_at': (NOW + dt.timedelta(hours=22)).isoformat(),
         'required_retry': {'pending': False, 'blocked': False, 'attempts': 0, 'limit': 2, 'next_at': None},
         'local_collector': {'checked_at': iso(collector_age), 'status': 'connected'},
         'source_pauses': {}, 'collection_paused_reason': None, 'cohorts': cohorts}
    m.update(extra)
    return m


def ids(problems):
    return sorted(p['id'] for p in problems)


class Checks(unittest.TestCase):
    def test_a_healthy_publication_raises_nothing(self):
        self.assertEqual(watchdog.check(manifest(), {'packets': []}, NOW), [])

    def test_statistics_over_24_hours_name_each_late_rank(self):
        m = manifest()
        m['cohorts']['paragon']['health']['core_statistics']['updated_at'] = iso(31)
        m['cohorts']['diamond']['health']['core_statistics']['updated_at'] = iso(26)
        problems = watchdog.check(m, {'packets': []}, NOW)
        self.assertEqual(ids(problems), ['stats-age'])
        p = problems[0]
        self.assertTrue(p['refresh'])
        self.assertIn('Paragon+', p['summary']); self.assertIn('Diamond+', p['summary'])
        self.assertNotIn('Gold+', p['summary'])
        self.assertTrue(any('31' in d for d in p['details']))
        self.assertTrue(p['next_attempt'])

    def test_exactly_at_the_limit_is_not_a_miss(self):
        self.assertEqual(watchdog.check(manifest(age=24.0, pred_age=24.0), {'packets': []}, NOW), [])

    def test_old_pred_gg_cohort_is_reported_but_not_refreshable_from_github(self):
        problems = watchdog.check(manifest(pred_age=40), {'packets': []}, NOW)
        self.assertEqual(ids(problems), ['pred-age'])
        self.assertFalse(problems[0]['refresh'])
        self.assertIn('Windows collector', ' '.join(problems[0]['details']))

    def test_retained_pred_gg_is_reported(self):
        m = manifest()
        m['cohorts']['gold']['source_dates']['pred_scoped']['status'] = 'retained'
        self.assertEqual(ids(watchdog.check(m, {'packets': []}, NOW)), ['pred-age'])

    def test_quiet_windows_collector_after_six_hours(self):
        self.assertEqual(watchdog.check(manifest(collector_age=5.5), {'packets': []}, NOW), [])
        problems = watchdog.check(manifest(collector_age=7), {'packets': []}, NOW)
        self.assertEqual(ids(problems), ['collector-quiet'])
        self.assertFalse(problems[0]['refresh'])
        self.assertIn('Startup', ' '.join(problems[0]['details']))
        m = manifest(); m['local_collector'] = {}
        self.assertEqual(ids(watchdog.check(m, {'packets': []}, NOW)), ['collector-quiet'])

    def test_failed_attempt_missing_rank_patch_check_and_quiet_publication(self):
        m = manifest(published_at=iso(4))
        m['cohorts']['silver']['last_attempt'] = {'status': 'failed', 'at': iso(1), 'errors': ['Statz timed out']}
        del m['cohorts']['bronze']
        m['patch_check'] = {'status': 'failed', 'checked_at': iso(0.5), 'error': 'HTTP 503'}
        problems = {p['id']: p for p in watchdog.check(m, {'packets': []}, NOW)}
        self.assertEqual(sorted(problems), ['attempt-failed', 'patch-check', 'publication-quiet', 'rank-missing'])
        self.assertIn('Statz timed out', ' '.join(problems['attempt-failed']['details']))
        self.assertIn('HTTP 503', ' '.join(problems['patch-check']['details']))
        self.assertTrue(problems['rank-missing']['refresh'])

    def test_overdue_review_queue(self):
        # The queue's current state is its newest packet; older packets are history, superseded by later ones.
        index = {'packets': [{'id': 'current', 'review_due': True, 'generated_at': iso(30)},
                             {'id': 'older', 'review_due': True, 'generated_at': iso(90)}]}
        problems = watchdog.check(manifest(), index, NOW)
        self.assertEqual(ids(problems), ['queue-overdue'])
        self.assertIn('current', ' '.join(problems[0]['details']))
        self.assertNotIn('older', ' '.join(problems[0]['details']))
        superseded = {'packets': [{'id': 'later', 'review_due': False, 'generated_at': iso(10)},
                                  {'id': 'history', 'review_due': True, 'generated_at': iso(400)}]}
        self.assertEqual(watchdog.check(manifest(), superseded, NOW), [])
        recent = {'packets': [{'id': 'recent', 'review_due': True, 'generated_at': iso(3)}]}
        self.assertEqual(watchdog.check(manifest(), recent, NOW), [])

    def test_overdue_rechecks(self):
        index = {'packets': [], 'rechecks': [
            {'id': 'grade-moved:adele/offlane', 'first_queued_at': iso(30), 'reason': 'Statistics moved since review.'},
            {'id': 'plan-mechanics:legion/carry', 'first_queued_at': iso(2), 'reason': 'Supporting mechanics changed.'}]}
        problems = watchdog.check(manifest(), index, NOW)
        self.assertEqual(ids(problems), ['queue-overdue'])
        self.assertIn('adele', ' '.join(problems[0]['details'])); self.assertNotIn('legion', ' '.join(problems[0]['details']))
        self.assertEqual(watchdog.check(manifest(), {'packets': [], 'rechecks': []}, NOW), [])

    def test_unreadable_manifest(self):
        self.assertEqual(ids(watchdog.check(None, None, NOW)), ['site-unreachable'])


class Refresh(unittest.TestCase):
    def stale(self, **extra):
        m = manifest(age=30, pred_age=30, collector_age=30, **extra)
        return m, watchdog.check(m, {'packets': []}, NOW)

    def seen(self, problems, hours=2):
        return {'open': {p['id']: {'first_seen': iso(hours)} for p in problems}}

    def test_a_persistent_stale_rank_dispatches_a_refresh(self):
        m, problems = self.stale()
        decision = watchdog.refresh_decision(m, problems, self.seen(problems), NOW)
        self.assertTrue(decision['dispatch'], decision)

    def test_a_first_sighting_waits_for_the_next_check(self):
        m, problems = self.stale()
        decision = watchdog.refresh_decision(m, problems, {}, NOW)
        self.assertFalse(decision['dispatch'])
        self.assertIn('next check', decision['reason'])

    def test_nothing_refreshable_means_no_dispatch(self):
        m = manifest(collector_age=30)
        problems = watchdog.check(m, {'packets': []}, NOW)
        self.assertFalse(watchdog.refresh_decision(m, problems, self.seen(problems), NOW)['dispatch'])

    def test_pauses_blocks_and_retry_limits_are_respected(self):
        for extra, word in (({'collection_paused_reason': 'Paused by the owner'}, 'paused'),
                            ({'source_pauses': {'pred': 'Access stop'}}, 'paused'),
                            ({'required_retry': {'pending': False, 'blocked': True, 'attempts': 1, 'limit': 2}}, 'blocked'),
                            ({'required_retry': {'pending': False, 'blocked': False, 'attempts': 2, 'limit': 2}}, 'limit'),
                            ({'required_retry': {'pending': True, 'blocked': False, 'attempts': 1, 'limit': 2,
                                                 'next_at': (NOW + dt.timedelta(hours=2)).isoformat()}}, 'retry')):
            m, problems = self.stale(**extra)
            decision = watchdog.refresh_decision(m, problems, self.seen(problems), NOW)
            self.assertFalse(decision['dispatch'], extra)
            self.assertIn(word, decision['reason'].lower(), extra)

    def test_a_scheduled_attempt_within_the_hour_is_awaited(self):
        m, problems = self.stale(next_expected_attempt_at=(NOW + dt.timedelta(minutes=40)).isoformat())
        decision = watchdog.refresh_decision(m, problems, self.seen(problems), NOW)
        self.assertFalse(decision['dispatch']); self.assertIn('scheduled', decision['reason'])

    def test_a_recent_windows_collector_is_awaited_in_its_daily_window(self):
        # 18:41 UTC is 1 h 18 min after the 17:23 boundary: the cloud's own run waits for the collector for 5 h.
        m = manifest(age=30, pred_age=30, collector_age=2)
        problems = watchdog.check(m, {'packets': []}, NOW)
        decision = watchdog.refresh_decision(m, problems, self.seen(problems), NOW)
        self.assertFalse(decision['dispatch']); self.assertIn('Windows collector', decision['reason'])

    def test_cooldown_and_daily_limit(self):
        m, problems = self.stale()
        recent = dict(self.seen(problems), dispatches=[iso(2)])
        self.assertIn('cooldown', watchdog.refresh_decision(m, problems, recent, NOW)['reason'])
        busy = dict(self.seen(problems), dispatches=[iso(20), iso(7)])
        decision = watchdog.refresh_decision(m, problems, busy, NOW)
        self.assertFalse(decision['dispatch']); self.assertIn('2 refreshes', decision['reason'])
        old = dict(self.seen(problems), dispatches=[iso(30), iso(26)])
        self.assertTrue(watchdog.refresh_decision(m, problems, old, NOW)['dispatch'])


class State(unittest.TestCase):
    def test_misses_are_recorded_when_they_start_and_when_they_clear(self):
        m = manifest(collector_age=8)
        problems = watchdog.check(m, {'packets': []}, NOW)
        first = watchdog.next_state({}, problems, {'dispatch': False}, NOW)
        self.assertEqual(first['open']['collector-quiet']['first_seen'], NOW.isoformat())
        self.assertEqual([(r['id'], r['event']) for r in first['misses']], [('collector-quiet', 'started')])
        later = NOW + dt.timedelta(hours=3)
        kept = watchdog.next_state(first, problems, {'dispatch': False}, later)
        self.assertEqual(kept['open']['collector-quiet']['first_seen'], NOW.isoformat())
        self.assertEqual(len(kept['misses']), 1)
        cleared = watchdog.next_state(kept, [], {'dispatch': False}, later)
        self.assertEqual(cleared['open'], {})
        self.assertEqual(cleared['misses'][-1]['event'], 'cleared'); self.assertEqual(cleared['misses'][-1]['hours'], 3.0)

    def test_dispatches_are_remembered_for_a_week_and_the_log_is_bounded(self):
        state = {'dispatches': [iso(200), iso(10)], 'misses': [{'id': 'x', 'event': 'started', 'at': iso(1)}] * 600}
        new = watchdog.next_state(state, [], {'dispatch': True}, NOW)
        self.assertEqual(new['dispatches'], [iso(10), NOW.isoformat()])
        self.assertLessEqual(len(new['misses']), 500)

    def test_only_meaningful_changes_need_a_commit(self):
        problems = watchdog.check(manifest(collector_age=8), {'packets': []}, NOW)
        first = watchdog.next_state({}, problems, {'dispatch': False}, NOW)
        again = watchdog.next_state(first, problems, {'dispatch': False}, NOW + dt.timedelta(hours=1))
        self.assertTrue(watchdog.changed({}, first))
        self.assertFalse(watchdog.changed(first, again))


class FakeIssues:
    def __init__(self, issues=()):
        self.issues = {i['number']: dict(i, state='open') for i in issues}
        self.calls = []

    def list_open(self):
        return [dict(i) for i in self.issues.values() if i['state'] == 'open']

    def create(self, title, body):
        number = max(self.issues, default=0) + 1
        self.issues[number] = {'number': number, 'title': title, 'body': body, 'state': 'open'}
        self.calls.append(('create', number))
        return number

    def update(self, number, title, body):
        self.issues[number].update(title=title, body=body); self.calls.append(('update', number))

    def close(self, number, comment):
        self.issues[number]['state'] = 'closed'; self.calls.append(('close', number, comment))


class Issues(unittest.TestCase):
    def test_one_issue_per_persistent_problem_updated_then_closed(self):
        m = manifest(collector_age=8)
        problems = watchdog.check(m, {'packets': []}, NOW)
        api = FakeIssues([{'number': 7, 'title': 'Unrelated', 'body': 'not ours'}])
        decision = {'dispatch': False, 'reason': 'nothing a refresh can fix'}
        # First sighting: no issue yet (it may be the daily collection window).
        watchdog.sync_issues(problems, {'open': {'collector-quiet': {'first_seen': NOW.isoformat()}}}, decision, api, NOW)
        self.assertEqual(api.calls, [])
        persistent = {'open': {'collector-quiet': {'first_seen': iso(2)}}}
        watchdog.sync_issues(problems, persistent, decision, api, NOW)
        self.assertEqual(api.calls, [('create', 8)])
        self.assertIn('<!-- watchdog:collector-quiet -->', api.issues[8]['body'])
        watchdog.sync_issues(problems, persistent, decision, api, NOW)          # unchanged diagnosis: no edit
        self.assertEqual(len(api.calls), 1)
        worse = watchdog.check(manifest(collector_age=12), {'packets': []}, NOW)
        watchdog.sync_issues(worse, persistent, decision, api, NOW)
        self.assertEqual(api.calls[-1], ('update', 8))
        watchdog.sync_issues([], {'open': {}}, decision, api, NOW)
        self.assertEqual(api.calls[-1][:2], ('close', 8))
        self.assertEqual(api.issues[7]['state'], 'open')                      # never touches other issues



class WorkflowContract(unittest.TestCase):
    def test_hourly_read_only_scoped_and_pinned(self):
        from pathlib import Path
        text = (Path(__file__).resolve().parents[1] / '.github' / 'workflows' / 'watchdog.yml').read_text(encoding='utf-8')
        self.assertIn("cron: '41 * * * *'", text)
        self.assertIn('permissions:\n  contents: read', text)                 # nothing by default
        for line in ('contents: write', 'issues: write', 'actions: write'):
            self.assertIn(line, text)
        for use in [l.split('uses:')[1].strip() for l in text.splitlines() if 'uses:' in l]:
            self.assertRegex(use, r'@[0-9a-f]{40}', use)                   # actions pinned to a commit
        self.assertNotIn('data-updates', text)                               # never touches the collector's branch
        self.assertNotIn('static_publish', text)                             # never collects or publishes itself
        self.assertIn('gh workflow run publish.yml --ref main -f refresh=true', text)
        self.assertIn("if: steps.check.outputs.dispatch == 'true'", text)
        self.assertIn('cp watchdog-next.json /tmp/watchdog-state/watchdog.json', text)
        self.assertEqual(text.count('git -C /tmp/watchdog-state add '), 1)    # only watchdog.json is recorded


if __name__ == '__main__':
    unittest.main()
