'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Meta=require('../engine.js');
// Synthetic fixtures only; never included in the published data.
function fixture(){
 const b={patch:'1.16',official:{status:'verified',live:{version:'1.16.4'}},
  sources:{statz_tierlist:{status:'ok',fetched_at:'2026-09-14T10:00:00Z'},statz_hero_pages:{status:'ok',fetched_at:'2026-09-14T10:00:00Z'}},
  guidance:{patch:'1.16.4',status:'reviewed for current patch',builds:[]},heroes:{},items:{},perks:{}};
 for(const n of ['A','B','C','D','E','F','Crest'])b.items[n]={name:n,completed_item:n!=='Crest',stats:{power:1},effects:[{name:'Test',text:'Fixture effect'}]};
 for(const n of ['Augment','Eternal','First','Second'])b.perks[n]={name:n,description:'Synthetic '+n};
 for(const [slug,role,wr] of [['core','jungle',50],['experimental','support',99],['regular','support',50],['official','midlane',50]]){
  b.heroes[slug]={display_name:slug,roles_order:[role],abilities:[{key:'Q',text:'Synthetic control',display_name:'Test'}],capabilities:[],roles:{[role]:{status:'ok',winRate:wr,playedGames:200}}};
  b.guidance.builds.push({slug,role,patch:'1.16.4',core:['A','B','C'],finish:['D','E','F'],crest:'Crest',augment:'Augment',eternal:'Eternal',blessings:['First','Second'],
   experimental_role:slug==='experimental',auto_recommend:slug!=='experimental',
   source_preconditions:{abilities:{Q:'Synthetic control'},items:Object.fromEntries(Object.entries(b.items).map(([n,it])=>[n,structuredClone({stats:it.stats,effects:it.effects,completed_item:it.completed_item})])),perks:Object.fromEntries(Object.entries(b.perks).map(([n,p])=>[n,p.description]))}});
 }
 return b;
}
test('exact mechanics activate a reviewed plan without mutating observations',()=>{
 const b=fixture(),before=JSON.stringify(b),e=Meta.create(b);
 assert.equal(e.buildReview('experimental','support').active,true);
 assert.equal(e.plannedBuild('experimental','support').kind,'reviewed');
 assert.equal(JSON.stringify(b),before);
});
for(const kind of ['ability','item','perk'])test(kind+' change withholds the review within the same patch',()=>{
 const b=fixture();
 if(kind==='ability')b.heroes.experimental.abilities[0].text+=' changed';
 if(kind==='item')b.items.A.effects[0].text+=' changed';
 if(kind==='perk')b.perks.First.description+=' changed';
 const r=Meta.create(b).buildReview('experimental','support');
 assert.equal(r.active,false);assert.match(r.status,/mechanics changed/);assert.equal(r.changed.length,1);
});
test('object key order and fresh timestamps do not invalidate equivalent mechanics',()=>{
 const b=fixture();b.items.A={...b.items.A,effects:[{text:'Fixture effect',name:'Test'}],fetched_at:'2026-09-15T10:00:00Z'};
 assert.equal(Meta.create(b).buildReview('experimental','support').active,true);
});
test('experimental high rate cannot enter automatic picks or partners',()=>{
 const e=Meta.create(fixture());
 assert.deepEqual(e.recommend([],{role:'support',metric:'meta'}).map(c=>c.picks[0].slug),['regular']);
 assert.ok(!e.partners('core',{heroRole:'jungle',role:'support'}).combined.some(r=>r.slug==='experimental'));
 assert.ok(e.recommend([],{role:'midlane'}).some(c=>c.picks[0].slug==='official'));
});
test('manual experimental locks survive generation with unique roles; substitution excludes experiments',()=>{
 const e=Meta.create(fixture()),lock={slug:'experimental',role:'support'};
 const result=e.generate([lock],{size:3,width:5,includeUnsampled:true});
 assert.ok(result.alternatives.length);
 for(const c of result.alternatives){assert.ok(c.picks.some(p=>p.slug===lock.slug));assert.equal(new Set(c.picks.map(p=>p.role)).size,3);}
 const options=e.substitute([{slug:'core',role:'jungle'},{slug:'regular',role:'support'}],'support',{includeUnsampled:true});
 assert.ok(!options.alternatives.some(c=>c.picks.some(p=>p.slug==='experimental')));
});
test('older plans without preconditions retain existing behavior',()=>{
 const b=fixture();delete b.guidance.builds[0].source_preconditions;
 assert.equal(Meta.create(b).buildReview('core','jungle').active,true);
});

test('only explicitly reviewed equivalent perk wording is accepted',()=>{
 const b=fixture();b.guidance.perk_wording_reviews=[{name:'Augment',patch:'1.16.4',descriptions:['Synthetic Augment','Equivalent synthetic wording']}];
 b.perks.Augment.description='Equivalent synthetic wording';
 assert.equal(Meta.create(b).buildReview('core','jungle').active,true);
 b.perks.Augment.description='Changed amount';
 assert.equal(Meta.create(b).buildReview('core','jungle').active,false);
 b.perks.Augment.description='Equivalent synthetic wording';b.guidance.perk_wording_reviews[0].patch='1.16.3';
 assert.equal(Meta.create(b).buildReview('core','jungle').active,false);
});
