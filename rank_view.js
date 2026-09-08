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
    return `<div class="note rank-evidence"><strong>Selected statistics: ${esc(selectedRankLabel())} · ${esc(B.scoped_statistics?.patch || 'patch unavailable')}</strong><br>Role, build and matchup observations use this rank selection where the source supplies a sample. Kit-based recommendations have no rank-specific win rate.${reference && !matchingRankReview() ? ` The authored tier review covers ${esc(reference)}; it is reference advice for this selection.` : ''}</div>`;
  }
  chrome = function() {
    rankOriginal.chrome();
    if (!B || matchingRankReview() || !B.guidance?.meta_review) return;
    const cell = $('#patch-strip .patch-cell:last-child');
    if (cell) cell.innerHTML = `<div><small>WRITTEN GUIDANCE · ${esc(B.guidance.meta_review.bracket_label)} REFERENCE</small><strong>${esc(B.guidance.patch ? 'v'+B.guidance.patch : 'Not reviewed')}</strong></div><span class="status-pill">${esc(B.guidance.status || 'Needs review')} · tiers do not cover ${esc(selectedRankLabel())}</span>`;
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
    const sort = (f,t) => `<th aria-sort="${field === f ? (direction === 1 ? 'ascending' : 'descending') : 'none'}"><button data-sort="${f}">${t}${field === f ? (direction === 1 ? ' ↑' : ' ↓') : ''}</button></th>`;
    const review = B.guidance?.meta_review;
    return head('Selected rank · observed performance', label+' meta', 'These are '+esc(label)+' role samples. Sort win rates or games, then open a hero for builds, partners and counters.') +
      `<div class="toolbar"><label>Performance source <select id="performance-source">${options([['current','Pred.gg · exact current patch'],['statz','Statz · broader dataset & tier grades']],S.statSource)}</select></label></div>` +
      `<div class="toolbar"><div class="tabs" role="tablist" aria-label="Role">${roleOrder.map(r=>`<button role="tab" data-meta-role="${r}" aria-selected="${S.role===r}">${labels[r]}</button>`).join('')}</div><input id="hero-search" type="search" placeholder="Find a hero…" aria-label="Search heroes" value="${esc(S.query)}"></div>` +
      (c.status !== 'ok' ? note('Current-patch source '+esc(c.status || 'not collected')+'. Available rows retain their own sample; no other rank is substituted.',true) : '') +
      `<div class="toolbar"><span>${esc(c.patch)} · Ranked · ${esc(label)} · ${rows.length} hero/role entries</span><label><input id="full-metrics" type="checkbox" ${S.full?'checked':''}> Show wins & uncertainty</label></div>` +
      `<div class="panel table-panel"><table class="meta-table" data-rank-table="${esc(B.bracket.segment)}"><thead><tr>${sort('hero','Hero')}${sort('winRate','Win rate')}${sort('matches','Games')}${S.full?'<th>Wins</th><th>95% interval · observed rate</th>':''}<th>Explore</th></tr></thead><tbody>${rows.map(r=>`<tr data-rank-hero="${esc(r.slug)}"><td>${heroButton(r.slug,r.role)}</td><td><strong>${pct(r.winRate)}</strong>${r.matches<100?'<small class="warning">Exploratory · under 100 games</small>':''}</td><td>${num(r.matches,0)}</td>${S.full?`<td>${num(r.wonGames,0)}</td><td>${r.interval95?r.interval95.map(pct).join('–'):'Unavailable'}</td>`:''}<td><button class="quiet" data-hero="${esc(r.slug)}" data-role="${r.role}">Builds & pairings ↗</button></td></tr>`).join('')}</tbody></table>${!rows.length?empty(c.roles?.[S.role]?.error || 'No rows match this role and search.'):''}</div>` +
      `<p class="source-line">${link(c.roles?.[S.role]?.url, 'Pred.gg · '+label+' source')} · fetched ${esc(date(c.roles?.[S.role]?.fetched_at))}</p><p class="footer">Win-rate ordering is an observed comparison, not a reviewed best-pick tier list. Samples under 100 games are exploratory. ${esc(c.scope_note || '')}</p>` +
      (review ? `<details class="rank-reference"><summary>Separate authored reference · ${esc(review.bracket_label)} tiers and working pool</summary><div class="detail-content"><p>The written tier review was made for ${esc(review.bracket_label)}. It has not been re-reviewed for ${esc(label)}; the table above uses ${esc(label)} statistics. Kit and build reasoning remains available on hero pages.</p>${rankOriginal.rolePriorityHTML()}${rankOriginal.metaReviewMethod()}</div></details>` : '');
  };
  buildsPageView = function() { return rankEvidenceNote() + rankOriginal.buildsPageView(); };
  heroView = function() { return rankEvidenceNote() + rankOriginal.heroView(); };
  plannerView = function() { return rankEvidenceNote() + rankOriginal.plannerView(); };
  draftView = function() { return rankEvidenceNote() + rankOriginal.draftView(); };
  liveView = function() { return rankEvidenceNote() + rankOriginal.liveView(); };
  guidanceView = function() { return rankEvidenceNote() + rankOriginal.guidanceView(); };
}
