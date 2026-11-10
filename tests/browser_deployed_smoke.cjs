'use strict';
/**
 * Read-only browser smoke suite for the deployed Predecessor Meta site (PRED-M1).
 *
 * Defaults to https://gn45db4tjc-ship-it.github.io/predecessor-meta/ and also supports a local
 * preview URL (http://127.0.0.1:... or http://localhost:...) with START_PREVIEW=1.
 *
 * Usage:
 *   node tests/browser_deployed_smoke.cjs
 *   node tests/browser_deployed_smoke.cjs --wait-for-manifest
 */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_SITE_URL = 'https://gn45db4tjc-ship-it.github.io/predecessor-meta/';
const PUBLIC_PAGES_ORIGIN = 'https://gn45db4tjc-ship-it.github.io';
const PUBLIC_PAGES_PREFIX = '/predecessor-meta/';
const DEPLOY_JOB_NAME = 'deploy';
const DEPLOY_STEP_NAME = 'Publish available-source updates and visible failure status';
const EXPECTED_ROLES = ['jungle', 'offlane', 'midlane', 'carry', 'support'];
const EXPECTED_MOBILE_DESTINATIONS = ['meta', 'match', 'more'];
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

function readRepoVersion(rootDir = ROOT) {
  const pyPath = path.join(rootDir, 'predecessor_meta.py');
  try {
    const text = fs.readFileSync(pyPath, 'utf8');
    const match = text.match(/^VERSION\s*=\s*['"]([^'"]+)['"]/m);
    if (match) return match[1].trim();
  } catch (_) {}
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'SOURCE-MANIFEST.json'), 'utf8'));
    if (manifest && typeof manifest.version === 'string' && manifest.version.trim()) {
      return manifest.version.trim();
    }
  } catch (_) {}
  return null;
}

function expectedShellCacheName(version) {
  if (typeof version !== 'string' || !version.trim()) {
    throw new Error('Version must be a non-empty string');
  }
  return 'predecessor-meta-shell-v' + version.trim().replace(/\./g, '-');
}

function parseShellCacheFromSwSource(swSource) {
  if (typeof swSource !== 'string') return null;
  const match = swSource.match(/\bSHELL_CACHE\s*=\s*['"]([^'"]+)['"]/);
  return match ? match[1] : null;
}

function extractManifestVersion(manifest) {
  if (!manifest || typeof manifest !== 'object') return null;
  if (manifest.app && typeof manifest.app.version === 'string' && manifest.app.version.trim()) {
    return manifest.app.version.trim();
  }
  if (typeof manifest.version === 'string' && manifest.version.trim()) {
    return manifest.version.trim();
  }
  return null;
}

