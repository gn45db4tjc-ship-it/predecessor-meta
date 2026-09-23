import copy,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
import predecessor_meta as m

class BuildPatchReviewTests(unittest.TestCase):
    def setUp(self):
        self.packet=json.loads((Path(m.__file__).parent/'reviewed_guidance.json').read_text(encoding='utf8'))
    def test_build_only_review_does_not_advance_full_strategy_dates(self):
        m.validate_guidance_packet(self.packet,None)
        self.assertEqual(self.packet['patch'],'1.16.4')
        self.assertTrue(self.packet['reviewed_at'].startswith('2026-09-14'))
        review=self.packet['guidance']['build_patch_review']
        self.assertEqual(sum(review['summary'].values()),93)
        self.assertEqual(review['patch'],'1.17')
        self.assertEqual(self.packet['guidance']['maintenance_review']['next_weekly_review'],'2026-09-20T13:15:00-05:00')
    def test_missing_fingerprints_or_mechanics_cannot_be_approved(self):
        for mutate in (lambda p:p['guidance']['build_patch_review']['article_fingerprints'].clear(),lambda p:p['guidance']['builds'][0].pop('source_preconditions')):
            p=copy.deepcopy(self.packet);mutate(p)
            with self.assertRaises(ValueError):m.validate_guidance_packet(p,None)
    def test_missing_reason_or_alternative_is_not_a_review(self):
        for field in ['reason','alternative','limitation']:
            p=copy.deepcopy(self.packet);p['guidance']['builds'][0]['patch_review'][field]=''
            with self.assertRaises(ValueError):m.validate_guidance_packet(p,None)
    def test_definition_fallback_needs_exact_dated_source_and_matches_plan_precondition(self):
        p=copy.deepcopy(self.packet);first=next(iter(p['guidance']['build_patch_review']['loadout_definitions'].values()));first['sources'][0]['sha256']='invalid'
        with self.assertRaises(ValueError):m.validate_guidance_packet(p,None)
        p=copy.deepcopy(self.packet);del p['guidance']['build_patch_review']['loadout_definitions'][p['guidance']['builds'][0]['augment']]
        with self.assertRaises(ValueError):m.validate_guidance_packet(p,None)
    def test_editorial_replay_does_not_depend_on_optional_pred_or_mutate_sources(self):
        b={'official':{'live':{'version':'1.17'}},'tool_version':'older','generated_at':'2026-09-21T00:00:00Z','patch':'1.16','sources':{'statz_hero_pages':{'fetched_at':'2026-09-21T00:00:00Z'}},'heroes':{},'tier_list':[{'matches':123,'winRate':51}],'pred_game_data':{'status':'failed','heroes':{}},'guidance':{'patch':'1.16.4','reviewed_at':'2026-09-14T00:00:00Z','status':'needs review'}}
        original=copy.deepcopy(b)
        # Validation of real bundle entities is exercised by the six-bundle receipt;
        # this fixture isolates the editorial-only publication path.
        with patch.object(m,'validate_guidance_packet'),patch.object(m,'bundle_is_publishable',return_value=True):
            result=m.review_saved_sources(b)
        self.assertEqual(b,original)
        for key in ('sources','heroes','tier_list','patch','generated_at','pred_game_data'):self.assertEqual(result[key],b[key])
        self.assertEqual(result['guidance']['reviewed_at'],b['guidance']['reviewed_at'])
        self.assertEqual(result['guidance']['status'],'needs review')
        self.assertEqual(result['guidance']['build_patch_review']['patch'],'1.17')
        with patch.object(m,'validate_guidance_packet'),patch.object(m,'bundle_is_publishable',return_value=True):
            self.assertIs(m.review_saved_sources(result),result)
            result['guidance']['builds'][0]['why']='an obsolete published draft'
            self.assertNotEqual(m.review_saved_sources(result)['guidance']['builds'][0]['why'],'an obsolete published draft')
    def test_yin_melee_effect_and_serath_new_loadout_and_greystone_defense_are_recorded(self):
        rows={(r['slug'],r['role']):r for r in self.packet['guidance']['builds']}
        yin=rows['yin','jungle'];self.assertIn('does not grant Yin ranged extra projectiles',yin['why'])
        # 2.32 build review: Serath Jungle defaults to Weald (Thraex is the stated alternative); Greystone Offlane
        # keeps dedicated defense through Aegis Of Agawar in the core and Giant's Ring in the finish.
        self.assertEqual(rows['serath','jungle']['eternal'],'Weald')
        self.assertIn('Aegis Of Agawar',rows['greystone','offlane']['core']);self.assertIn("Giant's Ring",rows['greystone','offlane']['finish'])
        for r in rows.values():self.assertTrue(r['previous_review']['reviewed_at'].startswith('2026-09-14'))
if __name__=='__main__':unittest.main()
