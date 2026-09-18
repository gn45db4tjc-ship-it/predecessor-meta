"""Reproductions for the 2.23.0 audit: publication validation (C) and per-page failure (D).

Every reproduction asserts the CORRECT behaviour. While its defect is open it carries
@unittest.expectedFailure, so the publication workflow (which runs this suite before every
daily collection) stays green while the defect is on record. The change that fixes a defect
removes the marker in the same commit; from then on the reproduction is an enforcing test,
and unittest reports an "unexpected success" as a failure if a marker is ever left behind.

Tests without the marker are guards: they pass today and must keep passing, so a fix cannot
loosen validation further than intended. Every number below is a synthetic fixture.
"""
import copy
import datetime as dt
import tempfile
import unittest
from pathlib import Path

import static_publish as s
from test_static_publish import NOW, official
from test_static_independent_sources import partial

base = s.base


def sparse_complete(bracket='gold'):
    """The shape the suite used as a 'complete success' at 2.23.0: clean statuses, no numbers."""
    return {'schema': 3, 'generated_at': NOW.isoformat(), 'patch': '1.2',
            'bracket': {'segment': bracket, 'label': bracket.capitalize() + '+'},
            'heroes': {'unit-test-fixture': {'display_name': 'Synthetic fixture'}},
            'tier_list': [{'slug': 'unit-test-fixture', 'role': 'jungle'}],
            'official': official(), 'errors': [], 'pairs': {},
            'sources': {'statz_tierlist': {'status': 'ok'}, 'statz_hero_pages': {'status': 'ok'},
                        'omeda_heroes': {'status': 'ok'}}}


def valid_complete():
    """A complete collection that also carries valid rows: every status ok, no source error."""
    b = partial()
    b['errors'] = []
    return b


def roster(ok, failed, conflicts=0):
    """A fresh independent collection in which some hero pages failed, as the collector writes it."""
    b = partial()
    b['heroes'], b['tier_list'], b['failed_pages'], b['patch_conflicts'] = {}, [], [], []
    for index in range(ok + failed + conflicts):
        slug, role = 'fixture-%02d' % index, base.ROLES[index % len(base.ROLES)]
        b['tier_list'].append({'slug': slug, 'role': role, 'winRate': 50.0, 'pickRate': 10.0, 'matches': 200})
        if index < ok:
            record = {'status': 'ok', 'winRate': 50.0, 'pickRate': 10.0, 'playedGames': 200}
        elif index < ok + failed:
            record = {'status': 'failed', 'error': 'FetchError: timed out'}
            b['failed_pages'].append({'slug': slug, 'role': role, 'error': 'FetchError: timed out',
                                      'url': 'https://statz.gg/predecessor/heroes/%s/build/%s/gold' % (slug, role)})
            b['errors'].append({'source': 'statz.gg hero page %s/%s' % (slug, role), 'severity': 'warning', 'detail': 'FetchError: timed out'})
        else:
            record = {'status': 'patch_conflict', 'error': 'page reports another patch'}
            b['patch_conflicts'].append({'slug': slug, 'role': role, 'page_patch': '1.1', 'tier_list_patch': '1.2'})
        b['heroes'][slug] = {'display_name': 'Synthetic ' + slug, 'roles': {role: record}}
    missing = failed + conflicts
    b['sources']['statz_hero_pages'].update(
        status='ok' if not missing else 'partial (%d missing)' % missing,
        requested=ok + failed + conflicts, ok=ok, failed=failed, conflicting=conflicts)
    return b


