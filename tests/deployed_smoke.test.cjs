'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const {
  DEFAULT_SITE_URL,
  DEPLOY_JOB_NAME,
  DEPLOY_STEP_NAME,
  REQUIRED_CHECK_IDS,
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
  waitForDeployedManifest,
  startLocalPreviewServer,
  runDeployedSmoke,
  main
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

test('version and service worker shell cache helpers match repo release contract and handle null cases', () => {
  const repoVersion = readRepoVersion(ROOT);
  assert.match(repoVersion, /^\d+\.\d+\.\d+$/);
  assert.equal(expectedShellCacheName('2.59.0'), 'predecessor-meta-shell-v2-59-0');
  assert.throws(() => expectedShellCacheName(''), /Version must be a non-empty string/);

  const swText = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  assert.equal(parseShellCacheFromSwSource(swText), expectedShellCacheName(repoVersion));
  assert.equal(parseShellCacheFromSwSource('/* no cache constant */'), null);
  assert.equal(parseShellCacheFromSwSource(null), null);
  assert.equal(extractManifestVersion({ app: { version: '2.59.0' } }), '2.59.0');
  assert.equal(extractManifestVersion({ version: '2.58.1' }), '2.58.1');
  assert.equal(extractManifestVersion({}), null);
});

test('evaluateVersionAgreementCheck requires sw.js 200 and parseable SHELL_CACHE', () => {
  const passCheck = evaluateVersionAgreementCheck({
    pageVersion: '2.59.0',
    metaTagVersion: '2.59.0',
    sidebarVersion: '2.59.0',
    appStateVersion: '2.59.0',
    manifestVersion: '2.59.0',
    cacheKeys: ['predecessor-meta-data-v1', 'predecessor-meta-shell-v2-59-0'],
    swStatus: 200,
    swSourceCacheName: 'predecessor-meta-shell-v2-59-0'
  });
  assert.equal(passCheck.status, 'pass');
  assert.equal(passCheck.passed, true);
  assert.match(passCheck.reason, /matches deployed manifest version 2\.59\.0/);

  // Null swSourceCacheName (unparseable or missing sw.js) must fail the version check.
  const nullSwCheck = evaluateVersionAgreementCheck({
    pageVersion: '2.59.0',
    metaTagVersion: '2.59.0',
    sidebarVersion: '2.59.0',
    appStateVersion: '2.59.0',
    manifestVersion: '2.59.0',
    cacheKeys: ['predecessor-meta-data-v1', 'predecessor-meta-shell-v2-59-0'],
    swStatus: 404,
    swSourceCacheName: null
  });
  assert.equal(nullSwCheck.status, 'fail');
  assert.equal(nullSwCheck.passed, false);
  assert.match(nullSwCheck.reason, /sw\.js returned HTTP 404/);
  assert.match(nullSwCheck.reason, /did not return a parseable SHELL_CACHE name/);

  const unparseableSwCheck = evaluateVersionAgreementCheck({
    pageVersion: '2.59.0',
    metaTagVersion: '2.59.0',
    sidebarVersion: '2.59.0',
    appStateVersion: '2.59.0',
    manifestVersion: '2.59.0',
    cacheKeys: ['predecessor-meta-data-v1', 'predecessor-meta-shell-v2-59-0'],
    swStatus: 200,
    swSourceCacheName: null
  });
  assert.equal(unparseableSwCheck.status, 'fail');
  assert.equal(unparseableSwCheck.passed, false);
  assert.match(unparseableSwCheck.reason, /did not return a parseable SHELL_CACHE name/);

  const mismatchCheck = evaluateVersionAgreementCheck({
    pageVersion: '2.58.0',
    metaTagVersion: '2.58.0',
    sidebarVersion: '2.58.0',
    appStateVersion: '2.58.0',
    manifestVersion: '2.59.0',
    cacheKeys: ['predecessor-meta-shell-v2-58-0'],
    swStatus: 200,
    swSourceCacheName: 'predecessor-meta-shell-v2-58-0'
  });
  assert.equal(mismatchCheck.status, 'fail');
  assert.equal(mismatchCheck.passed, false);
  assert.match(mismatchCheck.reason, /2\.58\.0.*2\.59\.0/);
  assert.match(mismatchCheck.reason, /predecessor-meta-shell-v2-59-0/);
});

