"""Steam publisher posts that name an update without releasing it (29 Oct 2026).

"Update 1.18 Frostbite - First Look Dev Stream" matched the version pattern and was read as a published 1.18, so the
official check refused every collection ("Publisher reports a newer update whose live release/full notes are not
verified") and Pred.gg statistics were withheld on every rank. A stream, first look or trailer is an announcement;
a post that reads as patch notes still counts as published and still has to be matched by the official article.
"""
import datetime as dt
import unittest
from unittest.mock import patch

import predecessor_meta as m

NOW = dt.datetime(2026, 10, 29, 4, 0, tzinfo=dt.timezone.utc)


def feed(*titles):
    rows = [{'appid': 961200, 'feedname': 'steam_community_announcements', 'title': t, 'contents': 'Join us live.',
             'date': int(NOW.timestamp()) - 3600 * (i + 1), 'gid': str(100 + i), 'url': 'https://store.steampowered.com/news/%d' % i}
            for i, t in enumerate(titles)]
    return {'appnews': {'appid': 961200, 'newsitems': rows}}


def statuses(*titles):
    with patch.object(m, 'now_utc', return_value=NOW):
        return {r['title']: r['status'] for r in m.parse_publisher_news(feed(*titles), NOW.isoformat())['entries']}


class PublisherAnnouncements(unittest.TestCase):
    def test_the_frostbite_dev_stream_is_an_announcement(self):
        self.assertEqual(statuses('Update 1.18 Frostbite - First Look Dev Stream'),
                         {'Update 1.18 Frostbite - First Look Dev Stream': 'announced'})

    def test_other_pre_release_posts_are_announcements(self):
        titles = ('Update 1.18 Trailer', 'Patch 1.18 Sneak Peek', 'Update 1.18 Livestream', 'Update 1.18 Roadmap', 'Update 1.18 Reveal')
        self.assertEqual(set(statuses(*titles).values()), {'announced'})

    def test_patch_notes_still_count_as_published(self):
        titles = ('Update 1.18 Frostbite - Patch Notes', 'Hotfix 1.17.2 - Patch Notes', 'Patch Notes: 1.18')
        self.assertEqual(set(statuses(*titles).values()), {'published'})

    def test_the_official_check_passes_with_the_dev_stream_and_fails_on_unmatched_notes(self):
        # Through fetch_official: the announcement no longer blocks a verified 1.17, a published 1.18 still does.
        from test_static_official_hotfix import PublisherCrossCheck, article
        check = PublisherCrossCheck()
        with patch.object(m, 'now_utc', return_value=NOW):
            stream = m.parse_publisher_news(feed('Update 1.18 Frostbite - First Look Dev Stream'), NOW.isoformat())
            notes = m.parse_publisher_news(feed('Update 1.18 Frostbite - Patch Notes'), NOW.isoformat())
        self.assertEqual(check.fetch(article(), stream)['status'], 'verified')
        with self.assertRaisesRegex(ValueError, 'not verified: Update 1.18 Frostbite - Patch Notes'):
            check.fetch(article(), notes)

if __name__ == '__main__':
    unittest.main()
