'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Meta=require('../engine.js');
// Synthetic mechanics only. No rates or match counts are assigned to the fixture.
function fixture(){
 const ref=(key,ability)=>({key,ability,reason:'Synthetic reviewed fixture'});
 const a={display_name:'Catcher',abilities:[{key:'Q',text:'Hold',display_name:'Hold'},{key:'LMB',text:'Attack',display_name:'Attack'}],capabilities:['hard_cc','sustained'],capability_evidence:{hard_cc:[ref('Q','Hold')],sustained:[ref('LMB','Attack')]}};
 const b={display_name:'Wall',abilities:[{key:'E',text:'Block projectiles; damage requires crossing',display_name:'Wall'}],capabilities:['burst','protection','peel'],capability_evidence:{burst:[ref('E','Wall')],protection:[ref('E','Wall')],peel:[ref('E','Wall')]}};
 const row=(slug,key,text,setup,followup)=>({slug,key,ability_text:text,setup,followup,readiness:'direct',control_window:'ordinary',note:'Reviewed fixture condition'});
 return {heroes:{catcher:a,wall:b},guidance:{patch:'1.16.4',status:'reviewed for current patch',sequence_review:{patch:'1.16.4',abilities:[row('catcher','Q','Hold','hold','none'),row('wall','E','Block projectiles; damage requires crossing','none','none')]}},official:{status:'verified',live:{version:'1.16.4'}}};
}
test('an explicitly excluded basic ability cannot convert a catch into damage',()=>{
 const f=fixture(),r=Meta.create(f).fit('catcher','wall');
 assert.equal(r.reasons.some(r=>r.kind==='catch conversion'),false);
 assert.ok(r.reasons.some(r=>r.kind==='attack time'));
 assert.equal(r.score,2);
});
test('actual impact follow-up remains eligible after the exclusion fix',()=>{
 const f=fixture();f.guidance.sequence_review.abilities[1].followup='impact';
 assert.ok(Meta.create(f).fit('catcher','wall').reasons.some(r=>r.kind==='catch conversion'));
});
test('changed protective text cannot retain reviewed time-buying credit',()=>{
 const f=fixture();f.heroes.wall.abilities[0].text='Changed source';
 const r=Meta.create(f).fit('catcher','wall');
 assert.equal(r.reasons.some(r=>r.kind==='attack time'||r.kind==='catch conversion'),false);
});
test('a reviewed non-control ability is not peel unless separately supported as protection',()=>{
 const f=fixture();delete f.heroes.wall.capability_evidence.protection;
 assert.equal(Meta.create(f).fit('catcher','wall').reasons.some(r=>r.kind==='attack time'),false);
});
