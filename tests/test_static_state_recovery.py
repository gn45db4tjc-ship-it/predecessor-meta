"""Corrupt cached state and partial live recovery (Codex audit #239 F4, F5; PRED-M11).

F4: a truncated publication.json in the restored Actions cache suppressed live recovery (its presence meant "state
exists"), then stopped the publisher when parsed, and was saved again under a key the next run restores. F5: after a
cache eviction, a restore that recovered Gold+ but rejected Silver+ copied the collection clock and wrote state, so the
next publish could replace the working site with Silver+ missing, and later runs never retried the restore.
"""
import copy
import datetime as dt
import gzip
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import import_local_feed as feed
import static_publish as sp

ROOT = Path(__file__).resolve().parents[1]
SITE = 'https://example.test/predecessor-meta/'
GOLD_AT = '2026-10-01T17:00:11-05:00'
SILVER_AT = '2026-10-01T16:40:02-05:00'


def seed():
    return json.loads(gzip.decompress((ROOT / 'public-seed-gold.json.gz').read_bytes()))


def bundles():
    gold = seed(); gold['generated_at'] = GOLD_AT
    silver = copy.deepcopy(gold); silver['generated_at'] = SILVER_AT
    silver['bracket'] = dict(silver['bracket'], segment='silver', label='Silver+', statz_ranked_field=['Silver'])
    return {'gold': gold, 'silver': silver}


def live_site(live, broken=()):
    """A fake live site serving each bundle under its checksum name; ranks in `broken` serve other bytes."""
    files, cohorts = {}, {}
    for rank, bundle in live.items():
        raw = json.dumps(bundle, ensure_ascii=False, separators=(',', ':')).encode('utf8')
        sha = hashlib.sha256(raw).hexdigest()
        url = 'bundles/%s-%s.json' % (rank, sha)
        files[SITE + url] = raw + b' ' if rank in broken else raw
        cohorts[rank] = {'url': url, 'sha256': sha, 'generated_at': bundle['generated_at'], 'status': 'available',
                         'source_signature': 'sig', 'last_attempt': {'status': 'ok', 'at': bundle['generated_at'], 'errors': []}}
    manifest = {'schema': 2, 'published_at': '2026-10-02T04:01:09+00:00', 'last_full_attempt_at': '2026-10-01T16:56:49-05:00',
                'patch_check': {'status': 'verified', 'version': '1.16.4', 'signature': 'sig'}, 'cohorts': cohorts}
    files[SITE + 'manifest.json'] = json.dumps(manifest).encode('utf8')
    return lambda u: files[u]


class CorruptState(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())

    def write(self, text):
        (self.dir / 'publication.json').write_text(text, encoding='utf8')

    def test_truncated_state_is_set_aside_and_recovered_from_the_live_site(self):
        self.write('{"schema": 1, "attempts": {"gold": {"status": "ok"')
        report = sp.restore_from_live(self.dir, SITE, fetch=live_site(bundles()))
        self.assertEqual(report['restored'], ['gold', 'silver'])
        state = sp.load_state(self.dir)
        self.assertEqual(state['last_full_attempt_at'], '2026-10-01T16:56:49-05:00')
        self.assertEqual(sp.load_publication(self.dir, 'silver')['generated_at'], SILVER_AT)
        self.assertNotIn('live_recovery', state)
        self.assertEqual(len(list(self.dir.glob('publication.json.invalid-*'))), 1)

    def test_a_failed_restore_after_truncation_leaves_the_next_run_eligible(self):
        self.write('{"schema": 1, "atte')
        def offline(url):
            raise OSError('offline')
        sp.restore_from_live(self.dir, SITE, fetch=offline)
        self.assertEqual(list(sp.load_state(self.dir)['live_recovery']['pending']), ['*'])
        self.assertEqual(sp.restore_from_live(self.dir, SITE, fetch=live_site(bundles()))['restored'], ['gold', 'silver'])
        self.assertNotIn('live_recovery', sp.load_state(self.dir))
        self.assertEqual(sp.load_publication(self.dir, 'gold')['generated_at'], GOLD_AT)

    def test_wrong_shapes_are_set_aside(self):
        for text in ('[1]', '{"attempts": [1]}', '{"attempts": {"gold": 3}}', '{"required_retry": "x"}',
                     '{"last_full_attempt_at": 5}', '{"live_recovery": {"pending": ["gold"]}}'):
            self.write(text)
            self.assertIsNone(sp.load_state(self.dir), text)
            self.assertFalse((self.dir / 'publication.json').exists(), text)

    def test_valid_state_is_kept_and_restore_leaves_it_alone(self):
        self.write('{"schema": 1, "attempts": {}, "marker": 1}')
        self.assertEqual(sp.restore_from_live(self.dir, SITE, fetch=live_site(bundles()))['restored'], [])
        self.assertEqual(sp.load_state(self.dir)['marker'], 1)

    def test_the_windows_importer_does_not_crash_on_truncated_state(self):
        self.write('{"schema": 1, "att')
        folder = Path(tempfile.mkdtemp())
        (folder / 'collector.json').write_text('{"schema": 1, "bundles": []}', encoding='utf8')
        self.assertEqual(feed.import_feed(folder, self.dir)['status'], 'rejected')


