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

const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),vm=require('node:vm');
const ROOT=path.resolve(__dirname,'..');
const UI_SCRIPTS=['engine.js','recommendation_view.js','companion_state.js','skill_guide.js','ui.js','mobile.js','companion_simple.js','rank_view.js']
 .reduce((acc,f)=>({...acc,[f]:fs.readFileSync(path.join(ROOT,f),'utf8')}),{});
const SEED=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT,'public-seed-gold.json.gz'))));

function stubEl(){
 return {
  innerHTML:'',textContent:'',value:'',open:false,dataset:{},
  classList:{add:()=>{},remove:()=>{},toggle:()=>{},contains:()=>false},
  setAttribute:()=>{},removeAttribute:()=>{},getAttribute:()=>null,hasAttribute:()=>false,
  addEventListener:()=>{},close:()=>{},showModal:()=>{},focus:()=>{},
  querySelector:()=>stubEl(),querySelectorAll:()=>[]
 };
}
function createUIRunner(mode,bundle,fixedIso='2026-11-15T12:00:00Z'){
 const fixedMs=Date.parse(fixedIso),RealDate=Date;
 class MockDate extends RealDate{
  constructor(...args){super(...(args.length?args:[fixedMs]));}
  static now(){return fixedMs;}
 }
 const els=new Map(),getEl=sel=>{if(!els.has(sel))els.set(sel,stubEl());return els.get(sel);};
 const ctx={
  INITIAL_BUNDLE:bundle,APP_CONFIG:{mode,revision:1},CSS:{escape:s=>String(s)},
  Date:MockDate,structuredClone,Intl,Math,Number,String,Array,Object,Set,Map,JSON,RegExp,Error,parseFloat,parseInt,isFinite,encodeURIComponent,
  innerWidth:1440,innerHeight:900,
  localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},location:{hash:''},
  addEventListener:()=>{},requestAnimationFrame:()=>0,
  matchMedia:()=>({matches:false,addEventListener:()=>{}}),
  window:{addEventListener:()=>{},scrollTo:()=>{},matchMedia:()=>({matches:false,addEventListener:()=>{}})},
  document:{visibilityState:'hidden',documentElement:stubEl(),body:stubEl(),querySelector:getEl,querySelectorAll:()=>[],addEventListener:()=>{}},
  fetch:async()=>({ok:false}),setInterval:()=>0,clearInterval:()=>{},setTimeout:()=>0,clearTimeout:()=>{}
 };
 vm.createContext(ctx);
 for(const f of ['engine.js','recommendation_view.js','companion_state.js','skill_guide.js'])vm.runInContext(UI_SCRIPTS[f],ctx);
 const uiHooked=UI_SCRIPTS['ui.js'].replace('// START CLIENT',
  'globalThis.__hooks={setS:v=>Object.assign(S,v),metaView:()=>metaView(),statzMetaView:()=>statzMetaView(statisticsSelectorHTML()),heroView:()=>heroView(),buildsView:(h,r)=>buildsView(h,r),buildsPageView:()=>buildsPageView(),mobileStatusHTML:()=>mobileStatusHTML(),disc:k=>statzDiscontinuedMessage(B,k)};/*')+'*/';
 vm.runInContext(uiHooked,ctx);
 vm.runInContext(UI_SCRIPTS['mobile.js'],ctx);
 vm.runInContext(UI_SCRIPTS['companion_simple.js'],ctx);
 if(mode==='static'||mode==='export')vm.runInContext(UI_SCRIPTS['rank_view.js'],ctx);
 return ctx.__hooks;
}

