'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),M=require('../engine.js');
// Synthetic mechanics; these fixtures never enter a published bundle.
function fixture(){
 const b={patch:'1.16',bracket:{segment:'gold',label:'Gold+'},official:{status:'verified',live:{version:'1.16.4'}},guidance:{patch:'1.16.4',status:'reviewed for current patch',builds:[]},heroes:{},items:{}};
 for(const n of ['A','B','C','D','E','F'])b.items[n]={name:n,completed_item:true,stats:{'Physical power':'30'},effects:[],total_price:3000};
 for(const [n,stats,condition,text] of [['Armor',{'Physical armor':'60'},'','Armor'],['Ward',{'Magical armor':'60'},'','Ward'],['Healcut',{'Physical power':'40'},'On dealing damage:','Reduce their healing by 40%.'],['Dart',{'Physical power':'50'},'','Deal damage to a shielded target.']])b.items[n]={name:n,completed_item:true,stats,effects:[{name:n,condition,text}],total_price:3000};
 for(const [s,r,c] of [['hero','jungle',['frontline','sustained']],['physical','carry',['sustained']],['magic','midlane',['burst']],['healer','support',['ally_healing']],['shield','offlane',['ally_shield']]])b.heroes[s]={display_name:s,roles_order:[r],roles:{},abilities:[{key:'Q',display_name:s+' ability',text:'Fixture '+s}],capabilities:c,capability_evidence:{physical:s==='magic'?[]:[{key:s==='physical'?'LMB':'Q',ability:s+' attack',reason:'Physical damage'}],magical:s==='magic'?[{key:'Q',ability:'Spell',reason:'Magical damage'}]:[]}};
 b.guidance.builds.push({slug:'hero',role:'jungle',patch:'1.16.4',core:['A','B','C'],finish:['D','E','F'],style:'bruiser',damage:'physical',blessings:[],source_preconditions:{abilities:{Q:'Fixture hero'}}});
 return b;
}
const me={slug:'hero',role:'jungle'},enemies=[{slug:'physical',role:'carry'},{slug:'magic',role:'midlane'},{slug:'healer',role:'support'},{slug:'shield',role:'offlane'}];
for(const state of ['ahead','even','behind'])for(const priority of ['','physical_armor','magical_armor','anti_heal','anti_shield'])test(state+' / '+(priority||'normal')+' keeps core and at most two flexible positions',()=>{
 const b=fixture(),original=JSON.stringify(b),a=M.create(b).adaptBuild(me,[],enemies,{state,priority,primaryThreat:'magic'});
 assert.equal(a.available,true);assert.deepEqual(a.slots.slice(0,3).map(s=>s.name),['A','B','C']);assert.equal(a.slots.length,6);assert.equal(new Set(a.slots.map(s=>s.name)).size,6);
 assert.ok(a.slots.slice(3).filter((s,i)=>s.name!==['D','E','F'][i]).length<=2);assert.equal(JSON.stringify(b),original);assert.equal(a.nextPurchase.name,'A');assert.equal(a.wr,undefined);
});
test('ahead without explicit need preserves the complete offensive path',()=>assert.deepEqual(M.create(fixture()).adaptBuild(me,[],enemies,{state:'ahead'}).slots.map(s=>s.name),['A','B','C','D','E','F']));
test('primary threat activates a single-enemy armor consideration',()=>{const a=M.create(fixture()).adaptBuild(me,[],[enemies[1]],{primaryThreat:'magic'});assert.ok(a.needs.some(n=>n.id==='magical_armor'));assert.ok(a.explanations.some(t=>t.includes('Spell')));});
test('owned items remain in inventory and next purchase is unowned',()=>{const a=M.create(fixture()).adaptBuild(me,[],enemies,{owned:['A','D']});assert.deepEqual(a.slots.slice(0,2).map(s=>s.name),['A','D']);assert.equal(a.nextPurchase.name,'B');});
test('six owned items never trigger sale or an additional purchase',()=>{const a=M.create(fixture()).adaptBuild(me,[],[],{owned:['A','B','C','D','E','F']});assert.equal(a.nextPurchase,null);assert.equal(a.slots.length,6);});
test('inventory that leaves no room for core is unavailable rather than silently discarding core',()=>{const a=M.create(fixture()).adaptBuild(me,[],[],{owned:['D','E','F','Armor']});assert.equal(a.available,false);assert.match(a.unavailableReason,/insufficient slots/);});
for(const context of [{state:'winning'},{owned:['A','A']},{owned:['fake']},{priority:'tenacity'},{primaryThreat:'fake'}])test('invalid context rejected '+JSON.stringify(context),()=>assert.throws(()=>M.create(fixture()).adaptBuild(me,[],enemies,context)));
test('unknown role and conflicting enemies rejected',()=>{const e=M.create(fixture());assert.throws(()=>e.adaptBuild({...me,role:'support'}));assert.throws(()=>e.adaptBuild(me,[],[enemies[0],enemies[0]]));});
for(const mutation of ['patch','mechanics','missing','inactive'])test(mutation+' invalidates automatic advice without fallback',()=>{const b=fixture();if(mutation==='patch')b.official.live.version='1.17';if(mutation==='mechanics')b.heroes.hero.abilities[0].text='Changed';if(mutation==='missing')b.guidance.builds=[];if(mutation==='inactive')b.items.A.available_current_patch=false;const a=M.create(b).adaptBuild(me);assert.equal(a.available,false);assert.equal(a.nextPurchase,null);assert.deepEqual(a.slots,[]);assert.ok(a.unavailableReason);});
test('compatibility wrapper returns the same advice',()=>{const e=M.create(fixture());assert.deepEqual(e.liveBuild(me,[],[],{state:'even'}),e.adaptBuild(me,[],[],{state:'even'}));});
function observed(b,{games=200,at='2026-09-15T10:00:00Z',bracket='Gold+'}={}){
 b.scoped_statistics={status:'ok',patch:'1.16.4',bracket_label:'Gold+',versions:['166'],ranks:['GOLD']};
 b.bracket.label=bracket;
 b.pred_game_data={role_data:{hero:{jungle:{items:{status:'ok',patch:'1.16.4',bracket:'Gold+',mode:'RANKED',role:'jungle',version_id:'166',fetched_at:at,url:'https://pred.gg/heroes/hero/items?versions=166&gameMode=RANKED&role=JUNGLE&ranks=GOLD',tables:Object.fromEntries(['firstTier3','secondTier3','thirdTier3','fourthTier3','fifthTier3','sixthTier3'].map(k=>[k,[{name:'Armor',played:games,won:Math.floor(games/2),wr:100*Math.floor(games/2)/games}]]))}}}}};
}
for(const [label,options,eligible] of [['qualified',{},true],['thin',{games:99},false],['old',{at:'2026-09-12T10:00:00Z'},false],['future',{at:'2026-09-19T10:00:00Z'},false]])test(label+' sample influence follows date and minimum threshold',()=>{const b=fixture();observed(b,options);const a=M.create(b).adaptBuild(me,[],enemies,{now:Date.parse('2026-09-15T12:00:00Z')});assert.equal(a.itemEvidence.pool.armor.supports_current_fit,eligible);});
test('another bracket cannot influence flexible purchases',()=>{const b=fixture();observed(b,{bracket:'Diamond+'});const a=M.create(b).adaptBuild(me,[],enemies);assert.deepEqual(a.itemEvidence.pool,{});assert.equal(a.itemEvidence.status,'scope mismatch');});
module.exports={fixture};
