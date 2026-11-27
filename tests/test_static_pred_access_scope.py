"""Pred.gg credential generations and per-transport access stops (Codex audit #239 F8, F9; PRED-M11).

F8: a refused client-secret exchange was remembered by client ID alone, so rotating the secret never tried again; an
expired direct token (HTTP 401) fell back without a saved denial, so every later adapter asked again; and a healthy
public fallback hid both from collection status. F9: a saved public-page access stop paused the approved API too.
"""
import json
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch

import predecessor_meta as m
import pred_api

CREDS = {'PRED_API_CLIENT_ID': 'client-not-real', 'PRED_API_CLIENT_SECRET': 'secret-one-not-real'}
PAGE = ('<script type="application/json" data-sveltekit-fetched data-url="/gql">{}</script>', 200, 0.1)


class CredentialGeneration(unittest.TestCase):
    def test_rotating_the_secret_is_a_new_generation(self):
        rotated = dict(CREDS, PRED_API_CLIENT_SECRET='secret-two-not-real')
        self.assertNotEqual(m.pred_api_fingerprint(CREDS), m.pred_api_fingerprint(rotated))
        self.assertNotIn('secret', m.pred_api_fingerprint(CREDS))

    def test_a_refused_exchange_does_not_hold_back_a_rotated_secret(self):
        refused = lambda body, headers: (401, b'{"error": "invalid_client"}')
        with patch.object(m, 'pred_api_approved', return_value=True), tempfile.TemporaryDirectory() as d, \
                patch.object(m, 'DATA_DIR', Path(d)), patch.object(pred_api, '_post', lambda b, h, url=None, **k: refused(b, h)), \
                patch.object(m, 'http_get', return_value=PAGE):
            first = m.pred_source_fetch(CREDS)
            first('https://pred.gg/heroes')
            self.assertEqual(first.api_failed, ['PredApiUnauthorized'])
            self.assertEqual(m.pred_source_fetch(CREDS).api_failed, ['denied earlier for these credentials'])
            self.assertEqual(m.pred_source_fetch(dict(CREDS, PRED_API_CLIENT_SECRET='secret-two-not-real')).api_failed, [])

    def test_an_expired_token_is_a_remembered_refusal(self):
        def expired(body, headers, **kw):
            raise urllib.error.HTTPError(pred_api.API_URL, 401, 'Unauthorized', {}, None)
        with self.assertRaises(pred_api.PredApiUnauthorized):
            pred_api.graphql('query { heroes { slug } }', token='old', post=expired)
        with patch.object(m, 'pred_api_approved', return_value=True), tempfile.TemporaryDirectory() as d, \
                patch.object(m, 'DATA_DIR', Path(d)), patch.object(pred_api, '_post', expired), patch.object(m, 'http_get', return_value=PAGE):
            fetch = m.pred_source_fetch({'PRED_API_TOKEN': 'old-token-not-real'})
            fetch('https://pred.gg/heroes')
            self.assertTrue((Path(d) / 'pred-api-denied.json').exists())
            self.assertEqual(m.pred_source_fetch({'PRED_API_TOKEN': 'old-token-not-real'}).api_failed, ['denied earlier for these credentials'])

    def test_the_api_failure_is_recorded_redacted(self):
        fetch = lambda url: None
        fetch.api_failed = ['PredApiUnauthorized']
        note = m.pred_api_health(fetch)
        self.assertEqual((note['source'], note['severity']), ('Pred.gg API', 'warning'))
        self.assertIn('PredApiUnauthorized', note['detail'])
        fetch.api_failed = []
        self.assertIsNone(m.pred_api_health(fetch))
        self.assertIsNone(m.pred_api_health(None))


class PerTransportStop(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        (self.dir / 'public-access.json').write_text(json.dumps({'schema': 1, 'status': 'blocked', 'checked_at': '2026-11-20T00:00:00+00:00',
                                                                  'reason': 'HTTP 403'}), encoding='utf-8')

    def api(self, failed=()):
        calls = []
        def fetch(url):
            calls.append(url)
            return PAGE
        fetch.api_failed = list(failed)
        return fetch, calls

    def test_a_public_stop_still_lets_the_approved_api_answer(self):
        fetch, calls = self.api()
        pages = m.PredPages(cache_dir=self.dir, fetch=fetch, sleep=lambda s: None)
        self.assertIsNone(pages.paused_reason)
        try:
            pages.get('https://pred.gg/heroes')
        except ValueError:
            pass   # the stub page has no payloads; the request itself was sent to the API
        self.assertEqual(calls, ['https://pred.gg/heroes'])

    def test_with_the_api_failed_the_public_stop_holds(self):
        fetch, calls = self.api(['PredApiError'])
        pages = m.PredPages(cache_dir=self.dir, fetch=fetch, sleep=lambda s: None)
        with self.assertRaisesRegex(m.FetchError, 'paused'):
            pages.get('https://pred.gg/heroes')
        self.assertEqual(calls, [])
        self.assertTrue(fetch.public_blocked())

    def test_the_api_fallback_sends_no_public_request_under_a_stop(self):
        failing = lambda b, h, **k: (500, b'')
        with patch.object(m, 'pred_api_approved', return_value=True), tempfile.TemporaryDirectory() as d, \
                patch.object(m, 'DATA_DIR', Path(d)), patch.object(pred_api, '_post', failing), \
                patch.object(m, 'http_get', side_effect=AssertionError('a public request was sent')):
            fetch = m.pred_source_fetch({'PRED_API_TOKEN': 'token-not-real'})
            m.PredPages(cache_dir=self.dir, fetch=fetch, sleep=lambda s: None)
            with self.assertRaisesRegex(m.FetchError, 'no public request was sent'):
                fetch('https://pred.gg/heroes')

    def test_without_the_api_a_public_stop_pauses_everything(self):
        pages = m.PredPages(cache_dir=self.dir, fetch=lambda url: PAGE, sleep=lambda s: None)
        self.assertIn('Public access stopped', pages.paused_reason)



class ApiFailureNamedInStatus(unittest.TestCase):
    """Codex repro of audit #239 case 8: an expired token's HTTP 401 must show in the collection status, by name."""

    def test_a_401_shows_in_the_bundle_errors_once_and_without_the_token(self):
        token = 'expired-token-not-real'

        def expired(body, headers, **kw):
            raise urllib.error.HTTPError(pred_api.API_URL, 401, 'Unauthorized', {}, None)
        bundle = {'errors': [], 'sources': {}}
        with patch.object(m, 'pred_api_approved', return_value=True), tempfile.TemporaryDirectory() as d, \
                patch.object(m, 'DATA_DIR', Path(d)), patch.object(pred_api, '_post', expired), patch.object(m, 'http_get', return_value=PAGE):
            fetch = m.pred_source_fetch({'PRED_API_TOKEN': token})
            pages = m.PredPages(cache_dir=Path(d) / 'pages', fetch=fetch)
            fetch('https://pred.gg/heroes')                     # the API answers 401; the public page answers
            m.attach_scoped_statistics(bundle, pages=pages)
            m.note_pred_api_health(bundle, fetch)               # collect_bundle adds it again; it stays one entry
        notes = [e for e in bundle['errors'] if e.get('source') == 'Pred.gg API']
        self.assertEqual(len(notes), 1)
        self.assertIn('HTTP 401', notes[0]['detail'])
        self.assertNotIn(token, json.dumps(bundle))


if __name__ == '__main__':
    unittest.main()
