"""Official change mapping for articles that nest a balance area under an h3 (4 Nov 2026, UX review F5).

The 1.18 article put "Eternals:" as an h3 inside the "Gameplay Balance" h2, with each eternal or blessing as an h4.
The parser only recognised eternals by an h2 named for them, so every 1.18 eternal change (The Maw, Predator,
Lich, Phylactery and others) stayed unmapped although the catalogue knows them by name.
"""
import unittest

import predecessor_meta as m

URL = 'https://www.predecessorgame.com/en-US/news/patch-notes/PatchNotes_1.18'


def article(blocks):
    return {'status': 'live', 'version': '1.18', 'url': URL, 'fetched_at': '2026-11-04T05:11:06+00:00', 'blocks': blocks}


def bundle():
    return {'heroes': {'steel': {'display_name': 'Steel'}}, 'items': {},
            'perks': {'predator': {'display_name': 'Predator'}, 'the-maw': {'display_name': 'The Maw'}, 'lich': {'display_name': 'Lich'}}}


class EternalSubsection(unittest.TestCase):
    def test_eternal_entries_under_an_h3_map_to_their_perks(self):
        b = bundle()
        m.attach_official_changes(b, {'articles': [article([
            ['h2', 'Gameplay Balance'], ['h3', 'Eternals:'],
            ['h4', 'The Maw:'], ['blockquote', '- Bonus Damage Health Threshold increased from 40% to 45%.'],
            ['h4', 'Predator:'], ['blockquote', '- Damage Amplification decreased from 10% to 8%.\n- Duration decreased from 20s to 15s.'],
            ['h4', 'Lich:'], ['blockquote', '- Cooldown increased from 60s to 70s.'],
        ])]})
        rows = b['official_changes']
        self.assertEqual([(r['kind'], r['key'], r['field']) for r in rows],
                         [('perk', 'the-maw', 'The Maw'), ('perk', 'predator', 'Predator'), ('perk', 'predator', 'Predator'), ('perk', 'lich', 'Lich')])

    def test_the_eternal_context_ends_at_the_next_h3_or_h2(self):
        b = bundle()
        m.attach_official_changes(b, {'articles': [article([
            ['h2', 'Gameplay Balance'], ['h3', 'Eternals:'], ['h4', 'Predator:'], ['blockquote', '- Duration decreased from 20s to 15s.'],
            ['h3', 'Towers:'], ['h4', 'Lich:'], ['blockquote', '- A tower line that happens to sit under a perk-named heading.'],
            ['h2', 'Systems'], ['h4', 'Lich:'], ['blockquote', '- A systems line.'],
        ])]})
        rows = b['official_changes']
        self.assertEqual(rows[0]['kind'], 'perk')
        # Outside the eternal subsection a perk-named heading is not mapped from its name alone.
        self.assertEqual([r['kind'] for r in rows[1:]], ['unmapped', 'unmapped'])

    def test_unknown_names_stay_unmapped(self):
        b = bundle()
        m.attach_official_changes(b, {'articles': [article([
            ['h2', 'Gameplay Balance'], ['h3', 'Eternals:'], ['h4', 'Major Blessing:'], ['blockquote', '- Max Health decreased from 5% to 4%.'],
        ])]})
        self.assertEqual([(r['kind'], r['key']) for r in b['official_changes']], [('unmapped', None)])


if __name__ == '__main__':
    unittest.main()
