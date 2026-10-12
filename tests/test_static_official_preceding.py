"""2.54.1: an older official article that fails to load keeps its last verified copy.

On 12 Oct 2026 at 08:03 UTC the Windows collector's patch check failed with "HTTP 404 for
.../Patch_Notes_1.16.4". The index listed 1.17.2 (announced for 13 Oct), 1.17 (live) and 1.16.4. 1.17 was already
confirmed live; 1.16.4 is fetched only as the comparison article, yet its one failed request failed the whole check,
so 1.17 could not be confirmed. The cloud's check four minutes later loaded the same page. The older article now keeps
its last verified copy with its original fetch date. The current article is never kept, a copy whose text no longer
matches its fingerprint is never used, an access answer still stops the check, and without a saved copy it fails as
before.
"""
import datetime as dt
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import predecessor_meta as m
import static_publish as s

NOW = dt.datetime(2026, 10, 12, 8, 3, tzinfo=dt.timezone.utc)
BASE = 'https://www.predecessorgame.com/en-US/news/patch-notes/'
URLS = {'1.17.2': BASE + 'Patch_Notes_1.17.2', '1.17': BASE + 'Patch_Notes_1.17', '1.16.4': BASE + 'Patch_Notes_1.16.4'}
INDEX = ''.join('<a href="/news/patch-notes/%s">%s</a>' % (u.rsplit('/', 1)[1], v) for v, u in URLS.items())
PAGES = {
    URLS['1.17.2']: '<h1>v1.17.2 Patch Notes</h1><p>Update 1.17.2 launches on 13th October 2026.</p>',
    URLS['1.17']: '<h1>V1.17: Bloodtide Patch Notes</h1><p>Update 1.17 is live on 22nd September 2026.</p>',
    URLS['1.16.4']: '<h1>V1.16.4 Patch Notes</h1><p>Update 1.16.4 is live on 1st September 2026.</p><h2>Hero Balance</h2>',
}
NO_STEAM = {'status': 'ok', 'entries': []}


class OlderArticle(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: [p.unlink() for p in self.dir.glob('*')])
        patcher = patch.object(m, 'DATA_DIR', self.dir); patcher.start(); self.addCleanup(patcher.stop)

    def fetch(self, failing=(), error=None):
        def get(url, **kw):
            if url == m.OFFICIAL_INDEX: return INDEX, 200, 0.01
            if url in failing: raise error or m.FetchError('HTTP 404 for ' + url)
            return PAGES[url], 200, 0.01
        with patch.object(m, 'now_utc', return_value=NOW), patch.object(m, 'http_get', side_effect=get), \
             patch.object(m, 'fetch_publisher_news', return_value=NO_STEAM), \
             patch.object(m, 'guidance_packet_path', return_value=Path('no-such-guidance.json')), \
             patch.object(m.time, 'sleep'):
            return m.fetch_official()

    def save(self, official, name='last_successful_gold.json'):
        (self.dir / name).write_text(json.dumps({'official': official}), encoding='utf-8')

    def earlier(self):
        o = self.fetch()
        for a in o['articles']: a['fetched_at'] = '2026-10-11T20:03:06+00:00'
        return o

    def test_a_failed_older_article_keeps_its_last_verified_copy(self):
        before = self.earlier(); self.save(before)
        o = self.fetch(failing={URLS['1.16.4']})
        self.assertEqual((o['status'], o['live']['version']), ('verified', '1.17'))
        kept = next(a for a in o['articles'] if a['version'] == '1.16.4')
        self.assertTrue(kept['kept_from_previous'])
        self.assertEqual(kept['fetched_at'], '2026-10-11T20:03:06+00:00')   # never stamped fresh
        self.assertIn('HTTP 404', kept['retrieval_error'])
        self.assertEqual(o['kept_articles'], [{'version': '1.16.4', 'url': URLS['1.16.4'], 'fetched_at': '2026-10-11T20:03:06+00:00',
                                               'error': 'HTTP 404 for ' + URLS['1.16.4']}])
        # The current article was fetched live in this check.
        self.assertNotIn('kept_from_previous', o['live'])
        # Same text, same patch signature: no false patch change and no needless collection.
        self.assertEqual(s.live_signature(o), s.live_signature(before))

    def test_the_kept_article_is_named_in_a_warning_once(self):
        self.save(self.earlier())
        o = self.fetch(failing={URLS['1.16.4']})
        bundle = {'official': o, 'guidance': {}, 'errors': []}
        with patch.object(m, 'guidance_packet_path', return_value=Path('no-such-guidance.json')):
            m.enrich_bundle(bundle, o); m.enrich_bundle(bundle, o)
        rows = [e for e in bundle['errors'] if e['source'] == 'Official patch notes (older article)']
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['severity'], 'warning')
        self.assertIn('v1.16.4', rows[0]['detail']); self.assertIn('2026-10-11T20:03:06+00:00', rows[0]['detail'])

    def test_without_a_saved_copy_the_check_still_fails(self):
        with self.assertRaisesRegex(m.FetchError, 'HTTP 404 for .*1.16.4'):
            self.fetch(failing={URLS['1.16.4']})

    def test_the_current_article_is_never_kept(self):
        self.save(self.earlier())
        with self.assertRaisesRegex(m.FetchError, 'HTTP 404 for .*Patch_Notes_1.17$'):
            self.fetch(failing={URLS['1.17']})

    def test_a_copy_whose_text_no_longer_matches_is_not_used(self):
        before = self.earlier()
        next(a for a in before['articles'] if a['version'] == '1.16.4')['blocks'].append(['p', 'edited'])
        self.save(before)
        with self.assertRaisesRegex(m.FetchError, 'HTTP 404'):
            self.fetch(failing={URLS['1.16.4']})

    def test_a_copy_of_another_url_is_not_used(self):
        before = self.earlier()
        next(a for a in before['articles'] if a['version'] == '1.16.4')['url'] = BASE + 'Patch_Notes_1.16.4_old'
        self.save(before)
        with self.assertRaisesRegex(m.FetchError, 'HTTP 404'):
            self.fetch(failing={URLS['1.16.4']})

    def test_an_access_answer_still_stops_the_check(self):
        self.save(self.earlier())
        with self.assertRaises(m.SourceBlocked):
            self.fetch(failing={URLS['1.16.4']}, error=m.SourceBlocked('HTTP 403 from ' + URLS['1.16.4']))

    def test_the_newest_saved_copy_is_used(self):
        older = self.earlier(); self.save(older, 'last_available_gold.json')
        newer = self.fetch()
        for a in newer['articles']: a['fetched_at'] = '2026-10-12T05:03:06+00:00'
        self.save(newer, 'latest_bundle.json')
        o = self.fetch(failing={URLS['1.16.4']})
        self.assertEqual(o['kept_articles'][0]['fetched_at'], '2026-10-12T05:03:06+00:00')


if __name__ == '__main__':
    unittest.main()
