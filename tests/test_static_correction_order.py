"""The 1.17 supplement's corrections run after the Pred.gg mechanics pass at publication, as at collection, and the
official correction notice describes only the packet's own unresolved corrections.

Found on 3 Oct 2026, after the first scheduled recheck merged (PR #112): the publication replay (full_review_replay)
ran patch_support.apply inside enrich_bundle, before apply_pred_game_data added the Pred.gg-only loadout rows, and
never again. Peal, Hellfire Strikes, Shred Spree, Vital Essence and Terminal Treatment then read "conflict: source
field missing" on the live site (the set varied by rank) although every row was present. A fresh collection applies
the supplement a second time after the Pred.gg pass. Separately, the "Official correction review" notice named
Psychosis on every rank after its receipt had been verified ("source already updated"), because the Pred.gg
reconciliation kept the notice while any receipt conflicted, counting the supplement's receipts too. Synthetic
bundles; no statistics are involved."""
import copy
import json
import unittest
from pathlib import Path
from unittest.mock import patch

import predecessor_meta as m
from test_static_publication_guidance import collected

ROOT = Path(__file__).resolve().parents[1]
NOTICE = 'Official correction review'


class ReplayOrder(unittest.TestCase):
    def test_the_supplement_is_applied_after_the_pred_mechanics_pass(self):
        calls = []
        def enrich(out, official):
            calls.append('enrich')
            out['guidance'] = {'builds': []}
        with patch.object(m, 'enrich_bundle', side_effect=enrich), \
                patch.object(m, 'apply_pred_game_data', side_effect=lambda b: calls.append('pred')), \
                patch.object(m.patch_support, 'apply', side_effect=lambda b, *a: calls.append('supplement')):
            m.full_review_replay(collected(guidance_fingerprint='an-older-packet'))
        self.assertIn('supplement', calls)
        self.assertGreater(len(calls) - 1 - calls[::-1].index('supplement'), calls.index('pred'),
                           'patch_support.apply must run after apply_pred_game_data, as in a fresh collection')

    def test_a_pred_only_perk_is_corrected_on_replay(self):
        # The second supplement pass sees the row the Pred.gg pass added, so its receipt is not left as "missing".
        supplement = m.patch_support.load()
        rule = next(r for r in supplement['corrections'] if r['id'] == 'patch-1.17-perks-peal-description')
        key = rule['path'][1]
        source_text = (rule.get('accepted_before') or [rule['before']])[-1]
        def enrich(out, official):
            out['guidance'] = {'builds': []}
            out['corrections'] = [{'id': rule['id'], 'path': rule['path'], 'status': 'conflict: source field missing'}]
            out.setdefault('errors', []).append({'source': 'Official 1.17 mechanics reconciliation', 'severity': 'warning',
                                                 'detail': 'Unmatched source fields: ' + rule['id'] + '.'})
        def pred(out):
            out.setdefault('perks', {})[key] = {'name': 'Peal', 'description': source_text, 'pred_source': {'url': 'https://pred.gg/eternals?version=168'}}
        def supplement_pass(out, *args):
            # The real corrections step, without the plan validation that needs a full collected bundle.
            value = out['perks'][key]['description']
            receipt = next(c for c in out['corrections'] if c['id'] == rule['id'])
            if value == rule['before'] or value in rule.get('accepted_before', []):
                out['perks'][key]['description'] = rule['after']
                receipt.update(status='official correction applied', original=value)
            out['errors'] = [e for e in out['errors'] if e['source'] != 'Official 1.17 mechanics reconciliation']
        with patch.object(m, 'enrich_bundle', side_effect=enrich), patch.object(m, 'apply_pred_game_data', side_effect=pred), \
                patch.object(m.patch_support, 'apply', side_effect=supplement_pass):
            out = m.full_review_replay(collected(guidance_fingerprint='an-older-packet'))
        self.assertEqual(out['perks'][key]['description'], rule['after'])
        self.assertEqual(next(c for c in out['corrections'] if c['id'] == rule['id'])['status'], 'official correction applied')
        self.assertFalse(any(e['source'] == 'Official 1.17 mechanics reconciliation' for e in out['errors']))


class CorrectionNotice(unittest.TestCase):
    def setUp(self):
        packet = json.loads((ROOT / 'reviewed_guidance.json').read_text(encoding='utf-8'))
        self.rule = next(r for r in packet['corrections'] if r['id'] == '1.16.4-17')  # Psychosis, 1.16.4
        supplement = m.patch_support.load()
        self.supp = next(r for r in supplement['corrections'] if r['id'] == 'patch-1.17-perks-peal-description')

    def bundle(self, psychosis_text):
        key = self.rule['path'][1]
        return {'official': {'status': 'verified', 'articles': [], 'definition_history': {'articles': []}},
                'guidance': {'status': 'reviewed for current patch'}, 'items': {}, 'mechanics_resolutions': [],
                'perks': {key: {'description': psychosis_text, 'pred_source': {'url': 'https://pred.gg/eternals?version=168', 'fetched_at': '2026-10-02T13:20:51-05:00'}}},
                'corrections': [{'id': self.rule['id'], 'path': self.rule['path'], 'status': 'conflict: field unavailable', 'before': self.rule['before'], 'after': self.rule['after']},
                                {'id': self.supp['id'], 'path': self.supp['path'], 'status': 'conflict: source field missing'}],
                'errors': [{'source': NOTICE, 'severity': 'warning', 'detail': 'Correction could not be verified for Psychosis, Peal. ...'}]}

    def test_a_verified_packet_correction_clears_the_notice_despite_a_supplement_conflict(self):
        b = self.bundle(self.rule['after'])
        m.apply_pred_source_corrections(b)
        self.assertEqual(b['corrections'][0]['status'], 'source already updated')
        # The supplement's own conflict is reported by its reconciliation notice, not by this one.
        self.assertEqual([e for e in b['errors'] if e['source'] == NOTICE], [])

    def test_an_unresolved_packet_correction_keeps_a_notice_naming_only_it(self):
        b = self.bundle('An unrelated source text')
        m.apply_pred_source_corrections(b)
        notices = [e for e in b['errors'] if e['source'] == NOTICE]
        self.assertEqual(len(notices), 1)
        self.assertIn('Psychosis', notices[0]['detail'])
        self.assertNotIn('Peal', notices[0]['detail'])

    def test_enrichment_names_only_packet_corrections(self):
        b = {'corrections': [{'id': self.rule['id'], 'path': self.rule['path'], 'status': 'conflict: field unavailable'},
                             {'id': self.supp['id'], 'path': self.supp['path'], 'status': 'conflict: source field missing'}],
             'errors': [{'source': NOTICE, 'severity': 'warning', 'detail': 'stale'}]}
        m.refresh_correction_notice(b, {self.rule['id']})
        notices = [e for e in b['errors'] if e['source'] == NOTICE]
        self.assertEqual(len(notices), 1)
        self.assertIn('Psychosis', notices[0]['detail'])
        self.assertNotIn('Peal', notices[0]['detail'])
        m.refresh_correction_notice(b, set())
        self.assertEqual([e for e in b['errors'] if e['source'] == NOTICE], [])


if __name__ == '__main__':
    unittest.main()
