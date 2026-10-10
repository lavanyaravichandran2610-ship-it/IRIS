/* ================= Retrieval (TF-IDF) ================= */
const STOP=new Set('a an the of and or to in on for with by from as is are was were be been it its this that these those at we our us can than then into over under using use used via not no but if so such also more most their they them which who whom how what why when where does do did has have had will would should could may might about between each other'.split(' '));
function stem(w){
  if(w.length>4&&w.endsWith('ies'))return w.slice(0,-3)+'y';
  if(w.length>5&&w.endsWith('ing'))return w.slice(0,-3);
  if(w.length>4&&w.endsWith('ed'))return w.slice(0,-2);
  if(w.length>3&&w.endsWith('s')&&!w.endsWith('ss'))return w.slice(0,-1);
  return w;
}
function toks(t){return (String(t).toLowerCase().match(/[a-z0-9]+/g)||[]).filter(w=>!STOP.has(w)&&w.length>1).map(stem);}
function buildIndex(docs){
  const df={};
  const tfs=docs.map(d=>{const tf={};toks(d.text).forEach(w=>{tf[w]=(tf[w]||0)+1});Object.keys(tf).forEach(w=>{df[w]=(df[w]||0)+1});return tf;});
  const N=docs.length, idf=w=>Math.log(1+N/(df[w]||0.5));
  const vecs=tfs.map(tf=>{const v={};let n=0;for(const w in tf){const x=(1+Math.log(tf[w]))*idf(w);v[w]=x;n+=x*x}n=Math.sqrt(n)||1;for(const w in v)v[w]/=n;return v;});
  return {docs,vecs,idf,df,N};
}
function qvec(idx,text){const tf={};toks(text).forEach(w=>{tf[w]=(tf[w]||0)+1});const v={};let n=0;for(const w in tf){if(!idx.df[w])continue;const x=(1+Math.log(tf[w]))*idx.idf(w);v[w]=x;n+=x*x}n=Math.sqrt(n)||1;for(const w in v)v[w]/=n;return v;}
function cosine(a,b){let s=0;for(const w in a)if(b[w])s+=a[w]*b[w];return s;}
function searchIdx(idx,text,k=5){const q=qvec(idx,text);return idx.docs.map((d,i)=>({d,score:cosine(q,idx.vecs[i])})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,k);}

const CHUNKS=[];
PAPERS.forEach(p=>{
  const add=(kind,text)=>CHUNKS.push({pid:p.id,kind,text,raw:text,idxText:p.title+' '+p.tags.join(' ')+' '+text});
  add('summary',p.summary);add('method',p.method+' '+p.data);
  p.findings.forEach(f=>add('finding',f));p.limits.forEach(l=>add('limitation',l));
});
CHUNKS.forEach(c=>c.text=c.idxText);
const CIDX=buildIndex(CHUNKS);
const PIDX=buildIndex(PAPERS.map(p=>({id:p.id,text:p.title+' '+p.tags.join(' ')+' '+p.summary+' '+p.method+' '+p.data+' '+p.findings.join(' ')+' '+p.limits.join(' ')})));
const PROJECT_TOPIC='lightweight intrusion detection IoT network traffic few-shot anomaly tree ensemble classification';

