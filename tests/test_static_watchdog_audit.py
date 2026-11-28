"""Watchdog fail-open and stall paths (Codex audit #239 F11-F14; PRED-M11).

F11: an unreadable review index (404 after a publication, or bad JSON) read as "no overdue rechecks" and closed an
open overdue alert. F12: a watchdog.json of valid JSON with the wrong type ([1]) raised on every later run, so the
watchdog stopped for good. F13: a partial attempt caused only by optional Pred.gg data asked for full cloud
collections, which cannot read Pred.gg. F14: a required retry whose hourly run was dropped kept suppressing every
refresh, and the alert advertised a retry time that had already passed.
"""
import contextlib
import datetime as dt
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import watchdog
from tests.test_static_watchdog import NOW, FakeIssues, ids, iso, manifest

OVERDUE = {'rechecks': [{'id': 'plan:x', 'first_queued_at': iso(30), 'reason': 'r'}], 'packets': []}


class UnreadableQueue(unittest.TestCase):
    def test_an_unreadable_index_keeps_the_overdue_alert_open(self):
        state = watchdog.next_state({}, watchdog.check(manifest(), OVERDUE, NOW), {'dispatch': False}, NOW - dt.timedelta(hours=2))
        api = FakeIssues([{'number': 4, 'title': 'Watchdog: Rechecks are overdue', 'body': '<!-- watchdog:queue-overdue -->'}])
        # Muse review of PR #241: a wrong-typed rechecks beside a packets list, and non-object entries.
        for index in (None, [], {'something': 1}, {'rechecks': 'x'}, {'rechecks': 'x', 'packets': []},
                      {'rechecks': {'a': 1}, 'packets': []}, {'rechecks': ['x']}, {'rechecks': [], 'packets': [3]}):
            with self.subTest(index=index):
                problems = watchdog.check(manifest(), index, NOW)
                self.assertNotIn('queue-overdue', ids(problems))
                unknown = watchdog.unknown_ids(manifest(), index, state)
                self.assertEqual(unknown, {'queue-overdue'})
                new = watchdog.next_state(state, problems, {'dispatch': False}, NOW, unknown)
                self.assertIn('queue-overdue', new['open'])
                self.assertFalse(any(m['event'] == 'cleared' for m in new['misses']))
                watchdog.sync_issues(problems, new, {'dispatch': False}, api, NOW, unknown)
                self.assertEqual(api.issues[4]['state'], 'open')

    def test_a_readable_empty_queue_still_clears_it(self):
        state = watchdog.next_state({}, watchdog.check(manifest(), OVERDUE, NOW), {'dispatch': False}, NOW - dt.timedelta(hours=2))
        index = {'rechecks': [], 'packets': []}
        self.assertEqual(watchdog.unknown_ids(manifest(), index, state), set())
        new = watchdog.next_state(state, watchdog.check(manifest(), index, NOW), {'dispatch': False}, NOW)
        self.assertNotIn('queue-overdue', new['open'])

    def test_an_unreadable_manifest_closes_nothing(self):
        state = {'open': {'stats-age': {'first_seen': iso(3)}, 'collector-quiet': {'first_seen': iso(3)}}}
        self.assertEqual(watchdog.unknown_ids(None, None, state), {'stats-age', 'collector-quiet'})


class WrongShapedState(unittest.TestCase):
    def run_main(self, text):
        folder = Path(tempfile.mkdtemp())
        (folder / 'state.json').write_text(text, encoding='utf-8')
        (folder / 'm.json').write_text(json.dumps(manifest()), encoding='utf-8')
        (folder / 'i.json').write_text(json.dumps({'rechecks': [], 'packets': []}), encoding='utf-8')
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = watchdog.main(['--state', str(folder / 'state.json'), '--out', str(folder / 'next.json'),
                                  '--manifest', str(folder / 'm.json'), '--review-index', str(folder / 'i.json')])
        return code, json.loads((folder / 'next.json').read_text(encoding='utf-8')), out.getvalue()

    def test_a_wrong_shaped_file_is_repaired_not_fatal(self):
        for text in ('[1]', '"x"', '{"open": [1]}', '{"dispatches": {"a": 1}}', '{"misses": 5}', 'not json'):
            with self.subTest(text=text):
                code, new, out = self.run_main(text)
                self.assertEqual(code, 0)
                self.assertIn('Watchdog state repaired', out)
                self.assertIn('repaired', [e['event'] for e in new['misses']])

    def test_valid_history_survives_a_bad_entry(self):
        good = {'open': {'stats-age': {'first_seen': iso(3)}, 'bad': 7}, 'dispatches': [iso(2), 5], 'misses': [{'id': 'x'}, 'y']}
        state, notes = watchdog.clean_state(good)
        self.assertEqual(state['open'], {'stats-age': {'first_seen': iso(3)}})
        self.assertEqual(state['dispatches'], [iso(2)])
        self.assertEqual(state['misses'], [{'id': 'x'}])
        self.assertEqual(len(notes), 3)

    def test_a_good_state_has_no_notes(self):
        self.assertEqual(watchdog.clean_state({'open': {}, 'dispatches': [], 'misses': []})[1], [])
        self.assertEqual(watchdog.clean_state({})[1], [])


