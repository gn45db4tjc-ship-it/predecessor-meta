"""2.54.0: a hero page shows a 7-day line of Pred.gg's win rate, one point per day (the day's last pull).

Built at collection from the validated history snapshots of the same cohort (patch, versions, rank, rating). Each point
counts the whole patch so far, so the series is described as overlapping, never as separate samples. The series rides the
guide, not the first-screen core."""
import unittest

import predecessor_meta as m
import projection as P

COHORT = {'source': 'Pred.gg', 'bracket': 'gold', 'bracket_label': 'Gold+', 'rating': 'r', 'ranks': ['gold'], 'gameModes': ['ranked'],
          'patch': '1.17.1', 'versions': ['v1']}


def snap(fetched, rows, **cohort):
    return {'cohort': {**COHORT, **cohort}, 'fetched_at': fetched,
            'rows': [{'slug': s, 'role': r, 'winRate': wr, 'matches': n} for s, r, wr, n in rows]}


class ScopedTrend(unittest.TestCase):
    def test_last_pull_of_each_day_within_seven_days(self):
        now = snap('2026-10-12T20:00:00Z', [('shinbi', 'jungle', 52.004, 900)])
        history = [snap('2026-10-04T20:00:00Z', [('shinbi', 'jungle', 40, 100)]),   # 8 days old: outside
                   snap('2026-10-10T08:00:00Z', [('shinbi', 'jungle', 49, 500)]),
                   snap('2026-10-10T23:00:00Z', [('shinbi', 'jungle', 50, 600)]),   # later the same day: kept
                   snap('2026-10-11T12:00:00Z', [('shinbi', 'jungle', 51, 700)]), now]
        out = m.scoped_trend(history, now)
        self.assertEqual(out['points'], ['2026-10-10T23:00:00Z', '2026-10-11T12:00:00Z', '2026-10-12T20:00:00Z'])
        self.assertEqual(out['series']['jungle']['shinbi'], [[50, 600], [51, 700], [52.0, 900]])
        self.assertEqual((out['window_days'], out['basis'], out['patch'], out['bracket_label']), (7, 'patch_to_date', '1.17.1', 'Gold+'))
        self.assertRegex(out['note'], 'overlap')

    def test_other_cohorts_never_join_the_line(self):
        now = snap('2026-10-12T20:00:00Z', [('shinbi', 'jungle', 52, 900)])
        for other in ({'patch': '1.17'}, {'versions': ['v0']}, {'bracket': 'plat'}, {'rating': 'other'}):
            with self.subTest(other=other):
                self.assertIsNone(m.scoped_trend([snap('2026-10-11T12:00:00Z', [('shinbi', 'jungle', 51, 700)], **other), now], now))

    def test_one_day_is_no_line_and_missing_rows_are_gaps_not_zero(self):
        now = snap('2026-10-12T20:00:00Z', [('shinbi', 'jungle', 52, 900), ('kallari', 'jungle', 48, 300), ('zarus', 'jungle', 0, 0)])
        self.assertIsNone(m.scoped_trend([snap('2026-10-12T08:00:00Z', [('shinbi', 'jungle', 51, 800)]), now], now))
        out = m.scoped_trend([snap('2026-10-11T12:00:00Z', [('shinbi', 'jungle', 51, 700), ('kallari', 'jungle', 0, 0)]), now], now)
        self.assertEqual(out['series']['jungle']['kallari'], [None, [48, 300]])
        self.assertNotIn('zarus', out['series']['jungle'], 'a row with no games today has no line')

    def test_a_changed_source_hero_id_is_not_the_same_hero(self):
        now = snap('2026-10-12T20:00:00Z', [('shinbi', 'jungle', 52, 900)]); now['rows'][0]['source_hero_id'] = 'b'
        old = snap('2026-10-11T12:00:00Z', [('shinbi', 'jungle', 51, 700)]); old['rows'][0]['source_hero_id'] = 'a'
        self.assertEqual(m.scoped_trend([old, now], now)['series']['jungle']['shinbi'], [None, [52, 900]])

    def test_the_series_rides_the_guide_not_the_core(self):
        self.assertIn(('scoped_changes', 'trend'), P.GUIDE_PATHS)


if __name__ == '__main__':
    unittest.main()
