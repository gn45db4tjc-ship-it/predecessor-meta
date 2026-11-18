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
from import_local_feed import import_feed, own_import, readable_time, refusing_sources
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


class ProvenanceIsRecordedWhereCollectionsHappen(unittest.TestCase):
    """The two places that actually stamp provenance in production (G1#3)."""

    def run_cloud(self, bundle, previous=None, environ=None):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            if previous is not None:
                p.retain_publication(previous, root)
            saved = {k: getattr(p.base, k) for k in ('DATA_DIR', 'SNAP_DIR', 'LATEST_BUNDLE', 'SETTINGS_FILE', 'OUT_HTML')}
            try:
                with patch.dict(os.environ, environ or {'GITHUB_ACTIONS': 'true', 'GITHUB_RUN_ID': '17712345678', 'GITHUB_RUN_ATTEMPT': '1'}), \
                     patch.dict(p.CONFIG, brackets=['gold']), patch.object(p.base, 'now_utc', return_value=NOW + dt.timedelta(hours=1)), \
                     patch.object(p.base, 'fetch_official', return_value=official()), patch.object(p.base, 'collect_bundle', return_value=bundle), \
                     patch.object(p, 'output_flag'):
                    p.run(root, root / 'site')
                return p.load_publication(root, 'gold')
            finally:
                for k, v in saved.items(): setattr(p.base, k, v)

    def test_a_cloud_run_stamps_its_collector_on_what_it_publishes(self):
        b = partial(); b['tool_version'] = p.base.VERSION
        got = self.run_cloud(b)
        self.assertEqual(got['collector'], {'host': 'cloud', 'run_id': '17712345678', 'run_attempt': '1', 'tool_version': p.base.VERSION})

    def test_retained_sources_name_the_host_that_collected_them(self):
        # The previous publication was assembled by the cloud, but the Pred.gg partition kept here was collected by the PC.
        earlier = partial(); earlier['collector'] = {'host': 'cloud', 'run_id': '1', 'run_attempt': '1', 'tool_version': '2.25.0'}
        b = partial(); b['tool_version'] = p.base.VERSION
        b['generated_at'] = (NOW + dt.timedelta(minutes=30)).isoformat()
        b['sources']['pred_scoped'] = {'status': 'retained', 'fetched_at': NOW.isoformat()}
        b['retained_sources'] = {'pred': {'collector': 'windows', 'statistics_fetched_at': NOW.isoformat()}}
        got = self.run_cloud(b, previous=earlier)
        self.assertEqual(got['collector']['host'], 'cloud')
        self.assertEqual(got['collector']['retained_from'], {'pred': 'windows'}, 'named from the partition, not copied from the previous label')

    def test_retaining_statz_records_who_collected_it(self):
        old = partial(); old['errors'] = []
        old['collector'] = {'host': 'windows', 'run_id': None, 'run_attempt': None, 'tool_version': '2.25.0'}
        for key in ('pairs_meta', 'pool_ratio', 'pool_note', 'matchup_note', 'image_index'): old.setdefault(key, None)
        old.setdefault('items', {}); old.setdefault('perks', {})
        fresh = partial(); fresh.setdefault('items', {}); fresh.setdefault('perks', {})
        p.base.attach_retained_statz(fresh, old, 'HTTP 403', NOW.isoformat())
        self.assertEqual(fresh['retained_sources']['statz']['collector'], 'windows')

    def test_the_windows_updater_collects_as_windows_and_restores_the_setting(self):
        seen = []
        with tempfile.TemporaryDirectory() as temp, patch.object(updater, 'PRIVATE', Path(temp)), \
             patch.object(updater.publication, 'run', side_effect=lambda *a, **k: seen.append(p.collector_identity()['host'])), \
             patch.object(updater, 'export_feed', return_value={'status': 'exported'}), patch.dict(os.environ, {}, clear=False):
            os.environ.pop('GITHUB_ACTIONS', None)   # restored when the patch ends (CI sets it)
            updater.run_once(force=True, collect_only=True)
        self.assertEqual(seen, ['windows'])
        self.assertIsNone(p.COLLECTOR_HOST, 'the module setting is restored after the run')


