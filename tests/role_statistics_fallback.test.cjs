'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Meta=require('../engine.js');
const NOW=Date.parse('2026-09-22T06:00:00Z'),AT='2026-09-22T02:13:43Z';
function fixture(){return {patch:'1.16',bracket:{segment:'gold',label:'Gold+'},official:{status:'verified',live:{version:'1.17'}},guidance:{patch:'1.16.4',status:'needs review',builds:[]},sources:{statz_tierlist:{status:'ok',fetched_at:AT},statz_hero_pages:{status:'ok',fetched_at:AT}},heroes:{hero:{roles_order:['jungle','support'],roles:{jungle:{status:'ok',patch:'1.16',winRate:51.88,playedGames:12973,tier:'A',fetched_at:AT}}}},pairs:[]};}
test('patch rollover keeps dated observations visible without making them recommendation evidence',()=>{
 const b=fixture(),before=JSON.stringify(b),e=Meta.create(b),pick={slug:'hero',role:'jungle'};
 assert.equal(e.performance(pick),null);assert.equal(e.performancePolicy({now:NOW}).source,null);
 const p=e.displayPerformance(pick,{now:NOW});assert.equal(p.wr,51.88);assert.equal(p.played,12973);assert.equal(p.patch,'1.16');assert.equal(p.fetched_at,AT);assert.equal(p.inspection_only,true);
 assert.equal(e.evidenceState({now:NOW}).ranking_current,false);assert.equal(e.freshnessAreas({now:NOW})[0].state,'unavailable');
 assert.equal(e.assess([pick]).meanHeroWR,null);assert.equal(JSON.stringify(b),before);
});
test('no sample stays missing; invalid, future-dated, failed and conflicting rows stay missing',()=>{
 for(const change of [b=>b.heroes.hero.roles.jungle.winRate=null,b=>b.heroes.hero.roles.jungle.playedGames=0,b=>b.heroes.hero.roles.jungle.status='failed',b=>b.heroes.hero.roles.jungle.patch='1.15',b=>b.heroes.hero.roles.jungle.fetched_at='2026-09-23T00:00:00Z',b=>b.sources.statz_hero_pages.status='failed',b=>b.sources.statz_tierlist.fetched_at=null]){
  const b=fixture();change(b);assert.equal(Meta.create(b).displayPerformance({slug:'hero',role:'jungle'},{now:NOW}),null);
 }
 assert.equal(Meta.create(fixture()).displayPerformance({slug:'hero',role:'support'},{now:NOW}),null);
});
test('six brackets keep their own observations and fetch dates',()=>{
 for(const [i,rank] of ['bronze','silver','gold','platinum','diamond','paragon'].entries()){
  const b=fixture();b.bracket={segment:rank,label:rank+'+'};b.heroes.hero.roles.jungle.winRate=45+i;
  const e=Meta.create(b);assert.equal(e.displayPerformance({slug:'hero',role:'jungle'},{now:NOW}).wr,45+i);assert.match(e.displayPerformancePolicy({now:NOW}).label,new RegExp(rank));
 }
});
test('fresh current source takes priority; missing exact-cohort rows never borrow fallback samples',()=>{
 const b=fixture();b.patch='1.17';b.heroes.hero.roles.jungle.patch='1.17';const e=Meta.create(b);
 assert.equal(e.displayPerformancePolicy({now:NOW}).inspection_only,false);assert.equal(e.displayPerformance({slug:'hero',role:'jungle'},{now:NOW}).inspection_only,false);
 b.scoped_statistics={status:'ok',patch:'1.17',bracket:'gold',bracket_label:'Gold+',roles:{jungle:{rows:[]}}};b.sources.pred_scoped={status:'ok',fetched_at:AT};
 const pred=Meta.create(b);assert.equal(pred.displayPerformancePolicy({now:NOW}).source,'pred');assert.equal(pred.displayPerformance({slug:'hero',role:'jungle'},{now:NOW}),null);
});
test('retained or withheld observations are labelled, never revived as current advice',()=>{
 const b=fixture();b.sources.statz_hero_pages.status='retained';b.sources.statz_tierlist.status='retained';b.recommendation_context={status:'withheld',reason:'New official content'};
 const e=Meta.create(b);assert.equal(e.displayPerformancePolicy({now:NOW}).inspection_only,true);assert.equal(e.displayPerformance({slug:'hero',role:'jungle'},{now:NOW}).retained,true);assert.equal(e.performance({slug:'hero',role:'jungle'}),null);
});
