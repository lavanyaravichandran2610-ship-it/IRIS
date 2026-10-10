/* ================= Discover ================= */
function discoverResults(){
  const q=UI.q.trim();let list;
  if(q){
    list=searchIdx(PIDX,q,16).map(x=>({p:PBY[x.d.id],score:x.score}));
    const ql=q.toLowerCase();
    PAPERS.forEach(p=>{if(!list.find(x=>x.p===p)&&(p.title+' '+p.authors+' '+p.venue).toLowerCase().includes(ql))list.push({p,score:.12});});
  }else{
    list=searchIdx(PIDX,PROJECT_TOPIC,16).map(x=>({p:PBY[x.d.id],score:x.score}));
    PAPERS.forEach(p=>{if(!list.find(x=>x.p===p))list.push({p,score:0});});
  }
  if(UI.kind!=='All')list=list.filter(x=>x.p.kind===UI.kind);
  if(UI.saved)list=list.filter(x=>S.library.includes(x.p.id));
  const mx=Math.max(.0001,...list.map(x=>x.score));
  return list.map(x=>Object.assign(x,{rel:x.score/mx}));
}
function paperCard(x){
  const p=x.p,saved=S.library.includes(p.id);
  return `<article class="card paper"><h3>${esc(p.title)}</h3>
  <div class="meta"><span>${esc(p.authors)}</span><span>·</span><span>${esc(p.venue)} ${p.year}</span><span class="pill">${p.kind}</span>${x.score>0?`<span class="rel" title="Relevance to your query"><i style="width:${Math.max(8,Math.round(x.rel*100))}%"></i></span>`:''}</div>
  <p class="sum">${esc(p.summary)}</p>
  <div class="tags">${p.tags.map(t=>`<span class="pill">${esc(t)}</span>`).join('')}</div>
  <div class="row"><div class="links">${linksOf(p).map(l=>`<a href="${l.url}" target="_blank" rel="noopener">${l.label} ${icon('ext',13)}</a>`).join('')}</div>
  <div style="display:flex;gap:8px"><button class="btn sm" data-ask="${p.id}">${icon('chat',14)} Ask Copilot</button><button class="btn sm ${saved?'':'primary'}" data-save="${p.id}">${icon('bookmark',14)} ${saved?'Saved':'Save'}</button></div></div></article>`;
}
function libPanel(){
  return `<h3>Your library</h3><ul>${S.library.length?S.library.map(id=>{const p=PBY[id];return `<li><span>${esc(p.title.split(':')[0])}<small>${esc(citeOf(p))}</small></span><button class="btn ghost sm" data-unsave="${id}" aria-label="Remove ${esc(p.title)}">${icon('x',14)}</button></li>`;}).join(''):'<li class="muted">Nothing saved yet.</li>'}</ul>
  <button class="btn primary" style="width:100%" data-go="copilot" ${S.library.length?'':'disabled'}>${icon('chat',16)} Ask the Copilot</button>`;
}
PAGES.discover=function(el){
  el.innerHTML=`<div class="page-head"><div><span class="eyebrow">Discover</span><h1>Find papers and open them at the source.</h1><p class="muted">Every result links to its arXiv, DOI or publisher page. Summaries here are short paraphrases for orientation. Read the original before you cite it.</p></div></div>
  <div class="disc"><div><div class="searchbar"><div class="grow">${icon('search')}<input type="search" id="q" placeholder="Try: few-shot intrusion detection, federated learning, retrieval" value="${esc(UI.q)}" aria-label="Search papers"></div></div>
  <div class="filters" id="filters"></div><p class="note" id="count" style="margin-bottom:14px"></p><div class="papers" id="results"></div></div>
  <aside class="card lib" id="lib"></aside></div>`;
  const draw=()=>{
    const list=discoverResults();
    $('#filters').innerHTML=['All','Journal','Conference'].map(k=>`<button class="chip ${UI.kind===k?'on':''}" data-kind="${k}">${k}</button>`).join('')+`<button class="chip ${UI.saved?'on':''}" data-savedonly>Saved only</button>`;
    $('#count').textContent=(UI.q.trim()?list.length+' results for “'+UI.q.trim()+'”. ':'Showing the prototype corpus of '+PAPERS.length+' papers, ordered by relevance to your project. ')+'In the full build, search runs on the backend.';
    $('#results').innerHTML=list.length?list.map(paperCard).join(''):'<div class="card pad muted">No papers match. Try fewer or broader terms.</div>';
    $('#lib').innerHTML=libPanel();
  };
  draw();
  $('#q').addEventListener('input',e=>{UI.q=e.target.value;const pos=e.target.selectionStart;draw();});
  el.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.kind){UI.kind=b.dataset.kind;draw();}
    else if('savedonly' in b.dataset){UI.saved=!UI.saved;draw();}
    else if(b.dataset.save){
      const id=b.dataset.save,i=S.library.indexOf(id);
      if(i<0){S.library.push(id);S.context.push(id);log(S,'Saved '+citeOf(PBY[id])+' to the library');toast('Saved to your library');}
      else{S.library.splice(i,1);S.context=S.context.filter(x=>x!==id);toast('Removed from your library');}
      save();draw();
    }else if(b.dataset.unsave){const id=b.dataset.unsave;S.library=S.library.filter(x=>x!==id);S.context=S.context.filter(x=>x!==id);save();draw();}
    else if(b.dataset.ask){const id=b.dataset.ask;if(!S.library.includes(id))S.library.push(id);if(!S.context.includes(id))S.context.push(id);save();go('copilot');}
  });
};