function resolveSiteUrl(rawUrl) {
  const candidate = (rawUrl === undefined || rawUrl === null || String(rawUrl).trim() === '')
    ? DEFAULT_SITE_URL
    : String(rawUrl).trim();
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch (err) {
    throw new Error('Invalid SITE_URL "' + candidate + '": ' + err.message);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Unsupported protocol in SITE_URL "' + candidate + '" (expected http: or https:)');
  }
  const isLocal = (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
    (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost');
  const isPublicPages = parsed.origin === PUBLIC_PAGES_ORIGIN &&
    (parsed.pathname === '/predecessor-meta' || parsed.pathname.startsWith(PUBLIC_PAGES_PREFIX));
  if (!isLocal && !isPublicPages) {
    throw new Error(
      'Refusing to point deployed smoke suite at "' + candidate +
      '": only ' + DEFAULT_SITE_URL + ' or a local preview (127.0.0.1 / localhost) is allowed'
    );
  }
  if (!parsed.pathname.endsWith('/') && !/\.[a-z0-9]+$/i.test(parsed.pathname)) {
    parsed.pathname += '/';
  }
  return parsed.toString();
}

function classifySameOriginAsset(requestUrl, resourceType, siteUrl) {
  let parsed, base;
  try {
    base = new URL(siteUrl);
    parsed = new URL(requestUrl, base);
  } catch (_) {
    return null;
  }
  if (parsed.origin !== base.origin) return null;
  const pathname = parsed.pathname;
  const type = String(resourceType || '').toLowerCase();
  if (type === 'document' || pathname === base.pathname || pathname.endsWith('/index.html')) {
    return 'document';
  }
  if (pathname.endsWith('/manifest.json')) {
    return 'manifest';
  }
  if (pathname.includes('/bundles/') || (pathname.endsWith('.json') && !pathname.endsWith('/manifest.json'))) {
    return 'bundle';
  }
  if (type === 'script' || type === 'serviceworker' || pathname.endsWith('.js')) {
    return 'script';
  }
  if (type === 'stylesheet' || pathname.endsWith('.css')) {
    return 'stylesheet';
  }
  return null;
}

function evaluateNetworkCheck(info) {
  const {
    siteUrl,
    pageStatus,
    manifestStatus,
    manifestUrl,
    assets = [],
    nonGetRequests = []
  } = info || {};
  const reasons = [];
  if (nonGetRequests.length > 0) {
    reasons.push('Non-GET requests observed: ' + nonGetRequests.join(', '));
  }
  if (pageStatus !== 200) {
    reasons.push('Page ' + siteUrl + ' returned HTTP ' + (pageStatus ?? 'ERR') + ' (expected 200)');
  }
  if (manifestStatus !== 200) {
    reasons.push('Manifest ' + (manifestUrl || 'manifest.json') + ' returned HTTP ' + (manifestStatus ?? 'ERR') + ' (expected 200)');
  }
  const badAssets = assets.filter(a => a.status !== 200 || a.failed);
  if (badAssets.length > 0) {
    const desc = badAssets
      .slice(0, 6)
      .map(a => a.kind + ' ' + a.url + ' (' + (a.failed ? a.error || 'requestfailed' : 'HTTP ' + a.status) + ')')
      .join('; ');
    reasons.push(badAssets.length + ' same-origin asset(s) did not return 200: ' + desc);
  }
  const scripts = assets.filter(a => a.kind === 'script' && a.status === 200 && !a.failed);
  const stylesheets = assets.filter(a => a.kind === 'stylesheet' && a.status === 200 && !a.failed);
  const bundles = assets.filter(a => a.kind === 'bundle' && a.status === 200 && !a.failed);
  if (bundles.length === 0) {
    reasons.push('No same-origin data bundle returned HTTP 200');
  }
  const passed = reasons.length === 0;
  const reason = passed
    ? 'Page (200), manifest (200), and all ' + assets.length + ' same-origin script/stylesheet/bundle request(s) (' +
      scripts.length + ' script(s), ' + stylesheets.length + ' stylesheet(s), ' + bundles.length +
      ' data bundle(s)) returned HTTP 200 via GET.'
    : reasons.join('; ');
  return {
    id: 'network_assets_200',
    name: 'Page, manifest, and same-origin scripts, stylesheets, and data bundles return 200',
    status: passed ? 'pass' : 'fail',
    passed,
    reason,
    details: {
      page_status: pageStatus ?? null,
      manifest_status: manifestStatus ?? null,
      script_count: scripts.length,
      stylesheet_count: stylesheets.length,
      bundle_count: bundles.length,
      failed_assets: badAssets,
      non_get_requests: nonGetRequests
    }
  };
}

function evaluateConsoleAndPageErrorCheck(info) {
  const pageErrors = Array.isArray(info?.pageErrors) ? info.pageErrors : [];
  const consoleErrors = Array.isArray(info?.consoleErrors) ? info.consoleErrors : [];
  const reasons = [];
  if (pageErrors.length > 0) {
    reasons.push(pageErrors.length + ' uncaught page error(s): ' + pageErrors.slice(0, 3).join(' | '));
  }
  if (consoleErrors.length > 0) {
    reasons.push(consoleErrors.length + ' console.error message(s): ' + consoleErrors.slice(0, 3).join(' | '));
  }
  const passed = reasons.length === 0;
  return {
    id: 'no_page_or_console_errors',
    name: 'No uncaught page errors or console.error messages',
    status: passed ? 'pass' : 'fail',
    passed,
    reason: passed
      ? '0 uncaught page errors and 0 console.error messages.'
      : reasons.join('; '),
    details: {
      page_errors: pageErrors,
      console_errors: consoleErrors
    }
  };
}

function evaluateBootAndDataCheck(info) {
  const d = info || {};
  const reasons = [];
  if (!d.booted) {
    reasons.push(d.bootError || 'App did not finish booting (window.B unavailable or latestStatus.busy remained true)');
  }
  if ((d.startupNoteCount || 0) > 0) {
    reasons.push('Loading placeholder (.startup-note) is still present in #main');
  }
  if ((d.heroCount || 0) < 30) {
    reasons.push('Loaded bundle has too few heroes (' + (d.heroCount || 0) + ')');
  }
  const roles = Array.isArray(d.roles) ? d.roles : [];
  const missingRoles = EXPECTED_ROLES.filter(r => !roles.includes(r));
  if (missingRoles.length > 0) {
    reasons.push('Role picker missing role tab(s): ' + missingRoles.join(', '));
  }
  if (!d.bracketVisible || !d.activeBracket) {
    reasons.push('Bracket selector (#bracket) is missing or has no active bracket');
  }
  if (!d.heroPickerVisible || (d.heroOptionCount || 0) < 30 || (d.metaRowCount || 0) < 5) {
    reasons.push(
      'Hero picker incomplete (pickerVisible=' + Boolean(d.heroPickerVisible) +
      ', datalistOptions=' + (d.heroOptionCount || 0) +
      ', metaRows=' + (d.metaRowCount || 0) + ')'
    );
  }
  if (!d.hasRecommendation || !d.recommendationSample) {
    reasons.push('No hero/build recommendation rendered on page');
  }
  const freshnessText = String(d.freshnessText || '');
  const sourceLineText = String(d.sourceLineText || '');
  const hasDateLabel =
    freshnessText.includes('Bundle assembled ') &&
    freshnessText.includes('Statz fetched ') &&
    (sourceLineText.includes('fetched ') || sourceLineText.includes('cached ') || sourceLineText.includes('Dataset ')) &&
    Boolean(d.generatedAtValid);
  if (!hasDateLabel) {
    reasons.push(
      'Data-date label missing or incomplete (#freshness="' + freshnessText.slice(0, 80) +
      '", .source-line="' + sourceLineText.slice(0, 80) + '")'
    );
  }
  const passed = reasons.length === 0;
  return {
    id: 'boot_and_real_data',
    name: 'App boots past loading state and shows role picker, hero picker, recommendation, and data-date label',
    status: passed ? 'pass' : 'fail',
    passed,
    reason: passed
      ? 'Booted ' + d.activeBracket + ' bundle (' + d.heroCount + ' heroes); role picker (' +
        roles.length + ' roles), hero picker (' + d.heroOptionCount + ' options, ' + d.metaRowCount +
        ' rows), recommendation (' + d.recommendationSample + '), and data-date label (' +
        freshnessText + ') verified.'
      : reasons.join('; '),
    details: {
      booted: Boolean(d.booted),
      active_bracket: d.activeBracket || null,
      hero_count: d.heroCount || 0,
      roles,
      hero_option_count: d.heroOptionCount || 0,
      meta_row_count: d.metaRowCount || 0,
      recommendation_sample: d.recommendationSample || null,
      freshness_text: freshnessText || null,
      source_line_text: sourceLineText || null,
      generated_at: d.generatedAt || null
    }
  };
}

function evaluateVersionAgreementCheck(info) {
  const {
    pageVersion,
    metaTagVersion,
    sidebarVersion,
    appStateVersion,
    manifestVersion,
    cacheKeys = [],
    swSourceCacheName
  } = info || {};
  const reasons = [];
  if (!manifestVersion) {
    reasons.push('Deployed manifest is missing app.version');
  }
  if (!pageVersion) {
    reasons.push('Page did not expose APP_CONFIG.tool_version');
  }
  const visibleVersion = sidebarVersion || appStateVersion || metaTagVersion || null;
  if (!visibleVersion) {
    reasons.push('Page did not display a visible release version in .sidebar-foot, [data-app-state], or meta[name="predecessor-app-version"]');
  }
  if (pageVersion && manifestVersion && pageVersion !== manifestVersion) {
    reasons.push('Page APP_CONFIG.tool_version (' + pageVersion + ') !== manifest app.version (' + manifestVersion + ')');
  }
  if (visibleVersion && manifestVersion && visibleVersion !== manifestVersion) {
    reasons.push('Visible page version (' + visibleVersion + ') !== manifest app.version (' + manifestVersion + ')');
  }
  if (metaTagVersion && manifestVersion && metaTagVersion !== manifestVersion) {
    reasons.push('meta[name="predecessor-app-version"] (' + metaTagVersion + ') !== manifest app.version (' + manifestVersion + ')');
  }
  const targetVersion = manifestVersion || pageVersion || visibleVersion;
  const expectedCache = targetVersion ? expectedShellCacheName(targetVersion) : null;
  const shellCaches = cacheKeys.filter(k => k.startsWith('predecessor-meta-shell-v'));
  if (!expectedCache) {
    reasons.push('Could not compute expected service worker shell cache name without a version');
  } else {
    if (swSourceCacheName && swSourceCacheName !== expectedCache) {
      reasons.push('sw.js SHELL_CACHE (' + swSourceCacheName + ') !== expected (' + expectedCache + ')');
    }
    if (!cacheKeys.includes(expectedCache)) {
      reasons.push(
        'Browser CacheStorage keys [' + cacheKeys.join(', ') + '] do not include expected shell cache ' + expectedCache
      );
    }
  }
  const passed = reasons.length === 0;
  return {
    id: 'release_version_agreement',
    name: 'Page release version matches deployed manifest and service worker cache name',
    status: passed ? 'pass' : 'fail',
    passed,
    reason: passed
      ? 'Page version ' + pageVersion + ' (visible v' + visibleVersion + ') matches deployed manifest version ' +
        manifestVersion + ' and service worker cache ' + expectedCache + '.'
      : reasons.join('; '),
    details: {
      page_version: pageVersion || null,
      visible_version: visibleVersion || null,
      meta_tag_version: metaTagVersion || null,
      sidebar_version: sidebarVersion || null,
      app_state_version: appStateVersion || null,
      manifest_version: manifestVersion || null,
      expected_shell_cache: expectedCache,
      sw_source_shell_cache: swSourceCacheName || null,
      browser_shell_caches: shellCaches,
      cache_keys: cacheKeys
    }
  };
}

function evaluateMobileLayoutCheck(info) {
  const d = info || {};
  const reasons = [];
  const innerWidth = Number(d.innerWidth || 0);
  const innerHeight = Number(d.innerHeight || 0);
  const docScrollWidth = Number(d.docScrollWidth || 0);
  const bodyScrollWidth = Number(d.bodyScrollWidth || 0);
  const maxScrollWidth = Math.max(docScrollWidth, bodyScrollWidth);
  if (innerWidth !== 390 || innerHeight !== 844) {
    reasons.push('Viewport is ' + innerWidth + 'x' + innerHeight + ' (expected 390x844)');
  }
  if (maxScrollWidth > innerWidth + 1) {
    reasons.push('Horizontal scroll detected at 390x844: scrollWidth=' + maxScrollWidth + 'px > innerWidth=' + innerWidth + 'px');
  }
  if (!d.navVisible) {
    reasons.push('Main mobile navigation (#mobile-navigation) is not visible at 390x844');
  }
  const destinations = Array.isArray(d.destinations) ? d.destinations : [];
  const visibleDestNames = destinations.filter(item => item.visible && item.inViewport).map(item => item.destination);
  const missingDest = EXPECTED_MOBILE_DESTINATIONS.filter(name => !visibleDestNames.includes(name));
  if (missingDest.length > 0) {
    reasons.push('Mobile navigation destination(s) missing or off-screen at 390x844: ' + missingDest.join(', '));
  }
  const passed = reasons.length === 0;
  return {
    id: 'mobile_390x844_layout_and_navigation',
    name: 'At 390x844 no horizontal scroll and main navigation is visible',
    status: passed ? 'pass' : 'fail',
    passed,
    reason: passed
      ? 'At 390x844 scrollWidth is ' + maxScrollWidth + 'px (innerWidth ' + innerWidth +
        'px) with no horizontal scroll, and #mobile-navigation (' + visibleDestNames.join(', ') +
        ') is visible in the viewport.'
      : reasons.join('; '),
    details: {
      viewport: { width: innerWidth, height: innerHeight },
      doc_scroll_width: docScrollWidth,
      body_scroll_width: bodyScrollWidth,
      nav_visible: Boolean(d.navVisible),
      nav_rect: d.navRect || null,
      destinations
    }
  };
}

function buildSmokeReport({ siteUrl, checkedAt, checks, version, screenshot, headSha, deployFinishedAt }) {
  const list = Array.isArray(checks) ? checks : [];
  const passedCount = list.filter(c => c && c.status === 'pass' && c.passed === true).length;
  const failedCount = list.length - passedCount;
  const allPassed = list.length > 0 && failedCount === 0;
  const report = {
    suite: 'deployed-smoke',
    site_url: siteUrl,
    checked_at: checkedAt || new Date().toISOString(),
    status: allPassed ? 'pass' : 'fail',
    passed: allPassed,
    summary: {
      total: list.length,
      passed: passedCount,
      failed: failedCount
    },
    version: {
      page: version?.page || null,
      manifest: version?.manifest || null,
      service_worker_cache: version?.serviceWorkerCache || null
    },
    screenshot: screenshot || 'qa/deployed-smoke.png',
    checks: list
  };
  if (headSha || deployFinishedAt) {
    report.deployment = {
      head_sha: headSha || null,
      deploy_finished_at: deployFinishedAt || null
    };
  }
  return report;
}

function evaluateDeployGate(jobsPayload, options = {}) {
  const jobs = Array.isArray(jobsPayload?.jobs) ? jobsPayload.jobs : [];
  const inferredRunId = jobs.find(j => j && j.run_id !== undefined && j.run_id !== null)?.run_id;
  const runId = String(options.runId ?? inferredRunId ?? 'unknown');
  const fallbackHeadSha = options.headSha || jobs.find(j => j && j.head_sha)?.head_sha || null;
  const deployJob = jobs.find(j => j && j.name === DEPLOY_JOB_NAME);
  if (!deployJob) {
    return {
      decision: 'skip',
      deployed: false,
      runId,
      headSha: fallbackHeadSha,
      deployedAt: null,
      stepConclusion: null,
      summary: 'no deployment in run ' + runId + ', nothing to check'
    };
  }
  const steps = Array.isArray(deployJob.steps) ? deployJob.steps : [];
  const deployStep = steps.find(s => s && s.name === DEPLOY_STEP_NAME);
  const headSha = deployJob.head_sha || fallbackHeadSha;
  if (deployStep && deployStep.conclusion === 'success') {
    const deployedAt = deployStep.completed_at || deployJob.completed_at || null;
    return {
      decision: 'run',
      deployed: true,
      runId,
      headSha,
      deployedAt,
      stepConclusion: 'success',
      summary: 'deployment succeeded in run ' + runId + (deployedAt ? ' at ' + deployedAt : '')
    };
  }
  return {
    decision: 'skip',
    deployed: false,
    runId,
    headSha,
    deployedAt: null,
    stepConclusion: deployStep?.conclusion || deployJob.conclusion || null,
    summary: 'no deployment in run ' + runId + ', nothing to check'
  };
}

function isManifestVersionReady(manifest, { expectedVersion = null, initialVersion = null } = {}) {
  const deployedVersion = extractManifestVersion(manifest);
  if (!deployedVersion) {
    return { ready: false, version: null, reason: 'Manifest has no app.version' };
  }
  if (expectedVersion && deployedVersion === expectedVersion) {
    return {
      ready: true,
      version: deployedVersion,
      reason: 'Deployed manifest version ' + deployedVersion + ' matches published version ' + expectedVersion
    };
  }
  if (initialVersion && deployedVersion !== initialVersion) {
    return {
      ready: true,
      version: deployedVersion,
      reason: 'Deployed manifest version changed from ' + initialVersion + ' to ' + deployedVersion
    };
  }
  if (!expectedVersion && !initialVersion) {
    return {
      ready: true,
      version: deployedVersion,
      reason: 'Deployed manifest version ' + deployedVersion + ' is available'
    };
  }
  return {
    ready: false,
    version: deployedVersion,
    reason: 'Deployed manifest version is ' + deployedVersion +
      (expectedVersion ? ' (waiting for ' + expectedVersion + ' or version change)' : ' (waiting for change from ' + initialVersion + ')')
  };
}

async function fetchUrl(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      signal: controller.signal
    });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text };
  } catch (error) {
    return { ok: false, status: null, text: '', error: String(error.message || error) };
  } finally {
    clearTimeout(timer);
  }
}

