/* ================= Experiments ================= */
function paramText(r){
  const p=r.params;
  if(r.model==='lr')return p.epochs+' epochs, rate '+p.lr;
  if(r.model==='knn')return 'k = '+p.k;
  if(r.model==='nb')return 'no parameters';
  if(r.model==='dt')return 'depth '+p.maxDepth;
  return p.trees+' trees, depth '+p.maxDepth;
}
function paramInputs(){
  const p=UI.params,m=UI.model;
  const num=(id,label,min,max,step)=>`<label class="f">${label}<input type="number" id="p-${id}" min="${min}" max="${max}" step="${step||1}" value="${p[id]}"></label>`;
  if(m==='lr')return num('epochs','Epochs',10,500)+num('lr','Learning rate',.001,1,.01);
  if(m==='knn')return num('k','Neighbours (k)',1,51);
  if(m==='dt')return num('maxDepth','Maximum depth',1,14);
  if(m==='rf')return num('trees','Trees',1,100)+num('maxDepth','Maximum depth',1,14);
  return '<p class="note">Gaussian naive Bayes has no tunable parameters here.</p>';
}
function lossChart(v){
  const W=330,H=150,l=38,b=22,t=8,r=8,mx=Math.max(...v),mn=Math.min(...v),rg=(mx-mn)||1;
  const X=i=>l+(W-l-r)*i/Math.max(1,v.length-1),Y=x=>t+(H-t-b)*(1-(x-mn)/rg);
  const pts=v.map((x,i)=>X(i).toFixed(1)+','+Y(x).toFixed(1));
  const ticks=[mn,(mn+mx)/2,mx];
  return `<svg class="ch" viewBox="0 0 ${W} ${H}" role="img" aria-label="Training loss per epoch, from ${mx.toFixed(2)} down to ${mn.toFixed(2)}">${ticks.map(x=>`<line class="gl" x1="${l}" x2="${W-r}" y1="${Y(x).toFixed(1)}" y2="${Y(x).toFixed(1)}"/><text x="${l-6}" y="${(Y(x)+3.5).toFixed(1)}" text-anchor="end">${x.toFixed(2)}</text>`).join('')}
  <path class="ar" d="M${X(0).toFixed(1)},${H-b} L${pts.join(' L')} L${X(v.length-1).toFixed(1)},${H-b} Z"/><polyline class="ln" points="${pts.join(' ')}"/><circle class="dot" cx="${X(v.length-1).toFixed(1)}" cy="${Y(v[v.length-1]).toFixed(1)}" r="3.5"/>
  <text x="${l}" y="${H-5}">1</text><text x="${W-r}" y="${H-5}" text-anchor="end">${v.length} epochs</text></svg>`;
}
function resultHTML(r){
  const m=r.metrics,c=r.cm,mx=Math.max(c.tp,c.fp,c.tn,c.fn,1);
  const cell=(n,lab,good)=>`<div class="cm-cell" style="background:color-mix(in srgb,${good?'var(--accent)':'var(--bad)'} ${Math.round(8+40*n/mx)}%,var(--surface))">${n}<small>${lab}</small></div>`;
  const chart=r.loss.length?`<h3 class="h3d">Training loss</h3>${lossChart(r.loss)}`:r.importance?`<h3 class="h3d">${r.model==='lr'?'Weight share':'Feature importance'}</h3><div class="bars">${r.importance.slice().sort((a,b)=>b.value-a.value).map(f=>`<div class="bar-row"><span>${f.name}</span><span class="trk"><i style="width:${Math.round(f.value*100)}%"></i></span><span class="v">${(f.value*100).toFixed(0)}%</span></div>`).join('')}</div>`:`<h3 class="h3d">Notes</h3><p class="muted">${MODELS[r.model].name} has no loss curve or feature weights to display. Its metrics are on the test split only.</p>`;
  return `<div class="card pad" style="margin-bottom:16px"><div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:space-between;align-items:center"><div><b style="font-size:17px">${MODELS[r.model].name}</b> <span class="pill accent">${r.id}</span><div class="muted" style="font-size:13px;margin-top:3px">${paramText(r)} · seed ${r.seed} · ${r.nTrain} train / ${r.nTest} test · ${stamp(r.ts)}</div></div><span class="mono faint" title="Fingerprint of settings and metrics">record ${r.rec}</span></div></div>
  <div class="metrics" style="margin-bottom:16px">${[['Accuracy',m.acc],['Precision',m.prec],['Recall',m.rec],['F1 score',m.f1]].map(([l,v])=>`<div class="card metric"><span class="l">${l}</span><div class="v">${pct(v)}</div></div>`).join('')}</div>
  <div class="res-grid"><div class="card pad"><h3 class="h3d">Confusion matrix</h3><div class="cm-grid"><span></span><span class="h">Predicted benign</span><span class="h">Predicted attack</span><span class="h">Actual benign</span>${cell(c.tn,'true negatives',true)}${cell(c.fp,'false alarms',false)}<span class="h">Actual attack</span>${cell(c.fn,'missed attacks',false)}${cell(c.tp,'detected',true)}</div></div><div class="card pad">${chart}</div></div>`;
}
function compareHTML(){
  const L=Object.values(latestByModel(S.runs)).sort((a,b)=>b.metrics.f1-a.metrics.f1);
  return `<div class="card pad" style="margin-top:16px"><h3 class="h3d">Model comparison <span class="muted" style="font:400 13px var(--font-body)">(latest run of each model, ranked by F1)</span></h3><div class="bars">${L.map((r,i)=>`<div class="bar-row ${i?'alt':''}"><span>${MODELS[r.model].name}</span><span class="trk"><i style="width:${(r.metrics.f1*100).toFixed(1)}%"></i></span><span class="v">${r.metrics.f1.toFixed(3)}</span></div>`).join('')}</div></div>`;
}
function logHTML(){
  return `<div class="card pad" style="margin-top:16px"><h3 class="h3d">Run log</h3><div class="tscroll"><table class="t"><thead><tr><th>Run</th><th>Model</th><th>Settings</th><th class="num">Acc</th><th class="num">Prec</th><th class="num">Rec</th><th class="num">F1</th><th>Record</th></tr></thead><tbody>${S.runs.slice().reverse().map(r=>`<tr class="clk ${UI.sel===r.id?'sel':''}" data-run="${r.id}" tabindex="0"><td class="mono">${r.id}</td><td>${MODELS[r.model].name}</td><td>${paramText(r)}, seed ${r.seed}</td><td class="num">${pct(r.metrics.acc)}</td><td class="num">${pct(r.metrics.prec)}</td><td class="num">${pct(r.metrics.rec)}</td><td class="num">${r.metrics.f1.toFixed(3)}</td><td class="mono faint">${r.rec}</td></tr>`).join('')}</tbody></table></div></div>`;
}
PAGES.experiments=function(el){
  if(!UI.sel||!S.runs.find(r=>r.id===UI.sel))UI.sel=S.runs[S.runs.length-1].id;
  const run=S.runs.find(r=>r.id===UI.sel);
  el.innerHTML=`<div class="page-head"><div><span class="eyebrow">Experiment Engine</span><h1>Run models and keep a record of every result.</h1><p class="muted">Models train in your browser on a synthetic IoT flow dataset (${DATA_N.toLocaleString('en-US')} flows, ${FEATURES.length} features, ${Math.round(DATA_ATTACK*100)}% attacks) generated from a fixed seed. Each run is stored with its settings so the integrity check can compare your manuscript against it.</p></div></div>
  <div class="exp"><aside class="card ctrl"><h3>New run</h3>
    <label class="f">Model<select id="model">${Object.keys(MODELS).map(k=>`<option value="${k}" ${UI.model===k?'selected':''}>${MODELS[k].name}</option>`).join('')}</select></label>
    <div id="params" style="display:grid;gap:12px">${paramInputs()}</div>
    <label class="f">Random seed<input type="number" id="seed" min="1" max="99999" value="${UI.seed}"></label>
    <label class="f">Test share of data<select id="test">${[.2,.25,.3].map(v=>`<option value="${v}" ${UI.test===v?'selected':''}>${Math.round(v*100)}%</option>`).join('')}</select></label>
    <button class="btn primary" id="run">${icon('flask',16)} Run experiment</button>
    <p class="note">Features: ${FEATURES.join(', ')}. Positive class: attack.</p></aside>
  <div id="out" style="min-width:0">${resultHTML(run)}${compareHTML()}${logHTML()}</div></div>`;
  $('#model').addEventListener('change',e=>{UI.model=e.target.value;UI.params=Object.assign({},MODELS[UI.model].defaults);$('#params').innerHTML=paramInputs();});
  $('#run').addEventListener('click',()=>{
    const p={};$$('#params input').forEach(i=>{p[i.id.slice(2)]=parseFloat(i.value);});
    const params=Object.assign({},MODELS[UI.model].defaults,p);
    UI.params=params;UI.seed=Math.max(1,parseInt($('#seed').value,10)||42);UI.test=parseFloat($('#test').value);
    const btn=$('#run');btn.disabled=true;btn.textContent='Training…';
    setTimeout(()=>{
      const r=makeRun(S.runs,UI.model,params,UI.seed,UI.test);S.runs.push(r);UI.sel=r.id;
      log(S,'Ran '+MODELS[r.model].name.toLowerCase()+' ('+r.id+'): F1 '+r.metrics.f1.toFixed(3));save();
      if(cur==='experiments'){renderPage();toast(r.id+' recorded: F1 '+r.metrics.f1.toFixed(3));}
    },30);
  });
  el.addEventListener('click',e=>{const tr=e.target.closest('[data-run]');if(tr){UI.sel=tr.dataset.run;$('#out').innerHTML=resultHTML(S.runs.find(r=>r.id===UI.sel))+compareHTML()+logHTML();}});
  el.addEventListener('keydown',e=>{if(e.key==='Enter'){const tr=e.target.closest('[data-run]');if(tr){UI.sel=tr.dataset.run;$('#out').innerHTML=resultHTML(S.runs.find(r=>r.id===UI.sel))+compareHTML()+logHTML();}}});
};
