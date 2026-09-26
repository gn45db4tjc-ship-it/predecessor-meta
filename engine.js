/* Pure bundle -> recommendations. No network, DOM or stored state. */
(function (root, factory) {
  const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.MetaEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const ROLES = ['jungle', 'midlane', 'support', 'offlane', 'carry'];
  const finite = v => typeof v === 'number' && Number.isFinite(v);
  const mean = xs => { const a = xs.filter(finite); return a.length ? a.reduce((s,x)=>s+x,0)/a.length : null; };
  const key = (a,b) => [a,b].sort().join('|');
  const cap = (h,c) => (h?.capabilities || []).includes(c);
  function create(bundle) {
    const heroes = bundle?.heroes || {}, fitCache = new Map(), plannedKitCache=new Map(), heroIds=new Map(Object.entries(bundle?.heroes||{}).map(([slug,h])=>[h,slug]));
    const pairMap = Array.isArray(bundle?.pairs) ? Object.fromEntries(bundle.pairs.map(p=>[key(p.a,p.b),p])) : bundle?.pairs || {};
    const sequenceIndex=new Map((bundle?.guidance?.sequence_review?.abilities||[]).map(r=>[r.slug+'|'+r.key,r]));
    // Source verification and editorial review are separate from retained evidence.
    function verificationCurrent() {
      return !!bundle&&bundle.official?.status==='verified'&&bundle.recommendation_context?.status!=='withheld'&&
        !String(bundle.guidance?.status||'').startsWith('reviewed for saved patch');
    }
    function reviewReady(patch=bundle?.guidance?.patch) {
      return verificationCurrent()&&bundle.guidance?.status==='reviewed for current patch'&&
        !!patch&&patch===bundle.guidance?.patch&&patch===bundle.official?.live?.version;
    }
    // A collection with a few failed hero pages stays usable only when the publisher (or collector) reports
    // reconciled coverage inside the failure share. Each failed role is still excluded by its own status.
    function statzPagesUsable(source) {
      const c=source?.coverage;
      return source?.status==='ok'||(/^partial \(\d+ missing\)$/.test(String(source?.status))&&c?.usable===true&&c.conflicting===0&&
        Number.isInteger(c.ok)&&c.ok>0&&Number.isInteger(c.failed)&&c.failed>0&&c.ok+c.failed+c.conflicting===c.requested);
    }
    function statzBuildAvailable(slug,role) {
      const source=bundle?.sources?.statz_hero_pages,live=bundle?.official?.live?.version;
      return verificationCurrent()&&statzPagesUsable(source)&&Number.isFinite(Date.parse(source.fetched_at))&&
        typeof bundle.patch==='string'&&(bundle.patch===live||String(live).startsWith(bundle.patch+'.'))&&
        heroes[slug]?.roles?.[role]?.status==='ok';
    }
    function strategyReady() {
      const r=bundle.guidance?.strategic_review;
      return !!r&&r.patch===bundle.official?.live?.version&&r.patch===bundle.guidance?.patch&&bundle.official?.status==='verified'&&reviewReady();
    }
    function matchesAbilities(slug,texts) {return !!heroes[slug]&&Object.entries(texts||{}).length>0&&Object.entries(texts).every(([k,t])=>heroes[slug].abilities?.find(a=>a.key===k)?.text===t);}
    function patchContext(slug){
      const r=heroes[slug]?.patch_context;
      if(!r)return null;
      const active=!!bundle.patch_support?.active&&r.active===true&&buildPatchReady(r.patch)&&matchesAbilities(slug,r.source_abilities);
      return {...r,active};
    }
    function heroStrategy(slug) {
      const patch=patchContext(slug);
      const review=bundle.guidance?.strategic_review,r=review?.heroes?.[slug];
      const active=!!r&&strategyReady()&&matchesAbilities(slug,r.source_abilities);
      // A full review of the same patch completed after the interim patch note supersedes it; otherwise the note wins.
      const superseded=active&&!!patch&&review.patch===patch.patch&&Date.parse(review.reviewed_at)>=Date.parse(patch.reviewed_at);
      if(patch?.active&&!superseded)return {...patch,pick_when:patch.summary,counterplay:patch.summary,status:'Reviewed patch implications; no outcome claim'};
      if(!r)return null;
      return {...r,active,patch:review.patch,reviewed_at:review.reviewed_at,status:active?bundle.guidance.status:'Patch or supporting ability text needs review'};
    }
    function counterIdeas(target,enemyRole='',{role='',bans=[],allies=[],enemies=[]}={}) {
      const blocked=new Set([...bans,...allies.map(p=>p.slug),...enemies.map(p=>p.slug)]),filled=new Set(allies.map(p=>p.role));
      const patch=patchContext(target);
      const additions=patch?.active?(patch.counters||[]).map(r=>({...r,target,patch:patch.patch,reviewed_at:patch.reviewed_at,patchAddition:true})):[];
      return [...additions,...(bundle.guidance?.strategic_review?.counter_picks||[])].filter(r=>r.target===target&&(!role||r.role===role)&&!blocked.has(r.slug)&&!filled.has(r.role)).map(r=>{
        const active=(r.patchAddition?patch?.active:strategyReady())&&Object.entries(r.source_abilities).every(([s,ts])=>matchesAbilities(s,ts));
        return {...r,active,observation:currentMatchup({slug:r.slug,role:r.role},{slug:target,role:enemyRole},100),reviewed_at:r.patchAddition?r.reviewed_at:bundle.guidance.strategic_review.reviewed_at};
      });
    }
    function buildAdaptations(slug,role) {
      const plan=buildReview(slug,role);
      return (bundle.guidance?.strategic_review?.build_adaptations||[]).filter(r=>r.slug===slug&&r.role===role).map(r=>({...r,active:strategyReady()&&!!heroStrategy(slug)?.active&&!!plan?.active&&[...plan.core,...plan.finish].includes(r.replace)&&!!bundle.items?.[r.item_key]?.completed_item&&sameValue(bundle.items[r.item_key].effects,r.item_effects),reorder:[...(plan?.core||[]),...(plan?.finish||[])].includes(r.item)}));
    }
    function reviewedComposition(index) {
      const c=bundle.guidance?.compositions?.[index];if(!c)return null;
      const active=strategyReady()&&c.picks.every(p=>heroStrategy(p.slug)?.active&&buildReview(p.slug,p.role)?.active);
      return {...c,index,active,reviewed_at:bundle.guidance?.strategic_review?.reviewed_at};
    }
    function guidedCompositions(locks=[],{size=5,bans=[],enemies=[]}={}) {
      try{validPicks(locks,{size,bans,enemies});}catch{return [];}
      return (bundle.guidance?.compositions||[]).map((c,i)=>reviewedComposition(i)).filter(c=>c.active&&c.picks.length===size&&locks.every(p=>c.picks.some(q=>p.slug===q.slug&&p.role===q.role))&&c.picks.every(p=>!bans.includes(p.slug)&&!enemies.some(e=>e.slug===p.slug)));
    }
    const sequenceMethod='Calculated interaction points, not a win probability or a rating out of ten. Best catch sequence: up to 4; attack amplification: 3; time to attack: up to 3; entry protection: 2; distant connection: 2. Prepared, delayed, conditional and brief control earn less catch credit. Tank/enchanter area follow-up is capped at 2 supporting points. A committed ability is counted once; separate enablers can support the same ongoing attack. The bounded search checks four candidate commitments per family. Alternatives are shown without adding their points.';
    function sequenceReview(slug,abilityKey) {
      const review=bundle.guidance?.sequence_review,r=sequenceIndex.get(slug+'|'+abilityKey);
      if(!r)return null;
      const current=bundle.official?.status==='verified'&&bundle.official?.live?.version===review.patch&&bundle.guidance?.patch===review.patch&&reviewReady();
      const matching=heroes[slug]?.abilities?.find(a=>a.key===abilityKey)?.text===r.ability_text;
      const saved=bundle.guidance?.status!=='reviewed for current patch';
      return {...r,active:current&&matching,saved,reviewed_at:review.reviewed_at,status:!current?'Sequence review needs patch verification':!matching?'Sequence review needs an ability-source check':saved?'Reviewed delivery and timing for saved patch; '+bundle.guidance.status.split('; ').slice(1).join('; '):'Reviewed delivery and timing'};
    }
    function sequenceFit(a,b,roleA,roleB) {
      const id='sequence:'+key(a+'@'+roleA,b+'@'+roleB);if(fitCache.has(id))return fitCache.get(id);
      const review=bundle.guidance.sequence_review,current=bundle.official?.status==='verified'&&bundle.official?.live?.version===review.patch&&bundle.guidance?.patch===review.patch&&reviewReady();
      const selectedRoles={[a]:roleA,[b]:roleB};
      const members=[plannedKit(a,roleA),plannedKit(b,roleB)].filter(Boolean).sort((x,y)=>heroIds.get(x).localeCompare(heroIds.get(y)));
      if(!current||members.length!==2)return {score:null,scale:'interaction points',reasons:[{text:'A matching verified patch and reviewed ability sources are required for the sequence rating.'}],constraints:[],evidence:[],loadouts:members.flatMap(h=>h.loadout_notes||[]),method:sequenceMethod};
      const candidates=[],unknown=new Map(),constraints=[],refId=s=>s.hero+'|'+s.key;
      function refs(h,tag) {
        const slug=heroIds.get(h),seen=new Set();
        return (h.capability_evidence?.[tag]||[]).filter(e=>e.key&&!seen.has(e.key)&&seen.add(e.key)).map(e=>({hero:slug,tag,...e}));
      }
      function reviewed(s) {
        const r=sequenceReview(s.hero,s.key);
        // An explicitly active added-control augment is a separate reviewed source.
        if(s.augment&&members.some(h=>(h.loadout_notes||[]).some(n=>n.active&&n.hero===s.hero&&n.key===s.key&&n.augment===s.augment)))return {active:true,setup:'hold',readiness:'conditional',control_window:'brief',followup:'none',note:s.reason};
        if(!r?.active){unknown.set(refId(s),{text:heroes[s.hero].display_name+' · '+s.ability+': sequence conditions need review; no timing credit is inferred.',supports:[s]});return null;}
        return r;
      }
      function controls(h) {
        const map=new Map();
        for(const s of [...refs(h,'hard_cc'),...refs(h,'containment')]){
          const r=reviewed(s);if(!r||r.setup==='none')continue;
          const tag=r.setup==='boundary'?'containment':'hard_cc';
          if(map.has(s.key)&&s.tag!==tag)continue;
          let quality=r.setup==='hold'?3:2;
          if(r.readiness==='prepared')quality=Math.max(1,quality-1);
          if(['delayed','stacked','conditional'].includes(r.readiness))quality=1;
          if(r.control_window==='brief')quality=Math.max(1,quality-1);
          map.set(s.key,{...s,tag,sequence:r,quality});
        }
        return [...map.values()];
      }
      function add(family,kind,points,from,to,text,consumeTarget=false) {
        const supports=[from,to],resources=[refId(from),...(consumeTarget?[refId(to)]:[])];
        const notes=members.flatMap(h=>h.loadout_notes||[]).filter(n=>supports.some(s=>s.hero===n.hero&&s.key===n.key));
        const timing=supports.map(s=>s.sequence?.note).filter(Boolean);
        candidates.push({family,kind,points,summary:text,text:[text,...timing,...notes.map(n=>n.text)].join(' '),supports,resources,abilities:supports.map(s=>heroes[s.hero].display_name+': '+s.ability)});
      }
      for(const [x,y] of [members,[...members].reverse()]){
        const cx=controls(x),ys=refs(y,'sustained');
        for(const s of cx){
          for(const t of refs(y,'area_followup')){
            const r=reviewed(t);if(!r||r.followup==='none')continue;
            const plan=selectedRoles[t.hero]?buildReview(t.hero,selectedRoles[t.hero]):null;
            const supporting=plan?.active?['tank','enchanter'].includes(plan.style):y.classes?.some(c=>['tank','warden','enchanter'].includes(String(c).toLowerCase()));
            const points=Math.min(supporting?2:4,Math.max(1,s.quality+1-(r.followup==='delayed'?1:0)));
            const caution=s.sequence.setup==='boundary'?' Movement containment does not stop attacks or casts.':'';
            add('catch','area chain',points,s,{...t,sequence:r},`${x.display_name} sets the opportunity with ${s.ability}; ${y.display_name} follows with ${t.ability}.${caution}${supporting?' This follow-up supports control or protection; the selected tank/enchanter plan does not supply a dedicated damage threat.':''}`,true);
          }
          if(s.sequence.setup!=='boundary')for(const t of refs(y,'burst')){
            const r=sequenceReview(t.hero,t.key);if(r&&(!r.active||r.followup==='sustained'||r.followup==='none'))continue;
            add('catch','catch conversion',Math.min(2,s.quality),s,{...t,sequence:r?.active?r:null},`${x.display_name}'s ${s.ability} creates a short conversion opportunity for ${y.display_name}'s ${t.ability}. Follow the confirmed hit rather than overlap control.`,true);
          }
        }
        for(const s of refs(x,'amplifier'))for(const t of ys)add('amplifier','attack amplifier',3,s,t,`${x.display_name}'s ${s.ability} can amplify ${y.display_name}'s repeated attacks. Commit the buff when a reachable target is available.`);
        for(const s of refs(x,'peel'))for(const t of ys){
          const control=cx.find(c=>c.key===s.key),listed=sequenceIndex.has(refId(s));
          const protection=refs(x,'protection').some(p=>p.key===s.key),r=listed?sequenceReview(s.hero,s.key):null;
          if(listed&&!control&&(!r?.active||!protection))continue;
          const from=control||{...s,sequence:r},points=control?Math.min(3,control.quality):2;
          add('time','attack time',points,from,t,`${x.display_name}'s ${s.ability} can help ${y.display_name} keep attacking. Reserve this action for the diver if it is not already committed to the opening.`);
        }
        for(const s of refs(x,'protection'))for(const t of refs(y,'initiation')){
          if([s,t].some(ref=>sequenceIndex.has(refId(ref))&&!reviewed(ref)))continue;
          add('protection','protect engage',2,s,t,`${x.display_name}'s ${s.ability} can protect ${y.display_name}'s entry with ${t.ability}. Check ally range and target restrictions before committing.`,true);
        }
        for(const s of refs(x,'global'))for(const t of refs(y,'initiation').concat(refs(y,'containment'))){
          const r=sequenceReview(s.hero,s.key);if(r&&!r.active)continue;
          if(sequenceIndex.has(refId(t))&&!reviewed(t))continue;
          add('global','cross-map follow',2,{...s,sequence:r},t,`${x.display_name}'s ${s.ability} offers a distant connection to ${y.display_name}'s ${t.ability}. Confirm the destination, aim and target requirements.`,true);
        }
        for(const tag of ['isolation','push_away'])for(const s of refs(x,tag))for(const t of refs(y,'area_followup')){
          const r=sequenceReview(t.hero,t.key);if(r&&(!r.active||r.followup==='none'))continue;
          const text=tag==='isolation'?`${x.display_name}'s ${s.ability} can separate the target from ${y.display_name}'s ${t.ability}. Coordinate the target and timing.`:`${x.display_name}'s ${s.ability} can move enemies out of ${y.display_name}'s ${t.ability}. Choose the displacement direction before committing.`;
          constraints.push({text,supports:[s,t]});
        }
      }
      // A small exact search over five mechanism families. Keep four distinct
      // candidate resource sets per family; this remains a bounded suggestion.
      const groups=['catch','amplifier','time','protection','global'].map(family=>{
        const seen=new Set();return candidates.filter(r=>r.family===family).sort((a,b)=>b.points-a.points||a.resources.join().localeCompare(b.resources.join())).filter(r=>{const k=r.resources.slice().sort().join();if(seen.has(k))return false;seen.add(k);return true;}).slice(0,4);
      });
      let best=[],bestScore=-1;
      function choose(i,used,chosen,score){
        if(i===groups.length){if(score>bestScore){best=chosen;bestScore=score;}return;}
        for(const r of groups[i])if(r.resources.every(id=>!used.has(id)))choose(i+1,new Set([...used,...r.resources]),[...chosen,r],score+r.points);
        choose(i+1,used,chosen,score);
      }
      choose(0,new Set(),[],0);
      const selected=new Set(best),reasons=best.slice().sort((a,b)=>b.points-a.points).map(r=>({...r,counted:true}));
      for(const group of groups){const r=group[0];if(r&&!selected.has(r)&&!reasons.some(x=>x.family===r.family))reasons.push({...r,counted:false,not_counted:'Alternative use; its ability commitment overlaps a counted sequence.'});}
      if(!reasons.length)reasons.push({text:'No independently supported complementary action was identified. This is not evidence that the pair is weak.',abilities:[]});
      const out={score:!candidates.length&&unknown.size?null:bestScore,scale:'interaction points',reasons,constraints:[...unknown.values(),...constraints],evidence:reasons.flatMap(r=>r.abilities||[]),loadouts:members.flatMap(h=>h.loadout_notes||[]),method:sequenceMethod+(bundle.guidance.status!=='reviewed for current patch'?' This calculation uses the dated saved patch review; '+bundle.guidance.status+'.':''),reviewed_at:review.reviewed_at};
      fitCache.set(id,out);return out;
    }
    function pair(a,b,min=100) {
      const p=pairMap[key(a,b)]; if(!p || !finite(p.wr) || !finite(p.played) || p.played<min) return null;
      const ba=heroes[p.a]?.hero_wide?.winRate, bb=heroes[p.b]?.hero_wide?.winRate;
      if(!finite(ba)||!finite(bb)) return null;
      return {...p,base_a:ba,base_b:bb,lift:p.wr-Math.max(ba,bb),lift_mean:p.wr-(ba+bb)/2,lift_a:p.wr-ba,lift_b:p.wr-bb};
    }
    function support(h,tag) {const rows=h?.capability_evidence?.[tag]||[],row=(['initiation','containment','hard_cc','area_followup'].includes(tag)?rows.find(e=>e.key==='R'):null)||rows[0];return row?{hero:heroIds.get(h),tag,...row}:null;}
    function evidence(h,tag) {return support(h,tag)?.ability||tag.replaceAll('_',' ');}
    function setupPriority(h) {const controls=[...(h.capability_evidence?.hard_cc||[]),...(h.capability_evidence?.containment||[])];return controls.some(c=>(h.capability_evidence?.initiation||[]).some(i=>i.ability===c.ability))?3:controls.some(c=>c.key==='R')?2:controls.length?1:0;}
    function plannedKit(slug,role='') {
      const base=heroes[slug];if(!base||!role)return base;
      const id=slug+'|'+role;if(plannedKitCache.has(id))return plannedKitCache.get(id);
      const plan=buildReview(slug,role),rules=(bundle.guidance?.capability_reviews||[]).filter(r=>r.slug===slug&&r.augment===plan?.augment);
      if(!rules.length)return base;
      const h={...base,capability_evidence:structuredClone(base.capability_evidence||{}),loadout_notes:[]};heroIds.set(h,slug);
      for(const r of rules){
        const perk=Object.values(bundle.perks||{}).find(p=>NK(p.display_name||p.name)===NK(r.augment));
        const supplement=Object.values(bundle.reviewed_definitions||{}).find(d=>NK(d.name)===NK(r.augment)&&d.active);
        const description=perk?.description||supplement?.description;
        const matching=plan.active&&bundle.official?.status==='verified'&&r.patch===bundle.official?.live?.version&&perkTextMatches(r.augment,description,r.augment_description)&&base.abilities?.find(a=>a.key===r.ability_key)?.text===r.ability_text;
        // Changed text cannot justify the old removed or added control effect.
        for(const tag of new Set([...r.remove,...r.add]))h.capability_evidence[tag]=(h.capability_evidence[tag]||[]).filter(e=>e.key!==r.ability_key);
        if(matching)for(const tag of r.add)h.capability_evidence[tag].push({key:r.ability_key,ability:base.abilities.find(a=>a.key===r.ability_key).display_name,reason:r.reason,augment:r.augment});
        h.loadout_notes.push({hero:slug,role,augment:r.augment,key:r.ability_key,active:matching,contextOnly:!!r.context_only,text:matching?r.reason:r.context_only?'This default augment context needs a source or patch review. No additional capability is inferred.':'This selected augment or its supporting ability changed or needs patch verification. Its affected capability is withheld until reviewed.'});
      }
      h.capabilities=Object.keys(h.capability_evidence).filter(k=>h.capability_evidence[k].length);plannedKitCache.set(id,h);return h;
    }
    function fit(a,b,roleA='',roleB='') {
      if(bundle.guidance?.sequence_review)return sequenceFit(a,b,roleA,roleB);
      const id=key(a+'@'+roleA,b+'@'+roleB); if(fitCache.has(id)) return fitCache.get(id);
      const ordered=[{slug:a,h:plannedKit(a,roleA)},{slug:b,h:plannedKit(b,roleB)}].sort((x,y)=>setupPriority(y.h||{})-setupPriority(x.h||{})||x.slug.localeCompare(y.slug));
      const ha=ordered[0].h,hb=ordered[1].h, reasons=[], used=new Set(),constraints=[]; let score=0;
      if(!ha || !hb || !(ha.capabilities?.length && hb.capabilities?.length)) return {score:null,reasons:['Kit evidence is unavailable.'],evidence:[]};
      function add(kind,points,from,to,ft,tt,text) {
        const supports=[support(from,ft),support(to,tt)];if(supports.some(s=>!s))return;
        if(used.has(kind)) return; used.add(kind); score+=points;
        const notes=[...(from.loadout_notes||[]),...(to.loadout_notes||[])].filter(n=>supports.some(s=>s.hero===n.hero&&s.key===n.key));
        reasons.push({kind,text:text+(notes.length?' '+notes.map(n=>n.text).join(' '):''),supports,abilities:supports.map(s=>heroes[s.hero].display_name+': '+s.ability)});
      }
      for(const [x,y] of [[ha,hb],[hb,ha]]) {
        if((cap(x,'containment')||cap(x,'hard_cc')) && cap(y,'area_followup') && support(y,'area_followup')?.followup_style!=='allied_arrival') {
          const displacement=(y.capability_evidence?.push_away||[]).some(e=>e.key==='R');
          const style=support(y,'area_followup')?.followup_style;
          const tag=style==='persistent_area'&&cap(x,'containment')?'containment':cap(x,'hard_cc')?'hard_cc':'containment';
          const instruction=displacement?'The follow-up displaces targets: aim it so allies can still reach them.':style==='line'?'Line up the shot while the target is controlled.':style==='aimed_barrage'?'Track the target through the barrage; the opening control will not necessarily last for the whole attack.':style==='persistent_area'?'Place the damage area on the catch; continued damage depends on enemies remaining in it.':style==='impact'?'Time the impact for the catch, allowing for its cast or travel delay.':'Check the follow-up targeting and delay before committing.';
          add('area chain',4,x,y,tag,'area_followup',`${x.display_name} can set the catch with ${evidence(x,tag)}; ${y.display_name} follows with ${evidence(y,'area_followup')}. ${instruction}${tag==='containment'?' Constraining movement does not necessarily prevent attacks or casts; inspect the boundary conditions.':''}`);
        }
        if(cap(x,'amplifier')&&cap(y,'sustained')) add('attack amplifier',3,x,y,'amplifier','sustained',`${x.display_name} can amplify ${y.display_name}'s repeated attacks. Commit the buff when there is a safe target to hit.`);
        if((cap(x,'peel')||cap(x,'hard_cc'))&&cap(y,'sustained')) {const tag=cap(x,'peel')?'peel':'hard_cc';add('attack time',3,x,y,tag,'sustained',`${x.display_name}'s ${evidence(x,tag)} can buy ${y.display_name} time to attack. Save a defensive control tool when divers are missing.`);}
        if(cap(x,'hard_cc')&&cap(y,'burst')) add('catch conversion',2,x,y,'hard_cc','burst',`${x.display_name}'s ${evidence(x,'hard_cc')} can hold a target for ${y.display_name}'s ${evidence(y,'burst')}. Sequence the control instead of overlapping it.`);
        if(cap(x,'protection')&&cap(y,'initiation')) add('protect engage',2,x,y,'protection','initiation',`${x.display_name} can protect ${y.display_name} after entry; check the protection's range before committing.`);
        if(cap(x,'global')&&(cap(y,'initiation')||cap(y,'containment'))) add('cross-map follow',2,x,y,'global',cap(y,'initiation')?'initiation':'containment',`${x.display_name} has a distant follow-up option when ${y.display_name} starts a fight. Keep its cooldown and target requirements in mind.`);
        if(cap(x,'isolation')&&cap(y,'area_followup'))constraints.push({text:x.display_name+"'s "+evidence(x,'isolation')+" can separate the target from "+y.display_name+"'s "+evidence(y,'area_followup')+". Coordinate the target and timing instead of assuming both effects can hit together.",supports:[support(x,'isolation'),support(y,'area_followup')].filter(Boolean)});
        if(cap(x,'push_away')&&cap(y,'area_followup'))constraints.push({text:x.display_name+"'s "+evidence(x,'push_away')+" can move the target out of "+y.display_name+"'s "+evidence(y,'area_followup')+". Choose the direction before committing.",supports:[support(x,'push_away'),support(y,'area_followup')].filter(Boolean)});
      }
      if(!reasons.length) reasons.push({text:'No strong complementary interaction was identified by the kit rules. This is not evidence that the pair is weak.',abilities:[]});
      const out={score:Math.min(10,score),reasons,constraints,evidence:reasons.flatMap(r=>r.abilities),loadouts:[...(ha.loadout_notes||[]),...(hb.loadout_notes||[])]}; fitCache.set(id,out); return out;
    }
    function roles(slug) { return (heroes[slug]?.roles_order || []).filter(r=>ROLES.includes(r)); }
    function basePerformancePolicy(now=Date.now()) {
      if(!bundle)return {source:null,label:'Role statistics unavailable',patch:null,fetched_at:null,note:'No data bundle is loaded.'};
      if(!verificationCurrent())return {source:null,label:'Verification required',patch:null,fetched_at:null,note:bundle.recommendation_context?.reason||'Live patch verification is pending or failed. Saved observations remain inspectable with their original dates.'};
      const c=bundle.scoped_statistics,live=bundle.official?.live?.version;
      const retainedAge=(now-Date.parse(bundle.sources?.pred_scoped?.fetched_at))/3600000;
      const recentRetained=c?.status==='retained'&&c.bracket===bundle.bracket?.segment&&retainedAge>=0&&retainedAge<=30;
      const exact=bundle.official?.status==='verified'&&(['ok','partial'].includes(c?.status)||recentRetained)&&c.patch===live;
      if(exact)return {source:'pred',label:'Pred.gg '+c.patch+(c.hotfixes?.length?' + Hotfix '+c.hotfixes.join(', '):'')+' · '+c.bracket_label+' Ranked',patch:c.patch,
        fetched_at:bundle.sources?.pred_scoped?.fetched_at,note:(recentRetained?'Latest refresh unavailable. Using retained exact-patch observations collected within 30 hours, with their original dates. ':'')+'Observed exact-patch cohort. Missing roles stay unavailable; sources are not pooled.'};
      const s=bundle.sources,compatible=bundle.official?.status==='verified'&&typeof bundle.patch==='string'&&
        (bundle.patch===live||String(live).startsWith(bundle.patch+'.'));
      const available=s?.statz_tierlist?.status==='ok'&&statzPagesUsable(s?.statz_hero_pages)&&
        Number.isFinite(Date.parse(s.statz_tierlist.fetched_at))&&Number.isFinite(Date.parse(s.statz_hero_pages.fetched_at));
      if(available&&compatible)return {source:'statz',label:'Statz '+(bundle.patch||'dataset unavailable')+' · '+(bundle.bracket?.label||'bracket unavailable'),patch:bundle.patch,
        fetched_at:s?.statz_hero_pages?.fetched_at,note:'Broader source dataset: its exact match window and game-mode coverage are unconfirmed. Pred.gg is unavailable or retained; these rates are not isolated to the latest balance patch.'+statzGapNote(s.statz_hero_pages)};
      return {source:null,label:'Role statistics unavailable',patch:null,fetched_at:null,
        note:'No eligible role-statistics source matches this publication. Saved observations remain inspectable; they do not rank current recommendations.'};
    }
    // One definition of evidence age for every route. Saved advice stays usable with its original date;
    // statistics outside the aging window are labelled as saved and never presented as current rankings.
    // Observations, ordering and eligibility rules above are unchanged: this only describes them.
    const EVIDENCE_HOURS={current:30,aging:48},FUTURE_TOLERANCE_MS=300000;
    function statzGapNote(source) {
      const c=source?.coverage;return source?.status!=='ok'&&statzPagesUsable(source)?' '+c.failed+' of '+c.requested+' Statz hero pages failed in this collection; those roles have no hero-page statistics (role win rate, builds, matchups) and nothing was filled in. Their tier-list rows are shown as collected.':'';
    }
    function statzGap() {const s=bundle?.sources?.statz_hero_pages;return s?.status!=='ok'&&statzPagesUsable(s)?{requested:s.coverage.requested,ok:s.coverage.ok,failed:s.coverage.failed}:null;}
    function sourceCurrency(source,now=Date.now()) {
      const at=Date.parse(source?.fetched_at),age=(now-at)/3600000;
      if(!source||(!['ok','partial','retained'].includes(source.status)&&!statzPagesUsable(source))||!Number.isFinite(at)||at>now+FUTURE_TOLERANCE_MS)return {state:'unavailable',fetched_at:source?.fetched_at||null,age_hours:null};
      const state=source.status==='retained'?'retained':age<=EVIDENCE_HOURS.current?'current':age<=EVIDENCE_HOURS.aging?'aging':'stale';
      return {state,fetched_at:source.fetched_at,age_hours:Math.max(0,Math.round(age*100)/100)};
    }
    function performancePolicy({now=Date.now()}={}) {
      const policy=basePerformancePolicy(now),key=policy.source==='pred'?'pred_scoped':policy.source==='statz'?'statz_hero_pages':null;
      const c=key?sourceCurrency(bundle.sources?.[key],now):{state:'unavailable',age_hours:null};
      return {...policy,currency:c.state,age_hours:c.age_hours,saved:!!policy.source&&!['current','aging'].includes(c.state)};
    }
    // Displaying a dated observation does not make it eligible for recommendation ranking.
    // Keep this policy separate: performance()/assess()/recommend() retain their patch gates.
    function displayPerformancePolicy({now=Date.now()}={}) {
      const current=performancePolicy({now});
      if(current.source)return {...current,inspection_only:false};
      const s=bundle?.sources,validDate=v=>Number.isFinite(Date.parse(v))&&Date.parse(v)<=now+FUTURE_TOLERANCE_MS;
      const pages=s?.statz_hero_pages,tiers=s?.statz_tierlist;
      if((statzPagesUsable(pages)||pages?.status==='retained')&&['ok','retained'].includes(tiers?.status)&&
          validDate(pages.fetched_at)&&validDate(tiers.fetched_at)&&/^\d+(\.\d+)+$/.test(bundle?.patch||'')) {
        return {source:'statz',patch:bundle.patch,fetched_at:pages.fetched_at,currency:sourceCurrency(pages,now).state,
          label:'Statz '+bundle.patch+' · '+(bundle.bracket?.label||'bracket unavailable'),saved:true,inspection_only:true,
          note:'Current-patch role statistics are unavailable. Showing the previous Statz dataset '+bundle.patch+' with its original samples and collection dates. These observations do not rank current recommendations; the exact match window and game-mode coverage are unconfirmed.'};
      }
      return {...current,inspection_only:false};
    }
    function displayPerformance(pick,{now=Date.now()}={}) {
      const policy=displayPerformancePolicy({now});
      if(!policy.source)return null;
      const row=performance(pick,{source:policy.source});
      if(!row)return null;
      if(policy.inspection_only){
        const original=heroes[pick.slug]?.roles?.[pick.role];
        if((original.patch&&original.patch!==bundle.patch)||!Number.isFinite(Date.parse(row.fetched_at))||Date.parse(row.fetched_at)>now+FUTURE_TOLERANCE_MS)return null;
      }
      return {...row,inspection_only:policy.inspection_only};
    }
    function metaReviewSummary(role) {
      const rows=(bundle?.guidance?.meta_review?.entries||[]).filter(r=>!role||r.role===role).map(r=>metaReview(r.slug,r.role)).filter(Boolean);
      const counts={};for(const r of rows)if(!r.active)counts[r.status]=(counts[r.status]||0)+1;
      const active=rows.filter(r=>r.active).length;
      return {entries:rows.length,active,reason:Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0]||null};
    }
    function freshnessAreas({now=Date.now(),slug=null,role=null}={}) {
      const p=performancePolicy({now}),g=bundle?.guidance||{},live=bundle?.official?.live?.version;
      const row=slug&&role?performance({slug,role}):null;
      const missingRole=!!(slug&&role&&!row);
      const due=strategyReviewDue({now}),review=slug&&role?buildReview(slug,role):null;
      const mechanicsChanged=!!(review?.changed?.length||review?.missing?.length||review?.invalid);
      const currentGuidance=review?.patch_review?!!review.active:reviewReady()&&!due.due&&(!slug||!!review?.active);
      return [
        {area:'Role and recommendation statistics',patch:p.patch,fetched_at:p.fetched_at,
          state:missingRole||!p.source?'unavailable':p.saved||p.patch!==live?'fallback':'current',
          reason:missingRole?'Due to lack of eligible data for this hero and role, no role rate is filled in. Previous guidance remains available separately.':p.note},
        {area:'Pair statistics',patch:bundle?.patch,fetched_at:bundle?.sources?.statz_hero_pages?.fetched_at,
          state:bundle?.pairs?.length||Object.keys(pairMap).length?'fallback':'unavailable',
          reason:'Statz pair samples are a broader dataset, not verified latest-balance-patch statistics. Gaps and sample sizes remain separate; no current-patch pair rate is inferred.'},
        {area:review?.patch_review?'Written build guidance':'Written guidance',patch:review?.patch||g.patch,reviewed_at:review?.reviewed_at||g.reviewed_at,
          state:currentGuidance?'current':g.patch?'fallback':'unavailable',
          reason:currentGuidance?(review?.patch_review?'This starting build was reviewed against the live patch. Current-patch outcome samples remain unavailable; tiers and team advice have separate review dates.':'Reviewed for the live patch; individual plans still require their supporting mechanics to match.'):mechanicsChanged?'Supporting mechanics changed or are unavailable. Previous advice is inspection-only; affected choices are not activated.':!verificationCurrent()?'Live patch verification is unavailable. Previous guidance is dated reference only.':due.due?'Current strategy review is unavailable or due. Previous guidance is retained with its original patch and review date. '+due.reasons.map(r=>r.startsWith('The scheduled review date')?'The scheduled strategy review is overdue.':r).join(' '):'Due to lack of a verified current plan in this area, use the dated previous guidance as a fallback, not a newly reviewed recommendation.'}
      ];
    }
    let buildsState;   // per engine instance: the bundle and its reviews do not change
    function evidenceState({now=Date.now()}={}) {
      const policy=performancePolicy({now}),s=bundle?.sources||{},g=bundle?.guidance||{};
      // Statistics that no eligible source supplies are unavailable for ranking, whatever their own age.
      const statistics=policy.source?{source:policy.source,...sourceCurrency(policy.source==='pred'?s.pred_scoped:s.statz_hero_pages,now)}:{source:null,state:'unavailable',fetched_at:null,age_hours:null};
      const mechanics=sourceCurrency(s.pred_game_data||s.omeda_heroes,now);
      const verification={state:!bundle?'unavailable':bundle.recommendation_context?.status==='withheld'?'withheld':bundle.official?.status==='verified'?'verified':'failed',checked_at:bundle?.official?.checked_at||null,reason:bundle?.recommendation_context?.reason||null};
      const guidance={state:reviewReady()?'reviewed':String(g.status||'').startsWith('reviewed for saved patch')?'saved':'needs-review',status:g.status||null,patch:g.patch||null,reviewed_at:g.reviewed_at||null,next_review_at:g.maintenance_review?.next_weekly_review||null};
      const rankingCurrent=verification.state==='verified'&&!!policy.source&&['current','aging'].includes(statistics.state),limitations=[];
      if(verification.state!=='verified')limitations.push(verification.reason||'Live patch verification is pending or failed.');
      if(statistics.state==='stale')limitations.push('Role statistics were fetched more than '+EVIDENCE_HOURS.aging+' hours ago. They are shown as saved statistics, not current rankings.');
      if(statistics.state==='retained')limitations.push('Role statistics are retained from an earlier collection.');
      if(!policy.source&&verification.state==='verified')limitations.push(policy.note);
      else if(policy.source&&statistics.state==='unavailable')limitations.push('The role-statistics fetch date is missing or in the future, so they are not treated as current.');
      if(statzGap()){if(policy.source==='statz')statistics.coverage=statzGap();limitations.push(statzGapNote(s.statz_hero_pages).trim());}
      // Starting builds carry their own patch review; the overdue tier and strategy review does not make them unavailable.
      const bpr=g.build_patch_review,builds=buildsState??=bpr&&buildPatchReady(bpr.patch)?{patch:bpr.patch,reviewed_at:bpr.reviewed_at,ready:(g.builds||[]).filter(r=>buildReview(r.slug,r.role)?.active).length,total:(g.builds||[]).length,
        adaptation:guidance.state==='reviewed'||adaptationReview().ready?'reviewed':bpr.adaptation_review?'withheld':'pending'}:null;
      if(guidance.state!=='reviewed')limitations.push(builds?'Tier, team and strategy guidance is dated advice for patch '+(guidance.patch||'unknown')+'. Starting builds were reviewed separately for patch '+builds.patch+'.':'Reviewed guidance is dated advice for patch '+(guidance.patch||'unknown')+'.');
      return {version:1,checked_at:new Date(now).toISOString(),statistics,mechanics,verification,guidance,builds,ranking_current:rankingCurrent,advice_mode:rankingCurrent&&guidance.state==='reviewed'?'current':'saved',limitations,thresholds:{...EVIDENCE_HOURS}};
    }
    // ---- Strategy review: packets are prepared for a human reviewer. Building one is read-only: it never
    // changes a review status, a review date, a recommendation or an observation. ----
    function strategyReviewDue({now=Date.now()}={}) {
      const g=bundle?.guidance,next=Date.parse(g?.maintenance_review?.next_weekly_review),reasons=[];
      if(g?.patch!==bundle?.official?.live?.version)reasons.push('Guidance was reviewed for patch '+(g?.patch||'unknown')+'; the live patch is '+(bundle?.official?.live?.version||'unverified')+'.');
      if(bundle?.recommendation_context)reasons.push(bundle.recommendation_context.reason||'Recommendations are currently withheld.');
      if(Number.isFinite(next)&&next<=now)reasons.push('The scheduled review date '+g.maintenance_review.next_weekly_review+' has passed.');
      if(String(g?.status||'').startsWith('needs review'))reasons.push('The reviewed guidance is marked "'+g.status+'": official content changed after the last review.');
      return {due:reasons.length>0,reasons};
    }
    // true when patch a is later than patch b (1.16.10 > 1.16.9). Anything that is not a dotted number, or a
    // missing review patch, cannot be ordered and is flagged, so a reviewer looks rather than a change being missed.
    function laterPatch(a,b) {
      const parts=v=>/^\d+(\.\d+)*$/.test(String(v??''))?String(v).split('.').map(Number):null,x=parts(a),y=parts(b);
      if(!x||!y)return true;
      for(let i=0;i<Math.max(x.length,y.length);i++){const d=(x[i]||0)-(y[i]||0);if(d)return d>0;}
      return false;
    }
    function textHash(text) {   // cyrb53: a stable, dependency-free digest for identities (not a security checksum)
      let h1=0xdeadbeef,h2=0x41c6ce57;
      for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);h1=Math.imul(h1^c,2654435761);h2=Math.imul(h2^c,1597334677);}
      h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909);h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);
      return (4294967296*(2097151&h2)+(h1>>>0)).toString(16).padStart(14,'0');
    }
    function officialSignature() {
      const o=bundle?.official,live=o?.live;
      if(o?.status!=='verified'||!live?.fingerprint)return null;
      const rows=(o.articles||[]).filter(a=>a?.status==='live').map(a=>[String(a.version),String(a.fingerprint)]).sort((x,y)=>(x[0]+x[1]).localeCompare(y[0]+y[1]));
      return textHash(JSON.stringify([rows,['current',String(live.version),String(live.fingerprint)]]));
    }
    function isoWeek(ms) {
      const d=new Date(ms),t=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));t.setUTCDate(t.getUTCDate()+4-(t.getUTCDay()||7));
      const week=Math.ceil(((t-Date.UTC(t.getUTCFullYear(),0,1))/86400000+1)/7);return t.getUTCFullYear()+'-W'+String(week).padStart(2,'0');
    }
    function reviewPacket({now=Date.now(),revision=null,cohorts=null,toolVersion=null}={}) {
      const plain=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,''),g=bundle?.guidance||{},live=bundle?.official?.live||{};
      const change=(c,hotfix)=>({patch:c.patch??null,kind:c.kind??null,key:c.key??null,name:c.name??null,field:c.field??null,change:c.change??null,source:c.source??null,fetched_at:c.fetched_at??null,hotfix,historical:!!c.historical});
      const official=(bundle?.official_changes||[]).map(c=>change(c,false)),hotfixes=(bundle?.official_hotfix_changes||[]).map(c=>change(c,true)),all=[...official,...hotfixes];
      const plans=(g.builds||[]).map(p=>{
        const parts=new Set([heroes[p.slug]?.display_name,...(p.core||[]),...(p.finish||[]),p.crest,p.augment,p.eternal,...(p.blessings||[])].map(plain).filter(Boolean));
        const reviewedPatch=p.maintenance_review?.patch||p.patch||g.patch||null;const affected=all.filter(c=>(c.kind==='hero'&&c.key===p.slug)||(plain(c.name)&&parts.has(plain(c.name)))).map(c=>({...c,published_after_review_patch:laterPatch(c.patch,reviewedPatch)}));
        return {slug:p.slug,role:p.role,title:p.title||null,plan_patch:p.patch||null,result:p.maintenance_review?.result||'unresolved',reviewed_at:p.maintenance_review?.reviewed_at||p.reviewed_at||null,
          reason:p.maintenance_review?.reason||'No maintenance result recorded',limitation:p.maintenance_review?.limitation||'',
          reviewed_parts:{core:p.core||[],finish:p.finish||[],crest:p.crest||null,augment:p.augment||null,eternal:p.eternal||null,blessings:p.blessings||[]},
          reviewed_for_patch:reviewedPatch,affected_by:affected,needs_attention:affected.some(c=>c.published_after_review_patch)||(p.maintenance_review?.result||'unresolved')==='unresolved'};
      });
      // Identity: every live official article (a hotfix on the preceding launch article changes it too), the
      // guidance review date and the ISO week.
      const week=isoWeek(now),signature=officialSignature(),identity={live_version:live.version||null,live_fingerprint:live.fingerprint||null,official_signature:signature,guidance_reviewed_at:g.reviewed_at||null,iso_week:week};
      identity.id=[String(live.version||'unverified').replace(/[^0-9a-z.]/gi,''),String(signature||'unverified').slice(0,12),String(g.reviewed_at||'unreviewed').slice(0,10).replace(/[^0-9-]/g,''),week].join('_');
      const dates=sources=>Object.fromEntries(Object.entries(sources||{}).map(([k,v])=>[k,{status:v?.status??null,fetched_at:v?.fetched_at??null}]));
      return {schema:2,kind:'strategy-review-packet',generated_at:new Date(now).toISOString(),tool_version:toolVersion||bundle?.tool_version||null,identity,
        purpose:'Prepared for human review. Creating this packet changes no review status, review date, recommendation or observation.',
        live_patch:{version:live.version||null,title:live.title||null,release_date:live.release_date||null,url:live.url||null,fingerprint:live.fingerprint||null,verification:bundle?.official?.status||null,checked_at:bundle?.official?.checked_at||null},
        guidance:{patch:g.patch||null,status:g.status||null,reviewed_at:g.reviewed_at||null,review_revision:g.review_revision??null,next_review_at:g.maintenance_review?.next_weekly_review||null,summary:g.maintenance_review?.summary||null,...strategyReviewDue({now})},
        evidence:evidenceState({now}),
        official_changes:official,hotfix_changes:hotfixes,unmapped_changes:all.filter(c=>c.kind==='unmapped').length,
        plans,plans_needing_attention:plans.filter(p=>p.needs_attention).map(p=>p.slug+'/'+p.role),
        definition_conflicts:bundle?.definition_issues||[],
        reference_bundle:{bracket:bundle?.bracket?.segment||null,label:bundle?.bracket?.label||null,generated_at:bundle?.generated_at||null,sha256:/^[a-f0-9]{64}$/.test(String(revision??''))?revision:null,refresh_result:bundle?.refresh_result||null,source_dates:dates(bundle?.sources)},
        brackets:cohorts?Object.entries(cohorts).map(([key,c])=>({bracket:key,label:c?.label||null,status:c?.status||null,collection_status:c?.collection_status||null,sha256:c?.sha256||null,generated_at:c?.generated_at||null,patch:c?.patch||null,source_dates:c?.source_dates||null})):null};
    }
    function performance(pick,{source='auto'}={}) {
      const selected=source==='auto'?performancePolicy().source:source;
      if(selected==='pred'){
        if(bundle.official?.status!=='verified'||!bundle.scoped_statistics||bundle.scoped_statistics.patch!==bundle.official?.live?.version)return null;
        const r=bundle.scoped_statistics.roles?.[pick.role]?.rows?.find(x=>x.slug===pick.slug);
        return r&&finite(r.winRate)&&r.winRate>=0&&r.winRate<=100&&Number.isInteger(r.matches)&&r.matches>0?{wr:r.winRate,played:r.matches,tier:null,url:r.url,source:'Pred.gg',patch:bundle.scoped_statistics.patch,fetched_at:r.fetched_at,interval95:r.interval95,retained:bundle.scoped_statistics.status==='retained'}:null;
      }
      if(selected!=='statz')return null;
      const r=heroes[pick.slug]?.roles?.[pick.role];return r?.status==='ok'&&finite(r.winRate)&&r.winRate>=0&&r.winRate<=100&&Number.isInteger(r.playedGames)&&r.playedGames>0?{wr:r.winRate,played:r.playedGames,tier:r.tier,url:r.url,source:'Statz',patch:bundle.patch,fetched_at:r.fetched_at||bundle.sources?.statz_hero_pages?.fetched_at,broad_dataset:true,retained:bundle.sources?.statz_hero_pages?.status==='retained'}:null;
    }
    function metaReview(slug,role) {
      const review=bundle.guidance?.meta_review,row=review?.entries?.find(r=>r.slug===slug&&r.role===role);
      if(!row)return null;
      const patchOK=review.patch===bundle.official?.live?.version&&bundle.official?.status==='verified'&&reviewReady();
      const cohortOK=review.bracket===bundle.bracket?.segment&&review.bracket_label===bundle.scoped_statistics?.bracket_label&&review.patch===bundle.scoped_statistics?.patch&&bundle.scoped_statistics?.gameModes?.length===1&&bundle.scoped_statistics.gameModes[0]===review.mode;
      // This authored review used Pred.gg's cohort. A broader Statz observation
      // cannot reactivate it or be compared with its saved Pred.gg baseline.
      const current=performance({slug,role},{source:'pred'}),sampleOK=!!current&&bundle.scoped_statistics?.status==='ok'&&!current.retained&&current.played>=100,active=patchOK&&cohortOK&&sampleOK;
      const moved=active&&current?.played>=500&&finite(row.evidence?.winRate)&&Math.abs(current.wr-row.evidence.winRate)>=3;
      return {...row,active:active&&!moved,tier:active&&!moved?row.tier:null,reviewed_tier:row.tier,current,
        patch:review.patch,bracket:review.bracket_label,reviewed_at:review.reviewed_at,
        status:!patchOK?'Patch or guidance needs review':!cohortOK?'Review covers a different cohort':current?.retained?'Retained sample; refresh required to reassess this tier':!sampleOK?'Current role evidence unavailable or below 100 games':moved?'Statistics moved since review':'Dated editorial judgment',
        evidenceMoved:moved,limitedSample:!!current&&current.played<500,
        definition:review.tier_definitions?.[row.tier],method:review.method};
    }
    function validPicks(picks,{size=5,bans=[],enemies=[]}={}) {
      if(picks.length>size) throw Error('More locked picks than the selected combination size.');
      const slugs=new Set(),assigned=new Set(),blocked=new Set([...bans,...enemies.map(p=>p.slug)]);
      for(const p of picks) {
        if(!heroes[p.slug] || !roles(p.slug).includes(p.role)) throw Error('Choose a supported planning role for every locked hero.');
        if(slugs.has(p.slug)) throw Error('A hero can only be selected once.');
        if(assigned.has(p.role)) throw Error('Allied picks need different roles.');
        if(blocked.has(p.slug)) throw Error('A locked hero is banned or selected by the enemy.');
        slugs.add(p.slug); assigned.add(p.role);
      }
      return true;
    }
    function coverage(picks) {
      // Keep role and hero together when an old/unknown saved pick is unavailable.
      const members=picks.map(p=>({p,h:plannedKit(p.slug,p.role)})).filter(x=>x.h);
      const rules=[['Frontline',['frontline']],['Hard CC',['hard_cc']],
        ['Engage',['containment','initiation']],['Peel',['peel']],
        ['Physical threat',['physical'],(h,p)=>p.role==='carry'||cap(h,'sustained')||!cap(h,'magical')],
        ['Magical threat',['magical'],(h,p)=>p.role==='midlane'||cap(h,'area_followup')||p.role==='carry']];
      const checks=rules.map(([label,tags,eligible])=>{
        const damageType=label==='Physical threat'?'physical':label==='Magical threat'?'magical':null;
        const refs=members.flatMap(({p,h})=>{
          if(damageType&&bundle.guidance?.damage_review){
            const assessment=damageAssessment(p.slug),plan=buildReview(p.slug,p.role);
            const conversion=plan?.active&&plan.penetration_focus==='magical'&&plan.augment==='Mystic Marksman'&&bundle.perks?.['mystic-marksman']?.description==='Knock, Knock! deals Magical Damage instead.';
            const primary=conversion?['magical']:assessment.primary;
            const present=primary.includes(damageType)||assessment.secondary.includes(damageType);
            if(!present)return [];
            const dedicated=assessment.active&&plan?.active&&p.role!=='support'&&!['tank','enchanter'].includes(plan.style)&&primary.includes(damageType);
            const keys=conversion&&damageType==='magical'?['RMB']:primary.includes(damageType)?assessment.ability_keys:[support(h,damageType)?.key];
            const a=h.abilities?.find(a=>a.key===keys?.[0]);
            return [{hero:p.slug,role:p.role,tag:damageType,ability:a?.display_name||'Damage review',key:a?.key||null,
              contribution:dedicated?'primary':'supporting',reason:(dedicated?'Primary damage plan. ':'Supporting or incidental damage; add a dedicated source. ')+(conversion?'Selected Mystic Marksman converts Knock, Knock! to magical damage. ':assessment.reason)}];
          }
          const tag=tags.find(t=>cap(h,t));
          if(!tag||(eligible&&!eligible(h,p)))return [];
          const ref=support(h,tag);
          return [{hero:p.slug,role:p.role,...(ref||{tag,ability:'Supporting description unavailable',key:null,reason:'Capability exists without an inspectable ability record.'})}];
        });
        return {label,present:damageType&&bundle.guidance?.damage_review?refs.some(r=>r.contribution==='primary'):refs.length>0,evidence:refs,
          ...(damageType&&bundle.guidance?.damage_review?{primaryDamageCheck:true}: {})};
      });
      return {checks,missing:checks.filter(x=>!x.present).map(x=>x.label),loadouts:members.flatMap(x=>x.h.loadout_notes||[]),note:'Calculated kit and reviewed default-plan coverage, not damage share or a win prediction. A support or tank spell is supporting damage. A primary threat requires a current damage plan; your actual items, loadout and execution can change it.'};
    }
    function damageAssessment(slug){
      const h=heroes[slug],review=bundle.guidance?.damage_review,r=review?.profiles?.[slug];
      const ev=h?.capability_evidence||{},present=['physical','magical','true_damage'].filter(t=>ev[t]?.length).map(t=>t==='true_damage'?'true':t);
      if(!review)return {active:false,status:'Legacy kit assessment',primary:[],secondary:present,ability_keys:[],reason:'No separate reviewed damage pattern is stored.'};
      const current=bundle.official?.status==='verified'&&bundle.official?.live?.version===review.patch&&bundle.guidance?.patch===review.patch&&reviewReady();
      const matching=!!r&&Object.entries(r.source_abilities||{}).length>0&&Object.entries(r.source_abilities).every(([key,text])=>h?.abilities?.find(a=>a.key===key)?.text===text);
      const active=current&&matching;
      return {active,status:!current?'Damage review needs current patch verification':!matching?'Damage review needs a source check':'Reviewed base-kit pattern',primary:active?r.primary:[],secondary:present.filter(t=>!active||!r.primary.includes(t)),ability_keys:active?r.ability_keys:[],reason:active?r.reason:'Primary damage is unknown until this changed or unreviewed kit is checked.',source:r?.source,reviewed_at:review.reviewed_at};
    }
    function matchup(ally,enemy) {
      if(!heroes[ally.slug]||!heroes[enemy.slug]) return [];
      const results=[], same=enemy.role&&enemy.role===ally.role;
      const current=bundle?.pred_game_data?.role_data?.[ally.slug]?.[ally.role]?.counters;
      for(const ob of current?.tables?.counters?.cohort_verified?current.tables.counters.rows:[]){
        if(ob.slug===enemy.slug&&finite(ob.wr)&&finite(ob.played)&&ob.played>0)results.push({...ob,calculated:false,inverted:false,source:'Pred.gg',url:current.url,fetched_at:current.fetched_at,patch:current.patch,
          owner:ally.slug,ownerRole:ally.role,enemyRole:enemy.role||null,retained:bundle.pred_game_data?.status==='retained',label:(bundle.pred_game_data?.status==='retained'?'Retained · ':'')+'Pred.gg '+current.patch+' · '+current.bracket+' Ranked · allied '+ally.role+'; enemy role unspecified',
          limitation:'Opponent role is not recorded. This is not a verified '+ally.role+' vs '+(enemy.role||'unknown role')+' lane sample.'});
      }
      const candidates=[{owner:ally,opponent:enemy,inverted:false}, ...(enemy.role?[{owner:enemy,opponent:ally,inverted:true}]:[])];
      for(const c of candidates) {
        const stats=heroes[c.owner.slug].roles?.[c.owner.role]; if(stats?.status!=='ok') continue;
        // Lane lists do not identify the opposing role. Do not claim a cross-role matchup is a direct lane comparison.
        if(enemy.role && !same) continue;
        for(const [i,b] of (stats.builds||[]).entries()) {
          const seen=new Set();
          for(const ob of [...(b.lane_counters||[]),...(b.strong_against||[])]) {
            if(ob.name!==c.opponent.slug || seen.has(ob.name) || !finite(ob.winRate)||!finite(ob.playedGames)) continue;
            seen.add(ob.name); results.push({wr:c.inverted?100-ob.winRate:ob.winRate,played:ob.playedGames,variant:i,augment:b.perk,eternal:b.eternal,
              inverted:c.inverted,calculated:c.inverted,source:'Statz',patch:bundle.patch,retained:bundle.sources?.statz_hero_pages?.status==='retained',owner:c.owner.slug,ownerRole:c.owner.role,enemyRole:enemy.role||null,url:stats.url,fetched_at:stats.fetched_at,
              label:c.inverted?'Calculated inversion of enemy-role build observation':'Observed on allied-role build page',
              limitation:'Statz does not identify the opponent role in this row. Do not treat this as a verified role-vs-role sample.'});
          }
        }
      }
      if(!results.length) {
        for(const ob of [...(heroes[ally.slug].general_strong_against||[]),...(heroes[ally.slug].general_counters||[])]) {
          if(ob.slug===enemy.slug && finite(ob.wr)&&finite(ob.played)) results.push({...ob,calculated:false,inverted:false,source:'Statz',patch:bundle.patch,retained:bundle.sources?.statz_hero_pages?.status==='retained',label:'Hero-wide observation; roles unspecified',url:heroes[ally.slug].hero_wide_url,fetched_at:heroes[ally.slug].hero_wide_fetched_at,limitation:'Selected enemy role has no matching lane sample.'});
        }
      }
      return results;
    }
    function currentMatchup(ally,enemy,min=100){
      if(!verificationCurrent())return null;
      const rows=matchup(ally,enemy),live=bundle?.official?.live?.version;
      const scope=bundle?.pred_game_data?.role_data?.[ally.slug]?.[ally.role]?.counters;
      if(!['ok','partial'].includes(bundle.pred_game_data?.status)||!['ok','partial'].includes(bundle.scoped_statistics?.status)||bundle?.official?.status!=='verified'||scope?.status!=='ok'||scope.patch!==live||scope.role!==ally.role||scope.mode!=='RANKED'||scope.bracket!==bundle?.scoped_statistics?.bracket_label||scope.version_id!==(bundle?.scoped_statistics?.versions||[]).join(',')||!scope.tables?.counters?.cohort_verified)return null;
      const row=rows.filter(r=>r.source==='Pred.gg'&&r.patch===live&&r.played>=min&&finite(r.wr)).sort((a,b)=>b.played-a.played)[0];
      return row?{...row,retained:bundle.pred_game_data?.status==='retained'}:null;
    }
    function assess(picks,min=100,enemies=[]) {
      const links=[];for(let i=0;i<picks.length;i++) for(let j=i+1;j<picks.length;j++) links.push({a:picks[i].slug,b:picks[j].slug,pair:pair(picks[i].slug,picks[j].slug,min),fit:fit(picks[i].slug,picks[j].slug,picks[i].role,picks[j].role)});
      const measured=links.filter(l=>l.pair), individual=picks.map(p=>({pick:p,performance:performance(p)}));
      return {picks,links,observed:measured.length,possible:links.length,lift:mean(measured.map(l=>l.pair.lift)),
        individual,meanHeroWR:mean(individual.map(p=>p.performance?.wr)),kitFit:mean(links.map(l=>l.fit.score)),coverage:coverage(picks),
        matchups:picks.flatMap(p=>enemies.map(e=>({ally:p,enemy:e,rows:matchup(p,e)})))};
    }
    function fightPlan(picks) {
      validPicks(picks);
      const assessment=assess(picks),steps=[],used=new Set(),risks=[],proofs=[],kits=Object.fromEntries(picks.map(p=>[p.slug,plannedKit(p.slug,p.role)]));
      const refId=s=>s.hero+'|'+s.ability;
      function step(title,text,supports,summary=text){supports=supports.filter(Boolean);steps.push({title,text,summary,supports});supports.forEach(s=>{used.add(refId(s));proofs.push(s);});}
      const interactions=assessment.links.flatMap(l=>l.fit.reasons||[]).filter(r=>r.supports?.length&&r.counted!==false);
      const opening=interactions.find(r=>r.kind==='area chain')||interactions.find(r=>r.kind==='catch conversion');
      if(opening)step('Create the opening',opening.text,opening.supports,opening.summary||opening.text);
      const damage=picks.slice().sort((a,b)=>(a.role==='carry'?-2:a.role==='midlane'?-1:0)-(b.role==='carry'?-2:b.role==='midlane'?-1:0));
      const threat=damage.find(p=>cap(kits[p.slug],'sustained'))||damage.find(p=>cap(kits[p.slug],'burst'));
      if(threat){
        const h=kits[threat.slug],tag=cap(h,'sustained')?'sustained':'burst',s=support(h,tag);
        step('Convert the opening',h.display_name+(tag==='sustained'?' keeps attacking a reachable target with ':' follows the catch with ')+evidence(h,tag)+'. Follow the control and preserve a safe position; the kit label does not guarantee target access.',[s]);
        const enabler=picks.filter(p=>p.slug!==threat.slug).sort((a,b)=>(a.role==='support'?-1:0)-(b.role==='support'?-1:0)).find(p=>cap(kits[p.slug],'peel')||cap(kits[p.slug],'amplifier'));
        if(enabler){
          const helper=kits[enabler.slug],tags=['peel','protection','amplifier'];
          const candidates=tags.flatMap(tag=>(helper.capability_evidence?.[tag]||[]).map(row=>({hero:enabler.slug,tag,...row})));
          const spare=candidates.find(s=>!used.has(refId(s)));
          if(spare)step('Keep the damage online',helper.display_name+' holds '+spare.ability+' to '+(spare.tag==='amplifier'?'improve '+h.display_name+"'s damage when a target is available.":'support '+h.display_name+' if an enemy dives or the fight turns.'),[spare]);
          else if(candidates.length)risks.push({text:helper.display_name+"'s control is already part of the opening. It cannot also be reserved for peel on that same use; stagger the commitment.",supports:[candidates[0]]});
        }
      }
      if(!steps.length)step('Inspect before committing','No supported multi-hero sequence was identified. Review individual kits and target access; no fight plan is inferred from missing evidence.',[]);
      for(const link of assessment.links)for(const risk of link.fit.constraints||[])if(!risks.some(r=>r.text===risk.text))risks.push(risk);
      const gapText={'Frontline':'No frontline capability is identified. Avoid assuming someone can absorb an extended opening.',
        'Hard CC':'No hard control is identified. These picks cannot be assumed to hold a target for follow-up.',
        'Engage':'No engage capability is identified. Look for a catch, an enemy commitment, or help from the remaining team.',
        'Peel':'No peel capability is identified. Leave room to retreat if enemies reach the damage heroes.',
        'Physical threat':'Physical threat coverage is missing under the kit rules; inspect the eventual builds.',
        'Magical threat':'Magical threat coverage is missing under the kit rules; inspect the eventual builds.'};
      assessment.coverage.missing.forEach(label=>risks.push({text:gapText[label],supports:[]}));
      const involved=new Set(proofs.map(s=>s.hero));
      return {steps,risks,loadouts:assessment.coverage.loadouts,unassigned:picks.filter(p=>!involved.has(p.slug)).map(p=>p.slug),
        scope:picks.length<5?'This is a partial-team plan. Remaining roles can supply missing coverage.':'Coverage describes these five selected roles.',
        note:'Calculated from named ability capabilities. This is an execution suggestion, not measured strategy or a team win prediction.'};
    }
    // Lexicographic ordering: no listing-count bonus, no invented zero for absent pairs.
    function compare(a,b,metric='lift') {
      const fields=metric==='matchup'?['matchupMin','kitFit','meanHeroWR']:metric==='kit'?['kitFit','meanHeroWR']:metric==='meta'?['meanHeroWR','kitFit']:['lift','meanHeroWR','kitFit'];
      for(const f of fields) { const x=a[f],y=b[f]; if(finite(x)&&finite(y)&&Math.abs(x-y)>1e-9)return y-x; if(finite(x)!==finite(y))return finite(x)?-1:1; }
      return a.picks.map(p=>p.slug).join().localeCompare(b.picks.map(p=>p.slug).join());
    }
    function partners(slug,{min=100,role='',heroRole='',metric='stronger'}={}) {
      const observed=[],exploratory=[],derived=[];
      for(const other of Object.keys(heroes)) {
        if(other===slug || (role&&!roles(other).includes(role)) || (heroRole&&!roles(other).some(r=>r!==heroRole&&(!role||r===role))))continue;
        const p=pair(slug,other,1);
        const candidateRoles=roles(other).filter(r=>(!heroRole||r!==heroRole)&&(!role||r===role)&&automaticRole(other,r));
        if(!candidateRoles.length)continue;
        const performances=candidateRoles.map(role=>({role,performance:performance({slug:other,role})})).filter(x=>finite(x.performance?.wr)&&x.performance.played>=min).sort((a,b)=>b.performance.wr-a.performance.wr||b.performance.played-a.performance.played);
        const choices=candidateRoles.map(role=>({role,fit:fit(slug,other,heroRole,role),performance:performances.find(p=>p.role===role)?.performance||null}));
        if(bundle.guidance?.sequence_review)choices.sort((a,b)=>(b.fit.score??-1)-(a.fit.score??-1)||(b.performance?.wr??-1)-(a.performance?.wr??-1)||a.role.localeCompare(b.role));
        else choices.sort((a,b)=>(b.performance?.wr??-1)-(a.performance?.wr??-1));
        const selection=choices[0],selectedRole=selection?.role,kit=selection?.fit||fit(slug,other,heroRole,selectedRole);const r={slug:other,pair:p,fit:kit,role:selectedRole,performance:selection?.performance||null};
        if(p&&p.played>=min)observed.push(r);else if(p)exploratory.push(r);else derived.push(r);
      }
      const kitSort=(a,b)=>(b.fit.score??-1)-(a.fit.score??-1)|| (finite(b.performance?.wr)?1:0)-(finite(a.performance?.wr)?1:0) || (b.performance?.wr??0)-(a.performance?.wr??0) || a.slug.localeCompare(b.slug);
      const sorter=metric==='kit'?kitSort:(a,b)=>(metric==='mean'?b.pair.lift_mean-a.pair.lift_mean:b.pair.lift-a.pair.lift)||(b.fit.score||0)-(a.fit.score||0);
      observed.sort(sorter);exploratory.sort(sorter);derived.sort(kitSort);
      const combined=[...observed,...derived,...exploratory.map(r=>({...r,pair:null}))].sort(kitSort);
      return {observed,exploratory,derived,combined};
    }
    function recommend(picks,{role='jungle',bans=[],enemies=[],min=100,metric='lift',includeUnsampled=true}={}) {
      validPicks(picks,{bans,enemies});const blocked=new Set([...picks.map(p=>p.slug),...bans,...enemies.map(p=>p.slug)]);
      if(picks.some(p=>p.role===role)) return [];
      return Object.keys(heroes).filter(s=>!blocked.has(s)&&roles(s).includes(role)&&automaticRole(s,role)&&(includeUnsampled||performance({slug:s,role}))).map(slug=>{
        const c=assess([...picks,{slug,role}],min,enemies),links=c.links.filter(l=>l.a===slug||l.b===slug),observed=links.filter(l=>l.pair),rows=enemies.map(enemy=>{const row=currentMatchup({slug,role},enemy,min);return row?{...row,enemy}:null;}).filter(Boolean).sort((a,b)=>a.wr-b.wr);
        c.candidateMetrics={lift:mean(observed.map(l=>l.pair.lift)),kitFit:mean(links.map(l=>l.fit.score)),meanHeroWR:performance({slug,role})?.wr??null,observed:observed.length,possible:links.length,matchupMin:rows[0]?.wr??null,limitingMatchup:rows[0]||null,matchupCoverage:rows.length,picks:c.picks};
        return c;
      }).sort((a,b)=>compare(a.candidateMetrics,b.candidateMetrics,metric));
    }
    function generate(locks,{size=3,bans=[],enemies=[],min=100,metric='lift',preferredRole='jungle',requiredRole='',width=48,includeUnsampled=false,onProgress=null}={}) {
      if(![2,3,5].includes(size))throw Error('Choose 2, 3, or 5 heroes.'); validPicks(locks,{size,bans,enemies});
      if(requiredRole&&!ROLES.includes(requiredRole))throw Error('Choose a valid required role.');
      if(!Number.isInteger(width)||width<1||width>200)throw Error('Search width must be between 1 and 200.');
      let expanded=0;
      const usedRoles=locks.map(p=>p.role),remaining=[preferredRole,...ROLES].filter((r,i,a)=>ROLES.includes(r)&&!usedRoles.includes(r)&&a.indexOf(r)===i);
      const roleSets=[];
      function choose(start,left,selected){
        if(left===0){if(!requiredRole||usedRoles.includes(requiredRole)||selected.includes(requiredRole))roleSets.push(selected);return;}
        for(let i=start;i<=remaining.length-left;i++)choose(i+1,left-1,[...selected,remaining[i]]);
      }
      choose(0,size-locks.length,[]);
      if(!roleSets.length)throw Error('The locked picks fill the combination without the required role. Reopen a slot or change the role filter.');
      // Preserve a beam per role set, so an initially strong partial team cannot erase another role pairing.
      const finalists=[],searchedRoleSets=[],steps=roleSets.length*(size-locks.length);let step=0;   // progress only reports; it never changes the search
      for(const fillRoles of roleSets){
        let beams=[assess(locks,min,enemies)];
        for(const role of fillRoles) {
          const next=[];
          for(const team of beams) {
            const choices=recommend(team.picks,{role,bans,enemies,min,metric,includeUnsampled}); expanded+=choices.length; next.push(...choices);
          }
          next.sort((a,b)=>compare(a,b,metric));const seen=new Set();beams=[];
          for(const n of next) {const id=n.picks.map(p=>p.role+':'+p.slug).sort().join('|');if(seen.has(id))continue;seen.add(id);beams.push(n);if(beams.length>=width)break;}
          step++;if(typeof onProgress==='function')onProgress({done:step,total:steps});
        }
        searchedRoleSets.push([...usedRoles,...fillRoles]);finalists.push(...beams);
      }
      finalists.sort((a,b)=>compare(a,b,metric));
      return {alternatives:finalists.slice(0,10).map(c=>({...c,plan:fightPlan(c.picks)})),expanded,width,size,searchedRoleSets,requiredRole,
        note:'Bounded beam search across every eligible role combination; suggestions, not an exhaustive optimum. Statistics are pair observations, never trio or team win rates.'};
    }
    function substitute(picks,role,options={}) {
      validPicks(picks,{size:picks.length,bans:options.bans||[],enemies:options.enemies||[]});
      const original=picks.find(p=>p.role===role);if(!original)throw Error('Choose an occupied role to replace.');
      const result=generate(picks.filter(p=>p.role!==role),{...options,size:picks.length,requiredRole:role,bans:[...(options.bans||[]),original.slug]});
      result.substitution={role,original:original.slug};
      return result;
    }
    // ==== BUILDS: one recommended loadout per hero/role, and a ten-hero live build. Pure rules over the bundle. ====
    const NK = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const itemsByName = new Map(Object.entries(bundle?.items || {}).flatMap(([k, it]) => [[NK(it.name || k), it], [NK(k), it]]));
    const item = n => itemsByName.get(NK(n)) || null;
    const statNum = (it, k) => { const n = parseFloat(it && it.stats ? it.stats[k] : NaN); return Number.isFinite(n) ? n : 0; };
    const fxText = it => (it?.effects || []).map(e => (e.name || '') + ': ' + (e.condition || '') + ' ' + (e.text || '')).join(' | ').replace(/�/g, '•').replace(/\s+/g, ' ');
    const fxMatch = (it, rx) => { const m = fxText(it).match(rx); return m ? m[0].trim() : ''; };
    const top = (list, n = 3) => (list || []).filter(x => finite(x.playedGames)).slice().sort((a, b) => b.playedGames - a.playedGames).slice(0, n);
    function variantChoice(slug, role, {min = 100, opponent = null} = {}) {
      const stats = heroes[slug]?.roles?.[role]; if (stats?.status !== 'ok' || !stats.builds?.length) return null;
      const rows = stats.builds.map((build, index) => {
        let vs = null;
        if (opponent) { const ob = [...(build.lane_counters || []), ...(build.strong_against || [])].find(x => x.name === opponent); if (ob && finite(ob.winRate) && finite(ob.playedGames)) vs = {wr: ob.winRate, played: ob.playedGames}; }
        return {index, build, vs};
      });
      const sampled = rows.filter(r => finite(r.build.playedGames) && r.build.playedGames >= min);
      const pool = sampled.length ? sampled : rows;
      let chosen = pool.slice().sort((a,b)=>sampled.length?((b.build.winRate??-1)-(a.build.winRate??-1)||b.build.playedGames-a.build.playedGames):b.build.playedGames-a.build.playedGames)[0];
      let reason = sampled.length ? 'Highest observed win rate among variants with at least ' + min + ' games.' : 'No variant reaches ' + min + ' games; most-played thin sample. Treat with caution.';
      const withVs = rows.filter(r => r.vs && r.vs.played >= 30 && (r.build.playedGames || 0) >= min).sort((a, b) => b.vs.wr - a.vs.wr);
      if (withVs.length) {
        const best = withVs[0], current = chosen.vs && chosen.vs.played >= 30 ? chosen.vs.wr : null;
        if (best.index !== chosen.index && (current != null && best.vs.wr - current >= 5)) { chosen = best; reason = 'Observed matchup against the lane opponent (' + best.vs.wr + '% on ' + best.vs.played + ' games) is at least 5 points better than the default choice.'; }
      }
      return {slug, role, index: chosen.index, build: chosen.build, vs: chosen.vs, reason, rows, sampled: sampled.length, url: stats.url, fetched_at: stats.fetched_at, note: 'Variant selection is a rule over observed samples, not a prediction.'};
    }
    function buildSummary(slug, role, opts = {}) {
      const choice = variantChoice(slug, role, opts); if (!choice) return null;
      const b = choice.build, core = b.core_items || {}, crest = top(b.best_base_crests, 1)[0] || null;
      return {...choice, core: {items: (core.coreItems || []).slice(), wr: core.winRate ?? null, played: core.playedGames ?? null},
        crest: crest ? {name: crest.display_name || crest.name, mid: crest.midCrest || null, upgrades: top(crest.upgrades, 2).map(u => ({name: u.display_name || u.name, wr: u.winRate, played: u.playedGames})), wr: crest.winRate, played: crest.playedGames} : null,
        blessings: [top(b.common_perks_1, 1)[0], top(b.common_perks_2, 1)[0]].map(x => x ? {name: x.name, wr: x.winRate, played: x.playedGames} : null),
        alternatives: Object.fromEntries([4, 5, 6].map(n => [n, top(b['items' + n], 3).map(x => ({name: x.display_name || x.name, wr: x.winRate, played: x.playedGames}))])),
        skill: {priority: b.skillUpgradePriority || [], order: b.popular_skill_order?.skillOrder || [], wr: b.popular_skill_order?.winRate ?? null, played: b.popular_skill_order?.playedGames ?? null},
        performance: performance({slug, role})};
    }
    function heroProfile(slug,role='') {
      const h=role?plannedKit(slug,role):heroes[slug];if(!h?.capabilities?.length)return null;
      const c=h.capabilities,ev=h.capability_evidence||{},off=tag=>(ev[tag]||[]).filter(e=>e.key!=='LMB');
      const auto=c.includes('sustained'),phys=off('physical').length>0,mag=off('magical').length>0;
      // Ability damage semantics, never scaling-reference counts. Basic attacks remain relevant for sustained attackers.
      const basicP=(ev.physical||[]).some(x=>x.key==='LMB'),basicM=(ev.magical||[]).some(x=>x.key==='LMB');
      const p=auto&&basicP!==basicM?basicP:phys,m=auto&&basicP!==basicM?basicM:mag;
      const assessment=damageAssessment(slug),primary=bundle.guidance?.damage_review?assessment.primary:null;
      const dmg=primary?(primary.length>1?'mixed':primary[0]||'unknown'):p&&m?'mixed':p?'physical':m?'magical':'unknown';
      return {slug,name:h.display_name,loadouts:h.loadout_notes||[],source:role?'current ability evidence and reviewed default augment':'current ability evidence',dmg,damageReview:assessment,
        conditionalDamage:slug==='wraith'&&bundle.perks?.['mystic-marksman']?.description==='Knock, Knock! deals Magical Damage instead.'?'Mystic Marksman converts the shot to magical damage. Enemy augment is unknown; choose a magical-armor priority if confirmed in your game.':null,
        frontline:c.includes('frontline'),cc:c.includes('hard_cc'),hold:c.includes('hard_cc'),ccKinds:[],
        healer:c.includes('healing')||c.includes('ally_healing'),shielder:c.includes('ally_shield'),burst:c.includes('burst'),
        autos:auto,mobility:c.includes('mobility'),protects:c.includes('ally_healing')||c.includes('ally_shield'),selfShield:c.includes('self_shield'),conditionalHealing:c.includes('conditional_healing'),lifestealCompatible:c.includes('lifesteal_compatible'),
        evidence:Object.entries(ev).filter(([k])=>['physical','magical','healing','ally_healing','ally_shield','hard_cc','frontline'].includes(k)).flatMap(([tag,rows])=>rows.map(r=>({hero:slug,tag,...r})))};
    }
    function enemyProfile(slugs) {
      const ps = slugs.map(slug=>heroProfile(slug)).filter(Boolean), cnt = f => ps.filter(f).length, who = f => ps.filter(f).map(p => p.name);
      const w = (p, k) => p.dmg === k || p.dmg === 'mixed' ? 1 : 0;
      return {profiles: ps, n: ps.length, missing: slugs.filter(s => !heroProfile(s)),
        phys: ps.reduce((a, p) => a + w(p, 'physical'), 0), physWho: who(p => p.dmg === 'physical' || p.dmg === 'mixed'),
        mag: ps.reduce((a, p) => a + w(p, 'magical'), 0), magWho: who(p => p.dmg === 'magical' || p.dmg === 'mixed'),
        cc: cnt(p => p.cc), ccWho: who(p => p.cc), hold: cnt(p => p.hold), healers: cnt(p => p.healer), healWho: who(p => p.healer),
        shielders: cnt(p => p.shielder), shieldWho: who(p => p.shielder), front: cnt(p => p.frontline), frontWho: who(p => p.frontline),
        burst: cnt(p => p.burst), burstWho: who(p => p.burst), autos: cnt(p => p.autos), autosWho: who(p => p.autos),
        magBurst: cnt(p => p.burst && ['magical','mixed'].includes(p.dmg)), magBurstWho: who(p => p.burst && ['magical','mixed'].includes(p.dmg)),
        conditionalSustain:who(p=>p.conditionalHealing||p.lifestealCompatible),damageUnknown:who(p=>p.dmg==='unknown'),
        note: 'Calculated counts of primary damage patterns, not damage share. A mixed primary pattern counts in both types; there is no assumed equal split. Incidental damage remains inspectable. These are base-kit assessments: enemy augments, items, levels and execution are unknown. Health scaling is not healing; optional sustain remains conditional.'};
    }
    function myProfile(slug, role, coreNames, useDefault=false) {
      const p = heroProfile(slug,useDefault?role:''); let pp = 0, mp = 0, as = 0;
      coreNames.forEach(n => { const it = item(n); if (!it) return; pp += statNum(it, 'Physical power'); mp += statNum(it, 'Magical power'); as += statNum(it, 'Attack speed') + statNum(it, 'Critical chance'); });
      const kitDmg = p && ['physical', 'magical'].includes(p.dmg) ? p.dmg : null;
      let off, source;
      if (pp > 0 || mp > 0) { off = pp > mp * 1.5 ? 'physical' : mp > pp * 1.5 ? 'magical' : 'mixed'; source = 'core items carry ' + (pp ? pp + ' physical power' : '') + (pp && mp ? ' and ' : '') + (mp ? mp + ' magical power' : ''); }
      else if (coreNames.length) { off = 'none'; source = 'the observed core items carry no power stat (health, armor or utility build)'; }
      else { off = kitDmg || 'none'; source = 'no observed core items; damage type taken from the kit description'; }
      const frontline = !!(p && p.frontline);
      return {slug, role, loadouts:p?.loadouts||[], name: heroes[slug]?.display_name || slug, off, autos: as > 0 || !!(p && p.autos), healer:!!p?.protects,restorationStats:!!(p?.healer||p?.selfShield||p?.protects),tanky: frontline || (role === 'support' && off === 'none'), frontline, source};
    }
    const ITEM_NEEDS = [
      {id: 'physical_armor', label: 'Physical armor', test: E => E.phys >= 2, prio: E => E.phys, why: E => E.physWho.join(', ') + ' have physical primary damage patterns (' + E.phys + ' picks; mixed patterns count in both types, not half a hero). Confirm who is threatening you in this game.', pick: it => statNum(it, 'Physical armor') >= 30, show: it => 'Physical armor ' + statNum(it, 'Physical armor')},
      {id: 'magical_armor', label: 'Magical armor', test: E => E.mag >= 2, prio: E => E.mag, why: E => E.magWho.join(', ') + ' have magical primary damage patterns (' + E.mag + ' picks; mixed patterns count in both types, not half a hero). Confirm who is threatening you in this game.', pick: it => statNum(it, 'Magical armor') >= 30, show: it => 'Magical armor ' + statNum(it, 'Magical armor')},
      {id: 'anti_heal', label: 'Anti-heal', test: E => E.healers >= 1, prio: E => 1.5 + E.healers, why: E => E.healWho.join(', ') + ' heal (self-sustain or ally healing in their ability text)', pick: it => /reduce (?:the |their |the target's |the source's )?healing/i.test(fxText(it)), show: it => fxMatch(it, /[^|•]*reduce (?:the |their |the target's |the source's )?healing[^|•]*/i)},
      {id: 'tenacity', label: 'Conditional CC protection · inspect', manual: true, test: E => E.hold >= 2 || E.cc >= 3, prio: E => 1 + 0.5 * E.hold, why: E => E.ccWho.join(', ') + ' bring hard crowd control. Check the exact ability and item trigger: protection is conditional and does not establish that every knock, suppression or other control is answered. Reviewed Tenacity is a rating, not percent reduction. Item-specific immunity and cleanse conditions still need inspection; no automatic CC swap is made.', pick: it => !!it.verified_stat_units?.Tenacity||/cc immun|self cleanse|on being immobilized/i.test(fxText(it)), show: it => (it.verified_stat_units?.Tenacity?'Official Tenacity rating '+it.stats.Tenacity+'. ':'')+fxText(it)},
      {id: 'tank_buster', label: 'Armor shred or % health damage', test: E => E.front >= 2, prio: E => 1 + 0.5 * E.front, why: E => E.frontWho.join(', ') + ' have frontline tools; consider this answer if they are actually buying health and armor',
        pick: (it, me) => (me.penetration||me.off) === 'magical' ? /ignore \d+% of magical armor|reduce their magical armor|bonus magical armor|max(?:imum)? health as|bonus health as (?:(?:physical|magical|true) )?damage/i.test(fxText(it)) : (me.penetration||me.off) === 'physical' ? /ignore \d+% of (?:bonus )?physical armor|reduce their physical armor|shred \d+ physical armor|(?:max(?:imum)?|current) health as (?:(?:physical|magical|true) )?damage|physical armor decreased/i.test(fxText(it)) : /physical armor decreased|reduce their (?:physical|magical) armor|max(?:imum)? health as (?:(?:physical|magical|true) )?damage/i.test(fxText(it)),
        show: it => fxMatch(it, /[^|•]*(?:ignore \d+% of|reduce their|shred \d+|health as|armor decreased)[^|•]*/i)},
      {id: 'anti_shield', label: 'Anti-shield', test: E => E.shielders >= 1, prio: E => 1 + 0.5 * E.shielders, why: E => E.shieldWho.join(', ') + ' shield allies', pick: it => /shielded target/i.test(fxText(it)), show: it => fxMatch(it, /[^|]*shielded target[^|]*/i)},
      {id: 'spell_shield', label: 'Spell shield', test: (E, me) => E.magBurst >= 2 && !me.tanky, prio: () => 1.5, why: E => E.magBurstWho.join(', ') + ' are burst casters and you are not a frontliner', pick: it => /spell shield/i.test(fxText(it)), show: it => fxMatch(it, /[^|•]*spell shield[^|]*/i)},
      {id: 'anti_autos', label: 'Anti basic attack', test: (E, me) => E.autos >= 2 && me.tanky, prio: () => 1.5, why: E => E.autosWho.join(', ') + ' win through basic attacks and you will stand in front of them', pick: it => /reduce the source's attack speed|physical power reduced|reduce their damage dealt/i.test(fxText(it)), show: it => fxMatch(it, /[^|•]*(?:attack speed by|physical power reduced|damage dealt by)[^|•]*/i)},
      {id: 'burst_insurance', label: 'Burst insurance', test: (E, me) => E.burst >= 3 && !me.tanky, prio: () => 1, why: E => E.burstWho.join(', ') + ' can burst you down; a low-health shield buys a second', pick: it => /on going below \d+% health:[^|]*shield|resurrect/i.test(fxText(it)), show: it => fxMatch(it, /[^|]*(?:below \d+% health[^|]*shield|resurrect)[^|•]*/i)}
    ];
    // What the adaptation rules act on: the completed items each item-need rule selects, and the base-kit tags each
    // enemy contributes. A dated review of exactly these classifications, bound to the reviewed build patch, authorizes
    // adapting an active reviewed build without renewing the global tier and strategy review.
    let adaptationSnapshot=null;
    function adaptationClassifications(){
      if(adaptationSnapshot)return structuredClone(adaptationSnapshot);
      const pool=Object.values(bundle.items||{}).filter(it=>it?.name&&it.completed_item&&it.available_current_patch!==false).sort((a,b)=>a.name.localeCompare(b.name));
      const items={},kit={};
      for(const r of ITEM_NEEDS)for(const off of r.id==='tank_buster'?['physical','magical','none']:[null])items[r.id+(off?':'+off:'')]=pool.filter(it=>r.pick(it,{off})).map(it=>it.name);
      for(const slug of Object.keys(heroes).sort()){const p=heroProfile(slug);kit[slug]=p?[p.dmg,...['frontline','cc','healer','shielder','burst','autos'].filter(k=>p[k])]:null;}
      adaptationSnapshot={items,heroes:kit};return structuredClone(adaptationSnapshot);
    }
    function adaptationReview(){
      const r=bundle.guidance?.build_patch_review,a=r?.adaptation_review;
      if(!a)return {ready:false,reason:null};
      const dated=buildPatchReady(r.patch)&&a.patch===r.patch&&Number.isFinite(Date.parse(a.reviewed_at))&&Date.parse(a.reviewed_at)<=Date.now();
      if(!dated)return {ready:false,reason:null};
      return sameValue(a.classifications,adaptationClassifications())?{ready:true,reason:null,reviewed_at:a.reviewed_at}:
        {ready:false,reason:'The starting build is patch-reviewed, but current item-effect or hero-kit classifications differ from the '+a.patch+' adaptation review. Automatic match adaptations are withheld; inspect the reviewed alternatives on the build page.'};
    }
    function itemFit(it, me, measured) {
      const pp = statNum(it, 'Physical power') > 0, mp = statNum(it, 'Magical power') > 0, as = statNum(it, 'Attack speed') + statNum(it, 'Critical chance') > 0, hs = statNum(it, 'Heal and shield power') > 0;
      let score = 0; const why = [];
      const put = (d, text) => { score += d; why.push((d > 0 ? '+' : '') + (Number.isInteger(d) ? d : d.toFixed(1)) + ' ' + text); };
      if (pp) put(me.off === 'physical' ? 2 : me.off === 'mixed' ? 1 : me.off === 'none' ? -1 : -3, 'physical power ' + (me.off === 'physical' || me.off === 'mixed' ? 'fits your build' : 'is wasted on your build'));
      if (mp) put(me.off === 'magical' ? 2 : me.off === 'mixed' ? 1 : me.off === 'none' ? -1 : -3, 'magical power ' + (me.off === 'magical' || me.off === 'mixed' ? 'fits your build' : 'is wasted on your build'));
      if (as) put(me.autos ? 1 : -2, 'attack speed or crit ' + (me.autos ? 'fits a basic-attack build' : 'does little for a non-auto-attacker'));
      if (hs) put(me.restorationStats ? 2 : -2, 'heal and shield power ' + (me.restorationStats ? 'has a restoration or shield action in your kit' : 'has no identified native heal or shield action; inspect item-granted shields separately'));
      if (!pp && !mp && !as && !hs && me.tanky) put(1, 'pure defensive item on a frontliner');
      if(measured&&measured.supports_current_fit!==false)put(Math.min(2,measured.played/100),'one source observation supports role use ('+measured.played+' games; '+measured.label+'). No samples are pooled.');
      return {score, why};
    }
    function measuredItemPool(stats) {
      const pool={};
      (stats?.builds||[]).forEach((b,vi)=>{
        const add=(name,row,slot)=>{
          if(!name||!Number.isSafeInteger(row?.playedGames)||row.playedGames<=0||!Number.isSafeInteger(row.wonGames)||row.wonGames<0||row.wonGames>row.playedGames||!finite(row.winRate)||Math.abs(row.winRate-100*row.wonGames/row.playedGames)>.1)return;
          const ob={name,played:row.playedGames,won:row.wonGames,wr:row.winRate,variant:vi,slot,url:stats.url,fetched_at:stats.fetched_at,source:'Statz',supports_current_fit:false,
            label:slot==='core'?'Exact core sequence in variant '+(vi+1):'Position '+slot+' in variant '+(vi+1)};
          (pool[NK(name)]??={name,observations:[]}).observations.push(ob);
        };
        [4,5,6].forEach(n=>(b['items'+n]||[]).forEach(x=>add(x.display_name||x.name,x,String(n))));
        (b.core_items?.coreItems||[]).forEach(n=>add(n,b.core_items,'core'));
      });
      for(const e of Object.values(pool)){
        e.observations.sort((a,b)=>b.played-a.played||a.variant-b.variant||a.slot.localeCompare(b.slot));
        Object.assign(e,e.observations[0]);e.variants=[...new Set(e.observations.map(x=>x.variant))];e.slots=[...new Set(e.observations.map(x=>x.slot))];
        e.selection='Largest individual source sample; no overlapping counts summed. Core observations describe the whole sequence, not an isolated item effect.';
      }
      return pool;
    }
    function currentItemPool(slug,role,stats){
      if(!verificationCurrent())return {pool:{},issues:['Live patch verification is pending or failed. Saved item observations cannot rank automatic purchases.'],status:'verification required'};
      const rows=bundle?.pred_game_data?.role_data?.[slug]?.[role]?.items;
      if(!rows)return {pool:measuredItemPool(stats),issues:['Pred.gg item-position collection unavailable. Historical Statz observations are inspection-only and add no current-patch fit points.'],status:'unavailable'};
      const pool={},issues=[],c=bundle.scoped_statistics,live=bundle.official?.live?.version;
      let urlHero=null,query={};try{urlHero=decodeURIComponent(rows.url?.match(/^https:\/\/pred\.gg\/heroes\/([^/]+)\/items(?:\?|$)/)?.[1]||'');query=Object.fromEntries((rows.url.split('?')[1]||'').split('&').map(x=>x.split('=').map(decodeURIComponent)));}catch{}
      if(bundle.official?.status!=='verified'||c?.status!=='ok'||(bundle.bracket?.label&&NK(c.bracket_label)!==NK(bundle.bracket.label))||c.patch!==live||rows.status!=='ok'||rows.patch!==live||rows.bracket!==c.bracket_label||rows.mode!=='RANKED'||rows.role!==role||rows.version_id!==(c.versions||[]).join(',')||NK(urlHero)!==NK(slug))
        return {pool,issues:['Pred.gg item evidence excluded: hero, role, patch, bracket, mode or version does not match the verified current cohort.'],status:'scope mismatch'};
      const sameSet=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&[...a].sort().join('|')===[...b].sort().join('|');
      if(query.versions!==rows.version_id||query.gameMode!=='RANKED'||query.role!==role.toUpperCase()||!sameSet(query.ranks?.split(','),c.ranks)||(rows.cohort_filter&&(!sameSet(rows.cohort_filter.versions,c.versions)||!sameSet(rows.cohort_filter.ranks,c.ranks)||!sameSet(rows.cohort_filter.gameModes,['RANKED'])||!sameSet(rows.cohort_filter.roles,[role.toUpperCase()]))))
        return {pool,issues:['Pred.gg item evidence excluded: rank, patch, mode or role filter does not match the current cohort.'],status:'filter mismatch'};
      if(!rows.fetched_at||!Number.isFinite(Date.parse(rows.fetched_at)))return {pool,issues:['Pred.gg item evidence excluded: collection timestamp missing or invalid.'],status:'invalid provenance'};
      for(const key of ['firstTier3','secondTier3','thirdTier3','fourthTier3','fifthTier3','sixthTier3']){
        if(!Array.isArray(rows.tables?.[key])){issues.push('Pred.gg '+key+' table unavailable.');continue;}
        for(const r of rows.tables?.[key]||[]){
          if(!r?.name||!Number.isSafeInteger(r.played)||r.played<0||!Number.isSafeInteger(r.won)||r.won<0||r.won>r.played||(r.played===0?r.wr!==null:!finite(r.wr)||r.wr<0||r.wr>100||Math.abs(r.wr-100*r.won/r.played)>.1)) {issues.push('Pred.gg '+key+' / '+(r?.name||'unnamed item')+': invalid wins, games or rate; excluded.');continue;}
          if(!r.played)continue;
          const ob={...r,slot:key,label:'Pred.gg '+rows.patch+' '+rows.bracket+' Ranked '+role+' '+key,source:'Pred.gg',supports_current_fit:true,url:rows.url,fetched_at:rows.fetched_at};
          (pool[NK(r.name)]??={name:r.name,observations:[]}).observations.push(ob);
        }
      }
      for(const item of Object.values(pool)){
        item.observations.sort((a,b)=>b.played-a.played);Object.assign(item,item.observations[0]);
        item.selection='Largest single position sample. Purchase-position samples overlap; never summed and not an item-strength estimate.';
      }
      return {pool,issues,status:issues.length?'partial':'verified'};
    }
    // Effects are qualified by their activation conditions, not just a matching benefit.
    function needTrigger(rule,it,profile){
      if(!it||!rule.pick(it,profile))return {eligible:false,condition:'Effect does not match this need.'};
      if(rule.manual)return {eligible:false,condition:'Inspect the exact control and protection trigger.'};
      if(rule.id!=='anti_heal')return {eligible:true,condition:rule.show(it)};
      const effects=(it.effects||[]).filter(e=>/reduce (?:the |their |the target's |the source's )?healing/i.test(e.text||''));
      const physical=!!heroes[profile.slug]?.capability_evidence?.physical?.length,magical=!!heroes[profile.slug]?.capability_evidence?.magical?.length;
      const checks=effects.map(e=>{const condition=e.condition||'',c=condition.toLowerCase();let eligible=false,reason='Unrecognized anti-heal trigger; inspect before relying on it.';
        if(/on being hit|on taking/.test(c))reason='Reactive only: the healing target must damage you in the specified way. This is not a reliable answer to a healer behind their team.';
        else if(/on dealing magical damage/.test(c)){eligible=magical;reason='Apply by dealing magical damage to the target whose healing must be reduced.';}
        else if(/on dealing physical damage/.test(c)){eligible=physical;reason='Apply by dealing physical damage to the target whose healing must be reduced.';}
        else if(/on successful basic attacks/.test(c)){eligible=profile.autos||profile.style==='burst_carry';reason='Requires successful basic attacks; a firing-window carry can apply it even when attack speed is inefficient.';}
        else if(/while near enemy heroes/.test(c)){eligible=profile.tanky||profile.frontline;reason='Stay close to the target; range and uptime remain conditional.';}
        else if(/on dealing damage/.test(c)){eligible=true;reason='Apply damage to the target whose healing must be reduced.';}
        return {eligible,condition:condition+' '+reason};});
      return checks.find(c=>c.eligible)||checks[0]||{eligible:false,condition:'Anti-heal activation condition is unavailable; inspect only.'};
    }
    function automaticRole(slug,role){
      const r=(bundle.guidance?.builds||[]).find(x=>x.slug===slug&&x.role===role);
      return r?.auto_recommend!==false&&!r?.experimental_role;
    }
    // Compare mechanics, not fetch dates or presentation key order. A review is
    // conditional on its recorded evidence, even within an unchanged patch label.
    function sameValue(a,b){
      if(a===b)return true;
      if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
      const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.hasOwn(b,k)&&sameValue(a[k],b[k]));
    }
    // Build reviews can advance independently of tiers, pair explanations and compositions.
    // A targeted pass cannot mark the entire strategy packet as current.
    function buildPatchReady(patch){
      const r=bundle.guidance?.build_patch_review,articles=bundle.official?.articles||[];
      return verificationCurrent()&&r?.patch===patch&&patch===bundle.official?.live?.version&&
        Number.isFinite(Date.parse(r.reviewed_at))&&Date.parse(r.reviewed_at)<=Date.now()&&
        Object.keys(r.article_fingerprints||{}).length>0&&
        Object.entries(r.article_fingerprints).every(([v,h])=>articles.some(a=>a.status==='live'&&a.version===v&&a.fingerprint===h))&&
        articles.filter(a=>a.status!=='announced').every(a=>r.article_fingerprints[a.version]===a.fingerprint);
    }
    function buildLoadoutDefinition(name){
      const r=bundle.guidance?.build_patch_review;
      const entry=Object.entries(r?.loadout_definitions||{}).find(([n])=>NK(n)===NK(name));
      return entry?{name:entry[0],...entry[1],active:buildPatchReady(r.patch)}:null;
    }
    // Items & loadouts list. The Pred.gg catalogue is listed when this publication collected it. When it is empty or
    // missing (Pred.gg unavailable), the bundle's own definitions are listed instead, each tagged with the source that
    // supplied it; nothing is relabelled as Pred.gg and no missing value is filled in. pred reports why Pred.gg is absent.
    function libraryCatalog(kind){
      if(kind!=='items'&&kind!=='perks')throw Error('Unknown catalogue: '+kind);
      const p=bundle?.pred_game_data,s=bundle?.sources||{},byName=(a,b)=>a.name.localeCompare(b.name);
      const pred={collected:!!p,status:p?.status||s.pred_game_data?.status||null,patch:p?.cohort?.patch||null,
        error:(p?.errors||[]).find(e=>e?.detail)?.detail||null,fetched_at:s.pred_game_data?.fetched_at||null};
      const price=v=>finite(v)?v:null;
      const predRows=Object.entries(p?.[kind]||{}).filter(([,r])=>r?.name).map(([key,r])=>({key,name:r.name,rarity:r.rarity||null,price:price(r.price),hero:r.hero||null,eternal:r.eternal||null,slot:r.slot||null,origin:'pred'}));
      if(predRows.length)return {kind,source:'pred',rows:predRows.sort(byName),pred,origins:{pred:predRows.length}};
      const origin=it=>it.reviewed_patch?'official':/^Pred\.gg/.test(it.source||'')?'pred':/omeda\.city/.test(it.source||'')?'omeda':'statz';
      const rows=Object.entries(bundle?.[kind]||{}).map(([key,it])=>({key,name:it?.display_name||it?.name||'',rarity:it?.item_meta?.rarity||null,price:price(it?.total_price),
        hero:it?.hero||null,eternal:it?.eternal||null,slot:it?.slot||null,origin:origin(it||{})})).filter(r=>r.name).sort(byName);
      const origins={};for(const r of rows)origins[r.origin]=(origins[r.origin]||0)+1;
      return {kind,source:rows.length?'bundle':null,rows,pred,origins,statz:{patch:bundle?.patch||null,fetched_at:s.statz_hero_pages?.fetched_at||null},omeda:{fetched_at:s.omeda_items?.fetched_at||null}};
    }
    function reconciledBuildField(kind,subject,key,expected,actual){
      const review=bundle.guidance?.build_patch_review?.source_reconciliation;
      if(!review||!buildPatchReady(review.patch)||!Number.isFinite(Date.parse(review.reviewed_at))||Date.parse(review.reviewed_at)>Date.now()||!sameValue(review.article_fingerprints,bundle.guidance.build_patch_review.article_fingerprints))return null;
      return (review.entries||[]).find(r=>r.kind===kind&&r.subject===subject&&r.key===key&&r.reason&&/^https:\/\//.test(r.source||'')&&Number.isFinite(Date.parse(r.source_fetched_at))&&Date.parse(r.source_fetched_at)<=Date.parse(review.reviewed_at)&&sameValue(r.expected,expected)&&sameValue(r.accepted,actual))||null;
    }
    function buildReview(slug,role){
      const r=(bundle.guidance?.builds||[]).find(x=>x.slug===slug&&x.role===role);if(!r)return null;
      const independent=!!r.patch_review;
      const current=independent?buildPatchReady(r.patch)&&Number.isFinite(Date.parse(r.reviewed_at))&&Date.parse(r.reviewed_at)<=Date.now()&&r.patch_review.reviewed_at===r.reviewed_at&&['changed','checked and retained','unresolved'].includes(r.patch_review.result)&&!!r.source_preconditions:bundle.guidance?.patch===r.patch&&bundle.official?.live?.version===r.patch&&reviewReady();
      const missing=[...r.core,...r.finish].filter(n=>!item(n)?.completed_item);
      const catalog=independent?bundle.guidance?.build_patch_review?.loadout_catalog:bundle.loadout_catalog;
      const tree=catalog?.eternals?.[r.eternal];
      const invalid=(independent||!!catalog?.eternals)&&(!tree||r.blessings.some((n,i)=>!tree['BLESSING_MINOR_'+(i+1)]?.includes(n)));
      const changed=[],reconciled=[],pre=r.source_preconditions;
      const matches=(kind,subject,key,expected,actual)=>{
        if(sameValue(expected,actual))return true;
        const entry=independent&&reconciledBuildField(kind,subject,key,expected,actual);
        if(entry)reconciled.push(entry);
        return !!entry;
      };
      if(pre){
        for(const [key,text] of Object.entries(pre.abilities||{}))if(!matches('abilities',slug,key,text,heroes[slug]?.abilities?.find(a=>a.key===key)?.text))changed.push('Ability '+key);
        for(const [name,expected] of Object.entries(pre.items||{})){
          const actual=item(name);
          if(!actual||Object.entries(expected).some(([key,value])=>!matches('items',name,key,value,actual[key])))changed.push('Item '+name);
        }
        for(const [name,text] of Object.entries(pre.perks||{})){
          const source=Object.values(bundle.perks||{}).find(p=>NK(p.display_name||p.name)===NK(name));
          // Mechanics do not vary by rank. A missing rank-local row can use the
          // separately evidenced definition, but a conflicting row cannot.
          const definition=independent&&!source?buildLoadoutDefinition(name):null;
          const actual=source?.description||(definition?.active?definition.description:null);
          if(!perkTextMatches(name,actual,text)&&!matches('perks',name,'description',text,actual))changed.push('Loadout '+name);
        }
      }
      const unresolved=independent&&r.patch_review?.result==='unresolved';
      return {...r,active:current&&!unresolved&&!missing.length&&!invalid&&!changed.length,status:!current?'needs review':unresolved?'review unresolved: '+r.patch_review.limitation:missing.length?'item metadata unavailable':invalid?'incompatible blessing tree':changed.length?'supporting mechanics changed; needs review':'reviewed',missing,changed,invalid,source_reconciliation:reconciled.length?{reviewed_at:bundle.guidance.build_patch_review.source_reconciliation.reviewed_at,entries:reconciled}:null};
    }
    function perkTextMatches(name,actual,expected){
      if(actual===expected)return true;
      return (bundle.guidance?.perk_wording_reviews||[]).some(r=>NK(r.name)===NK(name)&&reviewReady(r.patch)&&r.descriptions.includes(actual)&&r.descriptions.includes(expected));
    }
    function plannedBuild(slug,role,{index=null,forceObserved=false}={}){
      const review=buildReview(slug,role),stats=heroes[slug]?.roles?.[role];
      if(review?.active&&!forceObserved)return {...review,items:[...review.core,...review.finish],kind:'reviewed',reason:review.why};
      const variants=stats?.status==='ok'&&(forceObserved||statzBuildAvailable(slug,role))?(stats.builds||[]):[];
      const selected=index!=null?variants[index]:variants.slice().sort((a,b)=>b.playedGames-a.playedGames)[0];
      const sequence=[...(selected?.core_items?.coreItems||[])];
      for(const n of [4,5,6])for(const x of top(selected?.['items'+n],3))if(!sequence.some(a=>NK(a)===NK(x.display_name||x.name)))sequence.push(x.display_name||x.name);
      const names=sequence.filter(n=>item(n)?.completed_item).slice(0,6),crest=top(selected?.best_base_crests,1)[0];
      return {slug,role,items:names,core:names.slice(0,3),finish:names.slice(3),kind:'provisional',manual:forceObserved,title:forceObserved?'Selected source playstyle':names.length?'Provisional starting build':'Build recommendation unavailable',
        augment:selected?.perk,eternal:selected?.eternal,crest:crest?top(crest.upgrades,1)[0]?.display_name||crest.display_name:null,
        blessings:[top(selected?.common_perks_1,1)[0]?.name,top(selected?.common_perks_2,1)[0]?.name],skill_priority:selected?.skillUpgradePriority||[],
        reason:!names.length?(review?.patch_review?.result==='unresolved'?'Current build review is unresolved: '+review.patch_review.limitation+' Previous guidance is available below.':'Current-patch build evidence is not available for this role. The previous reviewed build is available below with its original date.'):forceObserved?'You selected a source playstyle for this game. Its item choices form a provisional sequence; the reviewed plan remains available.':'No active authored plan for this hero/role. Start from the most-played variant and inspect its mechanics; win rate does not establish the best build.',
        caution:review&&!review.active?'Previous advice '+review.status+'.':'The full six combines source choices; no full-loadout win rate is inferred.',review};
    }
    function bestMatchup(ally, enemy) {
      const rows = matchup(ally, enemy); if (!rows.length) return null;
      return rows.slice().sort((a, b) => Number(!!a.retained)-Number(!!b.retained) || (a.source==='Pred.gg'?0:1)-(b.source==='Pred.gg'?0:1) || (a.inverted ? 1 : 0) - (b.inverted ? 1 : 0) || b.played - a.played)[0];
    }
    function buildCandidate(me, allies = [], enemies = [], {variant = null, min = 100, owned = [], priority = '', state = 'even', primaryThreat = null, now = Date.now()} = {}) {
      if (!heroes[me.slug]) throw Error('Choose your hero first.');
      if(!Array.isArray(owned)||owned.length>6||owned.some(n=>typeof n!=='string'||!item(n)?.completed_item)||new Set(owned.map(NK)).size!==owned.length)throw Error('Owned items must be up to six different completed items; components and crests do not occupy these slots.');
      owned=owned.map(n=>item(n).name);
      if(priority&&!ITEM_NEEDS.some(r=>r.id===priority&&!r.manual))throw Error('Choose an available item priority. CC protection requires inspection.');
      const stats = heroes[me.slug].roles?.[me.role], ok = stats?.status === 'ok' && !!stats.builds?.length;
      const opponent = enemies.find(e => e.role === me.role) || null;
      const E = enemyProfile(enemies.map(e => e.slug));
      const threatProfile=primaryThreat?enemyProfile([primaryThreat]):null;
      const choice=ok?variantChoice(me.slug,me.role,{min,opponent:opponent?.slug||null}):null;
      const review=buildReview(me.slug,me.role);
      const preferred=review?.active?stats?.builds?.findIndex(b=>NK(b.perk)===NK(review.augment)&&NK(b.eternal)===NK(review.eternal)):-1;
      const popularIndex=ok?stats.builds.indexOf(stats.builds.slice().sort((a,b)=>b.playedGames-a.playedGames)[0]):null;
      const index=ok?(variant!=null&&stats.builds[variant]?variant:preferred>=0?preferred:popularIndex):null;
      const summary=index!=null?buildSummary(me.slug,me.role):null;
      if(summary){const build=stats.builds[index],core=build.core_items||{},crest=top(build.best_base_crests,1)[0];
        Object.assign(summary,{index,build,overridden:variant!=null,core:{items:core.coreItems||[],wr:core.winRate??null,played:core.playedGames??null},
          reason:variant!=null?'Source variant selected for inspection.':'Source variant corresponding to the reviewed playstyle, or the most-played available variant.',
          crest:crest?{name:crest.display_name||crest.name,mid:crest.midCrest,upgrades:top(crest.upgrades,2).map(x=>({name:x.display_name||x.name,wr:x.winRate,played:x.playedGames}))}:null,
          blessings:[top(build.common_perks_1,1)[0],top(build.common_perks_2,1)[0]].map(x=>x?{name:x.name,wr:x.winRate,played:x.playedGames}:null),
          alternatives:Object.fromEntries([4,5,6].map(n=>[n,top(build['items'+n],3).map(x=>({name:x.display_name||x.name,wr:x.winRate,played:x.playedGames}))])),
          skill:{priority:build.skillUpgradePriority||[],order:build.popular_skill_order?.skillOrder||[],wr:build.popular_skill_order?.winRate??null,played:build.popular_skill_order?.playedGames??null}});
      }
      const plan=plannedBuild(me.slug,me.role,{index,forceObserved:variant!=null}),core=plan.core;
      const profile=myProfile(me.slug,me.role,core,plan.kind==='reviewed');
      if(plan.kind==='reviewed'){profile.off=plan.damage;profile.penetration=plan.penetration_focus||(['physical','magical'].includes(heroProfile(me.slug)?.dmg)?heroProfile(me.slug).dmg:plan.damage);profile.tanky=['tank','bruiser'].includes(plan.style);profile.autos=['attack','bruiser'].includes(plan.style);profile.style=plan.style;profile.source='reviewed '+plan.style+' playstyle and current item mechanics';}
      const itemEvidence=currentItemPool(me.slug,me.role,stats),pool=itemEvidence.pool;
      for(const evidence of Object.values(pool)){
        if(evidence.played<Math.max(100,min)||now-Date.parse(evidence.fetched_at)>30*3600000||Date.parse(evidence.fetched_at)>now+300000){evidence.supports_current_fit=false;}
      }
      const coreKeys=new Set(core.map(NK)),ownedKeys=new Set(owned.map(NK));
      const catalogue=Object.values(bundle?.items||{}).filter(it=>it.completed_item===true&&it.available_current_patch!==false&&it.name&&!bundle.corrections?.some(c=>String(c.status).startsWith('conflict')&&c.path?.[0]==='items'&&bundle.items[c.path[1]]===it));
      const threatMatches=r=>!!threatProfile&&(r.test(threatProfile,profile)||r.id==='physical_armor'&&threatProfile.phys>0||r.id==='magical_armor'&&threatProfile.mag>0);
      const needs = ITEM_NEEDS.filter(r => (state!=='ahead'&&(r.test(E, profile)||threatMatches(r)))||r.id===priority).map(r => {
        const coveredBy = core.filter(n => needTrigger(r,item(n),profile).eligible);
        const base = r.prio(E, profile), prio = Math.max(0.5, base - 1.5 * coveredBy.length)+(threatMatches(r)?3:0);
        const candidates = catalogue.filter(it => (!coreKeys.has(NK(it.name))||priority||owned.length) && r.pick(it, profile)).map(it => { const m = pool[NK(it.name)] || null, f = itemFit(it, profile, m); if(profile.style==='burst_carry'&&(statNum(it,'Attack speed')>0)) {f.score-=2;f.why.push('-2 attack speed is not this reviewed firing-window plan');} return {name: it.name, price: it.total_price, stats: it.stats || {}, measured: m, score: f.score, why: f.why, trigger:needTrigger(r,it,profile),evidence: r.manual?r.show(it):(fxText(it) || r.show(it))}; })
          .sort((a, b) => Number(b.trigger.eligible)-Number(a.trigger.eligible)||b.score - a.score || (b.measured?.supports_current_fit?b.measured.played:0) - (a.measured?.supports_current_fit?a.measured.played:0) || (a.price || 0) - (b.price || 0)).slice(0, 6);
        return {id: r.id, label: r.label, manual: !!r.manual, priority:r.id===priority,prio, basePrio: base, coveredBy, why: r.id===priority?'You selected this priority from the actual game. Kit counts do not establish enemy purchases.':r.why(E, profile), candidates};
      }).sort((a, b) => Number(b.priority)-Number(a.priority)||b.prio - a.prio);
      const slots=[...owned,...plan.items.filter(n=>!ownedKeys.has(NK(n)))].slice(0,6).map(name=>({name,kind:ownedKeys.has(NK(name))?'owned':coreKeys.has(NK(name))?'core':'baseline',label:ownedKeys.has(NK(name))?'Owned · kept':plan.kind==='reviewed'?(coreKeys.has(NK(name))?'Reviewed core':'Reviewed flexible slot'):'Calculated starting sequence',measured:pool[NK(name)]||null}));
      const swaps=[],unmet=[],used=new Set(slots.map(s=>NK(s.name))),reserved=new Set();
      const maxSwaps=2;
      for(const n of needs){
        const rule=ITEM_NEEDS.find(r=>r.id===n.id);
        if(n.manual){n.answeredBy=[];unmet.push(n.id);continue;}
        n.answeredBy=slots.filter(s=>needTrigger(rule,item(s.name),profile).eligible).map(s=>s.name);
        if(n.answeredBy.length){if(n.answeredBy.length===1)reserved.add(NK(n.answeredBy[0]));continue;}
        if(swaps.length>=maxSwaps){unmet.push(n.id);continue;}
        const candidate=n.candidates.find(c=>c.trigger.eligible&&!used.has(NK(c.name))&&c.score>=0);
        const position=slots.map((_,i)=>i).reverse().find(i=>slots[i].kind!=='owned'&&!reserved.has(NK(slots[i].name))&&slots[i].kind==='baseline');
        if(!candidate||position==null){unmet.push(n.id);continue;}
        const previous=slots[position].name;used.delete(NK(previous));used.add(NK(candidate.name));reserved.add(NK(candidate.name));
        slots[position]={name:candidate.name,kind:'need',label:n.label,need:n.id,candidate,measured:candidate.measured};
        swaps.push({from:previous,to:candidate.name,position:position+1,reason:n.why});
      }
      const timing=[];
      const urgent=needs.find(n=>n.priority)|| (state==='behind'?needs.find(n=>['physical_armor','magical_armor','spell_shield','anti_autos','burst_insurance'].includes(n.id)):null);
      if(urgent){
        const rule=ITEM_NEEDS.find(r=>r.id===urgent.id),answer=slots.find(s=>needTrigger(rule,item(s.name),profile).eligible);
        if(answer?.kind==='owned')timing.push(answer.name+' is already owned. Check its activation condition.');
        else if(answer&&answer.kind!=='core'){
          const from=slots.indexOf(answer),to=slots.findIndex(s=>s.kind!=='owned'&&s.kind!=='core');
          // Exchange flexible positions only: never move a core or owned item.
          const affected=new Set([...swaps.map(s=>s.position-1),from,to]);
          if(to>=0&&from>to&&affected.size<=2){[slots[to],slots[from]]=[slots[from],slots[to]];answer.timing=true;timing.push('Bring '+answer.name+' to flexible position '+(to+1)+'. Reviewed core order is preserved.');}
        }else if(!answer)timing.push('No compatible flexible purchase answers this need. Inspect the unresolved need; no core change or sale is suggested.');
      }
      // Recompute coverage after every replacement; a discarded item is never still an answer.
      unmet.length=0;
      for(const n of needs){const rule=ITEM_NEEDS.find(r=>r.id===n.id);n.answeredBy=slots.filter(s=>needTrigger(rule,item(s.name),profile).eligible).map(s=>s.name);n.conditionalBy=slots.filter(s=>rule.pick(item(s.name),profile)&&!needTrigger(rule,item(s.name),profile).eligible).map(s=>({name:s.name,...needTrigger(rule,item(s.name),profile)}));if(!n.answeredBy.length)unmet.push(n.id);}
      for(const swap of swaps)swap.position=slots.findIndex(s=>s.name===swap.to)+1;
      // A nearby ally's damage changes the value of an aura; it is not a solo damage estimate.
      const alliesWithMagic=allies.filter(a=>a.slug!==me.slug&&['magical','mixed'].includes(heroProfile(a.slug)?.dmg));
      const teamAdvice=[];
      if(profile.tanky&&alliesWithMagic.length)teamAdvice.push('Nearby magic follow-up from '+alliesWithMagic.map(a=>heroes[a.slug].display_name).join(', ')+': Flux Matrix is a team option if you can keep enemies inside its aura.');
      if(profile.healer&&allies.some(a=>a.slug!==me.slug&&heroProfile(a.slug)?.autos))teamAdvice.push('A sustained attacker is available: prioritize shielding/healing uptime and consider Marshal before personal damage.');
      if(!profile.tanky&&allies.length>=3&&!coverage(allies).checks.find(x=>x.label==='Peel')?.present)teamAdvice.push('No allied peel is identified. Preserve an escape or defensive flex slot instead of assuming uninterrupted attacks.');
      const threats = enemies.map(e => ({enemy: e, profile: heroProfile(e.slug), matchup: bestMatchup(me, e), lane: e.role === me.role})).sort((a, b) => (a.matchup?.wr ?? Infinity) - (b.matchup?.wr ?? Infinity));
      return {me, ok, statsError: ok ? null : (stats?.error || 'No observed build for this hero and role.'), opponent, opponentMatchup: opponent ? bestMatchup(me, opponent) : null, enemyProfile: E, choice, summary, plan, profile, needs, slots, unmet, threats, swaps, teamAdvice,itemEvidence,owned,priority,timing,nextPurchase:slots[owned.length]||null,
        note: 'Reviewed plans are editorial judgment informed by official mechanics and multiple sources. Adaptation is a stated kit/item rule, not a win prediction. Each rate is one labelled Pred.gg or Statz observation; no samples are pooled.'};
    }
    // BuildContextV2 -> BuildAdvice. All automatic advice requires an active review.
    function adaptBuild(me,allies=[],enemies=[],context={}){
      if(!heroes[me?.slug]||!roles(me.slug).includes(me.role))throw Error('Choose an available hero and role.');
      const state=context.state??'even';if(!['ahead','even','behind'].includes(state))throw Error('Choose ahead, even or behind.');
      const seen=new Set(),enemyRoles=new Set();
      for(const e of enemies){if(!heroes[e.slug]||!ROLES.includes(e.role)||seen.has(e.slug)||enemyRoles.has(e.role)||e.slug===me.slug)throw Error('Enemy picks need unique heroes and roles.');seen.add(e.slug);enemyRoles.add(e.role);}
      let threat=context.primaryThreat;
      if(threat&&!enemies.some(e=>e.slug===threat))throw Error('The primary threat must be one of the selected enemies.');
      if(threat===undefined){threat=enemies.find(e=>e.role===me.role)?.slug||enemies.map(e=>({e,m:currentMatchup(me,e,100)})).filter(x=>x.m).sort((a,b)=>a.m.wr-b.m.wr)[0]?.e.slug||null;}
      const review=buildReview(me.slug,me.role);
      const variant=context.variant??null;
      if(variant!==null&&(!Number.isInteger(variant)||variant<0||!heroes[me.slug].roles?.[me.role]?.builds?.[variant]))throw Error('The selected source playstyle is unavailable. Choose it again.');
      const L=buildCandidate(me,allies,enemies,{...context,state,primaryThreat:threat,variant});
      // The caller resolves a durable reference in the current publication before passing an index.
      // A different augment/Eternal lacks the reviewed kit preconditions used by the adaptation rules.
      const loadoutMismatch=variant!==null&&(NK(L.plan.augment)!==NK(review?.augment)||NK(L.plan.eternal)!==NK(review?.eternal));
      const baseline=variant!==null?L.plan.items:review?[...review.core,...review.finish]:[];
      const adaptation=review?.patch_review&&!reviewReady()?adaptationReview():{ready:true};
      const adaptationPending=!adaptation.ready;
      const unavailable=!review?.active||adaptationPending||loadoutMismatch||baseline.length!==6||new Set(baseline.map(NK)).size!==6||baseline.some(n=>item(n)?.available_current_patch===false);
      const expectedCore=baseline.filter(n=>(variant!==null?L.plan.core:review?.core)?.includes(n)&&!L.owned.some(o=>NK(o)===NK(n)));
      const lostCore=expectedCore.some(n=>!L.slots.some(s=>NK(s.name)===NK(n)));
      const available=!unavailable&&!lostCore;
      const reason=!review?'No reviewed build exists for this hero and role.':!review.active?'The reviewed build is '+review.status+'.':adaptationPending?(adaptation.reason||'The starting build is patch-reviewed. Automatic match adaptations still need a current-patch kit and item review; inspect the reviewed alternatives on the build page.'):loadoutMismatch?'Your selected augment or Eternal differs from the reviewed setup. The original selection is retained; automatic adaptation needs a mechanics review for this loadout.':lostCore?'Your entered inventory leaves insufficient slots for the reviewed core. Inspect your purchases; no sale is suggested.':unavailable?'The reviewed six-item path contains unavailable or conflicting items.':null;
      const threatData=threat?heroProfile(threat):null;
      const explanations=[variant!==null?'Calculated adaptation of your selected source playstyle; its core is preserved. No win rate is claimed for this assembled path.':state==='ahead'?'Ahead: keep offensive timing unless your selected urgent need requires a flexible answer.':state==='behind'?'Behind: prioritize a compatible survival or utility answer within the flexible slots; preserve the core.':'Even: retain the reviewed core and answer compatible enemy-kit needs.'];
      if(threatData)explanations.push('Primary threat: '+threatData.name+'. '+(threatData.evidence[0]?threatData.evidence[0].ability+': '+(threatData.evidence[0].reason||threatData.evidence[0].tag):'No supported kit mechanism is available; no damage type is assumed.'));
      for(const s of L.slots.filter(s=>s.kind==='need'))explanations.push(s.name+': '+s.candidate.trigger.condition+' '+s.candidate.evidence);
      const changes=L.slots.filter(s=>s.kind!=='owned'&&(!baseline.includes(s.name)||baseline.indexOf(s.name)!==L.slots.indexOf(s))).map(s=>({item:s.name,position:L.slots.indexOf(s)+1,reason:s.candidate?.evidence||L.timing.join(' ')||'Keep owned items and preserve the remaining core.'}));
      const contingency=L.needs.flatMap(n=>n.candidates.filter(c=>c.trigger.eligible&&c.score>=0&&!L.slots.some(s=>NK(s.name)===NK(c.name))).map(c=>({name:c.name,need:n.label,reason:c.evidence})))[0]||null;
      return {...L,available,unavailableReason:reason,state,primaryThreat:threat,baseline,changes:available?changes:[],explanations,contingency:available?contingency:null,
        slots:available?L.slots:[],nextPurchase:available?L.nextPurchase:null,
        evidence:{reviewed:{patch:review?.patch,date:review?.reviewed_at},bracket:bundle.bracket?.label,observed:L.itemEvidence,calculated:explanations,entered:{state,primaryThreat:threat,priority:context.priority||'',owned:L.owned}},
        note:(variant!==null?'Calculated adaptation of a selected source playstyle with matching reviewed kit preconditions. ':'Adapted from a dated reviewed plan. ')+'Selected-bracket evidence can only support compatible flexible choices. No samples are pooled and no adapted-build win rate is estimated.'};
    }
    function liveBuild(me,allies=[],enemies=[],context={}){return adaptBuild(me,allies,enemies,context);}
    // Build-page alternates by enemy team type. Each type forces one existing item need on the
    // reviewed plan with no enemies entered, so the same item rules and adaptation review apply;
    // `fits` keeps a need to the builds its own rule targets (burst answers for squishy builds,
    // anti-basic-attack items for frontliners). Calculated item rules, never a win prediction.
    const TEAM_TYPES=[
      {id:'tanky',label:'Tanky or high-health team',need:'tank_buster'},
      {id:'healing',label:'Healing or lifesteal team',need:'anti_heal'},
      {id:'magical',label:'Magic-heavy damage',need:'magical_armor'},
      {id:'physical',label:'Physical-heavy damage',need:'physical_armor'},
      {id:'burst',label:'Burst damage',need:'burst_insurance',fits:p=>!p.tanky},
      {id:'magic_burst',label:'Magic burst casters',need:'spell_shield',fits:p=>!p.tanky},
      {id:'shields',label:'Shield-heavy team',need:'anti_shield'},
      {id:'basic_attacks',label:'Basic-attack carries',need:'anti_autos',fits:p=>p.tanky}];
    function teamAlternates(me,context={}){
      const rows=[];
      for(const t of TEAM_TYPES){
        const base={id:t.id,label:t.label,need:t.need};let r;
        try{r=adaptBuild(me,[],[],{variant:context.variant??null,priority:t.need,state:'even',primaryThreat:null});}
        catch(e){return {available:false,reason:e.message,rows:[]};}
        if(!r.available)return {available:false,reason:r.unavailableReason,rows:[]};
        if(t.fits&&!t.fits(r.profile))continue;
        const need=r.needs.find(n=>n.id===t.need);
        if(r.swaps.length){rows.push({...base,status:'swap',swaps:r.swaps.map(s=>{const slot=r.slots.find(x=>NK(x.name)===NK(s.to));const it=item(s.to),stat=t.need==='physical_armor'?'Physical armor':t.need==='magical_armor'?'Magical armor':null;const clause=it&&ITEM_NEEDS.find(q=>q.id===t.need)?.show?.(it);return {from:s.from,to:s.to,position:s.position,evidence:stat&&it?'+'+statNum(it,stat)+' '+stat.toLowerCase()+'.':clause||slot?.candidate?.evidence||''};})});continue;}
        // The engine counts only core items as coverage; a qualifying finish item is kept and may be brought earlier.
        const inBuild=[...new Set([...(need?.coveredBy||[]),...(need?.candidates||[]).filter(c=>c.trigger?.eligible!==false&&r.baseline.some(n=>NK(n)===NK(c.name))).map(c=>c.name)])];
        if(inBuild.length){const moved=inBuild.map(n=>({name:n,from:r.baseline.findIndex(x=>NK(x)===NK(n))+1,to:r.slots.findIndex(x=>NK(x.name)===NK(n))+1})).find(m=>m.to>0&&m.to<m.from);
          rows.push({...base,status:'covered',coveredBy:inBuild,earlier:moved?{item:moved.name,position:moved.to}:null});continue;}
        rows.push({...base,status:'none'});
      }
      return {available:true,rows,note:'Calculated from item effects on this build\'s reviewed core: the core stays and at most one flexible item changes. Not a win prediction.'};
    }
    // ==== end BUILDS ====
    return {teamAlternates,heroes,libraryCatalog,patchContext,freshnessAreas,heroStrategy,counterIdeas,buildAdaptations,reviewedComposition,guidedCompositions,pair,fit,sequenceReview,plannedKit,roles,performancePolicy,displayPerformancePolicy,displayPerformance,sourceCurrency,evidenceState,statzGap,strategyReviewDue,reviewPacket,performance,metaReview,metaReviewSummary,coverage,damageAssessment,matchup,currentMatchup,assess,partners,recommend,generate,substitute,fightPlan,validPicks,compare,variantChoice,buildSummary,buildLoadoutDefinition,buildReview,plannedBuild,heroProfile,enemyProfile,adaptBuild,liveBuild,bestMatchup,currentItemPool,adaptationClassifications,adaptationReview,itemNeeds:ITEM_NEEDS.map(r=>({id:r.id,label:r.label,manual:!!r.manual}))};
  }
  function validatePlan(packet){
    if(!packet||typeof packet!=='object'||Array.isArray(packet)||Object.keys(packet).sort().join()!=='allies,bans,enemies,patch,size,v'||packet.v!==1||![2,3,5].includes(packet.size)||!(packet.patch===null||(typeof packet.patch==='string'&&packet.patch.length<=30&&/^\d+\.\d+(?:\.\d+)?$/.test(packet.patch))))throw Error('Unsupported shared plan');
    const used=new Set();
    for(const [field,max] of [['allies',packet.size],['enemies',5]]){
      if(!Array.isArray(packet[field])||packet[field].length>max)throw Error('Invalid shared '+field);
      const roles=new Set();for(const p of packet[field]){
        if(!p||typeof p!=='object'||Object.keys(p).sort().join()!=='role,slug'||typeof p.slug!=='string'||!/^[-a-z0-9]{1,40}$/.test(p.slug)||!ROLES.includes(p.role)||roles.has(p.role)||used.has(p.slug))throw Error('Shared picks need unique heroes and roles');
        used.add(p.slug);roles.add(p.role);
      }
    }
    if(!Array.isArray(packet.bans)||packet.bans.length>10)throw Error('Invalid shared bans');
    for(const slug of packet.bans){if(typeof slug!=='string'||!/^[-a-z0-9]{1,40}$/.test(slug)||used.has(slug))throw Error('Shared bans conflict with picks');used.add(slug);}
    return JSON.parse(JSON.stringify(packet));
  }
  function encodePlan(state,patch=null){
    const count=state.locks?.length||0,size=count>3?5:count>2?Math.max(3,state.size||3):state.size||3;
    const packet=validatePlan({v:1,size,patch,allies:(state.locks||[]).map(p=>({slug:p.slug,role:p.role})),enemies:(state.enemies||[]).map(p=>({slug:p.slug,role:p.role})),bans:[...(state.bans||[])]});
    return '#plan='+btoa(JSON.stringify(packet)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
  }
  function decodePlan(hash){
    if(typeof hash!=='string'||hash.length>4000||!/^#plan=[A-Za-z0-9_-]+$/.test(hash))throw Error('Invalid shared plan link');
    try{return validatePlan(JSON.parse(atob(hash.slice(6).replaceAll('-','+').replaceAll('_','/'))));}catch{throw Error('The shared plan is invalid or uses an unsupported format');}
  }
  return {create,finite,mean,ROLES,validatePlan,encodePlan,decodePlan};
});
