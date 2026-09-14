"""Daily cloud policy with synthetic fixtures; no external requests or credentials."""
import copy
import datetime as dt
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import static_publish as p
import local_updater as updater
from import_local_feed import import_feed
from test_static_publish import bundle, official, NOW
from test_static_independent_sources import partial


class DailyCloudTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)

    def test_policy_enables_cloud_for_every_bracket_and_pauses_only_pred(self):
        self.assertIsNone(p.CONFIG['cloud_collection_paused_reason'])
        self.assertEqual(set(p.CONFIG['brackets']),set(p.base.BRACKETS))
        self.assertTrue(p.CONFIG['pred_collection_paused_reason'])

    def test_paused_pred_sends_no_request_even_with_forced_refresh(self):
        fetch=Mock(side_effect=AssertionError('No network permitted'))
        pages=p.base.PredPages(force=True,cache_dir=self.root,fetch=fetch,paused_reason='Access needed')
        for url in ('https://pred.gg/heroes','https://pred.gg/items'):
            with self.assertRaisesRegex(p.base.FetchError,'No request was sent'):
                pages.get(url,ttl=0)
        fetch.assert_not_called()
        self.assertEqual(pages.records,[])

    def test_paused_pred_partitions_are_failed_with_no_fake_fetch_dates(self):
        fetch=Mock(side_effect=AssertionError('No network permitted'))
        pages=p.base.PredPages(fetch=fetch,cache_dir=self.root,paused_reason='Access needed')
        b=partial()
        p.base.attach_scoped_statistics(b,pages=pages)
        p.base.attach_pred_game_data(b,pages=pages)
        fetch.assert_not_called()
        for name in ('pred_scoped','pred_game_data'):
            self.assertEqual(b['sources'][name]['status'],'failed')
            self.assertIsNone(b['sources'][name].get('fetched_at'))
        self.assertTrue(any('Access needed' in e['detail'] for e in b['errors']))

    def test_all_cohorts_publish_partial_then_next_check_does_not_recollect(self):
        def collect(settings,progress):
            self.assertTrue(settings['pred_collection_paused_reason'])
            b=partial();b['bracket']['segment']=settings['bracket']
            return b
        with patch.object(p.base,'fetch_official',return_value=official()), \
             patch.object(p.base,'now_utc',return_value=NOW), \
             patch.object(p.base,'collect_bundle',side_effect=collect) as fetch:
            m=p.run(self.root,self.root/'site')
            self.assertEqual(fetch.call_count,6)
            self.assertEqual(m['collection_host'],'cloud')
            self.assertTrue(m['source_pauses']['pred'])
            self.assertTrue(all(r['collection_status']=='partial' for r in m['cohorts'].values()))
            for r in m['cohorts'].values():
                self.assertEqual(r['source_dates']['statz_tierlist']['fetched_at'],NOW.isoformat())
                self.assertIsNone(r['source_dates']['pred_scoped']['fetched_at'])
            p.run(self.root,self.root/'site')
            self.assertEqual(fetch.call_count,6)
        state=p.read_json(self.root/'publication.json')
        self.assertNotIn('last_completed_signature',state)

    def make_feed(self):
        local=self.root/'local';feed=self.root/'feed'
        p.retain_success(bundle(),local)
        p.write_json(local/'publication.json',{
            'patch_check':p.patch_summary(official()),'last_full_attempt_at':NOW.isoformat(),
            'last_full_seconds':9,'attempts':{'gold':{'status':'ok','at':NOW.isoformat(),'errors':[]}}})
        updater.export_feed(local,feed)
        return feed

    def test_old_windows_receipt_cannot_reset_cloud_daily_clock_or_status(self):
        feed=self.make_feed();cloud=self.root/'cloud'
        newer=NOW+dt.timedelta(days=2)
        attempt={'status':'partial','at':newer.isoformat(),'errors':[{'source':'Pred.gg'}]}
        state={'last_full_attempt_at':newer.isoformat(),'last_full_seconds':31,
               'last_attempted_signature':p.live_signature(official()),'attempts':{'gold':attempt}}
        p.write_json(cloud/'publication.json',state)
        for _ in range(2):import_feed(feed,cloud)
        got=p.read_json(cloud/'publication.json')
        self.assertEqual(got['last_full_attempt_at'],newer.isoformat())
        self.assertEqual(got['last_full_seconds'],31)
        self.assertEqual(got['attempts']['gold'],attempt)
        self.assertIsNone(p.collection_reason(got,official(),newer+dt.timedelta(hours=3)))

    def test_new_windows_attempt_advances_clock_and_keeps_complete_bundle(self):
        feed=self.make_feed();cloud=self.root/'cloud'
        p.write_json(cloud/'publication.json',{'last_full_attempt_at':(NOW-dt.timedelta(days=1)).isoformat(),
                                              'attempts':{}})
        import_feed(feed,cloud)
        got=p.read_json(cloud/'publication.json')
        self.assertEqual(got['last_full_attempt_at'],NOW.isoformat())
        self.assertEqual(got['attempts']['gold']['status'],'ok')
        self.assertEqual(p.load_success(cloud,'gold')['generated_at'],NOW.isoformat())


if __name__=='__main__':unittest.main()
