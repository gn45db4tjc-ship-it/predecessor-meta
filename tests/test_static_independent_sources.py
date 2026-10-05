"""Independent-source publication tests. Every number below is a synthetic fixture."""
import copy
import datetime as dt
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import static_publish as p
import local_updater as updater
from import_local_feed import import_feed
from test_static_publish import bundle, NOW, official


def partial():
    b = bundle()
    b['errors'] = [{'source': 'Pred.gg', 'severity': 'error', 'detail': 'Structured response unavailable'}]
    b['generated_at'] = (NOW + dt.timedelta(minutes=1)).isoformat()
    b['sources'].update({key: {'status': 'ok', 'fetched_at': NOW.isoformat()}
                        for key in ('statz_tierlist', 'statz_hero_pages', 'omeda_heroes', 'omeda_items')})
    b['sources']['statz_hero_pages'].update(ok=1, requested=1, failed=0, conflicting=0)
    b['sources'].update({key: {'status': 'failed', 'fetched_at': None}
                        for key in ('pred_scoped', 'pred_game_data')})
    b['tier_list'][0].update(winRate=50.0, pickRate=10.0, matches=200)
    b['heroes']['unit-test-fixture']['roles'] = {'jungle': {
        'status': 'ok', 'winRate': 50.0, 'pickRate': 10.0, 'playedGames': 200}}
    b['scoped_statistics'] = {'status': 'failed'}
    b['pred_game_data'] = {'status': 'failed'}
    return b


def previous():
    b = partial()
    b['generated_at'] = NOW.isoformat()
    b['errors'] = []
    b['scoped_statistics'] = {'status': 'ok', 'patch': '1.2', 'bracket': 'gold', 'rows': [{'slug': 'unit-test-fixture', 'matches': 200}]}
    b['pred_game_data'] = {'status': 'ok', 'cohort': {'patch': '1.2'}, 'heroes': {'unit-test-fixture': {}}}
    for key in ('pred_scoped', 'pred_game_data'):
        b['sources'][key] = {'status': 'ok', 'fetched_at': NOW.isoformat()}
    return b


class IndependentTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)

    def test_partial_is_useful_but_not_complete(self):
        b = partial()
        self.assertFalse(p.base.bundle_is_complete(b)[0])
        self.assertTrue(p.base.bundle_has_fresh_statz(b))
        self.assertTrue(p.base.bundle_is_publishable(b))
        with self.assertRaises(ValueError): p.retain_success(b, self.root)

    def test_repackaging_old_observations_is_not_an_independent_update(self):
        b = partial(); b['generated_at'] = (NOW + dt.timedelta(days=6)).isoformat()
        self.assertFalse(p.base.bundle_has_fresh_statz(b))
        with self.assertRaises(ValueError): p.retain_publication(b, self.root)

    def test_missing_or_invalid_numeric_input_is_rejected(self):
        for field, value in [('matches', None), ('matches', True), ('matches', -1), ('winRate', None), ('winRate', float('nan')), ('winRate', 101), ('pickRate', '50')]:
            with self.subTest(field=field, value=value):
                b = partial(); b['tier_list'][0][field] = value
                self.assertFalse(p.base.bundle_has_fresh_statz(b))
        b = partial(); del b['heroes']['unit-test-fixture']['roles']['jungle']['playedGames']
        self.assertFalse(p.base.bundle_has_fresh_statz(b))

    def test_missing_dates_patch_role_or_incomplete_pages_are_rejected(self):
        for mutate in [lambda b: b['sources']['omeda_items'].pop('fetched_at'),
                       lambda b: b['sources']['statz_hero_pages'].update(ok=0),
                       lambda b: b['tier_list'].append(copy.deepcopy(b['tier_list'][0])),
                       lambda b: b['official'].update(status='failed'),
                       lambda b: b['tier_list'][0].update(role='other'),
                       lambda b: b.update(patch_conflicts=['different patch'])]:
            b = partial(); mutate(b)
            self.assertFalse(p.base.bundle_has_fresh_statz(b))

    def test_partial_persistence_preserves_full_success_and_survives_relaunch(self):
        p.retain_success(bundle(), self.root)
        before = (self.root / 'bundles/gold.json.gz').read_bytes()
        p.retain_publication(partial(), self.root)
        self.assertEqual((self.root / 'bundles/gold.json.gz').read_bytes(), before)
        self.assertEqual(p.load_success(self.root, 'gold')['generated_at'], NOW.isoformat())
        self.assertEqual(p.load_publication(self.root, 'gold')['generated_at'], partial()['generated_at'])
        self.assertTrue(p.load_publication(self.root, 'gold')['refresh_result'].startswith('partial'))

    def test_newer_complete_wins_and_corrupt_partial_keeps_success(self):
        p.retain_publication(partial(), self.root)
        b = bundle(); b['generated_at'] = (NOW + dt.timedelta(hours=2)).isoformat()
        p.retain_success(b, self.root)
        self.assertEqual(p.load_publication(self.root, 'gold')['generated_at'], b['generated_at'])
        (self.root / 'partial-bundles/gold.json.gz').write_bytes(b'broken')
        self.assertEqual(p.load_publication(self.root, 'gold')['generated_at'], b['generated_at'])

    def test_partial_export_import_retains_dates_error_and_private_boundary(self):
        b = partial(); b['retained_sources'] = {'pred': {'statistics_fetched_at': NOW.isoformat()}}
        b['settings'] = {'private': 'never-export'}
        p.retain_success(bundle(), self.root)
        p.retain_publication(b, self.root)
        p.write_json(self.root / 'publication.json', {'patch_check': p.patch_summary(official()),
            'attempts': {'gold': {'status': 'partial', 'errors': b['errors']}}})
        updater.export_feed(self.root, self.root / 'feed')
        raw = (self.root / 'feed/gold.json').read_text(encoding='utf8')
        self.assertNotIn('never-export', raw)
        import_feed(self.root / 'feed', self.root / 'cloud')
        got = p.load_publication(self.root / 'cloud', 'gold')
        self.assertEqual(got['sources'], b['sources'])
        self.assertEqual(got['retained_sources'], b['retained_sources'])
        self.assertEqual(got['errors'], b['errors'])
        self.assertIsNone(p.load_success(self.root / 'cloud', 'gold'))

    def test_manifest_exposes_per_source_dates_and_partial_status(self):
        p.retain_publication(partial(), self.root)
        with patch.object(p, 'CONFIG', dict(p.CONFIG, brackets=['gold'])):
            manifest = p.render_site(self.root, self.root / 'site', {'attempts': {'gold': {'status': 'partial'}}})
        entry = manifest['cohorts']['gold']
        self.assertEqual(entry['collection_status'], 'partial')
        self.assertEqual(entry['source_dates']['statz_tierlist']['fetched_at'], NOW.isoformat())
        self.assertIsNone(entry['source_dates']['pred_scoped']['fetched_at'])

    def test_retention_does_not_change_observations_or_dates(self):
        b, old = partial(), previous()
        original = copy.deepcopy(old)
        with patch.object(p.base, 'apply_pred_game_data') as apply:
            self.assertTrue(p.base.retain_pred_partition(b, old))
            apply.assert_called_once()
        self.assertEqual(old, original)
        self.assertEqual(b['scoped_statistics']['rows'], old['scoped_statistics']['rows'])
        self.assertEqual(b['sources']['pred_scoped']['fetched_at'], NOW.isoformat())
        self.assertEqual(b['sources']['pred_scoped']['status'], 'retained')
        self.assertEqual(b['tier_list'], partial()['tier_list'])
        self.assertFalse(p.base.bundle_is_complete(b)[0])

    def test_wrong_bracket_new_patch_hotfix_and_roster_never_reuse_pred(self):
        for mutate in [lambda b: b['bracket'].update(segment='diamond'),
                       lambda b: b['official']['live'].update(version='1.3'),
                       lambda b: b['official']['live'].update(fingerprint='hotfix'),
                       lambda b: b['official'].update(status='failed'),
                       lambda b: b['heroes'].update(new_hero={})]:
            b = partial(); mutate(b); before = copy.deepcopy(b)
            with patch.object(p.base, 'apply_pred_game_data') as apply:
                self.assertFalse(p.base.retain_pred_partition(b, previous()))
                apply.assert_not_called()
            self.assertEqual(b, before)

    def test_failed_mechanics_replay_cannot_mutate_fresh_source_data(self):
        b = partial(); before = copy.deepcopy(b)
        def fail(staged):
            staged['tier_list'].clear()
            raise ValueError('Synthetic field conflict')
        with patch.object(p.base, 'apply_pred_game_data', side_effect=fail):
            self.assertFalse(p.base.retain_pred_partition(b, previous()))
        self.assertEqual(b['tier_list'], before['tier_list'])
        self.assertEqual(b['sources'], before['sources'])
        self.assertEqual(b['errors'][-1]['source'], 'Pred.gg retention validation')

    # 2.52.1: Pred.gg kit and item definitions are kept, with their original dates, instead of falling back to omeda.city
    # (Pred.gg's former site; its heroes.json/items.json stopped updating before patch 1.17).
    def test_partial_previous_with_complete_kits_is_retained(self):
        # 4 Oct 2026: Gold+ lost its complete Pred.gg kits because the earlier collection was 'partial' (one rank-only
        # counters page timed out), and the next failed collection fell back to omeda.city text.
        b, old = partial(), previous()
        old['pred_game_data']['status'] = 'partial'; old['sources']['pred_game_data']['status'] = 'partial'
        with patch.object(p.base, 'apply_pred_game_data') as apply:
            self.assertTrue(p.base.retain_pred_partition(b, old))
            apply.assert_called_once()
        self.assertEqual(b['pred_game_data']['status'], 'retained')
        self.assertEqual(b['sources']['pred_game_data']['status'], 'retained')
        self.assertEqual(b['sources']['pred_game_data']['fetched_at'], NOW.isoformat())

    def test_failed_kits_are_kept_while_fresh_statistics_stay(self):
        later = (NOW + dt.timedelta(hours=1)).isoformat()
        b = partial()
        b['scoped_statistics'] = {'status': 'ok', 'patch': '1.2', 'bracket': 'gold', 'rows': [{'slug': 'unit-test-fixture', 'matches': 300}]}
        b['sources']['pred_scoped'] = {'status': 'ok', 'fetched_at': later}
        fresh = copy.deepcopy(b['scoped_statistics'])
        with patch.object(p.base, 'apply_pred_game_data') as apply:
            self.assertTrue(p.base.retain_pred_partition(b, previous()))
            apply.assert_called_once()
        self.assertEqual(b['scoped_statistics'], fresh)
        self.assertEqual(b['sources']['pred_scoped'], {'status': 'ok', 'fetched_at': later})
        self.assertEqual(b['pred_game_data']['status'], 'retained')
        self.assertEqual(b['sources']['pred_game_data']['fetched_at'], NOW.isoformat())
        kept = b['retained_sources']['pred']
        self.assertEqual(kept['mechanics_fetched_at'], NOW.isoformat())
        self.assertNotIn('statistics_fetched_at', kept)
        self.assertIn('definitions', b['errors'][-1]['detail'])

    def test_partial_collection_keeps_previous_kits_only_for_failed_heroes(self):
        old_time, new_time = NOW.isoformat(), (NOW + dt.timedelta(hours=1)).isoformat()
        def two_heroes(x):
            x['heroes']['second'] = dict(copy.deepcopy(x['heroes']['unit-test-fixture']), slug='second', display_name='Second')
            return x
        b, prev = two_heroes(partial()), two_heroes(previous())
        cohort = {'patch': '1.2', 'definition_version': '9', 'versions': ['9']}
        kit = lambda when: {'data': {'abilities': [{'key': 'BASIC'}]}, 'fetched_at': when, 'source': 'Pred.gg'}
        prev['pred_game_data'] = {'status': 'ok', 'cohort': dict(cohort), 'heroes': {'unit-test-fixture': kit(old_time), 'second': kit(old_time)},
                                  'items_catalog': {'rows': [{'slug': 'x'}], 'fetched_at': old_time}}
        out = {'status': 'partial', 'cohort': dict(cohort), 'heroes': {'unit-test-fixture': kit(new_time)}, 'errors': []}
        kept = p.base.keep_previous_pred_definitions(b, out, prev)
        self.assertEqual(kept, ['second', 'items_catalog'])
        self.assertEqual(out['heroes']['unit-test-fixture'], kit(new_time))
        self.assertEqual(out['heroes']['second'], dict(kit(old_time), kept_from_previous=True))
        self.assertEqual(out['items_catalog'], {'rows': [{'slug': 'x'}], 'fetched_at': old_time, 'kept_from_previous': True})
        self.assertEqual(out['errors'][-1]['source'], 'Pred.gg kept definitions')
        self.assertIn('second', out['errors'][-1]['detail'])
        # Never across a definition version, hotfix fingerprint, bracket or failed official check.
        for mutate in [lambda b, o, v: v['pred_game_data']['cohort'].update(definition_version='8'),
                       lambda b, o, v: b['official']['live'].update(fingerprint='hotfix'),
                       lambda b, o, v: v['bracket'].update(segment='diamond'),
                       lambda b, o, v: b['official'].update(status='failed')]:
            b2, prev2 = two_heroes(partial()), two_heroes(previous())
            prev2['pred_game_data'] = copy.deepcopy(prev['pred_game_data'])
            out2 = {'status': 'partial', 'cohort': dict(cohort), 'heroes': {'unit-test-fixture': kit(new_time)}, 'errors': []}
            mutate(b2, out2, prev2)
            self.assertEqual(p.base.keep_previous_pred_definitions(b2, out2, prev2), [])
            self.assertNotIn('second', out2['heroes'])

    def test_kept_definitions_are_filled_before_the_one_validated_apply(self):
        import inspect
        source = inspect.getsource(p.base.attach_pred_game_data)
        self.assertLess(source.index('keep_previous_pred_definitions(bundle,out,previous)'), source.index('apply_pred_game_data(staged)'))
        collect = inspect.getsource(p.base.collect_bundle)
        self.assertIn('attach_pred_game_data(bundle,progress,pages=pred_pages,previous=previous_pred)', collect)
        self.assertIn('retain_pred_partition(bundle, previous_pred)', collect)

    def test_previous_bundle_prefers_the_newest_with_pred_definitions(self):
        from unittest.mock import patch as _patch
        with tempfile.TemporaryDirectory() as folder, _patch.object(p.base, 'DATA_DIR', Path(folder)):
            older, newer = previous(), partial()
            older['schema'] = newer['schema'] = 3
            newer['generated_at'] = (NOW + dt.timedelta(hours=2)).isoformat()
            p.base.save_bundle(older, Path(folder) / 'last_successful_gold.json')
            p.base.save_bundle(newer, Path(folder) / 'last_available_gold.json')
            self.assertEqual(p.base.previous_pred_bundle('gold')['generated_at'], older['generated_at'])

    def test_fresh_pred_is_not_overwritten_by_retention(self):
        # Fresh statistics and fresh definitions: nothing is retained (failed definitions alone: see the test above).
        b = partial(); b['scoped_statistics']['status'] = 'ok'; b['pred_game_data']['status'] = 'ok'
        with patch.object(p.base, 'apply_pred_game_data') as apply:
            self.assertFalse(p.base.retain_pred_partition(b, previous()))
            apply.assert_not_called()


if __name__ == '__main__': unittest.main()
