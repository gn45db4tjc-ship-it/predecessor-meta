'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  DEFAULT_SITE_URL,
  DEPLOY_JOB_NAME,
  DEPLOY_STEP_NAME,
  readRepoVersion,
  expectedShellCacheName,
  parseShellCacheFromSwSource,
  extractManifestVersion,
  resolveSiteUrl,
  classifySameOriginAsset,
  evaluateNetworkCheck,
  evaluateConsoleAndPageErrorCheck,
  evaluateBootAndDataCheck,
  evaluateVersionAgreementCheck,
  evaluateMobileLayoutCheck,
  buildSmokeReport,
  evaluateDeployGate,
  isManifestVersionReady,
  waitForDeployedManifest
} = require('./browser_deployed_smoke.cjs');

const ROOT = path.resolve(__dirname, '..');

test('resolveSiteUrl allows only the public Pages URL or a local preview', () => {
  assert.equal(resolveSiteUrl(), DEFAULT_SITE_URL);
  assert.equal(resolveSiteUrl(''), DEFAULT_SITE_URL);
  assert.equal(
    resolveSiteUrl('https://gn45db4tjc-ship-it.github.io/predecessor-meta'),
    DEFAULT_SITE_URL
  );
  assert.equal(
    resolveSiteUrl('https://gn45db4tjc-ship-it.github.io/predecessor-meta/nope/'),
    'https://gn45db4tjc-ship-it.github.io/predecessor-meta/nope/'
  );
  assert.equal(
    resolveSiteUrl('http://127.0.0.1:13049'),
    'http://127.0.0.1:13049/'
  );
  assert.equal(
    resolveSiteUrl('http://localhost:8080/preview/'),
    'http://localhost:8080/preview/'
  );
  assert.throws(
    () => resolveSiteUrl('https://example.com/predecessor-meta/'),
    /Refusing to point deployed smoke suite/
  );
  assert.throws(
    () => resolveSiteUrl('https://gn45db4tjc-ship-it.github.io/other-repo/'),
    /Refusing to point deployed smoke suite/
  );
});

test('version and service worker shell cache helpers match repo release contract', () => {
  const repoVersion = readRepoVersion(ROOT);
  assert.match(repoVersion, /^\d+\.\d+\.\d+$/);
  assert.equal(expectedShellCacheName('2.59.0'), 'predecessor-meta-shell-v2-59-0');

  const swText = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  assert.equal(parseShellCacheFromSwSource(swText), expectedShellCacheName(repoVersion));
  assert.equal(extractManifestVersion({ app: { version: '2.59.0' } }), '2.59.0');
  assert.equal(extractManifestVersion({ version: '2.58.1' }), '2.58.1');
  assert.equal(extractManifestVersion({}), null);
});

test('evaluateVersionAgreementCheck verifies page, manifest, and service worker cache agreement', () => {
  const passCheck = evaluateVersionAgreementCheck({
    pageVersion: '2.59.0',
    metaTagVersion: '2.59.0',
    sidebarVersion: '2.59.0',
    appStateVersion: '2.59.0',
    manifestVersion: '2.59.0',
    cacheKeys: ['predecessor-meta-data-v1', 'predecessor-meta-shell-v2-59-0'],
    swSourceCacheName: 'predecessor-meta-shell-v2-59-0'
  });
  assert.equal(passCheck.status, 'pass');
  assert.equal(passCheck.passed, true);
  assert.match(passCheck.reason, /matches deployed manifest version 2\.59\.0/);

  const mismatchCheck = evaluateVersionAgreementCheck({
    pageVersion: '2.58.0',
    metaTagVersion: '2.58.0',
    sidebarVersion: '2.58.0',
    appStateVersion: '2.58.0',
    manifestVersion: '2.59.0',
    cacheKeys: ['predecessor-meta-shell-v2-58-0'],
    swSourceCacheName: 'predecessor-meta-shell-v2-58-0'
  });
  assert.equal(mismatchCheck.status, 'fail');
  assert.equal(mismatchCheck.passed, false);
  assert.match(mismatchCheck.reason, /2\.58\.0.*2\.59\.0/);
  assert.match(mismatchCheck.reason, /predecessor-meta-shell-v2-59-0/);
});

