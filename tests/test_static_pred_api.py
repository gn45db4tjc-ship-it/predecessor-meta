"""pred_api (groundwork, not wired): API responses must pass through the collector's own Pred.gg parsers unchanged.

Fixtures are cut from real responses on 26 Sep 2026: the anonymous API catalog (three heroes, the current rating, the
1.16.4 / 1.17 / 1.17.1 versions) and the Gold+ Jungle statistics that pred.gg/heroes embeds for versions 167 and 168,
which is the same GraphQL shape the statistics query requests.
"""
import json
import unittest
from pathlib import Path

import predecessor_meta as m
import pred_api

FIXTURES = Path(__file__).parent / 'fixtures'
CATALOG = (FIXTURES / 'pred-api-catalog.json').read_bytes()
STATS = (FIXTURES / 'pred-api-stats-jungle.json').read_bytes()
HEROES = {'grux': {'display_name': 'Grux'}, 'gideon': {'display_name': 'Gideon'}, 'valmont': {'display_name': 'Valmont'}}
COHORT = {'versions': ['167', '168'], 'gameModes': ['RANKED'], 'ranks': ['29', '30', '31', '32'], 'patch': '1.17', 'bracket_label': 'Gold+'}


class FakePost:
    def __init__(self, *responses):
        self.responses, self.calls = list(responses), []

    def __call__(self, body, headers):
        self.calls.append((json.loads(body), headers))
        return self.responses.pop(0)


class PageCompatibleResponses(unittest.TestCase):
    def test_the_catalog_feeds_pred_catalog_and_the_hotfix_cohort(self):
        post = FakePost((200, CATALOG))
        page, status, _ = pred_api.page_fetch(m.PRED_BASE + '/heroes', token='', post=post)
        catalog = m.pred_catalog(m.pred_payloads(page))
        cohort = m.pred_cohort(catalog, '1.17', 'gold', ['1.17.1'])
        self.assertEqual((status, cohort['versions'], cohort['definition_version']), (200, ['167', '168'], '168'))
        self.assertEqual(post.calls[0][0]['query'], pred_api.CATALOG_QUERY)

    def test_statistics_feed_pred_parse_stats_with_the_cohort_echo_checked(self):
        url = m.pred_stats_url(COHORT, 'jungle')
        post = FakePost((200, STATS))
        page, _, _ = pred_api.page_fetch(url, token='t', post=post)
        rows = m.pred_parse_stats(m.pred_payloads(page), COHORT, 'jungle', HEROES, url, '2026-09-26T12:00:00Z')
        by = {r['slug']: r for r in rows}
        self.assertEqual((by['grux']['matches'], by['grux']['wonGames'], by['grux']['banGames']), (420, 207, 72))
        self.assertIsNone(by['gideon']['winRate'], 'zero games is no rate, not 0%')
        sent, headers = post.calls[0]
        self.assertEqual(sent['variables'], {'versions': ['167', '168'], 'gameModes': ['RANKED'], 'ranks': ['29', '30', '31', '32'], 'roles': ['JUNGLE']})
        self.assertEqual(headers['Authorization'], 'Bearer t')

    def test_a_different_echoed_cohort_is_still_refused(self):
        other = dict(COHORT, versions=['168'])
        url = m.pred_stats_url(other, 'jungle')
        page, _, _ = pred_api.page_fetch(url, token='t', post=FakePost((200, STATS)))
        with self.assertRaisesRegex(ValueError, 'echoed a different'):
            m.pred_parse_stats(m.pred_payloads(page), other, 'jungle', HEROES, url, '2026-09-26T12:00:00Z')

    def test_all_roles_url_sends_no_role_filter(self):
        self.assertEqual(pred_api.stats_variables(m.pred_stats_url(COHORT))['roles'], None)


class Failures(unittest.TestCase):
    def test_forbidden_statistics_are_reported_as_unauthorized(self):
        body = json.dumps({'data': {'heroes': []}, 'errors': [{'message': 'Forbidden', 'path': ['heroes', 0, 'currentBalanceStatistic']}]}).encode()
        with self.assertRaises(pred_api.PredApiUnauthorized):
            pred_api.page_fetch(m.pred_stats_url(COHORT, 'jungle'), token='', post=FakePost((200, body)))

    def test_other_errors_and_http_failures_fail_loudly(self):
        bad = json.dumps({'errors': [{'message': 'Unknown field "x"'}]}).encode()
        for response in ((200, bad), (503, b'')):
            with self.assertRaises(pred_api.PredApiError):
                pred_api.graphql(pred_api.CATALOG_QUERY, post=FakePost(response))

    def test_only_hero_statistics_urls_are_translated(self):
        for url in ('https://pred.gg/heroes/grux/items?versions=168', 'https://example.com/heroes?versions=1&gameMode=RANKED&ranks=1',
                    'https://pred.gg/heroes?versions=168&gameMode=RANKED&ranks=29&extra=1', 'https://pred.gg/heroes?versions=168'):
            with self.assertRaises(ValueError):
                pred_api.stats_variables(url)

    def test_a_script_closing_tag_in_data_cannot_break_the_embedded_page(self):
        body = json.dumps({'data': {'heroes': [], 'NewestVersion': {'id': '</script>'}, 'versions': []}}).encode()
        page, _, _ = pred_api.page_fetch(m.PRED_BASE + '/heroes', token='', post=FakePost((200, body)))
        self.assertEqual(m.pred_payloads(page)[0]['NewestVersion']['id'], '</script>')

    def test_the_token_comes_only_from_the_environment_and_blank_means_none(self):
        self.assertEqual(pred_api.token_from_environment({'PRED_API_TOKEN': ' abc '}), 'abc')
        self.assertIsNone(pred_api.token_from_environment({'PRED_API_TOKEN': '  '}))
        self.assertIsNone(pred_api.token_from_environment({}))


if __name__ == '__main__':
    unittest.main()
