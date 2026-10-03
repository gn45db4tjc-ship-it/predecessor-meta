"""Freshness Phase 4 (2.47.0): the review auto-merge gate (review_gate.py).

A review PR merges itself only when it touches review files alone, every changed entry has a complete ledger record,
no grade moves more than one step, nothing unresolved supports a newly endorsed choice and the pass is logged; it is
held for the owner for a first grade, a removal, a policy exception, a validator or policy change or more than 10
grade changes; and auto-merge waits for its switch and two passing nightly checks. Probe first: on main 55d11e4 no
gate exists, so nothing could merge a review PR safely, and nothing would stop an unsafe one."""
import copy
import json
import unittest
from pathlib import Path

import review_gate as gate

ROOT = Path(__file__).resolve().parents[1]
BASE = json.loads((ROOT / 'reviewed_guidance.json').read_text(encoding='utf-8'))
LEDGER = 'docs/rechecks/2026-10-03-ledger.json'
SOURCE = {'url': 'https://pred.gg/heroes?versions=168&role=JUNGLE', 'fetched_at': '2026-10-03T13:20:00-05:00'}


def grade(packet, slug, role):
    return next(e for e in packet['guidance']['meta_review']['entries'] if e['slug'] == slug and e['role'] == role)


def record(slug, role, old, new, verdict='changed', **extra):
    return dict({'kind': 'grade', 'slug': slug, 'role': role, 'verdict': verdict, 'old_tier': old, 'tier': new,
                 'reason': 'Kit reason and evidence agree.', 'limitation': 'Five days of data.', 'reviewed_at': '2026-10-03T20:00:00+00:00',
                 'sources': [SOURCE]}, **extra)


def logged(head, items=('grade-moved:adele/offlane',)):
    head['guidance'].setdefault('recheck_log', []).append({'kind': 'triggered', 'reviewed_at': '2026-10-03T20:00:00+00:00',
                                                          'items': list(items), 'scope': 'Withheld grades.', 'ledger': LEDGER})
    return head


class Fixture(unittest.TestCase):
    def setUp(self):
        self.base = copy.deepcopy(BASE)
        self.head = copy.deepcopy(BASE)
        self.target = self.head['guidance']['meta_review']['entries'][0]
        self.slug, self.role, self.old = self.target['slug'], self.target['role'], self.target['tier']
        self.new = {'S': 'A', 'A': 'B', 'B': 'C', 'C': 'B'}[self.old]

    def move(self, to=None):
        self.target['tier'] = to or self.new
        self.target['rechecked_at'] = '2026-10-03T20:00:00+00:00'
        self.target['previous_tier'] = self.old
        return logged(self.head, ['grade-moved:%s/%s' % (self.slug, self.role)])

    def decide(self, ledger_rows=None, files=None, **kw):
        ledgers = {LEDGER: {'entries': ledger_rows if ledger_rows is not None else [record(self.slug, self.role, self.old, self.target['tier'])]}}
        kw.setdefault('auto_merge', True); kw.setdefault('nightly', ['success', 'success'])
        return gate.evaluate(self.base, self.head, files or ['reviewed_guidance.json', LEDGER, 'docs/rechecks/2026-10-03.md'], ledgers, **kw)


class Merge(Fixture):
    def test_a_one_step_move_with_a_complete_ledger_merges(self):
        self.move()
        result = self.decide()
        self.assertEqual(result['decision'], 'merge', result)
        self.assertEqual(result['grades_moved'], 1)
        self.assertEqual(result['expected_tiers'], {'%s/%s' % (self.slug, self.role): self.new})

    def test_a_retained_recheck_merges(self):
        self.target['rechecked_at'] = '2026-10-03T20:00:00+00:00'
        logged(self.head)
        self.assertEqual(self.decide([record(self.slug, self.role, self.old, self.old, 'checked and retained')])['decision'], 'merge')