test('R1: Paragon+ Meta claims Pred.gg Ranked remains current only when Pred.gg is eligible and current across desktop and rank views',()=>{
 const baseParagon=()=>{
  const b=structuredClone(SEED);
  b.bracket={segment:'paragon',label:'Paragon+'};b.patch='1.18';
  b.official={...b.official,status:'verified',live:{...b.official.live,version:'1.18'}};
  b.sources={...b.sources,statz_tierlist:{status:'discontinued',discontinued_after_patch:'1.18',fetched_at:null},statz_hero_pages:{status:'discontinued',discontinued_after_patch:'1.18',fetched_at:null}};
  b.tier_list=[];
  return b;
 };
 const row={slug:'steel',role:'jungle',winRate:53.5,matches:180,wonGames:96,fetched_at:'2026-11-15T11:00:00Z',url:'https://pred.gg/heroes/steel'};
 const cases=[
  {name:'fresh',expectCurrent:true,apply:b=>{
   b.scoped_statistics={source:'Pred.gg',status:'ok',patch:'1.18',bracket:'paragon',bracket_label:'Paragon+',rows:[row],roles:{jungle:{status:'ok',fetched_at:'2026-11-15T11:00:00Z',url:'https://pred.gg/heroes',rows:[row]}}};
   b.sources.pred_scoped={status:'ok',fetched_at:'2026-11-15T11:00:00Z'};
  }},
  {name:'unavailable (with patch)',expectCurrent:false,apply:b=>{
   b.scoped_statistics={source:'Pred.gg',status:'unavailable',patch:'1.18',bracket:'paragon',bracket_label:'Paragon+',rows:[],roles:{}};
   b.sources.pred_scoped={status:'unavailable',fetched_at:null};
  }},
  {name:'unavailable (uncollected)',expectCurrent:false,apply:b=>{
   b.scoped_statistics={source:'Pred.gg',status:'unavailable',rows:[],roles:{}};
   b.sources.pred_scoped={status:'unavailable',fetched_at:null};
  }},
  {name:'failed (with patch)',expectCurrent:false,apply:b=>{
   b.scoped_statistics={source:'Pred.gg',status:'failed',patch:'1.18',bracket:'paragon',bracket_label:'Paragon+',rows:[],roles:{}};
   b.sources.pred_scoped={status:'failed',fetched_at:null};
  }},
  {name:'failed (uncollected)',expectCurrent:false,apply:b=>{
   b.scoped_statistics={source:'Pred.gg',status:'failed',rows:[],roles:{}};
   b.sources.pred_scoped={status:'failed',fetched_at:null};
  }},
  {name:'absent',expectCurrent:false,apply:b=>{
   delete b.scoped_statistics;delete b.sources.pred_scoped;
  }},
  {name:'retained (recent <=30h)',expectCurrent:false,apply:b=>{
   b.scoped_statistics={source:'Pred.gg',status:'retained',patch:'1.18',bracket:'paragon',bracket_label:'Paragon+',rows:[row],roles:{jungle:{status:'retained',fetched_at:'2026-11-15T10:00:00Z',rows:[row]}}};
   b.sources.pred_scoped={status:'retained',fetched_at:'2026-11-15T10:00:00Z'};
  }},
  {name:'retained (scoped retained with source ok)',expectCurrent:false,apply:b=>{
   b.scoped_statistics={source:'Pred.gg',status:'retained',patch:'1.18',bracket:'paragon',bracket_label:'Paragon+',rows:[row],roles:{jungle:{status:'ok',fetched_at:'2026-11-15T10:00:00Z',rows:[row]}}};
   b.sources.pred_scoped={status:'ok',fetched_at:'2026-11-15T10:00:00Z'};
  }},
  {name:'retained (old >30h)',expectCurrent:false,apply:b=>{
   b.scoped_statistics={source:'Pred.gg',status:'retained',patch:'1.18',bracket:'paragon',bracket_label:'Paragon+',rows:[{...row,fetched_at:'2026-11-05T12:00:00Z'}],roles:{jungle:{status:'retained',fetched_at:'2026-11-05T12:00:00Z',rows:[{...row,fetched_at:'2026-11-05T12:00:00Z'}]}}};
   b.sources.pred_scoped={status:'retained',fetched_at:'2026-11-05T12:00:00Z'};
  }},
  {name:'old (aging 40h)',expectCurrent:false,apply:b=>{
   b.scoped_statistics={source:'Pred.gg',status:'ok',patch:'1.18',bracket:'paragon',bracket_label:'Paragon+',rows:[{...row,fetched_at:'2026-11-13T20:00:00Z'}],roles:{jungle:{status:'ok',fetched_at:'2026-11-13T20:00:00Z',rows:[{...row,fetched_at:'2026-11-13T20:00:00Z'}]}}};
   b.sources.pred_scoped={status:'ok',fetched_at:'2026-11-13T20:00:00Z'};
  }},
  {name:'old (stale 5 Nov)',expectCurrent:false,apply:b=>{
   b.scoped_statistics={source:'Pred.gg',status:'ok',patch:'1.18',bracket:'paragon',bracket_label:'Paragon+',rows:[{...row,fetched_at:'2026-11-05T12:00:00Z'}],roles:{jungle:{status:'ok',fetched_at:'2026-11-05T12:00:00Z',rows:[{...row,fetched_at:'2026-11-05T12:00:00Z'}]}}};
   b.sources.pred_scoped={status:'ok',fetched_at:'2026-11-05T12:00:00Z'};
  }},
  {name:'old (previous patch cohort)',expectCurrent:false,apply:b=>{
   b.scoped_statistics={source:'Pred.gg',status:'ok',patch:'1.17',bracket:'paragon',bracket_label:'Paragon+',rows:[row],roles:{jungle:{status:'ok',fetched_at:'2026-11-15T11:00:00Z',rows:[row]}}};
   b.sources.pred_scoped={status:'ok',fetched_at:'2026-11-15T11:00:00Z'};
  }}
 ];
 for(const mode of ['local','static']){
  for(const c of cases){
   const b=baseParagon();c.apply(b);
   const ui=createUIRunner(mode,b,'2026-11-15T12:00:00Z');
   ui.setS({statSource:'current',role:'jungle'});
   const html=ui.metaView();
   assert.match(html,/statz\.gg stopped publishing Paragon\+ after Patch 1\.18/,`${mode} / ${c.name}: discontinuation notice missing`);
   if(c.expectCurrent){
    assert.ok(html.includes('Pred.gg Ranked remains current for Paragon+.'),`${mode} / ${c.name}: expected current Pred.gg claim`);
    assert.ok(!html.includes('Paragon+ remains selectable for Pred.gg.'),`${mode} / ${c.name}: unexpected selectable-only fallback`);
   }else{
    assert.ok(html.includes('Paragon+ remains selectable for Pred.gg.'),`${mode} / ${c.name}: expected selectable-only notice`);
    assert.ok(!html.includes('Pred.gg Ranked remains current'),`${mode} / ${c.name}: must not claim Pred.gg remains current`);
   }
  }
 }
});

