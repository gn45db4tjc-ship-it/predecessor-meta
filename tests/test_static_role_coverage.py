"""Role review validation and source replay. Observations in fixtures are synthetic."""
import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import static_publish as p
from test_static_independent_sources import partial


class RoleReviewTests(unittest.TestCase):
    def setUp(self):
        self.packet=json.loads((p.base.TOOL_DIR/'reviewed_guidance.json').read_text(encoding='utf8'))

    def test_authored_packet_valid_and_covers_93_unique_roles(self):
        p.base.validate_guidance_packet(self.packet,None)
        plans=self.packet['guidance']['builds']
        self.assertEqual(len({(r['slug'],r['role']) for r in plans}),93)
        self.assertEqual(sum(bool(r.get('experimental_role')) for r in plans),7)

    def test_missing_purchase_or_loadout_precondition_rejected(self):
        for field in ('items','perks','abilities'):
            packet=copy.deepcopy(self.packet);packet['guidance']['builds'][-1]['source_preconditions'][field]={}
            with self.subTest(field=field),self.assertRaises(ValueError):p.base.validate_guidance_packet(packet,None)

    def test_experimental_automatic_policy_rejected(self):
        self.packet['guidance']['builds'][-1]['auto_recommend']=True
        with self.assertRaises(ValueError):p.base.validate_guidance_packet(self.packet,None)

    def test_missing_or_invalid_sample_never_becomes_zero(self):
        for sample in (None,True,-1,1.5):
            packet=copy.deepcopy(self.packet);packet['guidance']['builds'][-1]['review_evidence']['playedGames']=sample
            with self.subTest(sample=sample),self.assertRaises(ValueError):p.base.validate_guidance_packet(packet,None)

    def test_changed_source_is_not_mistaken_for_a_malformed_review_packet(self):
        self.packet['guidance']['builds'][-1]['source_preconditions']['perks']['Masterful Mimicry']='Previously reviewed text'
        p.base.validate_guidance_packet(self.packet,None) # Runtime compares exact source values.

    def test_partial_replay_preserves_dates_and_source_status(self):
        b=partial();b.update(tool_version='older',guidance={'builds':[]})
        b['pred_game_data']['heroes']={'unit-test-fixture':{}}
        original=copy.deepcopy(b)
        def enrich(out,official):out['guidance']={'builds':['review fixture']}
        with patch.object(p.base,'enrich_bundle',side_effect=enrich),patch.object(p.base,'apply_pred_game_data'):
            r=p.base.review_saved_sources(b)
        self.assertEqual(b,original)
        for key in ('generated_at','sources','tier_list','errors'):self.assertEqual(r[key],b[key])
        self.assertEqual(r['guidance']['builds'],['review fixture'])
        self.assertIs(p.base.review_saved_sources(r),r)

    def test_no_audit_trail_or_unpublishable_source_skips_replay(self):
        for b in (partial(),dict(partial(),tier_list=[]),dict(partial(),pred_game_data=None)):
            with patch.object(p.base,'enrich_bundle') as enrich:
                self.assertIs(p.base.review_saved_sources(b),b);enrich.assert_not_called()

    def test_static_replay_persists_once_without_relabelling_source_collection(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);b=partial();b.update(tool_version='older')
            p.retain_publication(b,root)
            def review(bundle):
                if bundle.get('tool_version')==p.base.VERSION:return bundle
                r=copy.deepcopy(bundle);r.update(tool_version=p.base.VERSION,guidance={'builds':['fixture']});return r
            with patch.object(p.base,'review_saved_sources',side_effect=review),patch.object(p,'CONFIG',dict(p.CONFIG,brackets=['gold'])):
                first=p.render_site(root,root/'site',{});second=p.render_site(root,root/'site',{})
            self.assertEqual(first['cohorts']['gold']['sha256'],second['cohorts']['gold']['sha256'])
            self.assertEqual(p.load_publication(root,'gold')['generated_at'],b['generated_at'])
            self.assertEqual(p.load_publication(root,'gold')['sources'],b['sources'])
