"""Review gate after the merge (Codex audit #239 F1, F2, F7; PRED-M12).

F1: the ranks live before the merge are recorded, and the live check afterwards requires Gold+ and each of them.
F2: a durable pending record, a revert built on the newest main, and confirmation that the revert is live; a run
that stops anywhere is finished by a later resume. F7: old nightly live-check successes expire.
"""
import datetime as dt
import json
import shutil
import subprocess
import tempfile
import unittest
import unittest.mock
from pathlib import Path

import review_gate as gate

UTC = dt.timezone.utc
T0 = dt.datetime(2026, 11, 27, 12, tzinfo=UTC)


def at(minutes):
    return (T0 + dt.timedelta(minutes=minutes)).isoformat()


class FakeOps:
    """Records every call. `verify_results` is consumed per verify call; `revert_result` may be an exception."""

    def __init__(self, merged=None, dispatch=True, verify_results=(), revert_result='revert222', now=T0):
        self.calls, self.records, self.closed = [], {}, []
        self.merged_info = merged
        self.dispatch = dispatch if isinstance(dispatch, list) else [dispatch]
        self.verify_results = list(verify_results)
        self.revert_result = revert_result
        self.clock = now
        self.next_issue = 50
        self.alarm_ok = True
        self.close_ok = True
        self.git_tiers = {'legion/carry': 'S'}   # what git says the merge changed
        self.revert_on_main = None                # what git says main holds

    def now(self):
        return self.clock

    def dispatch_publish(self):
        self.calls.append('dispatch')
        return self.dispatch.pop(0) if len(self.dispatch) > 1 else self.dispatch[0]

    def verify(self, sha, tiers, required):
        self.calls.append(('verify', sha, dict(tiers), None if required is None else list(required)))
        return self.verify_results.pop(0) if self.verify_results else ['still not live']

    def merged(self, pr):
        self.calls.append('merged?')
        return self.merged_info

    def tiers(self, merge):
        return dict(self.git_tiers)

    def find_revert(self, merge):
        return self.revert_on_main

    def revert(self, merge, pr):
        self.calls.append(('revert', merge))
        if isinstance(self.revert_result, Exception):
            raise self.revert_result
        self.revert_on_main = self.revert_result
        return self.revert_result

    def comment(self, pr, text):
        self.calls.append(('comment', text))

    def alarm(self, title, body):
        self.calls.append(('alarm', title))
        return self.alarm_ok

    def save(self, record):
        record['updated_at'] = self.clock.isoformat()
        if not record.get('issue'):
            record['issue'] = self.next_issue; self.next_issue += 1
        self.records[record['issue']] = json.loads(json.dumps(record))
        self.calls.append(('save', record['stage']))
        return record

    def close(self, record):
        self.save(record)
        self.calls.append(('close', self.close_ok))
        if self.close_ok:
            self.closed.append(record['issue'])
        return self.close_ok

    def open_records(self):
        return [json.loads(json.dumps(r)) for i, r in self.records.items() if i not in self.closed]

    def alarms(self):
        return [c[1] for c in self.calls if c[0] == 'alarm']


def record(stage='merging', **extra):
    base = gate.new_record(7, 'head999', {'expected_ranks': ['gold', 'silver'], 'expected_tiers': {'legion/carry': 'S'}},
                           'https://github.com/o/r/actions/runs/1', now=T0)
    base.update(stage=stage, **extra)
    return base


MERGED = {'sha': 'merge111', 'head': 'head999', 'at': at(1)}


