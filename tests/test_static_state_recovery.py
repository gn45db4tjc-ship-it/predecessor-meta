"""Corrupt cached state and partial live recovery (Codex audit #239 F4, F5; PRED-M11).

F4: a truncated publication.json in the restored Actions cache suppressed live recovery (its presence meant "state
exists"), then stopped the publisher when parsed, and was saved again under a key the next run restores. F5: after a
cache eviction, a restore that recovered Gold+ but rejected Silver+ copied the collection clock and wrote state, so the
next publish could replace the working site with Silver+ missing, and later runs never retried the restore.
"""
import copy
import datetime as dt
import gzip
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import import_local_feed as feed
import static_publish as sp

ROOT = Path(__file__).resolve().parents[1]
SITE = 'https://example.test/predecessor-meta/'
GOLD_AT = '2026-10-01T17:00:11-05:00'
SILVER_AT = '2026-10-01T16:40:02-05:00'


def seed():
    return json.loads(gzip.decompress((ROOT / 'public-seed-gold.json.gz').read_bytes()))


def bundles():
    gold = seed(); gold['generated_at'] = GOLD_AT
    silver = copy.deepcopy(gold); silver['generated_at'] = SILVER_AT
    silver['bracket'] = dict(silver['bracket'], segment='silver', label='Silver+', statz_ranked_field=['Silver'])
    return {'gold': gold, 'silver': silver}


def live_site(live, broken=()):
    """A fake live site serving each bundle under its checksum name; ranks in `broken` serve other bytes."""
    files, cohorts = {}, {}
    for rank, bundle in live.items():
        raw = json.dumps(bundle, ensure_ascii=False, separators=(',', ':')).encode('utf8')
        sha = hashlib.sha256(raw).hexdigest()
        url = 'bundles/%s-%s.json' % (rank, sha)
        files[SITE + url] = raw + b' ' if rank in broken else raw
        cohorts[rank] = {'url': url, 'sha256': sha, 'generated_at': bundle['generated_at'], 'status': 'available',
                         'source_signature': 'sig', 'last_attempt': {'status': 'ok', 'at': bundle['generated_at'], 'errors': []}}
    manifest = {'schema': 2, 'published_at': '2026-10-02T04:01:09+00:00', 'last_full_attempt_at': '2026-10-01T16:56:49-05:00',
                'patch_check': {'status': 'verified', 'version': '1.16.4', 'signature': 'sig'}, 'cohorts': cohorts}
    files[SITE + 'manifest.json'] = json.dumps(manifest).encode('utf8')
    return lambda u: files[u]


