import os, json, sqlite3, hashlib, secrets, re, datetime, csv, uuid
from functools import wraps
from flask import Flask, request, jsonify, send_from_directory, session
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename

BASE = os.path.dirname(os.path.abspath(__file__))
DB = os.getenv("IRIS_DB_PATH", os.path.join(BASE, "iris.db"))
UPLOAD_DIR = os.getenv("IRIS_UPLOAD_DIR", os.path.join(BASE, "uploads"))
os.makedirs(UPLOAD_DIR, exist_ok=True)
app = Flask(__name__, static_folder="static")
app.config["MAX_CONTENT_LENGTH"] = 25 * 1024 * 1024
app.secret_key = os.getenv("IRIS_SECRET_KEY", secrets.token_hex(32))
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_SECURE"] = os.getenv("IRIS_SECURE_COOKIES", "0") == "1"

PAPERS = [
 {"title":"Attention Is All You Need","authors":"Ashish Vaswani et al.","year":2017,"venue":"NeurIPS","doi":"10.48550/arXiv.1706.03762","url":"https://arxiv.org/abs/1706.03762","abstract":"Introduces the Transformer architecture based entirely on attention mechanisms for sequence transduction."},
 {"title":"BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding","authors":"Jacob Devlin et al.","year":2019,"venue":"NAACL","doi":"10.48550/arXiv.1810.04805","url":"https://arxiv.org/abs/1810.04805","abstract":"Presents bidirectional Transformer pre-training that can be fine-tuned for many language understanding tasks."},
 {"title":"Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks","authors":"Patrick Lewis et al.","year":2020,"venue":"NeurIPS","doi":"10.48550/arXiv.2005.11401","url":"https://arxiv.org/abs/2005.11401","abstract":"Combines a parametric generator with a non-parametric dense index to improve knowledge-intensive generation."},
 {"title":"Dense Passage Retrieval for Open-Domain Question Answering","authors":"Vladimir Karpukhin et al.","year":2020,"venue":"EMNLP","doi":"10.48550/arXiv.2004.04906","url":"https://arxiv.org/abs/2004.04906","abstract":"Uses dual-encoder dense retrieval to retrieve passages for open-domain question answering."},
 {"title":"Random Forests","authors":"Leo Breiman","year":2001,"venue":"Machine Learning","doi":"10.1023/A:1010933404324","url":"https://doi.org/10.1023/A:1010933404324","abstract":"Introduces random forests, combining many randomised decision trees to improve generalisation."},
 {"title":"Isolation Forest","authors":"Fei Tony Liu et al.","year":2008,"venue":"ICDM","doi":"10.1109/ICDM.2008.17","url":"https://doi.org/10.1109/ICDM.2008.17","abstract":"Anomaly detection method that isolates observations using random partitioning."},
 {"title":"Kitsune: An Ensemble of Autoencoders for Online Network Intrusion Detection","authors":"Yisroel Mirsky et al.","year":2018,"venue":"NDSS","doi":"10.14722/ndss.2018.23204","url":"https://arxiv.org/abs/1802.09089","abstract":"Online network intrusion detection using an ensemble of lightweight autoencoders."}
]
def db():
 c=sqlite3.connect(DB); c.row_factory=sqlite3.Row; return c
def init_db():
 with db() as c:
  c.executescript("""
  CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS projects(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, title TEXT NOT NULL, state_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id));
  CREATE TABLE IF NOT EXISTS experiments(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, project_id INTEGER, config_json TEXT NOT NULL, result_json TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS integrity_reports(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, project_id INTEGER, report_json TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS datasets(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, filename TEXT NOT NULL, filepath TEXT NOT NULL, columns_json TEXT NOT NULL, row_count INTEGER NOT NULL, created_at TEXT NOT NULL);
  """)
def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def current_user():
 uid=session.get("user_id")
 if not uid:return None
 with db() as c: return c.execute("SELECT id,name,email FROM users WHERE id=?",(uid,)).fetchone()
def auth_required(fn):
 @wraps(fn)
 def wrap(*a,**kw):
  if not current_user(): return jsonify(error="Sign in to access this endpoint."),401
  return fn(*a,**kw)
 return wrap