class Fail(Fixture):
    def test_two_steps(self):
        far = {'S': 'B', 'A': 'C', 'B': 'S', 'C': 'A'}[self.old]
        self.move(far)
        result = self.decide()
        self.assertEqual(result['decision'], 'fail'); self.assertIn('more than one step', ' '.join(result['failures']))

    def test_missing_or_incomplete_ledger(self):
        self.move()
        self.assertIn('No ledger record', ' '.join(self.decide([])['failures']))
        bare = record(self.slug, self.role, self.old, self.new, sources=[], limitation='')
        failures = ' '.join(self.decide([bare])['failures'])
        self.assertIn('dated https sources', failures); self.assertIn('uncertainties', failures)
        wrong = record(self.slug, self.role, self.old, self.old)
        self.assertIn('does not record the move', ' '.join(self.decide([wrong])['failures']))

    def test_unresolved_cannot_support_a_raise_or_a_new_plan(self):
        up = {'S': None, 'A': 'S', 'B': 'A', 'C': 'B'}[self.old]
        if up:
            self.move(up)
            result = self.decide([record(self.slug, self.role, self.old, up, 'unresolved')])
            self.assertIn('unresolved review supports raising', ' '.join(result['failures']))
        self.setUp()
        plan = self.head['guidance']['builds'][0]
        plan['core'] = list(reversed(plan['core']))
        (plan.get('patch_review') or plan.setdefault('maintenance_review', {}))['result'] = 'unresolved'
        logged(self.head)
        rows = [dict(record(plan['slug'], plan['role'], None, None), kind='plan')]
        self.assertIn('newly endorsed choice', ' '.join(self.decide(rows)['failures']))

    def test_code_or_unlogged_passes_fail(self):
        self.move()
        self.assertIn('outside guidance and review files', ' '.join(self.decide(files=['reviewed_guidance.json', LEDGER, 'engine.js'])['failures']))
        self.setUp(); self.target['tier'] = self.new
        self.assertIn('not logged', ' '.join(self.decide()['failures']))
        self.setUp(); self.move()
        self.head['guidance']['recheck_log'][-1]['ledger'] = 'docs/rechecks/elsewhere.json'
        self.assertIn('does not add or change', ' '.join(self.decide()['failures']))

    def test_manifest_may_change_only_review_file_hashes(self):
        self.move()
        manifest = json.loads((ROOT / 'SOURCE-MANIFEST.json').read_text(encoding='utf-8'))
        ok = copy.deepcopy(manifest); ok['files']['reviewed_guidance.json'] = '0' * 64; ok['files'][LEDGER] = '1' * 64
        files = ['reviewed_guidance.json', LEDGER, 'SOURCE-MANIFEST.json']
        self.assertEqual(self.decide(files=files, manifests=(manifest, ok))['decision'], 'merge')
        bad = copy.deepcopy(ok); bad['files']['engine.js'] = '2' * 64; bad['version'] = '9.9.9'
        failures = ' '.join(self.decide(files=files, manifests=(manifest, bad))['failures'])
        self.assertIn('engine.js', failures); self.assertIn('"version"', failures)

    def test_supplement_mechanics_need_their_own_ledger_record(self):
        supplement = json.loads((ROOT / 'patch-1.17.json').read_text(encoding='utf-8'))
        changed = copy.deepcopy(supplement)
        changed['corrections'][0]['after'] = 'Rechecked text.'
        key = str(changed['corrections'][0]['id'])
        logged(self.head)
        files = ['patch-1.17.json', LEDGER]
        result = self.decide([], files=files, supplements=(supplement, changed))
        self.assertIn('supplement corrections', ' '.join(result['failures']))
        row = dict(record(None, None, None, None), kind='mechanics', section='corrections', key=key)
        self.assertEqual(self.decide([row], files=files, supplements=(supplement, changed))['decision'], 'merge')


