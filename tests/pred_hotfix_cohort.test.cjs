'use strict';
// A Pred.gg cohort spanning a patch and its officially verified hotfix (1.17 + 1.17.1 = versions 167, 168) records
// every version on each observation ("167,168"). The engine must accept exactly that cohort and still exclude a row
// scoped to a different version set. Synthetic fixture; versions 166/167 stand in for any patch and its hotfix.
const test=require('node:test'),assert=require('node:assert/strict'),M=require('../engine.js'),{fixture}=require('./build_coach.test.cjs');
const me={slug:'hero',role:'jungle'},enemies=[{slug:'physical',role:'carry'},{slug:'magic',role:'midlane'},{slug:'healer',role:'support'},{slug:'shield',role:'offlane'}];
const NOW=Date.parse('2026-09-15T12:00:00Z');
function observed(b,{versionId='166,167',urlVersions='166%2C167'}={}){
 b.scoped_statistics={status:'ok',patch:'1.16.4',bracket_label:'Gold+',versions:['166','167'],hotfixes:['1.16.5'],ranks:['GOLD'],gameModes:['RANKED']};
 const tables=Object.fromEntries(['firstTier3','secondTier3','thirdTier3','fourthTier3','fifthTier3','sixthTier3'].map(k=>[k,[{name:'Armor',played:200,won:100,wr:50}]]));
 b.pred_game_data={role_data:{hero:{jungle:{items:{status:'ok',patch:'1.16.4',bracket:'Gold+',mode:'RANKED',role:'jungle',version_id:versionId,fetched_at:'2026-09-15T10:00:00Z',
  url:'https://pred.gg/heroes/hero/items?versions='+urlVersions+'&gameMode=RANKED&role=JUNGLE&ranks=GOLD',tables}}}}};
 return b;
}
test('an observation over the patch and its verified hotfix counts for that cohort',()=>{
 const a=M.create(observed(fixture())).adaptBuild(me,[],enemies,{now:NOW});
 assert.notEqual(a.itemEvidence.status,'scope mismatch');assert.notEqual(a.itemEvidence.status,'filter mismatch');
 assert.ok(a.itemEvidence.pool.armor,'the Armor observation reaches the item pool');
});
test('a row recorded for only one of the versions is excluded',()=>{
 const a=M.create(observed(fixture(),{versionId:'166',urlVersions:'166'})).adaptBuild(me,[],enemies,{now:NOW});
 assert.equal(a.itemEvidence.status,'scope mismatch');assert.deepEqual(a.itemEvidence.pool,{});
});
test('a URL whose versions differ from the recorded ones is excluded',()=>{
 const a=M.create(observed(fixture(),{urlVersions:'166'})).adaptBuild(me,[],enemies,{now:NOW});
 assert.equal(a.itemEvidence.status,'filter mismatch');
});
test('the performance label names the included hotfix',()=>{
 const b=observed(fixture());b.sources={pred_scoped:{status:'ok',fetched_at:'2026-09-15T10:00:00Z'}};
 const policy=M.create(b).performancePolicy({now:NOW});
 assert.equal(policy.source,'pred');assert.match(policy.label,/^Pred\.gg 1\.16\.4 \+ Hotfix 1\.16\.5 · Gold\+ Ranked$/);
});