@app.route("/")
def index(): return send_from_directory("templates","index.html")
@app.get("/api/health")
def health(): return jsonify(status="ok",service="IRIS API",version="1.0.0",database=os.path.exists(DB))
@app.post("/api/auth/register")
def register():
 d=request.get_json(silent=True) or {}; name=str(d.get("name","")).strip(); email=str(d.get("email","")).strip().lower(); password=str(d.get("password",""))
 if len(name)<2 or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+",email) or len(password)<8:
  return jsonify(error="Enter a name, valid email, and password with at least 8 characters."),400
 try:
  with db() as c:
   cur=c.execute("INSERT INTO users(name,email,password_hash,created_at) VALUES(?,?,?,?)",(name,email,generate_password_hash(password),now()))
   session["user_id"]=cur.lastrowid
 except sqlite3.IntegrityError: return jsonify(error="An account with this email already exists."),409
 return jsonify(user={"name":name,"email":email}),201
@app.post("/api/auth/login")
def login():
 d=request.get_json(silent=True) or {}; email=str(d.get("email","")).strip().lower()
 with db() as c: u=c.execute("SELECT * FROM users WHERE email=?",(email,)).fetchone()
 if not u or not check_password_hash(u["password_hash"],str(d.get("password",""))): return jsonify(error="Incorrect email or password."),401
 session["user_id"]=u["id"]; return jsonify(user={"name":u["name"],"email":u["email"]})
@app.post("/api/auth/logout")
def logout(): session.clear(); return jsonify(ok=True)
@app.get("/api/auth/me")
def me():
 u=current_user()
 return (jsonify(user={"name":u["name"],"email":u["email"]}) if u else (jsonify(user=None),401))
@app.get("/api/projects")
@auth_required
def projects():
 u=current_user()
 with db() as c: rows=c.execute("SELECT id,title,updated_at FROM projects WHERE user_id=? ORDER BY updated_at DESC",(u["id"],)).fetchall()
 return jsonify(projects=[dict(r) for r in rows])
@app.post("/api/projects")
@auth_required
def create_project():
 d=request.get_json(silent=True) or {}; title=str(d.get("title","Untitled research project")).strip()[:180]
 u=current_user()
 with db() as c:
  cur=c.execute("INSERT INTO projects(user_id,title,state_json,updated_at) VALUES(?,?,?,?)",(u["id"],title,json.dumps(d.get("state",{})),now()))
 return jsonify(id=cur.lastrowid,title=title),201
@app.get("/api/projects/<int:pid>")
@auth_required
def get_project(pid):
 u=current_user()
 with db() as c:r=c.execute("SELECT * FROM projects WHERE id=? AND user_id=?",(pid,u["id"])).fetchone()
 if not r:return jsonify(error="Project not found."),404
 return jsonify(id=r["id"],title=r["title"],state=json.loads(r["state_json"]),updated_at=r["updated_at"])
@app.put("/api/projects/<int:pid>")
@auth_required
def update_project(pid):
 d=request.get_json(silent=True) or {}; u=current_user()
 with db() as c:
  cur=c.execute("UPDATE projects SET title=?,state_json=?,updated_at=? WHERE id=? AND user_id=?",(str(d.get("title","Research project"))[:180],json.dumps(d.get("state",{})),now(),pid,u["id"]))
 if not cur.rowcount:return jsonify(error="Project not found."),404
 return jsonify(ok=True,updated_at=now())
@app.get("/api/papers")
def search_papers():
 q=request.args.get("q","").strip().lower()
 if not q:return jsonify(papers=PAPERS[:])
 hits=[p for p in PAPERS if q in (p["title"]+" "+p["authors"]+" "+p["abstract"]+" "+p["venue"]).lower()]
 # Optional live Crossref lookup, with curated fallback if network is unavailable.
 try:
  import requests
  r=requests.get("https://api.crossref.org/works",params={"query.bibliographic":q,"rows":6},timeout=4,headers={"User-Agent":"IRISResearchPrototype/1.0"})
  if r.ok:
   for x in r.json().get("message",{}).get("items",[]):
    title=(x.get("title") or [""])[0]
    if not title: continue
    authors=", ".join(" ".join(filter(None,[a.get("given"),a.get("family")])) for a in x.get("author",[])[:4]) or "Authors listed by publisher"
    doi=x.get("DOI",""); url="https://doi.org/"+doi if doi else x.get("URL","")
    hits.append({"title":title,"authors":authors,"year":(x.get("published",{}).get("date-parts",[[None]])[0][0]),"venue":(x.get("container-title") or ["Crossref record"])[0],"doi":doi,"url":url,"abstract":re.sub("<[^>]+>"," ",x.get("abstract",""))[:1200]})
 except Exception: pass
 seen=set(); out=[]
 for p in hits:
  key=p["title"].lower()
  if key not in seen: seen.add(key);out.append(p)
 return jsonify(papers=out[:12],source="Curated prototype corpus + Crossref when reachable")
