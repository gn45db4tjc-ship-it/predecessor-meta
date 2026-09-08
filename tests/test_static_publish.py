"""Synthetic unit fixtures only; no external calls and no claimed game statistics."""
import concurrent.futures
import copy
import datetime as dt
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import static_publish as s

NOW = dt.datetime(2026, 9, 8, 18, tzinfo=dt.timezone.utc)


def official(version='1.2', fingerprint='a'):
    live = {'version': version, 'fingerprint': fingerprint, 'status': 'live',
            'url': 'https://www.predecessorgame.com/en-US/news/patch-notes/example', 'blocks': []}
    return {'status': 'verified', 'checked_at': NOW.isoformat(), 'live': live, 'articles': [live]}


def bundle(bracket='gold'):
    return {'schema': 3, 'generated_at': NOW.isoformat(), 'patch': '1.2',
            'bracket': {'segment': bracket, 'label': bracket.capitalize()+'+'},
            'heroes': {'unit-test-fixture': {'display_name': 'Synthetic fixture'}},
            'tier_list': [{'slug': 'unit-test-fixture', 'role': 'jungle'}],
            'official': official(), 'errors': [], 'pairs': {},
            'sources': {'statz_tierlist': {'status': 'ok'}, 'statz_hero_pages': {'status': 'ok'},
                        'omeda_heroes': {'status': 'ok'}}}


class ScheduleTests(unittest.TestCase):
    def setUp(self):
        self.o = official()
        self.state = {'last_full_attempt_at': NOW.isoformat(),
                      'last_attempted_signature': s.live_signature(self.o)}

    def test_initial_run_collects_even_before_daily_time(self):
        self.assertEqual(s.collection_reason({}, self.o, NOW.replace(hour=8)), 'Daily update')

    def test_one_daily_attempt_then_wait(self):
        self.assertIsNone(s.collection_reason(self.state, self.o, NOW+dt.timedelta(hours=6)))
        self.assertEqual(s.collection_reason(self.state, self.o, NOW+dt.timedelta(days=1)), 'Daily update')

    def test_daily_boundary_is_utc_across_local_dst_offsets(self):
        for stamp in ['2026-09-09T12:24:00-05:00', '2026-11-09T11:24:00-06:00']:
            boundary = s.daily_boundary(dt.datetime.fromisoformat(stamp))
            self.assertEqual((boundary.hour, boundary.minute), (17, 23))

    def test_new_live_patch_triggers_extra_collection(self):
        self.assertIn('patch', s.collection_reason(self.state, official('1.3'), NOW))

    def test_same_version_hotfix_article_change_triggers_once(self):
        changed = official(fingerprint='changed')
        self.assertIn('hotfix', s.collection_reason(self.state, changed, NOW))
        self.state['last_attempted_signature'] = s.live_signature(changed)
        self.assertIsNone(s.collection_reason(self.state, changed, NOW))

    def test_future_announcements_do_not_trigger_extra_scrape(self):
        changed = copy.deepcopy(self.o)
        changed['articles'].append({'version':'9.9', 'status':'announced', 'fingerprint':'future'})
        self.assertEqual(s.live_signature(changed), s.live_signature(self.o))
        self.assertIsNone(s.collection_reason(self.state, changed, NOW))
        self.assertEqual(s.patch_summary(changed)['announcements'][0]['version'], '9.9')

    def test_failed_attempt_is_not_retried_every_patch_check(self):
        self.state['attempts'] = {'gold': {'status':'failed'}}
        self.assertIsNone(s.collection_reason(self.state, self.o, NOW+dt.timedelta(hours=3)))

    def test_unverified_patch_cannot_trigger_patch_collection(self):
        self.assertIsNone(s.collection_reason(self.state, {'status':'failed'}, NOW))

    def test_patch_catchup_waits_six_hours_and_stops_after_success(self):
        self.state['patch_transition_at'] = NOW.isoformat()
        self.assertIsNone(s.collection_reason(self.state, self.o, NOW+dt.timedelta(hours=3)))
        self.assertEqual(s.collection_reason(self.state, self.o, NOW+dt.timedelta(hours=6)), 'Patch-day source catch-up')
        self.state['last_completed_signature'] = s.live_signature(self.o)
        self.assertIsNone(s.collection_reason(self.state, self.o, NOW+dt.timedelta(hours=6)))

    def test_source_block_prevents_extra_patch_day_retry(self):
        self.state.update(patch_transition_at=NOW.isoformat(), blocked_in_last_full=True)
        self.assertIsNone(s.collection_reason(self.state, self.o, NOW+dt.timedelta(hours=6)))

    def test_patch_catchup_window_ends_after_48_hours(self):
        self.state.update(patch_transition_at=(NOW-dt.timedelta(hours=49)).isoformat())
        self.assertIsNone(s.collection_reason(self.state, self.o, NOW+dt.timedelta(hours=6)))

    def test_manual_retry_is_explicit(self):
        self.assertEqual(s.collection_reason(self.state, self.o, NOW, True), 'Manual update')

    def test_naive_timestamp_rejected(self):
        with self.assertRaises(ValueError): s.utc_time('2026-09-08T12:00:00')


