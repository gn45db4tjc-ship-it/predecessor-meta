"""Local publication boundaries. Synthetic data only; no network or private keys."""
import copy
import datetime as dt
import hashlib
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import static_publish as p
import local_updater as u
from import_local_feed import import_feed
from test_static_publish import bundle, official, NOW


class LocalUpdaterTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name);self.state=self.root/'state';self.feed=self.root/'feed'
        b=bundle();b['settings']={'secret':'never publish'}
        p.retain_success(b,self.state)
        p.write_json(self.state/'publication.json',{'patch_check':p.patch_summary(official()),
            'last_full_attempt_at':NOW.isoformat(),'last_full_seconds':1.2,
            'attempts':{'gold':{'status':'ok','at':NOW.isoformat(),'errors':[]}},
            'private_key':'never publish'})

    def test_due_after_resume_and_not_again_for_three_hours(self):
        self.assertTrue(u.due({},NOW))
        state={'last_check_at':NOW.isoformat()}
        self.assertFalse(u.due(state,NOW+dt.timedelta(hours=2,minutes=59)))
        self.assertTrue(u.due(state,NOW+dt.timedelta(hours=3)))
        self.assertTrue(u.due(state,NOW+dt.timedelta(days=5)))

    def test_export_only_public_fields_and_dated_matching_hash(self):
        r=u.export_feed(self.state,self.feed)
        self.assertNotIn('never publish',json.dumps(r))
        raw=(self.feed/'gold.json').read_bytes()
        self.assertNotIn(b'never publish',raw)
        self.assertEqual(hashlib.sha256(raw).hexdigest(),r['bundles']['gold']['sha256'])
        self.assertEqual(json.loads(raw)['generated_at'],NOW.isoformat())

    def test_import_feed_preserves_original_dates_and_source_status(self):
        u.export_feed(self.state,self.feed)
        target=self.root/'cloud';report=import_feed(self.feed,target)
        self.assertEqual(report['status'],'connected')
        self.assertEqual(p.load_success(target,'gold')['generated_at'],NOW.isoformat())
        self.assertEqual(p.read_json(target/'publication.json')['attempts']['gold']['status'],'ok')

    def test_tampered_bundle_retains_older_good_data_and_reports_error(self):
        u.export_feed(self.state,self.feed)
        target=self.root/'cloud';p.retain_success(bundle(),target)
        (self.feed/'gold.json').write_text('{}')
        report=import_feed(self.feed,target)
        self.assertEqual(report['results']['gold'],'failed')
        self.assertEqual(p.load_success(target,'gold')['generated_at'],NOW.isoformat())
        self.assertIn('checksum',p.read_json(target/'publication.json')['attempts']['gold']['errors'][0]['detail'])

    def test_feed_cannot_read_unrelated_files(self):
        r=u.export_feed(self.state,self.feed);r['bundles']['gold']['file']='../private.json'
        p.write_json(self.feed/'collector.json',r)
        target=self.root/'cloud';report=import_feed(self.feed,target)
        self.assertEqual(report['results']['gold'],'failed')
        self.assertIsNone(p.load_success(target,'gold'))

    def test_old_feed_never_replaces_newer_data(self):
        u.export_feed(self.state,self.feed)
        target=self.root/'cloud';new=bundle();new['generated_at']=(NOW+dt.timedelta(hours=1)).isoformat()
        p.retain_success(new,target);import_feed(self.feed,target)
        self.assertEqual(p.load_success(target,'gold')['generated_at'],new['generated_at'])

    def test_wrong_bracket_is_rejected_even_with_matching_checksum(self):
        r=u.export_feed(self.state,self.feed);raw=json.dumps(bundle('silver')).encode()
        (self.feed/'gold.json').write_bytes(raw);r['bundles']['gold']['sha256']=hashlib.sha256(raw).hexdigest()
        p.write_json(self.feed/'collector.json',r)
        target=self.root/'cloud';report=import_feed(self.feed,target)
        self.assertEqual(report['results']['gold'],'failed')

    def test_dedicated_data_push_never_targets_main_or_forces(self):
        private=self.root/'private';repo=private/'data-repo';(repo/'.git').mkdir(parents=True)
        calls=[]
        def fake_git(args,cwd,**kw):
            calls.append((args,kw))
            if args[:2]==['remote','get-url']:return u.REPO
            if args[:3]==['diff','--cached','--name-only']:return 'collector.json\ngold.json'
            if args[:2]==['rev-parse','HEAD']:return 'test-commit'
            return ''
        with patch.object(u,'PRIVATE',private),patch.object(u,'git',side_effect=fake_git):
            u.publish_feed(self.state)
        pushes=[a for a,k in calls if a[0]=='push']
        self.assertEqual(pushes,[['push',u.PUSH_REPO,'HEAD:refs/heads/data-updates']])
        self.assertFalse(any('--force' in a for a,k in calls))

    def test_unknown_staged_files_prevent_any_push(self):
        private=self.root/'private';(private/'data-repo/.git').mkdir(parents=True)
        calls=[]
        def fake_git(args,cwd,**kw):
            calls.append(args)
            if args[:2]==['remote','get-url']:return u.REPO
            if args[:3]==['diff','--cached','--name-only']:return 'private_key'
            return ''
        with patch.object(u,'PRIVATE',private),patch.object(u,'git',side_effect=fake_git):
            with self.assertRaises(ValueError):u.publish_feed(self.state)
        self.assertFalse(any(a[0]=='push' for a in calls))

    def test_missing_receipt_does_not_import_anything(self):
        with self.assertRaises(ValueError):import_feed(self.feed,self.root/'cloud')


if __name__=='__main__':unittest.main()
