"""Audit item 11: the website delivery projection (core + evidence annexes)."""
import copy, gzip, json, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
import sys
sys.path.insert(0, str(ROOT))
import projection as P

SEED = ROOT / 'public-seed-gold.json.gz'


def seed():
    return json.loads(gzip.open(SEED).read())


@unittest.skipUnless(SEED.exists(), 'the public seed is not part of this package')
class ProjectionRoundTrip(unittest.TestCase):
    def setUp(self):
        self.bundle = seed()

    def test_core_and_annexes_reproduce_the_full_bundle_exactly(self):
        core, heroes, shared = P.split(self.bundle)
        rebuilt = P.merge(core, shared, *heroes.values())
        self.assertEqual(P.dumps(rebuilt), P.dumps(self.bundle), 'bytes, key order included')

    def test_the_published_parts_round_trip_through_their_encoding(self):
        parts = P.build(self.bundle)
        decoded = [P.decode(json.loads(parts['shared']))] + [P.decode(json.loads(v)) for v in parts['heroes'].values()]
        self.assertEqual(P.dumps(P.merge(P.decode(json.loads(parts['core'])), *decoded)), P.dumps(self.bundle))

    def test_display_only_fields_leave_the_core_and_engine_fields_stay(self):
        core, heroes, shared = P.split(self.bundle)
        slug = next(s for s, h in self.bundle['heroes'].items() if h.get('previous_abilities') is not None)
        self.assertNotIn('previous_abilities', core['heroes'][slug])
        self.assertIn('previous_abilities', heroes[slug]['heroes'][slug])
        self.assertNotIn('definition_history', core['official'])
        self.assertIn('definition_history', shared['official'])
        for key in ('guidance', 'tier_list', 'pairs', 'scoped_statistics', 'official_changes'):
            self.assertEqual(core.get(key), self.bundle.get(key), key + ' stays whole in the core')
        ability = next(a for a in self.bundle['heroes'][slug]['abilities'] if 'pred_raw' in a)
        kept = core['heroes'][slug]['abilities'][self.bundle['heroes'][slug]['abilities'].index(ability)]
        self.assertNotIn('pred_raw', kept)
        self.assertEqual(kept.get('game_description'), ability.get('game_description'), 'the engine reads ability descriptions')

    def test_fields_that_are_not_listed_stay_in_the_core(self):
        bundle = copy.deepcopy(self.bundle)
        bundle['a_new_top_level_field'] = {'value': 1}
        slug = next(iter(bundle['heroes']))
        bundle['heroes'][slug]['a_new_hero_field'] = [1, 2, 3]
        core, _, _ = P.split(bundle)
        self.assertEqual(core['a_new_top_level_field'], {'value': 1})
        self.assertEqual(core['heroes'][slug]['a_new_hero_field'], [1, 2, 3])

    def test_tier3_item_tables_stay_in_the_core_only_while_the_pred_cohort_is_ok(self):
        # engine currentItemPool reads the six Tier 3 tables only when scoped_statistics.status is 'ok'.
        for status, in_core in (('ok', True), ('retained', False), ('partial', False)):
            bundle = copy.deepcopy(self.bundle)
            bundle['scoped_statistics']['status'] = status
            core, heroes, _ = P.split(bundle)
            slug, roles = next((s, r) for s, r in bundle['pred_game_data']['role_data'].items() if any('items' in d for d in r.values()))
            role = next(r for r, d in roles.items() if 'items' in d)
            tables = core['pred_game_data']['role_data'][slug][role]['items'].get('tables', {})
            self.assertEqual('firstTier3' in tables, in_core, status)
            self.assertFalse(any(k not in P.TIER3 for k in tables), 'other item tables never stay in the core')
            self.assertEqual(P.dumps(P.merge(core, *heroes.values(), P.split(bundle)[2])), P.dumps(bundle))

    def test_the_counters_table_stays_in_the_core_only_when_its_cohort_is_verified(self):
        # engine matchup reads tables.counters rows only when cohort_verified is true; the other tables never.
        bundle = copy.deepcopy(self.bundle)
        slug, roles = next((s, r) for s, r in bundle['pred_game_data']['role_data'].items() if any('counters' in d for d in r.values()))
        role = next(r for r, d in roles.items() if 'counters' in d)
        tables = bundle['pred_game_data']['role_data'][slug][role]['counters']['tables']
        for verified, in_core in ((True, True), (False, False), (None, False)):
            tables['counters'] = dict(tables.get('counters') or {}, cohort_verified=verified)
            core, _, _ = P.split(bundle)
            kept = core['pred_game_data']['role_data'][slug][role]['counters']['tables']
            self.assertEqual('counters' in kept, in_core, verified)
            self.assertNotIn('antiCounters', kept)
            self.assertNotIn('laneCounters', kept)

    def test_reserved_projection_keys_in_a_bundle_are_refused(self):
        bundle = copy.deepcopy(self.bundle)
        bundle['guidance']['$order'] = ['x']
        with self.assertRaises(ValueError):
            P.split(bundle)

    def test_a_projection_that_does_not_reproduce_the_bundle_is_refused(self):
        original = P.merge
        try:
            P.merge = lambda core, *overlays: original(core, *overlays[1:])   # drops an annex
            with self.assertRaises(ValueError):
                P.build(self.bundle)
        finally:
            P.merge = original

    def test_the_core_meets_the_size_budget_while_pred_gg_is_retained(self):
        # Acceptance: initial decoded bundle at most 5 MB. While Pred.gg is retained (as on 19 September 2026) its
        # purchase tables cannot drive recommendations, so they are not in the core.
        bundle = copy.deepcopy(self.bundle)
        bundle['scoped_statistics']['status'] = 'retained'
        parts = P.build(bundle)
        self.assertLessEqual(len(parts['core']), 5_000_000, 'core bytes')
        self.assertLess(len(parts['core']), len(P.dumps(bundle)) * 0.4)


