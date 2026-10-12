"""2.53.3: ride out dropped Pred.gg and omeda.city requests. Every number below is a synthetic fixture.

On 11 Oct 2026 the Windows collector's 20:03 UTC run lost Pred.gg in every rank to one SSL EOF on its first request
(https://pred.gg/heroes), tried once; Pred.gg is optional, so no same-day retry was scheduled and the next attempt was
the next day's 17:23 UTC run. Gold+ also lost every Pred.gg row while the other ranks kept theirs, because its last good
collection (10 Oct) was 'partial' and only an 'ok' or 'retained' cohort could be retained. omeda.city's builds.json
answered HTTP 500 once in the same run and every rank's community guides were empty."""
import copy
import datetime as dt
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import static_publish as p
import predecessor_meta as m
from test_static_publish import official, NOW
from test_static_independent_sources import partial, previous

EOF = m.FetchError('URLError: <urlopen error [SSL: UNEXPECTED_EOF_WHILE_READING] EOF occurred in violation of protocol '
                   '(_ssl.c:1010)> (for https://pred.gg/heroes)')
PAGE = ('<html></html>', 200, 0.1)


class Fetch:
    def __init__(self, *answers):
        self.answers, self.urls = list(answers), []

    def __call__(self, url):
        self.urls.append(url)
        answer = self.answers.pop(0) if self.answers else PAGE
        if isinstance(answer, Exception):
            raise answer
        return answer