class CorruptState(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())

    def write(self, text):
        (self.dir / 'publication.json').write_text(text, encoding='utf8')

    def test_truncated_state_is_set_aside_and_recovered_from_the_live_site(self):
        self.write('{"schema": 1, "attempts": {"gold": {"status": "ok"')
        report = sp.restore_from_live(self.dir, SITE, fetch=live_site(bundles()))
        self.assertEqual(report['restored'], ['gold', 'silver'])
        state = sp.load_state(self.dir)
        self.assertEqual(state['last_full_attempt_at'], '2026-10-01T16:56:49-05:00')
        self.assertEqual(sp.load_publication(self.dir, 'silver')['generated_at'], SILVER_AT)
        self.assertNotIn('live_recovery', state)
        self.assertEqual(len(list(self.dir.glob('publication.json.invalid-*'))), 1)

    def test_a_failed_restore_after_truncation_leaves_the_next_run_eligible(self):
        self.write('{"schema": 1, "atte')
        def offline(url):
            raise OSError('offline')
        sp.restore_from_live(self.dir, SITE, fetch=offline)
        self.assertEqual(list(sp.load_state(self.dir)['live_recovery']['pending']), ['*'])
        self.assertEqual(sp.restore_from_live(self.dir, SITE, fetch=live_site(bundles()))['restored'], ['gold', 'silver'])
        self.assertNotIn('live_recovery', sp.load_state(self.dir))
        self.assertEqual(sp.load_publication(self.dir, 'gold')['generated_at'], GOLD_AT)

    def test_wrong_shapes_are_set_aside(self):
        for text in ('[1]', '{"attempts": [1]}', '{"attempts": {"gold": 3}}', '{"required_retry": "x"}',
                     '{"last_full_attempt_at": 5}', '{"live_recovery": {"pending": ["gold"]}}'):
            self.write(text)
            self.assertIsNone(sp.load_state(self.dir), text)
            self.assertFalse((self.dir / 'publication.json').exists(), text)

    def test_a_null_object_field_is_set_aside_and_recovered(self):
        # Codex verify of PR #241 (item c): "attempts": null passed validation, skipped the restore, then crashed the
        # manifest step on state.get('attempts', {}).get(...).
        for key in sp.STATE_OBJECTS:
            self.write(json.dumps({'schema': 1, 'attempts': {}, key: None}))
            self.assertIsNone(sp.load_state(self.dir), key)
            self.assertFalse((self.dir / 'publication.json').exists(), key)
        self.write('{"schema": 1, "attempts": null}')
        self.assertEqual(sp.restore_from_live(self.dir, SITE, fetch=live_site(bundles()))['restored'], ['gold', 'silver'])
        self.assertIsInstance(sp.load_state(self.dir)['attempts'], dict)

    def test_an_incomplete_or_nested_wrong_state_is_set_aside(self):
        # Muse review of PR #241: {} and wrong nested fields passed, then run() failed on state['attempts'][bracket]
        # or on int() of a nested count, every hourly run.
        for state in ({}, {'schema': 1},
                      {'attempts': {'gold': {'errors': 'x'}}}, {'attempts': {'gold': {'errors': [3]}}},
                      {'attempts': {'gold': {'status': 5}}}, {'attempts': {'gold': {'seconds': 'slow'}}},
                      {'attempts': {}, 'required_retry': {'attempts': '2'}}, {'attempts': {}, 'required_retry': {'attempts': True}},
                      {'attempts': {}, 'required_retry': {'next_at': 'soon'}}, {'attempts': {}, 'pred_retry': {'attempts': -1}},
                      {'attempts': {}, 'pred_retry': {'limit': 'four'}}, {'attempts': {}, 'patch_check': {'signature': 7}},
                      {'attempts': {}, 'live_recovery': {'pending': {'silver': None}, 'since': 'yesterday'}},
                      # Muse round 2: the watchdog int()s required_retry.limit, and the retry rules match each error's
                      # source and detail as text.
                      {'attempts': {}, 'required_retry': {'limit': 'two'}}, {'attempts': {}, 'required_retry': {'limit': -1}},
                      {'attempts': {'gold': {'errors': [{'source': 5}]}}}, {'attempts': {'gold': {'errors': [{'detail': ['HTTP 403']}]}}},
                      {'attempts': {'gold': {'errors': [{'severity': {'x': 1}}]}}}):
            self.write(json.dumps(state))
            self.assertIsNone(sp.load_state(self.dir), state)
            self.assertFalse((self.dir / 'publication.json').exists(), state)
        self.write('{}')
        self.assertEqual(sp.restore_from_live(self.dir, SITE, fetch=live_site(bundles()))['restored'], ['gold', 'silver'])
        self.assertIsInstance(sp.load_state(self.dir)['attempts'], dict)

    def test_states_the_publisher_writes_are_kept(self):
        for state in ({'schema': 1, 'attempts': {}},
                      {'schema': 1, 'attempts': {'gold': {'at': '2026-11-28T00:00:00+00:00', 'status': 'interrupted', 'reason': 'daily',
                                                          'errors': [{'source': 'Daily collection', 'severity': 'error', 'detail': 'x'},
                                                                     {'source': 'Pred.gg', 'severity': 'error', 'detail': None}]}},
                       'required_retry': {'pending': False, 'blocked': False, 'attempts': 0, 'limit': 2, 'next_at': None, 'reason': None},
                       'pred_retry': {'pending': True, 'attempts': 1, 'limit': 4, 'next_at': '2026-11-28T02:30:00+00:00'},
                       'patch_check': {'status': 'verified', 'signature': None, 'version': '1.18'},
                       'live_recovery': {'pending': {'silver': SILVER_AT}, 'since': '2026-11-28T00:00:00+00:00', 'checked_at': '2026-11-28T00:00:00+00:00', 'reason': 'x'}}):
            self.write(json.dumps(state))
            self.assertEqual(sp.load_state(self.dir), state)

    def test_a_null_retry_count_is_kept_and_read_as_zero(self):
        # Muse round 3: nested_problem allows a null count, and collection_reason then failed on int(None).
        state = {'schema': 1, 'attempts': {}, 'last_full_attempt_at': '2026-11-28T00:00:00+00:00',
                 'required_retry': {'pending': True, 'blocked': False, 'attempts': None},
                 'pred_retry': {'pending': True, 'attempts': None}}
        self.write(json.dumps(state))
        self.assertEqual(sp.load_state(self.dir), state)
        now = dt.datetime(2026, 11, 28, 6, tzinfo=dt.timezone.utc)
        with mock.patch.object(sp, 'daily_boundary', return_value=now - dt.timedelta(hours=7)):
            self.assertEqual(sp.collection_reason(state, {}, now), 'Automatic required-source retry')

    def test_an_error_without_a_source_or_detail_is_read_as_empty_text(self):
        # Muse round 2: a kept state may carry an error whose source or detail is null; the retry rules read it as ''.
        attempt = {'status': 'partial', 'errors': [{'source': None, 'severity': 'error', 'detail': None}]}
        self.assertFalse(sp.required_source_block(attempt))
        self.assertFalse(sp.pred_retryable(attempt))
        self.assertTrue(sp.required_source_failure(attempt))
        self.assertFalse(sp.optional_pred_only(attempt, None))

    def test_valid_state_is_kept_and_restore_leaves_it_alone(self):
        self.write('{"schema": 1, "attempts": {}, "marker": 1}')
        self.assertEqual(sp.restore_from_live(self.dir, SITE, fetch=live_site(bundles()))['restored'], [])
        self.assertEqual(sp.load_state(self.dir)['marker'], 1)

    def test_the_windows_importer_does_not_crash_on_truncated_state(self):
        self.write('{"schema": 1, "att')
        folder = Path(tempfile.mkdtemp())
        (folder / 'collector.json').write_text('{"schema": 1, "bundles": []}', encoding='utf8')
        self.assertEqual(feed.import_feed(folder, self.dir)['status'], 'rejected')


