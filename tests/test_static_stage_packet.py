"""The committed seed is staged with its own dated review packet; production always reads the current packet."""
import gzip
import json
import unittest
from pathlib import Path
import predecessor_meta as m
import stage_preview

ROOT = Path(__file__).resolve().parents[1]


class StagePacketTests(unittest.TestCase):
    def test_production_reads_the_current_packet(self):
        self.assertIsNone(m.GUIDANCE_PACKET_OVERRIDE)
        self.assertEqual(m.guidance_packet_path(), m.TOOL_DIR / 'reviewed_guidance.json')

    def test_historical_packet_matches_the_committed_seed(self):
        packet = json.loads(gzip.decompress(stage_preview.HISTORICAL_PACKET.read_bytes()))
        seed = json.loads(gzip.decompress((ROOT / 'public-seed-gold.json.gz').read_bytes()))
        m.validate_guidance_packet(packet, None)
        # The seed was collected on live 1.16.4 and the fixture is the 14 Sep 1.16.4 review released in 2.33.0.
        self.assertEqual(packet['patch'], seed['official']['live']['version'])
        self.assertTrue(packet['reviewed_at'].startswith('2026-09-14'))
        # The fixture is dated history, never the review the app currently ships.
        current = json.loads((ROOT / 'reviewed_guidance.json').read_text(encoding='utf-8'))
        self.assertNotEqual(current['reviewed_at'], packet['reviewed_at'])


if __name__ == '__main__':
    unittest.main()
