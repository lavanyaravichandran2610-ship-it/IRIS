/* ================= Accounts, sign-in and profile =================
   Server mode (API.on): real accounts. A Gmail address confirmed with an emailed one-time code, or Google
   sign-in. The session token is kept in this browser; accounts and history live on the server.
   Demo mode (no backend): accounts live in this browser only and the code is shown on screen. */
const GMAIL=/^[a-z0-9._%+-]+@(gmail|googlemail)\.com$/i;
const initials=n=>((n||'?').trim().split(/\s+/).slice(0,2).map(w=>w[0]).join('')||'?').toUpperCase();
const pause=ms=>new Promise(r=>setTimeout(r,ms));

/* ---------- demo-mode storage ---------- */
const MEM={acc:{},sess:null};
function accounts(){try{return JSON.parse(localStorage.getItem('iris-accounts')||'{}');}catch(e){return MEM.acc;}}
function saveAccounts(a){MEM.acc=a;try{localStorage.setItem('iris-accounts',JSON.stringify(a));}catch(e){}}
function getSession(){try{return localStorage.getItem('iris-session');}catch(e){return MEM.sess;}}
function setSession(email){MEM.sess=email;try{if(email)localStorage.setItem('iris-session',email);else localStorage.removeItem('iris-session');}catch(e){}}
function restoreSession(){
  const em=getSession(),a=em&&accounts()[em];
  if(a){USER=a;S=loadState();}
}
function newCode(){
  AUTH.code=String(100000+(crypto.getRandomValues(new Uint32Array(1))[0]%900000));
  AUTH.exp=Date.now()+5*60000;AUTH.tries=0;AUTH.resendAt=Date.now()+30000;
}

/* ---------- session lifecycle ---------- */
async function initSession(){
  if(!API.on){restoreSession();return;}
  if(!API.getToken())return;
  AUTH.booting=true;
  try{
    USER=await API.call('GET','/api/me',undefined,{silent:true});
    await loadServerState();
  }catch(e){
    USER=null;S=null;
    if(e.status===401)API.setToken(null);
    else AUTH.bootError=e.detail;
  }finally{AUTH.booting=false;}
}
API.onAuthLost=detail=>{
  if(AUTH.booting)return;
  API.setToken(null);clearTimeout(_st);SYNC.pending=false;USER=null;S=null;
  AUTH.mode='signin';AUTH.step='form';AUTH.err='';
  go('auth');toast(detail||'Your session ended. Sign in again.');
};
async function settleSaves(){                      // push unsaved changes before leaving
  for(let i=0;i<20&&(SYNC.busy||SYNC.pending);i++){if(!SYNC.busy)await flushSave();await pause(100);}
}
function clearLocalSession(){
  clearTimeout(_st);SYNC.pending=false;USER=null;S=null;UI.sel=null;UI.draft={};UI.venueView=null;
  AUTH.step='form';AUTH.mode='signin';AUTH.err='';
}
async function signOut(){
  if(API.on){
    await settleSaves();
    try{await API.call('POST','/api/auth/logout',undefined,{silent:true});}catch(e){}
    API.setToken(null);
  }else{
    clearTimeout(_st);try{localStorage.setItem(stateKey(),JSON.stringify(S));}catch(e){}
    setSession(null);
  }
  clearLocalSession();
  go('home');toast('Signed out');
}
async function finishSignIn(r){
  API.setToken(r.token);USER=r.user;
  await loadServerState();
  if(!S.activity.length||S.activity[0].text.indexOf('Signed in')<0)log(S,'Signed in as '+USER.email);
  const to=AUTH.pending||'dashboard';
  AUTH.step='form';AUTH.pending=null;AUTH.err='';AUTH.devCode=null;clearInterval(AUTH.timer);
  save();go(to);toast('Welcome, '+USER.name.split(' ')[0]+'.');
}