class CacheTests(unittest.TestCase):
    def test_parallel_and_cross_cohort_requests_are_deduplicated(self):
        calls = []
        fetch = s.RunFetchCache(lambda url: calls.append(url) or ('content', {}, 1))
        with concurrent.futures.ThreadPoolExecutor(5) as pool:
            results = list(pool.map(fetch, ['https://example.test/a']*10))
        self.assertEqual(len(calls), 1)
        self.assertEqual(len(results), 10)

    def test_block_stops_every_later_url_on_that_host(self):
        calls = []
        def download(url):
            calls.append(url)
            if 'blocked.test' in url: raise s.base.SourceBlocked('HTTP 429')
            return 'ok'
        fetch = s.RunFetchCache(download)
        for url in ['https://blocked.test/a', 'https://blocked.test/b']:
            with self.assertRaises(s.base.SourceBlocked): fetch(url)
        self.assertEqual(fetch('https://other.test/a'), 'ok')
        self.assertEqual(len(calls), 2)

    def test_failed_url_is_not_retried_within_run(self):
        calls=[]
        def fail(url):
            calls.append(url); raise OSError('Connection reset')
        fetch=s.RunFetchCache(fail)
        for _ in range(2):
            with self.assertRaises(OSError): fetch('https://example.test/a')
        self.assertEqual(len(calls), 1)


