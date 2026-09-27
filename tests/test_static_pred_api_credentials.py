"""Pred.gg application credentials are exchanged for one access token per run; synthetic, no network.

Pred.gg's access tokens expire (its own client refreshes them), so a daily job sends PRED_API_CLIENT_ID and
PRED_API_CLIENT_SECRET to pred.gg/api/oauth2/token each run. A fixed PRED_API_TOKEN still works as given.
"""
import base64
import email.message
import io
import json
import os
import tempfile
import unittest
import urllib.error
import urllib.parse
from pathlib import Path
from unittest.mock import Mock, patch

import predecessor_meta as m
import pred_api
import static_publish as p
from test_static_publish import official, NOW
from test_static_independent_sources import partial

FIX = Path(__file__).parent / 'fixtures'
CATALOG = json.loads((FIX / 'pred-api-catalog.json').read_text(encoding='utf-8'))['data']
CREDS = {'PRED_API_CLIENT_ID': 'client-id', 'PRED_API_CLIENT_SECRET': 'client-secret-value'}
ISSUED = {'access_token': 'issued-access-token', 'token_type': 'Bearer', 'expires_in': 3600}


class FakePred:
    """Pred.gg's token endpoint and GraphQL API, recording each request."""
    def __init__(self, token_reply=(200, ISSUED)):
        self.token_reply, self.token_calls, self.api_calls = token_reply, [], []

    def __call__(self, body, headers, timeout=60, url=pred_api.API_URL):
        if url == pred_api.TOKEN_URL:
            self.token_calls.append((body, headers))
            status, payload = self.token_reply
            return status, json.dumps(payload).encode()
        self.api_calls.append(headers)
        return 200, json.dumps({'data': CATALOG}).encode()


class Exchange(unittest.TestCase):
    def test_credentials_go_to_the_token_endpoint_as_http_basic(self):
        fake = FakePred()
        with patch.object(pred_api, '_post', fake):
            token = pred_api.client_credentials_token('client-id', 'client-secret-value')
        self.assertEqual(token, 'issued-access-token')
        body, headers = fake.token_calls[0]
        self.assertEqual(urllib.parse.parse_qs(body.decode()), {'grant_type': ['client_credentials']})
        self.assertEqual(base64.b64decode(headers['Authorization'].split(' ', 1)[1]).decode(), 'client-id:client-secret-value')
        self.assertEqual(headers['Content-Type'], 'application/x-www-form-urlencoded')
        self.assertEqual(fake.api_calls, [])

    def test_a_refusal_names_the_reason_but_never_the_secret(self):
        for reply in ((401, {'error': 'invalid_client'}), (400, {'error': 'unsupported_grant_type'})):
            with patch.object(pred_api, '_post', FakePred(reply)), self.assertRaises(pred_api.PredApiUnauthorized) as caught:
                pred_api.client_credentials_token('client-id', 'client-secret-value')
            self.assertIn(reply[1]['error'], str(caught.exception))
            self.assertNotIn('client-secret-value', str(caught.exception))

    def test_an_http_error_from_the_transport_is_a_refusal(self):
        error = urllib.error.HTTPError(pred_api.TOKEN_URL, 401, 'Unauthorized', email.message.Message(), io.BytesIO(b'{"error":"invalid_client"}'))
        with patch.object(pred_api, '_post', Mock(side_effect=error)), self.assertRaisesRegex(pred_api.PredApiUnauthorized, 'invalid_client'):
            pred_api.client_credentials_token('client-id', 'client-secret-value')

    def test_a_reply_without_a_bearer_token_is_rejected(self):
        for payload in ({}, {'access_token': ''}, dict(ISSUED, token_type='mac')):
            with patch.object(pred_api, '_post', FakePred((200, payload))), self.assertRaises(pred_api.PredApiError):
                pred_api.client_credentials_token('client-id', 'client-secret-value')


