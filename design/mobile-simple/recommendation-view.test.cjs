'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {partnerShortlist,counterplay}=require('./recommendation-view.js');
const row=(slug,role,score)=>({slug,role,fit:{score}});
test('adds useful role variety without dropping the strongest partner or duplicating heroes',()=>{
 const rows=[row('a','support',10),row('b','support',9),row('c','support',8),row('d','support',8),row('e','offlane',7),row('f','midlane',7),row('g','support',6),row('h','carry',6)];
 const before=JSON.stringify(rows),out=partnerShortlist(rows);
 assert.deepEqual(out.map(r=>r.slug),['a','b','e','f','h']);assert.equal(new Set(out.map(r=>r.role)).size,4);assert.equal(JSON.stringify(rows),before);
});
test('does not promote a much weaker partner just to fill a role',()=>{
 const rows=[1,2,3,4,5].map(i=>row('s'+i,'support',10));rows.push(row('weak','carry',2));assert.ok(!partnerShortlist(rows).some(r=>r.slug==='weak'));
});
test('small lists and missing scores stay honest',()=>{
 assert.deepEqual(partnerShortlist([]),[]);assert.equal(partnerShortlist([row('a','midlane',null),row('a','support',5)]).length,1);
});
function engine({named=[],stats={},strategy=null}={}){return {heroStrategy:()=>strategy,counterIdeas:()=>named,currentMatchup:(ally,enemy,min)=>{assert.equal(ally.slug,'me');assert.equal(enemy.role,undefined);assert.equal(min,100);return stats[enemy.slug]||null;}};}
test('does not invent named counters when only counterplay advice exists',()=>{
 const r=counterplay(engine({strategy:{active:true,counterplay:'Bait the escape. Then commit.'}}),{me:{},other:{}},'me','jungle');assert.equal(r.picks.length,0);assert.equal(r.points.length,2);assert.equal(r.available,true);
});
test('above-50 or thin observations are not automatically called counters',()=>{
 const stats={good:{wr:54,played:999},thin:{wr:30,played:99},bad:{wr:44,played:100}};
 assert.deepEqual(counterplay(engine({stats}),{me:{},good:{},thin:{},bad:{}},'me','jungle').picks.map(r=>r.slug),['bad']);
});
test('reviewed and observed evidence stay separate with at most three unique opponents',()=>{
 const named=[{slug:'a',active:true,reason:'Bait the jump.'},{slug:'old',active:false}],stats={a:{wr:44,played:200},b:{wr:43,played:300},c:{wr:42,played:400},d:{wr:41,played:500}};
 const r=counterplay(engine({named,stats}),{me:{},a:{},b:{},c:{},d:{},old:{}},'me','jungle');assert.equal(r.picks.length,3);assert.equal(r.picks[0].evidenceKind,'reviewed');assert.equal(r.picks[0].observation.wr,44);assert.equal(r.picks[1].evidenceKind,'observed');assert.ok(!r.picks.some(x=>x.slug==='old'));
});
test('retains historical advice as inactive and condenses without deleting sentences',()=>{
 const r=counterplay(engine({strategy:{active:false,counterplay:'One. Two. Three. Four.'}}),{me:{}},'me','jungle');assert.deepEqual(r.points,['One.','Two.','Three. Four.']);assert.equal(r.strategy.active,false);assert.equal(r.available,true);
});
test('truly empty evidence can hide the shortcut without claiming counters do not exist',()=>{
 assert.equal(counterplay(engine(),{me:{}},'me','jungle').available,false);
});