class PublishedProjection(unittest.TestCase):
    """render_site publishes the full bundle unchanged plus a core and annexes that rebuild it byte for byte."""
    def setUp(self):
        import tempfile
        import static_publish as s
        from test_static_publish import bundle, official
        self.s, self.official = s, official
        self.tmp = tempfile.TemporaryDirectory()
        self.state, self.out = Path(self.tmp.name) / 'state', Path(self.tmp.name) / 'site'
        self.bundle = seed() if SEED.exists() else bundle()
        s.retain_success(copy.deepcopy(self.bundle), self.state)

    def tearDown(self):
        self.tmp.cleanup()

    def test_every_part_is_published_under_its_checksum_and_rebuilds_the_full_bundle(self):
        import hashlib
        manifest = self.s.render_site(self.state, self.out, {'patch_check': self.s.patch_summary(self.official())})
        entry = manifest['cohorts']['gold']
        full = (self.out / entry['url']).read_bytes()
        self.assertEqual(hashlib.sha256(full).hexdigest(), entry['sha256'], 'the full bundle stays published as before')
        p = entry['projection']
        self.assertEqual(p['version'], P.VERSION)
        parts = [('core', p['core'])] + [('shared', p['shared'])] + [('hero-' + slug, v) for slug, v in p['heroes'].items()]
        self.assertEqual(set(p['heroes']), set(json.loads(full)['heroes']), 'one evidence file per hero')
        decoded = {}
        for kind, part in parts:
            raw = (self.out / part['url']).read_bytes()
            digest = hashlib.sha256(raw).hexdigest()
            self.assertEqual((part['sha256'], part['bytes'], part['url']), (digest, len(raw), 'bundles/gold-' + kind + '-' + digest + '.json'))
            decoded[kind] = P.decode(json.loads(raw))
        rebuilt = P.merge(decoded.pop('core'), *decoded.values())
        self.assertEqual(P.dumps(rebuilt), full)
        self.assertLess(p['core']['bytes'], len(full))
        html = (self.out / 'index.html').read_text(encoding='utf8')
        self.assertLess(html.index('MetaProjection'), html.index('function checkPublication()'), 'the page decodes parts with projection_client.js')


class ColumnarEncoding(unittest.TestCase):
    def test_rows_of_the_same_shape_round_trip_with_key_order(self):
        value = {'rows': [{'b': 1, 'a': [1, {'x': 2}]}, {'b': 2, 'a': []}, {'b': 3, 'a': None}], 'mixed': [{'a': 1}, {'b': 2}, {'a': 3}]}
        encoded = P.encode(value)
        self.assertEqual(encoded['rows'], {'$c': ['b', 'a'], '$r': [[1, [1, {'x': 2}]], [2, []], [3, None]]})
        self.assertEqual(encoded['mixed'], value['mixed'], 'different shapes are left as they are')
        self.assertEqual(json.dumps(P.decode(encoded)), json.dumps(value))


if __name__ == '__main__':
    unittest.main()
