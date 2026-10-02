"""Freshness Phase 2 (2.43.0): the Windows app says when the website runs a newer version.

Installs are manual, and an old collector rejects a newer guidance packet, so a quiet version gap leaves data stale.
The app shows a notice only; nothing installs."""
import json, time, unittest
import predecessor_meta as m


def site(version):
    def fetch(url, timeout=None, retries=0):
        assert url == m.PUBLIC_SITE + 'manifest.json', url
        return json.dumps({'schema': 1, 'app': {'version': version}}).encode('utf8'), {}, 0.1
    return fetch


class WebsiteRelease(unittest.TestCase):
    def test_newer_website_version_is_reported(self):
        r = m.website_release(fetch=site('2.43.0'), current='2.42.0')
        self.assertEqual((r['version'], r['current'], r['newer']), ('2.43.0', '2.42.0', True))
        self.assertTrue(r['checked_at'])

    def test_same_or_older_website_is_not_newer(self):
        self.assertFalse(m.website_release(fetch=site('2.42.0'), current='2.42.0')['newer'])
        self.assertFalse(m.website_release(fetch=site('2.41.3'), current='2.42.0')['newer'])
        # numeric, not text, comparison
        self.assertTrue(m.website_release(fetch=site('2.42.10'), current='2.42.9')['newer'])

    def test_unreachable_or_invalid_website_reports_no_update(self):
        def offline(url, timeout=None, retries=0):
            raise OSError('offline')
        for fetch in (offline, site('not a version'), site(None)):
            r = m.website_release(fetch=fetch, current='2.42.0')
            self.assertFalse(r['newer'])
            self.assertIsNone(r['version'])
            self.assertTrue(r['error'])

    def test_local_status_carries_the_cached_result_and_never_blocks(self):
        app = m.AppState.__new__(m.AppState)
        app.no_fetch, app.lock = False, m.threading.Lock()
        app.website, app.website_at, app.website_running = {'version': '2.43.0', 'current': '2.42.0', 'newer': True}, time.time(), False
        self.assertTrue(app.website_release_state()['newer'])
        app.no_fetch = True   # developer --no-fetch never contacts the website
        self.assertIsNone(app.website_release_state())


if __name__ == '__main__':
    unittest.main()