class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name); self.state=self.root/'state'; self.out=self.root/'site'
        for field in ['DATA_DIR','SNAP_DIR','LATEST_BUNDLE','SETTINGS_FILE','OUT_HTML']:
            self.addCleanup(setattr, s.base, field, getattr(s.base, field))

    def test_public_seed_preserves_dates_and_excludes_owner_state(self):
        b=bundle(); b['settings']={'secret':'private'}; b['planner_state']={'private':'draft'}
        original=copy.deepcopy(b)
        s.retain_success(b,self.state)
        got=s.load_success(self.state,'gold')
        self.assertNotIn('settings',got); self.assertNotIn('planner_state',got)
        self.assertEqual(got['generated_at'],b['generated_at']); self.assertEqual(b,original)

    def test_failed_or_wrong_cohort_cannot_replace_success(self):
        b=bundle(); s.retain_success(b,self.state)
        broken=copy.deepcopy(b); broken['errors']=[{'severity':'error','detail':'HTTP 503'}]
        with self.assertRaises(ValueError): s.retain_success(broken,self.state)
        self.assertEqual(s.load_success(self.state,'gold'),b)
        with self.assertRaises(ValueError): s.validate_public_bundle(b,'silver')

    def test_zero_rows_and_heroes_are_not_publishable(self):
        for field, value in [('tier_list',[]),('heroes',{})]:
            b=bundle();b[field]=value
            with self.assertRaises(ValueError): s.retain_success(b,self.state)

    def test_immutable_bundle_hash_and_missing_cohort(self):
        s.retain_success(bundle(),self.state)
        manifest=s.render_site(self.state,self.out,{'patch_check':s.patch_summary(official())})
        entry=manifest['cohorts']['gold'];raw=(self.out/entry['url']).read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(),entry['sha256'])
        self.assertEqual(manifest['cohorts']['diamond']['status'],'unavailable')
        html=(self.out/'index.html').read_text(encoding='utf8')
        self.assertIn('"mode":"static"',html);self.assertIn('function checkPublication()',html)
        self.assertNotIn('Synthetic fixture',html)  # lightweight shell; data separate

    def test_no_success_does_not_publish_blank_site(self):
        manifest=s.render_site(self.state,self.out,{})
        self.assertFalse((self.out/'index.html').exists())
        self.assertTrue(all(v['status']=='unavailable' for v in manifest['cohorts'].values()))

    def test_daily_failure_retains_bundle_and_records_source_error(self):
        s.retain_success(bundle(),self.state)
        bad=bundle();bad['errors']=[{'source':'Pred.gg','severity':'error','detail':'HTTP 503'}]
        config=dict(s.CONFIG,brackets=['gold'])
        with patch.object(s,'CONFIG',config),patch.object(s.base,'now_utc',return_value=NOW),patch.object(s.base,'fetch_official',return_value=official()),patch.object(s.base,'collect_bundle',return_value=bad):
            manifest=s.run(self.state,self.out)
        entry=manifest['cohorts']['gold']
        self.assertEqual(entry['last_attempt']['status'],'failed')
        self.assertEqual(entry['last_attempt']['errors'][0]['source'],'Pred.gg')
        self.assertEqual(s.load_success(self.state,'gold')['generated_at'],NOW.isoformat())

    def test_patch_only_run_never_collects_stats_or_advances_bundle_date(self):
        s.retain_success(bundle(),self.state)
        s.write_json(self.state/'publication.json',{'schema':1,'attempts':{},
            'last_full_attempt_at':NOW.isoformat(),'last_attempted_signature':s.live_signature(official())})
        with patch.object(s.base,'now_utc',return_value=NOW),patch.object(s.base,'fetch_official',return_value=official()),patch.object(s.base,'collect_bundle') as collect:
            manifest=s.run(self.state,self.out)
        collect.assert_not_called()
        self.assertEqual(manifest['cohorts']['gold']['generated_at'],NOW.isoformat())

    def test_exception_is_checkpointed_and_other_cohorts_continue(self):
        config=dict(s.CONFIG,brackets=['gold','silver'])
        with patch.object(s,'CONFIG',config),patch.object(s.base,'now_utc',return_value=NOW),patch.object(s.base,'fetch_official',return_value=official()),patch.object(s.base,'collect_bundle',side_effect=[OSError('broken source'),bundle('silver')]):
            manifest=s.run(self.state,self.out)
        self.assertEqual(manifest['cohorts']['gold']['status'],'unavailable')
        self.assertEqual(manifest['cohorts']['silver']['status'],'available')
        self.assertEqual(s.read_json(self.state/'publication.json')['attempts']['gold']['status'],'failed')

    def test_official_only_check_does_not_record_full_attempt(self):
        s.retain_success(bundle(), self.state)
        with patch.object(s.base,'fetch_official',return_value=official()),patch.object(s.base,'collect_bundle') as collect:
            s.run(self.state,self.out,check_only=True)
        collect.assert_not_called()
        self.assertNotIn('last_full_attempt_at',s.read_json(self.state/'publication.json'))

    def test_activity_record_contains_no_source_payload_or_owner_state(self):
        import publication_activity
        s.write_json(self.root/'.cloud-state'/'publication.json',{'last_full_attempt_at':NOW.isoformat(),
            'settings':{'secret':'do not publish'}, 'patch_check':{'status':'verified','raw':'unpublished'},
            'attempts':{'gold':{'status':'ok','errors':[{'private':'unpublished'}]}}})
        result=publication_activity.record(self.root)
        self.assertEqual(set(result), {'last_full_attempt_at','patch_check_status','brackets'})
        self.assertNotIn('unpublished',json.dumps(result))

    def test_failed_patch_check_retains_previous_verification_separately(self):
        s.retain_success(bundle(),self.state)
        previous=s.patch_summary(official())
        s.write_json(self.state/'publication.json',{'schema':1,'attempts':{},'last_verified_patch_check':previous})
        with patch.object(s.base,'fetch_official',side_effect=OSError('official source unavailable')):
            manifest=s.run(self.state,self.out,check_only=True)
        self.assertEqual(manifest['patch_check']['status'],'failed')
        self.assertEqual(manifest['last_verified_patch_check'],previous)


if __name__=='__main__': unittest.main()
