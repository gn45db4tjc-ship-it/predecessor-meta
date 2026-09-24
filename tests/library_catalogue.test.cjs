'use strict';
// Items & loadouts catalogue (E.libraryCatalog). On the live 1.17 ranks Pred.gg's catalogue was empty (collection
// failed) while the bundle still held 270 item and 206 perk definitions from Statz, Omeda.city and official reviews,
// and the screen showed "Showing 0 of 0 entries" with "No entries match this search". The catalogue must fall back to
// those definitions, name each one's source, report why Pred.gg is absent, and never relabel or invent a value.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),M=require('../engine.js');
const seed=()=>JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname,'..','public-seed-gold.json.gz'))));
// The shape the six published 1.17 ranks carry: Pred.gg collected but failed, with empty catalogue maps.
function livePausedShape(){
 return {heroes:{},patch:'1.16',
  sources:{pred_game_data:{status:'failed',fetched_at:'2026-09-23T14:41:13-05:00'},statz_hero_pages:{status:'ok',fetched_at:'2026-09-23T14:41:01-05:00'},omeda_items:{status:'ok',fetched_at:'2026-09-23T14:40:46-05:00'}},
  pred_game_data:{status:'failed',source:'Pred.gg',cohort:{patch:'1.17'},errors:[{source:'Pred.gg game data',severity:'error',detail:'Pred.gg catalog hero join failed'}],heroes:{},items:{},perks:{},role_data:{}},
  items:{
   absolution:{name:'Absolution',total_price:3100,item_meta:{rarity:'Epic'},metadata_source:'https://omeda.city/items.json'},
   'alchemical-rod':{name:'Alchemical Rod',total_price:1150,source:'omeda.city/items.json'},
   'no-price':{name:'Mystery Shard',item_meta:{rarity:null}}},
  perks:{
   'abyssal-mantle':{display_name:'Abyssal Mantle',hero:'Gideon',slot:'HERO_SPECIFIC_1'},
   'vein-splitter':{name:'Vein Splitter',display_name:'Vein Splitter',hero:'Valmont',slot:'HERO_SPECIFIC_1',reviewed_patch:'1.17',source:'https://www.predecessorgame.com/en-US/news/patch-notes/Patch_Notes_1.17'}}};
}
test('an empty Pred.gg catalogue falls back to the bundle definitions and says why',()=>{
 const c=M.create(livePausedShape()).libraryCatalog('items');
 assert.equal(c.source,'bundle');
 assert.deepEqual(c.rows.map(r=>r.name),['Absolution','Alchemical Rod','Mystery Shard']);
 assert.deepEqual(c.pred,{collected:true,status:'failed',patch:'1.17',error:'Pred.gg catalog hero join failed',fetched_at:'2026-09-23T14:41:13-05:00'});
 assert.deepEqual(c.statz,{patch:'1.16',fetched_at:'2026-09-23T14:41:01-05:00'});
 assert.equal(c.omeda.fetched_at,'2026-09-23T14:40:46-05:00');
});
test('each fallback entry keeps its own source and no entry is labelled Pred.gg',()=>{
 const items=M.create(livePausedShape()).libraryCatalog('items'),perks=M.create(livePausedShape()).libraryCatalog('perks');
 assert.deepEqual(Object.fromEntries(items.rows.map(r=>[r.key,r.origin])),{absolution:'statz','alchemical-rod':'omeda','no-price':'statz'});
 assert.deepEqual(items.origins,{statz:2,omeda:1});
 assert.deepEqual(Object.fromEntries(perks.rows.map(r=>[r.key,r.origin])),{'abyssal-mantle':'statz','vein-splitter':'official'});
 assert.ok(![...items.rows,...perks.rows].some(r=>r.origin==='pred'));
});
test('missing prices and rarities stay missing rather than becoming zero',()=>{
 const row=M.create(livePausedShape()).libraryCatalog('items').rows.find(r=>r.key==='no-price');
 assert.equal(row.price,null);assert.equal(row.rarity,null);
 const b=livePausedShape();b.items['no-price'].total_price='3100';
 assert.equal(M.create(b).libraryCatalog('items').rows.find(r=>r.key==='no-price').price,null,'a non-numeric source price is not coerced');
});
test('perk fallback rows carry the hero, slot and Eternal the source gave',()=>{
 const row=M.create(livePausedShape()).libraryCatalog('perks').rows.find(r=>r.key==='abyssal-mantle');
 assert.deepEqual({name:row.name,hero:row.hero,slot:row.slot,eternal:row.eternal},{name:'Abyssal Mantle',hero:'Gideon',slot:'HERO_SPECIFIC_1',eternal:null});
});
test('with nothing to list the catalogue reports no source instead of an empty search',()=>{
 const b=livePausedShape();b.items={};b.perks={};
 const c=M.create(b).libraryCatalog('items');
 assert.equal(c.source,null);assert.equal(c.rows.length,0);assert.equal(c.pred.status,'failed');
 const missing=M.create({heroes:{},items:{},perks:{},sources:{}}).libraryCatalog('perks');
 assert.equal(missing.source,null);assert.equal(missing.pred.collected,false);
});
test('the committed Gold seed still lists its Pred.gg catalogue unchanged',()=>{
 const b=seed(),e=M.create(b),items=e.libraryCatalog('items'),perks=e.libraryCatalog('perks');
 assert.equal(items.source,'pred');assert.equal(perks.source,'pred');
 assert.equal(items.rows.length,Object.keys(b.pred_game_data.items).length);
 assert.equal(perks.rows.length,Object.keys(b.pred_game_data.perks).length);
 const [key,raw]=Object.entries(b.pred_game_data.items).sort((x,y)=>x[1].name.localeCompare(y[1].name))[0];
 assert.deepEqual(items.rows[0],{key,name:raw.name,rarity:raw.rarity,price:raw.price,hero:null,eternal:null,slot:null,origin:'pred'});
});
test('the seed with its Pred.gg catalogue removed falls back to every bundle definition',()=>{
 const b=seed();b.pred_game_data.items={};b.pred_game_data.perks={};b.pred_game_data.status='failed';
 const e=M.create(b),items=e.libraryCatalog('items'),perks=e.libraryCatalog('perks');
 assert.equal(items.source,'bundle');assert.equal(items.rows.length,Object.keys(b.items).length);
 assert.equal(perks.source,'bundle');assert.equal(perks.rows.length,Object.keys(b.perks).length);
 assert.equal(Object.values(items.origins).reduce((a,n)=>a+n,0),items.rows.length);
 for(const r of items.rows)assert.equal(r.price,M.finite(b.items[r.key].total_price)?b.items[r.key].total_price:null);
});
test('an unknown catalogue kind is refused',()=>{
 assert.throws(()=>M.create(livePausedShape()).libraryCatalog('heroes'),/Unknown catalogue/);
});