class Settle(unittest.TestCase):
    def test_a_verified_merge_closes_the_record_without_a_revert(self):
        ops = FakeOps(merged=MERGED, verify_results=[[]])
        self.assertEqual(gate.settle(record(), ops), 'verified')
        self.assertIn(('verify', 'merge111', {'legion/carry': 'S'}, ['gold', 'silver']), ops.calls)
        self.assertNotIn(('revert', 'merge111'), ops.calls)
        self.assertEqual(ops.alarms(), []); self.assertEqual(ops.closed, [50])

    def test_a_failed_dispatch_still_verifies_then_reverts_and_confirms_the_revert(self):
        ops = FakeOps(merged=MERGED, dispatch=[False, True], verify_results=[['gold carries old'], []])
        self.assertEqual(gate.settle(record(), ops), 'revert-confirmed')
        verifies = [c for c in ops.calls if c[0] == 'verify']
        self.assertEqual(verifies[0][1], 'merge111')
        # The revert is confirmed on every rank that was live before the merge, without the merged grades.
        self.assertEqual(verifies[1], ('verify', 'revert222', {}, ['gold', 'silver']))
        self.assertIn('publish.yml could not be dispatched', ops.records[50]['problems'])
        self.assertEqual(ops.alarms(), ['Review gate reverted PR #7']); self.assertEqual(ops.closed, [50])

    def test_each_stage_is_saved_before_the_next_starts(self):
        ops = FakeOps(merged=MERGED, verify_results=[['x'], []])
        gate.settle(record(), ops)
        order = [c for c in ops.calls if c[0] in ('save', 'revert') or c == 'dispatch']
        self.assertLess(order.index(('save', 'merged')), order.index('dispatch'))
        self.assertLess(order.index(('save', 'reverting')), order.index(('revert', 'merge111')))
        self.assertLess(order.index(('save', 'reverted')), len(order) - 1)

    def test_a_revert_that_fails_alarms_once_and_stays_pending(self):
        ops = FakeOps(merged=MERGED, verify_results=[['not live']], revert_result=gate.RevertError('push rejected'))
        self.assertEqual(gate.settle(record(), ops), 'reverting')
        self.assertEqual(ops.alarms(), ['Review gate: merge merge111 NOT reverted (PR #7)'])
        self.assertEqual(ops.closed, [])
        again = ops.open_records()[0]
        gate.settle(again, ops)                                   # a resume tries again but does not alarm twice
        self.assertEqual(len(ops.alarms()), 1)

    def test_a_revert_that_does_not_show_live_stays_pending_for_the_resume(self):
        ops = FakeOps(merged=MERGED, verify_results=[['x'], ['silver carries merged']])
        self.assertEqual(gate.settle(record(), ops), 'reverted')
        self.assertEqual(ops.alarms(), ['Review gate: revert of merge111 not confirmed live (PR #7)'])
        self.assertEqual(ops.closed, [])
        ops.verify_results = [[]]
        self.assertEqual(gate.settle(ops.open_records()[0], ops), 'revert-confirmed')
        self.assertNotIn(('revert', 'merge111'), ops.calls[ops.calls.index(('save', 'reverted')) + 1:])   # no second revert

    def test_a_pr_the_gate_did_not_merge_is_closed_untouched(self):
        for merged in (None, dict(MERGED, head='other'), dict(MERGED, at=at(90)), dict(MERGED, sha=None)):
            ops = FakeOps(merged=merged)
            self.assertEqual(gate.settle(record(), ops), 'not-merged')
            self.assertFalse([c for c in ops.calls if c == 'dispatch' or c[0] in ('verify', 'revert')])


