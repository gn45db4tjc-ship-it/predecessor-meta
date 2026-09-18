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
  if ('serviceWorker' in navigator) navigator.serviceWorker.register(new URL('sw.js', baseURL), {scope: './'}).catch(() => {});

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
    if (site.manifest?.collection_host !== 'cloud' && site.manifest?.local_collector?.checked_at && Date.now()-Date.parse(site.manifest.local_collector.checked_at)>30*3600000) result += note('The Windows updater has not checked in for over 30 hours. Showing the last successful data. Updates resume when the PC is on, signed in and connected.', true);
    if (site.manifest?.source_pauses?.pred && !predAvailability()) result += note('Pred.gg update unavailable: ' + esc(site.manifest.source_pauses.pred), true);
    if (B && Date.now() - Date.parse(B.generated_at) > 30 * 3600000) result += note('This bundle is more than 30 hours old. The scheduled update may have failed or been delayed. Its source dates have not changed.', true);
    if (publicationChanged(entry)) result += note('Official patch content changed after this bundle was collected. Showing the previous dated statistics; written guidance needs review. ' + link(check.url, 'Latest official notes'), true);
    if (check?.announcements?.length) result += note('Upcoming: ' + check.announcements.map(a => link(a.url, 'v' + a.version) + ' · ' + esc(a.release_date || 'release date unconfirmed')).join('; ') + '. Announcements are separate from live data.');
    return result;
  }
  alerts = function() { return publishedAlerts() + originalAlerts(); };
  dataView = function() {
    return note((site.manifest?.collection_paused_reason ? 'Statistical updates are paused; the reason is displayed above. ' : 'Shared website: available sources update daily in the cloud, independently of your PC, with an extra collection after a live patch change. ') + 'Official patch checks run every three hours. Check updates loads the latest publication. It does not start a scrape. Calculated rankings and suggestions use that evidence; authored recommendations need a separate reviewed update. Your picks stay in this browser.') + (site.manifest?.optional_sources?.pred ? note(esc(site.manifest.optional_sources.pred.note)) : '') + oldDataView();
  };
  chrome = function() {
    originalChrome();
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
    $('#progress').textContent = latestStatus.message || 'Loading the latest published data…';
    $('#progress').classList.toggle('failed',!!latestStatus.errors?.some(e=>e.severity==='error'&&!/^Pred\.gg(?: |$)/.test(e.source||'')));
    if (!B && !latestStatus.busy) $('#main').innerHTML = empty(latestStatus.message || 'No successful publication is available for this bracket yet. Choose another bracket.');
  };
  render = function() {
    originalRender();
    if (!B && !latestStatus.busy) $('#main').innerHTML = empty(latestStatus.message || 'Loading the latest published data…');
    // Whatever caused this render, the main view now reflects the current evidence.
    site.drawnSignature = evidenceSignature(); site.pendingRedraw = false;
  };

  async function getJSON(url, signal) {
    const response = await fetch(url, {signal, cache: 'no-store', credentials: 'omit'});
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
    if (site.manifest?.patch_check?.status === 'failed') return {...raw, recommendation_context: {status:'withheld',reason:'The latest official patch check failed. Saved observations remain inspectable; automatic role comparisons await verification.'}, guidance: {...raw.guidance, status: 'needs verification: latest official patch check failed'}};
    if (!publicationChanged(entry)) return raw;
    // Preserve original source observations. Only the review-status overlay changes.
    return {...raw, recommendation_context: {status:'withheld',reason:'Official patch or hotfix content changed after this collection. Saved observations remain inspectable; automatic role comparisons await the new data.'}, guidance: {...raw.guidance, status: 'needs review: official patch content changed since collection'}};
  }
  // The main view must never keep showing advice the engine no longer supports. Redraw when the evidence
  // state differs from the one the view was drawn with; if the user is typing in the view, wait until focus
  // leaves the field. Every render records what it drew, so a deferred redraw is never lost, even when a
  // render replaces the focused field (WebKit fires no blur then) and the 5-minute timer retries it.
  function evidenceSignature() { try { const e = E.evidenceState(); return JSON.stringify([e.statistics.state, e.mechanics.state, e.verification.state, e.guidance.state, e.advice_mode, connectionLost]); } catch { return ''; } }
  function typingInMain(target) { const main = $('#main'); return !!target && !!main?.contains(target) && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName); }
  function redrawForEvidence() {
    if (evidenceSignature() === site.drawnSignature) { chrome(); return; }
    if (typingInMain(document.activeElement)) { chrome(); site.pendingRedraw = true; return; }
    render();
  }
  document.addEventListener('focusout', event => {
    // Moving between fields inside the view keeps the user's place; leaving the view's fields redraws.
    if (!site.pendingRedraw || typingInMain(event.relatedTarget)) return;
    setTimeout(() => { if (site.pendingRedraw && !typingInMain(document.activeElement)) render(); }, 0);
  });
  async function checkPublication() {
    const sequence = ++site.sequence, requested = S.bracket;
    site.controller?.abort();
    const controller = new AbortController(); site.controller = controller;
    const timeout = setTimeout(() => controller.abort(), 45000);
    latestStatus = {busy: true, message: 'Checking the latest ' + requested + ' publication…'}; chrome();
    try {
      const manifestResponse = await getJSON(siteURL(APP_CONFIG.manifest), controller.signal);
      connectionLost = manifestResponse.headers.get('X-Predecessor-Cache') === 'offline';
      const manifest = await manifestResponse.json();
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
      if (changed) E = MetaEngine.create(B);
      const coreUnavailable=entry.health?.core_statistics?.status==='unavailable';
      latestStatus = {busy: false, errors: errs, health: entry.health || manifest.health, checkedAt: new Date().toISOString(), message: (entry.collection_status==='partial'&&coreUnavailable?'Required source incomplete · ':entry.last_attempt?.status && !['ok','partial'].includes(entry.last_attempt.status)?'Latest collection failed · saved ':'Published ') + entry.label + ' · assembled ' + date(B.generated_at) + '. Core Statz health is separate from optional Pred.gg availability. Your draft is saved in this browser.'};
      if (connectionLost) latestStatus.message = 'Connection unavailable · saved publication. ' + latestStatus.message;
      site.lastCheck = Date.now(); if (changed) { render(); checkSharedPlan(); } else redrawForEvidence();
    } catch (error) {
      if (sequence !== site.sequence || requested !== S.bracket) return;
      if (site.originalBundle) { B = displayedBundle(site.originalBundle, site.loadedEntry); E = MetaEngine.create(B); }
      latestStatus = {busy: false, checkedAt: new Date().toISOString(), message: 'Update check failed. ' + (B ? 'The last loaded data remains usable.' : 'No data has loaded yet.'), errors: [{source: 'Shared website', severity: 'error', detail: controller.signal.aborted ? 'The publication request timed out. Try Reload latest data again.' : error.message}]};
      redrawForEvidence();
    } finally { clearTimeout(timeout); if (sequence === site.sequence) site.controller = null; }
  }
  function exportSnapshot() {
    if (!B) return;
    const root = exportShell.cloneNode(true), script = [...root.querySelectorAll('script')].find(s => s.textContent.startsWith('const INITIAL_BUNDLE='));
    if (!script?.textContent.startsWith('const INITIAL_BUNDLE=')) throw Error('Export template changed; cannot create a safe snapshot');
    const encode = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    script.textContent = 'const INITIAL_BUNDLE=' + encode(B) + '; const APP_CONFIG=' + encode({mode:'export',tool_version:APP_CONFIG.tool_version}) + ';';
    root.querySelectorAll('link[rel="manifest"],link[rel="apple-touch-icon"],link[rel="icon"]').forEach(link => link.remove());
    root.querySelectorAll('dialog[open]').forEach(d => d.removeAttribute('open'));
    const blob = new Blob(['<!doctype html>\n', root.outerHTML], {type:'text/html;charset=utf-8'});
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'Predecessor Meta - ' + S.bracket + '.html'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  document.addEventListener('click', event => {
    const id = event.target.closest('button')?.id;
    if (!['refresh','export','install-app'].includes(id)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (id === 'refresh') checkPublication();
    else if (id === 'install-app') installSharedApp().catch(error => toast(error.message));
    else try { exportSnapshot(); } catch (error) { toast(error.message); }
  }, true);
  document.addEventListener('change', async event => {
    const el = event.target;
    if (!['bracket','compare-bracket'].includes(el.id)) return;
    event.stopImmediatePropagation();
    if (el.id === 'bracket') {
      if (!allowed.includes(el.value)) return;
      S.bracket = el.value; save(); B = null; E = MetaEngine.create(null); revision = 0; site.originalBundle = null; site.loadedEntry = null; comparison = null;
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
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now()-site.lastCheck > 900000) checkPublication(); });
  window.addEventListener('focus', () => { if (Date.now()-site.lastCheck > 900000 && !site.controller) checkPublication(); });
  window.addEventListener('online', checkPublication);
  setInterval(() => { if (document.visibilityState === 'visible' && navigator.onLine && !site.controller) checkPublication(); }, 1800000);
  // Evidence ages even when no check succeeds (for example offline): re-evaluate it every five minutes.
  setInterval(() => { if (B && document.visibilityState === 'visible' && !site.controller) redrawForEvidence(); }, 300000);
  // Defer until the existing UI startup has created its shell.
  syncInstallButton();
  setTimeout(checkPublication, 0);
}
