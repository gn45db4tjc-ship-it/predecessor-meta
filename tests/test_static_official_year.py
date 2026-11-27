"""A release date written without a year (Codex audit #239 F6, PRED-M11).

The 1.18 article says "Update 1.18: Frostbite launches on Tuesday 3rd November" with no year. The parser used the
clock's year, so from 1 Jan 2027 the live article read as a 2027 announcement and every collection would refuse
1.18. The year now comes from the article's own publication date ("Nov 3, 2026"), a written weekday must match,
and a date that cannot be placed within half a year of its anchor is withheld rather than guessed.
"""
import datetime as dt
import unittest
from pathlib import Path
from unittest.mock import patch

import predecessor_meta as m

FIXTURE = Path(__file__).resolve().parent / 'fixtures' / 'patch_importer' / 'PatchNotes_1.18.html'
URL = 'https://www.predecessorgame.com/en-US/news/patch-notes/Patch_Notes_1.18'


def at(*ymd):
    return dt.datetime(*ymd, 12, tzinfo=dt.timezone.utc)


def parse(html, now):
    with patch.object(m, 'now_utc', return_value=now):
        return m.official_parse(html, URL)


def article(sentence, published='Nov 3, 2026', hotfix=None):
    label = '<span>%s</span>' % published if published else ''
    fix = '<h2>Hotfix v1.18.1</h2><p>%s</p>' % hotfix if hotfix else ''
    return ('<html><body><h1>Update 1.18: Frostbite Patch Notes</h1>' + label +
            '<div class="cms-news-rich-text"><p>%s</p>%s</div></body></html>' % (sentence, fix))


class ArchivedArticle(unittest.TestCase):
    def test_the_archived_1_18_article_stays_live_on_3_november_2026_across_new_year(self):
        html = FIXTURE.read_text(encoding='utf8')
        for now in (at(2026, 11, 26), at(2026, 12, 31), at(2027, 1, 1), at(2027, 4, 1)):
            a = parse(html, now)
            self.assertEqual((a['version'], a['status'], a['release_date']), ('1.18', 'live', '2026-11-03'), now)

    def test_before_its_launch_day_the_archived_article_is_announced(self):
        a = parse(FIXTURE.read_text(encoding='utf8'), at(2026, 11, 2))
        self.assertEqual((a['status'], a['release_date']), ('announced', '2026-11-03'))


class YearResolution(unittest.TestCase):
    def test_a_written_year_is_used_as_written(self):
        a = parse(article('Update 1.18 launches on 3rd November 2026.', published=None), at(2027, 1, 1))
        self.assertEqual((a['status'], a['release_date']), ('live', '2026-11-03'))

    def test_a_december_article_announcing_january_takes_the_next_year(self):
        a = parse(article('Update 1.19 launches on 5th January.', published='Dec 20, 2026'), at(2026, 12, 21))
        self.assertEqual((a['status'], a['release_date']), ('announced', '2027-01-05'))

    def test_a_written_weekday_must_match_the_year(self):
        # 3 November is a Tuesday in 2026 and a Wednesday in 2027.
        self.assertEqual(parse(article('It launches on Tuesday 3rd November.'), at(2027, 1, 1))['release_date'], '2026-11-03')
        wrong = parse(article('It launches on Friday 3rd November.'), at(2027, 1, 1))
        self.assertEqual((wrong['status'], wrong['release_date']), ('release date unverified', None))

    def test_without_a_publication_date_the_clock_anchors_the_nearest_year(self):
        self.assertEqual(parse(article('Update 1.18 launches on 3rd November.', published=None), at(2027, 1, 1))['release_date'], '2026-11-03')

    def test_a_date_far_from_its_anchor_is_withheld(self):
        a = parse(article('Update 1.18 launches on 3rd May.', published='Nov 3, 2026'), at(2026, 11, 26))
        self.assertEqual((a['status'], a['release_date']), ('release date unverified', None))

    def test_a_hotfix_after_new_year_takes_the_year_after_the_article(self):
        a = parse(article('Update 1.18 launches on 3rd November.', hotfix='5th January'), at(2027, 1, 6))
        self.assertEqual(a['hotfixes'], [{'heading': 'Hotfix v1.18.1', 'version': '1.18.1', 'release_date': '2027-01-05', 'status': 'live'}])

    def test_the_helper_rejects_an_impossible_day(self):
        self.assertIsNone(m.release_year('31', 'February', None, dt.date(2026, 11, 3)))


if __name__ == '__main__':
    unittest.main()