test('evaluateDeployGate handles deploy step success (real run 42737247875), skipped deploy step, and missing deploy job', () => {
  assert.equal(DEPLOY_JOB_NAME, 'deploy');
  assert.equal(DEPLOY_STEP_NAME, 'Publish available-source updates and visible failure status');

  // Case 1: Built from real publication run 42737247875, where the run and deploy job concluded "failure"
  // because "Report source failures after preserving the working site" exited 1 after deploying to Pages.
  const realRun42737247875 = {
    total_count: 3,
    jobs: [
      {
        id: 129569375522,
        run_id: 42737247875,
        workflow_name: 'Daily data and patch-aware publication',
        head_branch: 'main',
        head_sha: 'fda1ae265c720fcd26e5e136bbdbcb78776eb408',
        status: 'completed',
        conclusion: 'success',
        started_at: '2026-11-10T01:38:50Z',
        completed_at: '2026-11-10T01:42:12Z',
        name: 'build',
        steps: [
          {
            name: 'Collect only when due; render public bundles separately',
            status: 'completed',
            conclusion: 'success',
            number: 9,
            started_at: '2026-11-10T01:41:25Z',
            completed_at: '2026-11-10T01:42:04Z'
          }
        ]
      },
      {
        id: 129570702410,
        run_id: 42737247875,
        workflow_name: 'Daily data and patch-aware publication',
        head_branch: 'main',
        head_sha: 'fda1ae265c720fcd26e5e136bbdbcb78776eb408',
        status: 'completed',
        conclusion: 'failure',
        started_at: '2026-11-10T01:42:17Z',
        completed_at: '2026-11-10T01:42:27Z',
        name: 'deploy',
        steps: [
          {
            name: 'Set up job',
            status: 'completed',
            conclusion: 'success',
            number: 1,
            started_at: '2026-11-10T01:42:18Z',
            completed_at: '2026-11-10T01:42:19Z'
          },
          {
            name: 'Publish available-source updates and visible failure status',
            status: 'completed',
            conclusion: 'success',
            number: 2,
            started_at: '2026-11-10T01:42:19Z',
            completed_at: '2026-11-10T01:42:25Z'
          },
          {
            name: 'Report source failures after preserving the working site',
            status: 'completed',
            conclusion: 'failure',
            number: 3,
            started_at: '2026-11-10T01:42:25Z',
            completed_at: '2026-11-10T01:42:25Z'
          },
          {
            name: 'Show the known collection pause without repeated failure alerts',
            status: 'completed',
            conclusion: 'skipped',
            number: 4,
            started_at: '2026-11-10T01:42:25Z',
            completed_at: '2026-11-10T01:42:25Z'
          },
          {
            name: 'Complete job',
            status: 'completed',
            conclusion: 'success',
            number: 5,
            started_at: '2026-11-10T01:42:25Z',
            completed_at: '2026-11-10T01:42:25Z'
          }
        ]
      },
      {
        id: 129570801458,
        run_id: 42737247875,
        workflow_name: 'Daily data and patch-aware publication',
        head_branch: 'main',
        head_sha: 'fda1ae265c720fcd26e5e136bbdbcb78776eb408',
        status: 'completed',
        conclusion: 'success',
        started_at: '2026-11-10T01:42:30Z',
        completed_at: '2026-11-10T01:42:33Z',
        name: 'watchdog',
        steps: []
      }
    ]
  };

  const deployedGate = evaluateDeployGate(realRun42737247875);
  assert.equal(deployedGate.decision, 'run');
  assert.equal(deployedGate.deployed, true);
  assert.equal(deployedGate.runId, '42737247875');
  assert.equal(deployedGate.headSha, 'fda1ae265c720fcd26e5e136bbdbcb78776eb408');
  assert.equal(deployedGate.deployedAt, '2026-11-10T01:42:25Z');
  assert.equal(deployedGate.stepConclusion, 'success');

  // Case 2: Deploy step skipped (the deploy job's `if: needs.build.outputs.publishable == 'true'` was false)
  const skippedDeployPayload = {
    total_count: 2,
    jobs: [
      {
        id: 129569375522,
        run_id: 42737247876,
        head_sha: 'fda1ae265c720fcd26e5e136bbdbcb78776eb408',
        name: 'build',
        status: 'completed',
        conclusion: 'success',
        steps: []
      },
      {
        id: 129570702411,
        run_id: 42737247876,
        head_sha: 'fda1ae265c720fcd26e5e136bbdbcb78776eb408',
        name: 'deploy',
        status: 'completed',
        conclusion: 'skipped',
        steps: [
          {
            name: 'Publish available-source updates and visible failure status',
            status: 'completed',
            conclusion: 'skipped',
            number: 1,
            started_at: null,
            completed_at: null
          }
        ]
      }
    ]
  };

  const skippedGate = evaluateDeployGate(skippedDeployPayload);
  assert.equal(skippedGate.decision, 'skip');
  assert.equal(skippedGate.deployed, false);
  assert.equal(skippedGate.runId, '42737247876');
  assert.equal(skippedGate.deployedAt, null);
  assert.equal(skippedGate.summary, 'no deployment in run 42737247876, nothing to check');

  // Case 3: Deploy job missing altogether
  const missingDeployJobPayload = {
    total_count: 1,
    jobs: [
      {
        id: 129569375522,
        run_id: 42737247877,
        head_sha: 'fda1ae265c720fcd26e5e136bbdbcb78776eb408',
        name: 'build',
        status: 'completed',
        conclusion: 'failure',
        steps: []
      }
    ]
  };

  const missingGate = evaluateDeployGate(missingDeployJobPayload);
  assert.equal(missingGate.decision, 'skip');
  assert.equal(missingGate.deployed, false);
  assert.equal(missingGate.runId, '42737247877');
  assert.equal(missingGate.deployedAt, null);
  assert.equal(missingGate.summary, 'no deployment in run 42737247877, nothing to check');
});

