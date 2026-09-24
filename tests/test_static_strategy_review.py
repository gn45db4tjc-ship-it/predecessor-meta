import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import predecessor_meta as m

class SnapshotTimezoneTests(unittest.TestCase):
    def test_utc_and_windows_offsets_are_ordered_by_instant(self):
        row={'slug':'fixture','role':'jungle','tier':'A','winRate':50,'pickRate':1,'matches':100}
        with tempfile.TemporaryDirectory() as folder, patch.object(m,'SNAP_DIR',Path(folder)):
            for i,stamp in enumerate(['2026-09-14T18:30:00Z','2026-09-14T14:00:00-05:00','2026-09-14T16:00:00-05:00']):
                (Path(folder)/f'tierlist_{i}.json').write_text(json.dumps({'bracket':'gold','fetched_at':stamp,'patch':'1.16','rows':[row]}))
            now={'fetched_at':'2026-09-14T20:00:00Z','patch':'1.16','rows':[row]}
            result=m.compute_changes(now,'gold')
            self.assertEqual(result['vs_previous_run']['from']['fetched_at'],'2026-09-14T14:00:00-05:00')
            self.assertEqual(result['snapshots_on_disk'],3)

    def test_timezone_missing_is_not_silently_assumed(self):
        with self.assertRaisesRegex(ValueError,'timezone'):
            m.compute_changes({'fetched_at':'2026-09-14T12:00:00'},'gold')

class ReviewLedgerTests(unittest.TestCase):
    def setUp(self):
        self.packet=json.loads((Path(m.__file__).parent/'reviewed_guidance.json').read_text(encoding='utf8'))

    def test_all_plans_have_dated_evidence_and_mechanic_preconditions(self):
        m.validate_guidance_packet(self.packet,None)
        plans=self.packet['guidance']['builds']
        self.assertEqual(len(plans),96)
        for p in plans:
            self.assertEqual(set(p['source_preconditions']['items']),set(p['core']+p['finish']+[p['crest']]))
            self.assertEqual(set(p['source_preconditions']['perks']),set([p['augment'],p['eternal']]+p['blessings']))
            self.assertEqual([n['item'] for n in p['item_notes']],p['core']+p['finish'])
            if p['maintenance_review']['result']=='unresolved':self.assertTrue(p['maintenance_review']['limitation'])

    def test_missing_wins_are_rejected_in_review_references(self):
        del self.packet['guidance']['builds'][0]['maintenance_review']['rank_samples'][0]['wonGames']
        with self.assertRaises(ValueError):m.validate_guidance_packet(self.packet,None)

    def test_duplicate_bracket_cannot_masquerade_as_six_brackets(self):
        rows=self.packet['guidance']['builds'][0]['maintenance_review']['rank_samples']
        rows[1]=copy.deepcopy(rows[0])
        with self.assertRaisesRegex(ValueError,'six brackets'):m.validate_guidance_packet(self.packet,None)

    def test_unresolved_result_requires_reason_and_totals_must_match(self):
        self.packet['guidance']['builds'][0]['maintenance_review'].update(result='unresolved',limitation='')
        with self.assertRaisesRegex(ValueError,'explicit limitation'):m.validate_guidance_packet(self.packet,None)

    def test_strategy_review_keeps_next_sunday(self):
        review=self.packet['guidance']['maintenance_review']
        self.assertEqual(review['kind'],'1.17 strategy review')
        self.assertEqual(review['next_weekly_review'],'2026-09-27T13:15:00-05:00')
