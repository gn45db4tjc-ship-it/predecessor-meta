"""The live-data checks download every published rank and name the ranks the manifest lists but has not published."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fetch_live_bundles as fetch  # noqa: E402


def cohorts(**overrides):
    out = {rank: {'url': 'bundles/%s-abc.json' % rank, 'sha256': 'abc'} for rank in fetch.RANKS}
    out.update(overrides)
    return out


class PublishedRanks(unittest.TestCase):
    def test_every_published_rank_is_downloaded(self):
        self.assertEqual(fetch.published_ranks(cohorts()), (list(fetch.RANKS), []))

    def test_listed_but_unpublished_rank_is_skipped_and_named(self):
        ranks, unpublished = fetch.published_ranks(cohorts(master={'label': 'Master+', 'last_attempt': {'status': 'failed'}}))
        self.assertNotIn('master', ranks)
        self.assertEqual(unpublished, ['master'])

    def test_rank_missing_from_the_manifest_fails(self):
        listed = cohorts()
        del listed['paragon']
        with self.assertRaises(SystemExit):
            fetch.published_ranks(listed)

    def test_unpublished_default_rank_fails(self):
        with self.assertRaises(SystemExit):
            fetch.published_ranks(cohorts(gold={'label': 'Gold+'}))


if __name__ == '__main__':
    unittest.main()
