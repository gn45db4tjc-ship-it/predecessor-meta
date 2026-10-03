"""Freshness Phase 4 (2.47.0): the reviewed guidance logs each recheck pass (guidance.recheck_log).

The scheduled reviewer records what it handled, its scope and its ledger; a weekly pass names its ISO week, which is
what clears the queue's weekly backstop. The validator accepts a well-formed log and rejects anything else."""
import copy, json, unittest
from pathlib import Path

import predecessor_meta as m

VALID = {'kind': 'weekly', 'week': '2026-W41', 'reviewed_at': '2026-10-12T20:00:00+00:00',
         'items': ['weekly:2026-W41', 'grade-moved:adele/offlane'], 'scope': 'Weekly backstop: withheld grades and inactive plans.',
         'ledger': 'docs/rechecks/2026-10-12-ledger.json', 'result': '1 changed, 12 checked and retained'}


class RecheckLogValidation(unittest.TestCase):
    def setUp(self):
        self.packet = json.loads((Path(m.__file__).parent / 'reviewed_guidance.json').read_text(encoding='utf8'))

    def with_log(self, *rows):
        packet = copy.deepcopy(self.packet)
        packet['guidance']['recheck_log'] = list(rows)
        return packet

    def test_a_well_formed_log_is_accepted(self):
        triggered = {k: v for k, v in VALID.items() if k != 'week'} | {'kind': 'triggered'}
        m.validate_guidance_packet(self.with_log(VALID, triggered), None)

    def test_malformed_passes_are_rejected(self):
        for change, message in ((lambda r: r.update(kind='monthly'), 'weekly or triggered'),
                                (lambda r: r.update(week='W41'), 'ISO week'),
                                (lambda r: r.update(items=[]), 'lists the queue items'),
                                (lambda r: r.update(scope=' '), 'scope'),
                                (lambda r: r.update(ledger='notes.json'), 'docs/rechecks'),
                                (lambda r: r.update(reviewed_at='2026-10-12T20:00:00'), 'timezone'),
                                (lambda r: r.update(extra=True), 'Unknown recheck log fields')):
            row = copy.deepcopy(VALID)
            change(row)
            with self.assertRaisesRegex(ValueError, message):
                m.validate_guidance_packet(self.with_log(row), None)

    def test_the_log_must_be_a_list(self):
        packet = copy.deepcopy(self.packet)
        packet['guidance']['recheck_log'] = VALID
        with self.assertRaisesRegex(ValueError, 'must be a list'):
            m.validate_guidance_packet(packet, None)


if __name__ == '__main__':
    unittest.main()