class CodexReviewOf243(unittest.TestCase):
    """Findings of Codex's review of PR #243 at 855a996."""

    def test_a_merge_commit_missing_from_the_checkout_fails_verification_instead_of_crashing(self):
        error = subprocess.CalledProcessError(128, ['git', 'ls-tree'])
        with unittest.mock.patch.object(gate, 'fingerprint', side_effect=error):
            problems = gate.verify_live('merge111', {}, ['gold'], minutes=1, state=lambda: {}, sleep=lambda s: None)
        self.assertEqual(len(problems), 1); self.assertIn('cannot read the packet of merge111', problems[0])

    def test_the_real_verify_fetches_main_before_fingerprinting(self):
        ops, order = gate.GateOps(), []
        with unittest.mock.patch.object(ops, 'fetch_main', side_effect=lambda: order.append('fetch')), \
                unittest.mock.patch.object(gate, 'verify_live', side_effect=lambda *a: order.append('verify') or []):
            ops.verify('merge111', {}, ['gold'])
        self.assertEqual(order, ['fetch', 'verify'])

    def test_an_alarm_github_did_not_create_is_sent_again_on_the_next_resume(self):
        ops = FakeOps(merged=MERGED, verify_results=[['not live']], revert_result=gate.RevertError('push rejected'))
        ops.alarm_ok = False
        gate.settle(record(), ops)
        self.assertEqual(ops.records[50]['alarmed'], [])
        ops.alarm_ok = True
        gate.settle(ops.open_records()[0], ops)
        self.assertEqual(len(ops.alarms()), 2); self.assertEqual(ops.records[50]['alarmed'], ['not-reverted'])

    def test_a_confirmed_revert_stays_open_until_its_notice_is_delivered(self):
        ops = FakeOps(merged=MERGED, verify_results=[['x'], []])
        ops.alarm_ok = False
        self.assertEqual(gate.settle(record(), ops), 'revert-confirmed')
        self.assertEqual(ops.closed, [])
        ops.alarm_ok = True
        ops.clock += dt.timedelta(hours=3)
        self.assertEqual(gate.resume(ops), {'7': 'revert-confirmed'})
        self.assertEqual(ops.closed, [50])
        self.assertNotIn(('revert', 'merge111'), ops.calls[-5:])   # finishing the notice does not redo the work

    def test_a_record_given_up_on_stays_open_until_the_owner_is_told(self):
        ops = FakeOps(merged=MERGED)
        ops.save(record('reverted', merge='merge111', revert='revert222', attempts=gate.RESUME_LIMIT))
        ops.alarm_ok = False
        ops.clock += dt.timedelta(hours=3)
        self.assertEqual(gate.resume(ops), {'7': 'abandoned'})
        self.assertEqual(ops.closed, [])
        ops.alarm_ok = True
        ops.clock += dt.timedelta(hours=3)
        self.assertEqual(gate.resume(ops), {'7': 'abandoned'})
        self.assertEqual(ops.open_records(), [])
        self.assertFalse([c for c in ops.calls if c[0] in ('verify', 'revert')])


class ForgedRecords(unittest.TestCase):
    """Codex security review of PR #243: someone with Triage access can open and label an issue, so a record is
    trusted only from the workflow's own account, and every stage must match what GitHub says about the PR."""

    def issues(self, *rows):
        return json.dumps([{'number': n, 'user': {'login': login}, 'created_at': created, 'body': gate.record_body(r)}
                           for n, login, created, r in rows])

    def test_only_issues_the_workflow_opened_are_records_and_their_time_comes_from_github(self):
        ops = gate.GateOps()
        body = self.issues((1, 'github-actions[bot]', at(0), record()), (2, 'someone', at(0), record()))
        done = subprocess.CompletedProcess([], 0, stdout=body, stderr='')
        with unittest.mock.patch.object(ops, 'gh', return_value=done):
            records = ops.open_records()
        self.assertEqual([r['issue'] for r in records], [1])
        self.assertEqual(records[0]['created_at'], at(0))

    def test_a_later_stage_github_does_not_back_is_refused_without_a_revert(self):
        cases = [None,                                   # the PR was never merged
                 dict(MERGED, head='other'),             # merged at another head
                 dict(MERGED, sha='elsewhere'),          # merged as another commit than the record claims
                 dict(MERGED, at=at(-60)),               # merged before the record existed
                 dict(MERGED, at=at(300))]               # merged long after it
        for merged in cases:
            for stage in ('merged', 'reverting', 'reverted'):
                ops = FakeOps(merged=merged, verify_results=[[]])
                self.assertEqual(gate.settle(record(stage, merge='merge111', revert='revert222'), ops), 'refused', (merged, stage))
                self.assertFalse([c for c in ops.calls if c == 'dispatch' or c[0] in ('verify', 'revert')], (merged, stage))
                self.assertEqual(ops.alarms(), ['Review gate: refused a pending record for PR #7'])
                self.assertEqual(ops.closed, [50])


