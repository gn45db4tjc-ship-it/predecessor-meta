"""Optional public-source boundaries; synthetic fixtures, no live network."""
import copy
import datetime as dt
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import static_publish as p
from test_static_publish import NOW, official
from test_static_independent_sources import partial


class PublicPredTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)

    def test_api_auth_external_and_unknown_routes_never_fetch(self):
        fetch=Mock()
        pages=p.base.PredPages(cache_dir=self.root,fetch=fetch)
        for route in ('/gql','/api/heroes','/login','/heroes?token=private','/heroes?auth=',
                      '/heroes/../api','/heroes/muriel/account','/heroes#auth'):
            with self.subTest(route=route),self.assertRaisesRegex(ValueError,'public game pages only'):
                pages.get('https://pred.gg'+route)
        for url in ('http://pred.gg/heroes','https://other.test/heroes','https://user:pass@pred.gg/heroes'):
            with self.assertRaises(ValueError):pages.get(url)
        fetch.assert_not_called()

    def test_public_embedded_data_is_read_once_and_dates_are_preserved(self):
        data={'NewestVersion':{'name':'synthetic'},'versions':[]}
        raw='<script type="application/json" data-sveltekit-fetched>'+json.dumps(
            {'status':200,'body':json.dumps({'data':data})})+'</script>'
        fetch=Mock(return_value=(raw,200,.1))
        with patch.object(p.base,'now_utc',return_value=NOW):
            pages=p.base.PredPages(cache_dir=self.root,fetch=fetch)
            first=pages.get('https://pred.gg/heroes');second=pages.get('https://pred.gg/heroes')
            cached=p.base.PredPages(cache_dir=self.root,fetch=fetch).get('https://pred.gg/heroes')
        fetch.assert_called_once_with('https://pred.gg/heroes')
        self.assertEqual(first['payloads'],[data]);self.assertEqual(first,second)
        self.assertEqual(cached['fetched_at'],first['fetched_at']);self.assertTrue(cached['cache_hit'])

    def test_bootloader_is_one_request_across_both_partitions_and_six_brackets(self):
        fetch=Mock(return_value=('<html><script src="/app.js"></script></html>',200,.1))
        run_cache=p.RunFetchCache(fetch)
        for bracket in p.CONFIG['brackets']:
            pages=p.base.PredPages(cache_dir=self.root,fetch=run_cache)
            b=partial();b['bracket']['segment']=bracket
            p.base.attach_scoped_statistics(b,pages=pages)
            p.base.attach_pred_game_data(b,pages=pages)
            self.assertTrue(any('no structured page responses' in e['detail'] for e in b['errors']))
            self.assertIsNone(b['sources']['pred_scoped']['fetched_at'])
            self.assertIsNone(b['sources']['pred_game_data']['fetched_at'])
        fetch.assert_called_once_with('https://pred.gg/heroes')
        self.assertFalse((self.root/'public-access.json').exists())

    def test_public_http_denial_survives_new_instance_and_force(self):
        for status in (401,403,429):
            with self.subTest(status=status):
                root=self.root/str(status)
                error=(p.base.FetchError if status==401 else p.base.SourceBlocked)(f'HTTP {status} for https://pred.gg/heroes')
                fetch=Mock(side_effect=error)
                pages=p.base.PredPages(cache_dir=root,fetch=fetch)
                with self.assertRaises(p.base.FetchError):pages.get('https://pred.gg/heroes')
                later=p.base.PredPages(force=True,cache_dir=root,fetch=fetch)
                with self.assertRaisesRegex(p.base.FetchError,'No request was sent'):later.get('https://pred.gg/items')
                fetch.assert_called_once()
                state=json.loads((root/'public-access.json').read_text(encoding='utf-8'))
                self.assertEqual(state['status'],'blocked');self.assertIn(str(status),state['reason'])

    def test_embedded_denial_stops_later_requests(self):
        raw='<script type="application/json" data-sveltekit-fetched>'+json.dumps({'status':403})+'</script>'
        fetch=Mock(return_value=(raw,200,.1));pages=p.base.PredPages(cache_dir=self.root,fetch=fetch)
        with self.assertRaises(p.base.SourceBlocked):pages.get('https://pred.gg/heroes')
        with self.assertRaises(p.base.SourceBlocked):pages.get('https://pred.gg/items')
        fetch.assert_called_once();self.assertTrue((self.root/'public-access.json').exists())

    def test_malformed_access_state_does_not_trigger_network(self):
        (self.root/'public-access.json').write_text('{broken',encoding='utf-8')
        fetch=Mock();pages=p.base.PredPages(cache_dir=self.root,fetch=fetch)
        with self.assertRaisesRegex(p.base.FetchError,'state is invalid'):pages.get('https://pred.gg/heroes')
        fetch.assert_not_called()


