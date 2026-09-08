// Hosting adapter. Injected before the existing startup; the desktop engine and UI stay intact.
if (APP_CONFIG.mode === 'static') {
  const site = {manifest: null, sequence: 0, controller: null, originalBundle: null, loadedEntry: null, lastCheck: 0};
  // Capture the pristine shell before the UI renders any visitor selections into it.
  const exportShell = document.documentElement.cloneNode(true);
  const originalChrome = chrome;
  const originalRender = render;
  const originalAlerts = alerts;
  const oldDataView = dataView;
  const allowed = ['gold', 'bronze', 'silver', 'platinum', 'diamond', 'paragon'];
  const baseURL = new URL('.', location.href);

  function siteURL(path) {
    if (!/^(manifest\.json|bundles\/[a-z]+-[a-f0-9]{64}\.json)$/.test(path || '')) throw Error('Invalid publication path');
    return new URL(path, baseURL).href;
  }
  function cohort() { return site.manifest?.cohorts?.[S.bracket]; }
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
  function publishedAlerts() {
    const entry = site.loadedEntry || cohort(), check = latestVerifiedPatch();
    let result = '';
    if (site.manifest?.collection_paused_reason) result += note(esc(site.manifest.collection_paused_reason), true);
    if (B && Date.now() - Date.parse(B.generated_at) > 30 * 3600000) result += note('This bundle is more than 30 hours old. The scheduled update may have failed or been delayed. Its source dates have not changed.', true);
    if (publicationChanged(entry)) result += note('Official patch content changed after this bundle was collected. Showing the previous dated statistics; written guidance needs review. ' + link(check.url, 'Latest official notes'), true);
    if (check?.announcements?.length) result += note('Upcoming: ' + check.announcements.map(a => link(a.url, 'v' + a.version) + ' · ' + esc(a.release_date || 'release date unconfirmed')).join('; ') + '. Announcements are separate from live data.');
    return result;
  }
  alerts = function() { return publishedAlerts() + originalAlerts(); };
  dataView = function() {
    return note((site.manifest?.collection_paused_reason ? 'Complete statistical updates are paused; the reason is displayed above. ' : 'Shared website: one full update daily, with an extra collection after a live patch change. ') + 'Official patch checks run every three hours. Check updates loads the latest publication. It does not start a scrape. Written recommendations need a separate reviewed update. Your picks stay in this browser.') + oldDataView();
  };
  chrome = function() {
    originalChrome();
    $('#connection').textContent = 'SHARED WEBSITE · YOUR DRAFT STAYS IN THIS BROWSER';
    $('#refresh').textContent = latestStatus.busy ? 'Checking…' : 'Check updates';
    $('#refresh').disabled = !!latestStatus.busy;
    $('#bracket').disabled = false;
    $('#export').disabled = !B;
    $('#quit').classList.add('hide');
    const verified = latestVerifiedPatch();
    if (verified?.version) $('#patch-strip .patch-cell').innerHTML = `<div><small>LAST VERIFIED GAME PATCH</small><strong>v${esc(verified.version)}</strong></div>${link(verified.url,'Official notes ↗')}`;
    stableHTML('#bracket', options(allowed.map(b => [b, (site.manifest?.cohorts?.[b]?.label || b[0].toUpperCase()+b.slice(1)+'+') + (site.manifest && site.manifest.cohorts[b]?.status !== 'available' ? ' · unavailable' : '')]), S.bracket));
    $('#freshness').textContent += site.manifest?.collection_paused_reason ? ' Statistical updates paused. Official patch checks every three hours.' : ' Daily update target: ' + nextDaily() + ' (your time). Patch checks every three hours; schedules can be delayed.';
    if (site.manifest?.patch_check?.checked_at) $('#freshness').textContent += ' Official check: ' + date(site.manifest.patch_check.checked_at) + '.';
    $('#progress').textContent = latestStatus.message || 'Loading the latest published data…';
    if (!B && !latestStatus.busy) $('#main').innerHTML = empty(latestStatus.message || 'No successful publication is available for this bracket yet. Choose another bracket.');
  };
  render = function() {
    originalRender();
    if (!B && !latestStatus.busy) $('#main').innerHTML = empty(latestStatus.message || 'Loading the latest published data…');
  };

  async function getJSON(url, signal) {
    const response = await fetch(url, {signal, cache: 'no-store', credentials: 'omit'});
    if (!response.ok) throw Error('Website data request returned HTTP ' + response.status);
    return response;
  }
  function validateManifest(manifest) {
    if (manifest?.schema !== 1 || !manifest.cohorts || !Number.isFinite(Date.parse(manifest.published_at))) throw Error('Published status has an invalid format');
    for (const [key, entry] of Object.entries(manifest.cohorts)) {
      if (!allowed.includes(key) || !['available', 'unavailable'].includes(entry.status)) throw Error('Invalid published rank bracket');
      if (entry.status === 'available') {
        if (!/^[a-f0-9]{64}$/.test(entry.sha256 || '') || entry.url !== 'bundles/' + key + '-' + entry.sha256 + '.json') throw Error('Invalid bundle identity');
        siteURL(entry.url);
      }
    }
  }
  async function fetchBundle(entry, bracket, signal) {
    const response = await getJSON(siteURL(entry.url), signal);
    const bytes = await response.arrayBuffer();
    if (!globalThis.crypto?.subtle) throw Error('This shared site requires HTTPS to verify its data');
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
    if (hash !== entry.sha256) throw Error('Published bundle checksum did not match; keeping the previous data');
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (data?.schema !== 3 || data.bracket?.segment !== bracket || !data.heroes || !Object.keys(data.heroes).length || !Array.isArray(data.tier_list) || data.generated_at !== entry.generated_at) throw Error('Published bundle does not match the selected bracket or date');
    return data;
  }
  function displayedBundle(raw, entry) {
    if (site.manifest?.patch_check?.status === 'failed') return {...raw, guidance: {...raw.guidance, status: 'needs verification: latest official patch check failed'}};
    if (!publicationChanged(entry)) return raw;
    // Preserve original source observations. Only the review-status overlay changes.
    return {...raw, guidance: {...raw.guidance, status: 'needs review: official patch content changed since collection'}};
  }
  async function checkPublication() {
    const sequence = ++site.sequence, requested = S.bracket;
    site.controller?.abort();
    const controller = new AbortController(); site.controller = controller;
    const timeout = setTimeout(() => controller.abort(), 45000);
    latestStatus = {busy: true, message: 'Checking the latest ' + requested + ' publication…'}; chrome();
    try {
      const manifest = await (await getJSON(siteURL(APP_CONFIG.manifest), controller.signal)).json();
      validateManifest(manifest);
      if (sequence !== site.sequence || requested !== S.bracket) return;
      site.manifest = manifest;
      const entry = manifest.cohorts[requested];
      const errs = [...(entry?.last_attempt?.errors || [])];
      if (manifest.patch_check?.status === 'failed') errs.push({source: 'Official patch check', severity: 'error', detail: manifest.patch_check.error || 'Official patch check failed'});
      if (!entry || entry.status !== 'available') {
        B = null; E = MetaEngine.create(null); site.originalBundle = null; site.loadedEntry = null; revision = 0;
        latestStatus = {busy: false, errors: errs, message: 'No successful ' + requested + ' publication yet. Choose another bracket; missing samples are not estimated.'}; render(); return;
      }
      let raw = site.originalBundle;
      if (!raw || raw.bracket.segment !== requested || revision !== entry.sha256) raw = await fetchBundle(entry, requested, controller.signal);
      if (sequence !== site.sequence || requested !== S.bracket) return;
      const next = displayedBundle(raw, entry);
      const changed = revision !== entry.sha256 || B?.guidance?.status !== next.guidance?.status;
      site.originalBundle = raw; site.loadedEntry = entry;
      B = next; revision = entry.sha256;
      if (changed) { E = MetaEngine.create(B); compositions = null; }
      latestStatus = {busy: false, errors: errs, message: (entry.last_attempt?.status && entry.last_attempt.status !== 'ok' ? 'Latest collection failed. Retaining successful ' : 'Published ') + entry.label + ' data from ' + date(B.generated_at) + '. Your draft is saved in this browser.'};
      site.lastCheck = Date.now(); if (changed) { render(); checkSharedPlan(); } else chrome();
    } catch (error) {
      if (sequence !== site.sequence || requested !== S.bracket) return;
      if (site.originalBundle) { B = displayedBundle(site.originalBundle, site.loadedEntry); E = MetaEngine.create(B); compositions = null; }
      latestStatus = {busy: false, message: 'Update check failed. ' + (B ? 'The last loaded data remains usable.' : 'No data has loaded yet.'), errors: [{source: 'Shared website', severity: 'error', detail: controller.signal.aborted ? 'The publication request timed out. Try Check updates again.' : error.message}]};
      chrome();
    } finally { clearTimeout(timeout); if (sequence === site.sequence) site.controller = null; }
  }
  function exportSnapshot() {
    if (!B) return;
    const root = exportShell.cloneNode(true), script = root.querySelector('script');
    if (!script?.textContent.startsWith('const INITIAL_BUNDLE=')) throw Error('Export template changed; cannot create a safe snapshot');
    const encode = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    script.textContent = 'const INITIAL_BUNDLE=' + encode(B) + '; const APP_CONFIG=' + encode({mode:'export'}) + ';';
    root.querySelectorAll('dialog[open]').forEach(d => d.removeAttribute('open'));
    const blob = new Blob(['<!doctype html>\n', root.outerHTML], {type:'text/html;charset=utf-8'});
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'Predecessor Meta - ' + S.bracket + '.html'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  document.addEventListener('click', event => {
    const id = event.target.closest('button')?.id;
    if (!['refresh','export'].includes(id)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (id === 'refresh') checkPublication(); else try { exportSnapshot(); } catch (error) { toast(error.message); }
  }, true);
  document.addEventListener('change', async event => {
    const el = event.target;
    if (!['bracket','compare-bracket'].includes(el.id)) return;
    event.stopImmediatePropagation();
    if (el.id === 'bracket') {
      if (!allowed.includes(el.value)) return;
      S.bracket = el.value; save(); B = null; E = MetaEngine.create(null); revision = 0; site.originalBundle = null; site.loadedEntry = null; compositions = null; comparison = null;
      S.route = 'meta'; S.hero = null; render(); await checkPublication();
    } else if (el.value) {
      const selected = el.value, requested = S.bracket, entry = site.manifest?.cohorts?.[selected];
      if (!entry || entry.status !== 'available') { comparison = null; $('#comparison-output').innerHTML = note('No successful publication for this bracket yet. Samples are not inferred.'); return; }
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 45000);
      try {
        const bundle = await fetchBundle(entry, selected, controller.signal);
        if (S.bracket !== requested || $('#compare-bracket')?.value !== selected) return;
        comparison = {bracket: selected, bundle}; $('#comparison-output').innerHTML = comparisonHTML();
      } catch (error) { toast(error.message); } finally { clearTimeout(timer); }
    }
  }, true);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now()-site.lastCheck > 300000) checkPublication(); });
  window.addEventListener('online', checkPublication);
  setInterval(() => { if (document.visibilityState === 'visible' && !site.controller) checkPublication(); }, 300000);
  // Defer until the existing UI startup has created its shell.
  setTimeout(checkPublication, 0);
}
