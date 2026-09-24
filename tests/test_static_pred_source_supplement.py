"""A conflicting receipt from the patch-1.17.json supplement must not abort Pred.gg source reconciliation.

Found on the 24 Sep 2026 Windows collection: with the packet current on 1.17, Bronze, Diamond and Paragon lost
all Pred.gg data because a supplement receipt ('patch-1.16.4-perks-shred-spree-description') is not a packet rule.
Synthetic bundle; no statistics are involved."""
import json
import unittest
from pathlib import Path
import predecessor_meta as m

ROOT = Path(__file__).resolve().parents[1]


class PredSourceSupplementTests(unittest.TestCase):
    def test_supplement_conflict_is_left_to_the_supplement(self):
        packet = json.loads((ROOT / 'reviewed_guidance.json').read_text(encoding='utf-8'))
        supplement = json.loads((ROOT / 'patch-1.17.json').read_text(encoding='utf-8'))
        ids = {r['id'] for r in packet['corrections'] + packet['mechanics_resolutions']}
        rule = next(r for r in supplement['corrections'] if r['id'] not in ids and r['path'][0] == 'perks')
        bundle = {'official': {'status': 'verified', 'articles': [], 'definition_history': {'articles': []}},
                  'guidance': {'status': 'reviewed for current patch'},
                  'perks': {rule['path'][1]: {'description': 'A different source text', 'pred_source': {'url': 'https://pred.gg/x', 'fetched_at': '2026-09-24T00:00:00Z'}}},
                  'items': {}, 'errors': [], 'mechanics_resolutions': [],
                  'corrections': [{'id': rule['id'], 'path': rule['path'], 'status': 'conflict: unexpected source value'}]}
        m.apply_pred_source_corrections(bundle)  # must not raise
        self.assertEqual(bundle['corrections'][0]['status'], 'conflict: unexpected source value')
        self.assertEqual(bundle['perks'][rule['path'][1]]['description'], 'A different source text')


if __name__ == '__main__':
    unittest.main()
