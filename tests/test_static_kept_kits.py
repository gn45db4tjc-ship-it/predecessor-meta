"""2.53.2: a hero with no kit in this collection keeps its previous kit instead of failing the whole rank.

On 10 Oct 2026 the 21:00 collection failed on Gold, Bronze, Silver, Platinum and Diamond with "Unknown or duplicate
sequence-review ability", and Paragon recorded omeda.city heroes.json failing (SSL EOF). Without omeda.city a hero's
kit comes only from its Statz page, so a hero with no Statz page in that rank (GRIM.exe on Gold, Kallari on Silver)
had no kit, and validating the reviewed packet against it aborted the rank. The 15:01 Diamond run failed the same way
("'abilities'") for a hero with no kit. Now omeda.city's kits are kept from the previous collection with their original
date (status retained, never called fresh), and any hero still without a kit keeps its previous source kit, named in
a warning. Nothing is invented: a hero with no previous kit stays without one."""
import copy, gzip, inspect, json, shutil, tempfile, unittest
from pathlib import Path

import predecessor_meta as m

SEED = Path(__file__).resolve().parent.parent / 'public-seed-gold.json.gz'


class KeptKits(unittest.TestCase):
    def setUp(self):
        self.saved = json.loads(gzip.open(SEED).read().decode('utf-8'))
        self.records = m.source_records_before_review(self.saved)
        self.tmp = Path(tempfile.mkdtemp())
        self.data_dir, m.DATA_DIR = m.DATA_DIR, self.tmp
        m.save_bundle(self.saved, self.tmp / 'last_available_gold.json', False)

    def tearDown(self):
        m.DATA_DIR = self.data_dir
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_previous_omeda_kits_keep_their_order_keys_and_original_date(self):
        previous = m.previous_kit_records('gold')
        omeda = {o['slug']: o for o in previous['omeda']}
        self.assertEqual(previous['omeda_fetched_at'], self.saved['sources']['omeda_heroes']['fetched_at'])
        self.assertEqual(previous['heroes_fetched_at']['grim-exe'], self.saved['generated_at'])
        self.assertEqual(previous['omeda_collector'], (self.saved.get('collector') or {}).get('host') or 'unrecorded')
        grim = self.records['heroes']['grim-exe']
        self.assertEqual([a['key'] for a in omeda['grim-exe']['abilities']], [a['key'] for a in grim['abilities']],
                         'official audit paths refer to ability indexes, so the order is kept')
        self.assertEqual(omeda['grim-exe']['id'], grim['omeda']['id'])
        for field in ('id', 'slug', 'display_name', 'roles', 'abilities', 'classes'):
            self.assertIn(field, omeda['grim-exe'], 'the same fields omeda_fetch_heroes requires')

    def test_a_hero_without_a_kit_no_longer_fails_the_rank(self):
        # GRIM.exe has sequence-review rows (the 10 Oct message); Eden has only a meta-review row (the 15:01 'abilities' error).
        for slug in ('grim-exe', 'eden'):
            bundle = copy.deepcopy(self.records)
            expected = copy.deepcopy(bundle['heroes'][slug]['abilities'])
            bundle['heroes'][slug].pop('abilities')
            with self.assertRaises((ValueError, KeyError), msg='reproduces the 10 Oct failure for ' + slug):
                m.enrich_bundle(copy.deepcopy(bundle), bundle['official'])
            self.assertEqual(m.keep_previous_kits(bundle, 'gold'), [slug])
            hero = bundle['heroes'][slug]
            self.assertEqual([a['key'] for a in hero['abilities']], [a['key'] for a in expected])
            self.assertEqual([a['menu_description'] for a in hero['abilities']], [a.get('menu_description') for a in expected])
            self.assertEqual(hero['kit_kept_from_previous'], self.saved['generated_at'])
            warning = [e for e in bundle['errors'] if e['source'] == 'Hero kits']
            self.assertEqual(len(warning), 1)
            self.assertEqual(warning[0]['severity'], 'warning')
            self.assertIn(hero.get('display_name') or slug, warning[0]['detail'])
            m.enrich_bundle(bundle, bundle['official'])

    def test_a_kit_kept_again_keeps_its_original_date_and_collector(self):
        # Review finding on PR #142: a second failed collection must not restamp a kept kit with the newer bundle's date.
        older = '2026-10-09T18:00:00-05:00'
        saved = copy.deepcopy(self.saved)
        saved['heroes']['grim-exe']['kit_kept_from_previous'] = older
        saved['sources']['omeda_heroes'] = dict(saved['sources']['omeda_heroes'], status='retained', fetched_at=older)
        saved['collector'] = {'host': 'cloud'}
        saved['retained_sources'] = {'omeda': {'collector': 'windows', 'fetched_at': older}}
        m.save_bundle(saved, self.tmp / 'last_available_gold.json', False)
        previous = m.previous_kit_records('gold')
        self.assertEqual(previous['heroes_fetched_at']['grim-exe'], older)
        self.assertEqual(previous['heroes_fetched_at']['grux'], saved['generated_at'])
        self.assertEqual((previous['omeda_fetched_at'], previous['omeda_collector']), (older, 'windows'))
        bundle = copy.deepcopy(self.records)
        bundle['heroes']['grim-exe'].pop('abilities')
        m.keep_previous_kits(bundle, 'gold')
        self.assertEqual(bundle['heroes']['grim-exe']['kit_kept_from_previous'], older)
        self.assertIn('(kit from ' + older + ')', [e for e in bundle['errors'] if e['source'] == 'Hero kits'][0]['detail'])

    def test_retained_omeda_kits_name_who_fetched_them(self):
        import static_publish as p
        p.validate_collector({'collector': {'host': 'cloud', 'retained_from': {'omeda': 'windows'}}})
        with self.assertRaises(ValueError):
            p.validate_collector({'collector': {'host': 'cloud', 'retained_from': {'omeda': 'someone else'}}})
        src = inspect.getsource(m.collect_bundle)
        self.assertIn("bundle.setdefault('retained_sources',{})['omeda']", src)
        self.assertLess(src.index('attach_retained_statz(bundle'), src.index("['omeda']={'collector'"),
                        'attach_retained_statz replaces retained_sources, so the omeda record is added after it')
        self.assertIn("('omeda', ('omeda_heroes',))", inspect.getsource(p))

    def test_nothing_is_invented_without_a_previous_kit(self):
        bundle = copy.deepcopy(self.records)
        bundle['heroes']['new-hero'] = {'slug': 'new-hero', 'display_name': 'New Hero', 'roles': {}}
        self.assertEqual(m.keep_previous_kits(bundle, 'gold'), [])
        self.assertNotIn('abilities', bundle['heroes']['new-hero'])
        self.assertFalse(any(e['source'] == 'Hero kits' for e in bundle.get('errors', [])))
        m.DATA_DIR = self.tmp / 'empty'
        self.assertIsNone(m.previous_kit_records('gold'))

    def test_a_kit_collected_now_is_never_replaced(self):
        bundle = copy.deepcopy(self.records)
        bundle['heroes']['grux']['abilities'][0]['menu_description'] = 'Collected this time.'
        self.assertEqual(m.keep_previous_kits(bundle, 'gold'), [])
        self.assertEqual(bundle['heroes']['grux']['abilities'][0]['menu_description'], 'Collected this time.')

    def test_retained_omeda_kits_are_labelled_with_their_original_date(self):
        now = m.iso(m.now_utc())
        kits = [{'id': 1, 'slug': 'grux', 'name': 'Grux', 'display_name': 'Grux', 'roles': ['jungle'], 'classes': [], 'image': None,
                 'abilities': [{'key': 'LMB', 'display_name': 'Warclubs', 'menu_description': 'Deals damage'}]}]
        meta = {'fetched_at': now, 'heroes_error': 'URLError: SSL EOF', 'heroes_retained': {'fetched_at': '2026-10-10T18:00:00-05:00'}}
        b = m.build_bundle({'rows': [], 'patch': '1.17', 'bracket_label': 'Gold+'}, {'fetched_at': now, 'secs': 0}, {}, kits, None, meta,
                           dict(m.DEFAULT_SETTINGS, bracket='gold'), 'gold', {'fetched_at': now, 'secs': 0})
        source = b['sources']['omeda_heroes']
        self.assertEqual((source['status'], source['fetched_at'], source['attempted_at']), ('retained', '2026-10-10T18:00:00-05:00', now))
        self.assertIn('SSL EOF', source['error'])
        error = [e for e in b['errors'] if e['source'] == 'omeda.city heroes.json']
        self.assertEqual(len(error), 1, 'the failure stays an error, so the source is retried')
        self.assertEqual(error[0]['severity'], 'error')
        self.assertIn('kept from the collection fetched 2026-10-10T18:00:00-05:00', error[0]['detail'])

    def test_retained_kits_never_make_a_collection_complete_but_do_not_block_an_update(self):
        b = copy.deepcopy(self.saved)
        b['sources']['omeda_heroes'] = dict(b['sources']['omeda_heroes'], status='retained', error='SSL EOF')
        self.assertFalse(m.bundle_is_complete(b)[0])
        src = inspect.getsource(m.bundle_has_current_primary)
        self.assertIn("in ('ok','retained')", src)
        self.assertIn("source.get('status') == 'retained'", inspect.getsource(m.bundle_has_fresh_statz))

    def test_collection_keeps_kits_before_the_review_is_validated(self):
        src = inspect.getsource(m.collect_bundle)
        self.assertIn('previous_kit_records(bracket)', src)
        self.assertLess(src.index('keep_previous_kits(bundle,bracket)'), src.index('enrich_bundle(bundle,official)'))


if __name__ == '__main__':
    unittest.main()