/* ---------- server calls for the sign-in screens ---------- */
async function requestCode(email,name){
  try{
    const r=await API.call('POST','/api/auth/otp/request',{email,purpose:AUTH.mode,name:name||''},{auth:false});
    AUTH.devCode=r.dev_code||null;
    AUTH.resendAt=Date.now()+(r.resend_in||30)*1000;
    AUTH.expiresIn=r.expires_in||300;
    AUTH.attemptsLeft=(API.cfg&&API.cfg.otp_max_attempts)||5;
    AUTH.step='otp';AUTH.err='';
  }catch(e){
    if(e.retry_after)AUTH.resendAt=Date.now()+e.retry_after*1000;
    throw e;
  }
}
let _gsi=null,_gInit=false;
function loadGoogle(){
  if(window.google&&google.accounts&&google.accounts.id)return Promise.resolve(true);
  if(_gsi)return _gsi;
  _gsi=new Promise(res=>{
    const s=document.createElement('script');
    s.src='https://accounts.google.com/gsi/client';s.async=true;s.defer=true;
    s.onload=()=>res(true);s.onerror=()=>res(false);
    document.head.appendChild(s);setTimeout(()=>res(false),8000);
  });
  return _gsi;
}
async function onGoogleCredential(resp){
  try{
    const r=await API.call('POST','/api/auth/google',{credential:resp.credential},{auth:false});
    await finishSignIn(r);
  }catch(e){AUTH.err=e.detail;AUTH.step='form';render();}
}
async function mountGoogleButton(){
  if(!$('#gbtn'))return;
  const ok=await loadGoogle(),box=$('#gbtn');       // the screen may have been redrawn while the script loaded
  if(!box)return;
  if(!ok||!(window.google&&google.accounts&&google.accounts.id)){
    box.innerHTML='<p class="faint" style="font-size:13px;text-align:center">Google sign-in could not load. Use an email code instead.</p>';return;
  }
  if(!_gInit){google.accounts.id.initialize({client_id:API.cfg.google_client_id,callback:onGoogleCredential,ux_mode:'popup',auto_select:false});_gInit=true;}
  box.innerHTML='';
  google.accounts.id.renderButton(box,{type:'standard',theme:isDark()?'filled_black':'outline',size:'large',
    text:AUTH.mode==='signup'?'signup_with':'signin_with',shape:'rectangular',logo_alignment:'left',
    width:Math.max(200,Math.min(380,Math.floor(box.clientWidth||340)))});
}

