'use strict';
// Navigate through the visible destination and section controls. Legacy screen IDs remain
// stable, but they are no longer all buttons in the primary navigation (Stage 2b).
async function goToScreen(page, route) {
  const destination = ['planner','draft','live'].includes(route) ? 'plan'
    : ['builds','guidance','library','changes'].includes(route) ? 'reference'
    : ['data','more'].includes(route) ? 'sources' : 'meta';
  await page.locator(`[data-destination="${destination}"]:visible`).first().click();
  const defaultRoute = {meta:'meta',plan:'planner',reference:'builds',sources:'data'}[destination];
  if (route !== defaultRoute) await page.locator(`#main .destination-sections [data-route="${route}"]`).first().click();
}
// Serialized into the old in-page acceptance suites. Only navigation setup changes;
// their item, evidence, build and recommendation assertions execute unchanged.
function legacyScreenClick(selector) {
  const match=/^\[data-route="([a-z]+)"\]$/.exec(selector);
  if(!match)return false;
  const route=match[1],destination=['planner','draft','live'].includes(route)?'plan':['builds','guidance','library','changes'].includes(route)?'reference':['data','more'].includes(route)?'sources':'meta';
  const primary=document.querySelector(`[data-destination="${destination}"]`);
  if(!primary)throw Error('Missing destination '+destination);
  primary.click();
  if(route!=={meta:'meta',plan:'planner',reference:'builds',sources:'data'}[destination]){
    const section=document.querySelector(`#main .destination-sections [data-route="${route}"]`);
    if(!section)throw Error('Missing section '+route);section.click();
  }
  return true;
}
module.exports = {goToScreen,legacyScreenClick};
