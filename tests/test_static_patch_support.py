import copy,json,unittest
from pathlib import Path
from unittest.mock import patch
import predecessor_meta as m
import patch_support as p

class OfficialPatchSupportTests(unittest.TestCase):
    def setUp(self):
        self.d=p.load();self.packet=json.loads((Path(m.__file__).parent/'reviewed_guidance.json').read_text(encoding='utf8'))
        self.b={'official':{'status':'verified','live':{'version':'1.17'},'articles':[{'version':v,'fingerprint':h,'status':'live'} for v,h in self.d['article_fingerprints'].items()]},'heroes':{},'perks':{},'items':{},'guidance':{},'sources':{'sentinel':{'fetched_at':'2026-09-14'}},'patch':'1.16','generated_at':'2026-09-22T17:32:00Z','pairs':{}}
    def test_official_identity_adds_no_statistical_samples(self):
        p.prepare(self.b);h=self.b['heroes']['valmont']
        self.assertEqual(h['roles_order'],['midlane']);self.assertEqual(h['roles']['midlane']['status'],'unavailable')
        self.assertNotIn('hero_wide',h);self.assertEqual(self.b['pairs'],{});self.assertEqual(self.b['patch'],'1.16')
        self.assertEqual(len(h['abilities']),6);self.assertEqual(len(self.b['perks']),3)
    def test_announcements_failed_checks_and_old_patches_do_not_add_current_identity(self):
        for change in ({'status':'failed'},{'live':{'version':'1.16.4'}}):
            b=copy.deepcopy(self.b);b['official'].update(change);p.prepare(b);self.assertNotIn('valmont',b['heroes'])
        b=copy.deepcopy(self.b);b['official']['articles'][0]['status']='announced';self.assertFalse(p.current(b,self.d))
    def test_new_statistical_hero_is_not_overwritten_by_official_fallback(self):
        hero={'display_name':'New upstream','roles':{'midlane':{'status':'ok','playedGames':123}},'abilities':[]}
        self.b['heroes']['valmont']=copy.deepcopy(hero);p.prepare(self.b)
        self.assertEqual(self.b['heroes']['valmont']['roles'],hero['roles']);self.assertEqual(self.b['heroes']['valmont']['abilities'],[])
    def apply(self,b,d):
        with patch.object(p,'load',return_value=d):p.apply(b,self.packet,m.validate_guidance_packet,m.clean_text,m.derive_capabilities)
    def test_exact_fields_preserve_original_and_do_not_double_apply(self):
        p.prepare(self.b);rule=next(r for r in self.d['corrections'] if r['path']==['items','transference','total_price'])
        d={**self.d,'corrections':[rule]};self.b['items']['transference']={'total_price':2900};saved=copy.deepcopy(self.b['sources'])
        self.apply(self.b,d);self.assertEqual(self.b['items']['transference']['total_price'],3000);receipt=copy.deepcopy(self.b['corrections'])
        self.assertEqual(receipt[0]['original'],2900);self.apply(self.b,d);self.assertEqual(self.b['corrections'],receipt);self.assertEqual(self.b['sources'],saved)
    def test_conflicting_source_and_changed_same_version_hotfix_fail_closed(self):
        p.prepare(self.b);rule=next(r for r in self.d['corrections'] if r['path']==['items','transference','total_price']);d={**self.d,'corrections':[rule]}
        self.b['items']['transference']={'total_price':1234};self.apply(self.b,d)
        self.assertEqual(self.b['items']['transference']['total_price'],1234);self.assertTrue(self.b['patch_support']['conflicts'])
        self.b['official']['articles'][0]['fingerprint']='changed';self.apply(self.b,d);self.assertFalse(self.b['patch_support']['active'])
    def test_correction_cannot_touch_observed_rates_or_source_dates(self):
        p.prepare(self.b)
        for path in (['heroes','valmont','roles','midlane','winRate'],['sources','statz','fetched_at']):
            d={**self.d,'corrections':[{'path':path}]}
            with self.assertRaisesRegex(ValueError,'protected'):self.apply(self.b,d)
    def test_coverage_keeps_all_changes_and_non_power_fixes_separate(self):
        rows=self.d['coverage'];self.assertEqual(len(rows),140)
        # Hotfix 1.17.1 (24 Sep) adds its nine lines, each with a reason and a review date; none is a balance number.
        hotfix=[r for r in rows if r['section']=='Hotfix 1.17.1'];self.assertEqual(len(hotfix),9)
        self.assertTrue(all(r['result']=='checked and retained' and r['reviewed_at']>='2026-09-24' for r in hotfix))
        self.assertTrue(any(r['category']=='tracking only' for r in rows));self.assertTrue(any(r['category']=='other modes' for r in rows))
        self.assertTrue(all(r['reason'] and r['source'] and r['reviewed_at'] for r in rows))
    def test_publication_retains_patch_support_without_exposing_local_settings(self):
        from shared_server import public_bundle
        b=public_bundle({'patch_support':{'active':True},'settings':{'private':'not public'},'token':'not public'})
        self.assertEqual(b,{'patch_support':{'active':True}})
    def test_official_definition_requires_exact_patch_fingerprint(self):
        packet=copy.deepcopy(self.packet);definition=packet['guidance']['build_patch_review']['loadout_definitions']['Event Horizon']
        ref=next(r for r in definition['sources'] if r.get('official_patch'));ref['fingerprint']='0'*64
        with self.assertRaisesRegex(ValueError,'fingerprint'):m.validate_guidance_packet(packet,None)

if __name__=='__main__':unittest.main()
