"""pred_api per-hero pages (groundwork, not wired): every route runs through the collector's own PredPages cache and
parsers unchanged.

The fixture is trimmed from the responses Pred.gg embedded in its Valmont pages on 26 Sep 2026 (Gold+, versions 167 and
168): kit, core builds, item/augment positions, the three matchup tables, and item and Eternal definitions. Each record
is fetched through PredPages(fetch=page_fetch), so link harvesting, payload filtering and caching are the real code.
"""
import json
import tempfile
import unittest
import urllib.parse
from pathlib import Path

import predecessor_meta as m
import pred_api

FIX = Path(__file__).parent / 'fixtures'
PAGES = json.loads((FIX / 'pred-api-hero-pages.json').read_text(encoding='utf-8'))
CATALOG = json.loads((FIX / 'pred-api-catalog.json').read_text(encoding='utf-8'))['data']
COHORT = {'versions': ['167', '168'], 'definition_version': '168', 'gameModes': ['RANKED'], 'ranks': [str(i) for i in range(29, 39)],
          'patch': '1.17', 'hotfixes': ['1.17.1'], 'bracket_label': 'Gold+'}
QUERY_TO_PAGE = {pred_api.QUERIES[k]: k for k in ('kit', 'overview', 'counters', 'hero_items', 'items', 'eternals')}


class FakeApi:
    """Answers each query with its fixture and records the variables sent."""
    def __init__(self):
        self.sent = []

    def __call__(self, body, headers):
        request = json.loads(body)
        self.sent.append((QUERY_TO_PAGE.get(request['query'], 'catalog'), request['variables']))
        data = PAGES[QUERY_TO_PAGE[request['query']]] if request['query'] in QUERY_TO_PAGE else CATALOG
        return 200, json.dumps({'data': data}).encode()


def hero_url(page, role=None):
    query = {'versions': ','.join(COHORT['versions']), 'gameMode': 'RANKED', 'ranks': ','.join(COHORT['ranks'])}
    if role: query['role'] = role.upper()
    return m.PRED_BASE + '/heroes/valmont' + ('' if page == 'overview' else '/' + page) + '?' + urllib.parse.urlencode(query)


class HeroPagesThroughTheCollector(unittest.TestCase):
    def setUp(self):
        self.api = FakeApi()
        self.pages = m.PredPages(force=True, cache_dir=tempfile.mkdtemp(prefix='predapi-test-'),
                                 fetch=lambda url: pred_api.page_fetch(url, token='t', post=self.api))
        self.valmont = next(h for h in CATALOG['heroes'] if h['slug'] == 'valmont')

    def test_the_catalog_carries_the_hero_routes_the_collector_follows(self):
        boot = self.pages.get(m.PRED_BASE + '/heroes', ttl=0)
        paths = {urllib.parse.urlparse(u).path for u in boot['links']}
        self.assertTrue({'/heroes/valmont', '/heroes/gideon', '/heroes/grux'} <= paths)
        self.assertTrue(all('/assets/' in a and a.endswith('_64.webp') for a in boot['assets']) and boot['assets'])

    def test_kit_passes_identity_and_uses_the_newest_version_for_definitions(self):
        rec = self.pages.get(hero_url('hero'), ttl=0)
        h = m.pred_identity(rec, self.valmont)
        self.assertEqual({a['key'] for a in h['data']['abilities']} >= {'PRIMARY', 'SECONDARY', 'ULTIMATE'}, True)
        self.assertEqual(self.api.sent[-1], ('kit', {'slug': 'valmont', 'definitionVersion': '168'}))
        self.assertIn(m.PRED_BASE + '/heroes/valmont/counters', rec['links'])

    def test_core_builds_parse_with_the_cohort_echo_checked(self):
        rec = self.pages.get(hero_url('overview', 'midlane'), ttl=0)
        out = m.pred_role_data(rec, self.valmont, COHORT, 'midlane', 'overview', {'valmont': {'display_name': 'Valmont'}})
        self.assertEqual(out['version_id'], '167,168')
        self.assertTrue(out['cores'] and len(out['cores'][0]['items']) == 3)
        kind, variables = self.api.sent[-1]
        self.assertEqual((kind, variables['roles'], variables['versions']), ('overview', ['MIDLANE'], ['167', '168']))

    def test_item_and_augment_positions_parse(self):
        rec = self.pages.get(hero_url('items', 'midlane'), ttl=0)
        out = m.pred_role_data(rec, self.valmont, COHORT, 'midlane', 'items', {'valmont': {'display_name': 'Valmont'}})
        self.assertTrue(out['tables']['firstTier3'] and out['tables']['crest'])
        self.assertEqual(out['cohort_filter']['versions'], ['167', '168'])

    def test_matchups_parse_and_join_opponents(self):
        rec = self.pages.get(hero_url('counters', 'midlane'), ttl=0)
        hero = rec['payloads'][-1]['hero']
        heroes = {'valmont': {'display_name': 'Valmont'}}
        for k in ('counters', 'antiCounters', 'laneCounters'):
            for r in hero[k]['results']: heroes[r['matchupHero']['slug']] = {'display_name': r['matchupHero']['data']['displayName']}
        out = m.pred_role_data(rec, self.valmont, COHORT, 'midlane', 'counters', heroes)
        self.assertTrue(out['tables']['counters']['cohort_verified'])
        self.assertEqual(len(out['tables']['laneCounters']['rows']), 3)

    def test_a_different_cohort_echo_is_still_refused(self):
        rec = self.pages.get(hero_url('overview', 'midlane'), ttl=0)
        with self.assertRaisesRegex(ValueError, 'echoed a different'):
            m.pred_role_data(rec, self.valmont, dict(COHORT, versions=['168']), 'midlane', 'overview', {'valmont': {'display_name': 'Valmont'}})

    def test_item_and_eternal_definitions_come_from_the_requested_version(self):
        for kind, field in (('items', 'items'), ('eternals', 'eternalCategories')):
            rec = self.pages.get(m.PRED_BASE + '/' + kind + '?version=168', ttl=0)
            rows = next(p[field] for p in rec['payloads'] if field in p)
            self.assertTrue(rows and all(str(r['data']['version']['id']) == '168' for r in rows if r.get('data', {}).get('version')))
            self.assertEqual(self.api.sent[-1], (kind, {'definitionVersion': '168'}))


class Routing(unittest.TestCase):
    def test_role_filters_must_fit_the_page(self):
        with self.assertRaisesRegex(ValueError, 'role filter'):
            pred_api.route(hero_url('hero', 'midlane'))
        with self.assertRaisesRegex(ValueError, 'role filter'):
            pred_api.route(hero_url('counters'))

    def test_unsupported_pages_and_definition_queries_are_refused(self):
        for url in (m.PRED_BASE + '/heroes/valmont/leaderboards?versions=168&gameMode=RANKED&ranks=29',
                    m.PRED_BASE + '/items', m.PRED_BASE + '/items?version=168&extra=1', 'https://example.com/items?version=168'):
            with self.assertRaises(ValueError):
                pred_api.route(url)

    def test_every_generated_query_is_listed_and_names_its_operation(self):
        self.assertEqual(set(pred_api.QUERIES), {'kit', 'overview', 'counters', 'hero_items', 'items', 'eternals'})
        self.assertTrue(all(q.startswith('query PredMeta_') for q in pred_api.QUERIES.values()))


if __name__ == '__main__':
    unittest.main()
