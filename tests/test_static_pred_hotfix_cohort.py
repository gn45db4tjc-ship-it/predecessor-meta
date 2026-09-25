"""Pred.gg cohort across an officially verified hotfix (24 Sep 2026).

After Hotfix 1.17.1, Pred.gg's newest version became 168 ("1.17.1") while the verified official live patch stayed 1.17
(Pred.gg 167). pred_cohort required the newest version to be 1.17, so every Pred.gg collection failed and the reviewed
Gold+ tiers lost their sample. Will chose to count the whole 1.17 line: versions 167 and 168 together, labelled as
such. Observations use both versions; item, Eternal and kit definitions use the newest; anything the official live
article does not verify still withholds the current-patch label.
"""
import copy
import unittest

import predecessor_meta as m

CATALOG = {'NewestVersion': {'id': '168', 'name': '1.17.1'},
           'versions': [{'id': '166', 'name': '1.16.4', 'releaseDate': '2026-09-01T10:00:00Z'},
                        {'id': '167', 'name': '1.17', 'releaseDate': '2026-09-22T10:00:42Z'},
                        {'id': '168', 'name': '1.17.1', 'releaseDate': '2026-09-24T10:00:42Z'}],
           'ratings': [{'name': 'Season 1 - Split 5', 'startTime': '2026-08-01', 'endTime': None,
                        'ranks': [{'id': str(i), 'tierName': t} for i, t in enumerate(['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Paragon'], 27)]}]}
OFFICIAL = {'status': 'verified', 'live': {'version': '1.17', 'hotfixes': [
    {'heading': 'Hotfix v1.17.1', 'version': '1.17.1', 'release_date': '2026-09-24', 'status': 'live'}]}}


class HotfixCohort(unittest.TestCase):
    def test_live_hotfixes_come_only_from_the_verified_live_article_line(self):
        self.assertEqual(m.live_hotfix_versions(OFFICIAL), ['1.17.1'])
        for change in ({'status': 'failed'}, {'live': {'version': '1.17', 'hotfixes': [{'version': '1.17.1', 'status': 'announced'}]}},
                       {'live': {'version': '1.17', 'hotfixes': [{'version': '1.18.1', 'status': 'live'}]}}):
            self.assertEqual(m.live_hotfix_versions({**OFFICIAL, **change}), [])

    def test_a_verified_hotfix_extends_the_cohort_to_both_versions(self):
        c = m.pred_cohort(CATALOG, '1.17', 'gold', ['1.17.1'])
        self.assertEqual((c['versions'], c['definition_version'], c['hotfixes'], c['patch']), (['167', '168'], '168', ['1.17.1'], '1.17'))
        self.assertEqual(c['label'], 'Pred.gg 1.17 + Hotfix 1.17.1 (versions 167, 168)')
        self.assertEqual(c['ranks'], ['29', '30', '31', '32'])
        self.assertIn('versions=167%2C168', m.pred_stats_url(c, 'jungle'))

    def test_without_the_official_hotfix_the_newer_version_still_withholds_the_label(self):
        # 2.34.5 behaviour, and still the rule when the official article has not verified the hotfix.
        with self.assertRaisesRegex(ValueError, 'newest version differs'):
            m.pred_cohort(CATALOG, '1.17', 'gold', [])

    def test_a_hotfix_on_another_line_or_an_unlisted_newest_version_fails_closed(self):
        with self.assertRaisesRegex(ValueError, 'outside the verified live patch line'):
            m.pred_cohort(CATALOG, '1.17', 'gold', ['1.18.1'])
        newer = copy.deepcopy(CATALOG)
        newer['versions'].append({'id': '169', 'name': '1.17.2', 'releaseDate': '2026-09-26T10:00:00Z'})
        newer['NewestVersion'] = {'id': '169', 'name': '1.17.2'}
        with self.assertRaisesRegex(ValueError, 'newest version differs'):
            m.pred_cohort(newer, '1.17', 'gold', ['1.17.1'])

    def test_a_hotfix_pred_gg_has_not_listed_yet_keeps_the_single_version_cohort(self):
        before = copy.deepcopy(CATALOG)
        before['versions'] = before['versions'][:2]; before['NewestVersion'] = {'id': '167', 'name': '1.17'}
        c = m.pred_cohort(before, '1.17', 'gold', ['1.17.1'])
        self.assertEqual((c['versions'], c['definition_version'], c['hotfixes'], c['label']), (['167'], '167', [], 'Pred.gg 1.17 (version 167)'))

    def test_observations_record_every_version_and_definitions_the_newest(self):
        c = m.pred_cohort(CATALOG, '1.17', 'gold', ['1.17.1'])
        record = {'url': 'https://pred.gg/heroes/x', 'fetched_at': '2026-09-25T01:00:00+00:00', 'cache_hit': False}
        self.assertEqual(m.pred_meta(record, c, 'jungle')['version_id'], '167,168')
        self.assertEqual(m.pred_meta(record, c)['version_id'], '168')
        self.assertEqual(m.pred_meta(record, c, 'jungle')['hotfixes'], ['1.17.1'])
        self.assertEqual(m.pred_definition_version(c), '168')
        self.assertEqual(m.pred_definition_version({'versions': ['167']}), '167')

    def test_history_accepts_the_hotfix_cohort_but_never_compares_it_with_the_single_version_one(self):
        c = m.pred_cohort(CATALOG, '1.17', 'gold', ['1.17.1'])
        cohort = m.history_cohort({'source': 'Pred.gg', **c})
        self.assertEqual(cohort['versions'], ['167', '168'])
        old = {'cohort': {**cohort, 'versions': ['167']}}
        self.assertTrue(m.scoped_history_compatible(old, {'cohort': cohort}))
        self.assertFalse(m.scoped_history_compatible(old, {'cohort': cohort}, True))


if __name__ == '__main__':
    unittest.main()
