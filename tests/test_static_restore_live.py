"""Freshness Phase 2 (2.43.0): a lost Actions cache restores the live publication, never an older date.

Before, a run that found no .cloud-state restored only the committed Gold+ seed (8 Sep, patch 1.16.4) and the Windows
feed; anything newer that the cloud itself had published was lost, and the empty state started a full collection at once."""
import copy, gzip, hashlib, json, tempfile, unittest
from pathlib import Path
import static_publish as sp

ROOT = Path(__file__).resolve().parents[1]
SITE = 'https://example.test/predecessor-meta/'


def seed_bundle():
    return json.loads(gzip.decompress((ROOT / 'public-seed-gold.json.gz').read_bytes()))


def live_site(bundle, *, tamper=False):
    """A fake live site: manifest + one checksum-named Gold+ bundle, served from a dict."""
    raw = json.dumps(bundle, ensure_ascii=False, separators=(',', ':')).encode('utf8')
    sha = hashlib.sha256(raw).hexdigest()
    url = 'bundles/gold-' + sha + '.json'
    manifest = {'schema': 1, 'published_at': '2026-10-02T04:01:09+00:00', 'app': {'version': '2.42.0'},
                'last_full_attempt_at': '2026-10-01T16:56:49-05:00', 'next_expected_attempt_at': '2026-10-02T17:23:00+00:00',
                'patch_check': {'status': 'verified', 'checked_at': '2026-10-02T04:01:09+00:00', 'version': '1.16.4', 'signature': 'sig'},
                'last_verified_patch_check': {'status': 'verified', 'checked_at': '2026-10-02T04:01:09+00:00', 'version': '1.16.4', 'signature': 'sig'},
                'local_collector': {'checked_at': '2026-10-01T22:57:21-05:00', 'status': 'connected', 'results': {}},
                'required_retry': {'pending': False, 'blocked': False, 'attempts': 0, 'limit': 2, 'next_at': None, 'reason': None},
                'cohorts': {'gold': {'label': 'Gold+', 'url': url, 'sha256': sha, 'generated_at': bundle['generated_at'], 'status': 'available',
                                     'source_signature': 'sig', 'last_attempt': {'status': 'ok', 'at': bundle['generated_at'], 'seconds': 201.9, 'errors': []}}}}
    files = {SITE + 'manifest.json': json.dumps(manifest).encode('utf8'), SITE + url: (raw + b' ') if tamper else raw}
    return manifest, (lambda u: files[u])


class RestoreLiveState(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.bundle = seed_bundle()
        # Pretend the live publication is newer than the committed seed, as it always is in production.
        self.bundle['generated_at'] = '2026-10-01T17:00:11-05:00'

    def test_missing_state_restores_the_live_publication_with_its_dates(self):
        manifest, fetch = live_site(self.bundle)
        report = sp.restore_from_live(self.dir, SITE, fetch=fetch)
        self.assertEqual(report['restored'], ['gold'])
        stored = sp.load_publication(self.dir, 'gold')
        self.assertEqual(stored['generated_at'], '2026-10-01T17:00:11-05:00')
        state = json.loads((self.dir / 'publication.json').read_text(encoding='utf8'))
        for key in ('last_full_attempt_at', 'patch_check', 'last_verified_patch_check', 'local_collector', 'required_retry'):
            self.assertEqual(state[key], manifest[key], key)
        self.assertEqual(state['last_attempted_signature'], 'sig')
        self.assertEqual(state['attempts']['gold']['status'], 'ok')
        self.assertTrue(state['restored_from_live']['at'])
        # The committed seed (8 Sep) is older, so importing it afterwards changes nothing.
        self.assertFalse(sp.import_public_seed(ROOT / 'public-seed-gold.json.gz', self.dir))
        self.assertEqual(sp.load_publication(self.dir, 'gold')['generated_at'], '2026-10-01T17:00:11-05:00')

    def test_existing_state_is_never_touched(self):
        (self.dir / 'publication.json').write_text('{"schema": 1, "attempts": {}, "marker": 1}', encoding='utf8')
        _, fetch = live_site(self.bundle)
        self.assertEqual(sp.restore_from_live(self.dir, SITE, fetch=fetch)['restored'], [])
        self.assertEqual(json.loads((self.dir / 'publication.json').read_text(encoding='utf8'))['marker'], 1)

    def test_a_bundle_that_fails_its_checksum_is_not_restored(self):
        _, fetch = live_site(self.bundle, tamper=True)
        report = sp.restore_from_live(self.dir, SITE, fetch=fetch)
        self.assertEqual(report['restored'], [])
        self.assertIn('gold', report['rejected'])
        self.assertIsNone(sp.load_publication(self.dir, 'gold'))
        self.assertFalse((self.dir / 'publication.json').exists())   # nothing restored: the seed path stays in charge

    def test_an_unreachable_site_changes_nothing(self):
        def fetch(url):
            raise OSError('offline')
        report = sp.restore_from_live(self.dir, SITE, fetch=fetch)
        self.assertEqual(report['restored'], [])
        self.assertFalse((self.dir / 'publication.json').exists())


if __name__ == '__main__':
    unittest.main()