class CompletePathValidation(unittest.TestCase):
    """Defect C: the 'complete' publication path skips the numeric and structural checks."""

    def test_valid_complete_bundle_is_accepted(self):
        clean = s.validate_publication_bundle(valid_complete(), 'gold')
        self.assertEqual(clean['bracket']['segment'], 'gold')
        self.assertNotIn('refresh_result', clean)

    def test_wrong_bracket_is_rejected(self):
        with self.assertRaises(ValueError):
            s.validate_publication_bundle(valid_complete(), 'diamond')

    def test_sparse_complete_bundle_is_rejected(self):
        with self.assertRaises(ValueError):
            s.validate_publication_bundle(sparse_complete(), 'gold')

    def test_sparse_complete_bundle_is_never_retained(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):
                s.retain_publication(sparse_complete(), tmp)
            self.assertFalse((Path(tmp) / 'bundles' / 'gold.json.gz').exists())

    def test_out_of_range_win_rate_is_rejected(self):
        b = valid_complete()
        b['tier_list'][0]['winRate'] = 150.0
        with self.assertRaises(ValueError):
            s.validate_publication_bundle(b, 'gold')

    def test_non_finite_rate_is_rejected(self):
        b = valid_complete()
        b['heroes']['unit-test-fixture']['roles']['jungle']['winRate'] = float('nan')
        with self.assertRaises(ValueError):
            s.validate_publication_bundle(b, 'gold')

    def test_zero_sample_is_rejected(self):
        b = valid_complete()
        b['tier_list'][0]['matches'] = 0
        with self.assertRaises(ValueError):
            s.validate_publication_bundle(b, 'gold')

    def test_duplicate_hero_role_row_is_rejected(self):
        b = valid_complete()
        b['tier_list'].append(copy.deepcopy(b['tier_list'][0]))
        with self.assertRaises(ValueError):
            s.validate_publication_bundle(b, 'gold')

    def test_tier_row_without_a_hero_role_record_is_rejected(self):
        b = valid_complete()
        b['heroes']['unit-test-fixture']['roles'] = {}
        with self.assertRaises(ValueError):
            s.validate_publication_bundle(b, 'gold')

    def test_wins_inconsistent_with_sample_are_rejected(self):
        b = valid_complete()
        b['heroes']['unit-test-fixture']['roles']['jungle'].update(wonGames=190, playedGames=200, winRate=50.0)
        with self.assertRaises(ValueError):
            s.validate_publication_bundle(b, 'gold')

    def test_a_rejected_import_never_replaces_the_last_good_publication(self):
        with tempfile.TemporaryDirectory() as tmp:
            good = s.retain_publication(valid_complete(), tmp)
            newer = sparse_complete()
            newer['generated_at'] = (NOW + dt.timedelta(hours=2)).isoformat()
            with self.assertRaises(ValueError):
                s.retain_publication(newer, tmp)
            self.assertEqual(s.load_publication(tmp, 'gold')['generated_at'], good['generated_at'])


class SinglePageFailure(unittest.TestCase):
    """Defect D: one failed Statz page discards an otherwise fresh, validated collection."""

    def test_clean_roster_is_publishable(self):
        self.assertTrue(base.bundle_has_fresh_statz(roster(12, 0)))

    @unittest.expectedFailure
    def test_one_failed_page_keeps_the_fresh_collection_publishable(self):
        b = roster(11, 1)
        self.assertTrue(base.bundle_has_fresh_statz(b))
        clean = s.validate_publication_bundle(b, 'gold')
        self.assertIn('partial', clean['refresh_result'])
        failed = [h for h in clean['heroes'].values() if any(r.get('status') == 'failed' for r in h['roles'].values())]
        self.assertEqual(len(failed), 1, 'the failed role must stay visibly failed, never filled in')

    def test_widespread_page_failure_stays_unpublishable(self):
        self.assertFalse(base.bundle_has_fresh_statz(roster(6, 6)))

    def test_a_patch_conflict_is_never_published(self):
        self.assertFalse(base.bundle_has_fresh_statz(roster(11, 0, conflicts=1)))

    def test_page_counts_must_reconcile(self):
        b = roster(12, 0)
        b['sources']['statz_hero_pages']['ok'] = 11
        self.assertFalse(base.bundle_has_fresh_statz(b))


