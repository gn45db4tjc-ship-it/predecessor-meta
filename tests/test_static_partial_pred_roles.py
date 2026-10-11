"""2.53.1: a partial Pred.gg collection keeps a failed role's last good rows instead of leaving that role empty.

On 10 Oct 2026 Pred.gg returned HTTP 500 for the jungle, offlane and midlane role pages; those roles' Meta tables were
empty until the next good collection. A failed role now keeps the previous collection's rows for the identical cohort
(patch, hotfix versions, rank, rating, ranked mode), at most 30 hours old, with their original dates and marked as
kept. Fresh roles are never replaced, a wholly failed collection is left to retain_pred_partition, and sources are
never pooled (no Statz rows stand in)."""
import copy, datetime as dt, inspect, unittest

import predecessor_meta as m

NOW = dt.datetime(2026, 10, 10, 20, 0, tzinfo=dt.timezone.utc)
COHORT = {'source': 'Pred.gg', 'patch': '1.17', 'hotfixes': ['1.17.1'], 'bracket': 'gold', 'bracket_label': 'Gold+',
          'rating': 'Season 1 - Split 5', 'versions': ['167', '168'], 'ranks': [str(r) for r in range(27, 37)], 'gameModes': ['RANKED']}


def at(hours_ago):
    return (NOW - dt.timedelta(hours=hours_ago)).isoformat().replace('+00:00', 'Z')


def rows(role, when, slugs=('aurora', 'zarus')):
    return [{'slug': s, 'role': role, 'winRate': 51.0, 'matches': 400, 'wonGames': 204, 'source': 'Pred.gg',
             'url': 'https://pred.gg/heroes?role=' + role.upper(), 'fetched_at': when} for s in slugs]


def block(role, when):
    return {'status': 'ok', 'url': 'https://pred.gg/heroes?role=' + role.upper(), 'fetched_at': when, 'rows': rows(role, when)}


def scoped(statuses, when, cohort=COHORT):
    out = dict(copy.deepcopy(cohort), roles={}, rows=[], errors=[], hero_wide={'aurora': {}, 'zarus': {}})
    for role, status in statuses.items():
        if status == 'ok':
            out['roles'][role] = block(role, when); out['rows'] += rows(role, when)
        else:
            out['roles'][role] = {'status': 'failed', 'url': 'https://pred.gg/heroes?role=' + role.upper(), 'error': 'HTTP 500 for ' + role}
            out['errors'].append({'source': 'Pred.gg ' + role, 'severity': 'error', 'detail': 'HTTP 500 for ' + role})
    out['status'] = 'failed' if not out['rows'] else 'partial' if out['errors'] else 'ok'
    return out


def bundle(scoped_statistics):
    heroes = {s: {'slug': s, 'roles_order': list(m.ROLES)} for s in ('aurora', 'zarus')}
    return {'bracket': {'segment': 'gold'}, 'official': {'status': 'verified', 'live': {'version': '1.17'}}, 'heroes': heroes,
            'scoped_statistics': scoped_statistics, 'errors': list(scoped_statistics['errors'])}


ALL_OK = {r: 'ok' for r in m.ROLES}
TODAY = dict(ALL_OK, jungle='failed', offlane='failed', midlane='failed')


