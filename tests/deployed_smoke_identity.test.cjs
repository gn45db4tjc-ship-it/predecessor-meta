'use strict';
// Audit #239 F17 (PRED-M12): the deployed smoke's browser step checks the expected publication itself and reports a
// superseded deployment instead of attributing the result to the triggering run.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { evaluatePublicationIdentity, applyPublicationIdentity, buildSmokeReport } = require('./browser_deployed_smoke.cjs');

const EXPECTED = { expectedRunId: '9001', expectedPublishedAt: '2026-11-27T08:23:10+00:00' };
const SAME = { run_id: 9001, published_at: '2026-11-27T08:23:10+00:00', app: { version: '2.59.0' } };
const LATER = { run_id: 9002, published_at: '2026-11-27T09:23:05+00:00', app: { version: '2.59.0' } };

function passingReport() {
  const { REQUIRED_CHECK_IDS: ids } = require('./browser_deployed_smoke.cjs');
  return buildSmokeReport({ siteUrl: 'https://example.test/', checks: ids.map(id => ({ id, status: 'pass', passed: true, reason: 'ok' })),
    version: {}, headSha: 'abc', deployFinishedAt: '2026-11-27T08:24:00Z' });
}

test('the expected publication served before and after the browser run verifies', () => {
  const result = evaluatePublicationIdentity({ ...EXPECTED, before: SAME, after: SAME });
  assert.equal(result.superseded, false);
  assert.deepEqual(result.expected, { run_id: '9001', published_at: '2026-11-27T08:23:10+00:00' });
});

test('a later publication with the same app version is reported as superseded, not verified', () => {
  for (const [before, after] of [[LATER, LATER], [SAME, LATER], [LATER, SAME]]) {
    const result = evaluatePublicationIdentity({ ...EXPECTED, before, after });
    assert.equal(result.superseded, true);
    assert.match(result.reason, /^Superseded deployment: expected run 9001/);
    assert.match(result.reason, /run 9002/);
  }
});

test('an unreadable manifest is not the expected publication', () => {
  assert.equal(evaluatePublicationIdentity({ ...EXPECTED, before: null, after: SAME }).superseded, true);
});

test('half an expected identity is refused', () => {
  assert.equal(evaluatePublicationIdentity({ expectedRunId: '9001', before: SAME, after: SAME }).superseded, true);
});

test('a manual run with no expected publication records what was served and keeps its result', () => {
  const result = evaluatePublicationIdentity({ before: LATER, after: LATER });
  assert.equal(result.superseded, false);
  assert.equal(result.served.after.run_id, '9002');
  const report = applyPublicationIdentity(passingReport(), result);
  assert.equal(report.status, 'pass');
  assert.equal(report.passed, true);
});

test('a superseded publication turns a passing report into status "superseded" that does not pass', () => {
  const report = applyPublicationIdentity(passingReport(), evaluatePublicationIdentity({ ...EXPECTED, before: LATER, after: LATER }));
  assert.equal(report.status, 'superseded');
  assert.equal(report.passed, false);
  assert.match(report.reason, /does not verify the triggering deployment/);
  assert.equal(report.deployment.head_sha, 'abc');
});

test('a stale manifest served to the browser is superseded even when the probes see the expected one', () => {
  // Codex review of PR #243: both probes come from Node; the page's own manifest must be checked too.
  const result = evaluatePublicationIdentity({ ...EXPECTED, before: SAME, after: SAME, browser: [{ run_id: 9000, published_at: '2026-11-27T07:23:01+00:00' }] });
  assert.equal(result.superseded, true);
  assert.match(result.reason, /in the browser check the site served run 9000/);
});

test('the browser seeing the expected manifest verifies; seeing none does not', () => {
  assert.equal(evaluatePublicationIdentity({ ...EXPECTED, before: SAME, after: SAME, browser: [SAME, SAME] }).superseded, false);
  const none = evaluatePublicationIdentity({ ...EXPECTED, before: SAME, after: SAME, browser: [] });
  assert.equal(none.superseded, true);
  assert.match(none.reason, /page loaded no manifest\.json/);
});

test('the workflow gives the browser step the expected publication', () => {
  const yml = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'deployed-smoke.yml'), 'utf8');
  const browserStep = yml.slice(yml.indexOf('- name: Check the deployed site in a browser'), yml.indexOf('- name: Keep the deployed smoke report'));
  assert.match(browserStep, /EXPECTED_RUN_ID: \$\{\{ needs\.gate\.outputs\.expected_run_id \}\}/);
  assert.match(browserStep, /EXPECTED_PUBLISHED_AT: \$\{\{ needs\.gate\.outputs\.expected_published_at \}\}/);
});
