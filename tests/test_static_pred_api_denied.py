"""Pred.gg API denials (2.43.1). Rocket verified on 2 Oct 2026 that pred.gg/gql answers anonymous hero metadata but returns
hero.generalStatistic as null with a GraphQL "Forbidden" error under HTTP 200. Check GraphQL errors, not only the HTTP
status; stop on denied fields; keep the API path gated on Pred.gg's approval (OAuth grant, quotas and permission to
publish statistics are unconfirmed)."""
import json, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
import predecessor_meta as m
import pred_api

TOKEN = 'test-token-not-real'


def reply(body):
    return lambda payload, headers, **kw: (200, json.dumps(body).encode())


class GraphQLDenials(unittest.TestCase):
    def test_a_forbidden_field_among_other_errors_is_a_denial(self):
        body = {'errors': [{'message': 'Forbidden', 'path': ['hero', 'generalStatistic']}, {'message': 'Something else'}], 'data': {'hero': {'generalStatistic': None}}}
        with self.assertRaises(pred_api.PredApiUnauthorized):
            pred_api.graphql('query { hero { generalStatistic { matches } } }', post=reply(body), token=TOKEN)

    def test_a_null_statistic_without_an_error_is_a_denial_not_empty_data(self):
        body = {'data': {'currentBalanceStatistic': None, 'hero': {'slug': 'kira', 'generalStatistic': None}}}
        with self.assertRaises(pred_api.PredApiUnauthorized):
            pred_api.graphql('query { x }', post=reply(body), token=TOKEN)

    def test_metadata_without_statistics_still_works(self):
        body = {'data': {'heroes': [{'slug': 'kira', 'name': 'Kira'}]}}
        self.assertEqual(pred_api.graphql('query { heroes { slug } }', post=reply(body), token=TOKEN)['heroes'][0]['slug'], 'kira')


class ApprovalGate(unittest.TestCase):
    def test_credentials_alone_do_not_enable_the_api(self):
        self.assertFalse(m.pred_api_approved())   # free_hosting.json: Pred.gg has not approved yet
        self.assertIsNone(m.pred_source_fetch({'PRED_API_TOKEN': TOKEN}))

    def test_approval_and_credentials_enable_the_api(self):
        with patch.object(m, 'pred_api_approved', return_value=True), tempfile.TemporaryDirectory() as d, patch.object(m, 'DATA_DIR', Path(d)):
            self.assertIsNotNone(m.pred_source_fetch({'PRED_API_TOKEN': TOKEN}))


class DenialIsRemembered(unittest.TestCase):
    def test_a_denial_stops_the_api_for_these_credentials_until_they_change(self):
        forbidden = lambda payload, headers, **kw: (200, json.dumps({'errors': [{'message': 'Forbidden'}], 'data': None}).encode())
        with patch.object(m, 'pred_api_approved', return_value=True), tempfile.TemporaryDirectory() as d, patch.object(m, 'DATA_DIR', Path(d)), \
                patch.object(pred_api, '_post', forbidden), patch.object(m, 'http_get', return_value=('<html></html>', 200, 0.1)) as public:
            fetch = m.pred_source_fetch({'PRED_API_TOKEN': TOKEN})
            fetch('https://pred.gg/heroes')
            self.assertEqual(fetch.api_failed, ['PredApiUnauthorized'])
            self.assertEqual(public.call_count, 1)   # the run continued on the public pages
            self.assertTrue((Path(d) / 'pred-api-denied.json').exists())
            self.assertNotIn(TOKEN, (Path(d) / 'pred-api-denied.json').read_text(encoding='utf8'))   # never the credential itself
            self.assertIsNone(m.pred_source_fetch({'PRED_API_TOKEN': TOKEN}))          # the next run does not ask again
            self.assertIsNotNone(m.pred_source_fetch({'PRED_API_TOKEN': 'a-new-token'}))  # new credentials may try


if __name__ == '__main__':
    unittest.main()
