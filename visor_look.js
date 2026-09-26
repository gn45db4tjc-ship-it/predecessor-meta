'use strict';
/* Visor colours: the local Windows app only.
   predecessor_meta.py inlines this file, with the look it has just validated, into the pages its loopback server
   renders (render_html mode 'local'). The hosted site, exports and the shared server never include it. The server
   derives the tokens (tint -> surfaces at the app's own luminance, accent -> brand lifted to WCAG AA); this file only
   applies them: dark theme only, allow-listed tokens, #rrggbb values, all or nothing. Evidence, status, text, gold and
   tier colours are never touched. "Follow the Visor's colours" is stored like the theme choice, in localStorage. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VisorLook=api;})(globalThis,function(){
 const KEY='predecessor-visor-colours',POLL_MS=30000;
 const TOKENS=['--bg','--rail','--surface','--surface-2','--surface-3','--inset','--line','--line-strong','--control-line','--control-hover','--brand','--brand-hover','--brand-ink','--brand-text','--brand-tint','--brand-line','--hero-wash'];
 const HEX=/^#[0-9a-f]{6}$/,WASH=/^linear-gradient\(120deg,#[0-9a-f]{6} 0%,#[0-9a-f]{6} 55%,#[0-9a-f]{6} 100%\)$/;
 const STYLES={orbit:'Orbit',nebula:'Nebula',cockpit:'Cockpit'},PALETTE=/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
 const CONTROL_CSS='.visor-setting{display:grid;gap:var(--s0-5);margin:0 var(--s2);font-size:var(--t-xs);color:var(--text-2)}.visor-setting[hidden]{display:none}'+
  '.visor-setting label{display:flex;align-items:center;gap:var(--s1-5);cursor:pointer}.visor-setting input{margin:0}'+
  '.visor-setting small{font-size:var(--t-2xs);color:var(--muted)}@media(max-width:700px){.visor-setting{display:none}}';
 // The stylesheet for a look, or '' (the normal look) when anything is missing or not in the expected form.
 function css(state){
  if(!state||state.available!==true||!state.tokens||typeof state.tokens!=='object')return '';
  const rules=[];
  for(const name of TOKENS){
   const value=state.tokens[name];
   if(typeof value!=='string'||!(name==='--hero-wash'?WASH:HEX).test(value))return '';
   rules.push(name+':'+value);
  }
  // Dark theme only: the light theme keeps its own tokens untouched.
  return ':root:not([data-theme=light]){'+rules.join(';')+'}';
 }
 // "Orbit · ember" for the setting's description; '' unless the fields are the validated kind.
 function describe(state){
  const look=state&&state.look;
  if(!look||!Object.prototype.hasOwnProperty.call(STYLES,look.style))return '';
  return STYLES[look.style]+(typeof look.palette==='string'&&PALETTE.test(look.palette)?' · '+look.palette:'');
 }
 // Default on: only an explicit "off" stops following the Visor.
 function following(storage){try{return (storage||globalThis.localStorage).getItem(KEY)!=='off';}catch(e){return true;}}
 function start(initial){
  const doc=document,rootEl=doc.documentElement;
  let state=initial,sheet=null,control=null,pending=false;
  const controlStyle=doc.createElement('style');controlStyle.textContent=CONTROL_CSS;doc.head.appendChild(controlStyle);
  function render(){
   if(!control){
    const anchor=doc.getElementById('theme-toggle');
    if(!anchor)return;
    control=doc.createElement('div');control.className='visor-setting';control.hidden=true;
    control.innerHTML='<label><input type="checkbox" id="visor-follow" aria-describedby="visor-note"> Follow the Visor\'s colours</label><small id="visor-note"></small>';
    anchor.insertAdjacentElement('afterend',control);
    control.querySelector('input').addEventListener('change',e=>{try{localStorage.setItem(KEY,e.target.checked?'on':'off');}catch(err){}apply();});
   }
   const available=css(state)!=='';
   control.hidden=!available;
   control.querySelector('input').checked=following();
   control.querySelector('small').textContent=!available?'':rootEl.getAttribute('data-theme')==='light'?'Applies to the dark theme only.':describe(state);
   // Browser chrome follows the page background, as the theme switch does.
   const meta=doc.querySelector('meta[name=theme-color]');
   if(meta&&doc.body)meta.content=getComputedStyle(rootEl).getPropertyValue('--bg').trim();
  }
  function apply(){
   const text=following()?css(state):'';
   if(text){
    if(!sheet){sheet=doc.createElement('style');sheet.id='visor-look';doc.head.appendChild(sheet);}
    if(sheet.textContent!==text)sheet.textContent=text;
   }else if(sheet){sheet.remove();sheet=null;}
   render();
  }
  function refresh(){
   if(pending||typeof fetch!=='function')return;
   pending=true;
   fetch('/api/look',{cache:'no-store',credentials:'same-origin'}).then(r=>r.ok?r.json():null).then(next=>{
    // No answer (app closing, busy) keeps what is on screen; an unchanged look changes nothing.
    if(!next||typeof next!=='object'||JSON.stringify(next)===JSON.stringify(state))return;
    state=next;apply();
   }).catch(()=>{}).finally(()=>{pending=false;});
  }
  apply();
  new MutationObserver(render).observe(rootEl,{attributes:true,attributeFilter:['data-theme']});
  doc.addEventListener('DOMContentLoaded',()=>{render();refresh();});
  doc.addEventListener('visibilitychange',()=>{if(doc.visibilityState==='visible')refresh();});
  addEventListener('focus',refresh);
  addEventListener('pageshow',e=>{if(e.persisted)refresh();});
  addEventListener('storage',e=>{if(e.key===KEY)apply();});
  setInterval(()=>{if(doc.visibilityState==='visible')refresh();},POLL_MS);
 }
 return {KEY,POLL_MS,TOKENS,css,describe,following,start};
});