async function waitForDeployedManifest(options = {}) {
  const siteUrl = resolveSiteUrl(options.siteUrl || process.env.SITE_URL || process.env.PREVIEW_URL || DEFAULT_SITE_URL);
  const expectedVersion = options.expectedVersion !== undefined
    ? options.expectedVersion
    : (process.env.EXPECTED_VERSION || readRepoVersion());
  const headSha = options.headSha !== undefined ? options.headSha : (process.env.DEPLOY_HEAD_SHA || null);
  const deployFinishedAt = options.deployFinishedAt !== undefined
    ? options.deployFinishedAt
    : (process.env.DEPLOY_FINISHED_AT || null);
  const timeoutMs = Number(options.timeoutMs ?? (Number(process.env.WAIT_TIMEOUT_SECONDS || 600) * 1000));
  const intervalMs = Number(options.intervalMs ?? (Number(process.env.WAIT_INTERVAL_SECONDS || 15) * 1000));
  const fetchFn = options.fetchFn || fetchUrl;
  const sleepFn = options.sleepFn || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const nowFn = options.nowFn || (() => Date.now());

  const manifestBaseUrl = new URL('manifest.json', siteUrl).toString();
  const nowMs = nowFn();
  const parsedDeployMs = deployFinishedAt ? Date.parse(deployFinishedAt) : NaN;
  const startTime = (Number.isFinite(parsedDeployMs) && parsedDeployMs <= nowMs && (nowMs - parsedDeployMs) < timeoutMs)
    ? parsedDeployMs
    : nowMs;
  let initialVersion = options.initialVersion || process.env.PREVIOUS_VERSION || null;
  let attempts = 0;
  let lastReason = 'No manifest response yet';
  let lastVersion = null;

  while (true) {
    attempts += 1;
    const sep = manifestBaseUrl.includes('?') ? '&' : '?';
    const probeUrl = manifestBaseUrl + sep + 'deployed-smoke=' + nowFn();
    const res = await fetchFn(probeUrl);
    if (res && res.status === 200 && res.text) {
      try {
        const manifest = JSON.parse(res.text);
        const ver = extractManifestVersion(manifest);
        if (ver && !initialVersion) {
          initialVersion = ver;
        }
        const check = isManifestVersionReady(manifest, { expectedVersion, initialVersion });
        lastVersion = check.version;
        lastReason = check.reason;
        if (check.ready) {
          return {
            ok: true,
            version: check.version,
            attempts,
            elapsedMs: nowFn() - startTime,
            headSha,
            deployFinishedAt,
            reason: check.reason,
            manifest
          };
        }
      } catch (err) {
        lastReason = 'Manifest JSON parse error: ' + err.message;
      }
    } else {
      lastReason = 'Manifest GET returned ' + (res?.status ?? (res?.error || 'ERR'));
    }

    const elapsed = nowFn() - startTime;
    if (elapsed >= timeoutMs) {
      throw new Error(
        'Timed out after ' + Math.round(elapsed / 1000) + 's (' + attempts + ' attempts) waiting for ' +
        manifestBaseUrl + ': ' + lastReason + (lastVersion ? ' (last version: ' + lastVersion + ')' : '')
      );
    }
    await sleepFn(Math.min(intervalMs, Math.max(1, timeoutMs - elapsed)));
  }
}

