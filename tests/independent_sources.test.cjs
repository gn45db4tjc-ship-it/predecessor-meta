'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Meta=require('../engine.js');
function fixture(status='retained') {
  return {heroes:{example:{slug:'example',display_name:'Synthetic fixture',roles_order:['jungle'],roles:{}}},
    official:{status:'verified',live:{version:'test-patch'}},bracket:{segment:'gold'},
    scoped_statistics:{status,patch:'test-patch',bracket_label:'Gold+',gameModes:['RANKED'],versions:['test-version'],
      roles:{jungle:{rows:[{slug:'example',winRate:50,matches:200,fetched_at:'2026-09-08T12:00:00Z'}]}}},
    guidance:{patch:'test-patch',status:'reviewed for current patch',meta_review:{patch:'test-patch',bracket:'gold',bracket_label:'Gold+',mode:'RANKED',
      entries:[{slug:'example',role:'jungle',tier:'A',evidence:{winRate:50}}]}},
    pred_game_data:{status,role_data:{example:{jungle:{items:{}}}}}};
}
test('explicit retained performance inspection preserves original observations and date',()=>{
  const r=Meta.create(fixture()).performance({slug:'example',role:'jungle'},{source:'pred'});
  assert.equal(r.retained,true);assert.equal(r.wr,50);assert.equal(r.played,200);assert.equal(r.fetched_at,'2026-09-08T12:00:00Z');
});
test('retained observations cannot silently reaffirm an authored tier',()=>{
  const r=Meta.create(fixture()).metaReview('example','jungle');
  assert.equal(r.active,false);assert.equal(r.tier,null);assert.equal(r.reviewed_tier,'A');assert.match(r.status,/Retained sample/);
});
test('fresh matching evidence keeps the ordinary review behavior',()=>{
  const r=Meta.create(fixture('ok')).metaReview('example','jungle');assert.equal(r.active,true);assert.equal(r.tier,'A');
});
test('retained item evidence cannot add current item-fit points',()=>{
  const r=Meta.create(fixture()).currentItemPool('example','jungle');assert.deepEqual(r.pool,{});assert.equal(r.status,'scope mismatch');
});
test('missing role sample stays unavailable',()=>{
  const b=fixture();b.scoped_statistics.roles.jungle.rows=[];
  assert.equal(Meta.create(b).performance({slug:'example',role:'jungle'}),null);
});
test('changed live patch withholds retained role performance',()=>{
  const b=fixture();b.official.live.version='next-patch';
  assert.equal(Meta.create(b).performance({slug:'example',role:'jungle'}),null);
});
test('missing observed rate never becomes a displayed zero',()=>{
  const b=fixture();delete b.scoped_statistics.roles.jungle.rows[0].winRate;
  assert.equal(Meta.create(b).performance({slug:'example',role:'jungle'}),null);
});
