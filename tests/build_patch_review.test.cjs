'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Meta=require('../engine.js');
// Deliberately old global strategy + a newer independently reviewed build.
const stamp='2026-09-22T00:00:00Z';
function fixture(){
 const names=['One','Two','Three','Four','Five','Six'];
 const row={slug:'hero',role:'jungle',patch:'1.17',reviewed_at:stamp,core:names.slice(0,3),finish:names.slice(3),crest:'Crest',augment:'Augment',eternal:'Eternal',blessings:['First','Second'],skill_priority:['Primary','Alternate','Secondary'],why:'Reviewed delivery and economy',caution:'Conditional',patch_review:{reviewed_at:stamp,result:'checked and retained',limitation:'No current outcome sample.'},source_preconditions:{abilities:{Q:'Exact source kit'},items:{One:{completed_item:true}},perks:{Augment:'Exact definition'}}};
 return {heroes:{hero:{display_name:'Hero',roles:{jungle:{status:'unavailable'}},roles_order:['jungle'],abilities:[{key:'Q',text:'Exact source kit'}]}},items:Object.fromEntries(names.map(n=>[n,{name:n,completed_item:true,stats:{},effects:[]} ])),perks:{},official:{status:'verified',live:{version:'1.17'},articles:[{version:'1.17',status:'live',fingerprint:'new'},{version:'1.16.4',status:'live',fingerprint:'previous'}]},guidance:{patch:'1.16.4',status:'needs review',reviewed_at:'2026-09-14T00:00:00Z',builds:[row],build_patch_review:{patch:'1.17',reviewed_at:stamp,article_fingerprints:{'1.17':'new','1.16.4':'previous'},loadout_catalog:{eternals:{Eternal:{BLESSING_MINOR_1:['First'],BLESSING_MINOR_2:['Second']}}},loadout_definitions:{Augment:{description:'Exact definition',sources:[{bracket:'silver',fetched_at:stamp}]}}}}};
}
test('a build-only review restores a starting build without refreshing global strategy or any observations',()=>{
 const b=fixture(),before=structuredClone(b),e=Meta.create(b),p=e.plannedBuild('hero','jungle');
 assert.equal(p.kind,'reviewed');assert.equal(p.items.length,6);assert.equal(p.reviewed_at,stamp);
 assert.equal(b.guidance.patch,'1.16.4');assert.equal(b.guidance.status,'needs review');assert.deepEqual(b,before);
 assert.equal(e.freshnessAreas({slug:'hero',role:'jungle'})[2].state,'current');
});
test('2.37.1 perk index: a perk definition edited in the same engine is read live, never from an obsolete copy',()=>{
 const b=fixture();b.perks.augment={display_name:'Augment',description:'Exact definition'};const e=Meta.create(b);
 assert.equal(e.buildReview('hero','jungle').active,true);
 b.perks.augment.description='Changed definition';const r=e.buildReview('hero','jungle');
 assert.equal(r.active,false);assert.deepEqual(r.changed,['Loadout Augment']);
});
test('an absent rank-local definition can use separate mechanics evidence but a conflict cannot',()=>{
 let b=fixture();assert.equal(Meta.create(b).buildReview('hero','jungle').active,true);
 b.perks.augment={display_name:'Augment',description:'Changed definition'};const r=Meta.create(b).buildReview('hero','jungle');
 assert.equal(r.active,false);assert.deepEqual(r.changed,['Loadout Augment']);
});
test('same-version hotfix edits, future reviews, announced patches and missing article dependencies withhold endorsement',()=>{
 for(const mutate of [b=>b.official.articles[0].fingerprint='edited',b=>b.official.articles[0].status='announced',b=>b.official.articles.pop(),b=>b.official.live.version='1.17.1',b=>b.official.status='unverified',b=>b.guidance.builds[0].reviewed_at='2099-01-01T00:00:00Z',b=>b.guidance.build_patch_review.reviewed_at='2099-01-01T00:00:00Z',b=>b.recommendation_context={status:'withheld'}]){
  const b=fixture();mutate(b);assert.equal(Meta.create(b).buildReview('hero','jungle').active,false);
 }
});
test('unresolved review states a specific reason and does not become a current recommendation',()=>{
 const b=fixture();Object.assign(b.guidance.builds[0].patch_review,{result:'unresolved',limitation:'The specialist role remains unresolved.'});const e=Meta.create(b),p=e.plannedBuild('hero','jungle');
 assert.equal(p.kind,'provisional');assert.deepEqual(p.items,[]);assert.match(p.reason,/specialist role/);assert.equal(e.buildReview('hero','jungle').active,false);
});
test('a missing item or incompatible blessing still prevents the independent build',()=>{
 for(const mutate of [b=>delete b.items.One,b=>b.guidance.builds[0].blessings[0]='Wrong tree',b=>b.heroes.hero.abilities[0].text='New mechanics']){
  const b=fixture();mutate(b);assert.equal(Meta.create(b).buildReview('hero','jungle').active,false);
 }
});
test('editing a published plan in the same engine inputs never reuses an obsolete review result',()=>{
 const b=fixture(),e=Meta.create(b);assert.equal(e.buildReview('hero','jungle').active,true);b.official.articles[1].fingerprint='new-hotfix';assert.equal(e.buildReview('hero','jungle').active,false);
});