class PartialRecovery(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.live = bundles()

    def test_a_rejected_rank_holds_deployment_and_is_restored_on_replay(self):
        report = sp.restore_from_live(self.dir, SITE, fetch=live_site(self.live, broken={'silver'}))
        self.assertEqual((report['restored'], sorted(report['rejected'])), (['gold'], ['silver']))
        state = sp.load_state(self.dir)
        self.assertEqual(state['live_recovery']['pending'], {'silver': SILVER_AT})
        self.assertEqual(sp.held_ranks(self.dir, state), ['silver'])
        # Replay with valid Silver+ bytes: both ranks are present with their original dates, nothing is held.
        self.assertEqual(sp.restore_from_live(self.dir, SITE, fetch=live_site(self.live))['restored'], ['silver'])
        state = sp.load_state(self.dir)
        self.assertNotIn('live_recovery', state)
        self.assertEqual(sp.held_ranks(self.dir, state), [])
        self.assertEqual({r: sp.load_publication(self.dir, r)['generated_at'] for r in ('gold', 'silver')},
                         {'gold': GOLD_AT, 'silver': SILVER_AT})

    def test_an_older_seed_is_not_a_replacement_for_a_newer_live_rank(self):
        sp.restore_from_live(self.dir, SITE, fetch=live_site({'gold': self.live['gold']}, broken={'gold'}))
        sp.import_public_seed(ROOT / 'public-seed-gold.json.gz', self.dir)
        self.assertIsNotNone(sp.load_publication(self.dir, 'gold'))
        self.assertEqual(sp.held_ranks(self.dir, sp.load_state(self.dir)), ['gold'])

    def test_the_hold_ends_after_its_window(self):
        sp.restore_from_live(self.dir, SITE, fetch=live_site(self.live, broken={'silver'}))
        state = sp.load_state(self.dir)
        later = sp.utc_time(state['live_recovery']['since']) + dt.timedelta(hours=25)
        self.assertEqual(sp.held_ranks(self.dir, state, now=later), [])

    def test_an_expired_hold_publishes_and_names_the_missing_rank(self):
        # Will's decision of 28 Nov 2026 on PR #241: keep the 24-hour limit, and alert. After the hold the site is
        # published, and the manifest names the rank still missing so the watchdog opens an issue.
        sp.restore_from_live(self.dir, SITE, fetch=live_site(self.live, broken={'silver'}))
        state = sp.load_state(self.dir)
        since = sp.utc_time(state['live_recovery']['since'])
        self.assertEqual(sp.expired_hold(self.dir, state, now=since + dt.timedelta(hours=23)), {})
        expired = sp.expired_hold(self.dir, state, now=since + dt.timedelta(hours=25))
        self.assertEqual((expired['ranks'], expired['hold_hours'], expired['since']), (['silver'], 24, state['live_recovery']['since']))
        out = Path(tempfile.mkdtemp())
        with mock.patch.object(sp.base, 'now_utc', return_value=since + dt.timedelta(hours=25)), mock.patch.object(sp, 'output_flag') as flag:
            manifest = sp.render_site(self.dir, out, state)
        self.assertNotIn('deploy_held', manifest)
        self.assertEqual(manifest['recovery_expired']['ranks'], ['silver'])
        flag.assert_any_call('publishable', True)
        self.assertEqual(json.loads((out / 'manifest.json').read_text(encoding='utf8'))['recovery_expired']['ranks'], ['silver'])
        # Codex review of #241 at 7c5dc11: the next pass reads a live site that now lists Silver as unavailable; Silver
        # stays pending with its original date and start, so the alert stays until a bundle replaces it.
        first = copy.deepcopy(state['live_recovery'])
        sp.restore_from_live(self.dir, SITE, fetch=live_site({'gold': self.live['gold']}))
        kept = sp.load_state(self.dir)['live_recovery']
        self.assertEqual((kept['pending'], kept['since']), (first['pending'], first['since']))
        self.assertEqual(sp.expired_hold(self.dir, sp.load_state(self.dir), now=since + dt.timedelta(hours=26))['ranks'], ['silver'])
        # Without a readable start time the hold lasts, so nothing has expired.
        self.assertEqual(sp.expired_hold(self.dir, {'live_recovery': {'pending': {'silver': SILVER_AT}}}), {})

    def test_a_pending_rank_without_a_start_time_stays_held(self):
        # Muse review of PR #241: a missing or unreadable `since` lifted the hold at once while Silver+ was missing.
        sp.restore_from_live(self.dir, SITE, fetch=live_site(self.live, broken={'silver'}))
        state = sp.load_state(self.dir)
        state['live_recovery'].pop('since')
        self.assertEqual(sp.held_ranks(self.dir, state), ['silver'])
        (self.dir / 'publication.json').write_text(json.dumps(state), encoding='utf8')
        sp.restore_from_live(self.dir, SITE, fetch=live_site(self.live, broken={'silver'}))
        self.assertIsNotNone(sp.utc_time(sp.load_state(self.dir)['live_recovery']['since']), 'the next pass starts the clock')

    def test_render_site_publishes_nothing_while_a_rank_is_held(self):
        sp.restore_from_live(self.dir, SITE, fetch=live_site(self.live, broken={'silver'}))
        out = Path(tempfile.mkdtemp())
        with mock.patch.object(sp, 'output_flag') as flag:
            manifest = sp.render_site(self.dir, out, sp.load_state(self.dir))
        self.assertEqual(manifest['deploy_held']['ranks'], ['silver'])
        flag.assert_any_call('publishable', False)
        self.assertFalse((out / 'manifest.json').exists())


if __name__ == '__main__':
    unittest.main()