test('isManifestVersionReady and waitForDeployedManifest poll offline from deploy finish time until version matches or changes', async () => {
  assert.equal(
    isManifestVersionReady({ app: { version: '2.59.0' } }, { expectedVersion: '2.59.0' }).ready,
    true
  );
  assert.equal(
    isManifestVersionReady(
      { app: { version: '2.58.0' } },
      { expectedVersion: '2.59.0', initialVersion: '2.58.0' }
    ).ready,
    false
  );
  assert.equal(
    isManifestVersionReady(
      { app: { version: '2.58.1' } },
      { expectedVersion: '2.59.0', initialVersion: '2.58.0' }
    ).ready,
    true
  );

  const deployFinishIso = '2026-11-10T01:42:25Z';
  const deployFinishMs = Date.parse(deployFinishIso);
  let clock = deployFinishMs + 5000;
  const responses = [
    { ok: true, status: 200, text: JSON.stringify({ app: { version: '2.58.0' } }) },
    { ok: true, status: 200, text: JSON.stringify({ app: { version: '2.58.0' } }) },
    { ok: true, status: 200, text: JSON.stringify({ app: { version: '2.59.0' } }) }
  ];
  let idx = 0;
  const result = await waitForDeployedManifest({
    siteUrl: DEFAULT_SITE_URL,
    expectedVersion: '2.59.0',
    headSha: 'fda1ae265c720fcd26e5e136bbdbcb78776eb408',
    deployFinishedAt: deployFinishIso,
    timeoutMs: 60000,
    intervalMs: 5000,
    nowFn: () => clock,
    sleepFn: async ms => { clock += ms; },
    fetchFn: async () => responses[Math.min(idx++, responses.length - 1)]
  });
  assert.equal(result.ok, true);
  assert.equal(result.version, '2.59.0');
  assert.equal(result.attempts, 3);
  assert.equal(result.elapsedMs, 15000);
  assert.equal(result.headSha, 'fda1ae265c720fcd26e5e136bbdbcb78776eb408');
  assert.equal(result.deployFinishedAt, deployFinishIso);

  let timeoutClock = 0;
  await assert.rejects(
    () => waitForDeployedManifest({
      siteUrl: DEFAULT_SITE_URL,
      expectedVersion: '2.60.0',
      timeoutMs: 30000,
      intervalMs: 15000,
      nowFn: () => timeoutClock,
      sleepFn: async ms => { timeoutClock += ms; },
      fetchFn: async () => ({
        ok: true,
        status: 200,
        text: JSON.stringify({ app: { version: '2.59.0' } })
      })
    }),
    /Timed out after 30s/
  );
});