function startLocalPreviewServer(siteUrl, previewDir) {
  const parsed = new URL(siteUrl);
  const rootDir = path.resolve(previewDir);
  if (!fs.existsSync(path.join(rootDir, 'index.html'))) {
    const py = process.env.PYTHON_EXE || 'python';
    const staged = spawnSync(py, ['-B', path.join('tests', 'stage_preview.py'), '--output', rootDir], {
      cwd: ROOT,
      encoding: 'utf8'
    });
    if (staged.status !== 0) {
      throw new Error('Preview staging failed: ' + (staged.stderr || staged.stdout));
    }
  }
  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Method not allowed');
      return;
    }
    const reqUrl = new URL(req.url, parsed.origin);
    let relPath = decodeURIComponent(reqUrl.pathname);
    if (parsed.pathname !== '/' && relPath.startsWith(parsed.pathname)) {
      relPath = relPath.slice(parsed.pathname.length);
    }
    relPath = relPath.replace(/^\/+/, '') || 'index.html';
    const filePath = path.resolve(rootDir, relPath);
    if (!filePath.startsWith(rootDir) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(fs.readFileSync(filePath));
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(Number(parsed.port || 80), parsed.hostname, () => resolve(server));
  });
}

async function runDeployedSmoke(options = {}) {
  const siteUrl = resolveSiteUrl(options.siteUrl || process.env.SITE_URL || process.env.PREVIEW_URL || DEFAULT_SITE_URL);
  const qaDir = path.resolve(options.qaDir || path.join(ROOT, 'qa'));
  const reportPath = path.join(qaDir, 'deployed-smoke.json');
  const screenshotPath = path.join(qaDir, 'deployed-smoke.png');
  fs.mkdirSync(qaDir, { recursive: true });

  const playwright = require(process.env.PLAYWRIGHT_PATH || 'playwright');
  const engineName = (process.env.BROWSER_ENGINE || 'chromium').toLowerCase();
  const browserType = playwright[engineName];
  if (!browserType) {
    throw new Error('Unknown BROWSER_ENGINE: ' + engineName);
  }
  const channel = process.env.BROWSER_CHANNEL || (process.env.CI ? 'chrome' : 'msedge');
  const launchOptions = engineName === 'webkit' ? { headless: true } : { channel, headless: true };

  let previewServer = null;
  if (process.env.START_PREVIEW === '1') {
    const previewDir = path.resolve(ROOT, process.env.PREVIEW_DIR || path.join('qa', 'static-preview'));
    previewServer = await startLocalPreviewServer(siteUrl, previewDir);
  }

  const manifestUrl = new URL('manifest.json', siteUrl).toString();
  const swUrl = new URL('sw.js', siteUrl).toString();
  const manifestProbe = await fetchUrl(manifestUrl + (manifestUrl.includes('?') ? '&' : '?') + 'smoke=' + Date.now());
  let manifestJson = null;
  if (manifestProbe.status === 200 && manifestProbe.text) {
    try {
      manifestJson = JSON.parse(manifestProbe.text);
    } catch (_) {}
  }
  const manifestVersion = extractManifestVersion(manifestJson);

  const swProbe = await fetchUrl(swUrl + (swUrl.includes('?') ? '&' : '?') + 'smoke=' + Date.now());
  const swSourceCacheName = swProbe.status === 200 ? parseShellCacheFromSwSource(swProbe.text) : null;

  const browser = await browserType.launch(launchOptions);
  const pageErrors = [];
  const consoleErrors = [];
  const nonGetRequests = [];
  const trackedAssetsByUrl = new Map();
  let pageStatus = null;
  let manifestObservedStatus = manifestProbe.status;
  let bootInfo = { booted: false, bootError: 'Did not run boot check' };
  let versionInfo = {
    pageVersion: null,
    metaTagVersion: null,
    sidebarVersion: null,
    appStateVersion: null,
    manifestVersion,
    cacheKeys: [],
    swSourceCacheName
  };
  let mobileInfo = {
    innerWidth: 0,
    innerHeight: 0,
    docScrollWidth: 0,
    bodyScrollWidth: 0,
    navVisible: false,
    destinations: []
  };

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      serviceWorkers: 'allow'
    });
    const page = await context.newPage();

    page.on('pageerror', err => {
      pageErrors.push(String(err && err.message ? err.message : err));
    });
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    context.on('request', req => {
      const method = req.method().toUpperCase();
      if (method !== 'GET') {
        nonGetRequests.push(method + ' ' + req.url());
      }
    });
    context.on('response', res => {
      const req = res.request();
      const url = res.url();
      const kind = classifySameOriginAsset(url, req.resourceType(), siteUrl);
      if (!kind) return;
      if (kind === 'document' && pageStatus === null) {
        pageStatus = res.status();
        return;
      }
      if (kind === 'manifest') {
        manifestObservedStatus = res.status();
        return;
      }
      if (kind === 'script' || kind === 'stylesheet' || kind === 'bundle') {
        trackedAssetsByUrl.set(url, {
          kind,
          url,
          status: res.status(),
          failed: false
        });
      }
    });
    context.on('requestfailed', req => {
      const url = req.url();
      const kind = classifySameOriginAsset(url, req.resourceType(), siteUrl);
      if (!kind) return;
      if (kind === 'script' || kind === 'stylesheet' || kind === 'bundle') {
        trackedAssetsByUrl.set(url, {
          kind,
          url,
          status: null,
          failed: true,
          error: req.failure()?.errorText || 'requestfailed'
        });
      }
    });

    const mainResponse = await page.goto(siteUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (mainResponse) {
      pageStatus = mainResponse.status();
    }

    const shellPresent = pageStatus === 200 && await page.evaluate(() => {
      return Boolean(document.getElementById('main')) && typeof APP_CONFIG === 'object' && !!APP_CONFIG;
    });

    if (!shellPresent) {
      bootInfo = {
        booted: false,
        bootError: 'App shell did not load from ' + siteUrl + ' (HTTP ' + (pageStatus ?? 'ERR') + ')'
      };
    } else {
      try {
        await page.waitForFunction(
          () => typeof B !== 'undefined' && !!B && typeof latestStatus !== 'undefined' && !latestStatus.busy,
          null,
          { timeout: 60000 }
        );
      } catch (err) {
        bootInfo.bootError = 'Timed out waiting for bundle boot: ' + String(err.message || err).split('\n')[0];
      }

      // Wait briefly for the service worker to finish activating and populating its shell cache.
      try {
        await page.waitForFunction(
          async () => {
            if (!('serviceWorker' in navigator) || !('caches' in window)) return false;
            const keys = await caches.keys();
            return keys.some(k => k.startsWith('predecessor-meta-shell-v'));
          },
          null,
          { timeout: 30000 }
        );
      } catch (_) {}

      bootInfo = await page.evaluate(async () => {
        const booted = typeof B !== 'undefined' && !!B && typeof latestStatus !== 'undefined' && !latestStatus.busy;
        const startupNoteCount = document.querySelectorAll('#main .startup-note').length;
        const roles = [...document.querySelectorAll('[role="tablist"][aria-label="Role"] [data-meta-role]')]
          .map(el => el.getAttribute('data-meta-role'))
          .filter(Boolean);
        const bracketEl = document.getElementById('bracket');
        const bracketBox = bracketEl ? bracketEl.getBoundingClientRect() : null;
        const bracketVisible = Boolean(bracketBox && bracketBox.width > 0 && bracketBox.height > 0);
        const activeBracket = (typeof B !== 'undefined' && B?.bracket?.segment) || (bracketEl ? bracketEl.value : null);

        const heroJump = document.getElementById('hero-jump') || document.getElementById('hero-search');
        const heroJumpBox = heroJump ? heroJump.getBoundingClientRect() : null;
        const heroPickerVisible = Boolean(heroJumpBox && heroJumpBox.width > 0 && heroJumpBox.height > 0);
        const heroOptionCount = document.querySelectorAll('#hero-list option').length;
        const metaRows = [...document.querySelectorAll('#main .meta-table tbody tr')];
        const metaRowCount = metaRows.length;

        let recommendationSample = null;
        const firstRow = metaRows[0];
        if (firstRow) {
          const heroCell = firstRow.querySelector('[data-hero]');
          const slug = heroCell ? heroCell.getAttribute('data-hero') : '';
          const decisionEl = firstRow.querySelector('[data-meta-decision], [data-calculated-tier], .tier');
          const heroName = (slug && typeof B !== 'undefined' && B?.heroes?.[slug]?.name) || slug || (heroCell ? heroCell.textContent.trim() : '');
          const decisionText = decisionEl ? decisionEl.textContent.trim().replace(/\s+/g, ' ') : '';
          if (heroName && decisionText) {
            recommendationSample = heroName + ' (' + decisionText + ')';
          }
        }

        // Also verify hero build recommendation rendering by opening a hero briefly if available.
        let buildItemCount = 0;
        if (booted && typeof openHero === 'function' && typeof setPrimaryDestination === 'function') {
          const firstSlug = firstRow?.querySelector('[data-hero]')?.getAttribute('data-hero') || 'steel';
          const role = (typeof activeMetaRole !== 'undefined' && activeMetaRole) || 'jungle';
          openHero(firstSlug, role);
          const deadline = Date.now() + 15000;
          while (Date.now() < deadline) {
            if (typeof guideGate === 'function' && guideGate() === '') break;
            await new Promise(r => setTimeout(r, 100));
          }
          buildItemCount = document.querySelectorAll('#hero-sec-builds .build-path li').length;
          if (buildItemCount > 0 && recommendationSample) {
            recommendationSample += ', ' + buildItemCount + '-item build path';
          }
          setPrimaryDestination('meta');
        }

        const freshnessEl = document.getElementById('freshness');
        const sourceLineEl = document.querySelector('.source-line');
        const freshnessText = freshnessEl ? freshnessEl.textContent.trim().replace(/\s+/g, ' ') : '';
        const sourceLineText = sourceLineEl ? sourceLineEl.textContent.trim().replace(/\s+/g, ' ') : '';
        const generatedAt = (typeof B !== 'undefined' && B?.generated_at) || null;
        const generatedAtValid = Boolean(generatedAt && !Number.isNaN(Date.parse(generatedAt)));
        const heroCount = (typeof B !== 'undefined' && B?.heroes)
          ? (Array.isArray(B.heroes) ? B.heroes.length : Object.keys(B.heroes).length)
          : 0;

        return {
          booted,
          startupNoteCount,
          roles,
          bracketVisible,
          activeBracket,
          heroCount,
          heroPickerVisible,
          heroOptionCount,
          metaRowCount,
          hasRecommendation: Boolean(recommendationSample),
          recommendationSample,
          buildItemCount,
          freshnessText,
          sourceLineText,
          generatedAt,
          generatedAtValid
        };
      });

      versionInfo = await page.evaluate(async ({ manifestVersion, swSourceCacheName }) => {
        const pageVersion = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG?.tool_version) || null;
        const metaEl = document.querySelector('meta[name="predecessor-app-version"]');
        const metaTagVersion = metaEl ? metaEl.getAttribute('content')?.trim() : null;
        const sidebarEl = document.querySelector('.sidebar-foot');
        const sidebarText = sidebarEl ? sidebarEl.textContent.trim() : '';
        const sidebarMatch = sidebarText.match(/\bv(\d+\.\d+\.\d+)\b/);
        const sidebarVersion = sidebarMatch ? sidebarMatch[1] : null;
        const stateEl = document.querySelector('[data-app-state]');
        const stateText = stateEl ? stateEl.textContent.trim() : (typeof appStateText === 'function' ? appStateText() : '');
        const stateMatch = String(stateText || '').match(/\bv(\d+\.\d+\.\d+)\b/);
        const appStateVersion = stateMatch ? stateMatch[1] : null;
        const cacheKeys = ('caches' in window) ? (await caches.keys()).sort() : [];
        return {
          pageVersion,
          metaTagVersion,
          sidebarVersion,
          appStateVersion,
          manifestVersion,
          cacheKeys,
          swSourceCacheName
        };
      }, { manifestVersion, swSourceCacheName });
    }

    // Check 5: At 390 x 844 the page has no horizontal scroll, and the main navigation is visible.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    mobileInfo = await page.evaluate(() => {
      const innerWidth = window.innerWidth;
      const innerHeight = window.innerHeight;
      const docScrollWidth = document.documentElement ? document.documentElement.scrollWidth : 0;
      const bodyScrollWidth = document.body ? document.body.scrollWidth : 0;
      const nav = document.getElementById('mobile-navigation');
      let navVisible = false;
      let navRect = null;
      if (nav) {
        const style = window.getComputedStyle(nav);
        const rect = nav.getBoundingClientRect();
        navRect = {
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        };
        navVisible =
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          Number(style.opacity || '1') > 0 &&
          rect.width > 0 &&
          rect.height > 0 &&
          rect.left >= -1 &&
          rect.right <= innerWidth + 1 &&
          rect.top >= 0 &&
          rect.bottom <= innerHeight + 1;
      }
      const destinations = [...document.querySelectorAll('#mobile-navigation [data-destination]')].map(btn => {
        const style = window.getComputedStyle(btn);
        const rect = btn.getBoundingClientRect();
        const visible = style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height >= 44;
        const inViewport = rect.left >= -1 && rect.right <= innerWidth + 1 && rect.top >= 0 && rect.bottom <= innerHeight + 1;
        return {
          destination: btn.getAttribute('data-destination'),
          visible,
          inViewport,
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        };
      });
      return {
        innerWidth,
        innerHeight,
        docScrollWidth,
        bodyScrollWidth,
        navVisible,
        navRect,
        destinations
      };
    });

    // Capture one full-page screenshot to qa/deployed-smoke.png
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await context.close();
  } finally {
    await browser.close();
    if (previewServer) {
      await new Promise(resolve => previewServer.close(resolve));
    }
  }

  const effectiveManifestStatus =
    manifestObservedStatus !== null && manifestObservedStatus !== undefined
      ? manifestObservedStatus
      : manifestProbe.status;

  const checks = [
    evaluateNetworkCheck({
      siteUrl,
      pageStatus,
      manifestStatus: effectiveManifestStatus,
      manifestUrl,
      assets: [...trackedAssetsByUrl.values()],
      nonGetRequests
    }),
    evaluateConsoleAndPageErrorCheck({
      pageErrors,
      consoleErrors
    }),
    evaluateBootAndDataCheck(bootInfo),
    evaluateVersionAgreementCheck(versionInfo),
    evaluateMobileLayoutCheck(mobileInfo)
  ];

  const expectedCache = versionInfo.manifestVersion
    ? expectedShellCacheName(versionInfo.manifestVersion)
    : null;
  const matchedCache = expectedCache && versionInfo.cacheKeys.includes(expectedCache)
    ? expectedCache
    : (versionInfo.cacheKeys.find(k => k.startsWith('predecessor-meta-shell-v')) || versionInfo.swSourceCacheName || null);

  const report = buildSmokeReport({
    siteUrl,
    checkedAt: new Date().toISOString(),
    checks,
    version: {
      page: versionInfo.pageVersion || versionInfo.sidebarVersion || versionInfo.metaTagVersion || null,
      manifest: versionInfo.manifestVersion || null,
      serviceWorkerCache: matchedCache
    },
    screenshot: 'qa/deployed-smoke.png',
    headSha: options.headSha ?? process.env.DEPLOY_HEAD_SHA ?? null,
    deployFinishedAt: options.deployFinishedAt ?? process.env.DEPLOY_FINISHED_AT ?? null
  });

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  return report;
}

