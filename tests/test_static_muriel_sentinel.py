"""Muriel's Sentinel passive reads as its official values on 1.17, and every citation of it agrees.

The source repeats the anti-heal amount for each of 18 levels and appends two stray values
('25/25/25/25/25/25/35/.../45/35/45%'). Official 1.12 gives 25/35/45% at Muriel levels 1/7/13; official 1.17
gives the heal and shield bonus as 10%-16.8% (+0.4% per level)."""
import json
import re
import unittest
from pathlib import Path
import patch_support
import predecessor_meta as m

ROOT = Path(__file__).resolve().parents[1]
PATH = ['heroes', 'muriel', 'abilities', 5, 'menu_description']


class MurielSentinelTests(unittest.TestCase):
    def setUp(self):
        self.patch = json.loads((ROOT / 'patch-1.17.json').read_text(encoding='utf-8'))
        self.packet = json.loads((ROOT / 'reviewed_guidance.json').read_text(encoding='utf-8'))
        self.rule = next(r for r in self.patch['corrections'] if r['path'] == PATH)

    def test_effective_text_states_the_official_values_not_the_raw_progression(self):
        text = m.clean_text(self.rule['after'])
        self.assertIsNone(re.search(r'(\d+/){6,}', text), text)
        self.assertIn('25/35/45% at Muriel levels 1/7/13', text)
        self.assertIn('10%', text); self.assertIn('16.8%', text)

    def test_every_source_form_converges_on_the_reviewed_text(self):
        # The raw Statz text (1.16 values), and the Pred.gg / previously corrected 1.17 text, both become the reviewed text.
        for original in [self.rule['before']] + self.rule.get('accepted_before', []):
            bundle = {'official': {'status': 'verified', 'live': {'version': '1.17'}, 'articles': [
                {'version': v, 'status': 'live', 'fingerprint': f} for v, f in self.patch['article_fingerprints'].items()]},
                'heroes': {'valmont': {}, 'muriel': {'abilities': [{} for _ in range(5)] + [{'key': 'Passive', 'menu_description': original}]}}}
            patch_support.apply(bundle, self.packet, lambda *a: None, m.clean_text, lambda h: ([], {}))
            self.assertEqual(bundle['heroes']['muriel']['abilities'][5]['menu_description'], self.rule['after'])

    def test_every_citation_of_the_passive_matches_the_effective_text(self):
        text = m.clean_text(self.rule['after'])
        cited = [p['source_preconditions']['abilities']['Passive'] for p in self.packet['guidance']['builds'] if p['slug'] == 'muriel']
        cited.append(self.patch['hero_context']['muriel']['source_abilities']['Passive'])
        for ctx in self.patch['hero_context'].values():
            for partner in ctx.get('partners', []):
                if 'muriel' in partner.get('source_abilities', {}) and 'Passive' in partner['source_abilities']['muriel']:
                    cited.append(partner['source_abilities']['muriel']['Passive'])
        self.assertGreaterEqual(len(cited), 3)
        self.assertEqual(set(cited), {text})


if __name__ == '__main__':
    unittest.main()
