"""Cloud collection is primary; Windows collection is manual recovery.

Each bundle records who actually collected it, the manifest reports that fact per bracket, and a Windows
feed can never move published source dates backwards or pass itself off as a cloud run.
Every number below is a synthetic fixture."""
import datetime as dt
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import static_publish as p
import local_updater as updater
from import_local_feed import import_feed
from test_static_publish import NOW, official
from test_static_independent_sources import partial


def complete(minutes=0, fetched=0, collector=None):
    """A complete, valid collection assembled `minutes` after NOW whose core sources were fetched `fetched` minutes after NOW."""
    b = partial()
    b['errors'] = []
    b['generated_at'] = (NOW + dt.timedelta(minutes=minutes + 1)).isoformat()
    for key in p.CORE_SOURCES:
        b['sources'][key]['fetched_at'] = (NOW + dt.timedelta(minutes=fetched)).isoformat()
    for key in ('pred_scoped', 'pred_game_data'):
        b['sources'][key] = {'status': 'ok', 'fetched_at': (NOW + dt.timedelta(minutes=fetched)).isoformat()}
    b['scoped_statistics'] = {'status': 'ok', 'patch': '1.2', 'bracket': 'gold', 'rows': [{'slug': 'unit-test-fixture', 'matches': 200}]}
    b['pred_game_data'] = {'status': 'ok', 'cohort': {'patch': '1.2'}, 'heroes': {'unit-test-fixture': {}}}
    if collector:
        b['collector'] = collector
    return b


class CollectorIdentity(unittest.TestCase):
    def test_a_github_actions_run_is_recorded_as_cloud_with_its_run(self):
        with patch.dict(os.environ, {'GITHUB_ACTIONS': 'true', 'GITHUB_RUN_ID': '17712345678', 'GITHUB_RUN_ATTEMPT': '2'}):
            self.assertEqual(p.collector_identity(), {'host': 'cloud', 'run_id': '17712345678', 'run_attempt': '2', 'tool_version': p.base.VERSION})

    def test_the_windows_updater_is_recorded_as_windows_and_anything_else_as_local(self):
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop('GITHUB_ACTIONS', None)
            self.assertEqual(p.collector_identity()['host'], 'local')
            with patch.object(p, 'COLLECTOR_HOST', 'windows'):
                self.assertEqual(p.collector_identity()['host'], 'windows')
            with patch.object(p, 'COLLECTOR_HOST', 'cloud-ish'):
                self.assertEqual(p.collector_identity()['host'], 'local', 'an unknown label is never published')

    def test_outside_github_actions_a_collection_is_never_labelled_cloud(self):
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop('GITHUB_ACTIONS', None)
            with patch.object(p, 'COLLECTOR_HOST', 'cloud'):
                self.assertEqual(p.collector_identity(), {'host': 'local', 'run_id': None, 'run_attempt': None, 'tool_version': p.base.VERSION})


class CollectorValidation(unittest.TestCase):
    def test_a_recorded_collector_survives_publication(self):
        record = {'host': 'cloud', 'run_id': '17712345678', 'run_attempt': '1', 'tool_version': '2.25.0'}
        self.assertEqual(p.validate_publication_bundle(complete(collector=record), 'gold')['collector'], record)

    def test_a_bundle_collected_before_provenance_existed_still_publishes(self):
        self.assertNotIn('collector', p.validate_publication_bundle(complete(), 'gold'))

    def test_invalid_collector_records_are_rejected_on_every_path(self):
        for record in ({'host': 'mainframe'}, 'cloud', {'host': 'cloud', 'token': 'x'}, {'host': 'cloud', 'run_id': 17712345678},
                       {'host': 'windows', 'tool_version': '2.25.0 <script>'}, {'host': 'windows', 'run_id': 'x' * 41}):
            with self.subTest(record=record):
                with self.assertRaisesRegex(ValueError, 'invalid collector'):
                    p.validate_publication_bundle(complete(collector=record), 'gold')
                gap = partial(); gap['collector'] = record
                with self.assertRaisesRegex(ValueError, 'invalid collector'):
                    p.validate_publication_bundle(gap, 'gold')