class OneValidatorEverywhere(unittest.TestCase):
    """The same row validation guards publication, import, stored-bundle loading and cache restore."""

    def test_cache_restore_rejects_a_number_free_complete_bundle(self):
        self.assertTrue(base.bundle_is_complete(sparse_complete())[0], 'statuses alone still look complete')
        self.assertFalse(base.bundle_is_publishable(sparse_complete()))
        self.assertTrue(base.bundle_is_publishable(valid_complete()))

    def test_a_damaged_stored_bundle_is_skipped_loudly_and_never_crashes_the_run(self):
        import gzip, json
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / 'bundles' / 'gold.json.gz'
            target.parent.mkdir(parents=True)
            target.write_bytes(gzip.compress(json.dumps(sparse_complete()).encode('utf8')))
            with _captured_log() as messages:
                self.assertIsNone(s.load_publication(tmp, 'gold'))
            self.assertTrue(any('Stored complete bundle rejected for gold' in m for m in messages))

    def test_a_damaged_stored_bundle_does_not_hide_a_valid_independent_update(self):
        import gzip, json
        with tempfile.TemporaryDirectory() as tmp:
            kept = s.retain_publication(partial(), tmp)
            target = Path(tmp) / 'bundles' / 'gold.json.gz'
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(gzip.compress(json.dumps(sparse_complete()).encode('utf8')))
            with _captured_log():
                self.assertEqual(s.load_publication(tmp, 'gold')['generated_at'], kept['generated_at'])

    def test_the_committed_public_seed_validates(self):
        import gzip, json
        path = s.ROOT / 'public-seed-gold.json.gz'
        if not path.exists():
            self.skipTest('the public seed is not part of the source package')
        seed = json.loads(gzip.decompress(path.read_bytes()))
        self.assertTrue(base.validate_bundle_rows(seed))
        self.assertEqual(s.validate_publication_bundle(seed, 'gold')['generated_at'], seed['generated_at'])

    def test_locally_stored_real_bundles_validate_when_present(self):
        import gzip, json
        stores = sorted((s.ROOT / '.local-publisher' / 'state' / 'bundles').glob('*.json.gz'))
        if not stores:
            self.skipTest('no locally stored publication (expected in CI and clean checkouts)')
        for path in stores:
            with self.subTest(bracket=path.name):
                bundle = json.loads(gzip.decompress(path.read_bytes()))
                self.assertTrue(base.validate_bundle_rows(bundle))

    def test_validation_names_the_problem(self):
        b = valid_complete()
        b['tier_list'][0]['winRate'] = 150.0
        with self.assertRaisesRegex(ValueError, r'unit-test-fixture/jungle has an invalid winRate: 150\.0'):
            s.validate_publication_bundle(b, 'gold')

    def test_observations_are_never_altered_by_validation(self):
        import json
        b = valid_complete(); before = json.dumps(b, sort_keys=True)
        base.validate_bundle_rows(b)
        self.assertEqual(json.dumps(b, sort_keys=True), before)