class Resume(unittest.TestCase):
    def test_only_records_whose_run_has_certainly_stopped_are_resumed(self):
        ops = FakeOps(merged=MERGED, verify_results=[[]])
        ops.save(record()); ops.clock = T0 + dt.timedelta(minutes=gate.RESUME_AFTER_MINUTES - 1)
        self.assertEqual(gate.resume(ops), {})
        ops.clock = T0 + dt.timedelta(minutes=gate.RESUME_AFTER_MINUTES)
        self.assertEqual(gate.resume(ops), {'7': 'verified'})

    def test_a_run_stopped_after_the_merge_is_finished_by_the_resume(self):
        ops = FakeOps(merged=MERGED, verify_results=[['x'], []])
        ops.save(record('merged', merge='merge111'))
        ops.clock += dt.timedelta(hours=3)
        self.assertEqual(gate.resume(ops), {'7': 'revert-confirmed'})

    def test_after_the_limit_the_owner_gets_it_and_the_record_closes(self):
        ops = FakeOps(merged=MERGED)
        ops.save(record('reverted', merge='merge111', revert='revert222', attempts=gate.RESUME_LIMIT))
        ops.clock += dt.timedelta(hours=3)
        self.assertEqual(gate.resume(ops), {'7': 'abandoned'})
        self.assertEqual(ops.alarms(), ['Review gate: gave up on PR #7 at stage reverted'])
        self.assertEqual(ops.open_records(), [])

    def test_the_record_survives_the_issue_body_round_trip(self):
        r = record('reverting', merge='merge111', issue=12)
        self.assertEqual(gate.parse_record(gate.record_body(r)), r)
        self.assertIsNone(gate.parse_record('an ordinary issue'))
        self.assertIsNone(gate.parse_record(gate.PENDING_MARK + '\n```json\n{"pr": "7"}\n```'))


class FinishedButOpen(unittest.TestCase):
    """Codex review of PR #243 at 965b8f6: a record whose close failed after it finished is only closed again."""

    def test_a_verified_record_whose_close_failed_is_closed_later_and_never_abandoned(self):
        for stage, merged in (('verified', MERGED), ('not-merged', None)):
            ops = FakeOps(merged=merged, verify_results=[[]])
            ops.close_ok = False
            self.assertEqual(gate.settle(record(), ops), stage)
            self.assertEqual(ops.closed, [])
            for n in range(gate.RESUME_LIMIT + 3):
                ops.clock += dt.timedelta(hours=3)
                self.assertEqual(gate.resume(ops), {'7': stage}, (stage, n))
            self.assertEqual(ops.alarms(), [])
            self.assertEqual(ops.records[50]['attempts'], 0)
            work = [c for c in ops.calls if c == 'dispatch' or c[0] in ('verify', 'revert')]
            self.assertEqual(len(work), 2 if stage == 'verified' else 0)   # the first run's dispatch and verify only
            ops.close_ok = True
            ops.clock += dt.timedelta(hours=3)
            self.assertEqual(gate.resume(ops), {'7': stage})
            self.assertEqual(ops.open_records(), [])

    def test_the_real_close_reports_a_failed_patch(self):
        ops = gate.GateOps()
        failed = subprocess.CompletedProcess([], 1, stdout='', stderr='boom')
        with unittest.mock.patch.object(ops, 'save'), unittest.mock.patch.object(ops, 'gh', return_value=failed), \
                unittest.mock.patch.object(gate.time, 'sleep'):
            self.assertFalse(ops.close({'issue': 5}))


