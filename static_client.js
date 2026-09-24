// Hosting adapter. Injected before the existing startup; the desktop engine and UI stay intact.
if (APP_CONFIG.mode === 'static') {
  const site = {manifest: null, sequence: 0, controller: null, originalBundle: null, loadedEntry: null, lastCheck: 0};
  let pendingInstallPrompt = null;
  // Capture the pristine shell before the UI renders any visitor selections into it.
  const exportShell = document.documentElement.cloneNode(true);
  const originalChrome = chrome;
  const originalRender = render;
  const originalAlerts = alerts;
  const oldDataView = dataView;
  const allowed = ['gold', 'bronze', 'silver', 'platinum', 'diamond', 'paragon'];
  const baseURL = new URL('.', location.href);

  function installedApp() {
    return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  }
  function syncInstallButton() {
    const button = $('#install-app');
    if (button) button.classList.toggle('hide', installedApp());
  }
  async function installSharedApp() {
    if (installedApp()) return toast('The app is already installed on this device.');
    if (pendingInstallPrompt) {
      const prompt = pendingInstallPrompt; pendingInstallPrompt = null;
      await prompt.prompt();
      const choice = await prompt.userChoice;
      syncInstallButton();
      return toast(choice.outcome === 'accepted' ? 'App installed. Open it from your apps or Start menu.' : 'Installation cancelled.');
    }
    const apple = /iphone|ipad|ipod/i.test(navigator.userAgent);
    detail('Install this app', apple
      ? '<p>In Safari, tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</p><p>The app will open from its own icon and keep using the same daily cloud data.</p>'
      : '<p>Open your browser menu and choose <strong>Install Predecessor Meta & Planning</strong> or <strong>Apps → Install this site as an app</strong>.</p><p>After installation it opens in its own window and keeps using the same daily cloud data.</p>');
  }
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); pendingInstallPrompt = event; syncInstallButton(); });
  window.addEventListener('appinstalled', () => { pendingInstallPrompt = null; syncInstallButton(); toast('App installed.'); });
  const appUpdate = {latest: null, checked: 0, busy: false, applying: false, message: 'Check for interface updates separately from game data.'};
  const releaseVersion = value => typeof value === 'string' && /^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(value) ? value : null;
  const newerRelease = value => {
    if (!releaseVersion(value) || !releaseVersion(APP_CONFIG.tool_version)) return false;
    const current = APP_CONFIG.tool_version.split('.').map(Number), next = value.split('.').map(Number);
    for (let i = 0; i < 3; i++) if (next[i] !== current[i]) return next[i] > current[i];
    return false;
  };
  function appUpdateHTML() {
    return '<section class="panel" aria-label="App updates"><h2>App updates</h2><p>Running v' + esc(APP_CONFIG.tool_version) + '</p><p data-app-state></p><div class="actions"><button data-app-check>Check app update</button><button class="primary hide" data-app-apply>Update app</button></div><p class="muted">Updates keep your saved picks and builds. Game data updates separately.</p></section>';
  }
  const oldMore = moreView;
  moreView = function() { return oldMore() + appUpdateHTML(); };
  function renderAppUpdate() {
    let banner = $('#app-update-notice');
    if (!banner) {
      banner = document.createElement('section'); banner.id = 'app-update-notice';
      banner.className = 'panel app-update-notice hide'; banner.setAttribute('aria-label', 'App update available');
      banner.innerHTML = '<p data-app-state role="status" aria-live="polite"></p><button class="primary" data-app-apply>Update app</button>';
      $('#main').before(banner);
    }
    banner.classList.toggle('hide', !appUpdate.latest);
    document.querySelectorAll('[data-app-state]').forEach(node => {
      if (node.textContent !== appUpdate.message) node.textContent = appUpdate.message;
    });
    document.querySelectorAll('[data-app-check]').forEach(button => {button.disabled = appUpdate.busy || appUpdate.applying; button.textContent = appUpdate.busy ? 'Checking app…' : 'Check app update';});
    document.querySelectorAll('[data-app-apply]').forEach(button => {button.classList.toggle('hide', !appUpdate.latest); button.disabled = appUpdate.applying; button.textContent = appUpdate.applying ? 'Opening update…' : 'Update app';});
  }
  function observeAppRelease(manifest, response) {
    if (response.headers.get('X-Predecessor-Cache') === 'offline') {
      appUpdate.message = 'Offline · running v' + APP_CONFIG.tool_version + '. App updates cannot be verified until connected.';
      renderAppUpdate(); return false;
    }
    const version = releaseVersion(manifest?.app?.version);
    if (!version) return false;
    appUpdate.checked = Date.now(); appUpdate.latest = newerRelease(version) ? version : null;
    appUpdate.message = appUpdate.latest ? 'App v' + version + ' is available. Update when ready; your saved picks and builds stay.' : version === APP_CONFIG.tool_version ? 'You are running the latest app · v' + APP_CONFIG.tool_version + '.' : 'Running v' + APP_CONFIG.tool_version + ' · the site currently publishes v' + version + '.';
    renderAppUpdate(); return true;
  }
  const workerRegistration = 'serviceWorker' in navigator
    ? navigator.serviceWorker.register(new URL('sw.js', baseURL), {scope: './', updateViaCache: 'none'}).catch(() => null)
    : Promise.resolve(null);
  async function checkAppRelease(force = false) {
    if (appUpdate.busy || appUpdate.applying || (!force && Date.now() - appUpdate.checked < 300000)) return;
    appUpdate.busy = true; appUpdate.checked = Date.now(); renderAppUpdate();
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await getJSON(siteURL(APP_CONFIG.manifest), controller.signal), manifest = await response.json();
      validateManifest(manifest);
      if (!observeAppRelease(manifest, response)) throw Error('A fresh app version could not be verified.');
      workerRegistration.then(registration => registration?.update()).catch(() => {});
    } catch {
      appUpdate.message = 'App update check unavailable. Keep using this version and try again when connected.';
    } finally { clearTimeout(timeout); appUpdate.busy = false; renderAppUpdate(); }
  }
  async function applyAppRelease() {
    if (appUpdate.applying || !appUpdate.latest) return;
    appUpdate.applying = true; renderAppUpdate();
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
    try {
      // Check a fresh document before leaving the usable one. Never clear caches or saved data.
      const target = new URL(location.href); target.searchParams.set('release', appUpdate.latest); target.searchParams.set('app_update', appUpdate.latest);
      const response = await fetch(target, {cache: 'no-store', credentials: 'same-origin', signal: controller.signal});
      if (!response.ok || response.headers.get('X-Predecessor-Cache') === 'offline') throw Error('Update unavailable');
      const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
      const version = doc.querySelector('meta[name="predecessor-app-version"]')?.content;
      if (version !== appUpdate.latest || !newerRelease(version)) throw Error('The new interface is not available yet');
      save(); saveCompanionPrefs();
      const savedPlan = JSON.parse(localStorage.getItem('predecessor-planner-v2') || 'null');
      const savedMatch = JSON.parse(sessionStorage.getItem(matchKey) || 'null');
      const savedPrefs = JSON.parse(localStorage.getItem(prefsKey) || 'null');
      if (!savedPlan || ['locks','enemies','bans','me','bracket'].some(k => JSON.stringify(savedPlan[k]) !== JSON.stringify(S[k])) || JSON.stringify(savedMatch?.contexts) !== JSON.stringify(S.liveContexts) || JSON.stringify(savedPrefs) !== JSON.stringify(companionPrefs)) throw Error('Save unavailable');
      target.hash = navigationHash(navigationState());
      location.replace(target.href);
    } catch {
      appUpdate.message = 'The update could not be opened safely. This screen and your picks are unchanged. Try again when connected.';
    } finally { clearTimeout(timeout); appUpdate.applying = false; renderAppUpdate(); }
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-app-check],[data-app-apply]'); if (!button) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (button.hasAttribute('data-app-apply')) applyAppRelease(); else checkAppRelease(true);
  }, true);
  const resumeAppCheck = () => { if (document.visibilityState === 'visible') checkAppRelease(); };
  window.addEventListener('pageshow', event => { if (event.persisted) resumeAppCheck(); });
  window.addEventListener('focus', resumeAppCheck);
  window.addEventListener('online', () => checkAppRelease(true));
  document.addEventListener('visibilitychange', resumeAppCheck);

  function siteURL(path) {
    if (!/^(manifest\.json|bundles\/[a-z]+-(?:(?:core|shared|hero-[a-z0-9-]+)-)?[a-f0-9]{64}\.json)$/.test(path || '')) throw Error('Invalid publication path');
    return new URL(path, baseURL).href;
  }
  function cohort() { return site.manifest?.cohorts?.[S.bracket]; }
  // The official description review is confirmed on the website only by the latest verified cloud check of this same
  // publication content (its signature: a hotfix edits the article without changing the version), made within 30 hours,
  // while online and after a successful check. Otherwise the shared rule applies: pending, or a named failure.
  const baseDefinitionReviewStatus = definitionReviewStatus;
  definitionReviewStatus = function () {
    const review = B?.definition_review, check = site.manifest?.patch_check, entry = site.loadedEntry;
    let recent = false; try { recent = !!check?.checked_at && E.sourceCurrency({status: 'ok', fetched_at: check.checked_at}).state === 'current'; } catch { recent = false; }
    const confirmed = review?.status === 'reviewed for current patch' && check?.status === 'verified'
      && typeof check.signature === 'string' && check.signature === entry?.source_signature
      && check.version === review.patch && B.official?.status === 'verified' && B.official?.live?.version === review.patch && recent
      && B.recommendation_context?.status !== 'withheld' && B.guidance?.status === 'reviewed for current patch'
      && !entry.saved_copy && !site.checkFailed && !connectionLost && navigator.onLine;
    return confirmed ? review.status : baseDefinitionReviewStatus();
  };
  const statusDetail = detail;
  detail = function (title, body, refresh) { site.dialogStatus = B ? definitionReviewStatus() : ''; return statusDetail(title, body, refresh); };
  // The bytes of a publication are either its compact core or, as a fallback, its full bundle.
  const publicationBytes = (entry, url) => !!url && (url === entry?.url || url === entry?.projection?.core?.url);
  function latestVerifiedPatch() { return site.manifest?.patch_check?.status === 'verified' ? site.manifest.patch_check : site.manifest?.last_verified_patch_check; }
  function publicationChanged(entry) {
    const check = latestVerifiedPatch();
    return check?.status === 'verified' && entry?.source_signature && check.signature !== entry.source_signature;
  }
  function nextDaily() {
    const [hour, minute] = (site.manifest?.schedule?.daily_utc || '17:23').split(':').map(Number);
    const next = new Date(); next.setUTCHours(hour, minute, 0, 0);
    if (next <= new Date()) next.setUTCDate(next.getUTCDate() + 1);
    return next.toLocaleString();
  }
  // Material (always visible) and detail (Status details) notices of the website; see materialAlerts/alerts in ui.js.
  function publishedMaterial() {
    const entry = site.loadedEntry || cohort(), check = latestVerifiedPatch();
    let result = '';
    if (site.manifest?.collection_paused_reason) result += note(esc(site.manifest.collection_paused_reason), true);
    if (site.manifest?.collection_host !== 'cloud' && site.manifest?.local_collector?.checked_at && Date.now()-Date.parse(site.manifest.local_collector.checked_at)>30*3600000) result += note('The Windows updater has not checked in for over 30 hours. Showing the last successful data. Updates resume when the PC is on, signed in and connected.', true);
    if (B && Date.now() - Date.parse(B.generated_at) > 30 * 3600000) result += note('This bundle is more than 30 hours old. The scheduled update may have failed or been delayed. Its source dates have not changed.', true);
    if (publicationChanged(entry)) result += note('Official patch content changed after this bundle was collected. Showing the previous dated statistics; written guidance needs review. ' + link(check.url, 'Latest official notes'), true);
    return result;
  }
  function publishedDetails() {
    const check = latestVerifiedPatch();
    let result = '';
    if (site.manifest?.source_pauses?.pred && !predAvailability()) result += note('Pred.gg update unavailable: ' + esc(site.manifest.source_pauses.pred), true);
    if (check?.announcements?.length) result += note('Upcoming: ' + check.announcements.map(a => link(a.url, 'v' + a.version) + ' · ' + esc(a.release_date || 'release date unconfirmed')).join('; ') + '. Announcements are separate from live data.');
    return result;
  }
  alerts = function() { return publishedDetails() + originalAlerts(); };
  const originalMaterial = materialAlerts;
  materialAlerts = function() { return publishedMaterial() + originalMaterial(); };
  dataView = function() {
    return oldDataView() + appUpdateHTML() + '<details id="source-update-method" class="reference-fold" data-keep="source-update-method"><summary>How updates work & optional sources</summary><div class="detail-content">' + note((site.manifest?.collection_paused_reason ? 'Statistical updates are paused; the reason is displayed above. ' : 'Shared website: available sources update daily in the cloud, independently of your PC, with an extra collection after a live patch change. ') + 'Official patch checks run every three hours. Check updates loads the latest publication. It does not start a scrape. Calculated rankings and suggestions use that evidence; authored recommendations need a separate reviewed update. Your picks stay in this browser.') + (site.manifest?.optional_sources?.pred ? note(esc(site.manifest.optional_sources.pred.note)) : '') + '</div></details>';
  };
  chrome = function() {
    originalChrome();
    renderAppUpdate();
    $('#connection').textContent = 'SHARED WEBSITE · YOUR DRAFT STAYS IN THIS BROWSER';
    $('#refresh').textContent = latestStatus.busy ? 'Checking…' : 'Reload latest data';
    $('#refresh').disabled = !!latestStatus.busy;
    $('#bracket').disabled = false;
    $('#export').disabled = !B;
    $('#quit').classList.add('hide');
    const verified = latestVerifiedPatch();
    if (verified?.version) $('#patch-strip .patch-cell').innerHTML = `<div><small>${site.manifest?.patch_check?.status === 'verified' ? 'Game patch' : 'Last verified patch'}</small><strong>v${esc(verified.version)}</strong></div>${link(verified.url,'Official notes ↗')}`;
    stableHTML('#bracket', options(allowed.map(b => [b, (site.manifest?.cohorts?.[b]?.label || b[0].toUpperCase()+b.slice(1)+'+') + (site.manifest && site.manifest.cohorts[b]?.status !== 'available' ? ' · unavailable' : '')]), S.bracket));
    $('#freshness').textContent += site.manifest?.collection_host === 'cloud' ? ' Daily cloud update target: ' + nextDaily() + ' (your time). Your PC can be off. Patch checks every three hours; schedules can be delayed.' : site.manifest?.local_collector?.checked_at ? ' Windows updater: '+date(site.manifest.local_collector.checked_at)+'. Checks every three hours while your PC is on and signed in; full data daily or after a live patch change.' : site.manifest?.collection_paused_reason ? ' Statistical updates paused. Official patch checks every three hours.' : ' Daily update target: ' + nextDaily() + ' (your time). Patch checks every three hours; schedules can be delayed.';
    if (site.manifest?.patch_check?.checked_at) $('#freshness').textContent += ' Official check: ' + date(site.manifest.patch_check.checked_at) + '.';
    if (latestStatus.checkedAt) $('#freshness').textContent += ' Browser last checked: ' + date(latestStatus.checkedAt) + '.';
    if (B) $('#freshness').textContent += ' Core Statz health is separate from optional Pred.gg availability. Your draft is saved in this browser.';
    $('#progress').textContent = latestStatus.message || 'Loading the latest published data…';
    $('#progress').classList.toggle('failed',!!latestStatus.errors?.some(e=>isMaterialError(e)));
    if (!B && !latestStatus.busy) $('#main').innerHTML = empty(latestStatus.message || 'No successful publication is available for this bracket yet. Choose another bracket.');
  };
  render = function() {
    originalRender();
    renderAppUpdate();
    if ($('#detail')?.open && detailRefresh && B && definitionReviewStatus() !== site.dialogStatus) {
      if (site.dialogStatus && $('#detail-body').textContent.includes(site.dialogStatus)) rebuildDialog(); else site.dialogStatus = definitionReviewStatus();
    }
    if (!B && !latestStatus.busy) $('#main').innerHTML = empty(latestStatus.message || 'Loading the latest published data…');
  };

  async function getJSON(url, signal) {
    // Protected previews require their same-origin login cookie; never send it cross-origin.
    const response = await fetch(url, {signal, cache: 'no-store', credentials: 'same-origin'});
    if (!response.ok) throw Error('Website data request returned HTTP ' + response.status);
    return response;
  }
  function validateManifest(manifest) {
    if (![1,2].includes(manifest?.schema) || !manifest.cohorts || !Number.isFinite(Date.parse(manifest.published_at))) throw Error('Published status has an invalid format');
    for (const [key, entry] of Object.entries(manifest.cohorts)) {
      if (!allowed.includes(key) || !['available', 'unavailable'].includes(entry.status)) throw Error('Invalid published rank bracket');
      if (entry.status === 'available') {
        if (!/^[a-f0-9]{64}$/.test(entry.sha256 || '') || entry.url !== 'bundles/' + key + '-' + entry.sha256 + '.json') throw Error('Invalid bundle identity');
        siteURL(entry.url);
        if (entry.projection) {
          const p = entry.projection, part = (kind, value) => { if (!/^[a-f0-9]{64}$/.test(value?.sha256 || '') || value.url !== 'bundles/' + key + '-' + kind + '-' + value.sha256 + '.json') throw Error('Invalid evidence identity'); siteURL(value.url); };
          try {
            if (p.version !== 1 || !p.heroes || typeof p.heroes !== 'object') throw Error('Unsupported publication format');
            part('core', p.core); part('shared', p.shared);
            for (const [slug, value] of Object.entries(p.heroes)) { if (!/^[a-z0-9-]+$/.test(slug)) throw Error('Invalid evidence identity'); part('hero-' + slug, value); }
          } catch (error) { console.warn('The ' + key + ' evidence files are not used (' + error.message + '); the full bundle is loaded instead.'); delete entry.projection; }
        }
      }
    }
  }
  async function fetchBundle(entry, bracket, signal, primary = true) {
    let bytes, url = entry.url, data;
    if (entry.projection?.core) {
      try { ({bytes, value: data} = await verifiedJSON(entry.projection.core, signal, 'Published bundle checksum did not match; keeping the previous data')); url = entry.projection.core.url; }
      catch (error) { if (signal?.aborted || /checksum/.test(error.message)) throw error; bytes = null; }   // e.g. offline with only the full copy saved
    }
    if (!bytes) {
      const response = await getJSON(siteURL(entry.url), signal);
      bytes = await response.arrayBuffer();
      if (!globalThis.crypto?.subtle) throw Error('This shared site requires HTTPS to verify its data');
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
      if (hash !== entry.sha256) throw Error('Published bundle checksum did not match; keeping the previous data');
      data = JSON.parse(new TextDecoder().decode(bytes)); url = entry.url;
    }
    if (data?.schema !== 3 || data.bracket?.segment !== bracket || !data.heroes || !Object.keys(data.heroes).length || !Array.isArray(data.tier_list) || data.generated_at !== entry.generated_at) throw Error('Published bundle does not match the selected bracket or date');
    if (primary) site.verifiedBytes = {url, bytes};   // offline copy only after the checks above passed
    return data;
  }
  // Offline copies are written here, by the page, and only for a bundle that passed its checksum and structure
  // checks. Order matters: save the new bundle, then a manifest that describes exactly what is saved, and only
  // then remove this bracket's older bundle. A failure at any step leaves the previous saved copy usable.
  // Named with the 'predecessor-meta-' prefix on purpose: if the website is ever rolled back to 2.24 or earlier, that
  // release's worker deletes this cache (and this release's shell) instead of serving a frozen copy from it.
  const DATA_CACHE = 'predecessor-meta-data-v1';
  const savedBracket = url => (new URL(url).pathname.match(/\/bundles\/([a-z]+)-(?:core-)?[a-f0-9]{64}\.json$/) || [])[1];
  const evidenceBracket = url => (new URL(url).pathname.match(/\/bundles\/([a-z]+)-(?:shared|hero-[a-z0-9-]+)-[a-f0-9]{64}\.json$/) || [])[1];
  const savedURL = value => siteURL(value?.projection?.core?.url || value.url);
  const fullBracket = url => (new URL(url).pathname.match(/\/bundles\/([a-z]+)-[a-f0-9]{64}\.json$/) || [])[1];
  // {saved, worker} when the offline store can be read, null when it cannot (then nothing is claimed either way).
  async function savedOnThisDevice(bracket) {
    try {
      if (!globalThis.caches) return null;
      const saved = (await (await caches.open(DATA_CACHE)).keys()).some(r => savedBracket(r.url) === bracket);
      const worker = !!(await navigator.serviceWorker?.getRegistration?.().catch(() => null));
      return {saved, worker};
    } catch { return null; }
  }
  async function commitPublication(manifest, bracket, entry, loaded) {
    if (!globalThis.caches || connectionLost) return;
    // One commit at a time across every open tab, so no tab writes a manifest from an outdated view of what is saved.
    const commit = () => commitNow(manifest, bracket, entry, loaded);
    try {
      const saved = await (navigator.locks?.request ? navigator.locks.request('predecessor-offline-commit', commit) : commit());
      if (saved === 'superseded') return;   // a newer check of this rank saves it
      if (saved) { site.offlineProblem = null; if (loaded && site.loadedBytes === loaded) site.loadedBytes = null; }
      else site.offlineProblem = 'This rank is not saved for offline use yet. Reload latest data while online to save it.';
    } catch (error) {
      site.offlineProblem = error?.name === 'QuotaExceededError' ? 'This device is out of storage for offline copies. The app still works online; free some space to keep ranks available offline.'
        : 'The offline copy could not be saved. The app still works online.';
    }
  }
  async function commitNow(manifest, bracket, entry, loaded) {
    const overtaken = () => S.bracket === bracket && !!site.loadedEntry && site.loadedEntry !== entry
      && (site.loadedEntry.sha256 !== entry.sha256 || site.loadedEntry.projection?.core?.sha256 !== entry.projection?.core?.sha256);
    if (overtaken()) return 'superseded';
    const data = await caches.open(DATA_CACHE), manifestURL = siteURL(APP_CONFIG.manifest);
    if (overtaken()) return 'superseded';
    // The bytes are stored at the address they were loaded from (the core, or the full bundle); the address
    // contains the checksum, so a copy already saved there holds these exact bytes.
    const target = loaded?.bytes && publicationBytes(entry, loaded.url) ? siteURL(loaded.url) : null;
    if (target && !(await data.match(target))) await data.put(target, new Response(loaded.bytes, {headers: {'Content-Type': 'application/json'}}));
    const saved = new Set((await data.keys()).map(key => key.url));
    const bundleURL = [target, entry.projection?.core?.url && siteURL(entry.projection.core.url), siteURL(entry.url)].find(url => url && saved.has(url));
    if (!bundleURL) return false;   // nothing verified is saved for this bracket, so there is nothing to describe
    let previous = null; try { previous = await (await data.match(manifestURL))?.json(); } catch { previous = null; }
    const has = value => value?.status === 'available' && /^[a-f0-9]{64}$/.test(value.sha256 || '') && typeof value.url === 'string' && (saved.has(savedURL(value)) || saved.has(siteURL(value.url)));
    const cohorts = {};
    for (const [key, value] of Object.entries(manifest.cohorts)) {
      const old = previous?.cohorts?.[key];
      // A bracket whose newest bundle is not saved keeps the entry for the bundle that IS saved, with its own dates.
      if (value.status !== 'available' || has(value)) { cohorts[key] = value; continue; }
      if (has(old)) { cohorts[key] = {...old, saved_copy: true}; continue; }
      cohorts[key] = value;
      const other = [...saved].find(url => fullBracket(url) === key);
      if (!other) continue;   // nothing is saved for this bracket; it stays as published
      try {
        // Saved by an earlier release and not described yet: describe it from the bundle itself. Its patch
        // signature is unknown, so it is treated as possibly out of date, never as current.
        const bundle = await (await data.match(other)).json(), digest = other.match(/-([a-f0-9]{64})\.json$/)[1];
        cohorts[key] = {label: value.label, status: 'available', sha256: digest, url: 'bundles/' + key + '-' + digest + '.json', generated_at: bundle.generated_at, source_signature: 'unverified-saved-copy', saved_copy: true,
          source_dates: Object.fromEntries(Object.entries(bundle.sources || {}).map(([k, v]) => [k, {status: v?.status, fetched_at: v?.fetched_at}]))};
      } catch { cohorts[key] = value; }
    }
    if (overtaken()) return 'superseded';
    await data.put(manifestURL, new Response(JSON.stringify({...manifest, cohorts}), {headers: {'Content-Type': 'application/json'}}));
    for (const url of saved) if (savedBracket(url) === bracket && url !== bundleURL) await data.delete(url);
    // Evidence saved for an older publication of this rank is removed with it.
    const current = new Set([entry.projection?.shared, ...Object.values(entry.projection?.heroes || {})].filter(Boolean).map(p => siteURL(p.url)));
    for (const url of saved) if (evidenceBracket(url) === bracket && !current.has(url)) await data.delete(url);
    return true;
  }
  // ---- Evidence annexes (audit item 11). The core holds everything the engine and the main screens read; display-only
  // evidence is fetched when a view needs it, verified by its checksum, and merged in place. Merging can never change
  // an engine result (tests/projection.test.cjs), so the page only redraws to show the evidence.
  site.annex = {full: false, loaded: new Set(), failed: new Map(), pending: new Map()};
  function annexReset(full) { site.annex = {full, loaded: new Set(), failed: new Map(), pending: new Map()}; }
  function annexPart(kind, key) { const p = site.loadedEntry?.projection; return !p || site.annex.full ? null : kind === 'shared' ? p.shared : p.heroes?.[key] || null; }
  async function verifiedJSON(part, signal, mismatch = 'Published evidence checksum did not match') {
    const response = await getJSON(siteURL(part.url), signal), bytes = await response.arrayBuffer();
    if (!globalThis.crypto?.subtle) throw Error('This shared site requires HTTPS to verify its data');
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
    if (hash !== part.sha256) throw Error(mismatch);
    return {bytes, value: MetaProjection.decode(JSON.parse(new TextDecoder().decode(bytes)))};
  }
  function loadAnnex(kind, key) {
    const part = annexPart(kind, key), id = kind === 'shared' ? 'shared' : 'hero:' + key;
    if (!part || site.annex.loaded.has(id)) return Promise.resolve('loaded');
    if (site.annex.pending.has(id)) return site.annex.pending.get(id);
    const raw = site.originalBundle, annex = site.annex, controller = new AbortController(), timer = setTimeout(() => controller.abort(), 45000);
    const promise = (async () => {
      const {bytes, value} = await verifiedJSON(part, controller.signal);
      if (site.originalBundle !== raw || site.annex !== annex) { redrawForAnnex('*'); return 'stale'; }   // another publication was loaded meanwhile
      MetaProjection.merge(raw, value);
      annex.loaded.add(id); annex.failed.delete(id);
      B = displayedBundle(raw, site.loadedEntry); E = MetaEngine.create(B);
      saveEvidence(part.url, bytes);
      redrawForAnnex(id);
      return 'loaded';
    })().catch(error => {
      if (site.originalBundle !== raw || site.annex !== annex) { redrawForAnnex('*'); return 'stale'; }
      const offline = !navigator.onLine || connectionLost, gone = /HTTP 404/.test(error.message);
      annex.failed.set(id, offline ? 'it is not saved on this device yet and downloads when you are online'
        : gone ? 'the website was updated after this page loaded'
        : controller.signal.aborted ? 'the download timed out' : error.message);
      // A deploy replaces every evidence file: check for the new publication, at most once a minute. The check does
      // not clear this failure; a new publication starts afresh, and Reload latest data retries.
      if (gone && !offline) checkAfterRedeploy();
      redrawForAnnex(id);
      return 'failed';
    }).finally(() => { clearTimeout(timer); if (annex.pending.get(id) === promise) annex.pending.delete(id); });
    annex.pending.set(id, promise);
    return promise;
  }
  function checkAfterRedeploy() {
    if (Date.now() - (site.goneCheckAt || 0) <= 60000) return;
    if (site.controller) { site.goneCheckQueued = true; return; }   // runs when the current check finishes
    site.goneCheckAt = Date.now(); site.goneCheckQueued = false; checkPublication();
  }
  // An open dialog waiting for (or showing a failure of) an evidence file that changed state is rebuilt in place (the page
  // redraw does not reach dialogs), keeping its open sections and scroll position. Other arrivals leave it alone.
  function refreshDialog(changed) {
    const dialog = $('#detail'), body = $('#detail-body');
    if (!detailRefresh || !B || !dialog?.open) return;
    const waiting = [...body.querySelectorAll('[data-annex]')].map(el => el.dataset.annex);
    if (!waiting.some(id => changed.has('*') || changed.has(id))) return;
    rebuildDialog();
  }
  // Rebuilds the open dialog in place. Sections are matched by summary text and occurrence (the third "Reviewed
  // replacement" stays the third); focus returns to the same control, matched by id, data attributes or text and by its
  // position among controls that match the same way, or to the dialog itself when that control is gone.
  function rebuildDialog() {
    const dialog = $('#detail'), body = $('#detail-body');
    const sections = () => { const n = {}; return [...body.querySelectorAll('details > summary')].map(s => ({s, id: s.textContent + '\u0000' + (n[s.textContent] = (n[s.textContent] || 0) + 1)})); };
    const controls = () => [...dialog.querySelectorAll('button, summary, a[href], select, input, [tabindex]')];
    const key = el => el.id ? '#' + el.id : el.tagName + '|' + [...el.attributes].filter(a => a.name.startsWith('data-')).map(a => a.name + '=' + a.value).join('&') + '|' + el.textContent.trim().slice(0, 80);
    const open = new Set(sections().filter(x => x.s.parentElement.open).map(x => x.id)), top = dialog.scrollTop;
    const active = dialog.contains(document.activeElement) && document.activeElement !== dialog ? document.activeElement : null;
    const focused = active ? key(active) : null, peers = focused ? controls().filter(el => key(el) === focused) : [], index = peers.indexOf(active);
    detailRefresh();
    site.dialogStatus = B ? definitionReviewStatus() : '';
    sections().forEach(x => { if (open.has(x.id)) x.s.parentElement.open = true; });
    dialog.scrollTop = top;
    if (focused && !dialog.contains(document.activeElement)) {
      const same = controls().filter(el => key(el) === focused), target = same.length === peers.length && index >= 0 ? same[index] : null;
      if (target) target.focus({preventScroll: true});
      else { if (!dialog.hasAttribute('tabindex')) dialog.setAttribute('tabindex', '-1'); dialog.focus({preventScroll: true}); }
    }
  }
  // Evidence files that arrive together (the desktop Builds page asks for one per hero) share one redraw.
  let annexRedraw = 0, annexChanged = new Set();
  function redrawForAnnex(id = '*') {
    annexChanged.add(id);
    if (!annexRedraw) annexRedraw = setTimeout(() => { const changed = annexChanged; annexChanged = new Set(); annexRedraw = 0; requestRedraw(true); refreshDialog(changed); }, 50);
  }
  // 'loaded' (or nothing was moved out for this view), 'loading' or 'failed'; asking starts the download.
  annexState = function (kind, key) {
    const part = annexPart(kind, key), id = kind === 'shared' ? 'shared' : 'hero:' + key;
    if (!part || site.annex.loaded.has(id)) return 'loaded';
    if (site.annex.failed.has(id)) return 'failed';
    loadAnnex(kind, key);
    return 'loading';
  };
  annexProblem = function (kind, key) { return site.annex.failed.get(kind === 'shared' ? 'shared' : 'hero:' + key) || ''; };
  // The state of one evidence file by its id, for announcements; unlike annexState it never starts a download.
  annexPhase = function (id) {
    const part = id === 'shared' ? annexPart('shared') : annexPart('hero', id.slice(5));
    return !part || site.annex.loaded.has(id) ? 'loaded' : site.annex.failed.has(id) ? 'failed' : 'loading';
  };
  requestAnnex = function (kind, key) { return loadAnnex(kind, key); };
  // Views that read display-only evidence are guarded in ui.js (annexGuard, annexHTML); dialogs refresh through detail().
  async function saveEvidence(url, bytes) {
    try { if (globalThis.caches && !connectionLost) await (await caches.open(DATA_CACHE)).put(siteURL(url), new Response(bytes, {headers: {'Content-Type': 'application/json'}})); }
    catch { /* offline copies of evidence are optional; the view works online */ }
  }
  function displayedBundle(raw, entry) {
    if (site.manifest?.patch_check?.status === 'failed') return {...raw, recommendation_context: {status:'withheld',reason:'The latest official patch check failed. Saved observations remain inspectable; automatic role comparisons await verification.'}, guidance: {...raw.guidance, status: 'needs verification: latest official patch check failed'}};
    if (!publicationChanged(entry)) return raw;
    // Preserve original source observations. Only the review-status overlay changes.
    return {...raw, recommendation_context: {status:'withheld',reason:'Official patch or hotfix content changed after this collection. Saved observations remain inspectable; automatic role comparisons await the new data.'}, guidance: {...raw.guidance, status: 'needs review: official patch content changed since collection'}};
  }
  // Evidence redraws use the shared rule in ui.js (redrawForEvidence): never while typing or mid-click, never lost.
  async function checkPublication(retryEvidence = false) {
    const sequence = ++site.sequence, requested = S.bracket;
    // Reload latest data (and the connection coming back) retries evidence that failed to load; automatic checks do not.
    const retry = retryEvidence === true && !!site.annex?.failed?.size, retried = retry ? [...site.annex.failed.keys()] : [];   // grows if the connection is back
    let dialogRefreshed = false;
    if (retry) {
      // Files the site no longer has (404 after a redeploy) are not asked for again until the new publication is known.
      const gone = new Set([...site.annex.failed].filter(([, reason]) => /website was updated/.test(reason)).map(([id]) => id));
      site.annex.failed.clear();
      try { refreshDialog(new Set(retried.filter(id => !gone.has(id)))); } catch (error) { console.warn('Dialog refresh failed:', error); }
    }
    site.controller?.abort();
    const controller = new AbortController(); site.controller = controller;
    const timeout = setTimeout(() => controller.abort(), 45000);
    latestStatus = {busy: true, message: 'Checking the latest ' + requested + ' publication…'}; chrome();
    try {
      const manifestResponse = await getJSON(siteURL(APP_CONFIG.manifest), controller.signal);
      const wasLost = connectionLost;
      connectionLost = manifestResponse.headers.get('X-Predecessor-Cache') === 'offline';
      if (wasLost && !connectionLost && site.annex?.failed?.size) { retried.push(...site.annex.failed.keys()); site.annex.failed.clear(); }
      const manifest = await manifestResponse.json();
      validateManifest(manifest);
      if (sequence !== site.sequence || requested !== S.bracket) return;
      site.manifest = manifest;
      observeAppRelease(manifest, manifestResponse);
      globalThis.publishedCohorts = manifest.cohorts;   // read-only reference for the strategy review packet
      const entry = manifest.cohorts[requested];
      const errs = [...(entry?.last_attempt?.errors || [])];
      if (manifest.patch_check?.status === 'failed') errs.push({source: 'Official patch check', severity: 'error', detail: manifest.patch_check.error || 'Official patch check failed'});
      if (!entry || entry.status !== 'available') {
        B = null; E = MetaEngine.create(null); site.originalBundle = null; site.loadedEntry = null; revision = 0;
        latestStatus = {busy: false, errors: errs, message: 'No successful ' + requested + ' publication yet. Choose another bracket; missing samples are not estimated.'}; render(); return;
      }
      let raw = site.originalBundle;
      if (!raw || raw.bracket.segment !== requested || revision !== entry.sha256 || site.loadedEntry?.projection?.core?.sha256 !== entry.projection?.core?.sha256) raw = await fetchBundle(entry, requested, controller.signal);
      if (sequence !== site.sequence || requested !== S.bracket) return;
      const next = displayedBundle(raw, entry);
      const dataChanged = revision !== entry.sha256 || raw !== site.originalBundle, changed = dataChanged || B?.guidance?.status !== next.guidance?.status;
      // Bundle, revision and engine change together, so the page never ranks from another publication than it shows.
      if (raw !== site.originalBundle) annexReset(!!site.verifiedBytes && site.verifiedBytes.url === entry.url);   // a full bundle already holds every annex
      site.originalBundle = raw; site.loadedEntry = entry; site.checkFailed = false;
      B = next; revision = entry.sha256;
      if (changed) E = MetaEngine.create(B);
      if (publicationBytes(entry, site.verifiedBytes?.url)) site.loadedBytes = site.verifiedBytes;
      site.verifiedBytes = null;
      if (site.loadedBytes && !publicationBytes(entry, site.loadedBytes.url)) site.loadedBytes = null;
      const verified = site.loadedBytes || null;   // {url, bytes}, kept until the offline copy is saved, so a failed save is retried
      const coreUnavailable=entry.health?.core_statistics?.status==='unavailable';
      latestStatus = {busy: true, errors: errs, health: entry.health || (entry.saved_copy ? null : manifest.health), checkedAt: new Date().toISOString(), message: (entry.collection_status==='partial'&&coreUnavailable?'Required source incomplete · ':entry.last_attempt?.status && !['ok','partial'].includes(entry.last_attempt.status)?'Latest collection failed · saved ':'Published ') + entry.label + ' · assembled ' + date(B.generated_at) + '.'};
      if (connectionLost) latestStatus.message = 'Connection unavailable · saved publication. ' + latestStatus.message;
      // New data redraws at once; a changed overlay on the same data (a failed or recovered patch check) waits for typing to end.
      site.lastCheck = Date.now(); if (dataChanged) { requestRedraw(true); refreshDialog(new Set(['*'])); dialogRefreshed = true; checkSharedPlan(); } else if (retried.length) { requestRedraw(true); refreshDialog(new Set(retried)); dialogRefreshed = true; } else redrawForEvidence();
      // The new data is already shown; the check itself completes once the offline copy is saved (or after ten
      // seconds, when saving continues in the background), so 'up to date' also means 'available offline'.
      await Promise.race([commitPublication(manifest, requested, entry, verified), new Promise(resolve => setTimeout(resolve, 10000))]);
      if (sequence !== site.sequence || requested !== S.bracket) return;
      latestStatus.busy = false;
      if (site.offlineProblem) latestStatus.message += ' ' + site.offlineProblem;
      chrome();
    } catch (error) {
      if (sequence !== site.sequence || requested !== S.bracket) return;
      site.checkFailed = true;
      if (site.originalBundle) { B = displayedBundle(site.originalBundle, site.loadedEntry); E = MetaEngine.create(B); }
      const savedHere = !B && (!navigator.onLine || connectionLost) ? await savedOnThisDevice(requested) : null;
      if (sequence !== site.sequence || requested !== S.bracket) return;
      latestStatus = {busy: false, checkedAt: new Date().toISOString(), message: 'Update check failed. ' + (B ? 'The last loaded data remains usable.' : savedHere?.saved ? (savedHere.worker ? 'A copy of this rank is saved on this device. Reload the page to open it.' : 'A copy of this rank is saved on this device, but offline support is not active in this browser, so it cannot be opened while offline.') : savedHere ? (savedHere.worker ? 'This rank is not saved on this device. Open it once while online to keep it for offline use.' : 'This rank is not saved on this device, and offline support is not active in this browser.') : 'No data has loaded yet.'), errors: [{source: 'Shared website', severity: 'error', detail: controller.signal.aborted ? 'The publication request timed out. Try Reload latest data again.' : error.message}]};
      redrawForEvidence();
    } finally {
      clearTimeout(timeout);
      // Failures cleared by this check are never left on an open dialog, whichever way the check ended.
      if (retried.length && !dialogRefreshed) try { refreshDialog(new Set(retried)); } catch (error) { console.warn('Dialog refresh failed:', error); }
      if (sequence === site.sequence) { site.controller = null; if (site.goneCheckQueued) setTimeout(checkAfterRedeploy, 0); }
    }
  }
  async function exportSnapshot() {
    if (!B) return;
    const bracket = S.bracket, missing = [], entry = site.loadedEntry, controller = new AbortController(), timer = setTimeout(() => controller.abort(), 60000);
    let full = null;
    if (entry?.projection && !site.annex.full) try {
      try { full = displayedBundle(await fetchBundle({...entry, projection: null}, bracket, controller.signal, false), entry); }
      catch {
        // Offline, or the full bundle is gone: assemble the core with every evidence file that can still be
        // verified (saved ones are served offline), and say in the snapshot how many are missing.
        const raw = site.originalBundle, copy = structuredClone(raw), parts = [['shared', entry.projection.shared], ...Object.entries(entry.projection.heroes || {}).map(([slug, part]) => ['hero:' + slug, part])];
        const assembly = new AbortController(), limit = setTimeout(() => assembly.abort(), 60000);
        try {
          for (const [id, part] of parts) {
            try { MetaProjection.merge(copy, (await verifiedJSON(part, assembly.signal)).value); } catch { missing.push(id); }
          }
        } finally { clearTimeout(limit); }
        if (site.originalBundle !== raw) throw Error('Another publication was loaded while exporting. Export again.');
        full = displayedBundle(copy, entry);
        if (missing.length) toast('The snapshot was saved without ' + missing.length + ' detailed evidence files; it says so when opened.');
      }
    } finally { clearTimeout(timer); }
    const root = exportShell.cloneNode(true), script = [...root.querySelectorAll('script')].find(s => s.textContent.startsWith('const INITIAL_BUNDLE='));
    if (!script?.textContent.startsWith('const INITIAL_BUNDLE=')) throw Error('Export template changed; cannot create a safe snapshot');
    const encode = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    script.textContent = 'const INITIAL_BUNDLE=' + encode(full || B) + '; const APP_CONFIG=' + encode({mode:'export',tool_version:APP_CONFIG.tool_version,...(missing.length ? {missing_evidence: missing.length, missing_parts: missing} : {})}) + ';';
    root.querySelectorAll('link[rel="manifest"],link[rel="apple-touch-icon"],link[rel="icon"]').forEach(link => link.remove());
    root.querySelectorAll('dialog[open]').forEach(d => d.removeAttribute('open'));
    const blob = new Blob(['<!doctype html>\n', root.outerHTML], {type:'text/html;charset=utf-8'});
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'Predecessor Meta - ' + bracket + '.html'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  document.addEventListener('click', event => {
    const id = event.target.closest('button')?.id;
    if (!['refresh','export','more-export','install-app'].includes(id)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (id === 'refresh') checkPublication(true);
    else if (id === 'install-app') installSharedApp().catch(error => toast(error.message));
    else exportSnapshot().catch(error => toast(error.message));
  }, true);
  document.addEventListener('change', async event => {
    const el = event.target;
    if (!['bracket','compare-bracket'].includes(el.id)) return;
    event.stopImmediatePropagation();
    if (el.id === 'bracket') {
      if (!allowed.includes(el.value)) return;
      S.bracket = el.value; save(); B = null; E = MetaEngine.create(null); revision = 0; site.originalBundle = null; site.loadedEntry = null; comparison = null;
      // Rank is a data selection, not a request to leave the current destination or Plan stage.
      render(); await checkPublication();
    } else {
      const choice = site.comparisonChoice = (site.comparisonChoice || 0) + 1;
      if (!el.value) return;
      const selected = el.value, requested = S.bracket, entry = site.manifest?.cohorts?.[selected];
      if (!entry || entry.status !== 'available') { comparison = null; $('#comparison-output').innerHTML = note('No successful publication for this bracket yet. Samples are not inferred.'); return; }
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 45000);
      try {
        const bundle = await fetchBundle(entry, selected, controller.signal, false);
        if (S.bracket !== requested || site.comparisonChoice !== choice) return;
        comparison = {bracket: selected, bundle};
        if ($('#compare-bracket')) $('#compare-bracket').value = selected;
        if ($('#comparison-output')) $('#comparison-output').innerHTML = comparisonHTML();
      } catch (error) { if (site.comparisonChoice === choice) toast(error.message); } finally { clearTimeout(timer); }
    }
  }, true);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now()-site.lastCheck > 900000) checkPublication(); });
  window.addEventListener('focus', () => { if (Date.now()-site.lastCheck > 900000 && !site.controller) checkPublication(); });
  window.addEventListener('online', () => checkPublication(true));
  setInterval(() => { if (document.visibilityState === 'visible' && navigator.onLine && !site.controller) checkPublication(); }, 1800000);
  // Evidence ages even when no check succeeds (for example offline): re-evaluate it every five minutes.
  setInterval(() => { if (B && document.visibilityState === 'visible' && !site.controller) redrawForEvidence(); }, 300000);
  // Defer until the existing UI startup has created its shell.
  syncInstallButton();
  setTimeout(checkPublication, 0);
}
