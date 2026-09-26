'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),M=require('../engine.js');
// Synthetic mechanics shared with build_coach.test.cjs; these fixtures never enter a published bundle.
function fixture({style='bruiser',finish=['D','E','F']}={}){
 const b={patch:'1.16',bracket:{segment:'gold',label:'Gold+'},official:{status:'verified',live:{version:'1.16.4'}},guidance:{patch:'1.16.4',status:'reviewed for current patch',builds:[]},heroes:{},items:{}};
 for(const n of ['A','B','C','D','E','F'])b.items[n]={name:n,completed_item:true,stats:{'Physical power':'30'},effects:[],total_price:3000};
 for(const [n,stats,condition,text] of [['Armor',{'Physical armor':'60'},'','Armor'],['Ward',{'Magical armor':'60'},'','Ward'],['Healcut',{'Physical power':'40'},'On dealing damage:','Reduce their healing by 40%.'],['Dart',{'Physical power':'50'},'','Deal damage to a shielded target.']])b.items[n]={name:n,completed_item:true,stats,effects:[{name:n,condition,text}],total_price:3000};
 b.heroes.hero={display_name:'hero',roles_order:['jungle'],roles:{},abilities:[{key:'Q',display_name:'hero ability',text:'Fixture hero'}],capabilities:['frontline','sustained'],capability_evidence:{physical:[{key:'Q',ability:'hero attack',reason:'Physical damage'}],magical:[]}};
 b.guidance.builds.push({slug:'hero',role:'jungle',patch:'1.16.4',core:['A','B','C'],finish,style,damage:'physical',blessings:[],source_preconditions:{abilities:{Q:'Fixture hero'}}});
 return b;
}
const me={slug:'hero',role:'jungle'};
const row=(r,id)=>r.rows.find(x=>x.id===id);

test('each team type swaps one flexible item and keeps the core',()=>{
 const b=fixture(),before=JSON.stringify(b),r=M.create(b).teamAlternates(me);
 assert.equal(r.available,true);
 for(const [id,to] of [['healing','Healcut'],['magical','Ward'],['physical','Armor'],['shields','Dart']]){
  const x=row(r,id);assert.equal(x.status,'swap',id);assert.equal(x.swaps.length,1);assert.equal(x.swaps[0].to,to);
  assert.ok(['D','E','F'].includes(x.swaps[0].from),id+' replaces a flexible slot, never the core');
 }
 assert.equal(JSON.stringify(b),before,'the bundle is not mutated');
 assert.match(r.note,/Not a win prediction/);
});
test('armor swaps cite the armor stat, not unrelated effect text',()=>{
 const r=M.create(fixture()).teamAlternates(me);
 assert.equal(row(r,'physical').swaps[0].evidence,'+60 physical armor.');
 assert.equal(row(r,'magical').swaps[0].evidence,'+60 magical armor.');
});
test('an answer already in the build is reported as covered, not swapped',()=>{
 const r=M.create(fixture({finish:['D','E','Healcut']})).teamAlternates(me),x=row(r,'healing');
 assert.equal(x.status,'covered');assert.deepEqual(x.coveredBy,['Healcut']);assert.deepEqual(x.earlier,{item:'Healcut',position:4},'a qualifying finish item is bought earlier, not replaced');
});
test('burst answers are for squishy builds and anti-basic-attack answers for frontliners',()=>{
 const tank=M.create(fixture({style:'bruiser'})).teamAlternates(me).rows.map(x=>x.id);
 assert.ok(!tank.includes('burst')&&!tank.includes('magic_burst'));assert.ok(tank.includes('basic_attacks'));
 const mage=M.create(fixture({style:'mage'})).teamAlternates(me).rows.map(x=>x.id);
 assert.ok(mage.includes('burst')&&mage.includes('magic_burst'));assert.ok(!mage.includes('basic_attacks'));
});
test('no alternates are offered when the reviewed build is not usable',()=>{
 const b=fixture();b.official.live.version='1.17';
 const r=M.create(b).teamAlternates(me);assert.equal(r.available,false);assert.deepEqual(r.rows,[]);assert.ok(r.reason);
});
