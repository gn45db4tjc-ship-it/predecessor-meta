"""A build-only replay makes every reviewed plan's role selectable, exactly as a fresh collection does.
Synthetic heroes only; no statistics are created."""
import copy
import json
import unittest
from pathlib import Path
from unittest.mock import patch
import predecessor_meta as m


class ReplayPlanningRoleTests(unittest.TestCase):
    def setUp(self):
        self.packet = json.loads((Path(m.__file__).parent / 'reviewed_guidance.json').read_text(encoding='utf8'))
        # A saved 1.17 bundle in which the source offers Zinx only as a support.
        self.bundle = {'official': {'live': {'version': self.packet['guidance']['build_patch_review']['patch']}},
                       'tool_version': 'older', 'guidance': {'builds': []},
                       'heroes': {'zinx': {'display_name': 'Zinx', 'roles_order': ['support'], 'roles': {'support': {'status': 'ok'}}, 'role_evidence': {}}}}

    def replay(self):
        with patch.object(m, 'validate_guidance_packet'), patch.object(m, 'bundle_is_publishable', return_value=True), \
             patch.object(m.patch_support, 'prepare'), patch.object(m.patch_support, 'apply'):
            return m.review_saved_sources(copy.deepcopy(self.bundle))

    def test_replayed_plan_role_is_selectable_and_labelled_without_a_sample(self):
        self.assertTrue(any(p['slug'] == 'zinx' and p['role'] == 'carry' for p in self.packet['guidance']['builds']), 'probe setup: a reviewed Zinx Carry plan exists')
        hero = self.replay()['heroes']['zinx']
        self.assertIn('carry', hero['roles_order'])
        self.assertEqual(hero['roles_order'][0], 'support')  # the source's own role order is kept first
        self.assertEqual(hero['roles']['carry']['status'], 'unavailable')  # no statistical sample is invented
        self.assertIn('Reviewed planning role', hero['role_evidence']['carry'])

    def test_offered_roles_and_their_samples_are_untouched(self):
        hero = self.replay()['heroes']['zinx']
        self.assertEqual(hero['roles']['support'], {'status': 'ok'})
        self.assertNotIn('support', hero['role_evidence'])


if __name__ == '__main__':
    unittest.main()
