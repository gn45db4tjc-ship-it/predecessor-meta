import copy, datetime as dt, json, unittest
from pathlib import Path

import predecessor_meta as m


class GradeRecheckValidationTests(unittest.TestCase):
    """Grade rechecks (27 Sep 2026 and every scheduled pass since): a rechecked tier carries a zoned date after the
    review and after its sample."""

    def setUp(self):
        self.packet = json.loads((Path(m.__file__).parent / 'reviewed_guidance.json').read_text(encoding='utf8'))
        self.entries = self.packet['guidance']['meta_review']['entries']
        self.moved = next(e for e in self.entries if e.get('previous_tier'))
        self.plain = next(e for e in self.entries if 'rechecked_at' not in e)

    def test_committed_packet_is_valid(self):
        m.validate_guidance_packet(self.packet, None)
        self.assertTrue(any('rechecked_at' in e for e in self.entries))

    def rejects(self, entry, change, message):
        change(entry)
        with self.assertRaisesRegex(ValueError, message):
            m.validate_guidance_packet(self.packet, None)

    def test_previous_grade_needs_a_recheck(self):
        self.rejects(self.plain, lambda e: e.update(previous_tier='C' if e['tier'] != 'C' else 'B'), 'previous grade')

    def test_previous_grade_must_differ(self):
        self.rejects(self.moved, lambda e: e.update(previous_tier=e['tier']), 'previous grade')

    def test_previous_grade_must_be_a_grade(self):
        self.rejects(self.moved, lambda e: e.update(previous_tier='D'), 'previous grade')

    def test_recheck_must_follow_the_review(self):
        self.rejects(self.moved, lambda e: e.update(rechecked_at='2026-09-23T12:00:00-05:00'), 'recheck')

    def test_recheck_needs_a_zone(self):
        self.rejects(self.moved, lambda e: e.update(rechecked_at='2026-09-27T12:00:00'), 'recheck')

    def test_recheck_cannot_predate_its_sample(self):
        # Every rechecked entry, against its own recheck date: a sample collected after the recheck is rejected.
        for entry in [e for e in self.entries if 'rechecked_at' in e]:
            with self.subTest(entry='%s/%s' % (entry['slug'], entry['role'])):
                packet = copy.deepcopy(self.packet)
                target = next(e for e in packet['guidance']['meta_review']['entries'] if (e['slug'], e['role']) == (entry['slug'], entry['role']))
                later = dt.datetime.fromisoformat(entry['rechecked_at']) + dt.timedelta(days=1)
                target['evidence']['fetched_at'] = later.isoformat()
                with self.assertRaisesRegex(ValueError, 'recheck'):
                    m.validate_guidance_packet(packet, None)

    def test_recheck_may_follow_its_sample_on_the_same_day(self):
        # The boundary: a sample collected exactly at the recheck time is allowed.
        packet = copy.deepcopy(self.packet)
        target = next(e for e in packet['guidance']['meta_review']['entries'] if e.get('previous_tier'))
        target['evidence']['fetched_at'] = target['rechecked_at']
        m.validate_guidance_packet(packet, None)

    def test_new_hero_tier_may_use_the_supplement_plan(self):
        # Valmont's reviewed midlane plan lives in patch-1.17.json, not in the packet's builds.
        self.assertFalse(any(b['slug'] == 'valmont' for b in self.packet['guidance']['builds']))
        self.assertTrue(any(e['slug'] == 'valmont' and e['role'] == 'midlane' for e in self.entries))
        m.validate_guidance_packet(self.packet, None)
        self.entries.append({**copy.deepcopy(next(e for e in self.entries if e['slug'] == 'valmont')), 'role': 'offlane'})
        with self.assertRaisesRegex(ValueError, 'Unknown or duplicate'):
            m.validate_guidance_packet(self.packet, None)

    def test_supplement_tier_is_inert_where_the_supplement_hero_is_absent(self):
        # Before 1.17 is verified, patch_support adds no Valmont; his tier must not invalidate the packet.
        heroes = {e['slug']: {'abilities': [{'key': k} for k in ('LMB', 'RMB', 'Q', 'E', 'R', 'Passive')]} for e in self.entries if e['slug'] != 'valmont'}
        m.validate_guidance_packet(self.packet, {'heroes': heroes})

    def test_recheck_must_be_a_date(self):
        self.rejects(self.moved, lambda e: e.update(rechecked_at=20260927), 'recheck')


if __name__ == '__main__':
    unittest.main()