class OptionalPublicationTests(unittest.TestCase):
    def setUp(self):
        self.b=partial();self.a={'status':'partial','errors':self.b['errors']}

    def test_optional_gap_is_nonfatal_without_relabelling_bundle(self):
        original=copy.deepcopy(self.b)
        self.assertTrue(p.optional_pred_only(self.a,self.b))
        self.assertTrue(p.attempt_satisfied(self.a,self.b))
        self.assertEqual(self.b,original)
        self.assertFalse(p.base.bundle_is_complete(self.b)[0])

    def test_missing_or_old_primary_data_does_not_pass_optional_policy(self):
        self.assertFalse(p.optional_pred_only(self.a,None))
        for mutate in (lambda b:b['tier_list'][0].pop('matches'),
                       lambda b:b.update(generated_at=(NOW+dt.timedelta(days=6)).isoformat()),
                       lambda b:b['sources']['omeda_items'].update(status='failed')):
            b=copy.deepcopy(self.b);mutate(b)
            self.assertFalse(p.optional_pred_only(self.a,b))

    def test_non_pred_errors_and_interrupted_work_still_fail(self):
        for status in ('failed','interrupted',None):
            self.assertFalse(p.attempt_satisfied(dict(self.a,status=status),self.b))
        for source in ('statz.gg hero pages','Official patch','Omeda community builds','Pred.gg.example'):
            a=copy.deepcopy(self.a);a['errors'].append({'source':source,'detail':'Unavailable'})
            self.assertFalse(p.attempt_satisfied(a,self.b))

    def test_optional_switch_is_explicit(self):
        with patch.dict(p.CONFIG,pred_optional=False):
            self.assertFalse(p.optional_pred_only(self.a,self.b))

    def test_optional_block_does_not_disable_required_source_patch_catchup(self):
        a={'errors':[{'source':'Pred.gg current-patch statistics','detail':'HTTP 403'}]}
        self.assertFalse(p.required_source_block(a))
        a['errors'].append({'source':'statz.gg','detail':'HTTP 429'})
        self.assertTrue(p.required_source_block(a))

    def test_run_reports_optional_gap_without_failure_and_keeps_source_dates(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            saved={k:getattr(p.base,k) for k in ('DATA_DIR','SNAP_DIR','LATEST_BUNDLE','SETTINGS_FILE','OUT_HTML')}
            try:
                with patch.dict(p.CONFIG,brackets=['gold']),patch.object(p.base,'now_utc',return_value=NOW), \
                     patch.object(p.base,'fetch_official',return_value=official()), \
                     patch.object(p.base,'collect_bundle',return_value=self.b),patch.object(p,'output_flag') as flags:
                    m=p.run(root,root/'site')
                flags.assert_any_call('source_failed',False)
                self.assertEqual(m['cohorts']['gold']['collection_status'],'partial')
                self.assertEqual(m['cohorts']['gold']['source_dates']['statz_tierlist']['fetched_at'],NOW.isoformat())
                self.assertIsNone(m['cohorts']['gold']['source_dates']['pred_scoped']['fetched_at'])
                self.assertEqual(p.load_publication(root,'gold')['errors'],self.b['errors'])
            finally:
                for k,v in saved.items():setattr(p.base,k,v)