class PartialRecovery(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.live = bundles()

    def test_a_rejected_rank_holds_deployment_and_is_restored_on_replay(self):
        report = sp.restore_from_live(self.dir, SITE, fetch=live_site(self.live, broken={'silver'}))
        self.assertEqual((report['restored'], sorted(report['rejected'])), (['gold'], ['silver']))
        state = sp.load_state(self.dir)
        self.assertEqual(state['live_recovery']['pending'], {'silver': SILVER_AT})
        self.assertEqual(sp.held_ranks(self.dir, state), ['silver'])
        # Replay with valid Silver+ bytes: both ranks are present with their original dates, nothing is held.
        self.assertEqual(sp.restore_from_live(self.dir, SITE, fetch=live_site(self.live))['restored'], ['silver'])
        state = sp.load_state(self.dir)
        self.assertNotIn('live_recovery', state)
        self.assertEqual(sp.held_ranks(self.dir, state), [])
        self.assertEqual({r: sp.load_publication(self.dir, r)['generated_at'] for r in ('gold', 'silver')},
                         {'gold': GOLD_AT, 'silver': SILVER_AT})

    def test_an_older_seed_is_not_a_replacement_for_a_newer_live_rank(self):
        sp.restore_from_live(self.dir, SITE, fetch=live_site({'gold': self.live['gold']}, broken={'gold'}))
        sp.import_public_seed(ROOT / 'public-seed-gold.json.gz', self.dir)
        self.assertIsNotNone(sp.load_publication(self.dir, 'gold'))
        self.assertEqual(sp.held_ranks(self.dir, sp.load_state(self.dir)), ['gold'])

    def test_the_hold_ends_after_its_window(self):
        sp.restore_from_live(self.dir, SITE, fetch=live_site(self.live, broken={'silver'}))
        state = sp.load_state(self.dir)
        later = sp.utc_time(state['live_recovery']['since']) + dt.timedelta(hours=25)
        self.assertEqual(sp.held_ranks(self.dir, state, now=later), [])

    def test_render_site_publishes_nothing_while_a_rank_is_held(self):
        sp.restore_from_live(self.dir, SITE, fetch=live_site(self.live, broken={'silver'}))
        out = Path(tempfile.mkdtemp())
        with mock.patch.object(sp, 'output_flag') as flag:
            manifest = sp.render_site(self.dir, out, sp.load_state(self.dir))
        self.assertEqual(manifest['deploy_held']['ranks'], ['silver'])
        flag.assert_any_call('publishable', False)
        self.assertFalse((out / 'manifest.json').exists())


if __name__ == '__main__':
    unittest.main()
