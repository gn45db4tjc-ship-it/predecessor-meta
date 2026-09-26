'use strict';
// Navigate through the visible destination and section controls. Legacy screen IDs remain
// stable, but they are no longer all buttons in the primary navigation (Stage 2b).
// Since 2.36.0 one Match screen replaces Compose, Draft and Live; their old IDs open Match.
const MATCH_ROUTES = ['match', 'planner', 'draft', 'live'];
async function goToScreen(page, route) {
  if(await page.locator('#mobile-navigation [data-destination="more"]:visible').count()){
    if(route==='meta'){await page.locator('#mobile-navigation [data-route="meta"]').click();return;}
    if(MATCH_ROUTES.includes(route)){await page.locator('#mobile-navigation [data-destination="match"]').click();return;}
    await page.locator('#mobile-navigation [data-destination="more"]').click();if(route!=='more')await page.locator(`#main [data-route="${route}"]`).first().click();
    return;
  }
  const destination = MATCH_ROUTES.includes(route) ? 'match'
    : ['builds','guidance','library','changes'].includes(route) ? 'reference'
    : ['data','more'].includes(route) ? 'sources' : 'meta';
  await page.locator(`[data-destination="${destination}"]:visible`).first().click();
  const defaultRoute = {meta:'meta',match:route,reference:'builds',sources:'data'}[destination];
  if (route !== defaultRoute) await page.locator(`#main .destination-sections [data-route="${route}"]`).first().click();
}
// Serialized into the old in-page acceptance suites. Only navigation setup changes;
// their item, evidence, build and recommendation assertions execute unchanged.
function legacyScreenClick(selector) {
  const match=/^\[data-route="([a-z]+)"\]$/.exec(selector);
  if(!match)return false;
  const route=match[1],toMatch=['match','planner','draft','live'].includes(route),destination=toMatch?'match':['builds','guidance','library','changes'].includes(route)?'reference':['data','more'].includes(route)?'sources':'meta';
  const primary=document.querySelector(`[data-destination="${destination}"]`);
  if(!primary)throw Error('Missing destination '+destination);
  primary.click();
  if(!toMatch&&route!=={meta:'meta',reference:'builds',sources:'data'}[destination]){
    const section=document.querySelector(`#main .destination-sections [data-route="${route}"]`);
    if(!section)throw Error('Missing section '+route);section.click();
  }
  return true;
}
module.exports = {goToScreen,legacyScreenClick};