class EditedRecordBody(unittest.TestCase):
    """Codex security review of PR #243 at 965b8f6: anyone with Write access can edit the record's body, so the body
    never decides a revert alone. The merge comes from GitHub, the grades from git, the revert from git, and a revert
    follows only a live check this run made."""

    def test_an_edited_reverting_stage_rechecks_live_and_does_not_revert_a_good_merge(self):
        ops = FakeOps(merged=MERGED, verify_results=[[]])
        forged = record('reverting', merge='merge111', expected_tiers={'kira/carry': 'D'}, expected_ranks=['gold', 'nonsense'])
        self.assertEqual(gate.settle(forged, ops), 'verified')
        self.assertIn(('verify', 'merge111', {'legion/carry': 'S'}, ['gold']), ops.calls)
        self.assertFalse([c for c in ops.calls if c[0] == 'revert'])

    def test_an_edited_reverting_stage_reverts_only_when_the_live_check_fails(self):
        ops = FakeOps(merged=MERGED, verify_results=[['gold carries old'], []])
        self.assertEqual(gate.settle(record('reverting', merge='merge111'), ops), 'revert-confirmed')
        calls = [c for c in ops.calls if c[0] in ('verify', 'revert')]
        self.assertEqual([c[0] for c in calls], ['verify', 'revert', 'verify'])

    def test_an_edited_revert_commit_is_ignored_for_the_one_git_shows(self):
        ops = FakeOps(merged=MERGED, verify_results=[[]])
        ops.revert_on_main = 'gitrevert'
        self.assertEqual(gate.settle(record('reverted', merge='merge111', revert='forged'), ops), 'revert-confirmed')
        self.assertIn(('verify', 'gitrevert', {}, ['gold', 'silver']), ops.calls)
        self.assertFalse([c for c in ops.calls if c[0] == 'revert'])

    def test_a_reverted_stage_with_no_revert_on_main_checks_the_merge_first(self):
        ops = FakeOps(merged=MERGED, verify_results=[[]])
        self.assertEqual(gate.settle(record('reverted', merge='merge111', revert='forged'), ops), 'verified')
        self.assertFalse([c for c in ops.calls if c[0] == 'revert'])

    def test_a_revert_already_on_main_is_confirmed_not_repeated(self):
        ops = FakeOps(merged=MERGED, verify_results=[[]])
        ops.revert_on_main = 'revert222'
        self.assertEqual(gate.settle(record('reverting', merge='merge111'), ops), 'revert-confirmed')
        self.assertFalse([c for c in ops.calls if c[0] == 'revert'])

    def test_merged_tiers_reads_the_grades_from_git(self):
        packets = {'m^1': {'grades': [{'hero': 'legion', 'role': 'carry', 'tier': 'A'}]},
                   'm': {'grades': [{'hero': 'legion', 'role': 'carry', 'tier': 'S'}, {'hero': 'kira', 'role': 'mid', 'tier': 'B'}]}}
        with unittest.mock.patch.object(gate, 'show_json', side_effect=lambda sha, path: packets[sha]), \
                unittest.mock.patch.object(gate, 'entries', side_effect=lambda packet, key: {(g['hero'], g['role']): g for g in packet[key]}):
            self.assertEqual(gate.merged_tiers('m'), {'legion/carry': 'S', 'kira/mid': 'B'})

    def test_ranks_are_kept_to_known_names(self):
        self.assertEqual(gate.trusted_ranks(['gold', 'x', 'silver']), ['gold', 'silver'])
        self.assertIsNone(gate.trusted_ranks('gold'))


