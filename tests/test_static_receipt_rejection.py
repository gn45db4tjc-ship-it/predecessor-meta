"""A malformed Windows receipt never stops the cloud publish (Codex audit #239 F3; PRED-M11).

publish.yml imports the Windows data branch before the cloud publisher runs. A collector.json whose `bundles` was a
list (or any other wrong shape) raised, the bash step stopped, and every hourly run read the same bad receipt, so
official checks and publication stayed stuck while the PC was off. The importer now checks the whole receipt first,
refuses it with its reason, changes nothing else, and exits 0 so the cloud path continues.
"""
import gzip
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import import_local_feed as feed
import static_publish as sp

ROOT = Path(__file__).resolve().parents[1]
GOOD = {'checked_at': '2026-11-26T20:00:00+00:00', 'status': 'connected', 'results': {'gold': 'imported'}}


class Rejection(unittest.TestCase):
    def setUp(self):
        self.feed, self.state = Path(tempfile.mkdtemp()), Path(tempfile.mkdtemp())
        sp.retain_publication(json.loads(gzip.decompress((ROOT / 'public-seed-gold.json.gz').read_bytes())), self.state)
        sp.write_json(self.state / 'publication.json', {'schema': 1, 'attempts': {'gold': {'status': 'ok', 'at': '2026-11-26T18:00:00+00:00'}},
                                                       'last_full_attempt_at': '2026-11-26T18:00:00+00:00', 'local_collector': GOOD})

    def receipt(self, value):
        (self.feed / 'collector.json').write_text(value if isinstance(value, str) else json.dumps(value), encoding='utf8')

    def test_each_wrong_shape_is_refused_with_its_reason_and_nothing_else_moves(self):
        base = {'schema': 1, 'checked_at': '2026-11-27T08:00:00+00:00', 'bundles': {}}
        cases = {'bundles list': dict(base, bundles=[]), 'not JSON': '{"schema": 1, "bun',
                 'not an object': [1], 'row not object': dict(base, bundles={'gold': 'gold.json'}),
                 'attempts list': dict(base, attempts=[1]), 'attempt not object': dict(base, attempts={'gold': 3}),
                 'errors not list': dict(base, attempts={'gold': {'errors': 'x'}}),
                 'error not object': dict(base, attempts={'gold': {'errors': ['x']}})}
        before_bundle = sp.load_publication(self.state, 'gold')['generated_at']
        for name, value in cases.items():
            with self.subTest(name):
                self.receipt(value)
                result = feed.import_feed(self.feed, self.state)
                self.assertEqual(result['status'], 'rejected')
                state = sp.load_state(self.state)
                self.assertEqual(state['local_collector'], GOOD)
                self.assertEqual(state['last_full_attempt_at'], '2026-11-26T18:00:00+00:00')
                self.assertEqual(state['local_receipt_rejected']['reason'], result['reason'])
                self.assertEqual(sp.load_publication(self.state, 'gold')['generated_at'], before_bundle)

    def test_the_command_exits_0_so_the_cloud_publisher_runs_next(self):
        self.receipt({'schema': 1, 'checked_at': '2026-11-27T08:00:00+00:00', 'bundles': []})
        done = subprocess.run([sys.executable, '-B', str(ROOT / 'import_local_feed.py'), str(self.feed), '--state-dir', str(self.state)],
                              capture_output=True, text=True, cwd=str(ROOT))
        self.assertEqual(done.returncode, 0, done.stderr)
        self.assertEqual(json.loads(done.stdout.strip().splitlines()[-1])['status'], 'rejected')

    def test_the_rejection_reaches_the_manifest_and_a_good_receipt_clears_it(self):
        self.receipt({'schema': 1, 'checked_at': '2026-11-27T08:00:00+00:00', 'bundles': []})
        feed.import_feed(self.feed, self.state)
        out = Path(tempfile.mkdtemp())
        with mock.patch.object(sp, 'output_flag'):
            manifest = sp.render_site(self.state, out, sp.load_state(self.state))
        self.assertEqual(manifest['local_receipt_rejected']['reason'], 'Local collector receipt schema changed')
        self.assertEqual(manifest['local_collector'], GOOD)
        self.assertEqual(manifest['cohorts']['gold']['status'], 'available')
        self.receipt({'schema': 1, 'checked_at': '2026-11-27T09:00:00+00:00', 'bundles': {}})
        self.assertEqual(feed.import_feed(self.feed, self.state)['status'], 'connected')
        self.assertNotIn('local_receipt_rejected', sp.load_state(self.state))


if __name__ == '__main__':
    unittest.main()