/* ---------- sign-in screens ---------- */
const hasGoogle=()=>!!(API.on&&API.cfg&&API.cfg.google_client_id);
function authForm(){
  const su=AUTH.mode==='signup';
  return `<div class="tabs" role="tablist"><button role="tab" aria-selected="${!su}" class="${su?'':'on'}" data-mode="signin">Sign in</button><button role="tab" aria-selected="${su}" class="${su?'on':''}" data-mode="signup">Sign up</button></div>
  <div><h1>${su?'Create your account':'Welcome back'}</h1><p class="muted" style="margin-top:6px">${su?'Use your Gmail address. We confirm it with a one-time code before the account is created.':'Enter the Gmail address you signed up with. We will ask for a one-time code.'}</p></div>
  ${hasGoogle()?`<div id="gbtn" class="gbtn" aria-label="Continue with Google"></div><div class="or"><span>or use an email code</span></div>`:''}
  <form id="authForm" class="form-grid" novalidate>${AUTH.err?`<div class="err" role="alert">${esc(AUTH.err)}</div>`:''}
  ${su?`<label class="f" for="a-name">Full name<input type="text" id="a-name" autocomplete="name" value="${esc(AUTH.name)}" placeholder="Your name"></label>`:''}
  <label class="f" for="a-email">Gmail address<input type="text" id="a-email" inputmode="email" autocomplete="email" value="${esc(AUTH.email)}" placeholder="name@gmail.com"></label>
  <button class="btn primary" type="submit">${icon('mail',16)} Send verification code</button></form>
  <p class="muted" style="font-size:13.5px">${su?'Already have an account? <a href="#" data-mode="signin">Sign in</a>':'New to IRIS? <a href="#" data-mode="signup">Create an account</a>'}</p>`;
}
function authOtp(){
  const left=API.on?(AUTH.attemptsLeft??5):Math.max(0,5-AUTH.tries);
  const minutes=API.on?Math.round((AUTH.expiresIn||300)/60):5;
  const note=!API.on
    ?`<div class="demo-note"><b>Demo mode.</b> This prototype has no mail server or Google connection, so the code is shown here instead of being emailed. The full build sends it to the Gmail address from the backend.<br><span class="codechip" aria-label="Demo verification code">${AUTH.code}</span></div>`
    :AUTH.devCode
      ?`<div class="demo-note"><b>Development mode.</b> This server is not sending email yet, so the code is shown here.<br><span class="codechip" aria-label="Development verification code">${esc(AUTH.devCode)}</span></div>`
      :`<div class="ok-note">We sent a 6-digit code to <b>${esc(AUTH.email)}</b>. It can take a minute to arrive. Check your spam folder if you do not see it.</div>`;
  return `<div><span class="eyebrow">Verify your email</span><h1 style="margin-top:6px">Enter the 6-digit code</h1><p class="muted" style="margin-top:6px">For ${esc(AUTH.email)}. The code is valid for ${minutes} minutes.</p></div>
  ${note}
  <form id="otpForm" class="form-grid" novalidate>${AUTH.err?`<div class="err" role="alert">${esc(AUTH.err)}</div>`:''}
  <label class="f" for="otp">Verification code<input type="text" id="otp" class="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••" aria-describedby="tries"></label>
  <small id="tries" class="faint">${left} attempt${left===1?'':'s'} left</small>
  <button class="btn primary" type="submit">Verify and continue</button></form>
  <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><button class="btn ghost sm" id="resend" disabled>Resend code</button><button class="btn ghost sm" data-back>Use a different address</button></div>`;
}
const sideNote=()=>API.on?'Your account and history are stored on the IRIS server and follow you to any device.':'Prototype: accounts and history are stored in this browser only.';
function authPage(){
  return `<div class="auth"><aside class="auth-side"><a class="brand" href="#home" data-go="home" aria-label="IRIS home">${logo(34)}<span class="brand-name">IRIS</span></a>
  <div><h2>Your research history stays with your account.</h2><ul>
  <li>${icon('check',16)}<span>Saved papers, Copilot conversations, experiment runs and manuscript drafts are kept per account.</span></li>
  <li>${icon('check',16)}<span>Sign in with Google, or with a Gmail address confirmed by a one-time code.</span></li>
  <li>${icon('check',16)}<span>Every figure in a manuscript stays linked to the run that produced it.</span></li></ul></div>
  <p class="faint" style="font-size:13px">${sideNote()}</p></aside>
  <main class="auth-main"><div class="auth-top"><button class="btn ghost sm" data-go="home">${icon('arrow',14).replace('<svg','<svg style="transform:scaleX(-1)"')} Back to site</button>${themeBtn()}</div>
  <div class="card auth-card">${AUTH.step==='otp'?authOtp():authForm()}</div></main></div>`;
}
function bindAuth(){
  const root=$('.auth-card');
  clearInterval(AUTH.timer);
  if(AUTH.step==='otp'){
    const tick=()=>{
      const b=$('#resend');if(!b){clearInterval(AUTH.timer);return;}
      const s=Math.ceil((AUTH.resendAt-Date.now())/1000);
      if(s>0){b.disabled=true;b.textContent='Resend code in '+s+'s';}else{b.disabled=false;b.textContent='Resend code';}
    };
    tick();AUTH.timer=setInterval(tick,1000);
    const o=$('#otp');if(o)o.focus();
  }else if(hasGoogle())mountGoogleButton();

  root.addEventListener('click',e=>{
    const m=e.target.closest('[data-mode]');
    if(m){e.preventDefault();AUTH.name=($('#a-name')||{}).value||AUTH.name;AUTH.email=($('#a-email')||{}).value||AUTH.email;AUTH.mode=m.dataset.mode;AUTH.err='';render();return;}
    if(e.target.closest('[data-back]')){AUTH.step='form';AUTH.err='';AUTH.code=null;AUTH.devCode=null;render();return;}
    if(e.target.closest('#resend')){
      const b=$('#resend');if(!b||b.disabled)return;
      if(API.on){
        b.disabled=true;
        requestCode(AUTH.email,AUTH.name).then(()=>toast('A new code was sent')).catch(er=>{AUTH.err=er.detail;}).finally(()=>{if(cur==='auth')render();});
      }else{newCode();AUTH.err='';render();toast('A new code was generated');}
    }
  });

  const f=$('#authForm');
  if(f)f.addEventListener('submit',async e=>{
    e.preventDefault();
    const email=$('#a-email').value.trim().toLowerCase(),name=($('#a-name')||{value:''}).value.trim();
    AUTH.email=email;AUTH.name=name;
    let err='';
    if(!GMAIL.test(email))err='Enter a Gmail address, for example name@gmail.com.';
    else if(AUTH.mode==='signup'&&!name)err='Enter your full name.';
    if(err){AUTH.err=err;render();return;}
    if(API.on){
      f.querySelector('button[type=submit]').disabled=true;
      try{await requestCode(email,name);}catch(er){AUTH.err=er.detail;}
      if(cur==='auth')render();return;
    }
    const acc=accounts();
    if(AUTH.mode==='signup'&&acc[email])err='An account already exists for this address. Use Sign in instead.';
    else if(AUTH.mode==='signin'&&!acc[email])err='No account found for this address. Use Sign up to create one.';
    if(err){AUTH.err=err;render();return;}
    AUTH.err='';newCode();AUTH.step='otp';render();
  });

  const of=$('#otpForm');
  if(of)of.addEventListener('submit',async e=>{
    e.preventDefault();
    const v=$('#otp').value.trim();
    if(!/^\d{6}$/.test(v)){AUTH.err='Enter all 6 digits.';render();return;}
    if(API.on){
      of.querySelector('button[type=submit]').disabled=true;
      try{
        const r=await API.call('POST','/api/auth/otp/verify',{email:AUTH.email,purpose:AUTH.mode,code:v},{auth:false});
        await finishSignIn(r);
      }catch(er){
        AUTH.err=er.detail;
        if(typeof er.attempts_left==='number')AUTH.attemptsLeft=er.attempts_left;
        if(cur==='auth')render();
      }
      return;
    }
    if(Date.now()>AUTH.exp){AUTH.err='This code has expired. Request a new one.';render();return;}
    if(AUTH.tries>=5){AUTH.err='Too many wrong attempts. Request a new code.';render();return;}
    if(v!==AUTH.code){AUTH.tries++;AUTH.err=AUTH.tries>=5?'Too many wrong attempts. Request a new code.':'That code is not correct.';render();return;}
    const acc=accounts();
    if(AUTH.mode==='signup'&&!acc[AUTH.email]){acc[AUTH.email]={email:AUTH.email,name:AUTH.name,org:'',created:Date.now()};saveAccounts(acc);}
    USER=acc[AUTH.email];setSession(USER.email);S=loadState();
    if(!S.activity.length||S.activity[0].text.indexOf('Signed in')<0)log(S,'Signed in as '+USER.email);
    const to=AUTH.pending||'dashboard';
    AUTH.step='form';AUTH.code=null;AUTH.pending=null;AUTH.err='';clearInterval(AUTH.timer);save();
    go(to);toast('Email verified. Welcome, '+USER.name.split(' ')[0]+'.');
  });
}