@unittest.skipUnless(shutil.which('git'), 'needs git')
class RevertOnNewestMain(unittest.TestCase):
    """revert_on_main against a real repository whose main moves on while the revert is built."""

    def git(self, cwd, *args):
        return subprocess.run(['git', *args], cwd=cwd, capture_output=True, text=True, check=True).stdout.strip()

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.remote = self.tmp / 'remote.git'
        subprocess.run(['git', 'init', '-q', '--bare', '-b', 'main', str(self.remote)], check=True)
        self.work = self.tmp / 'work'
        subprocess.run(['git', 'clone', '-q', str(self.remote), str(self.work)], check=True, capture_output=True)
        for k, v in (('user.name', 't'), ('user.email', 't@example.test'), ('commit.gpgsign', 'false')):
            self.git(self.work, 'config', k, v)
        self.git(self.work, 'checkout', '-q', '-b', 'main')
        (self.work / 'a.txt').write_text('base\n'); self.git(self.work, 'add', '.'); self.git(self.work, 'commit', '-qm', 'base')
        self.git(self.work, 'checkout', '-q', '-b', 'review')
        (self.work / 'review.json').write_text('{"tier": "S"}\n'); self.git(self.work, 'add', '.'); self.git(self.work, 'commit', '-qm', 'review')
        self.git(self.work, 'checkout', '-q', 'main')
        self.git(self.work, 'merge', '-q', '--no-ff', '-m', 'Merge review', 'review')
        self.merge = self.git(self.work, 'rev-parse', 'HEAD')
        self.git(self.work, 'push', '-q', 'origin', 'main')
        self.other = self.tmp / 'other'
        subprocess.run(['git', 'clone', '-q', str(self.remote), str(self.other)], check=True, capture_output=True)
        for k, v in (('user.name', 'o'), ('user.email', 'o@example.test'), ('commit.gpgsign', 'false')):
            self.git(self.other, 'config', k, v)

    def runner(self):
        return lambda *a: subprocess.run(['git', *a], cwd=self.work, capture_output=True, text=True)

    def advance_main(self, name):
        (self.other / name).write_text('later\n'); self.git(self.other, 'add', '.'); self.git(self.other, 'commit', '-qm', name)
        self.git(self.other, 'pull', '-q', '--rebase', 'origin', 'main'); self.git(self.other, 'push', '-q', 'origin', 'HEAD:main')

    def test_main_advancing_during_the_revert_is_retried_on_the_new_tip(self):
        moved = []

        def before_push(attempt):
            if attempt == 0:                      # another commit lands on main after this attempt fetched it
                self.advance_main('later.txt'); moved.append(1)

        revert = gate.revert_on_main(self.merge, 7, str(self.remote), git_run=self.runner(), sleep=lambda s: None, before_push=before_push)
        self.assertEqual(moved, [1])
        tip = self.git(self.remote, 'rev-parse', 'main')
        self.assertEqual(revert, tip)
        files = self.git(self.remote, 'ls-tree', '--name-only', 'main').split()
        self.assertIn('later.txt', files)         # the other commit is kept
        self.assertNotIn('review.json', files)    # and the merge is undone

    def test_a_revert_already_on_main_is_reused_not_repeated(self):
        first = gate.revert_on_main(self.merge, 7, str(self.remote), git_run=self.runner(), sleep=lambda s: None)
        again = gate.revert_on_main(self.merge, 7, str(self.remote), git_run=self.runner(), sleep=lambda s: None)
        self.assertEqual(first, again)
        self.assertEqual(self.git(self.remote, 'rev-parse', 'main'), first)

    def test_a_push_that_keeps_failing_raises(self):
        with self.assertRaises(gate.RevertError):
            gate.revert_on_main(self.merge, 7, str(self.tmp / 'missing.git'), git_run=self.runner(), sleep=lambda s: None)


class ExpectedRanks(unittest.TestCase):
    def state(self, **fps):
        return {r: ({'problem': fp} if fp.startswith('bad') else {'fingerprint': fp, 'tiers': {}}) for r, fp in fps.items()}

    def test_the_pre_merge_live_set_is_what_a_merge_must_keep(self):
        self.assertEqual(gate.available_ranks(self.state(gold='old', silver='old', bronze='bad digest')), ['gold', 'silver'])

    def test_a_previously_live_rank_that_is_missing_or_stale_fails(self):
        self.assertEqual(gate.verified(self.state(gold='fp'), 'fp', {}, ['gold', 'silver']),
                         ['silver was live before the merge and is missing now'])
        self.assertEqual(gate.verified(self.state(gold='fp', silver='old'), 'fp', {}, ['gold', 'silver']), ['silver carries old, not fp'])

    def test_gold_is_required_even_when_nothing_was_live_before(self):
        self.assertEqual(gate.verified({}, 'fp', {}, []), ['gold was live before the merge and is missing now'])

    def test_a_rank_unavailable_before_the_merge_may_stay_unavailable(self):
        self.assertEqual(gate.verified(self.state(gold='fp', paragon='bad no bundle'), 'fp', {}, ['gold']), [])

    def test_an_empty_live_manifest_never_verifies(self):
        self.assertTrue(gate.verified({}, 'fp', {}, ['gold', 'silver']))
        self.assertTrue(gate.verified({}, 'fp', {}))


