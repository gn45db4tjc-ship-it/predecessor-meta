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

    @unittest.expectedFailure
    def test_sparse_complete_bundle_is_rejected(self):
        with self.assertRaises(ValueError):
            s.validate_publication_bundle(sparse_complete(), 'gold')

    @unittest.expectedFailure
    def test_sparse_complete_bundle_is_never_retained(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):
                s.retain_publication(sparse_complete(), tmp)
            self.assertFalse((Path(tmp) / 'bundles' / 'gold.json.gz').exists())

    @unittest.expectedFailure
    def test_out_of_range_win_rate_is_rejected(self):
        b = valid_complete()
        b['tier_list'][0]['winRate'] = 150.0
        with self.assertRaises(ValueError):
            s.validate_publication_bundle(b, 'gold')

    @unittest.expectedFailure
    def test_non_finite_rate_is_rejected(self):
        b = valid_complete()
        b['heroes']['unit-test-fixture']['roles']['jungle']['winRate'] = float('nan')
        with self.assertRaises(ValueError):
            s.validate_publication_bundle(b, 'gold')

    @unittest.expectedFailure
    def test_zero_sample_is_rejected(self):
        b = valid_complete()
        b['tier_list'][0]['matches'] = 0
        with self.assertRaises(ValueError):
            s.validate_publication_bundle(b, 'gold')

    @unittest.expectedFailure
    def test_duplicate_hero_role_row_is_rejected(self):
        b = valid_complete()
        b['tier_list'].append(copy.deepcopy(b['tier_list'][0]))
        with self.assertRaises(ValueError):
            s.validate_publication_bundle(b, 'gold')

    @unittest.expectedFailure
    def test_tier_row_without_a_hero_role_record_is_rejected(self):
        b = valid_complete()
        b['heroes']['unit-test-fixture']['roles'] = {}
        with self.assertRaises(ValueError):
            s.validate_publication_bundle(b, 'gold')

    @unittest.expectedFailure
    def test_wins_inconsistent_with_sample_are_rejected(self):
        b = valid_complete()
        b['heroes']['unit-test-fixture']['roles']['jungle'].update(wonGames=190, playedGames=200, winRate=50.0)
        with self.assertRaises(ValueError):
            s.validate_publication_bundle(b, 'gold')

    @unittest.expectedFailure
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


if __name__ == '__main__':
    unittest.main()