class Configuration(unittest.TestCase):
    def test_a_token_or_both_credentials_turn_the_api_on(self):
        self.assertFalse(m.pred_api_configured({}))
        self.assertFalse(m.pred_api_configured({'PRED_API_CLIENT_ID': 'client-id'}))
        self.assertFalse(m.pred_api_configured({'PRED_API_CLIENT_ID': 'client-id', 'PRED_API_CLIENT_SECRET': ' '}))
        self.assertTrue(m.pred_api_configured(CREDS))
        self.assertTrue(m.pred_api_configured({'PRED_API_TOKEN': 'fixed-token'}))

    def test_a_given_token_is_used_without_an_exchange(self):
        fake = FakePred()
        with patch.object(pred_api, '_post', fake):
            self.assertEqual(pred_api.token_for_run(dict(CREDS, PRED_API_TOKEN='fixed-token')), 'fixed-token')
            self.assertIsNone(pred_api.token_for_run({'PRED_API_CLIENT_ID': 'client-id'}))
        self.assertEqual(fake.token_calls, [])


class CollectionWithCredentials(unittest.TestCase):
    def setUp(self):
        self.pages = patch.object(m, 'http_get', Mock(return_value=('<html></html>', 200, 0.1)))
        self.http_get = self.pages.start(); self.addCleanup(self.pages.stop)

    def test_one_exchange_serves_every_request_of_the_run(self):
        fake = FakePred()
        with patch.object(pred_api, '_post', fake):
            fetch = m.pred_source_fetch(CREDS)
            for url in ('/heroes', '/items?version=168', '/eternals?version=168'):
                fetch(m.PRED_BASE + url)
        self.assertEqual(len(fake.token_calls), 1)
        self.assertEqual([h['Authorization'] for h in fake.api_calls], ['Bearer issued-access-token'] * 3)
        self.http_get.assert_not_called()

    def test_refused_credentials_move_the_run_to_the_public_pages(self):
        fake = FakePred((401, {'error': 'invalid_client'}))
        with patch.object(pred_api, '_post', fake):
            fetch = m.pred_source_fetch(CREDS)
            fetch(m.PRED_BASE + '/heroes'); fetch(m.PRED_BASE + '/items?version=168')
        self.assertEqual(len(fake.token_calls), 1)
        self.assertEqual(fake.api_calls, [])
        self.assertEqual(self.http_get.call_count, 2)
        self.assertEqual(fetch.api_failed, ['PredApiUnauthorized'])


class PublishedSettings(unittest.TestCase):
    def test_credentials_alone_publish_the_api_note(self):
        root = Path(tempfile.mkdtemp(prefix='predcreds-'))
        def collect(settings, progress):
            b = partial(); b['bracket']['segment'] = settings['bracket']
            return b
        with patch.dict(os.environ, CREDS), patch.dict(os.environ, {'PRED_API_TOKEN': ''}), \
             patch.object(p.base, 'fetch_official', return_value=official()), \
             patch.object(p.base, 'now_utc', return_value=NOW), \
             patch.object(p.base, 'collect_bundle', side_effect=collect):
            pred = p.run(root, root / 'site')['optional_sources']['pred']
        self.assertEqual(pred['mode'], 'authorized_api_then_public_pages')
        self.assertNotIn('client-secret-value', json.dumps(pred))

    def test_the_workflow_passes_the_credentials_to_collection_only(self):
        workflow = (Path(__file__).parents[1] / '.github' / 'workflows' / 'publish.yml').read_text(encoding='utf-8')
        step = workflow.split('- name: Collect only when due', 1)[1].split('\n      - name:', 1)[0]
        for name in ('PRED_API_CLIENT_ID', 'PRED_API_CLIENT_SECRET'):
            line = name + ': ${{ secrets.' + name + ' }}'
            self.assertEqual(workflow.count(name), 2)
            self.assertIn(line, step)


if __name__ == '__main__':
    unittest.main()