class PredPageRetries(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.waits = []

    def pages(self, fetch):
        return m.PredPages(cache_dir=Path(self.tmp.name), fetch=fetch, sleep=self.waits.append)

    def test_the_11_october_ssl_eof_is_retried_and_the_page_is_read(self):
        fetch = Fetch(EOF, EOF, PAGE)
        self.assertEqual(self.pages(fetch).fetch_retrying('https://pred.gg/heroes'), PAGE)
        self.assertEqual(len(fetch.urls), 3)
        self.assertEqual(self.waits, list(m.PRED_RETRY_WAITS))

    def test_a_server_error_is_retried_but_gives_up_after_the_last_wait(self):
        fetch = Fetch(*[m.FetchError('HTTP 503 for https://pred.gg/heroes')] * 5)
        with self.assertRaisesRegex(m.FetchError, '503'):
            self.pages(fetch).fetch_retrying('https://pred.gg/heroes')
        self.assertEqual(len(fetch.urls), 1 + len(m.PRED_RETRY_WAITS))

    def test_access_answers_and_other_4xx_are_never_retried(self):
        for error in (m.SourceBlocked('HTTP 403 from https://pred.gg/heroes - blocking; stopping.'),
                      m.SourceBlocked('HTTP 429 from https://pred.gg/heroes - rate-limiting; stopping.'),
                      m.FetchError('HTTP 401 for https://pred.gg/heroes'), m.FetchError('HTTP 404 for https://pred.gg/heroes/x')):
            fetch = Fetch(error, PAGE)
            with self.assertRaises(m.FetchError):
                self.pages(fetch).fetch_retrying('https://pred.gg/heroes')
            self.assertEqual(len(fetch.urls), 1, str(error))
        self.assertEqual(self.waits, [])

    def test_a_403_through_get_still_stops_access_after_one_request(self):
        fetch = Fetch(m.SourceBlocked('HTTP 403 from https://pred.gg/heroes'))
        pages = self.pages(fetch)
        with self.assertRaises(m.SourceBlocked):
            pages.get('https://pred.gg/heroes', ttl=0)
        self.assertTrue(pages.blocked.is_set())
        self.assertEqual(len(fetch.urls), 1)

    def test_an_outage_stops_retrying_after_three_pages_fail_in_a_row(self):
        fetch = Fetch(*[EOF] * 50)
        pages = self.pages(fetch)
        for n in range(m.PRED_RETRY_STOP + 2):
            with self.assertRaises(m.FetchError):
                pages.fetch_retrying('https://pred.gg/heroes/hero-%d' % n)
        per_page = 1 + len(m.PRED_RETRY_WAITS)
        self.assertEqual(len(fetch.urls), m.PRED_RETRY_STOP * per_page + 2, 'later pages are tried once')

    def test_a_good_page_resets_the_count(self):
        pages = self.pages(Fetch(*[EOF] * 6, PAGE, EOF, EOF, PAGE))
        for _ in range(2):
            with self.assertRaises(m.FetchError):
                pages.fetch_retrying('https://pred.gg/heroes')
        pages.fetch_retrying('https://pred.gg/heroes')
        self.assertEqual(pages.failed_in_a_row, 0)
        self.assertEqual(pages.fetch_retrying('https://pred.gg/items'), PAGE, 'retries are back after a success')


def gold_partial_previous():
    """The shape of Gold+ on 10 Oct 2026: the cohort-wide page failed, all five roles were read."""
    b = previous()
    b['scoped_statistics'].update(status='partial', roles={'all': {'status': 'failed', 'error': 'HTTP 500'},
                                                           'jungle': {'status': 'ok', 'rows': [{'slug': 'unit-test-fixture'}]}})
    b['sources']['pred_scoped']['status'] = 'partial'
    return b


class GoldKeepsAPartialCohort(unittest.TestCase):
    def test_a_partial_previous_cohort_is_retained_with_its_gaps(self):
        b, old = partial(), gold_partial_previous()
        with patch.object(m, 'apply_pred_game_data'):
            self.assertTrue(m.retain_pred_partition(b, old))
        s = b['scoped_statistics']
        self.assertEqual(s['status'], 'retained')
        self.assertEqual(s['rows'], old['scoped_statistics']['rows'])
        self.assertEqual(s['roles']['all']['status'], 'failed', 'what the retained collection lacked stays unavailable')
        self.assertEqual(b['sources']['pred_scoped']['status'], 'retained')
        self.assertEqual(b['sources']['pred_scoped']['fetched_at'], NOW.isoformat(), 'the original date is kept')
        self.assertEqual(b['retained_sources']['pred']['statistics_fetched_at'], NOW.isoformat())
        detail = [e for e in b['errors'] if e['source'] == 'Pred.gg retained data'][0]['detail']
        self.assertIn('itself partial (all failed)', detail)
        self.assertFalse(m.bundle_is_complete(b)[0])

    def test_a_partial_cohort_with_no_rows_or_another_rank_is_not_retained(self):
        for mutate in (lambda o: o['scoped_statistics'].update(rows=[]), lambda o: o['scoped_statistics'].update(bracket='diamond')):
            b, old = partial(), gold_partial_previous(); mutate(old)
            with patch.object(m, 'apply_pred_game_data'):
                m.retain_pred_partition(b, old)
            self.assertNotEqual(b['scoped_statistics'].get('status'), 'retained')


def attempt(*details, source='Pred.gg current-patch statistics'):
    return {'status': 'partial', 'errors': [{'source': source, 'severity': 'error', 'detail': d} for d in details]}


class SameDayPredRetry(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.addCleanup(setattr, p, 'COLLECTOR_HOST', p.COLLECTOR_HOST)

    def test_only_dropped_connections_and_server_errors_are_retryable(self):
        self.assertTrue(p.pred_retryable(attempt(str(EOF))))
        self.assertTrue(p.pred_retryable(attempt('HTTP 500 for jungle')))
        for detail in ('HTTP 403 from https://pred.gg/heroes - the site is rate-limiting or blocking requests; stopping.',
                       'HTTP 429 from https://pred.gg/heroes', 'Pred.gg collection paused: Access needed No request was sent.',
                       'Pred.gg stopped after HTTP 403/429; no further requests',
                       'Public access stopped at 2026-10-11T20:03:00Z: HTTP 401'):
            self.assertFalse(p.pred_retryable(attempt(str(EOF), detail)), detail)
        self.assertFalse(p.pred_retryable(attempt('Statz failed', source='statz.gg hero pages')))
        self.assertFalse(p.pred_retryable({'status': 'ok', 'errors': []}))

    def state(self, hours_ago, attempts=0):
        return {'last_full_attempt_at': (NOW - dt.timedelta(hours=hours_ago)).isoformat(),
                'last_attempted_signature': p.live_signature(official()),
                'pred_retry': {'pending': True, 'attempts': attempts}}

    def test_the_windows_collector_retries_pred_on_its_next_check(self):
        p.COLLECTOR_HOST = 'windows'
        with patch.object(p, 'waits_for_local_collector', return_value=False), \
             patch.object(p, 'daily_boundary', return_value=NOW - dt.timedelta(hours=12)):
            self.assertIsNone(p.collection_reason(self.state(2), official(), NOW), 'not before the retry interval')
            self.assertEqual(p.collection_reason(self.state(3), official(), NOW), p.PRED_RETRY)
            self.assertIsNone(p.collection_reason(self.state(3, attempts=p.CONFIG['pred_retry_limit']), official(), NOW))
            p.COLLECTOR_HOST = None
            self.assertIsNone(p.collection_reason(self.state(3), official(), NOW), 'only the Windows collector can read Pred.gg')

    def run_once(self, when, collect):
        with patch.object(p.base, 'fetch_official', return_value=official()), \
             patch.object(p.base, 'now_utc', return_value=when), \
             patch.object(p.base, 'collect_bundle', side_effect=collect), \
             patch.object(p.base, 'DATA_DIR', self.root / 'data'), \
             patch.object(p, 'CONFIG', dict(p.CONFIG, brackets=['gold'])):
            p.run(self.root, self.root / 'site')
        return p.read_json(self.root / 'publication.json')

    def test_a_failed_pred_collection_schedules_retries_up_to_the_limit(self):
        p.COLLECTOR_HOST = 'windows'
        (self.root / 'data').mkdir()
        calls = []

        def dropped(settings, progress):
            calls.append(1)
            b = partial(); b['errors'] = [{'source': 'Pred.gg current-patch statistics', 'severity': 'error', 'detail': str(EOF)}]
            return b
        state = self.run_once(NOW, dropped)
        self.assertEqual(state['pred_retry']['pending'], True)
        self.assertEqual(state['pred_retry']['attempts'], 0)
        when = NOW
        for n in range(1, p.CONFIG['pred_retry_limit'] + 1):
            when += dt.timedelta(hours=3)
            with patch.object(p, 'daily_boundary', return_value=NOW - dt.timedelta(minutes=1)):
                state = self.run_once(when, dropped)
            self.assertEqual(state['pred_retry']['attempts'], n)
        self.assertFalse(state['pred_retry']['pending'], 'the limit ends the retries until the next daily run')
        self.assertEqual(len(calls), 1 + p.CONFIG['pred_retry_limit'])
        with patch.object(p, 'daily_boundary', return_value=NOW - dt.timedelta(minutes=1)):
            self.assertIsNone(p.collection_reason(state, official(), when + dt.timedelta(hours=3)))

    def test_a_success_or_a_block_schedules_no_retry(self):
        p.COLLECTOR_HOST = 'windows'
        (self.root / 'data').mkdir()

        def blocked(settings, progress):
            b = partial(); b['errors'] = [{'source': 'Pred.gg current-patch statistics', 'severity': 'error',
                                           'detail': 'HTTP 403 from https://pred.gg/heroes - stopping.'}]
            return b
        self.assertFalse(self.run_once(NOW, blocked)['pred_retry']['pending'])


def builds_bundle(version='1.17'):
    b = {'official': {'status': 'verified', 'live': {'version': version, 'hotfixes': []}},
         'heroes': {'kira': {'omeda': {'id': 7}, 'roles_order': ['carry']}},
         'omeda_items': {}, 'sources': {}, 'errors': []}
    return b


def saved_builds(version='1.17', status='ok'):
    b = builds_bundle(version)
    b['sources']['community_builds'] = {'status': status, 'fetched_at': '2026-10-10T23:03:00Z', 'count': 2}
    b['community_builds'] = [{'id': 1, 'slug': 'kira', 'role': 'carry', 'patch': version, 'fetched_at': '2026-10-10T23:03:00Z', 'items': []},
                             {'id': 2, 'slug': 'gone', 'role': 'carry', 'patch': version, 'fetched_at': '2026-10-10T23:03:00Z', 'items': []}]
    return b


class CommunityGuidesSurviveAServerError(unittest.TestCase):
    def test_a_server_error_is_retried(self):
        calls = []

        def fetch(url, timeout=None, retries=0):
            calls.append(retries)
            return '[]', 200, 0.1
        with patch.object(m, 'http_get', side_effect=fetch):
            m.attach_community_builds(builds_bundle())
        self.assertEqual(calls, [2], 'the request asks http_get for two retries on 5xx and network errors')

    def test_after_the_retries_fail_the_previous_guides_are_kept_with_their_date(self):
        b = builds_bundle()
        with patch.object(m, 'http_get', side_effect=m.FetchError('HTTP 500 for https://omeda.city/builds.json')):
            m.attach_community_builds(b, saved_builds())
        self.assertEqual([x['id'] for x in b['community_builds']], [1], 'a hero no longer on the roster is dropped')
        self.assertTrue(b['community_builds'][0]['kept_from_previous'])
        self.assertEqual(b['community_builds'][0]['fetched_at'], '2026-10-10T23:03:00Z')
        source = b['sources']['community_builds']
        self.assertEqual(source['status'], 'retained')
        self.assertEqual(source['fetched_at'], '2026-10-10T23:03:00Z')
        self.assertIn('HTTP 500', source['error'])
        self.assertIn('kept with their original fetch date', b['errors'][-1]['detail'])
        self.assertEqual(b['errors'][-1]['severity'], 'warning')

    def test_guides_from_another_patch_or_a_failed_collection_are_not_kept(self):
        for old in (saved_builds('1.16.4'), saved_builds(status='failed'), None):
            b = builds_bundle()
            with patch.object(m, 'http_get', side_effect=m.FetchError('HTTP 500')):
                m.attach_community_builds(b, old)
            self.assertEqual(b['community_builds'], [])
            self.assertEqual(b['sources']['community_builds']['status'], 'failed')



class ReviewFollowUps(unittest.TestCase):
    """Codex review of #143: each case below failed on the first 2.54.0 commit."""
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.addCleanup(setattr, p, 'COLLECTOR_HOST', p.COLLECTOR_HOST)

    def test_no_retry_is_sent_once_another_page_stopped_access_during_the_wait(self):
        pages = m.PredPages(cache_dir=self.root, fetch=Fetch(EOF, PAGE), sleep=lambda wait: pages.blocked.set())
        with self.assertRaises(m.SourceBlocked):
            pages.fetch_retrying('https://pred.gg/heroes')
        self.assertEqual(len(pages.fetch.urls), 1, 'the 403/429 stop holds for a page that was waiting to retry')

    def test_only_a_transient_failure_schedules_a_same_day_retry(self):
        for detail in ('Pred.gg roster coverage mismatch: 61 of 62 heroes', 'Expecting value: line 1 column 1 (char 0)',
                       'Current game patch unverified'):
            self.assertFalse(p.pred_retryable(attempt(detail)), detail)
        for detail in ('HTTP 502 for https://pred.gg/heroes', 'TimeoutError: The read operation timed out (for https://pred.gg/heroes)',
                       'RemoteDisconnected: Remote end closed connection without response (for https://pred.gg/heroes)'):
            self.assertTrue(p.pred_retryable(attempt(detail)), detail)

    def test_the_retry_count_is_saved_before_the_collection_starts(self):
        p.COLLECTOR_HOST = 'windows'
        (self.root / 'data').mkdir()
        p.write_json(self.root / 'publication.json', {'attempts': {}, 'last_attempted_signature': p.live_signature(official()),
            'last_full_attempt_at': (NOW - dt.timedelta(hours=3)).isoformat(), 'pred_retry': {'pending': True, 'attempts': 1}})
        seen = []

        def crash(settings, progress):
            seen.append(p.read_json(self.root / 'publication.json')['pred_retry']['attempts'])
            raise RuntimeError('collector stopped')
        with patch.object(p.base, 'fetch_official', return_value=official()), patch.object(p.base, 'now_utc', return_value=NOW), \
             patch.object(p.base, 'collect_bundle', side_effect=crash), patch.object(p.base, 'DATA_DIR', self.root / 'data'), \
             patch.object(p, 'daily_boundary', return_value=NOW - dt.timedelta(hours=12)), \
             patch.object(p, 'waits_for_local_collector', return_value=False), \
             patch.object(p, 'CONFIG', dict(p.CONFIG, brackets=['gold'])):
            try:p.run(self.root, self.root / 'site')
            except Exception:pass
        self.assertEqual(seen, [2], 'a crash during retry 2 cannot run retry 2 again')

    def test_guides_come_from_the_newest_bundle_that_has_them(self):
        def saved(name, hours, guides, pred):
            b = saved_builds() if guides else builds_bundle()
            b.update(schema=3, bracket={'segment': 'gold'}, generated_at=(NOW - dt.timedelta(hours=hours)).isoformat(),
                     pred_game_data={'status': 'ok', 'heroes': {'kira': {}}} if pred else {'status': 'failed'})
            m.save_bundle(b, self.root / (name + 'gold.json'), also_latest=False)
        with patch.object(m, 'DATA_DIR', self.root), patch.object(m, 'now_utc', return_value=NOW):
            saved('last_available_', 3, guides=True, pred=False)
            saved('last_successful_', 27, guides=False, pred=True)
            self.assertTrue(m.previous_guides_bundle('gold')['community_builds'])
            self.assertEqual(m.previous_pred_bundle('gold')['pred_game_data']['status'], 'ok')


if __name__ == '__main__':
    unittest.main()
