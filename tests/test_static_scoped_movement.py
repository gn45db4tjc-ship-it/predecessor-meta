"""2.53.0 (QP14): the phone's Meta screen leads with Pred.gg's largest win-rate moves since the previous pull.

The digest is computed from the same rows as the Changes table (both pulls 100+ games), added at collection and, for a
bundle collected earlier, at publication. It stays in the first-screen core; the full history moves to its annex."""
import copy, gzip, json, unittest
from pathlib import Path

import predecessor_meta as m
import projection as P

ROOT = Path(__file__).resolve().parents[1]
SEED = ROOT / 'public-seed-gold.json.gz'


def side(fetched, patch='1.17.1'):
    return {'cohort': {'source': 'Pred.gg', 'patch': patch, 'bracket': 'gold', 'bracket_label': 'Gold+'}, 'fetched_at': fetched, 'records': {}, 'origin': 'test'}


def change(slug, role, delta, before=500, after=520):
    return {'slug': slug, 'role': role, 'before': {'slug': slug, 'matches': before}, 'after': {'slug': slug, 'matches': after},
            'wr_delta': delta, 'minimum_sample': min(before, after), 'sample_decreased': after < before}


def scoped(changes):
    return {'source': 'Pred.gg', 'status': 'ok', 'errors': [], 'vs_previous_run': {'from': side('2026-10-05T08:00:00Z'), 'to': side('2026-10-05T11:00:00Z'),
            'changes': changes, 'new': [], 'gone': [], 'note': 'n'}, 'vs_previous_patch': None, 'current': side('2026-10-05T11:00:00Z')}


class ScopedMovement(unittest.TestCase):
    def test_two_largest_rises_and_falls_per_role_with_both_pulls_over_100_games(self):
        out = m.scoped_movement(scoped([
            change('shinbi', 'jungle', 0.41), change('kallari', 'jungle', 0.2), change('khaimera', 'jungle', 0.3),
            change('riktor', 'jungle', -0.41), change('zarus', 'jungle', -0.05), change('steel', 'jungle', -0.2),
            change('grux', 'jungle', 0.0), change('fey', 'jungle', 0.009),        # no move: zero, and under 0.01 pp
            change('sevarog', 'jungle', 2.5, before=99, after=400),              # one pull under 100 games: excluded
            change('gideon', 'midlane', -1.2)]))
        jungle = out['roles']['jungle']
        self.assertEqual([r['slug'] for r in jungle['rises']], ['shinbi', 'khaimera'])
        self.assertEqual([r['slug'] for r in jungle['falls']], ['riktor', 'steel'])
        self.assertEqual(jungle['compared'], 8, 'rows with 100+ games in both pulls, moved or not')
        self.assertEqual(jungle['rises'][0], {'slug': 'shinbi', 'wr_delta': 0.41, 'matches_from': 500, 'matches_to': 520})
        self.assertEqual(out['roles']['midlane']['falls'][0]['slug'], 'gideon')
        self.assertEqual(out['roles']['carry'], {'compared': 0, 'rises': [], 'falls': []})
        self.assertEqual(set(out['roles']), set(m.ROLES))
        self.assertEqual((out['from']['fetched_at'], out['to']['fetched_at'], out['to']['patch'], out['bracket_label'], out['minimum_games']),
                         ('2026-10-05T08:00:00Z', '2026-10-05T11:00:00Z', '1.17.1', 'Gold+', 100))

    def test_no_previous_pull_means_no_digest(self):
        self.assertIsNone(m.scoped_movement({'status': 'unavailable', 'vs_previous_run': None}))
        self.assertIsNone(m.scoped_movement(None))

    def test_publication_adds_the_digest_once_without_touching_observations(self):
        bundle = {'generated_at': 'x', 'scoped_changes': scoped([change('shinbi', 'jungle', 0.41)])}
        before = copy.deepcopy(bundle)
        published = m.with_scoped_movement(bundle)
        self.assertEqual(bundle, before, 'the stored bundle is not modified')
        self.assertEqual(published['scoped_changes']['movement'], m.scoped_movement(bundle['scoped_changes']))
        self.assertEqual({k: v for k, v in published['scoped_changes'].items() if k != 'movement'}, bundle['scoped_changes'])
        self.assertIs(m.with_scoped_movement(published), published, 'a bundle that has its digest is left alone')
        unavailable = {'scoped_changes': {'status': 'unavailable', 'vs_previous_run': None}}
        self.assertIs(m.with_scoped_movement(unavailable), unavailable)
        empty = {}
        self.assertIs(m.with_scoped_movement(empty), empty)


@unittest.skipUnless(SEED.exists(), 'the public seed is not part of this package')
class MovementInTheCore(unittest.TestCase):
    def test_the_core_keeps_status_and_digest_and_the_history_annex_holds_the_rows(self):
        bundle = m.with_scoped_movement(json.loads(gzip.open(SEED).read()))
        self.assertIn('movement', bundle['scoped_changes'], 'the seed has a previous pull')
        core, heroes, parts = P.split(bundle)
        for key in ('status', 'source', 'movement'):
            self.assertEqual(core['scoped_changes'][key], bundle['scoped_changes'][key])
        for key in ('vs_previous_run', 'current'):
            self.assertNotIn(key, core['scoped_changes'])
            self.assertEqual(parts['history']['scoped_changes'][key], bundle['scoped_changes'][key])
        self.assertLess(len(P.dumps(core['scoped_changes'])), 4000, 'the digest is small enough for the first screen')
        rebuilt = P.merge(core, *[parts[n] for n in P.PARTS], *heroes.values())
        self.assertEqual(P.dumps(rebuilt), P.dumps(bundle))


if __name__ == '__main__':
    unittest.main()
