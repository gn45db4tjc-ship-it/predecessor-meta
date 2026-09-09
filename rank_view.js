// Rank-aware presentation shared by the website and its standalone exports.
// Uses the selected bundle only; never changes observations or extends an authored review's scope.
if (APP_CONFIG.mode === 'static' || APP_CONFIG.mode === 'export') {
  const rankOriginal = {chrome, metaView, metaTierButton, metaDecisionHTML, rolePriorityHTML,
    metaReviewMethod, buildsPageView, heroView, plannerView, draftView, liveView, guidanceView};
  function selectedRankLabel() { return B?.scoped_statistics?.bracket_label || B?.bracket?.label || 'Rank unavailable'; }
  function matchingRankReview() {
    const review = B?.guidance?.meta_review;
    return !!review && review.bracket === B.bracket?.segment && review.bracket_label === B.scoped_statistics?.bracket_label;
  }
  function rankEvidenceNote() {
    if (!B) return '';
    const reference = B.guidance?.meta_review?.bracket_label;
    return `<div class="note rank-evidence"><strong>Statistics: ${esc(selectedRankLabel())} · ${esc(B.scoped_statistics?.patch || 'patch unavailable')}</strong> · role, build and matchup samples use this rank where the source supplies one; kit-based recommendations have no rank-specific win rate.${reference && !matchingRankReview() ? ` The authored tier review covers ${esc(reference)} and is reference advice here.` : ''}</div>`;
  }
  chrome = function() {
    rankOriginal.chrome();
    if (!B || matchingRankReview() || !B.guidance?.meta_review) return;
    const cell = $('#patch-strip .patch-cell:last-child');
    if (cell) cell.innerHTML = `<div><small>Guidance · ${esc(B.guidance.meta_review.bracket_label)} reference</small><strong>${esc(B.guidance.patch ? 'v'+B.guidance.patch : 'Not reviewed')}</strong></div><span class="status-pill">${esc(B.guidance.status || 'Needs review')} · tiers do not cover ${esc(selectedRankLabel())}</span>`;
  };
  rolePriorityHTML = function() { return matchingRankReview() ? rankOriginal.rolePriorityHTML() : ''; };
  metaTierButton = function(slug, role) {
    if (matchingRankReview()) return rankOriginal.metaTierButton(slug, role);
    const review = E.metaReview(slug, role);
    return review ? `<button class="quiet" data-meta-decision="${esc(slug+'|'+role)}">${esc(review.bracket)} reference<small>No reviewed tier for ${esc(selectedRankLabel())}</small></button>` : '<small>No authored tier review</small>';
  };
  metaDecisionHTML = function(slug, role) {
    return (matchingRankReview() ? '' : rankEvidenceNote()) + rankOriginal.metaDecisionHTML(slug, role);
  };
  metaView = function() {
    // Preserve the existing verified-patch gate and separately labelled Statz view.
    if (!B || matchingRankReview() || S.statSource === 'statz' || !B.scoped_statistics ||
        B.official?.status !== 'verified' || B.scoped_statistics.patch !== B.official?.live?.version) return rankOriginal.metaView();
    const c = B.scoped_statistics, label = selectedRankLabel();
    const rows = (c.rows || []).filter(r => r.role === S.role && name(r.slug).toLowerCase().includes(S.query.toLowerCase()));
    // No authored tier exists for this cohort: sort its own observations, never missing tier values.
    if (!['hero','matches','winRate'].includes(S.sort)) { S.sort = 'winRate'; S.direction = -1; }
    const field = S.sort, direction = S.direction;
    rows.sort((a,b) => {
      const x = field === 'hero' ? name(a.slug) : a[field], y = field === 'hero' ? name(b.slug) : b[field];
      if (x == null && y == null) return name(a.slug).localeCompare(name(b.slug));
      if (x == null) return 1; if (y == null) return -1;
      return (typeof x === 'string' ? x.localeCompare(y) : x-y) * direction || name(a.slug).localeCompare(name(b.slug));
    });
    const review = B.guidance?.meta_review;
    const table = `<div class="toolbar"><span>${esc(c.patch)} · Ranked · ${esc(label)} · ${rows.length} ${labels[S.role].toLowerCase()} entries</span><label><input id="full-metrics" type="checkbox" ${S.full?'checked':''}> Show wins & uncertainty</label></div>` +
      metaTableHTML(rows, {tier:false, field, direction, emptyText: c.roles?.[S.role]?.error || 'No rows match this role and search.'}) +
      `<p class="source-line"><span>${link(c.roles?.[S.role]?.url, 'Pred.gg · '+label+' source')} · fetched ${esc(date(c.roles?.[S.role]?.fetched_at))}</span><span>Win-rate order is an observed comparison, not a reviewed tier</span></p>`;
    const aside = `<aside class="meta-aside">${review ? `<details class="rank-reference"><summary>Separate authored reference · ${esc(review.bracket_label)} tiers and working pool</summary><div class="detail-content"><p>The written tier review was made for ${esc(review.bracket_label)}. It has not been re-reviewed for ${esc(label)}; the table uses ${esc(label)} statistics. Kit and build reasoning remains available on hero pages.</p>${rankOriginal.rolePriorityHTML()}${rankOriginal.metaReviewMethod()}</div></details>` : ''}<details><summary>Statistics source</summary><div class="detail-content"><p class="muted">Pred.gg supplies the exact current-patch cohort for ${esc(label)}. The Statz view shows its broader dataset with tier grades; the two are never pooled.</p><label>Statistics source <select id="performance-source">${options([['current','Pred.gg · exact current patch'],['statz','Statz · broader dataset & tier grades']],S.statSource)}</select></label></div></details><p class="footer">Samples under 100 games are exploratory. ${esc(c.scope_note || '')}</p></aside>`;
    return head('Meta · '+label, label+' meta', 'These are '+esc(label)+' role samples. Sort win rates or games, then open a hero for partners, builds and counters.') +
      metaToolbarHTML() +
      (c.status !== 'ok' ? note('Current-patch source '+esc(c.status || 'not collected')+'. Available rows retain their own sample; no other rank is substituted.',true) : '') +
      `<div class="meta-layout"><div>${table}</div>${aside}</div>`;
  };
  buildsPageView = function() { return rankEvidenceNote() + rankOriginal.buildsPageView(); };
  heroView = function() { return rankEvidenceNote() + rankOriginal.heroView(); };
  plannerView = function() { return rankEvidenceNote() + rankOriginal.plannerView(); };
  draftView = function() { return rankEvidenceNote() + rankOriginal.draftView(); };
  liveView = function() { return rankEvidenceNote() + rankOriginal.liveView(); };
  guidanceView = function() { return rankEvidenceNote() + rankOriginal.guidanceView(); };
}