test('evaluateNetworkCheck and classifySameOriginAsset validate 200 responses and reject missing paths', () => {
  assert.equal(classifySameOriginAsset(DEFAULT_SITE_URL, 'document', DEFAULT_SITE_URL), 'document');
  assert.equal(
    classifySameOriginAsset(DEFAULT_SITE_URL + 'manifest.json', 'fetch', DEFAULT_SITE_URL),
    'manifest'
  );
  assert.equal(
    classifySameOriginAsset(DEFAULT_SITE_URL + 'static_client.js', 'script', DEFAULT_SITE_URL),
    'script'
  );
  assert.equal(
    classifySameOriginAsset(DEFAULT_SITE_URL + 'bundles/gold-core-abc.json', 'fetch', DEFAULT_SITE_URL),
    'bundle'
  );
  assert.equal(
    classifySameOriginAsset('https://statz.gg/some.js', 'script', DEFAULT_SITE_URL),
    null
  );

  const okNet = evaluateNetworkCheck({
    siteUrl: DEFAULT_SITE_URL,
    pageStatus: 200,
    manifestStatus: 200,
    manifestUrl: DEFAULT_SITE_URL + 'manifest.json',
    assets: [
      { kind: 'script', url: DEFAULT_SITE_URL + 'static_client.js', status: 200, failed: false },
      { kind: 'bundle', url: DEFAULT_SITE_URL + 'bundles/gold-core.json', status: 200, failed: false }
    ],
    nonGetRequests: []
  });
  assert.equal(okNet.passed, true);
  assert.equal(okNet.status, 'pass');

  const nopeNet = evaluateNetworkCheck({
    siteUrl: DEFAULT_SITE_URL + 'nope/',
    pageStatus: 404,
    manifestStatus: 404,
    manifestUrl: DEFAULT_SITE_URL + 'nope/manifest.json',
    assets: [],
    nonGetRequests: []
  });
  assert.equal(nopeNet.passed, false);
  assert.equal(nopeNet.status, 'fail');
  assert.match(nopeNet.reason, /returned HTTP 404/);
});

test('console/page error, boot/data, mobile layout, and buildSmokeReport produce required report shape', () => {
  const errCheck = evaluateConsoleAndPageErrorCheck({ pageErrors: [], consoleErrors: [] });
  assert.equal(errCheck.passed, true);

  const bootCheck = evaluateBootAndDataCheck({
    booted: true,
    startupNoteCount: 0,
    roles: ['jungle', 'offlane', 'midlane', 'carry', 'support'],
    bracketVisible: true,
    activeBracket: 'gold',
    heroCount: 41,
    heroPickerVisible: true,
    heroOptionCount: 41,
    metaRowCount: 18,
    hasRecommendation: true,
    recommendationSample: 'Khai (Pick, 6-item build path)',
    freshnessText: 'Bundle assembled 10 Nov 2026 · Statz fetched 10 Nov 2026',
    sourceLineText: 'Statz fetched 10 Nov 2026 · Dataset gold',
    generatedAt: '2026-11-10T17:25:00Z',
    generatedAtValid: true
  });
  assert.equal(bootCheck.passed, true);

  const mobileCheck = evaluateMobileLayoutCheck({
    innerWidth: 390,
    innerHeight: 844,
    docScrollWidth: 390,
    bodyScrollWidth: 390,
    navVisible: true,
    destinations: [
      { destination: 'meta', visible: true, inViewport: true, width: 120, height: 52 },
      { destination: 'match', visible: true, inViewport: true, width: 120, height: 52 },
      { destination: 'more', visible: true, inViewport: true, width: 120, height: 52 }
    ]
  });
  assert.equal(mobileCheck.passed, true);

  const report = buildSmokeReport({
    siteUrl: DEFAULT_SITE_URL,
    checkedAt: '2026-11-10T18:00:00.000Z',
    checks: [errCheck, bootCheck, mobileCheck],
    version: {
      page: '2.59.0',
      manifest: '2.59.0',
      serviceWorkerCache: 'predecessor-meta-shell-v2-59-0'
    },
    screenshot: 'qa/deployed-smoke.png',
    headSha: 'fda1ae265c720fcd26e5e136bbdbcb78776eb408',
    deployFinishedAt: '2026-11-10T01:42:25Z'
  });
  assert.equal(report.suite, 'deployed-smoke');
  assert.equal(report.status, 'pass');
  assert.equal(report.passed, true);
  assert.deepEqual(report.summary, { total: 3, passed: 3, failed: 0 });
  assert.equal(report.screenshot, 'qa/deployed-smoke.png');
  assert.deepEqual(report.deployment, {
    head_sha: 'fda1ae265c720fcd26e5e136bbdbcb78776eb408',
    deploy_finished_at: '2026-11-10T01:42:25Z'
  });
  for (const item of report.checks) {
    assert.ok(item.id);
    assert.ok(item.status === 'pass' || item.status === 'fail');
    assert.equal(typeof item.passed, 'boolean');
    assert.ok(typeof item.reason === 'string' && item.reason.length > 0);
  }
});