/* ================= Copilot ================= */
const GAP_RULES=[
 {needs:['intrusion','few-shot'],title:'Few-shot adaptation to new attack types',text:'Combine prototype-based few-shot classification with flow-based IoT detection, so a new attack family can be learned from a handful of labelled flows.'},
 {needs:['intrusion','federated'],title:'Federated training across IoT sites',text:'Train a detector across several networks with federated averaging, so sites share what they learn without sharing raw traffic.'},
 {needs:['intrusion','tree-ensemble'],title:'Tree ensembles versus autoencoder detection on the same data',text:'Compare tree ensembles with autoencoder-based detection on one labelled flow dataset, and report accuracy together with model size and inference time.'},
 {needs:['dataset','tree-ensemble'],title:'Class imbalance in flow datasets',text:'Study how class weights or resampling change recall for tree ensembles when attack flows are rare.'},
 {needs:['retrieval','intrusion'],title:'Retrieval-grounded explanations for alerts',text:'Retrieve related incident reports or papers to attach evidence to each alert for a human analyst.'}
];
const QUICK=['Compare methodologies','Extract key findings','Identify research gaps','How are my experiments doing?','Explain anomaly detection'];
function runsAnswer(ci,ctx){
  const L=Object.values(latestByModel(S.runs)).sort((a,b)=>b.metrics.f1-a.metrics.f1);
  if(!S.useRecords)return '<p>Experiment records are switched off in the context panel. Turn them on and ask again.</p>';
  if(!L.length)return '<p>No experiment runs are recorded yet. Open the Experiment Engine and run a model first.</p>';
  const b=L[0],w=L[L.length-1],m=b.metrics;
  let h=`<p>You have <b>${S.runs.length}</b> recorded runs across <b>${L.length}</b> models. Using the latest run of each model:</p><div class="tscroll"><table class="t"><thead><tr><th>Model</th><th class="num">Accuracy</th><th class="num">Precision</th><th class="num">Recall</th><th class="num">F1</th></tr></thead><tbody>${L.map(r=>`<tr><td>${MODELS[r.model].name} <span class="faint mono">${r.id}</span></td><td class="num">${pct(r.metrics.acc)}</td><td class="num">${pct(r.metrics.prec)}</td><td class="num">${pct(r.metrics.rec)}</td><td class="num">${r.metrics.f1.toFixed(3)}</td></tr>`).join('')}</tbody></table></div><ul>`;
  h+=`<li><b>${MODELS[b.model].name}</b> leads on F1 (${m.f1.toFixed(3)}); <b>${MODELS[w.model].name}</b> is last (${w.metrics.f1.toFixed(3)}).</li>`;
  if(m.rec<m.prec-.02)h+=`<li>For the leading model, recall (${pct(m.rec)}) trails precision (${pct(m.prec)}), so some attacks are being missed. Lowering the decision threshold or weighting the attack class are the usual next experiments.</li>`;
  else if(m.prec<m.rec-.02)h+=`<li>For the leading model, precision (${pct(m.prec)}) trails recall (${pct(m.rec)}), so false alarms outnumber misses. A higher threshold or more regularisation may help.</li>`;
  else h+=`<li>For the leading model, precision and recall are balanced.</li>`;
  if(L.length>1&&L[0].metrics.f1-L[1].metrics.f1<.01)h+=`<li>The top two models are within 0.01 F1, so repeat the runs with different seeds before claiming a winner.</li>`;
  if(b.model==='rf'&&ctx.includes('breiman2001'))h+=`<li>This fits the argument in ${citeOf(PBY.breiman2001)} that forests keep generalising as trees are added${ci('breiman2001')}.</li>`;
  return h+'</ul>';
}
function copAnswer(q){
  const ctx=S.context.filter(id=>PBY[id]),src=[];
  const ci=id=>{let i=src.indexOf(id);if(i<0){src.push(id);i=src.length-1;}return `<sup class="cm">[${i+1}]</sup>`;};
  const wantsRuns=/\b(my|our)\b[^?]*\b(experiment|run|result|model)s?\b|experiment record|how are my/i.test(q);
  let html='';
  if(wantsRuns)html=runsAnswer(ci,ctx);
  else if(!ctx.length)html='<p>No papers are selected as context. Choose at least one on the left, or add papers from Discover.</p>';
  else if(/compar|differ|versus|\bvs\b|methodolog/i.test(q)){
    html=`<p>Comparison of the ${ctx.length} selected papers:</p><div class="tscroll"><table class="t"><thead><tr><th>Paper</th><th>Method</th><th>Data</th><th>Key result</th><th>Limitation</th></tr></thead><tbody>${ctx.map(id=>{const p=PBY[id];return `<tr><td><b>${esc(p.authors)}</b> ${p.year}${ci(id)}</td><td>${esc(p.method)}</td><td>${esc(p.data)}</td><td>${esc(p.findings[0])}</td><td>${esc(p.limits[0])}</td></tr>`;}).join('')}</tbody></table></div>`;
  }else if(/gap|limitation|future work|direction|idea|opportunit|novel/i.test(q)){
    S.gapsRun=true;
    const by={};ctx.forEach(id=>PBY[id].tags.forEach(t=>{if(!by[t])by[t]=id;}));
    const rules=GAP_RULES.filter(r=>r.needs.every(t=>by[t]));
    html=`<h4>Limitations reported in the selected papers</h4><ul>${ctx.slice(0,6).map(id=>`<li>${esc(PBY[id].limits[0])} <span class="faint">${esc(citeOf(PBY[id]))}</span>${ci(id)}</li>`).join('')}</ul>`;
    html+=rules.length?`<h4>Candidate research directions</h4>`+rules.map(r=>{const ids=[...new Set(r.needs.map(t=>by[t]))];return `<div class="gap"><b>${esc(r.title)}</b><span>${esc(r.text)} ${ids.map(ci).join('')}</span><div><button class="btn sm ${S.direction===r.title?'':'primary'}" data-adopt="${esc(r.title)}">${S.direction===r.title?'Adopted':'Adopt as my direction'}</button></div></div>`;}).join('')+`<p class="faint" style="margin-top:10px;font-size:13px">These are suggestions drawn from the selected papers. Check each one against a wider literature search before committing to it.</p>`:`<p>The selected papers do not combine into an obvious new direction. Add papers from a second area, such as few-shot learning or federated training, and ask again.</p>`;
  }else if(/finding|result|extract|summar|key point|contribution/i.test(q)){
    html=`<p>Key findings from the ${ctx.length} selected papers:</p><ul>${ctx.map(id=>{const p=PBY[id];return `<li><b>${esc(p.authors)} (${p.year})</b>${ci(id)}: ${esc(p.findings.join(' '))}</li>`;}).join('')}</ul>`;
  }else{
    const g=GLOSSARY.find(x=>x.re.test(q));
    const hits=searchIdx(CIDX,q,40).filter(x=>ctx.includes(x.d.pid)&&x.score>.04).slice(0,3);
    if(g&&/explain|what is|what are|define|meaning|how does|how do|tell me about/i.test(q)){
      html=`<h4>${esc(g.name)}</h4><p>${esc(g.text)}</p>`;
      if(hits.length)html+=`<p style="margin-top:10px">In your papers:</p><ul>${hits.map(h=>`<li>${esc(h.d.raw)} <span class="faint">${esc(citeOf(PBY[h.d.pid]))}</span>${ci(h.d.pid)}</li>`).join('')}</ul>`;
    }else if(hits.length){
      html=`<p>The most relevant passages in your selected papers:</p><ul>${hits.map(h=>`<li>${esc(h.d.raw)} <span class="faint">${esc(citeOf(PBY[h.d.pid]))}</span>${ci(h.d.pid)}</li>`).join('')}</ul><p class="faint" style="font-size:13px">These are retrieved passages, not a synthesised answer. Try “compare”, “gaps” or “findings” for a structured view.</p>`;
    }else html='<p>I could not find passages that match that question in the selected papers. Try different terms, select more papers, or add papers from Discover.</p>';
  }
  return{html,sources:src};
}
function msgHTML(m){
  if(m.role==='user')return `<div class="msg user"><div class="bub">${esc(m.text)}</div></div>`;
  return `<div class="msg ai"><div>${logo(26)}</div><div class="bub">${m.html}${m.sources&&m.sources.length?`<div class="srcs">${m.sources.map((id,i)=>`<a href="${primaryLink(id)}" target="_blank" rel="noopener">[${i+1}] ${esc(citeOf(PBY[id]))}</a>`).join('')}</div>`:''}</div></div>`;
}
PAGES.copilot=function(el){
  el.innerHTML=`<div class="page-head"><div><span class="eyebrow">Research Copilot</span><h1>Ask questions about your own papers and results.</h1><p class="muted">Answers are assembled from the papers you select and, if you allow it, your experiment records. Each claim names its source.</p></div></div>
  <div class="cop"><aside class="card ctx"><h3>Context</h3><div id="ctxlist" style="display:grid;gap:10px"></div><hr class="divider"><label><input type="checkbox" id="useRec" ${S.useRecords?'checked':''}><span>Experiment records<small>${S.runs.length} runs from the Experiment Engine</small></span></label>
  <p class="note">Prototype retriever: TF-IDF over short passages from each paper. The full build uses embeddings and an LLM.</p><button class="btn sm" data-go="discover">${icon('search',14)} Add papers</button></aside>
  <section class="card chatbox"><div class="msgs" id="msgs" aria-live="polite"></div><div class="composer"><div class="qp">${QUICK.map(t=>`<button class="chip" data-q="${esc(t)}">${t}</button>`).join('')}</div><div class="in"><textarea id="ask" rows="1" placeholder="Ask about a method, a finding, a gap, or your results" aria-label="Message the Copilot"></textarea><button class="btn primary" id="send" aria-label="Send">${icon('send',16)}</button></div></div></section></div>`;
  const drawCtx=()=>{$('#ctxlist').innerHTML=S.library.length?S.library.map(id=>{const p=PBY[id];return `<label><input type="checkbox" data-ctx="${id}" ${S.context.includes(id)?'checked':''}><span>${esc(p.title.split(':')[0])}<small>${esc(citeOf(p))}</small></span></label>`;}).join(''):'<span class="muted">No papers saved. Add some from Discover.</span>';};
  const drawMsgs=(typing)=>{
    const box=$('#msgs');
    const greet=`<div class="msg ai"><div>${logo(26)}</div><div class="bub"><p>I can answer from the <b>${S.context.length}</b> paper${S.context.length===1?'':'s'} you selected${S.useRecords?' and your <b>'+S.runs.length+'</b> experiment runs':''}. Try one of the prompts below.</p></div></div>`;
    box.innerHTML=(S.chat.length?'':greet)+S.chat.map(msgHTML).join('')+(typing?`<div class="msg ai"><div>${logo(26)}</div><div class="bub"><span class="dots"><i></i><i></i><i></i></span></div></div>`:'');
    box.scrollTop=box.scrollHeight;
  };
  drawCtx();drawMsgs();
  const ask=text=>{
    text=text.trim();if(!text)return;
    S.chat.push({role:'user',text});drawMsgs(true);$('#ask').value='';
    setTimeout(()=>{const a=copAnswer(text);S.chat.push({role:'ai',html:a.html,sources:a.sources});S.queries++;log(S,'Asked the Copilot: '+(text.length>60?text.slice(0,57)+'…':text));save();if(cur==='copilot')drawMsgs();},520);
  };
  $('#send').addEventListener('click',()=>ask($('#ask').value));
  $('#ask').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();ask($('#ask').value);}});
  $('#useRec').addEventListener('change',e=>{S.useRecords=e.target.checked;save();});
  el.addEventListener('change',e=>{if(e.target.dataset&&e.target.dataset.ctx){const id=e.target.dataset.ctx;S.context=S.context.filter(x=>x!==id);if(e.target.checked)S.context.push(id);save();}});
  el.addEventListener('click',e=>{
    const q=e.target.closest('[data-q]');if(q){ask(q.dataset.q);return;}
    const ad=e.target.closest('[data-adopt]');
    if(ad){S.direction=ad.dataset.adopt;log(S,'Adopted research direction: '+S.direction);save();
      $$('[data-adopt]').forEach(b=>{const on=b.dataset.adopt===S.direction;b.textContent=on?'Adopted':'Adopt as my direction';b.classList.toggle('primary',!on);});toast('Research direction saved to your project');}
  });
};