class KeepFailedRoles(unittest.TestCase):
    def test_a_failed_role_keeps_the_previous_rows_with_their_original_date(self):
        current, previous = bundle(scoped(TODAY, at(0))), bundle(scoped(ALL_OK, at(6)))
        fresh = copy.deepcopy(current['scoped_statistics']['roles']['carry'])
        kept = m.keep_previous_pred_roles(current, previous, at=NOW)
        s = current['scoped_statistics']
        self.assertEqual(kept, ['jungle', 'offlane', 'midlane'])
        for role in kept:
            self.assertEqual(s['roles'][role]['status'], 'retained')
            self.assertEqual(s['roles'][role]['fetched_at'], at(6), 'the original fetch date is kept')
            self.assertEqual(s['roles'][role]['rows'], previous['scoped_statistics']['roles'][role]['rows'])
            self.assertIn('HTTP 500', s['roles'][role]['error'], 'this collection\'s failure stays recorded')
            self.assertTrue(s['roles'][role]['kept_from_previous'])
            self.assertEqual(sum(r['role'] == role for r in s['rows']), 2, 'kept rows join the role list')
        self.assertEqual(s['roles']['carry'], fresh, 'a fresh role is never replaced')
        self.assertEqual(s['status'], 'partial', 'a collection with failed pages is never called ok')
        warnings = [e for e in current['errors'] if e['source'] == 'Pred.gg kept role statistics']
        self.assertEqual(len(warnings), 1)
        self.assertIn('jungle, offlane, midlane', warnings[0]['detail'])
        self.assertEqual(warnings[0]['severity'], 'warning')
        self.assertEqual(sum(e['severity'] == 'error' for e in s['errors']), 3, 'the original failures stay listed')

    def test_nothing_is_kept_from_another_cohort(self):
        for change in ({'versions': ['167']}, {'patch': '1.16.4'}, {'rating': 'Season 1 - Split 4'}, {'ranks': ['30', '31']}):
            current, previous = bundle(scoped(TODAY, at(0))), bundle(scoped(ALL_OK, at(6), dict(COHORT, **change)))
            self.assertEqual(m.keep_previous_pred_roles(current, previous, at=NOW), [], change)
            self.assertEqual(current['scoped_statistics']['roles']['jungle']['status'], 'failed')

    def test_rows_older_than_30_hours_are_not_kept(self):
        current, previous = bundle(scoped(TODAY, at(0))), bundle(scoped(ALL_OK, at(31)))
        self.assertEqual(m.keep_previous_pred_roles(current, previous, at=NOW), [])
        current, previous = bundle(scoped(TODAY, at(0))), bundle(scoped(ALL_OK, at(29)))
        self.assertEqual(m.keep_previous_pred_roles(current, previous, at=NOW), ['jungle', 'offlane', 'midlane'])

    def test_a_role_kept_last_time_is_kept_again_only_within_30_hours_of_its_original_fetch(self):
        middle = bundle(scoped(TODAY, at(3)))
        self.assertEqual(m.keep_previous_pred_roles(middle, bundle(scoped(ALL_OK, at(20))), at=NOW), ['jungle', 'offlane', 'midlane'])
        current = bundle(scoped(TODAY, at(0)))
        self.assertEqual(m.keep_previous_pred_roles(current, middle, at=NOW), ['jungle', 'offlane', 'midlane'])
        self.assertEqual(current['scoped_statistics']['roles']['jungle']['fetched_at'], at(20))
        later = NOW + dt.timedelta(hours=12)
        self.assertEqual(m.keep_previous_pred_roles(bundle(scoped(TODAY, at(0))), middle, at=later), [])

    def test_a_previous_failed_role_is_not_kept(self):
        current, previous = bundle(scoped(TODAY, at(0))), bundle(scoped(dict(ALL_OK, jungle='failed'), at(6)))
        self.assertEqual(m.keep_previous_pred_roles(current, previous, at=NOW), ['offlane', 'midlane'])

    def test_complete_and_wholly_failed_collections_are_left_alone(self):
        ok, previous = bundle(scoped(ALL_OK, at(0))), bundle(scoped(ALL_OK, at(6)))
        before = copy.deepcopy(ok)
        self.assertEqual(m.keep_previous_pred_roles(ok, previous, at=NOW), [])
        self.assertEqual(ok, before)
        failed = bundle(scoped({r: 'failed' for r in m.ROLES}, at(0)))
        before = copy.deepcopy(failed)
        self.assertEqual(m.keep_previous_pred_roles(failed, previous, at=NOW), [], 'retain_pred_partition owns a wholly failed source')
        self.assertEqual(failed, before)
        self.assertEqual(m.keep_previous_pred_roles(bundle(scoped(TODAY, at(0))), None, at=NOW), [])

    def test_a_collection_with_kept_roles_is_never_written_to_the_history(self):
        current = bundle(scoped(TODAY, at(0)))
        m.keep_previous_pred_roles(current, bundle(scoped(ALL_OK, at(6))), at=NOW)
        with self.assertRaises(ValueError):
            m.scoped_snapshot(current)

    def test_the_collector_keeps_failed_roles_before_it_saves(self):
        source = inspect.getsource(m.collect_bundle)
        self.assertIn('keep_previous_pred_roles(bundle,previous_pred)', source.replace(' ', ''))
        self.assertLess(source.index('keep_previous_pred_roles'), source.index('attach_scoped_history'))


if __name__ == '__main__':
    unittest.main()
