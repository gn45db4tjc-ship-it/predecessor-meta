"""Hotfixes published inside a patch article (Hotfix 1.17.1, 24 Sep 2026).

The official site added Hotfix 1.17.1 to the 1.17 article as a heading, a separate dated paragraph and a quoted
change list. The parser only understood the older one-line label ("1.16.3 - 24th August"), so the hotfix had no
version or date, and the Steam cross-check then refused every collection: "Publisher reports a newer update whose
live release/full notes are not verified: Hotfix 1.17.1". A Steam hotfix is accepted only when the live official
article itself carries that version with a release date that has passed; anything else still fails loudly.
"""
import datetime as dt
import unittest
from pathlib import Path
from unittest.mock import patch

import predecessor_meta as m

NOW = dt.datetime(2026, 9, 24, 22, 0, tzinfo=dt.timezone.utc)
URL = 'https://www.predecessorgame.com/en-US/news/patch-notes/Patch_Notes_1.17'
FIXES = ["Fixed Valmont Emote having no VO",
         "Fixed an issue with Valmont&#x27;s Sanguine Banquet regenerating mana incorrectly",
         "Fixed an issue with Gideon&#x27;s Black Hole pulling enemies if interrupted on cast"]


def article(hotfix_heading='Hotfix v1.17.1', hotfix_date='24th September 2026', one_line=None):
    """A trimmed copy of the live 1.17 article's structure (heading, italic date paragraph, quoted list)."""
    hotfix = ''
    if one_line:
        hotfix = '<h2>Hotfixes</h2><p>%s</p><blockquote><div>- %s</div></blockquote>' % (one_line, FIXES[0])
    elif hotfix_heading:
        hotfix = ('<h2 id="hotfix-v1171">%s</h2>' % hotfix_heading + ('<p><em>%s</em></p>' % hotfix_date if hotfix_date else '')
                  + '<blockquote class="quote-border"><div class="quote-border-inner p-4">' + '<br/>'.join('- ' + f for f in FIXES) + '</div></blockquote>')
    return ('<html><body><h1>V1.17: Bloodtide Patch Notes</h1><p>Everything you need to know about V1.17: Bloodtide!</p>'
            '<div class="cms-news-rich-text">' + hotfix + '<h2>New Hero: Baron Valmont</h2>'
            '<p>Update 1.17 is live on 22nd September 2026.</p><h2>Hero Balance</h2><h4>Gideon</h4>'
            '<blockquote><div>Black Hole [Ultimate]<br/>- Damage: 520/780/1040 &#8594; 500/760/1020</div></blockquote></div></body></html>')


def steam(version='1.17.1', title='Hotfix 1.17.1 - Patch Notes', published='2026-09-24T10:24:12+00:00'):
    return {'status': 'ok', 'entries': [{'id': '1', 'title': title, 'version': version, 'url': 'https://store.steampowered.com/news/1',
                                          'published_at': published, 'status': 'published', 'text': 'A quick little hotfix',
                                          'official_links': [], 'source_contents': 'A quick little hotfix', 'fingerprint': '0' * 64}]}


class HotfixParsing(unittest.TestCase):
    def parse(self, html):
        with patch.object(m, 'now_utc', return_value=NOW):
            return m.official_parse(html, URL)

    def test_heading_with_a_separate_dated_paragraph_is_a_dated_live_hotfix(self):
        a = self.parse(article())
        self.assertEqual((a['version'], a['status'], a['release_date']), ('1.17', 'live', '2026-09-22'))
        self.assertEqual(a['hotfixes'], [{'heading': 'Hotfix v1.17.1', 'version': '1.17.1', 'release_date': '2026-09-24', 'status': 'live'}])

    def test_the_older_one_line_label_still_parses(self):
        a = self.parse(article(one_line='1.17.1 - 24th September'))
        self.assertEqual(a['hotfixes'], [{'heading': '1.17.1 - 24th September', 'version': '1.17.1', 'release_date': '2026-09-24', 'status': 'live'}])

    def test_a_future_date_is_announced_and_a_missing_date_is_unverified(self):
        self.assertEqual(self.parse(article(hotfix_date='30th September 2026'))['hotfixes'][0]['status'], 'announced')
        undated = self.parse(article(hotfix_date=None))['hotfixes'][0]
        self.assertEqual((undated['version'], undated['status'], undated.get('release_date')), ('1.17.1', 'release date unverified', None))

    def test_a_heading_that_is_not_a_hotfix_label_is_ignored(self):
        self.assertEqual(self.parse(article(hotfix_heading='Hotfix notes are coming soon'))['hotfixes'], [])