test('R2: legacy Paragon 1.18 bundle with Statz marked ok (5 Nov dates) excludes automatic Statz builds and stays inspection-only in engine and UI',()=>{
 const NOV5='2026-11-05T12:00:00Z',CHECK_AT=Date.parse('2026-11-15T12:00:00Z');
 const legacy=structuredClone(SEED);
 legacy.bracket={segment:'paragon',label:'Paragon+'};
 legacy.patch='1.18';
 legacy.official={...legacy.official,status:'verified',live:{...legacy.official.live,version:'1.18'}};
 legacy.sources.statz_tierlist={...legacy.sources.statz_tierlist,status:'ok',fetched_at:NOV5};
 delete legacy.sources.statz_tierlist.discontinued_after_patch;
 legacy.sources.statz_hero_pages={...legacy.sources.statz_hero_pages,status:'ok',fetched_at:NOV5};
 delete legacy.sources.statz_hero_pages.discontinued_after_patch;
 for(const h of Object.values(legacy.heroes||{})){
  if(h.hero_wide_fetched_at)h.hero_wide_fetched_at=NOV5;
  for(const r of Object.values(h.roles||{}))if(r?.fetched_at){r.fetched_at=NOV5;r.patch='1.18';}
 }
 legacy.scoped_statistics={source:'Pred.gg',status:'unavailable',patch:'1.18',bracket:'paragon',bracket_label:'Paragon+',rows:[],roles:{}};
 legacy.sources.pred_scoped={status:'unavailable',fetched_at:null};

 const before=JSON.stringify(legacy);
 const eng=Meta.create(legacy);
 for(const now of [CHECK_AT,Date.parse('2026-11-05T13:00:00Z')]){
  const pol=eng.performancePolicy({now}),dp=eng.displayPerformancePolicy({now}),perf=eng.displayPerformance({slug:'adele',role:'offlane'},{now});
  assert.equal(pol.source,null);
  assert.match(pol.note,/statz\.gg stopped publishing Paragon\+ after Patch 1\.18; Pred\.gg is unavailable or retained\. Statz figures here are from 2026-11-05T12:00:00Z and are not current/);
  assert.equal(dp.source,'statz');
  assert.equal(dp.inspection_only,true);
  assert.equal(dp.saved,true);
  assert.equal(dp.currency,'retained');
  assert.match(dp.note,/statz\.gg stopped publishing Paragon\+ after Patch 1\.18; Statz figures here are from 2026-11-05T12:00:00Z and are not current\./);
  assert.equal(eng.performance({slug:'adele',role:'offlane'}),null);
  assert.equal(perf.inspection_only,true);
  assert.equal(perf.retained,true);
  assert.match(eng.freshnessAreas({now})[1].reason,/statz\.gg stopped publishing Paragon\+ after Patch 1\.18; Statz pair figures here are from 2026-11-05T12:00:00Z/);
 }
 const autoBuild=eng.plannedBuild('adele','offlane');
 assert.deepEqual(autoBuild.items,[]);
 assert.equal(autoBuild.title,'Build recommendation unavailable');
 const inspectedBuild=eng.plannedBuild('adele','offlane',{index:0,forceObserved:true});
 assert.equal(inspectedBuild.items.length,6);
 assert.equal(inspectedBuild.title,'Selected source playstyle');
 assert.equal(JSON.stringify(legacy),before,'engine must never mutate legacy bundle');

 for(const mode of ['local','static']){
  const ui=createUIRunner(mode,legacy,'2026-11-15T12:00:00Z');
  assert.match(ui.disc('statz_hero_pages'),/statz\.gg stopped publishing Paragon\+ after Patch 1\.18; Statz figures here are from .* and are not current\./);
  ui.setS({statSource:'auto',role:'offlane'});
  const autoMeta=ui.metaView();
  assert.ok(autoMeta.includes('Previous dataset · 1.18'),`${mode}: legacy Paragon Statz Meta must show Previous dataset`);
  assert.match(autoMeta,/statz\.gg stopped publishing Paragon\+ after Patch 1\.18; Statz figures here are from .* and are not current\./);

  ui.setS({statSource:'current',role:'offlane'});
  const currentMeta=ui.metaView();
  assert.ok(currentMeta.includes('Paragon+ remains selectable for Pred.gg.'));
  assert.ok(!currentMeta.includes('Pred.gg Ranked remains current'));

  ui.setS({statSource:'auto',route:'hero',hero:'adele',heroRole:'offlane',heroTab:'builds'});
  const heroHtml=ui.heroView();
  assert.ok(heroHtml.includes('Build recommendation unavailable'),`${mode}: hero page must not auto-recommend discontinued Statz build`);
  assert.ok(!heroHtml.includes('Provisional starting build'),`${mode}: hero page must not render Provisional starting build from discontinued Statz`);
  const variantsHtml=ui.buildsView(legacy.heroes.adele,legacy.heroes.adele.roles.offlane);
  assert.match(variantsHtml,/statz\.gg stopped publishing Paragon\+ after Patch 1\.18/);
  assert.match(variantsHtml,/Saved /);
  assert.ok(variantsHtml.includes('Fist Of Razuul'),`${mode}: explicit Statz variant inspection remains available`);

  const statusHtml=ui.mobileStatusHTML();
  assert.ok(statusHtml.includes('Previous data'));
  assert.match(statusHtml,/statz\.gg stopped publishing Paragon\+ after Patch 1\.18/);
 }
 assert.equal(JSON.stringify(legacy),before,'UI must never mutate legacy bundle');
});
