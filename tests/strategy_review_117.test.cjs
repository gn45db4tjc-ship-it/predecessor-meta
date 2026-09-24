'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Meta=require('../engine.js');
// Synthetic mechanics only: a current 1.17 strategy review beside a build review and an interim patch note.
const stamp='2026-09-22T00:00:00Z',review='2026-09-24T00:00:00Z';
function fixture(){
 const names=['One','Two','Three','Four','Five','Six'];
 const row={slug:'hero',role:'jungle',patch:'1.17',reviewed_at:stamp,core:names.slice(0,3),finish:names.slice(3),crest:'Crest',augment:'Augment',eternal:'Eternal',blessings:['First','Second'],skill_priority:['Primary','Alternate','Secondary'],why:'Reviewed delivery and economy',caution:'Conditional',patch_review:{reviewed_at:stamp,result:'checked and retained',limitation:'No current outcome sample.'},source_preconditions:{abilities:{Q:'Exact source kit'},items:{One:{completed_item:true}},perks:{Augment:'Exact definition'}}};
 const items=Object.fromEntries(names.map(n=>[n,{name:n,completed_item:true,stats:{},effects:[]}]));
 // The source lists the effect fields in a different order than the review recorded them.
 items.seven={name:'Seven',completed_item:true,stats:{},effects:[{text:'Deal bonus damage.',condition:'On hit:',cooldown:null,active:false,name:'Edge'}]};
 return {heroes:{hero:{display_name:'Hero',roles:{jungle:{status:'unavailable'}},roles_order:['jungle'],abilities:[{key:'Q',text:'Exact source kit'}],
   patch_context:{patch:'1.17',reviewed_at:'2026-09-22T23:00:00Z',summary:'Interim patch implications',active:true,source_abilities:{Q:'Exact source kit'},counters:[],partners:[]}}},
  items,perks:{},patch_support:{active:true},
  official:{status:'verified',live:{version:'1.17'},articles:[{version:'1.17',status:'live',fingerprint:'new'},{version:'1.16.4',status:'live',fingerprint:'previous'}]},
  guidance:{patch:'1.17',status:'reviewed for current patch',reviewed_at:review,builds:[row],
   strategic_review:{patch:'1.17',reviewed_at:review,heroes:{hero:{pick_when:'Full review: pick when the catch is set up',counterplay:'Full review counterplay',source_abilities:{Q:'Exact source kit'}}},counter_picks:[],
    build_adaptations:[{slug:'hero',role:'jungle',when:'Against shields',replace:'Six',item:'Seven',reason:'Reviewed swap',item_key:'seven',item_effects:[{name:'Edge',active:false,cooldown:null,condition:'On hit:',text:'Deal bonus damage.'}]}]},
   build_patch_review:{patch:'1.17',reviewed_at:stamp,article_fingerprints:{'1.17':'new','1.16.4':'previous'},loadout_catalog:{eternals:{Eternal:{BLESSING_MINOR_1:['First'],BLESSING_MINOR_2:['Second']}}},loadout_definitions:{Augment:{description:'Exact definition',sources:[{bracket:'silver',fetched_at:stamp}]}}}}};
}
const at=(iso,fn)=>{const real=Date.now;Date.now=()=>Date.parse(iso);try{return fn();}finally{Date.now=real;}};

test('an adaptation is compared by its effects, not by the order the source lists their fields',()=>at('2026-09-24T12:00:00Z',()=>{
 const e=Meta.create(fixture());
 assert.equal(e.buildReview('hero','jungle').active,true,'probe setup: the plan is active');
 assert.equal(e.buildAdaptations('hero','jungle')[0].active,true);
}));
test('a changed effect still withholds the adaptation',()=>at('2026-09-24T12:00:00Z',()=>{
 const b=fixture();b.items.seven.effects[0].text='Deal less damage.';
 assert.equal(Meta.create(b).buildAdaptations('hero','jungle')[0].active,false);
}));
test('a full strategy review of the same patch, completed after the interim patch note, is the hero strategy',()=>at('2026-09-24T12:00:00Z',()=>{
 const s=Meta.create(fixture()).heroStrategy('hero');
 assert.equal(s.active,true);assert.equal(s.pick_when,'Full review: pick when the catch is set up');
}));
test('the interim patch note still wins over an older or withheld strategy review',()=>at('2026-09-24T12:00:00Z',()=>{
 for(const mutate of [b=>{b.guidance.strategic_review.reviewed_at='2026-09-22T00:00:00Z';b.guidance.reviewed_at='2026-09-22T00:00:00Z';},
                      b=>{b.guidance.strategic_review.heroes.hero.source_abilities={Q:'Changed kit'};},
                      b=>{b.guidance.status='needs review';}]){
  const b=fixture();mutate(b);const s=Meta.create(b).heroStrategy('hero');
  assert.equal(s.active,true,'probe setup: the interim note itself stays active');
  assert.equal(s.pick_when,'Interim patch implications');
 }
}));
