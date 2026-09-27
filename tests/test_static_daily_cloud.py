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

    def test_policy_enables_cloud_and_optional_public_pred(self):
        self.assertIsNone(p.CONFIG['cloud_collection_paused_reason'])
        self.assertEqual(set(p.CONFIG['brackets']),set(p.base.BRACKETS))
        self.assertIsNone(p.CONFIG['pred_collection_paused_reason'])
        self.assertTrue(p.CONFIG['pred_optional'])
        self.assertEqual(p.CONFIG['pred_access_mode'],'public_pages_only')

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
            self.assertIsNone(settings['pred_collection_paused_reason'])
            b=partial();b['bracket']['segment']=settings['bracket']
            return b
        with patch.object(p.base,'fetch_official',return_value=official()), \
             patch.object(p.base,'now_utc',return_value=NOW), \
             patch.object(p.base,'collect_bundle',side_effect=collect) as fetch:
            m=p.run(self.root,self.root/'site')
            self.assertEqual(fetch.call_count,6)
            self.assertEqual(m['collection_host'],'cloud')
            self.assertEqual(m['source_pauses'],{})
            self.assertEqual(m['optional_sources']['pred']['mode'],'public_pages_only')
            self.assertTrue(all(r['collection_status']=='partial' for r in m['cohorts'].values()))
            for r in m['cohorts'].values():
                self.assertEqual(r['source_dates']['statz_tierlist']['fetched_at'],NOW.isoformat())
                self.assertIsNone(r['source_dates']['pred_scoped']['fetched_at'])
            p.run(self.root,self.root/'site')
            self.assertEqual(fetch.call_count,6)
        state=p.read_json(self.root/'publication.json')
        self.assertEqual(state['last_completed_signature'],p.live_signature(official()))

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

    # 2.37.2: the cloud's own Pred.gg attempt always fails (public pages refuse its TLS stack), so its 17:23 daily run
    # replaced the Windows collector's Pred.gg data with a "retained" copy and hid every tier until the Windows daily
    # collection arrived (about 1h40m each day). While the Windows collector is connected and recent, the cloud's
    # daily run waits for it for a grace period, then collects as before. Only the daily reason waits.
    def waiting_state(self,now,checked_hours_ago=1):
        return {'last_full_attempt_at':(now-dt.timedelta(hours=23)).isoformat(),
                'last_attempted_signature':p.live_signature(official()),
                'local_collector':{'checked_at':(now-dt.timedelta(hours=checked_hours_ago)).isoformat(),'status':'connected','results':{}}}

    def test_cloud_daily_run_waits_for_a_connected_windows_collector(self):
        boundary=p.daily_boundary(NOW)+dt.timedelta(days=1)
        with patch.dict('os.environ',{'GITHUB_ACTIONS':'true'}):
            for after in (dt.timedelta(minutes=10),dt.timedelta(hours=3)):
                now=boundary+after
                self.assertIsNone(p.collection_reason(self.waiting_state(now),official(),now),after)
            late=boundary+dt.timedelta(hours=6)
            self.assertEqual(p.collection_reason(self.waiting_state(late),official(),late),'Daily update')

    def test_cloud_daily_run_does_not_wait_for_a_silent_collector_or_on_windows(self):
        now=p.daily_boundary(NOW)+dt.timedelta(days=1,minutes=10)
        with patch.dict('os.environ',{'GITHUB_ACTIONS':'true'}):
            self.assertEqual(p.collection_reason(self.waiting_state(now,checked_hours_ago=5),official(),now),'Daily update')
            gone=self.waiting_state(now);gone['local_collector']['status']='disconnected'
            self.assertEqual(p.collection_reason(gone,official(),now),'Daily update')
            self.assertEqual(p.collection_reason(self.waiting_state(now),official(),now,manual=True),'Manual update')
        with patch.dict('os.environ',{'GITHUB_ACTIONS':''}):
            # The Windows collector runs the same code and must still collect at the boundary.
            self.assertEqual(p.collection_reason(self.waiting_state(now),official(),now),'Daily update')

    def test_a_changed_patch_article_is_collected_while_the_daily_run_waits(self):
        now=p.daily_boundary(NOW)+dt.timedelta(days=1,minutes=10)
        state=self.waiting_state(now);state['last_attempted_signature']='an older article'
        with patch.dict('os.environ',{'GITHUB_ACTIONS':'true'}):
            self.assertEqual(p.collection_reason(state,official(),now),'Live patch or hotfix article changed')


if __name__=='__main__':unittest.main()