test('deployed-smoke.yml workflow uses deploy-step gate job, read-only permissions, and pinned SHAs', () => {
  const workflowText = fs.readFileSync(
    path.join(ROOT, '.github', 'workflows', 'deployed-smoke.yml'),
    'utf8'
  );
  const liveCheckText = fs.readFileSync(
    path.join(ROOT, '.github', 'workflows', 'live-check.yml'),
    'utf8'
  );
  assert.match(workflowText, /workflow_run:/);
  assert.match(workflowText, /workflows:\s*\['Daily data and patch-aware publication'\]/);
  assert.match(workflowText, /types:\s*\[completed\]/);
  assert.match(workflowText, /workflow_dispatch:/);
  assert.doesNotMatch(workflowText, /workflow_run\.conclusion/);
  assert.doesNotMatch(workflowText, /\bdeployment_status\b/);
  assert.doesNotMatch(workflowText, /\bpage_build\b/);
  assert.doesNotMatch(workflowText, /\bschedule:/);
  assert.doesNotMatch(workflowText, /\bcron:/);
  assert.match(workflowText, /permissions:\s*\r?\n\s*contents:\s*read\s*\r?\n\s*actions:\s*read/);
  assert.doesNotMatch(workflowText, /write/);
  assert.match(workflowText, /persist-credentials:\s*false/);
  assert.doesNotMatch(workflowText, /secrets\./);
  assert.match(workflowText, /\bgate:/);
  assert.match(workflowText, /if:\s*github\.event_name\s*!=\s*'workflow_dispatch'/);
  assert.match(
    workflowText,
    /gh api repos\/\$\{\{\s*github\.repository\s*\}\}\/actions\/runs\/\$\{\{\s*github\.event\.workflow_run\.id\s*\}\}\/jobs/
  );
  assert.match(workflowText, /--check-deploy-gate/);
  assert.match(workflowText, /needs:\s*gate/);
  assert.match(
    workflowText,
    /if:\s*\$\{\{\s*!cancelled\(\)\s*&&\s*\(github\.event_name\s*==\s*'workflow_dispatch'\s*\|\|\s*needs\.gate\.outputs\.deployed\s*==\s*'true'\)\s*\}\}/
  );
  assert.match(workflowText, /DEPLOY_HEAD_SHA:\s*\$\{\{\s*needs\.gate\.outputs\.head_sha\s*\}\}/);
  assert.match(workflowText, /DEPLOY_FINISHED_AT:\s*\$\{\{\s*needs\.gate\.outputs\.deployed_at\s*\}\}/);
  assert.match(workflowText, /--wait-for-manifest/);
  assert.match(workflowText, /WAIT_TIMEOUT_SECONDS:\s*'600'/);
  assert.match(workflowText, /path:\s*qa\/deployed-smoke\.\*/);
  assert.match(workflowText, /retention-days:\s*14/);

  const usesLines = workflowText
    .split(/\r?\n/)
    .filter(line => line.includes('uses:'))
    .map(line => line.split('uses:')[1].trim());
  assert.equal(usesLines.length, 6);
  for (const use of usesLines) {
    assert.match(use, /@[0-9a-f]{40}\b/);
    assert.ok(liveCheckText.includes(use), 'Action SHA must match live-check.yml: ' + use);
  }
});
