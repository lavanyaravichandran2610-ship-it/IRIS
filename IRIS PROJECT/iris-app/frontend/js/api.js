/* ================= API client =================
   Talks to the IRIS backend (FastAPI). If the backend does not answer, API.on stays false and the site runs
   in demo mode: accounts and history are kept in this browser only (see auth.js). */
const API={
  base:((window.IRIS_CONFIG&&window.IRIS_CONFIG.apiBase)||'').replace(/\/+$/,''),
  on:false,        // true once /api/config answered
  cfg:null,        // public settings from the server, such as the Google client ID
  _tok:null,
  onAuthLost:null, // set by auth.js: called when the server says the session has ended

  getToken(){
    if(API._tok)return API._tok;
    try{API._tok=localStorage.getItem('iris-token');}catch(e){}
    return API._tok;
  },
  setToken(t){
    API._tok=t||null;
    try{if(t)localStorage.setItem('iris-token',t);else localStorage.removeItem('iris-token');}catch(e){}
  },

  async detect(){
    try{
      const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),4000);
      const res=await fetch(API.base+'/api/config',{headers:{Accept:'application/json'},signal:ctl.signal,cache:'no-store'});
      clearTimeout(timer);
      if(!res.ok)return;
      const j=await res.json();
      if(j&&typeof j==='object'&&'google_client_id' in j){API.cfg=j;API.on=true;}
    }catch(e){/* no backend here: demo mode */}
  },

  /* Resolves with the JSON body. Rejects with {status, detail, ...extra fields from the server}.
     status 0 means the server could not be reached. */
  async call(method,path,body,opts){
    opts=opts||{};
    const auth=opts.auth!==false;
    const headers={Accept:'application/json'};
    let payload;
    if(body!==undefined){headers['Content-Type']='application/json';payload=JSON.stringify(body);}
    if(auth&&API.getToken())headers.Authorization='Bearer '+API.getToken();
    let res;
    try{
      res=await fetch(API.base+path,{method,headers,body:payload,cache:'no-store',
        keepalive:!!(opts.keepalive&&payload&&payload.length<60000)});
    }catch(e){
      throw {status:0,detail:'Cannot reach the IRIS server. Check your connection and try again.'};
    }
    let data=null;
    if(res.status!==204){try{data=await res.json();}catch(e){}}
    if(!res.ok){
      if(res.status===401&&auth&&!opts.silent&&API.getToken()&&API.onAuthLost)API.onAuthLost(data&&data.detail);
      throw Object.assign({status:res.status,detail:'Something went wrong. Try again.'},data||{});
    }
    return data;
  }
};
