/* ================= Integrity & Novelty ================= */
const COMPS=[['orig','Originality'],['nov','Novelty'],['cite','Citation accuracy'],['contrib','Research contribution'],['cons','Results consistency']];
function compBars(sc){return `<div class="comp">${COMPS.map(([k,l])=>`<div class="r"><span>${l}</span><span class="trk"><i style="width:${sc[k]}%;background:${scoreColor(sc[k])}"></i></span><span class="v">${sc[k]}</span></div>`).join('')}</div>`;}
function findingHTML(f){
  return `<article class="card finding"><header>${sevPill(f.sev)}<span class="cat">${f.cat}</span></header><h4>${esc(f.title)}</h4><p>${esc(f.detail)}</p>${f.quote?`<blockquote>${esc(f.quote)}</blockquote>`:''}
  <div class="acts">${f.fix?`<button class="btn sm primary" data-act="fix" data-id="${esc(f.id)}">${icon('check',14)} ${esc(f.fix.label)}</button>`:''}${f.ack?`<button class="btn sm" data-act="ack" data-id="${esc(f.id)}">${esc(f.ack)}</button>`:''}${f.go?`<button class="btn sm" data-go="${f.go}">Open Experiment Engine</button>`:''}${!f.fix&&!f.ack&&!f.go?'<span class="faint" style="font-size:13px">Needs your judgement. Edit the draft, then revalidate.</span>':''}</div></article>`;
}
function integPanel(){
  const a=live(),st=S.integ.stage,snap=S.integ.snap,base=S.integ.baseline,stale=snap&&snap.hash!==curHash();
  const auto=a.findings.filter(f=>f.fix).length;
  let h=`<div class="pipe">
   <button data-act="detect" class="${st==='detected'?'on':''}"><span class="k">Step 1</span><b>Detect</b><small>${st==='idle'?'Analyse the draft':'Run again as a new baseline'}</small></button>
   <button data-act="rectify" ${st==='idle'?'disabled':''} class="${st==='rectified'?'on':''}"><span class="k">Step 2</span><b>Rectify</b><small>${st==='idle'?'Detect first':auto?'Apply '+auto+' fix'+(auto===1?'':'es'):'No automatic fixes left'}</small></button>
   <button data-act="revalidate" ${st==='idle'?'disabled':''} class="${st==='revalidated'?'on':''}"><span class="k">Step 3</span><b>Revalidate</b><small>Confirm the new score</small></button></div>`;
  if(!snap)return h+`<div class="card pad"><h3 class="h3d">Ready to check</h3><p class="muted">Run <b>Detect</b> to compare this draft with the paper library and your experiment records. It checks similarity, novelty, citations, the contribution statement and every reported result.</p></div>`;
  if(stale)h+=`<div class="banner">The draft has changed since the last validation. Revalidate to refresh the score.</div>`;
  const delta=base&&st==='revalidated'&&base.hash!==snap.hash?snap.overall-base.overall:null;
  h+=`<div class="card score">${ring(snap.overall)}<div><b style="font-size:17px">${snap.label}</b><div class="muted" style="font-size:13.5px;margin:2px 0 10px">${delta!==null?`Baseline ${base.overall}, now ${snap.overall} (<span class="delta ${delta>=0?'up':'down'}">${delta>=0?'+':''}${delta}</span>)`:'Readiness for submission, 0 to 100'}</div>${compBars(snap.scores)}</div></div>`;
  if(a.closest)h+=`<p class="note" style="margin-bottom:14px">Closest prior work in the library: <b>${esc(citeOf(a.closest))}</b>, ${esc(a.closest.title)} (text similarity ${a.maxcos.toFixed(2)}).</p>`;
  if(st==='revalidated'&&delta!==null){
    h+=`<div class="card pad" style="margin-bottom:14px"><h3 class="h3d">Before and after</h3><div class="tscroll"><table class="t cmp"><thead><tr><th>Check</th><th class="num">Detected</th><th class="num">Now</th><th class="num">Change</th></tr></thead><tbody>${COMPS.map(([k,l])=>{const d=snap.scores[k]-base.scores[k];return `<tr><td>${l}</td><td class="num">${base.scores[k]}</td><td class="num">${snap.scores[k]}</td><td class="num delta ${d>0?'up':d<0?'down':''}">${d>0?'+':''}${d}</td></tr>`;}).join('')}<tr><td><b>Overall</b></td><td class="num">${base.overall}</td><td class="num">${snap.overall}</td><td class="num delta ${delta>=0?'up':'down'}"><b>${delta>=0?'+':''}${delta}</b></td></tr></tbody></table></div></div>`;
  }
  const c=a.counts;
  h+=`<h3 class="h3d">${a.findings.length?a.findings.length+' open finding'+(a.findings.length===1?'':'s'):'No open findings'}</h3>`;
  if(a.findings.length)h+=`<p class="muted" style="font-size:13.5px;margin:-4px 0 12px">${c.high} high, ${c.medium} medium, ${c.low} low. Findings reflect the current text; the score above reflects the last validation.</p><div class="finds">${a.findings.map(findingHTML).join('')}</div>`;
  else h+=`<div class="card pad muted">Nothing is flagged in the current text. Revalidate to confirm.</div>`;
  return h;
}
PAGES.integrity=function(el){
  el.innerHTML=`<div class="page-head"><div><span class="eyebrow">Research Integrity &amp; Novelty Engine</span><h1>Detect, rectify, revalidate.</h1><p class="muted">The draft is checked against the paper library and your experiment records. Fixes change the text only when you click them, and you can undo anything by editing.</p></div></div>
  <div class="split"><section class="card editor"><div class="bar"><b>Manuscript draft</b><span id="wc"></span></div><textarea id="ms" spellcheck="true" aria-label="Manuscript draft"></textarea><p class="note">This sample draft contains deliberate problems. Edit it or paste your own. Citations are read in (Author, Year) form.</p></section><section id="panel" style="min-width:0"></section></div>`;
  const ta=$('#ms'),panel=$('#panel'),wcEl=$('#wc');
  ta.value=S.manuscript;
  const upd=()=>{wcEl.textContent=wc(S.manuscript).toLocaleString('en-US')+' words';};
  const draw=()=>{panel.innerHTML=integPanel();};
  upd();draw();
  let t;ta.addEventListener('input',()=>{S.manuscript=ta.value;upd();save();clearTimeout(t);t=setTimeout(()=>{if(cur==='integrity')draw();},300);});
  panel.addEventListener('click',e=>{
    const b=e.target.closest('[data-act]');if(!b||b.disabled)return;
    const act=b.dataset.act,id=b.dataset.id;
    if(act==='detect'){const s=snapshotOf(live());S.integ.baseline=s;S.integ.snap=s;S.integ.stage='detected';log(S,'Integrity check run: readiness '+s.overall);toast('Detect finished: readiness '+s.overall);}
    else if(act==='rectify'){
      const r=fixAll(S.manuscript,S.runs,S.acks);
      if(!r.applied){toast('No automatic fixes left. Review the remaining findings.');return;}
      S.manuscript=r.text;S.fixes+=r.applied;S.integ.stage='rectified';log(S,'Applied '+r.applied+' fixes to the manuscript');toast('Applied '+r.applied+' fixes. Review the changes, then revalidate.');
    }else if(act==='revalidate'){const s=snapshotOf(live());S.integ.snap=s;S.integ.stage='revalidated';log(S,'Revalidated: readiness '+s.overall);toast('Revalidated: readiness '+s.overall);}
    else if(act==='fix'){
      const f=live().findings.find(x=>x.id===id);if(!f||!f.fix)return;
      const nt=f.fix.apply(S.manuscript);if(nt===S.manuscript){toast('That text is no longer in the draft.');return;}
      S.manuscript=nt;S.fixes++;S.integ.stage='rectified';log(S,'Applied fix: '+f.fix.label);toast('Fix applied. Revalidate when you are done.');
    }else if(act==='ack'){S.acks[id]=true;log(S,'Marked a citation as checked manually');toast('Marked as checked');}
    ta.value=S.manuscript;upd();save();draw();
  });
};

