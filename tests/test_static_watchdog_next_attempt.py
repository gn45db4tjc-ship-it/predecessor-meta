"""Watchdog next-attempt wording (4 Nov 2026, UX review F6).

Issue #191 said the scheduled reviewer runs "every 3 hours"; since 28 Oct 2026 it runs once a day. Issue #189 gave
"a required-source retry at 04:31 UTC" at 05:50 UTC: the publisher retries only 3 hours after the last full attempt
(static_publish.py, required_retry_hours), so an attempt at 05:11 moved the real retry to 08:11."""
import datetime as dt
import unittest

import watchdog
from tests.test_static_watchdog import NOW, iso, manifest


class NextAttempt(unittest.TestCase):
    def test_the_reviewer_cadence_is_daily(self):
        index = {'packets': [], 'rechecks': [{'id': 'plan-mechanics:steel/support', 'first_queued_at': iso(30), 'reason': 'Supporting mechanics changed.'}]}
        p = [p for p in watchdog.check(manifest(), index, NOW) if p['id'] == 'queue-overdue'][0]
        self.assertNotIn('every 3 hours', p['next_attempt'])
        self.assertIn('once a day', p['next_attempt'])

    def test_a_retry_waits_for_three_hours_after_the_last_full_attempt(self):
        m = manifest(last_full_attempt_at=iso(0.5),
                     required_retry={'pending': True, 'blocked': False, 'attempts': 1, 'limit': 2, 'next_at': iso(1.5)})
        text = watchdog.next_scheduled(m)
        self.assertIn((NOW + dt.timedelta(hours=2.5)).strftime('%Y-%m-%d %H:%M UTC'), text)

    def test_a_retry_after_its_wait_keeps_its_own_time(self):
        m = manifest(last_full_attempt_at=iso(5),
                     required_retry={'pending': True, 'blocked': False, 'attempts': 1, 'limit': 2, 'next_at': iso(2)})
        self.assertIn((NOW - dt.timedelta(hours=2)).strftime('%Y-%m-%d %H:%M UTC'), watchdog.next_scheduled(m))


if __name__ == '__main__':
    unittest.main()