async function main(argv = process.argv.slice(2)) {
  const gateIdx = argv.indexOf('--check-deploy-gate');
  if (gateIdx !== -1) {
    const fileArg = argv[gateIdx + 1];
    if (!fileArg) {
      throw new Error('--check-deploy-gate requires a path to a jobs JSON file');
    }
    const payload = JSON.parse(fs.readFileSync(path.resolve(fileArg), 'utf8'));
    const gate = evaluateDeployGate(payload, {
      runId: process.env.WORKFLOW_RUN_ID,
      headSha: process.env.WORKFLOW_RUN_HEAD_SHA
    });
    if (process.env.GITHUB_OUTPUT) {
      const lines = [
        'decision=' + gate.decision,
        'deployed=' + String(gate.deployed),
        'head_sha=' + (gate.headSha || ''),
        'deployed_at=' + (gate.deployedAt || '')
      ];
      fs.appendFileSync(process.env.GITHUB_OUTPUT, lines.join('\n') + '\n', 'utf8');
    }
    if (process.env.GITHUB_STEP_SUMMARY) {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, gate.summary + '\n', 'utf8');
    }
    console.log(gate.summary);
    return 0;
  }

  if (argv.includes('--wait-for-manifest') || process.env.WAIT_FOR_MANIFEST === '1') {
    const result = await waitForDeployedManifest();
    console.log(JSON.stringify({
      action: 'wait-for-manifest',
      ok: result.ok,
      version: result.version,
      attempts: result.attempts,
      elapsed_ms: result.elapsedMs,
      head_sha: result.headSha,
      deploy_finished_at: result.deployFinishedAt,
      reason: result.reason
    }));
    return 0;
  }

  const report = await runDeployedSmoke();
  for (const check of report.checks) {
    console.log((check.passed ? 'PASS' : 'FAIL') + ' [' + check.id + '] ' + check.reason);
  }
  console.log(JSON.stringify({
    suite: report.suite,
    site_url: report.site_url,
    status: report.status,
    summary: report.summary,
    version: report.version,
    screenshot: report.screenshot
  }));
  return report.passed ? 0 : 1;
}

if (require.main === module) {
  main().then(
    code => process.exit(code),
    err => {
      console.error('FAIL [deployed-smoke] ' + (err && err.stack ? err.stack : err));
      process.exit(1);
    }
  );
}

module.exports = {
  DEFAULT_SITE_URL,
  DEPLOY_JOB_NAME,
  DEPLOY_STEP_NAME,
  EXPECTED_ROLES,
  EXPECTED_MOBILE_DESTINATIONS,
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
  runDeployedSmoke
};
