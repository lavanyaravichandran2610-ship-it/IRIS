/* ================= UI core ================= */
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ICONS={
 search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
 chat:'<path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
 flask:'<path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2.2h12.4a1.5 1.5 0 0 0 1.3-2.2L14 9V3"/><path d="M7.5 15h9"/>',
 shield:'<path d="M12 3l8 3v6c0 4.5-3.2 7.7-8 9-4.8-1.3-8-4.5-8-9V6z"/><path d="m9 12 2 2 4-4"/>',
 grid:'<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
 send:'<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>',
 check:'<path d="m5 12 5 5L20 7"/>',
 x:'<path d="M6 6l12 12M18 6 6 18"/>',
 ext:'<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
 copy:'<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
 bookmark:'<path d="M6 3h12v18l-6-4-6 4z"/>',
 moon:'<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/>',
 arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
 upload:'<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
 home:'<path d="M3 11 12 3l9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
 reset:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
 user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
 mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'
};
const icon=(n,s=18)=>`<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;
const logo=(s=32)=>`<svg class="logo" width="${s}" height="${s}" viewBox="0 0 64 64" aria-hidden="true"><use href="#iris-mark"/></svg>`;
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove('show'),2800);}
async function copyText(str){
  try{await navigator.clipboard.writeText(str);toast('Copied to clipboard');}
  catch(e){const ta=document.createElement('textarea');ta.value=str;ta.style.cssText='position:fixed;opacity:0;top:0';document.body.appendChild(ta);ta.select();let ok=false;try{ok=document.execCommand('copy');}catch(_){}ta.remove();toast(ok?'Copied to clipboard':'Copy was blocked. Select the text and copy it manually.');}
}
const pct=(x,d=1)=>(x*100).toFixed(d)+'%';
const stamp=ts=>{const d=new Date(ts);return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'})+', '+d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});};
const primaryLink=id=>{const L=linksOf(PBY[id]);return L.length?L[0].url:'#';};
function ring(score,size=104){
  const r=40,c=2*Math.PI*r,col=score>=85?'var(--good)':score>=65?'var(--warn)':'var(--bad)';
  return `<div class="ring" style="width:${size}px;height:${size}px"><svg viewBox="0 0 100 100"><circle class="trk" cx="50" cy="50" r="${r}" fill="none" stroke-width="9"/><circle cx="50" cy="50" r="${r}" fill="none" stroke-width="9" stroke-linecap="round" stroke="${col}" stroke-dasharray="${(c*score/100).toFixed(1)} ${c.toFixed(1)}"/></svg><div class="num">${score}</div></div>`;
}
const scoreColor=v=>v>=85?'var(--good)':v>=65?'var(--warn)':'var(--bad)';
const sevPill=s=>`<span class="pill ${s==='high'?'bad':s==='medium'?'warn':''}">${s==='high'?'High':s==='medium'?'Medium':'Low'}</span>`;

/* ================= State ================= */
const KEY='iris-proto-v3',DEFAULT_LIB=['mirsky2018','sharafaldin2018','breiman2001','liu2008','snell2017','mcmahan2017'];
let S=null,USER=null;
const stateKey=()=>KEY+':'+(USER?USER.email:'guest');
function log(s,text){s.activity.unshift({ts:Date.now(),text});if(s.activity.length>30)s.activity.length=30;}
function freshState(){
  const s={v:3,library:DEFAULT_LIB.slice(),context:DEFAULT_LIB.slice(),useRecords:true,chat:[],queries:0,gapsRun:false,direction:null,runs:[],manuscript:'',integ:{stage:'idle',baseline:null,snap:null},fixes:0,acks:{},venue:null,checks:{},activity:[]};
  Object.keys(MODELS).forEach(k=>s.runs.push(makeRun(s.runs,k,MODELS[k].defaults,42,.25)));
  s.manuscript=sampleManuscript(s.runs);
  log(s,'Sample project opened with 6 saved papers and 5 recorded experiment runs');
  return s;
}
function validState(s){
  return !!(s&&s.v===3&&Array.isArray(s.library)&&Array.isArray(s.context)&&Array.isArray(s.runs)&&s.runs.length
    &&Array.isArray(s.chat)&&Array.isArray(s.activity)&&typeof s.manuscript==='string'
    &&s.integ&&typeof s.integ==='object'&&s.acks&&typeof s.acks==='object'&&s.checks&&typeof s.checks==='object');
}
/* Demo mode (no backend): history lives in this browser, one copy per account. */
function loadState(){try{const j=localStorage.getItem(stateKey());if(j){const s=JSON.parse(j);if(validState(s))return s;}}catch(e){}return freshState();}

/* Server mode: history is saved to the account. SYNC.rev is the revision this browser last saw. A save names
   that revision, and the server refuses it if another device saved in the meantime. */
const SYNC={rev:0,pending:false,busy:false};
function compactState(){
  const keep=25;                                   // keep full training curves only for the newest runs
  return Object.assign({},S,{
    chat:S.chat.slice(-60),
    activity:S.activity.slice(0,30),
    runs:S.runs.map((r,i)=>i>=S.runs.length-keep?r:Object.assign({},r,{loss:[]}))
  });
}
let _st;
function save(){
  if(!S||!USER)return;
  SYNC.pending=true;
  clearTimeout(_st);
  _st=setTimeout(flushSave,API.on?900:300);
}
async function flushSave(opts){
  clearTimeout(_st);
  if(!S||!USER)return;
  if(!API.on){try{localStorage.setItem(stateKey(),JSON.stringify(S));}catch(e){}SYNC.pending=false;return;}
  if(SYNC.busy){_st=setTimeout(flushSave,400);return;}
  SYNC.busy=true;
  try{
    const r=await API.call('PUT','/api/state',{state:compactState(),base_rev:SYNC.rev},{keepalive:!!(opts&&opts.unload)});
    SYNC.rev=r.rev;SYNC.pending=false;
  }catch(e){
    if(e.status===409){
      SYNC.rev=e.rev||0;
      if(validState(e.state)){
        S=e.state;SYNC.pending=false;_live=null;
        toast('This account was updated on another device. Loaded the latest version.');
        if(cur!=='home'&&cur!=='auth')renderPage();
      }else{_st=setTimeout(flushSave,200);}      // nothing usable on the server: save ours on top
    }else if(e.status===0||e.status>=500){
      toast('Could not save your changes. Retrying…');
      _st=setTimeout(flushSave,8000);
    }else if(e.status===413||e.status===422){
      SYNC.pending=false;toast(e.detail);
    }                                                // 401 is handled by the API client
  }finally{SYNC.busy=false;}
}
async function loadServerState(){
  const r=await API.call('GET','/api/state');
  SYNC.rev=r.rev;
  if(validState(r.state)){S=r.state;}
  else{S=freshState();SYNC.pending=true;_st=setTimeout(flushSave,200);}   // first sign-in: create the sample project
}
window.addEventListener('pagehide',()=>{if(SYNC.pending&&API.on&&USER)flushSave({unload:true});});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&SYNC.pending&&API.on&&USER)flushSave({unload:true});});

const UI={model:'rf',params:Object.assign({},MODELS.rf.defaults),seed:42,test:.25,sel:null,q:'',kind:'All',saved:false,venueView:null,draft:{}};
let _live=null;
const curHash=()=>hash(S.manuscript+JSON.stringify(S.acks));
function live(){const k=curHash()+':'+S.runs.length;if(_live&&_live.k===k)return _live.a;const a=analyze(S.manuscript,S.runs,S.acks);_live={k,a};return a;}
function snapshotOf(a){return{overall:a.overall,scores:a.scores,counts:a.counts,label:a.label,hash:curHash(),ts:Date.now()};}

/* ================= Router ================= */
const ROUTES=['home','auth','dashboard','discover','copilot','experiments','integrity','publish','profile'];
const APP_ROUTES=['dashboard','discover','copilot','experiments','integrity','publish','profile'];
let cur='home',lastRoute=null;
const AUTH={mode:'signin',step:'form',email:'',name:'',code:null,exp:0,tries:0,resendAt:0,err:'',pending:null,timer:null};
function guard(r){if(APP_ROUTES.includes(r)&&!USER){AUTH.pending=r;AUTH.step='form';return 'auth';}if(r==='auth'&&USER)return 'dashboard';return r;}
function go(r){r=guard(r);cur=r;try{if(location.hash!=='#'+r)location.hash=r;}catch(e){}render();}
window.addEventListener('hashchange',()=>{const h=location.hash.replace('#','');if(ROUTES.includes(h)){const g=guard(h);if(g!==cur){cur=g;render();}}});
const isDark=()=>{const t=document.documentElement.getAttribute('data-theme');return t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;};
function toggleTheme(){const n=isDark()?'light':'dark';document.documentElement.setAttribute('data-theme',n);try{localStorage.setItem('iris-theme',n);}catch(e){}render();}
const themeBtn=()=>`<button class="btn ghost sm" data-theme-toggle aria-label="Switch to ${isDark()?'light':'dark'} theme">${icon(isDark()?'sun':'moon')}</button>`;

const NAV=[['Workspace',[['dashboard','Dashboard','grid']]],['Explore',[['discover','Discover papers','search'],['copilot','Research Copilot','chat']]],['Build',[['experiments','Experiment Engine','flask']]],['Validate',[['integrity','Integrity & Novelty','shield'],['publish','Publish','upload']]],['Account',[['profile','Profile','user']]]];
function shell(){
  return `<div class="shell"><aside class="rail"><a class="brand" href="#home" data-go="home" aria-label="IRIS home">${logo(30)}<span class="brand-name">IRIS</span></a>
  <nav class="nav" aria-label="Workspace">${NAV.map(([g,items])=>`<h6>${g}</h6>${items.map(([r,l,ic])=>`<button data-go="${r}" class="${cur===r?'on':''}" ${cur===r?'aria-current="page"':''}>${icon(ic)}<span>${l}</span></button>`).join('')}`).join('')}</nav>
  <div class="rail-foot"><div class="rail-proj"><span class="faint">Sample project</span><b>Lightweight Intrusion Detection for IoT Traffic</b></div>
  <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm" data-go="home">${icon('home',15)} Site</button>${themeBtn()}<button class="btn sm ghost" data-reset title="Reset the sample project">${icon('reset',15)} Reset</button></div>
  <div class="rail-user"><span class="avatar" aria-hidden="true">${initials(USER.name)}</span><span class="who"><b>${esc(USER.name)}</b><small>${esc(USER.email)}</small></span><button class="btn ghost sm" data-signout aria-label="Sign out" title="Sign out">${icon('x',15)}</button></div></div></aside>
  <main class="main" id="view"></main></div>`;
}
const PAGES={};
function mount(){const old=$('#view');if(!old)return;const el=old.cloneNode(false);old.replaceWith(el);if(PAGES[cur])PAGES[cur](el);}
function render(){
  const app=$('#app');
  if(cur==='home')app.innerHTML=landing();
  else if(cur==='auth'){app.innerHTML=authPage();bindAuth();}
  else{app.innerHTML=shell();mount();}
  if(lastRoute!==cur)window.scrollTo(0,0);
  lastRoute=cur;
}
function renderPage(){mount();}
document.addEventListener('click',e=>{
  const g=e.target.closest('[data-go]');if(g){e.preventDefault();go(g.dataset.go);return;}
  const sc=e.target.closest('[data-scroll]');if(sc){const t=document.getElementById(sc.dataset.scroll);if(t)t.scrollIntoView({behavior:'smooth',block:'start'});return;}
  const au=e.target.closest('[data-auth]');if(au){AUTH.mode=au.dataset.auth;AUTH.step='form';AUTH.err='';go('auth');return;}
  if(e.target.closest('[data-signout]')){signOut();return;}
  if(e.target.closest('[data-theme-toggle]')){toggleTheme();return;}
  if(e.target.closest('[data-reset]')){S=freshState();UI.sel=null;UI.draft={};save();render();toast('Sample project reset');}
});

/* ================= Landing ================= */
let _demo=null;
function heroDemo(){
  if(_demo)return _demo;
  const runs=[];Object.keys(MODELS).forEach(k=>runs.push(makeRun(runs,k,MODELS[k].defaults,42,.25)));
  const base=sampleManuscript(runs),a0=analyze(base,runs,{}),fx=fixAll(base,runs,{}),a1=analyze(fx.text,runs,{});
  return _demo={a0,a1,applied:fx.applied};
}
const STAGE_GROUPS=[
 ['Explore',[['Discover','Find papers and open them at the publisher, DOI or repository.'],['Understand','Ask the Copilot about concepts, methods and findings, with sources.'],['Analyze','Compare methodologies and extract findings across papers.'],['Innovate','Turn research gaps into a direction you can test.']]],
 ['Build',[['Experiment','Train models in the Experiment Engine with fixed seeds.'],['Evaluate','Compare runs on accuracy, precision, recall and F1.'],['Develop','Refine the strongest approach through repeated runs.'],['Write','Draft the manuscript next to the records that back it.']]],
 ['Validate',[['Validate','Check similarity, novelty, citations and reported results.'],['Rectify','Apply fixes for citations, numbers and missing statements.'],['Revalidate','Re-run every check and see what changed.'],['Publish','Choose a venue, follow its format and finish the checklist.']]]
];
function landing(){
  const d=heroDemo(),top=d.a0.findings.slice(0,3);
  let n=0;
  return `<header class="site-head"><div class="wrap bar"><a class="brand" href="#home" data-go="home">${logo(34)}<span class="brand-name">IRIS</span></a>
  <nav class="site-nav" aria-label="Sections"><button data-scroll="workflow">Workflow</button><button data-scroll="features">Capabilities</button><button data-scroll="integrity-sec">Integrity engine</button></nav>
  <div class="bar-actions">${themeBtn()}${USER?`<button class="btn primary" data-go="dashboard">Open workspace ${icon('arrow',16)}</button>`:`<button class="btn ghost" data-auth="signin">Sign in</button><button class="btn primary" data-auth="signup">Sign up</button>`}</div></div></header>
  <section class="hero"><div class="wrap hero-grid"><div>
    <div class="tag">${logo(40)}<span class="eyebrow">Intelligent Research &amp; Innovation System</span></div>
    <h1>From research idea to <em><span style="white-space:nowrap">publication-ready</span></em> outcome.</h1>
    <p class="lead">IRIS guides students and researchers through the whole research lifecycle: finding papers, understanding them, running experiments, checking the manuscript against the evidence, and preparing it for a journal or conference.</p>
    <div class="cta">${USER?`<button class="btn primary" data-go="dashboard">Open the sample project ${icon('arrow',16)}</button>`:`<button class="btn primary" data-auth="signup">Get started ${icon('arrow',16)}</button>`}<button class="btn" data-scroll="workflow">See the workflow</button></div></div>
    <div class="card demo" aria-label="Integrity check on a sample draft">
      <div class="demo-top"><b>Integrity check on a sample draft</b><span class="pill accent">Computed in your browser</span></div>
      <div class="demo-scores"><div class="demo-score">${ring(d.a0.overall,92)}<span>Detected</span></div><span class="arrow">${icon('arrow',22)}</span><div class="demo-score">${ring(d.a1.overall,92)}<span>After ${d.applied} fixes</span></div></div>
      <div class="demo-lines">${top.map(f=>`<div class="demo-line">${sevPill(f.sev)}<span>${esc(f.title)}</span></div>`).join('')}</div>
      <p class="muted" style="font-size:13px;margin-top:12px">Detect, rectify, revalidate. Every figure in the draft is compared with a recorded experiment run.</p></div></div></section>

  <section class="block alt" id="workflow"><div class="wrap"><div class="sec-head"><span class="eyebrow">Core workflow</span><h2>Twelve stages, one continuous workspace.</h2><p class="muted">Each stage hands its output to the next, so the paper you write stays tied to the papers you read and the experiments you ran.</p></div>
    <div class="phases">${STAGE_GROUPS.map(([g,items])=>`<div class="card phase"><h3>${g}</h3><ol>${items.map(([t,d2])=>`<li><span class="n">${String(++n).padStart(2,'0')}</span><div><b>${t}</b><span>${d2}</span></div></li>`).join('')}</ol></div>`).join('')}</div></div></section>

  <section class="block" id="features"><div class="wrap"><div class="sec-head"><span class="eyebrow">Capabilities</span><h2>Four tools that share one project record.</h2></div>
    <div class="features">
    ${[['search','Paper discovery with verified links','Search a paper library and open each result at its publisher, DOI or repository page. Save what matters to your project.','discover','Discover papers'],
       ['chat','Research Copilot','Ask about concepts, compare methods and look for research gaps. Answers use your saved papers and your experiment results, and show the source of each claim.','copilot','Ask the Copilot'],
       ['flask','Experiment Engine','Train and compare models with fixed seeds. Every run is recorded with its settings and metrics, so any number in your paper can be traced back.','experiments','Run an experiment'],
       ['shield','Integrity & Novelty Engine','Checks text similarity, novelty against prior work, citation accuracy, the research contribution, and whether the numbers in your draft match your experiment records.','integrity','Check a draft']
      ].map(([ic,t,d2,r,b])=>`<article class="card feature"><div class="icbox">${icon(ic,20)}</div><h3>${t}</h3><p>${d2}</p><button class="btn" data-go="${r}">${b} ${icon('arrow',15)}</button></article>`).join('')}
    </div></div></section>

  <section class="block alt" id="integrity-sec"><div class="wrap"><div class="sec-head"><span class="eyebrow">Research Integrity &amp; Novelty Engine</span><h2>It finds problems, then helps you fix them.</h2><p class="muted">Most checkers stop at a report. IRIS applies corrections you approve and runs every check again to confirm they worked.</p></div>
    <div class="dra">${[['Detect','Step one','Scans the draft for text that matches the library, citations that do not check out, a missing contribution statement, and results that disagree with your records.'],['Rectify','Step two','Offers a specific fix for each issue: correct a year, add a missing citation, replace a number with the recorded value, or insert a missing statement.'],['Revalidate','Step three','Runs all checks again and shows the score before and after, so you can see what is resolved and what still needs your judgement.']].map(([t,k,d2])=>`<div class="card step"><span class="k">${k}</span><h3>${t}</h3><p>${d2}</p></div>`).join('')}</div></div></section>

  <section class="block"><div class="wrap"><div class="card cta-band"><h2>IRIS helps you test and validate research before you submit it.</h2>${USER?`<button class="btn primary" data-go="dashboard">Open workspace ${icon('arrow',16)}</button>`:`<button class="btn primary" data-auth="signup">Create your account ${icon('arrow',16)}</button>`}</div></div></section>
  <footer class="site-foot"><div class="wrap row"><span class="brand">${logo(24)}<span class="brand-name" style="font-size:20px">IRIS</span></span><span>Prototype build. Papers, summaries and the dataset are samples for demonstration. Verify every source at its original link.</span></div></footer>`;
}

/* ================= Dashboard ================= */
function stageList(){
  const counts={};S.runs.forEach(r=>{counts[r.model]=(counts[r.model]||0)+1;});
  const models=Object.keys(counts).length,tuned=Object.values(counts).some(n=>n>=2);
  const rv=S.integ.stage==='revalidated'&&S.integ.snap&&S.integ.snap.hash===curHash();
  const pubDone=!!S.venue&&checklist().every(c=>c.ok);
  return [
   {n:1,name:'Discover',route:'discover',desc:'Save papers with source links',done:S.library.length>0},
   {n:2,name:'Understand',route:'copilot',desc:'Ask the Copilot about your papers',done:S.queries>0},
   {n:3,name:'Analyze',route:'copilot',desc:'Compare methods, find gaps',done:S.gapsRun},
   {n:4,name:'Innovate',route:'copilot',desc:'Adopt a research direction',done:!!S.direction},
   {n:5,name:'Experiment',route:'experiments',desc:'Record model runs',done:S.runs.length>0},
   {n:6,name:'Evaluate',route:'experiments',desc:'Compare at least two models',done:models>=2},
   {n:7,name:'Develop',route:'experiments',desc:'Refine one model with repeat runs',done:tuned},
   {n:8,name:'Write',route:'integrity',desc:'Draft the manuscript',done:wc(S.manuscript)>=150},
   {n:9,name:'Validate',route:'integrity',desc:'Run the integrity check',done:S.integ.stage!=='idle'},
   {n:10,name:'Rectify',route:'integrity',desc:'Apply fixes',done:S.fixes>0},
   {n:11,name:'Revalidate',route:'integrity',desc:'Confirm the fixes',done:rv},
   {n:12,name:'Publish',route:'publish',desc:'Pick a venue, finish the checklist',done:pubDone}
  ];
}
PAGES.dashboard=function(el){
  const st=stageList(),ci=st.findIndex(s=>!s.done),next=st[ci<0?st.length-1:ci];
  const L=Object.values(latestByModel(S.runs)).sort((a,b)=>b.metrics.f1-a.metrics.f1),best=L[0];
  const snap=S.integ.snap,chk=checklist(),chkDone=chk.filter(c=>c.ok).length;
  el.innerHTML=`<div class="page-head"><div><span class="eyebrow">Sample project</span><h1>Lightweight Intrusion Detection for IoT Traffic</h1>
    <p class="muted">${S.direction?'Research direction: '+esc(S.direction):'No research direction chosen yet. Ask the Copilot for research gaps and adopt one.'}</p></div>
    <button class="btn primary" data-go="${next.route}">${ci<0?'Review':'Continue with'} ${next.name} ${icon('arrow',16)}</button></div>
  <section class="stages" aria-label="Research lifecycle">${st.map((s,i)=>`<button class="stage ${s.done?'done':''} ${i===ci?'current':''}" data-go="${s.route}"><span class="top"><span class="num">${String(s.n).padStart(2,'0')}</span>${s.done?'<span class="pill good">Done</span>':i===ci?'<span class="pill accent">Next</span>':'<span class="pill">To do</span>'}</span><b>${s.name}</b><span class="d">${s.desc}</span></button>`).join('')}</section>
  <div class="grid2"><section class="stats">
    <div class="card stat"><span class="l">Papers in library</span><div class="v">${S.library.length}</div><span class="l">${S.context.length} used as Copilot context</span></div>
    <div class="card stat"><span class="l">Copilot questions</span><div class="v">${S.queries}</div><span class="l">${S.gapsRun?'Gap analysis done':'Gap analysis not run'}</span></div>
    <div class="card stat"><span class="l">Experiment runs</span><div class="v">${S.runs.length}</div><span class="l">${best?'Best F1 '+best.metrics.f1.toFixed(2)+' ('+MODELS[best.model].lc+')':'No runs yet'}</span></div>
    <div class="card stat"><span class="l">Manuscript readiness</span><div class="v">${snap?snap.overall:'–'}</div><span class="l">${snap?snap.label:'Not checked yet'}</span></div>
    <div class="card stat" style="grid-column:1/-1"><span class="l">Submission checklist</span><div class="v">${chkDone} of ${chk.length}</div><span class="l">${S.venue?'Target: '+esc((VENUES.find(v=>v.id===S.venue)||{}).name):'No target venue selected'}</span></div>
  </section>
  <section class="card pad"><h3 class="h3d">Recent activity</h3><ul class="activity">${S.activity.slice(0,8).map(a=>`<li><time>${stamp(a.ts)}</time><span>${esc(a.text)}</span></li>`).join('')}</ul></section></div>`;
};
