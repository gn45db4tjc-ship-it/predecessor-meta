import copy, json, unittest
from pathlib import Path

import predecessor_meta as m


class GradeRecheckValidationTests(unittest.TestCase):
    """27 Sep 2026 recheck: a rechecked tier carries a zoned date after the review and after its sample."""

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
        self.rejects(self.moved, lambda e: e['evidence'].update(fetched_at='2026-09-28T12:00:00-05:00'), 'recheck')

    def test_recheck_must_be_a_date(self):
        self.rejects(self.moved, lambda e: e.update(rechecked_at=20260927), 'recheck')


if __name__ == '__main__':
    unittest.main()