class Hold(Fixture):
    def test_first_grade_removal_policy_and_validator(self):
        new = copy.deepcopy(self.target); new['role'] = 'experimental-role'
        self.head['guidance']['meta_review']['entries'].append(new); logged(self.head)
        result = self.decide([record(new['slug'], new['role'], None, new['tier'])])
        self.assertEqual(result['decision'], 'hold'); self.assertIn('first grade', ' '.join(result['holds']))
        self.setUp(); self.head['guidance']['meta_review']['entries'].pop(0); logged(self.head)
        self.assertIn('would be removed', ' '.join(self.decide([])['holds']))
        self.setUp(); self.move()
        result = self.decide([record(self.slug, self.role, self.old, self.new, policy_exception='The drop rule without a kit reason')])
        self.assertEqual(result['decision'], 'hold'); self.assertIn('policy exception', ' '.join(result['holds']))
        for path, word in (('predecessor_meta.py', 'validator'), ('STRATEGY-REVIEW-POLICY.md', 'policy')):
            result = self.decide(files=['reviewed_guidance.json', LEDGER, path])
            self.assertEqual(result['decision'], 'hold'); self.assertIn(word, ' '.join(result['holds']))

    def test_more_than_ten_grade_changes(self):
        rows = []
        for entry in self.head['guidance']['meta_review']['entries'][:11]:
            old = entry['tier']; entry['tier'] = {'S': 'A', 'A': 'B', 'B': 'C', 'C': 'B'}[old]
            rows.append(record(entry['slug'], entry['role'], old, entry['tier']))
        logged(self.head)
        result = self.decide(rows)
        self.assertEqual(result['decision'], 'hold'); self.assertIn('11 grades', ' '.join(result['holds']))


class Wait(Fixture):
    def test_switch_and_nightly_prerequisite(self):
        self.move()
        self.assertEqual(self.decide(auto_merge=False)['decision'], 'wait')
        result = self.decide(nightly=['success', 'failure'])
        self.assertEqual(result['decision'], 'wait'); self.assertIn('nightly', ' '.join(result['holds']))
        self.assertEqual(self.decide(nightly=['success'])['decision'], 'wait')


class LiveVerification(unittest.TestCase):
    def test_every_rank_must_carry_the_merged_packet_and_its_grades(self):
        ranks = {r: {'fingerprint': 'abc', 'tiers': {'adele/offlane': 'B'}} for r in ('gold', 'silver')}
        self.assertEqual(gate.verified(ranks, 'abc', {'adele/offlane': 'B'}), [])
        ranks['silver']['fingerprint'] = 'old'
        self.assertIn('silver', ' '.join(gate.verified(ranks, 'abc', {})))
        self.assertIn('adele/offlane', ' '.join(gate.verified({'gold': {'fingerprint': 'abc', 'tiers': {'adele/offlane': 'C'}}}, 'abc', {'adele/offlane': 'B'})))



class WorkflowContract(unittest.TestCase):
    def test_scope_first_then_checks_then_a_scoped_decision(self):
        text = (ROOT / '.github' / 'workflows' / 'review-gate.yml').read_text(encoding='utf-8')
        jobs = text.split('\njobs:\n', 1)[1]
        scope, rest = jobs.split('\n  checks:\n', 1)
        checks, decide = rest.split('\n  decide:\n', 1)
        self.assertIn('pull_request_target:', text)                     # the base branch's definition decides
        self.assertIn("contains(github.event.pull_request.labels.*.name, 'automated-review')", scope)
        self.assertIn('github.event.pull_request.user.login == github.repository_owner', scope)
        self.assertIn('ref: ${{ github.event.pull_request.base.sha }}', scope)
        self.assertNotIn('ref: ${{ github.event.pull_request.head.sha }}', scope)   # no PR code is checked out before scope
        self.assertIn('needs: scope', checks); self.assertIn('needs: checks', decide)
        self.assertNotIn('write', scope + checks)                          # read-only until the decision
        self.assertIn('validate-live', checks); self.assertIn('browser_static.cjs', checks); self.assertIn('browser_design.cjs', checks)
        self.assertIn('select(.name == "verify")', decide)                # CI must be green
        self.assertIn('--match-head-commit "$HEAD"', decide)
        self.assertIn('gh workflow run publish.yml --ref main', decide)
        self.assertIn('verify-live --merge "$merge"', decide)
        self.assertIn('git revert -m 1 --no-edit "$merge"', decide)
        for use in [l.split('uses:')[1].strip() for l in text.splitlines() if 'uses:' in l]:
            self.assertRegex(use, r'@[0-9a-f]{40}', use)


if __name__ == '__main__':
    unittest.main()