@app.post("/api/copilot")
def copilot():
 d=request.get_json(silent=True) or {}; question=str(d.get("question","")).strip(); context=str(d.get("context","")).strip()
 if not question:return jsonify(error="Enter a research question."),400
 # Try local Ollama if available. Fallback is clearly identified and retrieval-grounded.
 try:
  import requests
  prompt=("You are IRIS Research Copilot. Be concise, explain uncertainty, do not invent citations. "
          "Use this project context and retrieved references where relevant.\nContext:\n"+context[:7000]+"\nQuestion: "+question)
  r=requests.post(os.getenv("OLLAMA_URL","http://localhost:11434/api/generate"),json={"model":os.getenv("OLLAMA_MODEL","qwen2.5:3b"),"prompt":prompt,"stream":False},timeout=35)
  if r.ok:
   answer=r.json().get("response","").strip()
   if answer:return jsonify(answer=answer,mode="local-llm")
 except Exception: pass
 words=set(re.findall(r"[a-z0-9]+",question.lower()))
 ranked=sorted(PAPERS,key=lambda p:sum(1 for w in words if len(w)>3 and w in (p["title"]+" "+p["abstract"]).lower()),reverse=True)
 refs=[p for p in ranked[:3] if any(w in (p["title"]+" "+p["abstract"]).lower() for w in words if len(w)>3)]
 reftext="\n".join(f'• {p["title"]} ({p["year"]}) — {p["abstract"]} Source: {p["url"]}' for p in refs)
 answer=("I’m running in **retrieval-only prototype mode** because a local LLM is not configured. I can offer a grounded starting point, but this is not a substitute for expert review.\n\n"
         +(reftext+"\n\n" if reftext else "I couldn't find a strong match in the built-in reference set. Try adding a paper or narrowing the question.\n\n")
         +"**Suggested next steps**\n1. Define the claim or research question precisely.\n2. Compare methods, datasets, evaluation metrics and limitations in the source papers.\n3. Verify all claims against the linked full text before citing them.")
 return jsonify(answer=answer,mode="retrieval-fallback",references=[{"title":p["title"],"url":p["url"]} for p in refs])