class CollectorValidation(unittest.TestCase):
    def test_a_recorded_collector_survives_publication(self):
        record = {'host': 'cloud', 'run_id': '17712345678', 'run_attempt': '1', 'tool_version': '2.25.0'}
        self.assertEqual(p.validate_publication_bundle(complete(collector=record), 'gold')['collector'], record)

    def test_a_bundle_collected_before_provenance_existed_still_publishes(self):
        self.assertNotIn('collector', p.validate_publication_bundle(complete(), 'gold'))

    def test_invalid_collector_records_are_rejected_on_every_path(self):
        for record in ({'host': 'mainframe'}, 'cloud', {'host': 'cloud', 'token': 'x'}, {'host': 'cloud', 'run_id': 17712345678},
                       {'host': 'cloud', 'retained_from': 'windows'}, {'host': 'cloud', 'retained_from': {'statz': 'someone else'}},
                       {'host': 'cloud', 'retained_from': {'items': 'windows'}}, {'host': 'cloud', 'retained_from': {}},
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

    def test_pred_gg_dates_never_move_backwards_either(self):
        published = complete(minutes=60, fetched=60, collector={'host': 'cloud', 'run_id': '1', 'run_attempt': '1', 'tool_version': '2.25.0'})
        p.retain_publication(published, self.cloud)
        pc = complete(minutes=180, fetched=170, collector={'host': 'windows', 'run_id': None, 'run_attempt': None, 'tool_version': '2.25.0'})
        for key in ('pred_scoped', 'pred_game_data'):
            pc['sources'][key] = {'status': 'retained', 'fetched_at': NOW.isoformat()}   # the PC kept an older Pred.gg sample
        result = self.feed(pc)
        self.assertIn('pred_scoped', result)
        self.assertIn('older than published', result)
        self.assertEqual(p.load_publication(self.cloud, 'gold')['sources']['pred_scoped']['fetched_at'], published['sources']['pred_scoped']['fetched_at'])

    def test_a_refused_upload_never_replaces_the_cloud_attempt_or_its_clock(self):
        p.retain_publication(complete(minutes=60, fetched=60), self.cloud)
        cloud_attempt = {'status': 'ok', 'at': (NOW + dt.timedelta(minutes=60)).isoformat(), 'errors': []}
        p.write_json(self.cloud / 'publication.json', {'attempts': {'gold': cloud_attempt}, 'last_full_attempt_at': cloud_attempt['at']})
        pc = complete(minutes=180, fetched=0)
        p.retain_publication(pc, self.windows)
        later = (NOW + dt.timedelta(minutes=200)).isoformat()
        p.write_json(self.windows / 'publication.json', {'patch_check': p.patch_summary(official()), 'last_full_attempt_at': later,
                                                         'attempts': {'gold': {'status': 'partial', 'at': later, 'errors': []}}})
        updater.export_feed(self.windows, self.windows / 'feed')
        with patch.object(p, 'CONFIG', dict(p.CONFIG, brackets=['gold'])):
            self.assertIn('older than published', import_feed(self.windows / 'feed', self.cloud)['results']['gold'])
        state = p.read_json(self.cloud / 'publication.json')
        self.assertEqual(state['attempts']['gold'], cloud_attempt)
        self.assertEqual(state['last_full_attempt_at'], cloud_attempt['at'])

    def stale_receipt(self):
        """The 16 Nov state: the receipt was first read without its bundle, so the attempt failed with "Bundle missing"."""
        pc = complete(minutes=180, fetched=170, collector={'host': 'windows', 'run_id': None, 'run_attempt': None, 'tool_version': '2.25.0'})
        p.retain_publication(pc, self.windows)
        at = (NOW + dt.timedelta(minutes=181)).isoformat()
        attempt = {'status': 'partial', 'at': at, 'seconds': 20.0, 'errors': [{'source': 'Pred.gg game data', 'severity': 'error', 'detail': 'unit-test fixture'}]}
        p.write_json(self.windows / 'publication.json', {'patch_check': p.patch_summary(official()), 'last_full_attempt_at': at,
                                                         'attempts': {'gold': attempt}})
        updater.export_feed(self.windows, self.windows / 'feed')
        bundle, held = self.windows / 'feed' / 'gold.json', self.windows / 'held-gold.json'
        bundle.rename(held)
        self.assertEqual(import_feed(self.windows / 'feed', self.cloud)['results']['gold'], 'failed')
        first = p.read_json(self.cloud / 'publication.json')['attempts']['gold']
        self.assertEqual(first['status'], 'failed')
        self.assertTrue(any(e['source'] == 'Local collector gold' for e in first['errors']))
        held.rename(bundle)
        return pc, attempt

    def test_a_bundle_imported_after_a_failed_copy_clears_that_receipts_failure(self):
        # PRED-M7 (#224, #228): the same receipt read again with its bundle replaces the same-time failure.
        with patch.object(p, 'CONFIG', dict(p.CONFIG, brackets=['gold'])):
            _, attempt = self.stale_receipt()
            self.assertEqual(import_feed(self.windows / 'feed', self.cloud)['results']['gold'], 'imported')
        state = p.read_json(self.cloud / 'publication.json')
        self.assertEqual(state['attempts']['gold'], attempt)
        self.assertEqual(state['last_full_attempt_at'], attempt['at'])

    def imported_then_stale(self):
        """The receipt's bundle was imported (so the importer recorded it), and a same-time failure from an earlier
        read of that receipt without its bundle is still the bracket's attempt."""
        pc, attempt = self.stale_receipt()
        failed = p.read_json(self.cloud / 'publication.json')['attempts']['gold']
        self.assertEqual(import_feed(self.windows / 'feed', self.cloud)['results']['gold'], 'imported')
        state = p.read_json(self.cloud / 'publication.json')
        self.assertEqual(state['imported_bundles']['gold']['generated_at'], pc['generated_at'])
        state['attempts']['gold'] = failed
        p.write_json(self.cloud / 'publication.json', state)
        return pc, attempt

    def imported_then_stale_record(self, pc):
        """Restore a true record of the receipt's file (as its import wrote it) beside whatever is now published."""
        receipt = p.read_json(self.windows / 'feed' / 'collector.json')
        state = p.read_json(self.cloud / 'publication.json')
        state['imported_bundles']['gold'] = {'sha256': receipt['bundles']['gold']['sha256'], 'generated_at': pc['generated_at'],
                                             'collector': p.validate_publication_bundle(pc, 'gold').get('collector')}
        p.write_json(self.cloud / 'publication.json', state)

    def test_a_stale_failure_beside_its_published_bundle_clears_on_the_next_read(self):
        # #228: reading the same receipt again finds its own imported bundle published and replaces only that
        # same-time failure.
        with patch.object(p, 'CONFIG', dict(p.CONFIG, brackets=['gold'])):
            pc, attempt = self.imported_then_stale()
            state = p.read_json(self.cloud / 'publication.json'); state['last_full_attempt_at'] = NOW.isoformat()
            p.write_json(self.cloud / 'publication.json', state)
            self.assertEqual(import_feed(self.windows / 'feed', self.cloud)['results']['gold'], 'retained newer or identical bundle')
            state = p.read_json(self.cloud / 'publication.json')
            self.assertEqual(state['attempts']['gold'], attempt)
            # The receipt's own attempt now speaks for the bracket, so its collection clock moves forward too
            # (Muse on a5c076a, VERIFY-6 F5).
            self.assertEqual(state['last_full_attempt_at'], attempt['at'])
            # An attempt at any other time (the cloud's own) is never replaced by an identical, unimported bundle.
            other = {'status': 'ok', 'at': (NOW + dt.timedelta(minutes=300)).isoformat(), 'errors': []}
            state = p.read_json(self.cloud / 'publication.json'); state['attempts']['gold'] = other
            p.write_json(self.cloud / 'publication.json', state)
            import_feed(self.windows / 'feed', self.cloud)
            self.assertEqual(p.read_json(self.cloud / 'publication.json')['attempts']['gold'], other)

    def test_an_identical_bundle_this_importer_never_imported_never_clears_a_failure(self):
        # VERIFY-6: identity comes from the importer's own record of the receipt file, never from matching fields.
        # The same bundle published by another path (restored from the live site, or imported before PRED-M8)
        # leaves the same-time failure in place.
        with patch.object(p, 'CONFIG', dict(p.CONFIG, brackets=['gold'])):
            pc, attempt = self.stale_receipt()
            failed = p.read_json(self.cloud / 'publication.json')['attempts']['gold']
            p.retain_publication(pc, self.cloud)
            self.assertEqual(import_feed(self.windows / 'feed', self.cloud)['results']['gold'], 'retained newer or identical bundle')
            self.assertEqual(p.read_json(self.cloud / 'publication.json')['attempts']['gold'], failed)

    def test_own_import_needs_the_recorded_file_date_and_collector(self):
        pub = {'generated_at': NOW.isoformat(), 'collector': {'host': 'windows'}}
        record = {'sha256': 'a' * 64, 'generated_at': NOW.isoformat(), 'collector': {'host': 'windows'}}
        row = {'sha256': 'a' * 64}
        self.assertTrue(own_import(record, pub, row))
        self.assertFalse(own_import(dict(record, sha256='b' * 64), pub, row))
        self.assertFalse(own_import(dict(record, generated_at=(NOW + dt.timedelta(seconds=1)).isoformat()), pub, row))
        self.assertFalse(own_import(dict(record, collector={'host': 'local'}), pub, row))
        self.assertFalse(own_import(None, pub, row))
        self.assertFalse(own_import(record, pub, {}))
        self.assertFalse(own_import(record, None, row))

    def test_a_record_of_another_receipt_file_never_clears_a_failure(self):
        # VERIFY-6: two bundles alike in every projected field (here differing only in their scoped sample) are
        # different files; a record of one never makes the other the receipt's own.
        with patch.object(p, 'CONFIG', dict(p.CONFIG, brackets=['gold'])):
            pc, attempt = self.imported_then_stale()
            failed = p.read_json(self.cloud / 'publication.json')['attempts']['gold']
            state = p.read_json(self.cloud / 'publication.json')
            state['imported_bundles']['gold']['sha256'] = '0' * 64
            p.write_json(self.cloud / 'publication.json', state)
            self.assertEqual(import_feed(self.windows / 'feed', self.cloud)['results']['gold'], 'retained newer or identical bundle')
            self.assertEqual(p.read_json(self.cloud / 'publication.json')['attempts']['gold'], failed)
            # A published bundle whose collector differs from the record is not the recorded import either.
            pc_other = complete(minutes=180, fetched=170, collector={'host': 'local', 'run_id': None, 'run_attempt': None, 'tool_version': '2.25.0'})
            pc_other['scoped_statistics']['rows'][0]['matches'] = 123
            p.retain_publication(pc_other, self.cloud)
            state = p.read_json(self.cloud / 'publication.json'); state['imported_bundles']['gold']['sha256'] = None
            p.write_json(self.cloud / 'publication.json', state)
            self.imported_then_stale_record(pc)
            import_feed(self.windows / 'feed', self.cloud)
            self.assertEqual(p.read_json(self.cloud / 'publication.json')['attempts']['gold'], failed)

    def paragon(self, minutes, fetched, discontinued_at=None):
        """A synthetic Paragon+ bundle; with discontinued_at, Statz is discontinued with its last date there."""
        b = complete(minutes=minutes, fetched=fetched)
        b['bracket'] = {'segment': 'paragon', 'label': 'Paragon+'}
        if discontinued_at is not None:
            for key in ('statz_tierlist', 'statz_hero_pages'):
                # As attach_discontinued_statz does: the frozen source record keeps its counts and takes the stop.
                b['sources'][key] = dict(b['sources'][key], status='discontinued', fetched_at=discontinued_at,
                                         discontinued_after_patch=p.base.STATZ_DISCONTINUED_AFTER['paragon'])
            b['errors'] = [{'source': 'Pred.gg game data', 'severity': 'error', 'detail': 'unit-test fixture'}]
        return b

    def paragon_feed(self, incoming, at):
        p.retain_publication(incoming, self.windows)
        attempt = {'status': 'partial', 'at': at, 'seconds': 3.0, 'errors': incoming['errors']}
        p.write_json(self.windows / 'publication.json', {'patch_check': p.patch_summary(official()), 'last_full_attempt_at': at,
                                                         'attempts': {'paragon': attempt}})
        updater.export_feed(self.windows, self.windows / 'feed')
        with patch.object(p, 'CONFIG', dict(p.CONFIG, brackets=['paragon'])):
            return import_feed(self.windows / 'feed', self.cloud)['results']['paragon'], attempt

    def test_the_upload_that_first_marks_statz_discontinued_is_not_refused_for_its_older_statz_date(self):
        # PRED-M8 (#232): Paragon+'s last published Statz sample (5 Nov) was newer than the collector's last Statz date
        # (4 Nov) when Statz stopped, so every later upload was refused and an 8 Nov failure kept every run red.
        p.retain_publication(self.paragon(minutes=60, fetched=60), self.cloud)
        stale = {'status': 'failed', 'at': (NOW + dt.timedelta(minutes=90)).isoformat(), 'errors': [{'source': 'statz.gg tier list', 'severity': 'error', 'detail': 'unit-test fixture'}]}
        p.write_json(self.cloud / 'publication.json', {'attempts': {'paragon': stale}})
        incoming = self.paragon(minutes=600, fetched=600, discontinued_at=NOW.isoformat())
        result, attempt = self.paragon_feed(incoming, (NOW + dt.timedelta(minutes=601)).isoformat())
        self.assertEqual(result, 'imported')
        published = p.load_publication(self.cloud, 'paragon')
        self.assertEqual(published['sources']['statz_hero_pages']['status'], 'discontinued')
        self.assertEqual(published['sources']['statz_hero_pages']['fetched_at'], NOW.isoformat(), 'the date is the source\'s own, never moved')
        state = p.read_json(self.cloud / 'publication.json')
        self.assertEqual(state['attempts']['paragon'], attempt)
        self.assertTrue(p.attempt_satisfied(state['attempts']['paragon'], published))

    def test_a_discontinued_statz_exemption_never_lets_another_source_go_backwards(self):
        published = self.paragon(minutes=60, fetched=60)
        p.retain_publication(published, self.cloud)
        incoming = self.paragon(minutes=600, fetched=600, discontinued_at=NOW.isoformat())
        incoming['sources']['pred_scoped'] = {'status': 'retained', 'fetched_at': NOW.isoformat()}   # older than the published 60-minute fetch
        result, _ = self.paragon_feed(incoming, (NOW + dt.timedelta(minutes=601)).isoformat())
        self.assertIn('older than published', result)
        self.assertIn('pred_scoped', result)
        self.assertNotIn('statz_', result)
        self.assertEqual(p.load_publication(self.cloud, 'paragon')['sources']['statz_hero_pages']['status'], 'ok')

    def test_once_statz_is_published_as_discontinued_its_date_never_moves_back(self):
        p.retain_publication(self.paragon(minutes=60, fetched=60, discontinued_at=(NOW + dt.timedelta(minutes=30)).isoformat()), self.cloud)
        incoming = self.paragon(minutes=600, fetched=600, discontinued_at=NOW.isoformat())
        result, _ = self.paragon_feed(incoming, (NOW + dt.timedelta(minutes=601)).isoformat())
        self.assertIn('older than published', result)
        self.assertIn('statz_hero_pages', result)

    def test_a_discontinuation_without_its_own_dated_statz_never_erases_the_published_sample(self):
        # VERIFY-3 R1: a collector with no Statz history marks Statz discontinued with no date and no tier rows.
        # Accepting it would replace a dated, published sample with nothing, so it is refused and the sample stays.
        published = self.paragon(minutes=60, fetched=60)
        p.retain_publication(published, self.cloud)
        before = p.load_publication(self.cloud, 'paragon')
        self.assertTrue(before['tier_list'])
        incoming = self.paragon(minutes=600, fetched=600, discontinued_at=NOW.isoformat())
        for key in ('statz_tierlist', 'statz_hero_pages'):
            incoming['sources'][key]['fetched_at'] = None
        incoming['tier_list'] = []
        result, _ = self.paragon_feed(incoming, (NOW + dt.timedelta(minutes=601)).isoformat())
        self.assertIn('older than published', result)
        self.assertIn('statz_tierlist', result)
        self.assertIn('statz_hero_pages', result)
        kept = p.load_publication(self.cloud, 'paragon')
        self.assertEqual(kept['generated_at'], before['generated_at'])
        self.assertEqual(kept['tier_list'], before['tier_list'])
        for key in ('statz_tierlist', 'statz_hero_pages'):
            self.assertEqual(kept['sources'][key]['fetched_at'], published['sources'][key]['fetched_at'])
            self.assertEqual(kept['sources'][key]['status'], 'ok')

    def test_a_dated_discontinuation_without_tier_rows_never_erases_published_rows(self):
        # VERIFY-3 R1: a dated stop that brings no tier rows still never replaces published rows with none.
        p.retain_publication(self.paragon(minutes=60, fetched=60), self.cloud)
        before = p.load_publication(self.cloud, 'paragon')
        incoming = self.paragon(minutes=600, fetched=600, discontinued_at=NOW.isoformat())
        incoming['tier_list'] = []
        result, _ = self.paragon_feed(incoming, (NOW + dt.timedelta(minutes=601)).isoformat())
        self.assertIn('older than published', result)
        self.assertEqual(p.load_publication(self.cloud, 'paragon')['tier_list'], before['tier_list'])

    def test_an_unrelated_bundle_with_the_same_timestamp_never_replaces_the_cloud_attempt(self):
        # VERIFY-3 R2: two different collections can share generated_at and attempt time. Only the receipt's own
        # bundle may clear its equal-time attempt; a collision keeps the cloud bundle, its attempt and its clock.
        cloud_bundle = complete(minutes=180, fetched=170, collector={'host': 'cloud', 'run_id': '7', 'run_attempt': '1', 'tool_version': '2.25.0'})
        p.retain_publication(cloud_bundle, self.cloud)
        at = (NOW + dt.timedelta(minutes=181)).isoformat()
        cloud_attempt = {'status': 'ok', 'at': at, 'seconds': 40.0, 'errors': []}
        p.write_json(self.cloud / 'publication.json', {'attempts': {'gold': cloud_attempt}, 'last_full_attempt_at': at, 'last_full_seconds': 40.0})
        pc = complete(minutes=180, fetched=170, collector={'host': 'windows', 'run_id': None, 'run_attempt': None, 'tool_version': '2.25.0'})
        self.assertEqual(pc['generated_at'], cloud_bundle['generated_at'])
        p.retain_publication(pc, self.windows)
        pc_attempt = {'status': 'partial', 'at': at, 'seconds': 20.0, 'errors': [{'source': 'Pred.gg game data', 'severity': 'error', 'detail': 'unit-test fixture'}]}
        p.write_json(self.windows / 'publication.json', {'patch_check': p.patch_summary(official()), 'last_full_attempt_at': at,
                                                         'attempts': {'gold': pc_attempt}})
        updater.export_feed(self.windows, self.windows / 'feed')
        with patch.object(p, 'CONFIG', dict(p.CONFIG, brackets=['gold'])):
            self.assertEqual(import_feed(self.windows / 'feed', self.cloud)['results']['gold'], 'retained newer or identical bundle')
        self.assertEqual(p.load_publication(self.cloud, 'gold')['collector']['host'], 'cloud')
        state = p.read_json(self.cloud / 'publication.json')
        self.assertEqual(state['attempts']['gold'], cloud_attempt)
        self.assertEqual(state['last_full_attempt_at'], at)
        self.assertEqual(state['last_full_seconds'], 40.0)

    def test_an_undated_discontinuation_is_refused_even_when_it_keeps_tier_rows(self):
        # Muse on bb3c60b: the undated case is refused for its missing date alone, not only for missing rows. Such a
        # bundle also fails publication validation, so the rule is checked directly as well as end to end.
        published = self.paragon(minutes=60, fetched=60)
        p.retain_publication(published, self.cloud)
        stored = p.load_publication(self.cloud, 'paragon')
        incoming = self.paragon(minutes=600, fetched=600, discontinued_at=NOW.isoformat())
        self.assertTrue(incoming['tier_list'])
        self.assertEqual(refusing_sources(['statz_tierlist', 'statz_hero_pages'], stored, incoming), [])
        incoming['sources']['statz_hero_pages']['fetched_at'] = None
        self.assertEqual(refusing_sources(['statz_tierlist', 'statz_hero_pages'], stored, incoming), ['statz_hero_pages'])
        incoming['sources']['statz_tierlist']['fetched_at'] = 'not a time'
        self.assertEqual(refusing_sources(['statz_tierlist', 'statz_hero_pages'], stored, incoming), ['statz_tierlist', 'statz_hero_pages'])

    def test_a_first_discontinuation_never_rolls_back_past_the_published_sample(self):
        # Muse on bb3c60b (disputed): an older Statz date is accepted only for a frozen sample of the published
        # sample's patch with no fewer tier rows and no fewer hero pages; anything else keeps the refusal.
        published = self.paragon(minutes=60, fetched=60)
        published['sources']['statz_hero_pages'].update(coverage={'ok': 1, 'requested': 1, 'failed': 0, 'conflicting': 0})
        p.retain_publication(published, self.cloud)
        stored = p.load_publication(self.cloud, 'paragon')
        keys = ['statz_tierlist', 'statz_hero_pages']
        def incoming():
            b = self.paragon(minutes=600, fetched=600, discontinued_at=NOW.isoformat())
            b['sources']['statz_hero_pages']['coverage'] = {'ok': 1, 'requested': 1, 'failed': 0, 'conflicting': 0}
            return b
        self.assertEqual(refusing_sources(keys, stored, incoming()), [], 'the same frozen sample is accepted')
        cases = {
            'another patch': lambda b: b.update(patch='1.1'),
            'no patch': lambda b: b.pop('patch'),
            'fewer tier rows': lambda b: b.update(tier_list=b['tier_list'][:-1]),
            'fewer hero pages': lambda b: b['sources']['statz_hero_pages'].update(coverage={'ok': 0, 'requested': 1, 'failed': 1}),
            'hero pages unknown': lambda b: [b['sources']['statz_hero_pages'].pop(k) for k in ('coverage', 'ok')],
        }
        for name, change in cases.items():
            with self.subTest(name):
                b = incoming(); change(b)
                self.assertEqual(refusing_sources(keys, stored, b), keys)
        # Without a coverage record, the source record's own page count is compared (Muse on a5c076a).
        bare = dict(stored, sources=dict(stored['sources'], statz_hero_pages={k: v for k, v in stored['sources']['statz_hero_pages'].items() if k != 'coverage'}))
        self.assertEqual(bare['sources']['statz_hero_pages']['ok'], 1)
        fewer = incoming(); fewer['sources']['statz_hero_pages'].pop('coverage'); fewer['sources']['statz_hero_pages']['ok'] = 0
        self.assertEqual(refusing_sources(keys, bare, fewer), keys)
        same = incoming(); same['sources']['statz_hero_pages'].pop('coverage')
        self.assertEqual(refusing_sources(keys, bare, same), [])
        # A published sample with no hero-page count cannot be shown to be no larger, so it keeps the refusal (Muse on 2533773).
        unknown = dict(stored, sources=dict(stored['sources'], statz_hero_pages={k: v for k, v in stored['sources']['statz_hero_pages'].items() if k not in ('coverage', 'ok')}))
        self.assertEqual(refusing_sources(keys, unknown, incoming()), keys)
        # A fetch date that is not readable text never counts as the upload's own observation (Muse on 2533773).
        for stamp in (1730000000, {'at': NOW.isoformat()}, ['x'], '2026-11-04T11:30:00+99:00', '9999-12-31T23:59:59-23:59'):
            with self.subTest(stamp=stamp):
                b = incoming(); b['sources']['statz_hero_pages']['fetched_at'] = stamp
                self.assertEqual(refusing_sources(keys, stored, b), ['statz_hero_pages'])
        # End to end: a frozen sample from another patch is refused and the published sample stays.
        b = incoming(); b['patch'] = '1.1'
        self.assertTrue(p.base.bundle_is_publishable(b))
        result, _ = self.paragon_feed(b, (NOW + dt.timedelta(minutes=601)).isoformat())
        self.assertIn('statz_tierlist', result)
        self.assertEqual(p.load_publication(self.cloud, 'paragon')['sources']['statz_tierlist']['status'], 'ok')

    def test_an_unreadable_attempt_time_never_stops_the_import(self):
        # Muse on bb3c60b: attempt times are compared only for a bracket whose published bundle is the receipt's
        # own, and an unreadable one never matches; it never raises for the other brackets.
        p.retain_publication(complete(minutes=60, fetched=60), self.cloud)
        cloud_attempt = {'status': 'ok', 'at': 'not a time', 'errors': []}
        p.write_json(self.cloud / 'publication.json', {'attempts': {'gold': cloud_attempt}})
        pc = complete(minutes=180, fetched=0)
        p.retain_publication(pc, self.windows)
        p.write_json(self.windows / 'publication.json', {'patch_check': p.patch_summary(official()),
                                                         'attempts': {'gold': {'status': 'partial', 'at': 'also not a time', 'errors': []}}})
        updater.export_feed(self.windows, self.windows / 'feed')
        with patch.object(p, 'CONFIG', dict(p.CONFIG, brackets=['gold'])):
            self.assertIn('older than published', import_feed(self.windows / 'feed', self.cloud)['results']['gold'])
        self.assertEqual(p.read_json(self.cloud / 'publication.json')['attempts']['gold'], cloud_attempt)
        # The receipt's own bundle is published, so its attempt time is compared: an unreadable stored time never matches.
        with patch.object(p, 'CONFIG', dict(p.CONFIG, brackets=['gold'])):
            self.cloud = Path(self.tmp.name) / 'cloud-own'
            pc_own, _ = self.stale_receipt()
            p.retain_publication(pc_own, self.cloud)
            state = p.read_json(self.cloud / 'publication.json'); state['attempts']['gold'] = dict(cloud_attempt)
            p.write_json(self.cloud / 'publication.json', state)
            self.assertEqual(import_feed(self.windows / 'feed', self.cloud)['results']['gold'], 'retained newer or identical bundle')
        self.assertEqual(p.read_json(self.cloud / 'publication.json')['attempts']['gold'], cloud_attempt)

    def test_an_unreadable_time_on_the_import_path_never_raises_or_wins(self):
        # Muse on a5c076a: the imported and failed path and the collection clock read times too. An unreadable stored
        # time gives way to a readable newer one; an unreadable incoming time never replaces anything or moves the clock.
        def run(stored_at, stored_clock, incoming_at, incoming_clock):
            folder = Path(self.tmp.name) / ('case-' + str(len(list(Path(self.tmp.name).glob('case-*')))))
            self.windows, self.cloud = folder / 'windows', folder / 'cloud'
            p.retain_publication(complete(minutes=0, fetched=0), self.cloud)
            p.write_json(self.cloud / 'publication.json', {'attempts': {'gold': {'status': 'failed', 'at': stored_at, 'errors': []}},
                                                         'last_full_attempt_at': stored_clock})
            p.retain_publication(complete(minutes=180, fetched=170, collector={'host': 'windows', 'run_id': None, 'run_attempt': None, 'tool_version': '2.25.0'}), self.windows)
            attempt = {'status': 'ok', 'at': incoming_at, 'seconds': 9.0, 'errors': []}
            p.write_json(self.windows / 'publication.json', {'patch_check': p.patch_summary(official()), 'last_full_attempt_at': incoming_clock,
                                                             'attempts': {'gold': attempt}})
            updater.export_feed(self.windows, self.windows / 'feed')
            with patch.object(p, 'CONFIG', dict(p.CONFIG, brackets=['gold'])):
                self.assertEqual(import_feed(self.windows / 'feed', self.cloud)['results']['gold'], 'imported')
            return p.read_json(self.cloud / 'publication.json'), attempt
        later = (NOW + dt.timedelta(minutes=181)).isoformat()
        state, attempt = run('not a time', 'not a time', later, later)
        self.assertEqual(state['attempts']['gold'], attempt)
        self.assertEqual(state['last_full_attempt_at'], later)
        # VERIFY-6: a number, an object or an out-of-range offset is unreadable too, never an exception.
        for bad in (12345, {'at': 'x'}, ['x'], '9999-12-31T23:59:59-23:59', '0001-01-01T00:00:00+23:59'):
            with self.subTest(bad=bad):
                self.assertIsNone(readable_time(bad))
                state, attempt = run(bad, bad, later, later)
                self.assertEqual(state['attempts']['gold'], attempt)
                self.assertEqual(state['last_full_attempt_at'], later)
        state, _ = run(NOW.isoformat(), NOW.isoformat(), 'not a time', 'not a time')
        self.assertEqual(state['attempts']['gold']['at'], NOW.isoformat())
        self.assertEqual(state['last_full_attempt_at'], NOW.isoformat())

    def test_a_review_replayed_copy_of_the_receipts_bundle_still_counts_as_its_own(self):
        # Muse on bb3c60b: publication may store a review-replayed copy (new guidance, corrections, notices) of the
        # receipt's imported bundle. It keeps generated_at and collector, so its stale same-time failure still clears.
        with patch.object(p, 'CONFIG', dict(p.CONFIG, brackets=['gold'])):
            pc, attempt = self.imported_then_stale()
            # The real replay, as render_site runs it, with the reviewed packet's enrichment stubbed as in
            # test_static_publication_guidance (the synthetic fixture has no reviewed-packet evidence).
            def enrich(out, official):
                out['guidance'] = {'builds': ['reviewed'], 'meta_review': {'entries': ['rechecked']}}
            own = dict(p.load_publication(self.cloud, 'gold'), guidance_fingerprint='an-older-packet')
            with patch.object(p.base, 'enrich_bundle', side_effect=enrich), patch.object(p.base, 'apply_pred_game_data'):
                replayed = p.base.review_saved_sources(own)
            self.assertIsNot(replayed, own)
            self.assertNotEqual(replayed['guidance'], own.get('guidance'))
            p.retain_publication(replayed, self.cloud)
            self.assertEqual(import_feed(self.windows / 'feed', self.cloud)['results']['gold'], 'retained newer or identical bundle')
        self.assertEqual(p.read_json(self.cloud / 'publication.json')['attempts']['gold'], attempt)

    def test_an_older_omeda_source_still_refuses_a_first_statz_discontinuation(self):
        # VERIFY-3 R3: the exemption names only the two Statz sources; an older Omeda date still refuses the upload.
        published = self.paragon(minutes=60, fetched=60)
        p.retain_publication(published, self.cloud)
        incoming = self.paragon(minutes=600, fetched=600, discontinued_at=NOW.isoformat())
        incoming['sources']['omeda_heroes'] = {'status': 'retained', 'fetched_at': NOW.isoformat(), 'offline': False}   # older than the published 60-minute fetch
        result, _ = self.paragon_feed(incoming, (NOW + dt.timedelta(minutes=601)).isoformat())
        self.assertEqual(result, 'retained published bundle: imported omeda_heroes older than published')
        kept = p.load_publication(self.cloud, 'paragon')
        self.assertEqual(kept['sources']['omeda_heroes']['fetched_at'], published['sources']['omeda_heroes']['fetched_at'])
        self.assertEqual(kept['sources']['statz_tierlist']['status'], 'ok')

    def test_the_statz_exemption_is_decided_for_each_statz_source(self):
        # VERIFY-3 R4. A publication with only the tier list discontinued never validates, so it cannot be stored;
        # the per-source rule is checked directly on that mix, then end to end on the mixes a publication can hold.
        mixed = self.paragon(minutes=60, fetched=60)
        mixed['sources']['statz_tierlist'].update(status='discontinued', discontinued_after_patch=p.base.STATZ_DISCONTINUED_AFTER['paragon'])
        self.assertFalse(p.base.bundle_is_publishable(mixed))
        incoming = self.paragon(minutes=600, fetched=600, discontinued_at=NOW.isoformat())
        older = p.older_sources(mixed, incoming)
        self.assertEqual(sorted(k for k in older if k.startswith('statz_')), ['statz_hero_pages', 'statz_tierlist'])
        self.assertEqual(refusing_sources(older, mixed, incoming), ['statz_tierlist'])
        # Published Statz active: the tier list date matches, only the hero pages are older, and the upload imports.
        published = self.paragon(minutes=60, fetched=60)
        tier_date = published['sources']['statz_tierlist']['fetched_at']
        p.retain_publication(published, self.cloud)
        incoming = self.paragon(minutes=600, fetched=600, discontinued_at=NOW.isoformat())
        incoming['sources']['statz_tierlist']['fetched_at'] = tier_date
        result, _ = self.paragon_feed(incoming, (NOW + dt.timedelta(minutes=601)).isoformat())
        self.assertEqual(result, 'imported')
        now_published = p.load_publication(self.cloud, 'paragon')
        self.assertEqual(now_published['sources']['statz_tierlist']['fetched_at'], tier_date)
        self.assertEqual(now_published['sources']['statz_hero_pages']['status'], 'discontinued')
        self.assertEqual(now_published['sources']['statz_hero_pages']['fetched_at'], NOW.isoformat())
        # Published Statz now discontinued: a later upload whose hero pages alone go back is refused for them alone.
        later = self.paragon(minutes=900, fetched=900, discontinued_at=NOW.isoformat())
        later['sources']['statz_tierlist']['fetched_at'] = tier_date
        later['sources']['statz_hero_pages']['fetched_at'] = (NOW - dt.timedelta(minutes=30)).isoformat()
        result, _ = self.paragon_feed(later, (NOW + dt.timedelta(minutes=901)).isoformat())
        self.assertEqual(result, 'retained published bundle: imported statz_hero_pages older than published')
        self.assertEqual(p.load_publication(self.cloud, 'paragon')['generated_at'], now_published['generated_at'])

    def test_a_published_source_that_holds_no_data_never_vetoes_an_upload(self):
        published = complete(minutes=60, fetched=60)
        published['sources']['pred_game_data'] = {'status': 'failed', 'fetched_at': (NOW + dt.timedelta(minutes=60)).isoformat()}
        incoming = complete(minutes=180, fetched=170)
        incoming['sources']['pred_game_data'] = {'status': 'failed', 'fetched_at': None}
        self.assertEqual(p.older_sources(published, incoming), [], 'a failed fetch has no data whose date could go backwards')
        published['sources']['pred_game_data']['status'] = 'retained'
        self.assertEqual(p.older_sources(published, incoming), ['pred_game_data'])

    def test_older_sources_names_each_source_that_would_go_backwards(self):
        old, new = complete(fetched=60), complete(fetched=60)
        self.assertEqual(p.older_sources(old, new), [])
        new['sources']['omeda_items']['fetched_at'] = NOW.isoformat()
        new['sources']['statz_tierlist']['fetched_at'] = None
        self.assertEqual(p.older_sources(old, new), ['statz_tierlist', 'omeda_items'])


if __name__ == '__main__':
    unittest.main()
