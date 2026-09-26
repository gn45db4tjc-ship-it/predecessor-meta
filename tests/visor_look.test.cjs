// Visor colours client (visor_look.js): it applies only allow-listed tokens with #rrggbb values, all or nothing,
// in the dark theme only, and it follows the Visor unless the reader turned that off.
const test=require('node:test'),assert=require('node:assert/strict');
const V=require('../visor_look.js');

const hex=n=>'#'+n.toString(16).padStart(6,'0');
function look(overrides={}){
 const tokens={};V.TOKENS.forEach((name,i)=>{tokens[name]=name==='--hero-wash'?'linear-gradient(120deg,#111111 0%,#222222 55%,#333333 100%)':hex(0x101010+i);});
 return {available:true,look:{style:'orbit',palette:'ember',glass:'medium',calm:false,updated:'2026-09-26T12:00:00Z'},tokens:Object.assign(tokens,overrides)};
}
const storage=value=>({getItem:()=>value});

test('a complete look becomes one dark-only rule with exactly the allow-listed tokens',()=>{
 const css=V.css(look({'--green':'#000000','--text':'#000000'}));
 assert.match(css,/^:root:not\(\[data-theme=light\]\)\{[^{}]*\}$/);
 const names=[...css.matchAll(/(--[a-z0-9-]+):/g)].map(m=>m[1]);
 assert.deepEqual(names,V.TOKENS);
 for(const semantic of ['--green','--blue','--red','--amber','--gold','--gold-text','--official','--text','--muted','--indicator','--focus'])
  assert.ok(!names.includes(semantic),semantic);
});

test('anything missing or malformed means the normal look, never a partial or injected one',()=>{
 for(const state of [null,undefined,{},{available:false},{available:'true',tokens:look().tokens},{available:true},{available:true,tokens:'x'}])
  assert.equal(V.css(state),'',JSON.stringify(state));
 const bad=['#FFF','red','#12345g','#1234567',' #123456','#123456;--green:#000','#123456}body{display:none','rgb(1,2,3)','var(--x)',123,null];
 for(const value of bad)assert.equal(V.css(look({'--brand':value})),'',String(value));
 assert.equal(V.css(look({'--hero-wash':'url(https://example.com/x.png)'})),'');
 assert.equal(V.css(look({'--hero-wash':'linear-gradient(120deg,#111111 0%,#222222 55%,#333333 100%);--red:#000'})),'');
 const partial=look();delete partial.tokens['--inset'];
 assert.equal(V.css(partial),'');
});

test('the setting describes the look from validated fields only',()=>{
 assert.equal(V.describe(look()),'Orbit · ember');
 assert.equal(V.describe({look:{style:'cockpit',palette:'<b>x</b>'}}),'Cockpit');
 assert.equal(V.describe({look:{style:'toString'}}),'');
 assert.equal(V.describe({look:{style:'aurora',palette:'ember'}}),'');
 assert.equal(V.describe(null),'');
});

test('following the Visor is on by default and only an explicit off stops it',()=>{
 assert.equal(V.KEY,'predecessor-visor-colours');
 assert.equal(V.following(storage(null)),true);
 assert.equal(V.following(storage('on')),true);
 assert.equal(V.following(storage('off')),false);
 assert.equal(V.following({getItem(){throw new Error('blocked');}}),true);
});

test('the look is re-read about every 30 seconds',()=>assert.ok(V.POLL_MS>=15000&&V.POLL_MS<=60000));
