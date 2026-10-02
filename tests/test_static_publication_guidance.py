"""Freshness Phase 2b (2.44.0): a merged review reaches the site at the next publication, not the next collection.

Before, publication re-applied the full reviewed packet (grades included) only when the bundle's tool version differed,
and a build-only replay returned early, so a review PR that changed grades was invisible until the next collection
(12-24 h, longer when the PC collector was off). Observations in fixtures are synthetic."""
import copy, unittest
from unittest.mock import patch
import static_publish as p
from test_static_independent_sources import partial

VERSION = p.base.VERSION


def collected(**extra):
    b = partial()
    b.update(tool_version=VERSION, guidance={'builds': [], 'meta_review': {'entries': ['as collected']}})
    b['pred_game_data']['heroes'] = {'unit-test-fixture': {}}
    b.update(extra)
    return b


def enrich(out, official):
    out['guidance'] = {'builds': ['reviewed'], 'meta_review': {'entries': ['rechecked']}}


class PublicationGuidance(unittest.TestCase):
    def test_a_changed_packet_is_applied_at_publication_even_on_the_same_version(self):
        b = collected(guidance_fingerprint='an-older-packet')
        original = copy.deepcopy(b)
        with patch.object(p.base, 'enrich_bundle', side_effect=enrich), patch.object(p.base, 'apply_pred_game_data'):
            r = p.base.review_saved_sources(b)
        self.assertEqual(b, original)                                          # the input is never changed
        self.assertEqual(r['guidance']['meta_review']['entries'], ['rechecked'])  # grades, not only builds
        self.assertEqual(r['guidance_fingerprint'], p.base.guidance_fingerprint())
        for key in ('generated_at', 'sources', 'tier_list', 'errors'):
            self.assertEqual(r[key], b[key], key)                              # no source or sample date changes
        self.assertIs(p.base.review_saved_sources(r), r)                       # applied once

    def test_an_unchanged_packet_on_the_same_version_is_left_alone(self):
        b = collected(guidance_fingerprint=p.base.guidance_fingerprint())
        with patch.object(p.base, 'enrich_bundle') as e:
            self.assertIs(p.base.review_saved_sources(b), b)
            e.assert_not_called()

    def test_the_fingerprint_covers_the_packet_and_its_supplement(self):
        first = p.base.guidance_fingerprint()
        self.assertRegex(first, r'^[0-9a-f]{16}$')
        with patch.object(p.base, 'guidance_packet_path', return_value=p.base.TOOL_DIR / 'free_hosting.json'):
            self.assertNotEqual(p.base.guidance_fingerprint(), first)


if __name__ == '__main__':
    unittest.main()