class StoredFileDamage(unittest.TestCase):
    """A stored file damaged in any way is treated as absent, logged, and never stops the run."""

    @staticmethod
    def damaged():
        import gzip, json
        good = gzip.compress(json.dumps(valid_complete()).encode('utf8'))
        return {'truncated gzip': good[:len(good) // 2],
                'corrupt deflate data': good[:12] + bytes(b ^ 0x5A for b in good[12:40]) + good[40:],
                'not gzip at all': b'{"schema": 3',
                'JSON null': gzip.compress(b'null'),
                'JSON list': gzip.compress(b'[1, 2, 3]'),
                'empty file': b''}

    def test_a_damaged_complete_bundle_is_skipped_loudly(self):
        for label, raw in self.damaged().items():
            with self.subTest(damage=label), tempfile.TemporaryDirectory() as tmp:
                target = Path(tmp) / 'bundles' / 'gold.json.gz'
                target.parent.mkdir(parents=True)
                target.write_bytes(raw)
                with _captured_log() as messages:
                    self.assertIsNone(s.load_publication(tmp, 'gold'))
                self.assertTrue(any('Stored complete bundle rejected for gold' in m for m in messages))

    def test_a_damaged_partial_bundle_is_skipped_loudly_and_the_complete_one_still_loads(self):
        for label, raw in self.damaged().items():
            with self.subTest(damage=label), tempfile.TemporaryDirectory() as tmp:
                kept = s.retain_publication(valid_complete(), tmp)
                target = Path(tmp) / 'partial-bundles' / 'gold.json.gz'
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(raw)
                with _captured_log() as messages:
                    self.assertEqual(s.load_publication(tmp, 'gold')['generated_at'], kept['generated_at'])
                self.assertTrue(any('Independent update unavailable for gold' in m for m in messages))

    def test_rendering_the_site_survives_a_damaged_stored_bundle(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            kept = s.retain_publication(partial(), root)
            (root / 'bundles').mkdir(exist_ok=True)
            (root / 'bundles' / 'gold.json.gz').write_bytes(self.damaged()['truncated gzip'])
            with patch.object(s, 'CONFIG', dict(s.CONFIG, brackets=['gold'])), _captured_log():
                manifest = s.render_site(root, root / 'site', {'attempts': {'gold': {'status': 'partial'}}})
            self.assertEqual(manifest['cohorts']['gold']['status'], 'available')
            self.assertEqual(manifest['cohorts']['gold']['generated_at'], kept['generated_at'])

    def test_a_rejected_stored_gold_bundle_never_stops_the_seed_import(self):
        seed = s.ROOT / 'public-seed-gold.json.gz'
        if not seed.exists():
            self.skipTest('the public seed is not part of the source package')
        import gzip, json
        for label, raw in [('fails validation', gzip.compress(json.dumps(sparse_complete()).encode('utf8'))),
                           ('truncated gzip', self.damaged()['truncated gzip'])]:
            with self.subTest(stored=label), tempfile.TemporaryDirectory() as tmp:
                target = Path(tmp) / 'bundles' / 'gold.json.gz'
                target.parent.mkdir(parents=True)
                target.write_bytes(raw)
                with _captured_log() as messages:
                    self.assertTrue(s.import_public_seed(seed, tmp))
                self.assertTrue(any('Stored complete bundle rejected for gold' in m for m in messages))
                expected = json.loads(gzip.decompress(seed.read_bytes()))['generated_at']
                self.assertEqual(s.load_success(tmp, 'gold')['generated_at'], expected, 'the dated seed replaced the unusable file, date unchanged')


def pred_primary(statz='failed'):
    """A valid update whose Pred.gg partition is current while Statz failed: publishable as a Pred-primary partial."""
    from test_static_independent_sources import previous
    b = previous()
    b['generated_at'] = (NOW + dt.timedelta(minutes=5)).isoformat()
    b['sources']['statz_hero_pages'].update(status=statz)
    b['errors'] = [{'source': 'statz.gg hero pages', 'severity': 'error', 'detail': 'Synthetic failure'}]
    return b


class PredPrimaryRows(unittest.TestCase):
    """The Pred.gg-primary publication branch validates the rows that are observations (release-notes #1)."""

    def test_a_valid_pred_primary_update_is_publishable(self):
        b = pred_primary()
        self.assertFalse(base.bundle_is_complete(b)[0])
        self.assertTrue(base.bundle_has_current_primary(b))
        self.assertTrue(base.bundle_is_publishable(b))
        self.assertIn('partial', s.validate_publication_bundle(b, 'gold')['refresh_result'])

    def test_damaged_rows_on_the_pred_primary_branch_are_rejected(self):
        for label, damage in [('win rate 250', lambda b: b['tier_list'][0].update(winRate=250.0)),
                              ('zero sample', lambda b: b['tier_list'][0].update(matches=0)),
                              ('duplicate row', lambda b: b['tier_list'].append(copy.deepcopy(b['tier_list'][0]))),
                              ('NaN role rate', lambda b: b['heroes']['unit-test-fixture']['roles']['jungle'].update(winRate=float('nan')))]:
            with self.subTest(damage=label):
                b = pred_primary(); damage(b)
                self.assertTrue(base.bundle_has_current_primary(b), 'statuses alone still look like a current Pred.gg update')
                self.assertFalse(base.bundle_is_publishable(b))
                with self.assertRaises(ValueError):
                    s.validate_publication_bundle(b, 'gold')

    def test_a_role_whose_statz_page_failed_is_not_an_observation_and_stays_publishable(self):
        b = pred_primary()
        b['heroes']['unit-test-fixture']['roles']['jungle'] = {'status': 'failed', 'error': 'FetchError: timed out'}
        self.assertTrue(base.bundle_is_publishable(b))
        b['heroes']['unit-test-fixture']['roles']['jungle'].update(winRate=50.0, playedGames=200)
        self.assertFalse(base.bundle_is_publishable(b), 'a failed role may not carry numbers')

    def test_a_pred_primary_update_with_no_statz_rows_at_all_stays_publishable(self):
        b = pred_primary()
        b['tier_list'] = []
        self.assertTrue(base.bundle_is_publishable(b))


class DesktopCacheRestore(unittest.TestCase):
    """The Windows app restores, saves and retains a 'success' only when its rows validate (D1#3)."""

    def setUp(self):
        from unittest.mock import patch
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        folder = Path(self.tmp.name)
        for name, value in (('DATA_DIR', folder), ('LATEST_BUNDLE', folder / 'latest_bundle.json')):
            patcher = patch.object(base, name, value); patcher.start(); self.addCleanup(patcher.stop)

    def test_a_number_free_success_is_not_a_success(self):
        complete, reason = base.collection_verdict(sparse_complete())
        self.assertFalse(complete)
        self.assertIn('rows failed validation', reason)
        self.assertTrue(base.collection_verdict(valid_complete())[0])

    def test_a_number_free_saved_success_is_never_restored_or_retained(self):
        import json
        for name in ('last_successful_gold.json', 'latest_bundle.json'):
            (base.DATA_DIR / name).write_text(json.dumps(sparse_complete()), encoding='utf8')
        with _captured_log() as messages:
            self.assertIsNone(base.read_cached('gold'))
        self.assertTrue(any('failed validation and was not used' in m for m in messages))
        self.assertIsNone(base.retained_statz_bundle('gold'))

    def test_a_valid_saved_success_is_still_restored(self):
        import gzip, json
        seed = s.ROOT / 'public-seed-gold.json.gz'
        if not seed.exists():
            self.skipTest('the public seed is not part of the source package')
        raw = json.loads(gzip.decompress(seed.read_bytes()))
        (base.DATA_DIR / 'last_successful_gold.json').write_text(json.dumps(raw), encoding='utf8')
        with _captured_log():
            restored = base.read_cached('gold')
        self.assertIsNotNone(restored)
        self.assertEqual(restored['cache']['file'], 'last_successful_gold.json')
        self.assertEqual(restored['generated_at'], raw['generated_at'])


def dated_damaged():
    """Clean statuses and usable fetch dates, but one out-of-range row: only row validation can catch it."""
    b = valid_complete()
    b['tier_list'][0]['winRate'] = 250.0
    return b


class DesktopSavePaths(unittest.TestCase):
    """The Windows app's own save, restore and display paths (second review round)."""

    def setUp(self):
        from unittest.mock import patch
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        folder = Path(self.tmp.name)
        for name, value in (('DATA_DIR', folder), ('LATEST_BUNDLE', folder / 'latest_bundle.json'), ('SNAP_DIR', folder / 'snapshots'),
                            ('OUT_HTML', folder / 'export.html'), ('SETTINGS_FILE', folder / 'settings.json')):
            patcher = patch.object(base, name, value); patcher.start(); self.addCleanup(patcher.stop)

    def once(self, collected):
        import sys as _sys
        collected.setdefault('timings', {})
        from unittest.mock import patch
        with patch.object(base, 'collect_bundle', return_value=collected), patch.object(base, 'render', return_value=None), \
             patch.object(_sys, 'argv', ['predecessor_meta.py', '--once', '--data-dir', str(base.DATA_DIR)]), _captured_log():
            return base.main()

    def test_once_never_saves_a_row_invalid_collection_as_a_success(self):
        self.assertEqual(self.once(dated_damaged()), 2)
        self.assertFalse((base.DATA_DIR / 'last_successful_gold.json').exists())
        self.assertTrue((base.DATA_DIR / 'last_attempt.json').exists())

    def test_once_saves_a_valid_collection_as_a_success(self):
        self.assertEqual(self.once(valid_complete()), 0)
        self.assertTrue((base.DATA_DIR / 'last_successful_gold.json').exists())

    def test_a_damaged_saved_pred_primary_update_is_never_restored(self):
        import json
        damaged = pred_primary(); damaged['tier_list'][0]['winRate'] = 250.0
        self.assertTrue(base.bundle_has_current_primary(damaged))
        (base.DATA_DIR / 'last_primary_gold.json').write_text(json.dumps(damaged), encoding='utf8')
        with _captured_log() as messages:
            self.assertIsNone(base.read_cached('gold'))
        self.assertTrue(any('last_primary_gold.json failed validation' in m for m in messages))

    def test_a_damaged_latest_bundle_never_stops_the_app_from_starting(self):
        import gzip, json
        seed = s.ROOT / 'public-seed-gold.json.gz'
        if not seed.exists():
            self.skipTest('the public seed is not part of the source package')
        (base.DATA_DIR / 'last_successful_gold.json').write_text(gzip.decompress(seed.read_bytes()).decode('utf8'), encoding='utf8')
        for damage in ({'schema': 3, 'official': None, 'sources': None}, None, [1, 2]):
            with self.subTest(latest=repr(damage)[:40]):
                base.LATEST_BUNDLE.write_text(json.dumps(damage), encoding='utf8')
                with _captured_log():
                    restored = base.read_cached('gold')
                self.assertEqual(restored['cache']['file'], 'last_successful_gold.json')

    def test_retained_statz_ignores_a_dated_success_whose_rows_fail(self):
        import json
        (base.DATA_DIR / 'last_successful_gold.json').write_text(json.dumps(dated_damaged()), encoding='utf8')
        self.assertIsNone(base.retained_statz_bundle('gold'))

    def test_retained_statz_uses_a_dated_success_whose_rows_validate(self):
        import json
        good = valid_complete()
        (base.DATA_DIR / 'last_successful_gold.json').write_text(json.dumps(good), encoding='utf8')
        from unittest.mock import patch
        with patch.object(base, 'source_records_before_review', side_effect=lambda b: b):
            self.assertEqual(base.retained_statz_bundle('gold')['generated_at'], good['generated_at'])


class PredPrimaryTierRows(unittest.TestCase):
    """A tier row whose hero page failed is still a collected tier-list observation (second review round)."""

    def failed_role(self):
        b = pred_primary()
        b['heroes']['unit-test-fixture']['roles']['jungle'] = {'status': 'failed', 'error': 'FetchError: timed out'}
        return b

    def test_the_tier_row_of_a_failed_page_is_still_checked(self):
        for label, damage in [('win rate 250', lambda b: b['tier_list'][0].update(winRate=250.0)),
                              ('negative pick rate', lambda b: b['tier_list'][0].update(pickRate=-5.0)),
                              ('zero sample', lambda b: b['tier_list'][0].update(matches=0)),
                              ('duplicate row', lambda b: b['tier_list'].append(copy.deepcopy(b['tier_list'][0])))]:
            with self.subTest(damage=label):
                b = self.failed_role(); damage(b)
                self.assertFalse(base.bundle_is_publishable(b))

    def test_an_intact_tier_row_of_a_failed_page_stays_publishable(self):
        self.assertTrue(base.bundle_is_publishable(self.failed_role()))


class SeedNeverMovesADateBack(unittest.TestCase):
    def test_a_damaged_stored_bundle_is_restored_from_the_newer_collector_copy(self):
        import gzip, json
        seed = s.ROOT / 'public-seed-gold.json.gz'
        if not seed.exists():
            self.skipTest('the public seed is not part of the source package')
        seeded = json.loads(gzip.decompress(seed.read_bytes()))
        newer = copy.deepcopy(seeded)
        newer['generated_at'] = (dt.datetime.fromisoformat(seeded['generated_at']) + dt.timedelta(days=9)).isoformat()
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / 'bundles' / 'gold.json.gz'
            target.parent.mkdir(parents=True)
            target.write_bytes(gzip.compress(json.dumps(newer).encode('utf8'))[:200])   # truncated
            (Path(tmp) / 'collector').mkdir()
            (Path(tmp) / 'collector' / 'last_successful_gold.json').write_text(json.dumps(newer), encoding='utf8')
            with _captured_log() as messages:
                self.assertFalse(s.import_public_seed(seed, tmp), 'the older seed was not imported')
            self.assertEqual(s.load_success(tmp, 'gold')['generated_at'], newer['generated_at'])
            self.assertTrue(any('Restored gold from the verified collector copy' in m for m in messages))


import contextlib


@contextlib.contextmanager
def _captured_log():
    """predecessor_meta.log prints; capture what it says without changing it."""
    messages, original = [], base.log
    base.log = lambda message: messages.append(str(message))
    try:
        yield messages
    finally:
        base.log = original


if __name__ == '__main__':
    unittest.main()
