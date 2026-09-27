"""A hero missing from Omeda but kitted by Pred.gg is not reported as having no kit data (Valmont, 1.17)."""
import inspect
import unittest

import predecessor_meta as m

GAP = {'source': 'join statz<->omeda', 'severity': 'warning', 'detail': 'statz heroes with no omeda match (no kit data): valmont'}


def bundle(*errors):
    return {'errors': [dict(e) for e in errors]}


class OmedaJoinNote(unittest.TestCase):
    def test_a_pred_kit_replaces_the_no_kit_claim(self):
        b = bundle(GAP)
        m.reword_omeda_join(b, {'valmont', 'gideon'})
        self.assertEqual(b['errors'], [dict(GAP, detail='not on Omeda yet; kit from Pred.gg: valmont')])

    def test_heroes_without_any_kit_keep_the_warning(self):
        b = bundle(dict(GAP, detail='statz heroes with no omeda match (no kit data): newhero, valmont'))
        m.reword_omeda_join(b, {'valmont'})
        self.assertEqual(b['errors'][0]['detail'],
                         'statz heroes with no omeda match (no kit data): newhero; not on Omeda yet; kit from Pred.gg: valmont')

    def test_without_pred_kits_nothing_changes(self):
        other = {'source': 'join statz<->omeda', 'detail': 'omeda heroes with no statz match: kira'}
        b = bundle(GAP, other)
        m.reword_omeda_join(b, set())
        self.assertEqual(b['errors'], [GAP, other])

    def test_only_the_join_warning_is_touched(self):
        lookalike = dict(GAP, source='statz.gg hero pages')
        b = bundle(lookalike)
        m.reword_omeda_join(b, {'valmont'})
        self.assertEqual(b['errors'], [lookalike])

    def test_it_runs_after_validated_pred_kits_are_applied(self):
        source = inspect.getsource(m.attach_pred_game_data)
        self.assertLess(source.index('apply_pred_game_data(staged)'), source.index("reword_omeda_join(bundle,set(out['heroes']))"))


if __name__ == '__main__':
    unittest.main()