/* ================= Publish ================= */
const MANUAL=[['m-format','Manuscript follows the venue template','Use the template named for the selected venue'],['m-abs','Abstract fits the venue’s word limit',''],['m-ethics','Ethics, data availability and conflict statements added',''],['m-authors','Author names, affiliations and ORCID iDs are complete',''],['m-fig','Figures and tables are legible and numbered',''],['m-cover','Cover letter reviewed and personalised',''],['m-reviewers','Suggested reviewers listed, if the venue asks for them',''],['m-licence','Copyright or licence form ready','']];
function checklist(){
  const a=live(),v=S.integ,reval=v.stage==='revalidated'&&v.snap&&v.snap.hash===curHash();
  const nf=cat=>a.findings.filter(f=>f.cat===cat).length;
  const auto=[
   {id:'a-runs',label:'Experiment records exist',ok:S.runs.length>0,hint:S.runs.length+' runs recorded'},
   {id:'a-reval',label:'Draft revalidated after its last edit',ok:reval,hint:reval?'Readiness '+v.snap.overall:'Run Revalidate on the Integrity page'},
   {id:'a-high',label:'No high-severity findings open',ok:a.counts.high===0,hint:a.counts.high?a.counts.high+' open':'All clear'},
   {id:'a-cons',label:'Reported results match experiment records',ok:nf('Results consistency')===0,hint:nf('Results consistency')?nf('Results consistency')+' mismatches':'Every figure traced to a run'},
   {id:'a-cite',label:'Citations verified against sources',ok:nf('Citation accuracy')===0,hint:a.cites.verified+' of '+a.cites.total+' verified'},
   {id:'a-sim',label:'No uncited text overlap with the library',ok:!a.findings.some(f=>f.cat==='Similarity'&&f.sev!=='low'),hint:''},
   {id:'a-contrib',label:'Contribution statement present',ok:a.hasContrib,hint:''}
  ].map(x=>Object.assign(x,{manual:false}));
  return auto.concat(MANUAL.map(([id,label,hint])=>({id,label,hint,manual:true,ok:!!S.checks[id]})));
}
function coverLetter(v){
  const lines=S.manuscript.split('\n'),title=(lines[0]||'Untitled manuscript').trim();
  const m=S.manuscript.match(/^Abstract\s*\n([\s\S]*?)(?:\n\s*\n|$)/m);
  const abs=m?sentencesOf(m[1]).slice(0,2).join(' '):sentencesOf(S.manuscript).slice(1,3).join(' ');
  const L=Object.values(latestByModel(S.runs)).sort((a,b)=>b.metrics.f1-a.metrics.f1),b=L[0];
  return `Dear Editors,\n\nPlease consider the enclosed manuscript, “${title}”, for publication in ${v.name}.\n\n${abs}\n\n`+(b?`All quantitative results in the manuscript come from recorded experiment runs (best model: ${MODELS[b.model].lc}, F1 ${b.metrics.f1.toFixed(2)}). The draft was checked for citation accuracy and text overlap before submission.\n\n`:'')+`[Confirm before sending: the work is original and is not under review elsewhere.]\n\nSincerely,\n[Author name]\n[Affiliation and contact details]`;
}
function refList(){
  const seen=new Set(),out=[];
  parseCites(S.manuscript).forEach(c=>{const cand=(SURNAMES[c.surname.toLowerCase()]||[]).find(p=>p.year===c.year);if(cand&&!seen.has(cand.id)){seen.add(cand.id);const l=linksOf(cand).find(x=>x.label==='DOI')||linksOf(cand)[0];out.push(cand.authors+' ('+cand.year+'). '+cand.title+'. '+cand.venue+'.'+(l?' '+l.url:''));}});
  return out;
}
function reproRecord(){
  return JSON.stringify({dataset:{generator:'synthetic IoT flows',records:DATA_N,features:FEATURES,attackShare:DATA_ATTACK,datasetSeed:2026},runs:S.runs.map(r=>({id:r.id,model:MODELS[r.model].name,params:r.params,seed:r.seed,testShare:r.testFrac,metrics:{accuracy:+r.metrics.acc.toFixed(4),precision:+r.metrics.prec.toFixed(4),recall:+r.metrics.rec.toFixed(4),f1:+r.metrics.f1.toFixed(4)},record:r.rec}))},null,2);
}
PAGES.publish=function(el){
  const ms=S.manuscript;
  const fits=VENUES.map(v=>({v,fit:venueFit(v,ms)})).sort((a,b)=>b.fit-a.fit);
  if(!UI.venueView)UI.venueView=S.venue||fits[0].v.id;
  UI.vkind=UI.vkind||'All';
  el.innerHTML=`<div class="page-head"><div><span class="eyebrow">Publish</span><h1>Choose a venue and finish the submission checklist.</h1><p class="muted">Scope match compares your draft with each venue’s typical topics. It is a starting point. Always confirm scope, limits, deadlines and fees on the venue’s own site.</p></div></div>
  <div class="pub"><section><div class="filters" id="vfilters"></div><div class="venues" id="venues"></div></section><section class="section-gap" id="vpanel" style="min-width:0"></section></div>`;
  const drawList=()=>{
    $('#vfilters').innerHTML=['All','Journal','Conference'].map(k=>`<button class="chip ${UI.vkind===k?'on':''}" data-vk="${k}">${k}</button>`).join('');
    $('#venues').innerHTML=fits.filter(x=>UI.vkind==='All'||x.v.type===UI.vkind).map(({v,fit})=>`<button class="venue ${UI.venueView===v.id?'on':''}" data-venue="${v.id}"><div class="top"><div><b>${esc(v.name)}</b><div class="muted" style="font-size:13px">${v.pub}</div></div><span style="display:flex;gap:6px"><span class="pill">${v.type}</span>${S.venue===v.id?'<span class="pill accent">Target</span>':''}</span></div><div class="fit"><span class="trk"><i style="width:${fit}%"></i></span><span>${fit}% scope match</span></div></button>`).join('');
  };
  const drawPanel=()=>{
    const v=VENUES.find(x=>x.id===UI.venueView),chk=checklist(),done=chk.filter(c=>c.ok).length;
    if(UI.draft[v.id]===undefined)UI.draft[v.id]=coverLetter(v);
    const refs=refList();
    $('#vpanel').innerHTML=`<div class="card pad"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start"><div><h2 style="font:400 28px/1.1 var(--font-display)">${esc(v.name)}</h2><p class="muted" style="margin-top:4px">${v.type} · ${v.pub}</p></div><button class="btn ${S.venue===v.id?'':'primary'}" data-target="${v.id}">${S.venue===v.id?'Target venue':'Target this venue'}</button></div>
      <h3 class="h3d" style="margin-top:16px;font-size:20px">Format</h3><p>${esc(v.tpl)}</p><ul style="margin:10px 0 0;padding-left:18px;display:grid;gap:5px">${v.notes.map(n=>`<li>${esc(n)}</li>`).join('')}<li>Confirm current page limits, deadlines and fees on the venue’s site.</li></ul></div>
    <div class="card pad"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px"><h3 class="h3d" style="margin:0">Submission checklist</h3><span id="progress" class="pill ${done===chk.length?'good':''}">${done} of ${chk.length} complete</span></div>
      <ul class="checklist" style="margin-top:10px">${chk.map(c=>c.manual?`<li><input type="checkbox" id="${c.id}" data-check="${c.id}" ${c.ok?'checked':''}><label for="${c.id}">${esc(c.label)}${c.hint?`<small>${esc(c.hint)}</small>`:''}</label><span></span></li>`:`<li><span class="auto ${c.ok?'ok':'no'}" aria-label="${c.ok?'Passed':'Not met'}">${icon(c.ok?'check':'x',12)}</span><span>${esc(c.label)}<small>${esc(c.hint)}</small></span><span class="pill ${c.ok?'good':'warn'}">${c.ok?'Auto':'Open'}</span></li>`).join('')}</ul></div>
    <div class="card pad"><h3 class="h3d">Supporting documents</h3><div class="docs">
      <div><label class="f" for="cover">Cover letter draft</label><textarea id="cover" rows="12" style="margin-top:6px">${esc(UI.draft[v.id])}</textarea><div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"><button class="btn sm" data-copy="cover">${icon('copy',14)} Copy letter</button><button class="btn sm ghost" data-regen>Regenerate from draft</button></div></div>
      <div class="doc"><div><b>Submission checklist</b><small>Plain text, with status of each item</small></div><button class="btn sm" data-copy="checklist">${icon('copy',14)} Copy</button></div>
      <div class="doc"><div><b>Reproducibility record</b><small>${S.runs.length} runs with settings, seeds and metrics (JSON)</small></div><button class="btn sm" data-copy="repro">${icon('copy',14)} Copy</button></div>
      <div class="doc"><div><b>Reference list</b><small>${refs.length} verified reference${refs.length===1?'':'s'}. Complete the author lists from each DOI record.</small></div><button class="btn sm" data-copy="refs" ${refs.length?'':'disabled'}>${icon('copy',14)} Copy</button></div></div></div>`;
  };
  drawList();drawPanel();
  el.addEventListener('input',e=>{if(e.target.id==='cover')UI.draft[UI.venueView]=e.target.value;});
  el.addEventListener('change',e=>{const c=e.target.dataset&&e.target.dataset.check;if(c){S.checks[c]=e.target.checked;save();const chk=checklist(),n=chk.filter(x=>x.ok).length,p=$('#progress');if(p){p.textContent=n+' of '+chk.length+' complete';p.className='pill'+(n===chk.length?' good':'');}}});
  el.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.vk){UI.vkind=b.dataset.vk;drawList();}
    else if(b.dataset.venue){UI.venueView=b.dataset.venue;drawList();drawPanel();}
    else if(b.dataset.target){S.venue=b.dataset.target;log(S,'Targeted '+VENUES.find(x=>x.id===S.venue).name);save();drawList();drawPanel();toast('Target venue set');}
    else if('regen' in b.dataset){UI.draft[UI.venueView]=coverLetter(VENUES.find(x=>x.id===UI.venueView));drawPanel();}
    else if(b.dataset.copy){
      const k=b.dataset.copy;
      if(k==='cover')copyText($('#cover').value);
      else if(k==='checklist')copyText(checklist().map(c=>(c.ok?'[x] ':'[ ] ')+c.label).join('\n'));
      else if(k==='repro')copyText(reproRecord());
      else if(k==='refs')copyText(refList().join('\n'));
    }
  });
};

/* ================= Boot ================= */
try{const t=localStorage.getItem('iris-theme');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}
(async function boot(){
  $('#app').innerHTML='<div class="splash" role="status" aria-label="Loading">'+logo(56)+'</div>';
  await API.detect();          // is the backend there? if not, run as a demo
  await initSession();         // restore a signed-in session and its saved history
  const h=location.hash.replace('#','');cur=guard(ROUTES.includes(h)?h:'home');
  render();
  if(AUTH.bootError)toast(AUTH.bootError);
})();