/* ---------- profile ---------- */
PAGES.profile=function(el){
  const since=new Date(USER.created).toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'});
  el.innerHTML=`<div class="page-head"><div><span class="eyebrow">Profile</span><h1>Your account and research history.</h1><p class="muted">${API.on?'Everything below is saved to your account and follows you to any device.':'Everything below is saved to this account on this device.'}</p></div></div>
  <div class="prof"><section class="card pad"><div class="prof-head"><span class="avatar lg" aria-hidden="true">${initials(USER.name)}</span><div><b style="font-size:18px">${esc(USER.name)}</b><div class="muted" style="font-size:14px">${esc(USER.email)}</div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px"><span class="pill good">${icon('check',12)} Email verified</span>${USER.google?'<span class="pill accent">Google account linked</span>':''}</div></div></div>
    <form id="profForm" class="form-grid" novalidate><label class="f" for="p-name">Full name<input type="text" id="p-name" maxlength="120" value="${esc(USER.name)}"></label>
    <label class="f" for="p-email">Gmail address<input type="text" id="p-email" value="${esc(USER.email)}" disabled></label>
    <label class="f" for="p-org">Institution or organisation<input type="text" id="p-org" maxlength="160" value="${esc(USER.org||'')}" placeholder="Optional"></label>
    <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn primary" type="submit">Save profile</button><button class="btn" type="button" data-signout>Sign out</button>${API.on?'<button class="btn ghost" type="button" data-signout-all>Sign out of all devices</button>':''}</div></form></section>
  <div style="display:grid;gap:16px;min-width:0"><section class="card pad"><h3 class="h3d">Saved history</h3><div class="stats">
    <div class="card stat"><span class="l">Papers saved</span><div class="v">${S.library.length}</div></div><div class="card stat"><span class="l">Copilot questions</span><div class="v">${S.queries}</div></div>
    <div class="card stat"><span class="l">Experiment runs</span><div class="v">${S.runs.length}</div></div><div class="card stat"><span class="l">Fixes applied</span><div class="v">${S.fixes}</div></div></div>
    <p class="muted" style="font-size:13px;margin-top:12px">Member since ${since}.</p></section>
  <section class="card pad danger" id="danger"><h3 class="h3d">Delete account</h3><p class="muted" style="font-size:14px">Removes this account and its saved history${API.on?' from the server':' from this browser'}. This cannot be undone.</p><div id="delzone" style="margin-top:12px"><button class="btn" data-del1>Delete my account</button></div></section></div></div>`;
  $('#profForm').addEventListener('submit',async e=>{
    e.preventDefault();const n=$('#p-name').value.trim(),org=$('#p-org').value.trim();
    if(!n){toast('Name cannot be empty');return;}
    if(API.on){
      try{USER=await API.call('PATCH','/api/me',{name:n,org});if(cur==='profile')render();toast('Profile saved');}
      catch(er){toast(er.detail);}
      return;
    }
    USER.name=n;USER.org=org;const a=accounts();a[USER.email]=USER;saveAccounts(a);render();toast('Profile saved');
  });
  el.addEventListener('click',async e=>{
    if(e.target.closest('[data-del1]')){$('#delzone').innerHTML=`<p style="margin-bottom:10px"><b>Delete ${esc(USER.email)} and all its history?</b></p><div style="display:flex;gap:8px"><button class="btn primary" style="background:var(--bad);border-color:var(--bad);color:#fff" data-del2>Yes, delete everything</button><button class="btn" data-del0>Cancel</button></div>`;}
    else if(e.target.closest('[data-del0]')){$('#delzone').innerHTML='<button class="btn" data-del1>Delete my account</button>';}
    else if(e.target.closest('[data-signout-all]')){
      await settleSaves();
      try{await API.call('POST','/api/auth/logout-all');}catch(er){toast(er.detail);return;}
      API.setToken(null);clearLocalSession();go('home');toast('Signed out of every device');
    }else if(e.target.closest('[data-del2]')){
      if(API.on){
        try{await API.call('DELETE','/api/me');}catch(er){toast(er.detail);return;}
        API.setToken(null);clearLocalSession();go('home');toast('Account deleted');return;
      }
      clearTimeout(_st);const em=USER.email,a=accounts();delete a[em];saveAccounts(a);
      try{localStorage.removeItem(stateKey());}catch(_){}
      setSession(null);USER=null;S=null;go('home');toast('Account deleted');
    }
  });
};