class ManifestProvenance(unittest.TestCase):
    def render(self, bundle):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            p.retain_publication(bundle, root)
            with patch.object(p, 'CONFIG', dict(p.CONFIG, brackets=['gold'])):
                return p.render_site(root, root / 'site', {'patch_check': p.patch_summary(official())})['cohorts']['gold']

    def test_the_manifest_reports_the_actual_collector_of_each_bracket(self):
        record = {'host': 'windows', 'run_id': None, 'run_attempt': None, 'tool_version': '2.25.0'}
        update = partial(); update['collector'] = record
        self.assertEqual(self.render(update)['collector'], record)

    def test_an_older_bundle_is_reported_as_unrecorded_never_guessed(self):
        entry = self.render(partial())['collector']
        self.assertEqual(entry['host'], 'unrecorded')
        self.assertNotIn(entry['host'], p.COLLECTOR_HOSTS)


class ImportNeverRegresses(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.windows, self.cloud = Path(self.tmp.name) / 'windows', Path(self.tmp.name) / 'cloud'

    def feed(self, bundle):
        p.retain_publication(bundle, self.windows)
        p.write_json(self.windows / 'publication.json', {'patch_check': p.patch_summary(official()), 'attempts': {'gold': {'status': 'ok', 'errors': []}}})
        updater.export_feed(self.windows, self.windows / 'feed')
        with patch.object(p, 'CONFIG', dict(p.CONFIG, brackets=['gold'])):
            return import_feed(self.windows / 'feed', self.cloud)['results']['gold']

    def test_a_later_assembly_of_older_sources_never_replaces_the_publication(self):
        published = p.retain_publication(complete(minutes=60, fetched=60, collector={'host': 'cloud', 'run_id': '1', 'run_attempt': '1', 'tool_version': '2.25.0'}), self.cloud)
        result = self.feed(complete(minutes=180, fetched=0, collector={'host': 'windows', 'run_id': None, 'run_attempt': None, 'tool_version': '2.25.0'}))
        self.assertIn('older than published', result)
        self.assertIn('statz_hero_pages', result)
        kept = p.load_publication(self.cloud, 'gold')
        self.assertEqual(kept['generated_at'], published['generated_at'])
        self.assertEqual(kept['collector']['host'], 'cloud')

    def test_a_genuinely_newer_windows_collection_is_imported_and_labelled_windows(self):
        p.retain_publication(complete(minutes=0, fetched=0), self.cloud)
        self.assertEqual(self.feed(complete(minutes=180, fetched=170, collector={'host': 'windows', 'run_id': None, 'run_attempt': None, 'tool_version': '2.25.0'})), 'imported')
        self.assertEqual(p.load_publication(self.cloud, 'gold')['collector']['host'], 'windows')

    def test_a_windows_feed_cannot_claim_cloud_collection(self):
        p.retain_publication(complete(minutes=0, fetched=0), self.cloud)
        before = p.load_publication(self.cloud, 'gold')['generated_at']
        self.assertEqual(self.feed(complete(minutes=180, fetched=170, collector={'host': 'cloud', 'run_id': '99', 'run_attempt': '1', 'tool_version': '2.25.0'})), 'failed')
        self.assertEqual(p.load_publication(self.cloud, 'gold')['generated_at'], before)

    def test_older_core_sources_names_each_source_that_would_go_backwards(self):
        old, new = complete(fetched=60), complete(fetched=60)
        self.assertEqual(p.older_core_sources(old, new), [])
        new['sources']['omeda_items']['fetched_at'] = NOW.isoformat()
        new['sources']['statz_tierlist']['fetched_at'] = None
        self.assertEqual(p.older_core_sources(old, new), ['statz_tierlist', 'omeda_items'])


if __name__ == '__main__':
    unittest.main()