class VerifyLiveRetries(unittest.TestCase):
    def test_a_transient_non_json_answer_is_retried_within_the_window(self):
        answers = [json.JSONDecodeError('Expecting value', '<html>', 0), {'gold': {'fingerprint': 'fp', 'tiers': {}}}]

        def state():
            answer = answers.pop(0)
            if isinstance(answer, Exception):
                raise answer
            return answer

        clock = iter(range(0, 10000, 60))
        with unittest.mock.patch.object(gate, 'fingerprint', return_value='fp'):
            self.assertEqual(gate.verify_live('deadbeef', {}, ['gold'], minutes=5, state=state, sleep=lambda s: None,
                                              clock=lambda: next(clock)), [])
        self.assertEqual(answers, [])


class SwitchFromCurrentMain(unittest.TestCase):
    """Audit #239 F7: the auto-merge switch is read from main as it is now, not from the PR event's base."""

    def test_the_newest_main_is_used_after_a_fetch(self):
        calls = []

        def git(*args, binary=False):
            calls.append(args[0])
            return 'c' * 40 + '\n' if args[0] == 'rev-parse' else ''
        with unittest.mock.patch.object(gate, 'git', side_effect=git):
            self.assertEqual(gate.current_main('a' * 40), 'c' * 40)
        self.assertEqual(calls, ['fetch', 'rev-parse'])

    def test_an_unreadable_main_falls_back_to_the_event_base(self):
        with unittest.mock.patch.object(gate, 'git', side_effect=subprocess.CalledProcessError(128, ['git'])):
            self.assertEqual(gate.current_main('a' * 40), 'a' * 40)

    def test_decide_reads_the_switch_from_current_main(self):
        text = Path(gate.__file__).read_text(encoding='utf-8')
        self.assertIn("show_json(current_main(args.base), 'free_hosting.json')", text)
        self.assertNotIn("show_json(args.base, 'free_hosting.json')", text)


class NightlyAge(unittest.TestCase):
    def runs(self, *hours):
        return [{'conclusion': 'success', 'createdAt': (T0 - dt.timedelta(hours=h)).isoformat().replace('+00:00', 'Z')} for h in hours]

    def test_two_recent_successes_pass(self):
        self.assertEqual(gate.nightly_conclusions(T0, self.runs(17, 41)), ['success', 'success'])

    def test_one_dropped_scheduled_run_is_tolerated(self):
        self.assertEqual(gate.nightly_conclusions(T0, self.runs(41, 65)), ['success', 'success'])

    def test_old_successes_expire(self):
        self.assertEqual(gate.nightly_conclusions(T0, self.runs(80, 104)), ['expired', 'expired'])
        self.assertEqual(gate.nightly_conclusions(T0, self.runs(20, 80)), ['success', 'expired'])

    def test_a_run_with_no_or_a_future_start_time_is_expired(self):
        self.assertEqual(gate.nightly_conclusions(T0, [{'conclusion': 'success'}, {'conclusion': 'success', 'createdAt': at(60)}]),
                         ['expired', 'expired'])

    def test_expired_runs_make_auto_merge_wait(self):
        self.assertNotEqual(list(gate.nightly_conclusions(T0, self.runs(80, 104))[:2]), ['success', 'success'])


if __name__ == '__main__':
    unittest.main()