@app.post("/api/datasets/upload")
@auth_required
def upload_dataset():
    f = request.files.get("file")
    if not f or not f.filename or not f.filename.lower().endswith(".csv"):
        return jsonify(error="Choose a CSV file."), 400
    u = current_user()
    safe = secure_filename(f.filename) or "dataset.csv"
    unique = uuid.uuid4().hex[:12] + "_" + safe
    path = os.path.join(UPLOAD_DIR, unique)
    try:
        f.save(path)
        with open(path, "r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            columns = reader.fieldnames or []
            if len(columns) < 2:
                raise ValueError("CSV needs at least two columns: features and a target label.")
            count = sum(1 for _ in reader)
        if count < 30:
            raise ValueError("CSV needs at least 30 data rows for a useful train/test split.")
        with db() as c:
            cur = c.execute("INSERT INTO datasets(user_id,filename,filepath,columns_json,row_count,created_at) VALUES(?,?,?,?,?,?)", (u["id"], safe, path, json.dumps(columns), count, now()))
        return jsonify(dataset_id=cur.lastrowid, filename=safe, columns=columns, suggested_target=columns[-1], rows=count), 201
    except Exception as e:
        try: os.remove(path)
        except OSError: pass
        return jsonify(error="Could not read CSV: " + str(e)), 400

@app.get("/api/datasets")
@auth_required
def list_datasets():
    u = current_user()
    with db() as c:
        rows = c.execute("SELECT id,filename,columns_json,row_count,created_at FROM datasets WHERE user_id=? ORDER BY id DESC", (u["id"],)).fetchall()
    return jsonify(datasets=[{"id": r["id"], "filename": r["filename"], "columns": json.loads(r["columns_json"]), "rows": r["row_count"], "created_at": r["created_at"]} for r in rows])

@app.post("/api/experiments/run")
@auth_required
def run_experiment():
 d=request.get_json(silent=True) or {}; model=d.get("model","Random Forest"); seed=int(d.get("seed",42)); test_size=float(d.get("test_size",0.25))
 if not .1<=test_size<=.4:return jsonify(error="Test size must be between 0.10 and 0.40."),400
 # Train on an uploaded CSV when dataset_id is supplied; otherwise use a clearly labelled synthetic benchmark.
 try:
  import numpy as np
  from sklearn.datasets import make_classification
  from sklearn.model_selection import train_test_split
  from sklearn.ensemble import RandomForestClassifier, ExtraTreesClassifier, GradientBoostingClassifier
  from sklearn.linear_model import LogisticRegression
  from sklearn.metrics import accuracy_score,precision_score,recall_score,f1_score,confusion_matrix
  dataset_label = "Synthetic generated classification benchmark"
  dataset_id = d.get("dataset_id")
  if dataset_id:
   u=current_user()
   with db() as c: ds=c.execute("SELECT * FROM datasets WHERE id=? AND user_id=?",(int(dataset_id),u["id"])).fetchone()
   if not ds:return jsonify(error="Dataset not found for this account."),404
   target=str(d.get("target") or json.loads(ds["columns_json"])[-1])
   with open(ds["filepath"],"r",encoding="utf-8-sig",newline="") as handle:
    reader=csv.DictReader(handle); rows=list(reader); cols=reader.fieldnames or []
   if target not in cols:return jsonify(error="Target column does not exist in this dataset."),400
   feature_cols=[col for col in cols if col!=target]; numeric_cols=[]
   for col in feature_cols:
    vals=[]
    for row in rows:
     try: vals.append(float(row.get(col,"")))
     except (ValueError,TypeError): vals.append(float("nan"))
    if sum(np.isfinite(vals)) >= max(30,int(len(rows)*0.5)): numeric_cols.append((col,vals))
   if not numeric_cols:return jsonify(error="No usable numeric feature columns found. Keep at least one numeric feature and a target column."),400
   clean_rows=[]; labels=[]
   for i,row in enumerate(rows):
    label=str(row.get(target,"")).strip()
    if not label: continue
    clean_rows.append([pair[1][i] for pair in numeric_cols]); labels.append(label)
   if len(set(labels))<2 or len(labels)<30:return jsonify(error="Target column needs at least two classes and 30 non-empty rows."),400
   X=np.asarray(clean_rows,dtype=float)
   from sklearn.impute import SimpleImputer
   X=SimpleImputer(strategy="median").fit_transform(X)
   from sklearn.preprocessing import LabelEncoder
   y=LabelEncoder().fit_transform(labels)
   if min(np.bincount(y)) < 2:return jsonify(error="Each target class needs at least two rows."),400
   Xtr,Xte,ytr,yte=train_test_split(X,y,test_size=test_size,random_state=seed,stratify=y)
   dataset_label=f"Uploaded CSV: {ds['filename']} · target: {target} · features: {', '.join(x[0] for x in numeric_cols)}"
  else:
   X,y=make_classification(n_samples=1600,n_features=12,n_informative=7,n_redundant=2,weights=[.65,.35],random_state=seed,class_sep=1.0)
   Xtr,Xte,ytr,yte=train_test_split(X,y,test_size=test_size,random_state=seed,stratify=y)
  choices={"Random Forest":RandomForestClassifier(n_estimators=120,random_state=seed,class_weight="balanced"),"Extra Trees":ExtraTreesClassifier(n_estimators=120,random_state=seed,class_weight="balanced"),"Gradient Boosting":GradientBoostingClassifier(random_state=seed),"Logistic Regression":LogisticRegression(max_iter=1000,class_weight="balanced",random_state=seed)}
  clf=choices.get(model,choices["Random Forest"]); clf.fit(Xtr,ytr); pred=clf.predict(Xte)
  result={"model":model,"seed":seed,"test_size":test_size,"samples":len(ytr)+len(yte),"accuracy":round(float(accuracy_score(yte,pred)),4),"precision":round(float(precision_score(yte,pred,average="weighted",zero_division=0)),4),"recall":round(float(recall_score(yte,pred,average="weighted",zero_division=0)),4),"f1":round(float(f1_score(yte,pred,average="weighted",zero_division=0)),4),"confusion_matrix":confusion_matrix(yte,pred).tolist(),"dataset":dataset_label,"note":"Metrics are computed on the held-out test split. Interpret them in the context of your dataset." if dataset_id else "Synthetic data only: illustrative pipeline validation, not real-world research evidence."}
 except Exception as e:return jsonify(error="Experiment engine failed. Check the CSV or install requirements. Details: "+str(e)),503
 u=current_user()
 with db() as c:c.execute("INSERT INTO experiments(user_id,config_json,result_json,created_at) VALUES(?,?,?,?)",(u["id"],json.dumps(d),json.dumps(result),now()))
 return jsonify(result=result)
@app.post("/api/integrity/check")
@auth_required
def integrity_check():
 d=request.get_json(silent=True) or {}; text=str(d.get("manuscript","")).strip()
 if len(text)<80:return jsonify(error="Paste at least 80 characters of manuscript text."),400
 words=re.findall(r"\b[\w'-]+\b",text); sentences=[x.strip() for x in re.split(r"(?<=[.!?])\s+",text) if x.strip()]
 citations=re.findall(r"\([^)]*(?:19|20)\d{2}[^)]*\)|\[\d+(?:,\s*\d+)*\]",text)
 refs=re.findall(r"(?im)^(?:references|bibliography)\s*$",text)
 flags=[]
 if len(words)<250:flags.append({"type":"Length","severity":"info","message":"Short manuscript sample: coverage is limited; assess the full paper."})
 if not citations:flags.append({"type":"Citation coverage","severity":"high","message":"No obvious author-year or numbered in-text citations detected. Verify claims that need sources."})
 if not refs:flags.append({"type":"Reference section","severity":"medium","message":"No standalone References/Bibliography heading detected."})
 if len(sentences)>3 and sum(len(re.findall(r"\b\w+\b",x)) for x in sentences)/len(sentences)>35:flags.append({"type":"Readability","severity":"medium","message":"Some sentences may be long; consider splitting complex claims."})
 # This is a heuristic only; no external corpus comparison or true novelty verification.
 report={"word_count":len(words),"sentence_count":len(sentences),"citation_markers":len(citations),"reference_heading_detected":bool(refs),"similarity_score":None,"novelty_score":None,"limitations":"This prototype does not compare against a complete scholarly corpus and cannot certify originality, plagiarism, citation truth, or novelty.","findings":flags,"status":"Needs human review" if flags else "Heuristic checks passed"}
 u=current_user()
 with db() as c:c.execute("INSERT INTO integrity_reports(user_id,report_json,created_at) VALUES(?,?,?)",(u["id"],json.dumps(report),now()))
 return jsonify(report=report)
@app.post("/api/integrity/rectify")
@auth_required
def rectify():
 d=request.get_json(silent=True) or {}; text=str(d.get("manuscript",""))
 if len(text)<20:return jsonify(error="Provide manuscript text to improve."),400
 # Safe editorial suggestions, not paraphrasing to evade similarity detection.
 improved=re.sub(r"[ \t]+"," ",text)
 improved=re.sub(r"\n{3,}","\n\n",improved).strip()
 suggestions=[]
 if not re.search(r"\([^)]*(?:19|20)\d{2}[^)]*\)|\[\d+",improved):suggestions.append("Add citations for externally sourced claims; never invent references.")
 if not re.search(r"(?im)^references\s*$",improved):suggestions.append("Add a References section and verify each DOI or publisher record.")
 suggestions.append("Check that every reported metric matches a saved experiment log and clearly label synthetic or preliminary results.")
 return jsonify(revised_text=improved,suggestions=suggestions,note="Only whitespace cleanup was applied automatically. No claims, citations, or research findings were fabricated.")
@app.get("/api/experiments/history")
@auth_required
def experiment_history():
 u=current_user()
 with db() as c:rows=c.execute("SELECT id,config_json,result_json,created_at FROM experiments WHERE user_id=? ORDER BY id DESC LIMIT 30",(u["id"],)).fetchall()
 return jsonify(runs=[{"id":r["id"],"config":json.loads(r["config_json"]),"result":json.loads(r["result_json"]),"created_at":r["created_at"]} for r in rows])
@app.get("/api/publication/venues")
def venues():
 return jsonify(venues=[
 {"name":"PLOS ONE","type":"Journal","url":"https://journals.plos.org/plosone/","fit":"Broad multidisciplinary; check current scope and fees"},
 {"name":"PeerJ Computer Science","type":"Journal","url":"https://peerj.com/computer-science/","fit":"Computer science and software research"},
 {"name":"ACM Computing Surveys","type":"Journal","url":"https://dl.acm.org/journal/csur","fit":"Survey and review contributions"},
 {"name":"IEEE Access","type":"Journal","url":"https://ieeeaccess.ieee.org/","fit":"Multidisciplinary engineering and technology"}
 ],note="Recommendations are broad scope suggestions, not acceptance predictions. Verify fees, indexing, scope, deadlines and current author guidelines on official pages.")
@app.errorhandler(404)
def not_found(e):
 if request.path.startswith("/api/"):return jsonify(error="API endpoint not found."),404
 return e
init_db()
if __name__=="__main__":
 app.run(host="127.0.0.1",port=int(os.getenv("PORT","5000")),debug=os.getenv("FLASK_DEBUG")=="1")