class OptionalPredOnly(unittest.TestCase):
    def failing(self, errors, status='partial'):
        m = manifest()
        m['cohorts']['gold']['last_attempt'] = {'status': status, 'at': iso(2), 'errors': errors}
        return m

    def test_optional_pred_only_is_reported_without_a_refresh(self):
        m = self.failing([{'source': 'Pred.gg', 'severity': 'error', 'detail': 'HTTP 403 access stop'},
                          {'source': 'Pred.gg game data', 'severity': 'error', 'detail': 'paused'}])
        problems = watchdog.check(m, {'rechecks': []}, NOW)
        self.assertEqual(ids(problems), ['attempt-pred-only'])
        self.assertFalse(problems[0]['refresh'])
        state = {'open': {'attempt-pred-only': {'first_seen': iso(3)}}}
        self.assertFalse(watchdog.refresh_decision(m, problems, state, NOW)['dispatch'])

    def test_a_required_source_error_still_asks_for_a_refresh(self):
        m = self.failing([{'source': 'Pred.gg', 'severity': 'error', 'detail': '403'},
                          {'source': 'statz.gg hero pages', 'severity': 'error', 'detail': 'timeout'}])
        problems = watchdog.check(m, {'rechecks': []}, NOW)
        self.assertEqual(ids(problems), ['attempt-failed'])
        self.assertTrue(problems[0]['refresh'])

    def test_a_failed_attempt_is_never_optional(self):
        self.assertEqual(ids(watchdog.check(self.failing([{'source': 'Pred.gg', 'detail': 'x'}], status='failed'), {'rechecks': []}, NOW)),
                         ['attempt-failed'])


class MissedRetry(unittest.TestCase):
    def retry(self, eligible_hours_ago, last_attempt_hours_ago):
        m = manifest(last_full_attempt_at=iso(last_attempt_hours_ago),
                     required_retry={'pending': True, 'blocked': False, 'attempts': 1, 'limit': 2, 'next_at': iso(eligible_hours_ago)})
        m['cohorts']['gold']['last_attempt'] = {'status': 'failed', 'at': iso(last_attempt_hours_ago),
                                                'errors': [{'source': 'statz.gg hero pages', 'severity': 'error', 'detail': 'timeout'}]}
        m['local_collector'] = None   # no Windows collector to wait for, as when the PC is off
        return m

    def test_a_retry_not_yet_run_is_awaited_with_its_real_slot(self):
        m = self.retry(-0.3, 2.7)   # eligible in 18 minutes
        problems = watchdog.check(m, {'rechecks': []}, NOW)
        state = {'open': {'attempt-failed': {'first_seen': iso(2)}}}
        decision = watchdog.refresh_decision(m, problems, state, NOW)
        self.assertFalse(decision['dispatch'])
        self.assertIn('first hourly run after it is at', decision['reason'])

    def test_a_dropped_retry_run_no_longer_suppresses_recovery(self):
        m = self.retry(3, 6)        # eligible 3 hours ago, nothing has run since
        self.assertTrue(watchdog.retry_missed(m, NOW))
        problems = watchdog.check(m, {'rechecks': []}, NOW)
        self.assertIn('has not happened', [p for p in problems if p['id'] == 'attempt-failed'][0]['next_attempt'])
        state = {'open': {'attempt-failed': {'first_seen': iso(2)}}}
        self.assertTrue(watchdog.refresh_decision(m, problems, state, NOW)['dispatch'])

    def test_block_and_limit_still_hold_after_a_missed_slot(self):
        m = self.retry(3, 6)
        m['required_retry'].update(blocked=True)
        problems = watchdog.check(m, {'rechecks': []}, NOW)
        state = {'open': {'attempt-failed': {'first_seen': iso(2)}}}
        self.assertFalse(watchdog.refresh_decision(m, problems, state, NOW)['dispatch'])
        m['required_retry'].update(blocked=False, attempts=2)
        self.assertFalse(watchdog.refresh_decision(m, problems, state, NOW)['dispatch'])

    def test_the_first_slot_is_the_next_23_past(self):
        self.assertEqual(watchdog.first_slot(dt.datetime(2026, 11, 3, 20, 27, tzinfo=dt.timezone.utc)).hour, 21)
        self.assertEqual(watchdog.first_slot(dt.datetime(2026, 11, 3, 20, 23, tzinfo=dt.timezone.utc)).hour, 20)


if __name__ == '__main__':
    unittest.main()
