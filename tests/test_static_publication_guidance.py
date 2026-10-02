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


    def test_repeated_replays_never_duplicate_enrichment_notices(self):
        # Each full replay re-created three enrichment notices without removing the previous ones (7 -> 10 -> 13 on the
        # live Paragon+ bundle on 2 Oct). A replay now drops them before re-enriching.
        def enrich_with_notice(out, official):
            out['guidance'] = {'builds': []}
            out.setdefault('errors', []).append({'source': 'Statz build definitions', 'severity': 'warning', 'detail': 'missing descriptions'})
        b = collected(guidance_fingerprint='an-older-packet')
        with patch.object(p.base, 'enrich_bundle', side_effect=enrich_with_notice), patch.object(p.base, 'apply_pred_game_data'):
            once = p.base.full_review_replay(b)
            twice = p.base.full_review_replay(once)
        count = lambda x: sum(e.get('source') == 'Statz build definitions' for e in x['errors'])
        self.assertEqual((count(once), count(twice)), (1, 1))
        self.assertEqual([e for e in twice['errors'] if e.get('source') != 'Statz build definitions'],
                         [e for e in b['errors'] if e.get('source') != 'Statz build definitions'])

    def test_unwinding_skips_a_correction_on_a_record_the_review_added(self):
        # Live Gold+ on 2 Oct: the official 1.17 fallback perk Peal has no source record (previous_source None), so the
        # unwind removed it and then failed restoring its correction ("KeyError: 'peal'"), and the replay was skipped.
        b = collected()
        b['perks'] = {'peal': {'name': 'Peal', 'description': 'official text', 'previous_source': None}}
        b['corrections'] = [{'id': 'patch-1.17-perks-peal-description', 'path': ['perks', 'peal', 'description'], 'original': 'source text'}]
        unwound = p.base.source_records_before_review(b)
        self.assertNotIn('peal', unwound['perks'])

    def test_the_fingerprint_survives_publication_so_the_replay_runs_once(self):
        from shared_server import public_bundle
        self.assertEqual(public_bundle({'guidance_fingerprint': 'abc', 'settings': {'private': 1}}), {'guidance_fingerprint': 'abc'})

if __name__ == '__main__':
    unittest.main()
