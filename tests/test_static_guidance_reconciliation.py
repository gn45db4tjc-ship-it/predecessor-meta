import copy, unittest
import predecessor_meta as m

class GuidanceReconciliationTests(unittest.TestCase):
    def test_ability_damage_is_not_a_damage_type(self):
        raw='Gain Gold equal to <AbilityPowerText>6%</> of <AbilityPowerText>Ability Damage</>.'
        self.assertEqual(m.clean_text(m.pred_markup(raw)), 'Gain Gold equal to 6% of Ability Damage.')
        self.assertIn('magical damage',m.clean_text(m.pred_markup('<AbilityPowerText>15 Damage</>')))

    def test_saved_text_repair_is_exact_guarded_and_preserves_observation_dates(self):
        raw='<AbilityPowerText>Ability Damage</>'
        b={'perks':{'aion':{'description':'Ability magical damage','pred_raw':{'description':raw},'pred_source':{'fetched_at':'2026-09-23T12:00:00Z'}}},'items':{},'sources':{'sample':{'fetched_at':'2026-09-14','played':55,'wr':51.0}}}
        before=copy.deepcopy(b['sources'])
        self.assertTrue(m.repair_pred_text_labels(b));self.assertEqual(b['perks']['aion']['description'],'Ability Damage')
        self.assertEqual(b['sources'],before);self.assertFalse(m.repair_pred_text_labels(b))
        b['perks']['aion']['description']='Independent official correction'
        self.assertFalse(m.repair_pred_text_labels(b));self.assertEqual(b['perks']['aion']['description'],'Independent official correction')