class PublisherCrossCheck(unittest.TestCase):
    def fetch(self, html, publisher):
        index = '<a href="/en-US/news/patch-notes/Patch_Notes_1.17">1.17</a>'
        with patch.object(m, 'now_utc', return_value=NOW), \
             patch.object(m, 'http_get', side_effect=lambda url, **kw: ((index if url == m.OFFICIAL_INDEX else html), 200, 0.01)), \
             patch.object(m, 'fetch_publisher_news', return_value=publisher), \
             patch.object(m, 'previously_verified_patch', return_value='1.17'), \
             patch.object(m, 'guidance_packet_path', return_value=Path('no-such-guidance.json')), \
             patch.object(m.time, 'sleep'):
            return m.fetch_official()

    def test_a_steam_hotfix_dated_in_the_live_article_is_verified(self):
        o = self.fetch(article(), steam())
        self.assertEqual((o['status'], o['live']['version']), ('verified', '1.17'))
        self.assertEqual(o['live']['hotfixes'][0]['version'], '1.17.1')

    def test_a_steam_hotfix_missing_from_the_article_still_fails(self):
        with self.assertRaisesRegex(ValueError, 'not verified: Hotfix 1.17.1'):
            self.fetch(article(hotfix_heading=None), steam())

    def test_an_undated_or_future_embedded_hotfix_does_not_verify_a_published_steam_hotfix(self):
        with self.assertRaisesRegex(ValueError, 'not verified: Hotfix 1.17.1'):
            self.fetch(article(hotfix_date=None), steam())
        # A future-dated embedded hotfix is an announcement; the Steam post claiming it is live stays unresolved.
        with self.assertRaisesRegex(ValueError, 'not verified: Hotfix 1.17.1'):
            self.fetch(article(hotfix_date='30th September 2026'), steam())

    def test_an_embedded_hotfix_cannot_vouch_for_a_different_patch_line(self):
        html = article(hotfix_heading='Hotfix v1.18.1')
        with self.assertRaisesRegex(ValueError, 'not verified: Hotfix 1.18.1'):
            self.fetch(html, steam(version='1.18.1', title='Hotfix 1.18.1 - Patch Notes'))


class HotfixChanges(unittest.TestCase):
    def test_the_embedded_hotfix_lines_are_kept_as_unmapped_official_changes(self):
        with patch.object(m, 'now_utc', return_value=NOW):
            a = m.official_parse(article(), URL)
        bundle = {'heroes': {'gideon': {'display_name': 'Gideon'}}, 'items': {}, 'perks': {}}
        m.attach_official_changes(bundle, {'articles': [a]})
        rows = bundle['official_hotfix_changes']
        self.assertEqual([r['change'] for r in rows], [f.replace('&#x27;', "'") for f in FIXES])
        self.assertTrue(all(r['patch'] == '1.17.1' and r['kind'] == 'unmapped' and r['key'] is None and r['source'] == URL for r in rows))
        # The next section heading ends the hotfix: the 1.17 balance line below it is not a hotfix change.
        self.assertFalse(any('520/780/1040' in r['change'] for r in rows))


if __name__ == '__main__':
    unittest.main()
