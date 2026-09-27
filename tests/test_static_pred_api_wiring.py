"""Collection reads Pred.gg's authorized API only when an application token is configured; synthetic, no network.

Without PRED_API_TOKEN nothing changes (public pages). With it, every Pred.gg URL goes to the API first; any API failure
moves the rest of the run to the public pages and never pauses the page reader.
"""
import email.message
import json
import os
import sys
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import Mock, patch

import predecessor_meta as m
import pred_api
import static_publish as p
from test_static_publish import official, NOW
from test_static_independent_sources import partial

FIX = Path(__file__).parent / 'fixtures'
CATALOG = json.loads((FIX / 'pred-api-catalog.json').read_text(encoding='utf-8'))['data']
TOKEN = 'test-application-token'
FORBIDDEN = (200, json.dumps({'errors': [{'message': 'Forbidden'}], 'data': None}).encode())


def api_page():
    return pred_api.page_fetch(m.PRED_BASE + '/heroes', token=TOKEN, post=lambda body, headers: (200, json.dumps({'data': CATALOG}).encode()))


class TokenGate(unittest.TestCase):
    def test_no_or_blank_token_keeps_the_public_page_reader(self):
        self.assertIsNone(m.pred_source_fetch({}))
        self.assertIsNone(m.pred_source_fetch({'PRED_API_TOKEN': '  '}))

    def test_a_missing_api_module_keeps_the_public_page_reader(self):
        with patch.dict(sys.modules, {'pred_api': None}):
            self.assertIsNone(m.pred_source_fetch({'PRED_API_TOKEN': TOKEN}))

    def test_collection_uses_the_gate(self):
        import inspect
        self.assertIn('fetch=pred_source_fetch()', inspect.getsource(m.collect_bundle))


class ApiFirst(unittest.TestCase):
    def setUp(self):
        self.pages_get = patch.object(m, 'http_get', Mock(return_value=(api_page()[0], 200, 0.1)))
        self.http_get = self.pages_get.start(); self.addCleanup(self.pages_get.stop)
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)

    def test_the_api_answers_and_the_token_goes_only_to_the_api(self):
        seen = []
        def post(body, headers):
            seen.append(headers); return 200, json.dumps({'data': CATALOG}).encode()
        with patch.object(pred_api, '_post', post):
            fetch = m.pred_source_fetch({'PRED_API_TOKEN': TOKEN})
            html, status, _ = fetch(m.PRED_BASE + '/heroes')
        self.assertEqual(status, 200)
        self.assertIn('data-sveltekit-fetched', html)
        self.assertEqual(seen[0]['Authorization'], 'Bearer ' + TOKEN)
        self.http_get.assert_not_called()
        self.assertEqual(fetch.api_failed, [])

    def test_a_refused_token_moves_the_rest_of_the_run_to_the_public_pages(self):
        post = Mock(return_value=FORBIDDEN)
        with patch.object(pred_api, '_post', post):
            fetch = m.pred_source_fetch({'PRED_API_TOKEN': TOKEN})
            fetch(m.PRED_BASE + '/heroes?versions=168&gameMode=RANKED&ranks=29&role=JUNGLE')
            fetch(m.PRED_BASE + '/heroes?versions=168&gameMode=RANKED&ranks=29&role=CARRY')
        self.assertEqual(post.call_count, 1)
        self.assertEqual(self.http_get.call_count, 2)
        self.assertEqual(fetch.api_failed, ['PredApiUnauthorized'])

    def test_an_api_http_denial_never_pauses_the_page_reader(self):
        for code in (401, 403, 429):
            error = urllib.error.HTTPError(pred_api.API_URL, code, 'denied', email.message.Message(), None)
            cache = Path(self.tmp.name) / str(code)
            with patch.object(pred_api, '_post', Mock(side_effect=error)):
                pages = m.PredPages(force=True, cache_dir=cache, fetch=m.pred_source_fetch({'PRED_API_TOKEN': TOKEN}))
                record = pages.get(m.PRED_BASE + '/heroes', ttl=0)
            self.assertTrue(record['payloads'])
            self.assertFalse((cache / 'public-access.json').exists())
            self.assertIsNone(pages.paused_reason)
            self.assertFalse(pages.blocked.is_set())

    def test_an_unreachable_api_falls_back(self):
        with patch.object(pred_api, '_post', Mock(side_effect=urllib.error.URLError('no route'))):
            fetch = m.pred_source_fetch({'PRED_API_TOKEN': TOKEN})
            fetch(m.PRED_BASE + '/heroes')
        self.assertEqual(fetch.api_failed, ['URLError'])
        self.http_get.assert_called_once()

    def test_the_token_is_never_saved_in_the_page_cache(self):
        with patch.object(pred_api, '_post', lambda body, headers: (200, json.dumps({'data': CATALOG}).encode())):
            pages = m.PredPages(force=True, cache_dir=self.tmp.name, fetch=m.pred_source_fetch({'PRED_API_TOKEN': TOKEN}))
            pages.get(m.PRED_BASE + '/heroes', ttl=0)
        saved = [f.read_text(encoding='utf-8') for f in Path(self.tmp.name).glob('*.json')]
        self.assertTrue(saved)
        self.assertFalse(any(TOKEN in text for text in saved))


class PublishedSourceNote(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)

    def run_cloud(self, environ):
        def collect(settings, progress):
            b = partial(); b['bracket']['segment'] = settings['bracket']
            return b
        with patch.dict(os.environ, environ), \
             patch.object(p.base, 'fetch_official', return_value=official()), \
             patch.object(p.base, 'now_utc', return_value=NOW), \
             patch.object(p.base, 'collect_bundle', side_effect=collect):
            return p.run(self.root, self.root / 'site')['optional_sources']['pred']

    def test_the_site_states_which_pred_source_the_collector_used(self):
        with_token = self.run_cloud({'PRED_API_TOKEN': TOKEN})
        self.assertEqual(with_token['mode'], 'authorized_api_then_public_pages')
        self.assertIn('authorized application', with_token['note'])
        self.assertNotIn(TOKEN, json.dumps(with_token))

    def test_the_workflow_passes_the_secret_to_collection_only(self):
        workflow = (Path(__file__).parents[1] / '.github' / 'workflows' / 'publish.yml').read_text(encoding='utf-8')
        self.assertEqual(workflow.count('PRED_API_TOKEN'), 2)
        self.assertEqual(workflow.count('PRED_API_TOKEN: ${{ secrets.PRED_API_TOKEN }}'), 1)
        step = workflow.split('- name: Collect only when due', 1)[1].split('\n      - name:', 1)[0]
        self.assertIn('PRED_API_TOKEN: ${{ secrets.PRED_API_TOKEN }}', step)


if __name__ == '__main__':
    unittest.main()
