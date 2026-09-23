import copy, json, unittest
from pathlib import Path
import predecessor_meta as m

ROOT = Path(__file__).resolve().parents[1]


class AdaptationReviewTests(unittest.TestCase):
    """The committed build review carries a dated adaptation review bound to exact classifications."""

    @classmethod
    def setUpClass(cls):
        cls.packet = json.loads((ROOT / 'reviewed_guidance.json').read_text(encoding='utf-8'))

    def test_committed_packet_validates_and_keeps_strategy_dates(self):
        m.validate_guidance_packet(copy.deepcopy(self.packet), None)
        review = self.packet['guidance']['build_patch_review']['adaptation_review']
        self.assertEqual(review['patch'], self.packet['guidance']['build_patch_review']['patch'])
        self.assertTrue(review['classifications']['items']['anti_heal'])
        self.assertTrue(all(name.startswith('Tainted') for name in review['classifications']['items']['anti_heal']))
        # A build review never renews the global tier and strategy review.
        self.assertEqual(self.packet['patch'], '1.16.4')
        self.assertTrue(self.packet['reviewed_at'].startswith('2026-09-14'))

    def test_invalid_adaptation_reviews_are_rejected(self):
        def mutate(change):
            packet = copy.deepcopy(self.packet)
            change(packet['guidance']['build_patch_review']['adaptation_review'])
            return packet
        changes = [lambda a: a.update(patch='1.16.4'), lambda a: a.update(method=''), lambda a: a.update(limitations=' '),
                   lambda a: a.update(reviewed_at='not a date'), lambda a: a.pop('classifications'),
                   lambda a: a['classifications'].update(items={}), lambda a: a['classifications']['items'].update(anti_heal=[None]),
                   lambda a: a['classifications'].update(extra={}), lambda a: a['classifications']['heroes'].update(aurora='magical')]
        for change in changes:
            with self.assertRaises(ValueError):
                m.validate_guidance_packet(mutate(change), None)

    def test_every_plan_has_a_current_verdict_and_unresolved_plans_state_why(self):
        builds = self.packet['guidance']['build_patch_review']
        plans = self.packet['guidance']['builds']
        self.assertEqual(sum(builds['summary'].values()), len(plans))
        for plan in plans:
            review = plan['patch_review']
            self.assertEqual(review['reviewed_at'], plan['reviewed_at'])
            self.assertTrue(review['reason'].strip() and review['alternative'].strip() and review['limitation'].strip())
            if review['result'] == 'unresolved':
                self.assertTrue(plan.get('previous_review') or plan.get('core'), plan['slug'])


if __name__ == '__main__':
    unittest.main()
