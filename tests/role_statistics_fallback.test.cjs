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
test('seven brackets keep their own observations and fetch dates',()=>{
 for(const [i,rank] of ['bronze','silver','gold','platinum','diamond','master','paragon'].entries()){
  const b=fixture();b.bracket={segment:rank,label:rank[0].toUpperCase()+rank.slice(1)+'+'};b.heroes.hero.roles.jungle.winRate=45+i;
  const e=Meta.create(b);assert.equal(e.displayPerformance({slug:'hero',role:'jungle'},{now:NOW}).wr,45+i);assert.match(e.displayPerformancePolicy({now:NOW}).label,new RegExp(rank,'i'));
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
test('discontinued Paragon+ Statz observations stay dated and inspection-only while Pred.gg Paragon+ stays current',()=>{
 const b=fixture();b.patch='1.18';b.official.live.version='1.18';b.bracket={segment:'paragon',label:'Paragon+'};b.heroes.hero.roles.jungle.patch='1.18';
 b.sources.statz_tierlist={status:'discontinued',discontinued_after_patch:'1.18',fetched_at:AT};
 b.sources.statz_hero_pages={status:'discontinued',discontinued_after_patch:'1.18',fetched_at:AT};
 const e=Meta.create(b),dp=e.displayPerformancePolicy({now:NOW}),perf=e.displayPerformance({slug:'hero',role:'jungle'},{now:NOW});
 assert.equal(e.performance({slug:'hero',role:'jungle'}),null);
 assert.equal(e.performancePolicy({now:NOW}).source,null);
 assert.match(e.performancePolicy({now:NOW}).note,/statz\.gg stopped publishing Paragon\+ after Patch 1\.18/);
 assert.equal(dp.source,'statz');assert.equal(dp.inspection_only,true);assert.equal(dp.saved,true);
 assert.match(dp.note,/statz\.gg stopped publishing Paragon\+ after Patch 1\.18; Statz figures here are from 2026-09-22T02:13:43Z and are not current\./);
 assert.equal(perf.retained,true);assert.equal(perf.inspection_only,true);
 assert.match(e.freshnessAreas({now:NOW})[1].reason,/statz\.gg stopped publishing Paragon\+ after Patch 1\.18/);
 // When Pred.gg is available for Paragon+, Pred.gg leads as current without mapping Paragon to Master or Diamond.
 b.scoped_statistics={status:'ok',patch:'1.18',bracket:'paragon',bracket_label:'Paragon+',roles:{jungle:{rows:[{slug:'hero',role:'jungle',winRate:54.2,matches:120,fetched_at:AT,url:'https://pred.gg/heroes/hero'}]}}};
 b.sources.pred_scoped={status:'ok',fetched_at:AT};
 const withPred=Meta.create(b);
 assert.equal(withPred.performancePolicy({now:NOW}).source,'pred');
 assert.equal(withPred.performancePolicy({now:NOW}).saved,false);
 assert.match(withPred.performancePolicy({now:NOW}).label,/Paragon\+ Ranked/);
 assert.equal(withPred.displayPerformance({slug:'hero',role:'jungle'},{now:NOW}).source,'Pred.gg');
 assert.equal(withPred.displayPerformance({slug:'hero',role:'jungle'},{now:NOW}).inspection_only,false);
});
