'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Meta=require('../engine.js');
// Entire fixture is synthetic. Deliberately reversed rates expose stale-source ranking.
function fixture(){
 const b={patch:'1.16',bracket:{segment:'gold',label:'Gold+'},heroes:{},pairs:{},
  official:{status:'verified',live:{version:'1.16.4'}},
  sources:{statz_tierlist:{status:'ok',fetched_at:'2026-09-14T19:52:00Z'},statz_hero_pages:{status:'ok',fetched_at:'2026-09-14T19:53:00Z'},pred_scoped:{status:'retained',fetched_at:'2026-09-08T10:00:00Z'}},
  scoped_statistics:{status:'retained',patch:'1.16.4',bracket_label:'Gold+',gameModes:['RANKED'],versions:['166'],roles:{jungle:{rows:[]}}},
  pred_game_data:{status:'retained',role_data:{}},
  guidance:{status:'reviewed for current patch',meta_review:{patch:'1.16.4',bracket:'gold',bracket_label:'Gold+',mode:'RANKED',entries:[]}}};
 for(const [slug,wr,old] of [['one',55,40],['two',45,60]]){
  b.heroes[slug]={slug,display_name:slug,roles_order:['jungle'],abilities:[],capabilities:[],roles:{jungle:{status:'ok',winRate:wr,playedGames:200,tier:'A',fetched_at:'2026-09-14T19:52:20Z',url:'https://statz.gg/fixture/'+slug,builds:[{perk:'test',eternal:'test',lane_counters:[{name:slug==='one'?'two':'one',winRate:wr,playedGames:120}]}]}}};
  b.scoped_statistics.roles.jungle.rows.push({slug,winRate:old,matches:1000,fetched_at:'2026-09-08T10:00:00Z'});
  b.guidance.meta_review.entries.push({slug,role:'jungle',tier:'A',evidence:{winRate:old}});
  b.pred_game_data.role_data[slug]={jungle:{counters:{status:'ok',patch:'1.16.4',role:'jungle',mode:'RANKED',bracket:'Gold+',version_id:'166',url:'https://pred.gg/fixture/'+slug,fetched_at:'2026-09-08T10:00:00Z',tables:{counters:{cohort_verified:true,rows:[{slug:slug==='one'?'two':'one',wr:old,played:1000}]}}}}};
 }
 return b;
}
test('automatic role ordering uses available Statz without changing either source',()=>{
 const b=fixture(),before=JSON.stringify(b),e=Meta.create(b);
 assert.equal(e.performancePolicy().source,'statz');
 assert.match(e.performancePolicy().note,/exact match window.*unconfirmed/);
 assert.equal(e.performance({slug:'one',role:'jungle'}).wr,55);
 assert.equal(e.performance({slug:'one',role:'jungle'}).fetched_at,'2026-09-14T19:52:20Z');
 assert.equal(e.performance({slug:'one',role:'jungle'},{source:'pred'}).wr,40);
 const recommendations=e.recommend([],{role:'jungle',metric:'meta'});
 assert.equal(recommendations[0].picks[0].slug,'one');
 assert.equal(recommendations[0].meanHeroWR,55);
 assert.equal(JSON.stringify(b),before);
});
test('broader-source movement cannot reaffirm or move a Pred.gg authored tier',()=>{
 const b=fixture(),e=Meta.create(b),review=e.metaReview('one','jungle');
 assert.equal(review.active,false);assert.equal(review.evidenceMoved,false);
 assert.equal(review.current.wr,40);assert.equal(review.reviewed_tier,'A');
});
test('fresh exact cohort regains priority without pooling with Statz',()=>{
 const b=fixture();b.scoped_statistics.status='ok';b.sources.pred_scoped.status='ok';
 const e=Meta.create(b);assert.equal(e.performancePolicy().source,'pred');
 assert.equal(e.recommend([],{role:'jungle',metric:'meta'})[0].picks[0].slug,'two');
 assert.equal(e.metaReview('one','jungle').active,true);
});
test('a valid partial exact cohort keeps its available roles and leaves absent roles missing',()=>{
 const b=fixture();b.scoped_statistics.status='partial';b.scoped_statistics.roles.jungle.rows.pop();
 const e=Meta.create(b);assert.equal(e.performancePolicy().source,'pred');
 assert.equal(e.performance({slug:'one',role:'jungle'}).wr,40);
 assert.equal(e.performance({slug:'two',role:'jungle'}),null);
});
test('retained, undated, failed or prior-family Statz is excluded from automatic recommendations',()=>{
 for(const change of [b=>b.sources.statz_hero_pages.status='retained',b=>b.sources.statz_tierlist.status='failed',b=>delete b.sources.statz_hero_pages.fetched_at,b=>b.patch='1.15',b=>b.official.status='failed']){
  const b=fixture();change(b);const e=Meta.create(b);
  assert.equal(e.performancePolicy().source,null);assert.equal(e.performance({slug:'one',role:'jungle'}),null);
  assert.equal(e.recommend([],{role:'jungle',metric:'meta'})[0].meanHeroWR,null);
 }
});
test('missing Statz role does not inherit the retained Pred.gg role',()=>{
 const b=fixture();delete b.heroes.one.roles.jungle;
 assert.equal(Meta.create(b).performance({slug:'one',role:'jungle'}),null);
});
test('invalid or missing observations never become a zero rate',()=>{
 for(const change of [r=>delete r.winRate,r=>r.winRate=101,r=>r.winRate=NaN,r=>r.playedGames=null,r=>r.playedGames=0,r=>r.playedGames=true]){
  const b=fixture();change(b.heroes.one.roles.jungle);
  assert.equal(Meta.create(b).performance({slug:'one',role:'jungle'}),null);
 }
});
test('retained counters stay inspectable but cannot order current draft recommendations',()=>{
 const e=Meta.create(fixture()),ally={slug:'one',role:'jungle'},enemy={slug:'two',role:'jungle'};
 const rows=e.matchup(ally,enemy),old=rows.find(r=>r.source==='Pred.gg');
 assert.equal(old.wr,40);assert.equal(old.played,1000);assert.equal(old.retained,true);
 assert.match(old.label,/Retained/);assert.equal(e.currentMatchup(ally,enemy),null);
 const recommended=e.recommend([],{role:'jungle',enemies:[enemy],metric:'matchup'});
 assert.equal(recommended[0].candidateMetrics.matchupMin,null);
});
test('Live game prefers an available same-role observation over retained Pred.gg',()=>{
 const e=Meta.create(fixture()),r=e.bestMatchup({slug:'one',role:'jungle'},{slug:'two',role:'jungle'});
 assert.equal(r.source,'Statz');assert.equal(r.wr,55);assert.equal(r.played,120);
 assert.match(r.limitation,/does not identify the opponent role/);
});
test('fresh partial Pred.gg matchup remains usable per valid role page',()=>{
 const b=fixture();b.pred_game_data.status='partial';b.scoped_statistics.status='partial';
 const r=Meta.create(b).currentMatchup({slug:'one',role:'jungle'},{slug:'two',role:'jungle'});
 assert.equal(r.wr,40);assert.equal(r.retained,false);
});
test('different enemy role never turns Statz lane lists into cross-role evidence',()=>{
 const e=Meta.create(fixture()),rows=e.matchup({slug:'one',role:'jungle'},{slug:'two',role:'midlane'});
 assert.equal(rows.filter(r=>r.source==='Statz').length,0);
});
test('empty startup bundle has no invented role statistics',()=>{
 const e=Meta.create(null);assert.equal(e.performancePolicy().source,null);
 assert.equal(e.performance({slug:'one',role:'jungle'}),null);
});
test('legacy or incomplete metadata cannot make a role sample automatically eligible',()=>{
 const b=fixture();delete b.scoped_statistics;delete b.sources;
 const e=Meta.create(b);assert.equal(e.performancePolicy().source,null);
 assert.equal(e.performance({slug:'one',role:'jungle'}),null);
 assert.equal(e.performance({slug:'one',role:'jungle'},{source:'statz'}).wr,55);
});
test('a newer publication patch check withholds old role and draft comparisons',()=>{
 const b=fixture();b.scoped_statistics.status='ok';b.pred_game_data.status='ok';
 b.recommendation_context={status:'withheld',reason:'Official content changed since collection.'};
 const e=Meta.create(b);
 assert.equal(e.performancePolicy().source,null);assert.equal(e.performance({slug:'one',role:'jungle'}),null);
 assert.equal(e.currentMatchup({slug:'one',role:'jungle'},{slug:'two',role:'jungle'}),null);
 assert.equal(e.performance({slug:'one',role:'jungle'},{source:'pred'}).wr,40);
});