/* ================= Synthetic dataset + ML ================= */
function rng(seed){let a=seed>>>0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function gauss(r){let u=0,v=0;while(!u)u=r();while(!v)v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
const FEATURES=['packet rate','mean packet size','flow duration','port entropy','SYN ratio','byte asymmetry'];
const DATA_N=1600, DATA_ATTACK=0.35;
let _ds=null;
function dataset(){
  if(_ds)return _ds;
  const r=rng(2026),X=[],y=[];
  const g=(m,s,lo=0)=>Math.max(lo,m+s*gauss(r));
  for(let i=0;i<DATA_N;i++){
    const atk=r()<DATA_ATTACK;
    if(!atk){X.push([g(40,18),g(520,160,40),g(30,14,1),g(1.2,.5),g(.08,.05),g(.5,.18)]);y.push(0);}
    else{
      const u=r();
      if(u<.6)X.push([g(190,60),g(120,60,40),g(8,5,1),g(.4,.3),g(.55,.2),g(.85,.1)]);
      else if(u<.85)X.push([g(75,25),g(70,30,40),g(5,3,1),g(3.2,.6),g(.7,.15),g(.7,.15)]);
      else X.push([g(55,20),g(450,150,40),g(26,12,1),g(1.6,.6),g(.15,.07),g(.58,.18)]);
      y.push(1);
    }
  }
  return _ds={X,y};
}
const MODELS={
  lr:{name:'Logistic regression',lc:'logistic regression',defaults:{epochs:200,lr:.1}},
  knn:{name:'k-nearest neighbours',lc:'k-nearest neighbours',defaults:{k:5}},
  nb:{name:'Gaussian naive Bayes',lc:'Gaussian naive Bayes',defaults:{}},
  dt:{name:'Decision tree',lc:'decision tree',defaults:{maxDepth:5}},
  rf:{name:'Random forest',lc:'random forest',defaults:{trees:25,maxDepth:6}}
};
const MODEL_ALIAS={lr:/logistic regression/ig,knn:/k-?nearest neighbou?rs?|\bk-?nn\b/ig,nb:/(?:gaussian )?naive bayes/ig,dt:/decision trees?/ig,rf:/random forests?/ig};
function buildTree(X,y,idx,o,rand,depth,imp){
  const n=idx.length;let pos=0;for(const i of idx)pos+=y[i];
  const p=pos/n;
  if(depth>=o.maxDepth||n<2*o.minLeaf||pos===0||pos===n)return{leaf:true,p};
  const d=X[0].length;let feats=[...Array(d).keys()];
  if(o.mtry&&o.mtry<d){for(let i=feats.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[feats[i],feats[j]]=[feats[j],feats[i]];}feats=feats.slice(0,o.mtry);}
  const gini=q=>2*q*(1-q),parent=gini(p);let best=null;
  for(const f of feats){
    const ord=idx.slice().sort((a,b)=>X[a][f]-X[b][f]);let lp=0;
    for(let i=0;i<n-1;i++){
      lp+=y[ord[i]];const nl=i+1,nr=n-nl;
      if(nl<o.minLeaf||nr<o.minLeaf)continue;
      const v1=X[ord[i]][f],v2=X[ord[i+1]][f];if(v1===v2)continue;
      const gg=(nl*gini(lp/nl)+nr*gini((pos-lp)/nr))/n;
      if(!best||gg<best.g)best={g:gg,f,t:(v1+v2)/2};
    }
  }
  if(!best||parent-best.g<1e-9)return{leaf:true,p};
  imp[best.f]+=(parent-best.g)*n;
  const L=[],R=[];for(const i of idx)(X[i][best.f]<=best.t?L:R).push(i);
  return{f:best.f,t:best.t,l:buildTree(X,y,L,o,rand,depth+1,imp),r:buildTree(X,y,R,o,rand,depth+1,imp)};
}
function predTree(nd,x){while(!nd.leaf)nd=x[nd.f]<=nd.t?nd.l:nd.r;return nd.p;}
function runModel(model,params,seed,testFrac){
  const D=dataset(),N=D.X.length,r=rng(seed);
  const order=[...Array(N).keys()];for(let i=N-1;i>0;i--){const j=Math.floor(r()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
  const nTe=Math.round(N*testFrac),te=order.slice(0,nTe),tr=order.slice(nTe),d=FEATURES.length;
  const mean=Array(d).fill(0),sd=Array(d).fill(0);
  tr.forEach(i=>D.X[i].forEach((v,k)=>mean[k]+=v/tr.length));
  tr.forEach(i=>D.X[i].forEach((v,k)=>sd[k]+=(v-mean[k])**2/tr.length));
  for(let k=0;k<d;k++)sd[k]=Math.sqrt(sd[k])||1;
  const Xs=D.X.map(x=>x.map((v,k)=>(v-mean[k])/sd[k])),y=D.y;
  const Xtr=tr.map(i=>Xs[i]),ytr=tr.map(i=>y[i]),Xte=te.map(i=>Xs[i]),yte=te.map(i=>y[i]);
  let P=[],loss=[],importance=null;
  if(model==='lr'){
    const w=Array(d).fill(0);let b=0;const ep=Math.max(10,Math.min(500,params.epochs|0)),lr=+params.lr||.1,l2=.001,n=Xtr.length;
    for(let e=0;e<ep;e++){
      const gw=Array(d).fill(0);let gb=0,L=0;
      for(let i=0;i<n;i++){let z=b;for(let k=0;k<d;k++)z+=w[k]*Xtr[i][k];const p=1/(1+Math.exp(-z)),er=p-ytr[i];for(let k=0;k<d;k++)gw[k]+=er*Xtr[i][k];gb+=er;L-=ytr[i]*Math.log(p+1e-12)+(1-ytr[i])*Math.log(1-p+1e-12);}
      for(let k=0;k<d;k++)w[k]-=lr*(gw[k]/n+l2*w[k]);b-=lr*gb/n;loss.push(L/n);
    }
    P=Xte.map(x=>{let z=b;for(let k=0;k<d;k++)z+=w[k]*x[k];return 1/(1+Math.exp(-z));});
    const tot=w.reduce((s,v)=>s+Math.abs(v),0)||1;importance=FEATURES.map((nm,k)=>({name:nm,value:Math.abs(w[k])/tot}));
  }else if(model==='knn'){
    const k=Math.max(1,Math.min(51,params.k|0));
    P=Xte.map(x=>{const ds=Xtr.map((t,i)=>{let s=0;for(let q=0;q<d;q++)s+=(t[q]-x[q])**2;return[s,ytr[i]];}).sort((a,b)=>a[0]-b[0]).slice(0,k);return ds.reduce((s,v)=>s+v[1],0)/k;});
  }else if(model==='nb'){
    const st=c=>{const rows=Xtr.filter((_,i)=>ytr[i]===c),m=Array(d).fill(0),v=Array(d).fill(0);rows.forEach(x=>x.forEach((q,k)=>m[k]+=q/rows.length));rows.forEach(x=>x.forEach((q,k)=>v[k]+=(q-m[k])**2/rows.length));return{m,v:v.map(q=>q+1e-6),pr:rows.length/Xtr.length};};
    const s0=st(0),s1=st(1);
    const ll=(s,x)=>{let l=Math.log(s.pr);for(let k=0;k<d;k++)l+=-.5*Math.log(2*Math.PI*s.v[k])-(x[k]-s.m[k])**2/(2*s.v[k]);return l;};
    P=Xte.map(x=>1/(1+Math.exp(ll(s0,x)-ll(s1,x))));
  }else if(model==='dt'||model==='rf'){
    const imp=Array(d).fill(0),idx=[...Array(Xtr.length).keys()];
    if(model==='dt'){
      const t=buildTree(Xtr,ytr,idx,{maxDepth:Math.max(1,Math.min(14,params.maxDepth|0)),minLeaf:5},r,0,imp);
      P=Xte.map(x=>predTree(t,x));
    }else{
      const T=Math.max(1,Math.min(100,params.trees|0)),trees=[];
      for(let t=0;t<T;t++){const bs=idx.map(()=>Math.floor(r()*idx.length));trees.push(buildTree(Xtr,ytr,bs,{maxDepth:Math.max(1,Math.min(14,params.maxDepth|0)),minLeaf:3,mtry:3},r,0,imp));}
      P=Xte.map(x=>trees.reduce((s,t)=>s+predTree(t,x),0)/T);
    }
    const tot=imp.reduce((s,v)=>s+v,0)||1;importance=FEATURES.map((nm,k)=>({name:nm,value:imp[k]/tot}));
  }
  let tp=0,fp=0,tn=0,fn=0;
  P.forEach((p,i)=>{const h=p>=.5?1:0;if(h&&yte[i])tp++;else if(h)fp++;else if(yte[i])fn++;else tn++;});
  const acc=(tp+tn)/P.length,prec=tp+fp?tp/(tp+fp):0,rec=tp+fn?tp/(tp+fn):0,f1=prec+rec?2*prec*rec/(prec+rec):0;
  return{metrics:{acc,prec,rec,f1},cm:{tp,fp,tn,fn},loss,importance,nTrain:tr.length,nTest:te.length};
}
function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return(h>>>0).toString(16).padStart(8,'0');}
function makeRun(runs,model,params,seed,testFrac){
  const res=runModel(model,params,seed,testFrac);
  const id='R-'+String(runs.length+1).padStart(3,'0');
  return Object.assign({id,model,params:Object.assign({},params),seed,testFrac,ts:Date.now(),rec:hash(model+JSON.stringify(params)+seed+testFrac+JSON.stringify(res.metrics))},res);
}
function latestByModel(runs){const m={};runs.forEach(r=>{m[r.model]=r;});return m;}

/* ================= Integrity & Novelty engine ================= */
function sentencesOf(text){return text.split(/(?<=[.!?])\s+(?=[A-Z0-9"(\[])|\n+/).map(s=>s.trim()).filter(Boolean);}
const words=t=>(String(t).toLowerCase().match(/[a-z0-9]+/g)||[]);
function shingles(ws,n=3){const s=new Set();for(let i=0;i+n<=ws.length;i++)s.add(ws.slice(i,i+n).join(' '));return s;}
const CHUNK_SH=CHUNKS.map(c=>shingles(words(c.raw)));
const SURNAMES=Object.fromEntries(PAPERS.map(p=>[p.a.toLowerCase(),[]]));
PAPERS.forEach(p=>SURNAMES[p.a.toLowerCase()].push(p));
const METRIC_KEY=m=>{m=m.toLowerCase();return m.startsWith('acc')?'acc':m.startsWith('prec')?'prec':m.startsWith('rec')?'rec':'f1';};
const METRIC_LABEL={acc:'accuracy',prec:'precision',rec:'recall',f1:'F1'};
const CONTRIB_RE=/\b(we (?:propose|present|introduce|contribute)|our (?:main |key )?contributions?|(?:main|key) contributions?|contributions? (?:of this|are|is)|this (?:paper|work|study) (?:proposes|presents|introduces))\b/i;
const sevRank={high:0,medium:1,low:2};
function wc(t){return(t.match(/\S+/g)||[]).length;}

function claimsOf(text){
  const out=[];
  for(const sent of sentencesOf(text)){
    const mentions=[];
    for(const k in MODEL_ALIAS){const re=new RegExp(MODEL_ALIAS[k].source,'ig');let m;while((m=re.exec(sent)))mentions.push({k,i:m.index});}
    if(!mentions.length)continue;
    const spans=[],found=[];
    const A=/\b(accuracy|precision|recall|f1(?:[-\s]score)?|f-measure)\b(?:\s+(?:of|was|is|at|reached|achieved|score|about|around|approximately))*\s*[:=]?\s*(\d{1,3}(?:\.\d+)?)(\s*%)?/gi;
    let m;
    while((m=A.exec(sent))){const ns=m.index+m[0].indexOf(m[2],m[1].length);found.push({metric:METRIC_KEY(m[1]),num:m[2],pct:!!m[3],start:ns,end:ns+m[2].length});spans.push([m.index,m.index+m[0].length]);}
    const B=/(\d{1,3}(?:\.\d+)?)(\s*%)?\s+(accuracy|precision|recall|f1(?:[-\s]score)?|f-measure)\b/gi;
    while((m=B.exec(sent))){const s0=m.index,e0=m.index+m[0].length;if(spans.some(([a,b])=>s0<b&&e0>a))continue;found.push({metric:METRIC_KEY(m[3]),num:m[1],pct:!!m[2],start:s0,end:s0+m[1].length});}
    for(const f of found){
      let v=parseFloat(f.num);if(!f.pct&&v<=1)v*=100;else if(!f.pct&&v>1&&v<=100){/* bare number above 1 treated as percent */}
      if(v<0||v>100)continue;
      let near=null;for(const mt of mentions){if(mt.i<=f.start)near=mt;}if(!near)near=mentions[0];
      const dec=(f.num.split('.')[1]||'').length;
      out.push({sentence:sent,model:near.k,metric:f.metric,num:f.num,pct:f.pct,value:v,start:f.start,end:f.end,dec});
    }
  }
  return out;
}
function parseCites(text){
  const res=[];
  const groups=text.match(/\([^()]*\d{4}[^()]*\)/g)||[];
  for(const g of groups){
    const inner=g.slice(1,-1).split(';');
    for(const part of inner){
      const m=part.trim().match(/^([A-Z][A-Za-z\-]+)(?:\s+et al\.?|\s+(?:and|&)\s+[A-Z][A-Za-z\-]+)?,?\s+(\d{4})[a-z]?$/);
      if(m)res.push({full:g,part:part.trim(),surname:m[1],year:+m[2]});
    }
  }
  return res;
}
function insertBeforeMethod(text,para){
  const i=text.search(/^(?:2\.\s|Method|Methods|Related Work)/m);
  if(i<0)return text.replace(/\s+$/,'')+'\n\n'+para+'\n';
  return text.slice(0,i)+para+'\n\n'+text.slice(i);
}
function analyze(text,runs,acks){
  acks=acks||{};
  const findings=[],sents=sentencesOf(text);
  const latest=latestByModel(runs);

  /* similarity */
  const simHits=[];
  sents.forEach(s=>{
    const ws=words(s);if(ws.length<8)return;
    const sh=shingles(ws);if(!sh.size)return;
    let best={score:0,ci:-1};
    CHUNK_SH.forEach((cs,ci)=>{let c=0;sh.forEach(g=>{if(cs.has(g))c++;});const sc=c/sh.size;if(sc>best.score)best={score:sc,ci};});
    if(best.score>=.3){
      const ch=CHUNKS[best.ci],p=PBY[ch.pid];
      const attributed=new RegExp('\\b'+p.a+'\\b','i').test(s);
      simHits.push({sentence:s,score:best.score,paper:p,attributed,chunk:ch.raw});
    }
  });
  simHits.forEach(h=>{
    const pct=Math.round(h.score*100);
    if(h.attributed){
      findings.push({id:'sim-att:'+hash(h.sentence),cat:'Similarity',sev:'low',title:'Close wording to '+citeOf(h.paper)+' ('+pct+'% overlap)',detail:'The source is cited, but the phrasing stays close to it. Paraphrase it further or put it in quotation marks.',quote:h.sentence,pen:3});
    }else{
      findings.push({id:'sim:'+hash(h.sentence),cat:'Similarity',sev:h.score>=.5?'high':'medium',title:'Text overlaps '+citeOf(h.paper)+' without a citation ('+pct+'% overlap)',detail:'This sentence matches a passage in the indexed library. Add a citation, and consider rewriting it in your own words.',quote:h.sentence,pen:h.score>=.5?25:12,
        fix:{label:'Add citation '+citeOf(h.paper),apply:t=>t.replace(h.sentence,h.sentence.replace(/([.!?])\s*$/,' ('+citeOf(h.paper)+')$1'))}});
    }
  });

  /* citations */
  const cites=parseCites(text),seen=new Set();let verified=0;const citedIds=new Set();
  cites.forEach(c=>{
    const key=c.surname+c.year+c.full;if(seen.has(key))return;seen.add(key);
    const cand=SURNAMES[c.surname.toLowerCase()];
    if(cand){
      const exact=cand.find(p=>p.year===c.year);
      if(exact){verified++;citedIds.add(exact.id);return;}
      const p=cand[0];
      findings.push({id:'cite-year:'+c.surname+':'+c.year,cat:'Citation accuracy',sev:'medium',title:'Year looks wrong for '+c.surname+' ('+c.year+')',detail:'The indexed record for '+p.title+' gives '+p.year+', not '+c.year+'.',quote:c.part,pen:15,
        fix:{label:'Change year to '+p.year,apply:t=>t.replace(c.full,c.full.replace(String(c.year),String(p.year)))}});
      citedIds.add(p.id);
    }else{
      const id='cite-unv:'+c.surname+':'+c.year;
      if(acks[id]){verified++;return;}
      findings.push({id,cat:'Citation accuracy',sev:'medium',title:'Cannot verify '+c.surname+' ('+c.year+')',detail:'No matching record in the 16-paper prototype corpus. Check the spelling and year against the publisher or DOI page, then confirm it here.',quote:c.part,pen:20,ack:'I checked this reference'});
    }
  });

  /* contribution */
  const hasContrib=CONTRIB_RE.test(text);
  const best=Object.values(latest).sort((a,b)=>b.metrics.f1-a.metrics.f1)[0];
  if(!hasContrib){
    findings.push({id:'contrib',cat:'Research contribution',sev:'medium',title:'No explicit contribution statement',detail:'Reviewers look for a clear statement of what the paper adds. The suggested paragraph is built only from your recorded experiments, so edit it to match your claims.',pen:0,
      fix:runs.length?{label:'Insert contribution paragraph',apply:t=>{
        const ms=Object.values(latest).map(r=>MODELS[r.model].lc);
        const para='The main contributions of this work are: (1) a reproducible comparison of '+ms.length+' lightweight classifiers ('+ms.join(', ')+') on labelled flow features; and (2) results reported directly from recorded experiment runs, where the best model, '+MODELS[best.model].lc+', reaches an F1 of '+best.metrics.f1.toFixed(2)+'.';
        return insertBeforeMethod(t,para);}}:null,
      go:runs.length?null:'experiments'});
  }

  /* novelty */
  let ntext=text;simHits.forEach(h=>{ntext=ntext.replace(h.sentence,' ');});
  const tv=qvec(PIDX,ntext);let closest=null,maxcos=0;
  PAPERS.forEach((p,i)=>{const c=cosine(tv,PIDX.vecs[i]);if(c>maxcos){maxcos=c;closest=p;}});
  let diff=false;
  if(closest)diff=new RegExp('(unlike|in contrast to|differs? from|compared (?:with|to)|whereas)[^.]{0,120}\\b'+closest.a+'\\b','i').test(text);
  let novelty=Math.max(0,Math.min(100,Math.round(100*(1-maxcos*1.1))));
  if(diff)novelty=Math.min(100,novelty+10);
  if(closest&&maxcos>=.12&&!diff){
    findings.push({id:'novelty',cat:'Novelty',sev:'medium',title:'No explicit comparison with the closest prior work',detail:'The closest indexed paper is '+citeOf(closest)+' ('+closest.title+'). State how your work differs from it. Check that the inserted sentence describes your method accurately.',pen:0,
      fix:{label:'Insert comparison sentence',apply:t=>insertBeforeMethod(t,'In contrast to '+citeOf(closest).replace(', ',' (').replace(/$/,')')+', which '+closest.short+', this work evaluates lightweight supervised classifiers on labelled flow features and reports every figure from recorded experiment runs.')}});
  }

  /* consistency */
  const claims=claimsOf(text);let consBad=0;
  claims.forEach(c=>{
    const run=latest[c.model];
    if(!run){
      consBad++;
      findings.push({id:'cons-none:'+c.model+':'+c.metric,cat:'Results consistency',sev:'high',title:'No experiment record for '+MODELS[c.model].lc,detail:'The draft reports '+METRIC_LABEL[c.metric]+' for this model, but no run exists in your experiment log.',quote:c.sentence,pen:0,go:'experiments'});
      return;
    }
    const rec=run.metrics[c.metric]*100,tol=.5*Math.pow(10,-c.dec)*(c.pct?1:100)+.01;
    if(Math.abs(c.value-rec)>tol){
      consBad++;
      const fmt=c.pct?rec.toFixed(Math.max(1,c.dec))+'%':(rec/100).toFixed(Math.max(2,c.dec)),old=c.num+(c.pct?'%':'');
      findings.push({id:'cons:'+c.model+':'+c.metric+':'+c.num,cat:'Results consistency',sev:'high',title:MODELS[c.model].name+' '+METRIC_LABEL[c.metric]+' does not match the record',detail:'The draft says '+old+'. Run '+run.id+' recorded '+fmt+'.',quote:c.sentence,pen:0,
        fix:{label:'Use recorded value '+fmt,apply:t=>{const s=c.sentence;const ns=s.slice(0,c.start)+(c.pct?rec.toFixed(Math.max(1,c.dec)):(rec/100).toFixed(Math.max(2,c.dec)))+s.slice(c.end);return t.replace(s,ns);}}});
    }
  });

  /* ranking claims */
  const RANK=/(decision trees?|random forests?|logistic regression|k-?nearest neighbou?rs?|\bk-?nn\b|(?:gaussian )?naive bayes)(?:\s+classifier)?\s+(?:outperforms?|outperformed|beats?|is the best|performs? best)/i;
  sents.forEach(sent=>{
    const m=sent.match(RANK);if(!m||!/\b(other|all|every)\b/i.test(sent))return;
    let k=null;for(const kk in MODEL_ALIAS){if(new RegExp(MODEL_ALIAS[kk].source,'i').test(m[1])){k=kk;break;}}
    if(!k||!latest[k]||Object.keys(latest).length<2)return;
    const top=Object.entries(latest).sort((a,b)=>b[1].metrics.f1-a[1].metrics.f1)[0];
    if(top[0]===k)return;
    consBad++;
    const bestName=MODELS[top[0]].lc;
    findings.push({id:'rank:'+k+':'+hash(sent),cat:'Results consistency',sev:'high',title:'Ranking claim is not supported by the records',detail:'The draft says the '+MODELS[k].lc+' outperforms the other models. By F1, the records rank the '+bestName+' first ('+top[1].metrics.f1.toFixed(2)+') and the '+MODELS[k].lc+' at '+latest[k].metrics.f1.toFixed(2)+'.',quote:sent,pen:0,
      fix:{label:'Name the '+bestName+' instead',apply:t=>t.replace(sent,sent.replace(new RegExp(MODEL_ALIAS[k].source,'i'),bestName))}});
  });

  /* uncited library papers (info) */
  /* scores */
  const simPen=findings.filter(f=>f.cat==='Similarity').reduce((s,f)=>s+f.pen,0);
  const citePen=findings.filter(f=>f.cat==='Citation accuracy').reduce((s,f)=>s+f.pen,0);
  const mism=findings.filter(f=>f.cat==='Results consistency').length;
  const scores={
    orig:Math.max(0,100-simPen),
    nov:novelty,
    cite:Math.max(0,100-citePen),
    contrib:hasContrib?100:35,
    cons:claims.length?Math.max(0,100-Math.min(100,mism*30)):70
  };
  const W={orig:.25,nov:.2,cite:.2,contrib:.15,cons:.2};
  const overall=Math.round(Object.keys(W).reduce((s,k)=>s+scores[k]*W[k],0));
  findings.sort((a,b)=>sevRank[a.sev]-sevRank[b.sev]);
  const counts={high:0,medium:0,low:0};findings.forEach(f=>counts[f.sev]++);
  return{findings,scores,overall,counts,closest,maxcos,claims,cites:{total:seen.size,verified},simHits,hasContrib,diff,label:overall>=85?'Ready to prepare':overall>=65?'Needs revision':'Not ready'};
}
function fixAll(text,runs,acks){
  const tried=new Set();let applied=0;
  for(let i=0;i<14;i++){
    const a=analyze(text,runs,acks);const f=a.findings.find(x=>x.fix&&!tried.has(x.id));
    if(!f)break;tried.add(f.id);const nt=f.fix.apply(text);if(nt!==text){text=nt;applied++;}
  }
  return{text,applied};
}
function sampleManuscript(runs){
  const L=latestByModel(runs),pc=x=>(x*100).toFixed(1);
  const dt=L.dt,rf=L.rf,lr=L.lr;
  const dtAcc=Math.min(99.9,dt.metrics.acc*100+4.1).toFixed(1),dtF1=Math.min(.99,dt.metrics.f1+.04).toFixed(2);
  return 'Lightweight Flow-Based Intrusion Detection for IoT Networks\n\n'+
'Abstract\n'+
'Internet-connected devices are frequent targets of flooding and scanning attacks. This paper compares five lightweight classifiers on labelled flow features and reports detection accuracy, precision, recall and F1. The decision tree classifier achieved an accuracy of '+dtAcc+'% and an F1 of '+dtF1+', while the random forest reached '+pc(rf.metrics.acc)+'% accuracy.\n\n'+
'1. Introduction\n'+
PBY.breiman2001.summary+' IoT networks carry heterogeneous traffic, and attacks such as floods and port scans leave visible traces in flow statistics. Unsupervised detectors such as Kitsune (Mirsky et al., 2019) run online on low-cost hardware, but they need a threshold tuned for each deployment. Isolation-based methods (Liu et al., 2008) are fast, and language model assistants have also been proposed for alert triage (Zhang et al., 2022).\n\n'+
'2. Method\n'+
'We generate '+DATA_N.toLocaleString('en-US')+' synthetic flow records with six features: packet rate, mean packet size, flow duration, destination-port entropy, SYN ratio and byte asymmetry. Features are standardised using training-set statistics. We train logistic regression, k-nearest neighbours, Gaussian naive Bayes, a decision tree and a random forest, and evaluate each on a held-out split.\n\n'+
'3. Results\n'+
'Logistic regression reached an accuracy of '+pc(lr.metrics.acc)+'%. The decision tree outperforms the other models on this dataset, and ensembling further stabilises its predictions.\n';
}

/* ================= Venues ================= */
const VENUES=[
{id:'iotj',name:'IEEE Internet of Things Journal',type:'Journal',pub:'IEEE',kw:['iot','internet of things','edge','sensor','network','intrusion','detection','lightweight','security','traffic','device'],tpl:'IEEE journal template (two-column, Word or LaTeX).',notes:['Check the journal’s current page limit and any open-access or overlength fees.','Expect reviewers to ask for evaluation on real device traffic or a public dataset.']},
{id:'cs',name:'Computers & Security',type:'Journal',pub:'Elsevier',kw:['security','intrusion','detection','attack','malware','privacy','network','classification','anomaly','threat'],tpl:'Elsevier article template; many Elsevier journals also ask for highlights.',notes:['Confirm whether a graphical abstract or highlights are required.','Strong fit for detection work with a clear threat model.']},
{id:'jnca',name:'Journal of Network and Computer Applications',type:'Journal',pub:'Elsevier',kw:['network','traffic','iot','detection','distributed','edge','security','classification','lightweight','flow'],tpl:'Elsevier article template.',notes:['Applications-oriented: show deployment cost, such as model size or inference time.']},
{id:'tifs',name:'IEEE Transactions on Information Forensics and Security',type:'Journal',pub:'IEEE',kw:['security','privacy','forensics','intrusion','attack','detection','adversarial','authentication','anomaly'],tpl:'IEEE Transactions template (Word or LaTeX).',notes:['Typically expects a rigorous threat model and stronger baselines than a first draft.']},
{id:'access',name:'IEEE Access',type:'Journal',pub:'IEEE',kw:['network','detection','machine learning','classification','iot','security','traffic','anomaly','evaluation','dataset'],tpl:'IEEE Access template (single submission file, Word or LaTeX).',notes:['Open-access venue with a broad scope; confirm the article processing charge before submitting.']},
{id:'sensors',name:'Sensors',type:'Journal',pub:'MDPI',kw:['sensor','iot','device','network','detection','edge','lightweight','traffic','classification','monitoring'],tpl:'MDPI template (Word or LaTeX).',notes:['Open-access venue; check the article processing charge and special issues on IoT security.']},
{id:'ccs',name:'ACM CCS',type:'Conference',pub:'ACM',kw:['security','attack','privacy','intrusion','adversarial','malware','threat','detection'],tpl:'ACM acmart (sigconf) LaTeX template.',notes:['Highly selective; usually expects a new technique with a thorough security evaluation.']},
{id:'ndss',name:'NDSS Symposium',type:'Conference',pub:'Internet Society',kw:['network','security','intrusion','detection','attack','iot','traffic','anomaly','privacy'],tpl:'NDSS LaTeX template.',notes:['Selective; Kitsune appeared here, so reviewers will know the baseline well.']}
];
function venueFit(v,text){
  const tk=new Set(toks(text));const stemmed=v.kw.map(k=>toks(k));
  let hit=0;stemmed.forEach(ws=>{if(ws.length&&ws.every(w=>tk.has(w)))hit++;});
  return Math.round(100*hit/v.kw.length);
}