test('publish.yml still defines the deploy job and step names that the deploy gate inspects', () => {
  const publishText = fs.readFileSync(
    path.join(ROOT, '.github', 'workflows', 'publish.yml'),
    'utf8'
  );
  assert.match(publishText, /^name:\s*Daily data and patch-aware publication\s*$/m);
  const deployJobIdx = publishText.indexOf('\n  ' + DEPLOY_JOB_NAME + ':');
  assert.ok(deployJobIdx !== -1, 'publish.yml must define job "' + DEPLOY_JOB_NAME + '"');
  const deployJobSection = publishText.slice(deployJobIdx);
  assert.ok(
    deployJobSection.includes('- name: ' + DEPLOY_STEP_NAME),
    'publish.yml deploy job must define step "' + DEPLOY_STEP_NAME + '"'
  );
  assert.match(deployJobSection, /uses:\s*actions\/deploy-pages@[0-9a-f]{40}\b/);
  assert.match(publishText, /uses:\s*actions\/upload-pages-artifact@[0-9a-f]{40}\b/);
});

test('evaluateDeployGate handles deploy step success (real run 42737247875), artifact manifest metadata, skipped deploy step, and missing deploy job', () => {
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

  const deployedGate = evaluateDeployGate(realRun42737247875, {
    artifactManifest: {
      run_id: '42737247875',
      published_at: '2026-11-10T01:42:03+00:00',
      app: { version: '2.59.0' }
    },
    requireArtifactManifest: true
  });
  assert.equal(deployedGate.decision, 'run');
  assert.equal(deployedGate.deployed, true);
  assert.equal(deployedGate.runId, '42737247875');
  assert.equal(deployedGate.headSha, 'fda1ae265c720fcd26e5e136bbdbcb78776eb408');
  assert.equal(deployedGate.deployedAt, '2026-11-10T01:42:25Z');
  assert.equal(deployedGate.expectedRunId, '42737247875');
  assert.equal(deployedGate.expectedPublishedAt, '2026-11-10T01:42:03+00:00');
  assert.equal(deployedGate.expectedVersion, '2.59.0');
  assert.equal(deployedGate.stepConclusion, 'success');

  assert.throws(
    () => evaluateDeployGate(realRun42737247875, {
      artifactManifest: { app: { version: '2.59.0' } },
      requireArtifactManifest: true
    }),
    /missing run_id or published_at/
  );

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

test('waitForDeployedManifest requires artifact run_id + published_at on workflow_run and fails fast on invalid deployFinishedAt', async () => {
  // Stale deployment with same app.version (2.59.0) must NOT satisfy a publication wait for a newer run.
  const staleManifest = {
    app: { version: '2.59.0' },
    run_id: '42737247875',
    published_at: '2026-11-10T01:42:03+00:00'
  };
  const freshManifest = {
    app: { version: '2.59.0' },
    run_id: '42755118251',
    published_at: '2026-11-10T04:21:19+00:00'
  };

  const staleCheck = isManifestVersionReady(staleManifest, {
    expectedVersion: '2.59.0',
    expectedRunId: '42755118251',
    expectedPublishedAt: '2026-11-10T04:21:19+00:00'
  });
  assert.equal(staleCheck.ready, false);
  assert.match(staleCheck.reason, /waiting for artifact run_id=42755118251/);

  const freshCheck = isManifestVersionReady(freshManifest, {
    expectedVersion: '2.59.0',
    expectedRunId: '42755118251',
    expectedPublishedAt: '2026-11-10T04:21:19+00:00'
  });
  assert.equal(freshCheck.ready, true);

  const deployFinishIso = '2026-11-10T04:22:10Z';
  const deployFinishMs = Date.parse(deployFinishIso);
  let clock = deployFinishMs + 5000;
  const responses = [
    { ok: true, status: 200, text: JSON.stringify(staleManifest) },
    { ok: true, status: 200, text: JSON.stringify(staleManifest) },
    { ok: true, status: 200, text: JSON.stringify(freshManifest) }
  ];
  let idx = 0;
  const result = await waitForDeployedManifest({
    siteUrl: DEFAULT_SITE_URL,
    expectedVersion: '2.59.0',
    expectedRunId: '42755118251',
    expectedPublishedAt: '2026-11-10T04:21:19+00:00',
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
  assert.equal(result.runId, '42755118251');
  assert.equal(result.publishedAt, '2026-11-10T04:21:19+00:00');
  assert.equal(result.attempts, 3);
  assert.equal(result.elapsedMs, 15000);

  // If the deployed manifest stays on the old run_id/published_at for 10 minutes after deployFinishedAt, fail clearly.
  let staleClock = deployFinishMs + 10000;
  await assert.rejects(
    () => waitForDeployedManifest({
      siteUrl: DEFAULT_SITE_URL,
      expectedVersion: '2.59.0',
      expectedRunId: '42755118251',
      expectedPublishedAt: '2026-11-10T04:21:19+00:00',
      deployFinishedAt: deployFinishIso,
      timeoutMs: 600000,
      intervalMs: 60000,
      nowFn: () => staleClock,
      sleepFn: async ms => { staleClock += ms; },
      fetchFn: async () => ({ ok: true, status: 200, text: JSON.stringify(staleManifest) })
    }),
    /Timed out after 600s.*waiting for artifact run_id=42755118251, published_at=2026-11-10T04:21:19\+00:00/
  );

  // Fix 8: Missing, unparseable, future, or already-expired deployFinishedAt must fail fast without polling.
  await assert.rejects(
    () => waitForDeployedManifest({
      siteUrl: DEFAULT_SITE_URL,
      expectedRunId: '42755118251',
      expectedPublishedAt: '2026-11-10T04:21:19+00:00',
      deployFinishedAt: '',
      nowFn: () => deployFinishMs
    }),
    /DEPLOY_FINISHED_AT is missing/
  );
  await assert.rejects(
    () => waitForDeployedManifest({
      siteUrl: DEFAULT_SITE_URL,
      deployFinishedAt: 'not-a-timestamp',
      nowFn: () => deployFinishMs
    }),
    /unparseable timestamp/
  );
  await assert.rejects(
    () => waitForDeployedManifest({
      siteUrl: DEFAULT_SITE_URL,
      deployFinishedAt: '2026-11-10T05:00:00Z',
      nowFn: () => deployFinishMs
    }),
    /timestamp is in the future/
  );
  await assert.rejects(
    () => waitForDeployedManifest({
      siteUrl: DEFAULT_SITE_URL,
      deployFinishedAt: '2026-11-10T04:00:00Z',
      timeoutMs: 600000,
      nowFn: () => deployFinishMs
    }),
    /already older than the 600s timeout/
  );

  // workflow_dispatch mode (no deployFinishedAt or artifact target) keeps today's version wait behaviour.
  let dispatchClock = 1000;
  const dispatchRes = await waitForDeployedManifest({
    siteUrl: DEFAULT_SITE_URL,
    expectedVersion: '2.59.0',
    timeoutMs: 30000,
    intervalMs: 5000,
    nowFn: () => dispatchClock,
    sleepFn: async ms => { dispatchClock += ms; },
    fetchFn: async () => ({ ok: true, status: 200, text: JSON.stringify({ app: { version: '2.59.0' } }) })
  });
  assert.equal(dispatchRes.ok, true);
  assert.equal(dispatchRes.version, '2.59.0');
});

test('evaluateNetworkCheck and classifySameOriginAsset validate page, manifest, sw.js, and data bundles', () => {
  assert.equal(classifySameOriginAsset(DEFAULT_SITE_URL, 'document', DEFAULT_SITE_URL), 'document');
  assert.equal(
    classifySameOriginAsset(DEFAULT_SITE_URL + 'manifest.json', 'fetch', DEFAULT_SITE_URL),
    'manifest'
  );
  assert.equal(
    classifySameOriginAsset(DEFAULT_SITE_URL + 'sw.js', 'script', DEFAULT_SITE_URL),
    'sw'
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
    swStatus: 200,
    swUrl: DEFAULT_SITE_URL + 'sw.js',
    assets: [
      { kind: 'sw', url: DEFAULT_SITE_URL + 'sw.js', status: 200, failed: false },
      { kind: 'bundle', url: DEFAULT_SITE_URL + 'bundles/gold-core.json', status: 200, failed: false }
    ],
    nonGetRequests: []
  });
  assert.equal(okNet.passed, true);
  assert.equal(okNet.status, 'pass');
  assert.equal(okNet.name, 'Page, manifest, sw.js, and same-origin data bundles return 200');
  assert.match(okNet.reason, /Page \(200\), manifest \(200\), sw\.js \(200\), and all 1 same-origin data bundle\(s\)/);

  const nopeNet = evaluateNetworkCheck({
    siteUrl: DEFAULT_SITE_URL + 'nope/',
    pageStatus: 404,
    manifestStatus: 404,
    manifestUrl: DEFAULT_SITE_URL + 'nope/manifest.json',
    swStatus: 404,
    swUrl: DEFAULT_SITE_URL + 'nope/sw.js',
    assets: [],
    nonGetRequests: ['POST ' + DEFAULT_SITE_URL + 'nope/']
  });
  assert.equal(nopeNet.passed, false);
  assert.equal(nopeNet.status, 'fail');
  assert.match(nopeNet.reason, /Non-GET requests observed/);
  assert.match(nopeNet.reason, /Page .* returned HTTP 404/);
  assert.match(nopeNet.reason, /Manifest .* returned HTTP 404/);
  assert.match(nopeNet.reason, /Service worker .* returned HTTP 404/);
  assert.match(nopeNet.reason, /No same-origin data bundle returned HTTP 200/);
});

test('console/page error, boot/data, mobile layout, and buildSmokeReport validate both passing and failing inputs and require all 5 checks', () => {
  const netPass = evaluateNetworkCheck({
    siteUrl: DEFAULT_SITE_URL,
    pageStatus: 200,
    manifestStatus: 200,
    swStatus: 200,
    assets: [{ kind: 'bundle', url: DEFAULT_SITE_URL + 'bundles/gold.json', status: 200, failed: false }],
    nonGetRequests: []
  });
  const errPass = evaluateConsoleAndPageErrorCheck({ pageErrors: [], consoleErrors: [] });
  assert.equal(errPass.passed, true);

  const errFail = evaluateConsoleAndPageErrorCheck({
    pageErrors: ['ReferenceError: x is not defined'],
    consoleErrors: ['Failed to load resource']
  });
  assert.equal(errFail.passed, false);
  assert.equal(errFail.status, 'fail');
  assert.match(errFail.reason, /1 uncaught page error/);
  assert.match(errFail.reason, /1 console\.error message/);

  const bootPass = evaluateBootAndDataCheck({
    booted: true,
    startupNoteCount: 0,
    roles: ['jungle', 'offlane', 'midlane', 'carry', 'support'],
    bracketVisible: true,
    activeBracket: 'gold',
    heroCount: 56,
    heroPickerVisible: true,
    heroOptionCount: 56,
    metaRowCount: 25,
    hasRecommendation: true,
    recommendationSample: 'Aurora (S · Reviewed)',
    freshnessText: 'Bundle assembled 10 Nov 2026 · Statz fetched 10 Nov 2026',
    sourceLineText: 'Pred.gg source cohort · fetched 10 Nov 2026',
    generatedAt: '2026-11-10T01:42:03Z',
    generatedAtValid: true
  });
  assert.equal(bootPass.passed, true);

  const bootFail = evaluateBootAndDataCheck({
    booted: false,
    startupNoteCount: 1,
    roles: ['jungle'],
    bracketVisible: false,
    activeBracket: null,
    heroCount: 0,
    heroPickerVisible: false,
    heroOptionCount: 0,
    metaRowCount: 0,
    hasRecommendation: false,
    recommendationSample: null,
    freshnessText: '',
    sourceLineText: '',
    generatedAt: null,
    generatedAtValid: false
  });
  assert.equal(bootFail.passed, false);
  assert.equal(bootFail.status, 'fail');
  assert.match(bootFail.reason, /App did not finish booting/);
  assert.match(bootFail.reason, /Loading placeholder/);
  assert.match(bootFail.reason, /Role picker missing role tab/);
  assert.match(bootFail.reason, /Hero picker incomplete/);
  assert.match(bootFail.reason, /No hero\/build recommendation/);
  assert.match(bootFail.reason, /Data-date label missing/);

  const verPass = evaluateVersionAgreementCheck({
    pageVersion: '2.59.0',
    metaTagVersion: '2.59.0',
    sidebarVersion: '2.59.0',
    appStateVersion: '2.59.0',
    manifestVersion: '2.59.0',
    cacheKeys: ['predecessor-meta-shell-v2-59-0'],
    swStatus: 200,
    swSourceCacheName: 'predecessor-meta-shell-v2-59-0'
  });
  assert.equal(verPass.passed, true);

  const mobilePass = evaluateMobileLayoutCheck({
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
  assert.equal(mobilePass.passed, true);

  const mobileFail = evaluateMobileLayoutCheck({
    innerWidth: 390,
    innerHeight: 844,
    docScrollWidth: 480,
    bodyScrollWidth: 480,
    navVisible: false,
    destinations: [
      { destination: 'meta', visible: true, inViewport: true, width: 120, height: 52 }
    ]
  });
  assert.equal(mobileFail.passed, false);
  assert.equal(mobileFail.status, 'fail');
  assert.match(mobileFail.reason, /Horizontal scroll detected at 390x844: scrollWidth=480px/);
  assert.match(mobileFail.reason, /#mobile-navigation.*not visible/);
  assert.match(mobileFail.reason, /missing or off-screen at 390x844: match, more/);

  // Partial check list (only 3 of 5 checks) MUST fail buildSmokeReport.
  const partialReport = buildSmokeReport({
    siteUrl: DEFAULT_SITE_URL,
    checkedAt: '2026-11-10T18:00:00.000Z',
    checks: [errPass, bootPass, mobilePass],
    version: { page: '2.59.0', manifest: '2.59.0', serviceWorkerCache: 'predecessor-meta-shell-v2-59-0' }
  });
  assert.equal(partialReport.passed, false);
  assert.equal(partialReport.status, 'fail');
  assert.deepEqual(partialReport.summary.missing_checks, [
    'network_assets_200',
    'release_version_agreement'
  ]);

  // All 5 required checks passing -> report passes.
  const fullPassReport = buildSmokeReport({
    siteUrl: DEFAULT_SITE_URL,
    checkedAt: '2026-11-10T18:00:00.000Z',
    checks: [netPass, errPass, bootPass, verPass, mobilePass],
    version: { page: '2.59.0', manifest: '2.59.0', serviceWorkerCache: 'predecessor-meta-shell-v2-59-0' },
    screenshot: 'qa/deployed-smoke.png',
    headSha: 'fda1ae265c720fcd26e5e136bbdbcb78776eb408',
    deployFinishedAt: '2026-11-10T01:42:25Z'
  });
  assert.equal(fullPassReport.Checks?.length ?? fullPassReport.checks.length, REQUIRED_CHECK_IDS.length);
  assert.equal(fullPassReport.status, 'pass');
  assert.equal(fullPassReport.passed, true);
  assert.deepEqual(fullPassReport.summary, { total: 5, passed: 5, failed: 0 });
});

test('startLocalPreviewServer, runDeployedSmoke (pass, shell-absent, and error throw paths), and main gate output writing work offline', async () => {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'pred-smoke-test-'));
  const previewDir = path.join(tmpBase, 'preview');
  const siblingDir = path.join(tmpBase, 'preview-evil');
  const qaDir = path.join(tmpBase, 'qa');
  fs.mkdirSync(path.join(previewDir, 'bundles'), { recursive: true });
  fs.mkdirSync(siblingDir, { recursive: true });
  fs.writeFileSync(path.join(previewDir, 'index.html'), '<!doctype html><main id="main"></main>', 'utf8');
  fs.writeFileSync(
    path.join(previewDir, 'manifest.json'),
    JSON.stringify({ app: { version: '2.59.0' }, run_id: '100', published_at: '2026-11-10T01:00:00Z' }),
    'utf8'
  );
  fs.writeFileSync(
    path.join(previewDir, 'sw.js'),
    "const SHELL_CACHE = 'predecessor-meta-shell-v2-59-0';\n",
    'utf8'
  );
  fs.writeFileSync(path.join(previewDir, 'bundles', 'gold-core.json'), '{"ok":true}', 'utf8');
  fs.writeFileSync(path.join(siblingDir, 'secret.txt'), 'forbidden', 'utf8');

  const server = await startLocalPreviewServer('http://127.0.0.1:0/', previewDir);
  const port = server.address().port;
  const baseUrl = 'http://127.0.0.1:' + port + '/';

  try {
    // 1. Malformed percent escape returns 400.
    const badPct = await fetch(baseUrl + '%E0%A4%A');
    assert.equal(badPct.status, 400);

    // 2. Sibling prefix / parent traversal returns 404.
    const traversal = await fetch(baseUrl + '..%2fpreview-evil%2fsecret.txt');
    assert.equal(traversal.status, 404);

    // 3. Non-GET/HEAD returns 405.
    const postRes = await fetch(baseUrl + 'index.html', { method: 'POST' });
    assert.equal(postRes.status, 405);

    // 4. Valid file returns 200.
    const okRes = await fetch(baseUrl + 'manifest.json');
    assert.equal(okRes.status, 200);

    // 5. runDeployedSmoke shell-absent path (against /nope/ on the local preview server).
    const shellAbsentBrowserType = {
      launch: async () => ({
        newContext: async () => {
          const listeners = { response: [] };
          return {
            on: (evt, fn) => { (listeners[evt] ||= []).push(fn); },
            newPage: async () => ({
              on: () => {},
              goto: async url => {
                const res = await fetch(url);
                return { status: () => res.status };
              },
              evaluate: async () => ({
                innerWidth: 390,
                innerHeight: 844,
                docScrollWidth: 700,
                bodyScrollWidth: 700,
                navVisible: false,
                destinations: []
              }),
              setViewportSize: async () => {},
              screenshot: async ({ path: p }) => { fs.writeFileSync(p, Buffer.from('PNG')); }
            }),
            close: async () => {}
          };
        },
        close: async () => {}
      })
    };

    const absentReport = await runDeployedSmoke({
      siteUrl: baseUrl + 'nope/',
      qaDir,
      browserType: shellAbsentBrowserType
    });
    assert.equal(absentReport.status, 'fail');
    assert.equal(absentReport.passed, false);
    assert.equal(absentReport.checks.length, 5);
    const savedAbsent = JSON.parse(fs.readFileSync(path.join(qaDir, 'deployed-smoke.json'), 'utf8'));
    assert.equal(savedAbsent.status, 'fail');
    assert.ok(fs.existsSync(path.join(qaDir, 'deployed-smoke.png')));

    // 6. runDeployedSmoke passing path writes qa/deployed-smoke.json and qa/deployed-smoke.png.
    const passingBrowserType = {
      launch: async () => ({
        newContext: async () => {
          const listeners = { response: [] };
          return {
            on: (evt, fn) => { (listeners[evt] ||= []).push(fn); },
            newPage: async () => {
              let evalCall = 0;
              return {
                on: () => {},
                goto: async url => {
                  const res = await fetch(url);
                  for (const fn of listeners.response || []) {
                    fn({
                      url: () => baseUrl + 'bundles/gold-core.json',
                      status: () => 200,
                      request: () => ({ resourceType: () => 'fetch' })
                    });
                  }
                  return { status: () => res.status };
                },
                waitForFunction: async () => {},
                evaluate: async () => {
                  evalCall += 1;
                  if (evalCall === 1) return true; // shellPresent
                  if (evalCall === 2) {
                    return {
                      booted: true,
                      startupNoteCount: 0,
                      roles: ['jungle', 'offlane', 'midlane', 'carry', 'support'],
                      bracketVisible: true,
                      activeBracket: 'gold',
                      heroCount: 56,
                      heroPickerVisible: true,
                      heroOptionCount: 56,
                      metaRowCount: 25,
                      hasRecommendation: true,
                      recommendationSample: 'Aurora (S)',
                      freshnessText: 'Bundle assembled 10 Nov 2026 · Statz fetched 10 Nov 2026',
                      sourceLineText: 'Pred.gg source cohort · fetched 10 Nov 2026',
                      generatedAt: '2026-11-10T01:00:00Z',
                      generatedAtValid: true
                    };
                  }
                  if (evalCall === 3) {
                    return {
                      pageVersion: '2.59.0',
                      metaTagVersion: '2.59.0',
                      sidebarVersion: '2.59.0',
                      appStateVersion: '2.59.0',
                      manifestVersion: '2.59.0',
                      cacheKeys: ['predecessor-meta-shell-v2-59-0'],
                      swStatus: 200,
                      swSourceCacheName: 'predecessor-meta-shell-v2-59-0'
                    };
                  }
                  if (evalCall === 4) return undefined; // double rAF
                  return {
                    innerWidth: 390,
                    innerHeight: 844,
                    docScrollWidth: 390,
                    bodyScrollWidth: 390,
                    navVisible: true,
                    destinations: [
                      { destination: 'meta', visible: true, inViewport: true, width: 117, height: 44 },
                      { destination: 'match', visible: true, inViewport: true, width: 117, height: 44 },
                      { destination: 'more', visible: true, inViewport: true, width: 117, height: 44 }
                    ]
                  };
                },
                setViewportSize: async () => {},
                screenshot: async ({ path: p }) => { fs.writeFileSync(p, Buffer.from('PNG')); }
              };
            },
            close: async () => {}
          };
        },
        close: async () => {}
      })
    };

    const passReport = await runDeployedSmoke({
      siteUrl: baseUrl,
      qaDir,
      browserType: passingBrowserType
    });
    assert.equal(passReport.status, 'pass');
    assert.equal(passReport.passed, true);

    // 7. Fix 4: When browser launch/navigation/evaluate/screenshot throws, qa/deployed-smoke.json is still written with status "error".
    const throwingBrowserType = {
      launch: async () => {
        throw new Error('Synthetic browser launch failure');
      }
    };
    await assert.rejects(
      () => runDeployedSmoke({
        siteUrl: baseUrl,
        qaDir,
        browserType: throwingBrowserType
      }),
      /Synthetic browser launch failure/
    );
    const errorReport = JSON.parse(fs.readFileSync(path.join(qaDir, 'deployed-smoke.json'), 'utf8'));
    assert.equal(errorReport.status, 'error');
    assert.equal(errorReport.passed, false);
    assert.match(errorReport.reason, /Synthetic browser launch failure/);

    // 8. Gate CLI output writing via main(['--check-deploy-gate', ...]).
    const jobsFile = path.join(tmpBase, 'jobs.json');
    const artifactManifestFile = path.join(tmpBase, 'artifact-manifest.json');
    const ghOutputFile = path.join(tmpBase, 'github-output.txt');
    const ghSummaryFile = path.join(tmpBase, 'github-summary.md');
    fs.writeFileSync(
      jobsFile,
      JSON.stringify({
        jobs: [
          {
            run_id: 42737247875,
            head_sha: 'fda1ae265c720fcd26e5e136bbdbcb78776eb408',
            name: DEPLOY_JOB_NAME,
            conclusion: 'failure',
            steps: [
              {
                name: DEPLOY_STEP_NAME,
                conclusion: 'success',
                completed_at: '2026-11-10T01:42:25Z'
              }
            ]
          }
        ]
      }),
      'utf8'
    );
    fs.writeFileSync(
      artifactManifestFile,
      JSON.stringify({
        run_id: '42737247875',
        published_at: '2026-11-10T01:42:03+00:00',
        app: { version: '2.59.0' }
      }),
      'utf8'
    );
    const prevOut = process.env.GITHUB_OUTPUT;
    const prevSum = process.env.GITHUB_STEP_SUMMARY;
    process.env.GITHUB_OUTPUT = ghOutputFile;
    process.env.GITHUB_STEP_SUMMARY = ghSummaryFile;
    try {
      const exitCode = await main([
        '--check-deploy-gate',
        jobsFile,
        '--artifact-manifest',
        artifactManifestFile
      ]);
      assert.equal(exitCode, 0);
      const outputText = fs.readFileSync(ghOutputFile, 'utf8');
      assert.match(outputText, /^decision=run$/m);
      assert.match(outputText, /^deployed=true$/m);
      assert.match(outputText, /^head_sha=fda1ae265c720fcd26e5e136bbdbcb78776eb408$/m);
      assert.match(outputText, /^deployed_at=2026-11-10T01:42:25Z$/m);
      assert.match(outputText, /^expected_run_id=42737247875$/m);
      assert.match(outputText, /^expected_published_at=2026-11-10T01:42:03\+00:00$/m);
      assert.match(outputText, /^expected_version=2\.59\.0$/m);
      const summaryText = fs.readFileSync(ghSummaryFile, 'utf8');
      assert.match(summaryText, /deployment succeeded in run 42737247875/);
    } finally {
      if (prevOut === undefined) delete process.env.GITHUB_OUTPUT;
      else process.env.GITHUB_OUTPUT = prevOut;
      if (prevSum === undefined) delete process.env.GITHUB_STEP_SUMMARY;
      else process.env.GITHUB_STEP_SUMMARY = prevSum;
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(tmpBase, { recursive: true, force: true });
  }
});

test('deployed-smoke.yml workflow and SOURCE-MANIFEST.json match repository contracts', () => {
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
  assert.match(
    workflowText,
    /gh run download "\$\{\{\s*github\.event\.workflow_run\.id\s*\}\}" -n github-pages/
  );
  assert.match(workflowText, /artifact\.tar/);
  assert.match(workflowText, /--check-deploy-gate qa-trigger-jobs\.json --artifact-manifest qa-pages-artifact\/manifest\.json/);
  assert.match(workflowText, /needs:\s*gate/);
  assert.match(
    workflowText,
    /if:\s*\$\{\{\s*!cancelled\(\)\s*&&\s*\(github\.event_name\s*==\s*'workflow_dispatch'\s*\|\|\s*needs\.gate\.outputs\.deployed\s*==\s*'true'\)\s*\}\}/
  );
  assert.match(workflowText, /DEPLOY_HEAD_SHA:\s*\$\{\{\s*needs\.gate\.outputs\.head_sha\s*\}\}/);
  assert.match(workflowText, /DEPLOY_FINISHED_AT:\s*\$\{\{\s*needs\.gate\.outputs\.deployed_at\s*\}\}/);
  assert.match(workflowText, /EXPECTED_RUN_ID:\s*\$\{\{\s*needs\.gate\.outputs\.expected_run_id\s*\}\}/);
  assert.match(workflowText, /EXPECTED_PUBLISHED_AT:\s*\$\{\{\s*needs\.gate\.outputs\.expected_published_at\s*\}\}/);
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

  const sourceManifestBytes = fs.readFileSync(path.join(ROOT, 'SOURCE-MANIFEST.json'));
  const sourceManifest = JSON.parse(sourceManifestBytes.toString('utf8'));
  for (const relPath of [
    '.github/workflows/deployed-smoke.yml',
    'tests/browser_deployed_smoke.cjs',
    'tests/deployed_smoke.test.cjs'
  ]) {
    const raw = fs.readFileSync(path.join(ROOT, relPath));
    const lfBytes = Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
    const digest = crypto.createHash('sha256').update(lfBytes).digest('hex');
    assert.equal(
      sourceManifest.files[relPath],
      digest,
      'SOURCE-MANIFEST.json hash mismatch for ' + relPath
    );
  }
});
