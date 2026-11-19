// Dagdeep Quest: learn by playing. World map → zones → levels → rounds.
// Zone content lives in zones/<id>.js and calls QUEST.zone(id, {mission, levels}).
// Round formats (arrays keep content files compact):
//   ["learn", title, body, flow?[], code?]        concept power-up card (collected into the zone's deck)
//   ["pick", question, options[], answerIdx, why, code?]
//   ["sort", prompt, {bucket:[items]}, why]
//   ["order", prompt, stepsInOrder[], why]
//   ["match", prompt, [[term, meaning]...], why]
//   ["fill", prompt, template with ___ blanks, answers[], decoys[], why]
//   ["bug", prompt, lines[], badIdx, why]
//   ["tf", prompt, [[statement, bool, why]...]]
// Level: {t, sub, rounds[]} | {t, sub, arcade:"gameId"} | {t, sub, boss:true, time:secs, rounds[]}
(function(){
const WORLDS = [
  {id:"de", title:"Data Engineering", sub:"Engines, streams, lakes and databases. Fix real pipelines by playing.", hue:28},
  {id:"ai", title:"AI Engineering", sub:"LLMs, RAG, agents, MCP, security and tuning. Build AI systems by playing.", hue:265}
];
const ZONES = [
  ["spark","de","Spark","Plans, partitions, shuffles, joins, skew, memory",28,"Sp"],
  ["kafka","de","Kafka","Logs, partitions, replication, consumers, exactly-once",0,"Kf"],
  ["debezium","de","Debezium CDC","Binlogs, WAL, snapshots, events, outbox",140,"Dz"],
  ["aws","de","AWS data stack","S3, Glue, Athena, DynamoDB",35,"Aw"],
  ["iceberg","de","Apache Iceberg","Snapshots, manifests, hidden partitions, maintenance",200,"Ib"],
  ["redshift","de","Redshift","Distribution, sort keys, COPY, WLM, Spectrum",350,"Rs"],
  ["snowflake","de","Snowflake","Warehouses, micro-partitions, Time Travel, Streams",195,"Sf"],
  ["databricks","de","Databricks","Delta Lake, Unity Catalog, Auto Loader, Photon",12,"Db"],
  ["dbt","de","dbt","Models, ref, incremental, tests, snapshots",20,"dt"],
  ["starrocks","de","StarRocks","MPP, table models, MVs, Routine Load, lake queries",265,"St"],
  ["cassandra","de","Cassandra","Partition keys, ring, consistency, compaction",210,"Cs"],
  ["mysql","de","MySQL","InnoDB, indexes, locks, binlog, replication",205,"My"],
  ["postgres","de","PostgreSQL","MVCC, VACUUM, WAL, indexes, planner",225,"Pg"],
  ["mongodb","de","MongoDB","Documents, ESR indexes, replica sets, sharding",130,"Mg"],
  ["llm","ai","LLM fundamentals","Tokens, sampling, context, structured output",300,"Lm"],
  ["rag","ai","RAG","Chunking, embeddings, hybrid search, reranking, evals",170,"Rg"],
  ["langchain","ai","LangChain","Runnables, prompts, tools, structured output",150,"Lc"],
  ["langgraph","ai","LangGraph","State graphs, reducers, checkpoints, interrupts",250,"Lg"],
  ["langsmith","ai","LangSmith","Traces, datasets, evaluators, experiments",320,"Ls"],
  ["agents","ai","Agentic AI","Agent loops, workflows, memory, multi-agent",280,"Ag"],
  ["mcp","ai","MCP","Hosts, clients, servers, tools, transports, auth",190,"Mc"],
  ["claudecode","ai","Claude Code","CLAUDE.md, skills, subagents, hooks, MCP",22,"Cc"],
  ["aiattack","ai","Security of AI","How AI systems get attacked: OWASP LLM Top 10",355,"At"],
  ["aidefense","ai","Security for AI","Guardrails, least privilege, sandboxing, red-teaming",120,"Df"],
  ["observability","ai","AI observability","Traces, metrics, online evals, cost",60,"Ob"],
  ["tuning","ai","Fine-tuning","SFT, LoRA, QLoRA, DPO, evaluation",330,"Ft"]
].map(([id, world, title, short, hue, mono], i) => ({id, world, title, short, hue, mono, n:i}));
const ZMAP = Object.fromEntries(ZONES.map(z => [z.id, z]));
const RANKS = [[0,"Intern"],[300,"Junior engineer"],[900,"Engineer"],[2000,"Senior engineer"],[4000,"Staff engineer"],[7000,"Principal"],[11000,"Distinguished"]];
const CAST = {priya:["Priya","Tech lead",205], arjun:["Arjun","Finance",28], ravi:["Ravi","On-call SRE",340], meera:["Meera","Analyst",95], kai:["Kai","AI lead",265], sana:["Sana","Security",355], dev:["Dev","Platform",150], you:["You","Engineer",300], ana:["Ananya","Interviewer · Staff Data Engineer",320], farah:["Farah","Interviewer · Principal Engineer",30], rohit:["Rohit","Interviewer · AI Platform Lead",190]};

const Q = window.QUEST = {data:{}, zones:ZONES, zone(id, def){ this.data[id] = def; }, more(id, levels){ const Z = this.data[id]; if (Z) Z.levels.push(...levels); }};
const ld = (k, d) => { try { return Object.assign(d, JSON.parse(localStorage.getItem(k)) || {}); } catch(e){ return d; } };
const raw = k => { try { return JSON.parse(localStorage.getItem(k)); } catch(e){ return null; } };
const DEF_P = () => ({stars:{}, cards:{}, lv:{}, last:null, ms:{}, iv:{}, cs:{}, wk:{}, sd:{}, ach:{}, chest:{}});
const DEF_PR = () => ({xp:0, streak:0, last:null});
let NS = "";
const KQ = () => "dagdeep-quest-v1" + NS, KP = () => "dagdeep-profile-v1" + NS;
const P = Object.assign(DEF_P(), raw(KQ()) || {});
const PR = Object.assign(DEF_PR(), raw(KP()) || {});
Q.progress = P;
const swap = (o, n) => { Object.keys(o).forEach(k => delete o[k]); Object.assign(o, n); };
let cloudT = 0;
const save = () => {
  try { localStorage.setItem(KQ(), JSON.stringify(P)); localStorage.setItem(KP(), JSON.stringify(PR)); } catch(e){}
  if (Q.cloud){ clearTimeout(cloudT); cloudT = setTimeout(() => Q.cloud.save({quest:P, profile:PR}), 1200); }
};
const rerender = () => { if (typeof route === "function") route(); };
Q.account = null;
// Called by auth.js after Google sign-in. cloud = {quest, profile} from Firestore or null.
// Progress can come from localStorage, Firestore or an imported file. Keep only plain data:
// keys and strings limited to safe id characters, finite numbers, booleans. Anything else is dropped.
const SAFE = /^[\w:.\- ]{0,80}$/;
const clean = (v, d = 0) => {
  if (d > 6) return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return SAFE.test(v) ? v : undefined;
  if (Array.isArray(v)) return v.slice(0, 2000).map(x => clean(x, d + 1)).filter(x => x !== undefined);
  if (v && typeof v === "object"){ const o = {}; Object.keys(v).slice(0, 2000).forEach(k => { if (SAFE.test(k) && k !== "__proto__" && k !== "constructor" && k !== "prototype"){ const c = clean(v[k], d + 1); if (c !== undefined) o[k] = c; } }); return o; }
  return undefined;
};
const cleanP = q => Object.assign(DEF_P(), clean(q || {}) || {});
const cleanPR = pr => { const o = Object.assign(DEF_PR(), clean(pr || {}) || {}); o.xp = Math.max(0, Math.min(1e7, +o.xp || 0)); o.streak = Math.max(0, Math.min(1e4, +o.streak || 0)); return o; };
swap(P, cleanP(P)); swap(PR, cleanPR(PR));
Q.useAccount = (user, cloud) => {
  const gq = raw("dagdeep-quest-v1"), gp = raw("dagdeep-profile-v1");
  NS = ":" + user.uid; Q.account = user;
  let q = cloud && cloud.quest, pr = cloud && cloud.profile;
  if (!q){
    const lq = raw(KQ()), lp = raw(KP());
    if (lq){ q = lq; pr = lp; }
    else if (gp && gp.xp > 0){ q = gq; pr = gp; setTimeout(() => toast("Your guest progress moved into your account"), 400); }
  }
  swap(P, cleanP(q)); swap(PR, cleanPR(pr));
  save(); drawAcct(); rerender();
};
Q.useGuest = () => {
  NS = ""; Q.account = null; Q.cloud = null;
  swap(P, cleanP(raw(KQ()))); swap(PR, cleanPR(raw(KP())));
  drawAcct(); rerender();
};
Q.toastMsg = m => toast(m);
Q.reset = () => { swap(P, DEF_P()); swap(PR, DEF_PR()); save(); rerender(); toast("Fresh start — all progress cleared"); };
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const fm = t => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).,:;!?]|$)/g, "$1<i>$2</i>").replace(/«(.+?)»/g, "<code>$1</code>").replace(/\n/g, "<br>");
// Deep text, line-based: "### " headings, "- " bullets, "~~~" code fences, "| a | b |" tables, blank lines split paragraphs.
const md = t => {
  const L = String(t || "").split("\n"), out = []; let i = 0;
  const special = l => /^\d+\.\s/.test(l) || l.startsWith("![") || l.startsWith("~~~") || l.startsWith("### ") || l.startsWith("- ") || l.trim().startsWith("|") || !l.trim();
  while (i < L.length){
    const l = L[i];
    if (!l.trim()){ i++; continue; }
    if (l.startsWith("~~~")){ const buf = []; i++; while (i < L.length && !L[i].startsWith("~~~")) buf.push(L[i++]); i++; out.push(`<pre class="q-code">${esc(buf.join("\n"))}</pre>`); continue; }
    if (l.startsWith("### ")){ out.push(`<h4>${fm(l.slice(4))}</h4>`); i++; continue; }
    { const im = l.match(/^!\[(.*)\]\((.+)\)$/); if (im){ out.push(shot(im[2], im[1])); i++; continue; } }
    if (/^\d+\.\s/.test(l)){ const buf = []; while (i < L.length && /^\d+\.\s/.test(L[i])) buf.push(L[i++].replace(/^\d+\.\s/, "")); out.push(`<ol>${buf.map(x => `<li>${fm(x)}</li>`).join("")}</ol>`); continue; }
    if (l.startsWith("- ")){ const buf = []; while (i < L.length && L[i].startsWith("- ")) buf.push(L[i++].slice(2)); out.push(`<ul>${buf.map(x => `<li>${fm(x)}</li>`).join("")}</ul>`); continue; }
    if (l.trim().startsWith("|")){
      const buf = []; while (i < L.length && L[i].trim().startsWith("|")) buf.push(L[i++].trim());
      const rows = buf.filter(x => !/^\|[\s:|-]+\|$/.test(x)).map(x => x.replace(/^\||\|$/g, "").split("|").map(c => c.trim()));
      out.push(`<div class="q-tw"><table><thead><tr>${rows[0].map(x => `<th>${fm(x)}</th>`).join("")}</tr></thead><tbody>${rows.slice(1).map(r => `<tr>${r.map(x => `<td>${fm(x)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }
    const buf = []; while (i < L.length && !special(L[i])) buf.push(L[i++]);
    out.push(`<p>${buf.map(fm).join(" ")}</p>`);
  }
  return out.join("");
};
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
// shuffle a list of options in place; returns the new index of the answer at old index a
const mix = (arr, a) => { const o = shuffle(arr.map((x, i) => i)), copy = arr.slice(); o.forEach((j, k) => arr[k] = copy[j]); return a == null ? null : o.indexOf(a); };
const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const root = () => document.getElementById("cRoot");
const rank = xp => { let r = RANKS[0], nx = null; for (let i = 0; i < RANKS.length; i++){ if (xp >= RANKS[i][0]){ r = RANKS[i]; nx = RANKS[i + 1] || null; } } return {name:r[1], at:r[0], next:nx}; };
const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.3C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.4.7-1.2 2.2-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.2C19.5 16.4 12 21 12 21z" fill="currentColor"/></svg>';
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z" fill="currentColor"/></svg>';
const stars = (n, cls = "") => `<span class="q-stars ${cls}">${[0,1,2].map(i => `<span class="${i < n ? "on" : ""}" style="--i:${i}">${STAR}</span>`).join("")}</span>`;
const zStars = id => Object.values(P.stars[id] || {}).reduce((a, b) => a + b, 0);
const zCards = id => (P.cards[id] || []).length;

function toast(html){
  const t = document.createElement("div"); t.className = "q-toast"; t.innerHTML = html; document.body.appendChild(t);
  setTimeout(() => t.classList.add("out"), 2200); setTimeout(() => t.remove(), 2700);
}
function confetti(){
  if (reduce()) return;
  const cv = document.createElement("canvas"); cv.className = "q-confetti"; document.body.appendChild(cv);
  const W = cv.width = innerWidth, H = cv.height = innerHeight, c = cv.getContext("2d");
  const ps = Array.from({length:120}, () => ({x:W / 2, y:H * .35, vx:(Math.random() - .5) * 14, vy:-Math.random() * 12 - 4, s:4 + Math.random() * 5, h:Math.random() * 360, r:Math.random() * 6}));
  let f = 0; const step = () => { c.clearRect(0, 0, W, H); ps.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += .35; p.r += .2; c.save(); c.translate(p.x, p.y); c.rotate(p.r); c.fillStyle = `hsl(${p.h} 85% 55%)`; c.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * .6); c.restore(); }); if (++f < 110) requestAnimationFrame(step); else cv.remove(); };
  step();
}
function addXP(n){
  const before = rank(PR.xp).name; PR.xp += n;
  const today = new Date().toISOString().slice(0, 10);
  if (PR.last !== today){ const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10); PR.streak = PR.last === y ? (PR.streak || 0) + 1 : 1; PR.last = today; }
  save(); if ((PR.streak || 0) >= 3) unlock("streak3");
  const after = rank(PR.xp).name;
  if (after !== before){ toast(`Promoted to <b>${esc(after)}</b>`); confetti(); }
}
function needZone(id, cb){
  if (Q.data[id]) return cb();
  const s = document.createElement("script"); s.src = `zones/${id}.js`;
  s.onload = () => cb(); s.onerror = () => { root().innerHTML = `<div class="q-wrap"><p class="q-empty">Couldn't load this zone. Check your connection and refresh.</p><a class="btn" href="#play">Back to the map</a></div>`; };
  document.head.appendChild(s);
}
const unlocked = (id, li) => li === 0 || (P.stars[id] || {})[li - 1] > 0;

/* ================= Achievements ================= */
const ACH = [
  ["first","🎬","Opening night","Finish your first story mission"],
  ["flawless","💎","Flawless","Three stars on a mission"],
  ["comeback","🔥","Comeback kid","Finish a mission after 3+ wrong calls"],
  ["owl","🦉","Night owl","Play a mission between 11 PM and 4 AM"],
  ["twist","⚡","Plot armour","Nail a plot-twist question"],
  ["collector","🃏","Collector","Collect 10 concept cards"],
  ["hired","🤝","Hired!","Get a Strong hire in a mock interview"],
  ["lucky","🌟","Lucky chest","Find a rare drop in a mystery chest"],
  ["streak3","📅","On a roll","Play 3 days in a row"],
  ["fresh","🔄","Clean slate","Start fresh from scratch"],
  ["pager","📟","Pager hero","Resolve your first on-call incident"],
  ["sherlock","🔎","Sherlock","Resolve an incident with no hints and no wrong calls"],
  ["allround","💼","All-rounder","Finish one of every work-simulator type"]
];
function unlock(k){
  if (!P.ach || P.ach[k]) return;
  const a = ACH.find(x => x[0] === k); if (!a) return;
  P.ach[k] = Date.now(); save();
  const t = document.createElement("div"); t.className = "q-achtoast";
  t.innerHTML = `<span class="q-ach-ic">${a[1]}</span><div><small>Trophy unlocked</small><b>${esc(a[2])}</b><p>${esc(a[3])}</p></div>`;
  document.body.appendChild(t); setTimeout(() => t.classList.add("out"), 3600); setTimeout(() => t.remove(), 4200);
}
const totalCards = () => Object.values(P.cards || {}).reduce((a, l) => a + l.length, 0);

/* ================= Account ================= */
const GICON = '<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>';
const avatar = u => u && u.photoURL ? `<img src="${esc(u.photoURL)}" alt="" referrerpolicy="no-referrer">` : `<span>${esc(((u && (u.displayName || u.email)) || "?")[0].toUpperCase())}</span>`;
function drawAcct(){
  const bar = document.querySelector(".appbar-in"); if (!bar) return;
  let b = document.getElementById("qAcct");
  if (!b){ b = document.createElement("button"); b.id = "qAcct"; b.className = "q-acctbtn"; b.type = "button"; bar.appendChild(b); b.onclick = e => { e.stopPropagation(); acctPanel(); }; }
  const u = Q.account;
  b.innerHTML = u ? `<span class="q-av-sm">${avatar(u)}</span>` : `${GICON}<span>Sign in</span>`;
  b.setAttribute("aria-label", u ? "Account" : "Sign in");
}
function acctPanel(confirmReset){
  let p = document.getElementById("qAcctPanel");
  if (p && !confirmReset){ p.remove(); return; }
  if (!p){ p = document.createElement("div"); p.id = "qAcctPanel"; p.className = "q-acctpanel"; p.setAttribute("role", "dialog"); p.setAttribute("aria-label", "Account"); document.body.appendChild(p); }
  const u = Q.account, A = window.DAGDEEP_AUTH || {state:"loading"}, r = rank(PR.xp), sy = Q.sync || {};
  const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "just now" : m < 60 ? m + " min ago" : Math.round(m / 60) + " h ago"; };
  const syncLine = !u ? "Sign in to keep your progress and sync it across devices."
    : sy.state === "error" ? `⚠️ Sync failed${sy.code ? ` (${esc(sy.code)})` : ""}. Progress is still saved on this device.`
    : sy.state === "ok" ? `☁️ Synced to your Google account · ${ago(sy.at)}` : "☁️ Syncing…";
  let signInUI = "";
  if (!u){
    if (A.inApp) signInUI = `<p class="q-ap-note">Google doesn't allow sign-in inside in-app browsers (LinkedIn, Instagram…). Open this page in Chrome or Safari to sign in.</p><button class="btn big" data-a="copy">📋 Copy link</button>`;
    else if (A.state === "off") signInUI = `<button class="btn big q-gbtn" disabled>${GICON}<span>Continue with Google</span></button><p class="q-ap-note">Sign-in isn't switched on for this site yet. Your progress is saved on this device, and you can move it with Export / Import below.</p>`;
    else if (A.state === "failed") signInUI = `<button class="btn big q-gbtn" disabled>${GICON}<span>Continue with Google</span></button><p class="q-ap-note">${esc(A.error)}</p>`;
    else signInUI = `<button class="btn big q-gbtn" data-a="in" ${A.state === "ready" ? "" : "disabled"}>${GICON}<span>${A.state === "ready" ? "Continue with Google" : "Connecting…"}</span></button><p class="q-ap-err" role="alert"></p>`;
  }
  p.innerHTML = confirmReset ? `<p class="q-ap-h">Start fresh?</p><p class="muted">This clears XP, stars, cards and trophies ${u ? "for <b>" + esc(u.displayName || u.email) + "</b>" : "on this device"}. It can't be undone.</p>
      <button class="btn big solid q-danger" data-a="doreset">Yes, start from scratch</button><button class="btn big" data-a="cancel">Cancel</button>`
    : `<div class="q-ap-me">${u ? `<span class="q-av-md">${avatar(u)}</span><div><b>${esc(u.displayName || "Signed in")}</b><small>${esc(u.email || "")}</small></div>` : `<span class="q-av-md"><span>👤</span></span><div><b>Playing as guest</b><small>Progress is saved on this device</small></div>`}</div>
      <p class="q-ap-sync">${syncLine}</p>
      <div class="q-ap-stats"><span><b>${esc(r.name)}</b><small>rank</small></span><span><b>${PR.xp}</b><small>XP</small></span><span><b>${totalCards()}</b><small>cards</small></span></div>
      ${u ? `<button class="btn big" data-a="out">Sign out</button>` : signInUI}
      <div class="q-ap-row"><button class="btn" data-a="export">⬇️ Export progress</button><button class="btn" data-a="import">⬆️ Import</button></div>
      <button class="btn big q-reset" data-a="reset">🔄 Start fresh</button>`;
  if (!u && A.state === "loading") setTimeout(() => { if (document.body.contains(p) && !confirmReset && (window.DAGDEEP_AUTH || {}).state !== "loading"){ p.remove(); acctPanel(); } }, 700);
  p.onclick = async e => {
    e.stopPropagation();
    const a = e.target.closest("[data-a]"); if (!a) return;
    const act = a.dataset.a, err = p.querySelector(".q-ap-err");
    if (act === "in" && A.signIn){
      a.disabled = true; a.querySelector("span").textContent = "Opening Google…";
      try { await A.signIn(); p.remove(); }
      catch(x){ a.disabled = false; a.querySelector("span").textContent = "Continue with Google"; if (err) err.textContent = A.message(x); }
    }
    if (act === "out"){ if (A.signOut) await A.signOut(); p.remove(); toast("Signed out. Playing as guest."); }
    if (act === "copy"){ try { await navigator.clipboard.writeText(location.href); toast("Link copied. Paste it into your browser."); } catch(x){ toast(location.href); } }
    if (act === "export"){
      const blob = new Blob([JSON.stringify({app:"dagdeep", v:1, at:new Date().toISOString(), quest:P, profile:PR}, null, 1)], {type:"application/json"});
      const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `dagdeep-progress-${new Date().toISOString().slice(0, 10)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 2000);
    }
    if (act === "import"){
      const f = document.createElement("input"); f.type = "file"; f.accept = "application/json,.json";
      f.onchange = async () => { try { const d = JSON.parse(await f.files[0].text()); if (d.app !== "dagdeep" || !d.quest) throw 0;
        swap(P, cleanP(d.quest)); swap(PR, cleanPR(d.profile)); save(); p.remove(); rerender(); drawAcct(); toast("Progress imported ✓"); }
        catch(x){ toast("That file isn't a Dagdeep progress export"); } };
      f.click();
    }
    if (act === "reset") acctPanel(true);
    if (act === "cancel") acctPanel(false);
    if (act === "doreset"){ p.remove(); Q.reset(); unlock("fresh"); }
  };
}
document.addEventListener("click", e => { const p = document.getElementById("qAcctPanel"); if (p && !p.contains(e.target)) p.remove(); });

/* ================= Map ================= */
let worldTab = "de";
function nextUp(){
  // first unfinished story mission, preferring the zone played last
  const order = [P.last, "spark", "kafka", "rag"].filter((z, i, a) => z && STORY.has(z) && a.indexOf(z) === i);
  for (const z of order){
    const Z = Q.data[z], done = P.ms[z] || {};
    const n = Z && Z.missions ? Z.missions.length : 3;
    for (let i = 0; i < n; i++) if (!done[i]) return {z, i, M:Z && Z.missions ? Z.missions[i] : null};
  }
  return null;
}
function mapView(){
  document.title = "Play · Dagdeep";
  const r = rank(PR.xp), pct = r.next ? (PR.xp - r.at) / (r.next[0] - r.at) * 100 : 100;
  const name = Q.account && Q.account.displayName ? Q.account.displayName.split(" ")[0] : "";
  const nx = nextUp(), achN = Object.keys(P.ach || {}).length;
  const tile = z => { const lv = P.lv[z.id], s = zStars(z.id), ms = Object.keys(P.ms[z.id] || {}).length; return `<a class="q-zone" href="#zone-${z.id}" style="--h:${z.hue}">
      <span class="q-mono">${esc(z.mono)}</span><span class="q-zone-t"><b>${esc(z.title)}</b><small>${esc(z.short)}</small></span>
      ${STORY.has(z.id) ? `<em class="q-badge">🎬 Story</em>` : ""}
      <span class="q-mini"><span style="width:${lv ? Math.min(100, (s + ms * 6) / (lv * 3 + 18) * 100) : 0}%"></span></span></a>`; };
  root().innerHTML = `<div class="q-wrap q-home">
    <section class="q-hello">
      <p class="q-eyebrow">${name ? "Welcome back" : "Dagdeep"}</p>
      <h1>${name ? `Hi ${esc(name)} 👋` : "Learn data &amp; AI engineering by playing"}</h1>
      <p class="muted">Real situations, real decisions, interview-ready answers. <a class="q-aboutl" href="#about">What is this?</a></p>
      <div class="q-statrow"><span><b>${esc(r.name)}</b><small>rank</small></span><span><b>${PR.xp.toLocaleString()}</b><small>XP</small></span><span><b>${PR.streak || 0}</b><small>day streak</small></span><span><b>${achN}/${ACH.length}</b><small>trophies</small></span></div>
      <div class="q-bar" title="${r.next ? (r.next[0] - PR.xp) + " XP to " + r.next[1] : ""}"><span style="width:${pct}%"></span></div>
    </section>
    ${nx ? `<a class="q-next" id="qNext" href="#mis-${nx.z}-${nx.i}"><span class="q-next-ic">${nx.M ? nx.M.icon : "🎬"}</span><div><small>${nx.i ? "Continue" : "Start here"} · ${esc(ZMAP[nx.z].title)} · mission ${nx.i + 1}</small><b>${nx.M ? esc(nx.M.title) : "Story mission"}</b>${nx.M ? `<p>${fm(nx.M.setup)}</p>` : ""}</div><span class="q-next-go">▶</span></a>` : ""}
    ${homeWork()}
    <div class="q-homepair"><a class="q-ivhome" href="#interview"><span>🎤</span><div><b>Mock interviews</b><small>A full round for every topic, with model answers</small></div><span class="q-next-go">▶</span></a>
    <a class="q-ivhome" href="#design"><span>🏗️</span><div><b>System design</b><small>Design rounds, architectures and project ideas</small></div><span class="q-next-go">▶</span></a></div>
    <h2 class="q-sec-h">🗺️ Zones</h2>
    <div class="q-tabs" role="tablist">${WORLDS.map(w => `<button role="tab" data-w="${w.id}" aria-selected="${worldTab === w.id}">${w.id === "de" ? "🗄️" : "🤖"} ${esc(w.title)}</button>`).join("")}</div>
    <div class="q-zones">${ZONES.filter(z => z.world === worldTab).map(tile).join("")}</div>
    <details class="q-trophies"><summary>🏆 Trophies <small>${achN}/${ACH.length}</small></summary>
      <div class="q-achs">${ACH.map(a => P.ach[a[0]] ? `<div class="q-ach on"><span>${a[1]}</span><b>${esc(a[2])}</b><small>${esc(a[3])}</small></div>` : `<div class="q-ach"><span>❔</span><b>Secret trophy</b><small>Keep playing to discover it</small></div>`).join("")}</div></details>
  </div>`;
  root().querySelectorAll(".q-tabs button").forEach(b => b.onclick = () => { worldTab = b.dataset.w; mapView(); });
  if (nx && !nx.M) needZone(nx.z, () => { if (document.getElementById("qNext")) mapView(); });
}

/* ================= Zone ================= */
function zoneView(id, tab){
  const z = ZMAP[id]; if (!z){ location.hash = "#play"; return; }
  needZone(id, () => {
    const Z = Q.data[id]; P.last = id; P.lv[id] = Z.levels.length; save();
    document.title = `${z.title} · Dagdeep`;
    const tabs = [];
    if (Z.missions) tabs.push(["missions", "🎬 Missions"]);
    if (Z.cases || Z.work || ALLW().some(c => c.z === id)) tabs.push(["debug", "💼 Work"]);
    if (Z.interviews) tabs.push(["interview", "🎤 Interview"]);
    tabs.push(["drills", "🏋️ Drills"], ["cards", "🃏 Cards"]);
    if (!tabs.some(t => t[0] === tab)) tab = tabs[0][0];
    const got = new Set(P.cards[id] || []);
    root().innerHTML = `<div class="q-wrap q-zonev" style="--h:${z.hue}">
      <a class="q-back" href="#play">← All zones</a>
      <header class="q-zhead"><span class="q-mono big">${esc(z.mono)}</span><div><h1>${esc(z.title)}</h1><p class="muted">${esc(z.short)}</p></div></header>
      <div class="q-tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" data-t="${k}" aria-selected="${k === tab}">${l}</button>`).join("")}</div>
      <div class="q-panel">${zonePanel(id, Z, tab, got)}</div></div>`;
    root().querySelectorAll(".q-tabs button").forEach(b => b.onclick = () => { history.replaceState(null, "", `#zone-${id}/${b.dataset.t}`); zoneView(id, b.dataset.t); });
    root().querySelectorAll(".q-card.got").forEach(b => b.onclick = () => b.classList.toggle("open"));
  });
}
function epList(id, list, kind){
  return `<div class="q-eps">${list.map((M, i) => { const s = (P[kind][id] || {})[i] || 0, open = kind === "iv" || msOpen(id, i), href = `#${kind === "iv" ? "iv" : "mis"}-${id}-${i}`;
    return `<${open ? `a href="${href}"` : "div"} class="q-ep ${open ? "" : "locked"} ${s ? "done" : ""}"><span class="q-ep-ic">${open ? (M.icon || "🎬") : "🔒"}</span>
      <div class="q-ep-t"><small>${kind === "iv" ? "Mock interview" : "Mission " + (i + 1)}${M.place ? " · " + esc(M.place) : ""}</small><b>${esc(M.title)}</b><p>${fm(M.setup || "")}</p>${s ? stars(s, "sm") : ""}</div>
      <span class="q-ep-go">${open ? (s ? "Replay" : "Play") : ""}</span></${open ? "a" : "div"}>`; }).join("")}</div>`;
}
function zonePanel(id, Z, tab, got){
  if (tab === "debug") return `<p class="q-lead">Real tasks from the job: incidents, PR reviews, log hunts, tuning, postmortems and triage.</p>${workList(ALLW().filter(c => c.z === id))}`;
  if (tab === "missions") return `<p class="q-lead">Real situations from a working day. Make the calls, watch the meters, collect detailed cards.</p>${epList(id, Z.missions, "ms")}`;
  if (tab === "interview"){
    const qa = [];
    (Z.interviews || []).forEach(M => M.steps.forEach(S => { if (S.choose && S.model) qa.push([S.choose, S.model]); }));
    return `<p class="q-lead">Practise the conversation, not just the facts. Pick the answer you'd give; the interviewer tells you how it lands.</p>${epList(id, Z.interviews, "iv")}
      <h2 class="q-sec-h">📋 Cheat sheet</h2><p class="muted">Model answers you can say out loud. Tap a question.</p>
      <div class="q-qa">${qa.map(([q, a]) => `<details><summary>${fm(q)}</summary><div>${md(a)}</div></details>`).join("")}
      ${Z.cardBook ? Object.values(Z.cardBook).map(C => `<details><summary>Explain: ${fm(C.t)}</summary><div><p>${fm(C.say || "")}</p></div></details>`).join("") : ""}</div>`;
  }
  if (tab === "drills") return `<p class="q-lead">Quick-fire rounds to lock in what the missions taught.</p>
    <ol class="q-path">${Z.levels.map((L, li) => { const head = L.act && (li === 0 || Z.levels[li - 1].act !== L.act) ? `<li class="q-act"><span>${esc(L.act)}</span></li>` : ""; const s = (P.stars[id] || {})[li] || 0, open = unlocked(id, li), kind = L.boss ? "boss" : L.arcade ? "arcade" : "q-lv";
      return head + `<li class="q-node ${kind} ${L.act ? "expert" : ""} ${s ? "done" : ""} ${open ? "" : "locked"}" style="--i:${li}">
        ${open ? `<a href="#lvl-${id}-${li}" class="q-dot">` : `<span class="q-dot">`}${L.boss ? "👑" : L.arcade ? "🕹" : li + 1}${open ? "</a>" : "</span>"}
        <div class="q-node-l"><b>${esc(L.t)}</b><small>${L.boss ? (L.act ? "Expert boss" : "Boss fight") : L.arcade ? "Arcade" : `${(L.rounds || []).length} rounds`}${(L.rounds || []).some(r => r[0] === "learn") ? ` · <a class="q-readl" href="#learn-${id}-${li}">📖 Read</a>` : ""}${ALLW().some(c => (c.study || []).includes(`${id}:${li}`)) ? ` · <a class="q-readl" href="#learn-${id}-${li}">💼 At work</a>` : ""}</small>${stars(s, "sm")}</div></li>`; }).join("")}</ol>`;
  // cards
  const deck = [];
  Z.levels.forEach((L, li) => (L.rounds || []).forEach((r, ri) => { if (r[0] === "learn") deck.push({id:`${li}-${ri}`, li, t:r[1], b:r[2], d:r[5], L}); }));
  let h = "";
  if (Z.cardBook){
    const where = cardMissionIndex(Z), keys = Object.keys(Z.cardBook), have = keys.filter(k => got.has("c:" + k));
    h += `<h2 class="q-sec-h">Story cards <small>${have.length}/${keys.length}</small></h2><p class="muted">Analogy, how it works, worked example, gotchas and an interview answer.</p>
      <div class="q-xcards">${keys.map(k => { const C = Z.cardBook[k]; return got.has("c:" + k) ? `<details class="q-xcd"><summary><b>${fm(C.t)}</b><small>${fm(C.one || "")}</small></summary>${cardHTML(C, "deck")}</details>` : `<div class="q-xcd lock"><b>?</b><small>${where[k] != null ? `Unlock in mission ${where[k] + 1}` : "Unlock on the on-call desk"}</small></div>`; }).join("")}</div>`;
  }
  h += `<h2 class="q-sec-h">Drill cards <small>${deck.filter(c => got.has(c.id)).length}/${deck.length}</small></h2>
    <div class="q-cards">${deck.map(c => got.has(c.id) ? `<button class="q-card got" type="button"><span class="q-card-k">${esc(c.L.t)}</span><b>${esc(c.t)}</b><span class="q-card-b">${fm(c.b)}</span>${c.d ? `<span class="q-card-d">${md(c.d)}</span><small class="q-card-more">Deep card · tap to read</small>` : ""}</button>` : `<div class="q-card lock"><span class="q-card-k">${esc(c.L.t)}</span><b>?</b><small>Play drill ${c.li + 1}</small></div>`).join("")}</div>`;
  return h;
}

/* ================= Level ================= */
let keyH = null;
function setKeys(h){ if (keyH) document.removeEventListener("keydown", keyH); keyH = h; if (h) document.addEventListener("keydown", h); }

function levelView(id, li){
  const z = ZMAP[id]; if (!z){ location.hash = "#play"; return; }
  needZone(id, () => {
    const Z = Q.data[id], L = Z.levels[li];
    if (!L){ location.hash = "#zone-" + id; return; }
    if (!unlocked(id, li)){ location.hash = "#zone-" + id; toast("Finish the previous level first"); return; }
    P.last = id; P.lv[id] = Z.levels.length; save();
    document.title = `${L.t} · ${z.title} · Dagdeep`;
    if (L.arcade) return arcade(id, li, z, L);
    play(id, li, z, Z, L);
  });
}

function arcade(id, li, z, L){
  root().innerHTML = `<div class="q-wrap q-play" style="--h:${z.hue}; --sc:hsl(${z.hue} 70% 45%)"><a class="q-back" href="#zone-${id}">← ${esc(z.title)}</a><div class="q-arcade" id="qArc"></div></div>`;
  const maker = window.COURSE_GAMES && window.COURSE_GAMES[L.arcade];
  if (!maker || !window.GameKit){ document.getElementById("qArc").innerHTML = `<p class="q-empty">This arcade level didn't load.</p>`; return; }
  const best = (P.stars[id] || {})[li] || 0;
  GameKit.start(document.getElementById("qArc"), Object.assign({}, maker(), {title:L.t, best}), s => {
    if (!s) return;
    reward(id, li, s, 0);
    const nx = Q.data[id].levels[li + 1];
    const btns = document.querySelector("#qArc .gk-btns");
    if (btns && !btns.querySelector(".q-next")) btns.insertAdjacentHTML("beforeend", nx ? `<a class="btn big q-next" href="#lvl-${id}-${li + 1}">Next: ${esc(nx.t)} →</a>` : `<a class="btn big q-next" href="#zone-${id}">Back to zone</a>`);
  });
}

function reward(id, li, s, roundXP){
  P.stars[id] = P.stars[id] || {};
  const prev = P.stars[id][li] || 0;
  let gain = roundXP + 20;
  if (s > prev){ gain += (s - prev) * 15; P.stars[id][li] = s; }
  save(); addXP(gain);
  if (s === 3) confetti();
  return gain;
}

function play(id, li, z, Z, L){
  const rounds = L.rounds, N = rounds.length, LIVES = 3;
  let hearts = LIVES, combo = 0, xp = 0, ri = 0, newCards = 0, perfect = 0, timer = null;
  root().innerHTML = `<div class="q-wrap q-play" style="--h:${z.hue}; --sc:hsl(${z.hue} 70% 45%)">
    <div class="q-top"><a class="q-x" href="#zone-${id}" aria-label="Leave level">✕</a>
      <div class="q-prog"><span></span></div>
      <span class="q-hearts">${Array.from({length:LIVES}, () => `<span class="q-h">${HEART}</span>`).join("")}</span></div>
    <div class="q-sub"><span>${esc(z.title)} · ${L.boss ? "Boss · " : ""}${esc(L.t)}</span><span class="q-combo" hidden></span><span class="q-xp">+0 XP</span></div>
    <div class="q-tm" ${L.boss ? "" : "hidden"}><span></span></div>
    <div class="q-stage" aria-live="polite"></div>
    <div class="q-sheet" hidden></div></div>`;
  const $ = s => root().querySelector(s);
  const stage = $(".q-stage"), sheet = $(".q-sheet");
  const hud = () => {
    $(".q-prog span").style.width = (ri / N * 100) + "%";
    root().querySelectorAll(".q-h").forEach((h, i) => h.classList.toggle("lost", i >= hearts));
    const c = $(".q-combo"); c.hidden = combo < 2; c.textContent = `🔥 ${combo} streak`;
    $(".q-xp").textContent = `+${xp} XP`;
  };
  const stopTimer = () => { if (timer){ cancelAnimationFrame(timer.raf); timer = null; } };
  const startTimer = (secs, onOut) => {
    stopTimer(); const t0 = performance.now(), bar = $(".q-tm span");
    timer = {raf:0};
    const step = () => { if (!timer || !document.body.contains(bar)) return; const left = 1 - (performance.now() - t0) / (secs * 1000); bar.style.width = Math.max(0, left * 100) + "%"; bar.classList.toggle("hot", left < .3); if (left <= 0){ stopTimer(); onOut(); return; } timer.raf = requestAnimationFrame(step); };
    timer.raf = requestAnimationFrame(step);
  };
  let locked = false, onKey = null;
  setKeys(e => {
    if (!document.body.contains(stage)) { setKeys(null); return; }
    if (e.key === "Enter" && !sheet.hidden){ e.preventDefault(); const b = sheet.querySelector(".q-go"); if (b) b.click(); return; }
    if (onKey && sheet.hidden && !locked && !e.metaKey && !e.ctrlKey) onKey(e);
  });

  const done = (ok, why, title) => {
    if (locked) return; locked = true; stopTimer(); onKey = null;
    if (ok){ combo++; perfect++; const g = 10 + Math.min(combo, 5) * 2; xp += g; }
    else { combo = 0; hearts--; root().querySelector(".q-play").classList.remove("hurt"); void stage.offsetWidth; root().querySelector(".q-play").classList.add("hurt"); }
    ri++; hud();
    const dead = hearts <= 0;
    sheet.className = "q-sheet " + (ok ? "ok" : "no");
    sheet.innerHTML = `<div class="q-sheet-in"><p class="q-verdict">${ok ? (title || pickWord(true)) : (title || pickWord(false))}</p>${why ? `<p class="q-why">${fm(why)}</p>` : ""}
      <button class="btn big solid q-go">${dead ? "See results" : ri >= N ? "Finish level" : "Continue"}</button></div>`;
    sheet.hidden = false;
    sheet.querySelector(".q-go").onclick = () => { sheet.hidden = true; if (dead) lose(); else next(); };
    sheet.querySelector(".q-go").focus({preventScroll:true});
  };
  const next = () => {
    if (ri >= N) return win();
    locked = false; const r = rounds[ri];
    stage.innerHTML = ""; stage.className = "q-stage in"; void stage.offsetWidth;
    const T = ROUND[r[0]];
    if (!T){ ri++; return next(); }
    T(r, stage, {done, collect, mistake, setKey:f => onKey = f, ri, id, li});
    if (L.boss && r[0] !== "learn") startTimer(L.time || 30, () => done(false, "Time's up. " + (whyOf(r) || ""), "Too slow"));
    hud();
  };
  const collect = (r) => {
    if (locked) return; locked = true;
    const cid = `${li}-${ri}`; P.cards[id] = P.cards[id] || [];
    if (!P.cards[id].includes(cid)){ P.cards[id].push(cid); newCards++; xp += 5; save(); }
    ri++; hud(); next();
  };
  const mistake = el => { if (el){ el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake"); } };
  const win = () => {
    setKeys(null); stopTimer();
    const s = Math.max(1, hearts);
    const gain = reward(id, li, s, xp);
    const nx = Z.levels[li + 1];
    $(".q-prog span").style.width = "100%";
    stage.className = "q-stage"; $(".q-tm").hidden = true;
    stage.innerHTML = `<div class="q-res won"><p class="q-eyebrow">${L.boss ? "Boss defeated" : "Level clear"}</p>${stars(s, "big")}
      <div class="q-res-stats"><span><small>XP</small><b>+${gain}</b></span><span><small>Perfect rounds</small><b>${perfect}/${N - rounds.filter(r => r[0] === "learn").length}</b></span><span><small>New cards</small><b>${newCards}</b></span></div>
      ${s < 3 ? `<p class="muted">Lose no hearts for 3 stars.</p>` : ""}
      <div class="q-res-b">${nx ? `<a class="btn big solid" href="#lvl-${id}-${li + 1}">Next: ${esc(nx.t)} →</a>` : `<a class="btn big solid" href="#zone-${id}">Zone complete · see your deck</a>`}
      <button class="btn big q-again">Replay</button><a class="btn big" href="#zone-${id}">Zone map</a></div></div>`;
    stage.querySelector(".q-again").onclick = () => levelView(id, li);
  };
  const lose = () => {
    setKeys(null); stopTimer();
    stage.className = "q-stage";
    stage.innerHTML = `<div class="q-res lost"><p class="q-eyebrow">Out of hearts</p><h2>So close.</h2><p>You got through ${ri} of ${N} rounds. Cards you collected are kept.</p>
      <div class="q-res-b"><button class="btn big solid q-again">Try again</button><a class="btn big" href="#zone-${id}">Zone map</a></div></div>`;
    stage.querySelector(".q-again").onclick = () => levelView(id, li);
  };
  hud(); next();
}
const WORDS_OK = ["Nice!", "Correct!", "Spot on.", "Exactly.", "Nailed it.", "Clean."], WORDS_NO = ["Not quite.", "Almost.", "Close, but no.", "Careful."];
const pickWord = ok => { const a = ok ? WORDS_OK : WORDS_NO; return a[Math.floor(Math.random() * a.length)]; };
const whyOf = r => ({pick:r[4], sort:r[3], order:r[3], match:r[3], fill:r[5], bug:r[4], num:r[5]})[r[0]] || "";

/* ================= Round types ================= */
const ROUND = {};
ROUND.learn = (r, st, c) => {
  const [, title, body, flow, code, deep] = r;
  st.innerHTML = `<div class="q-learn ${deep ? "has-deep" : ""}"><p class="q-kick">⚡ ${deep ? "Deep card" : "Power-up · concept card"}</p><h2>${fm(title)}</h2><p class="q-body">${fm(body)}</p>
    ${flow && flow.length ? `<ol class="q-flow">${flow.map((f, i) => `<li style="--i:${i}">${fm(f)}</li>`).join("")}</ol>` : ""}
    ${code ? `<pre class="q-code">${esc(code)}</pre>` : ""}
    ${deep ? `<details class="q-deep" open><summary>Go deeper</summary><div class="q-deep-b">${md(deep)}</div></details>` : ""}
    <button class="btn big solid q-collect">Collect card →</button></div>`;
  st.querySelector(".q-collect").onclick = () => c.collect(r);
  c.setKey(e => { if (e.key === "Enter"){ e.preventDefault(); c.collect(r); } });
};
ROUND.pick = (r, st, c) => {
  const [, q, opts, ans, why, code] = r;
  const order = shuffle(opts.map((o, i) => i));
  st.innerHTML = `<div class="q-r"><p class="q-kick">Choose</p><h2>${fm(q)}</h2>${code ? `<pre class="q-code">${esc(code)}</pre>` : ""}
    <div class="q-opts">${order.map((i, k) => `<button class="q-opt" data-i="${i}"><kbd>${k + 1}</kbd><span>${fm(opts[i])}</span></button>`).join("")}</div></div>`;
  const choose = b => {
    const i = +b.dataset.i;
    st.querySelectorAll(".q-opt").forEach(x => { x.disabled = true; if (+x.dataset.i === ans) x.classList.add("right"); });
    if (i !== ans) b.classList.add("wrong");
    c.done(i === ans, why);
  };
  st.querySelectorAll(".q-opt").forEach(b => b.onclick = () => choose(b));
  c.setKey(e => { const k = +e.key; if (k >= 1 && k <= order.length) choose(st.querySelectorAll(".q-opt")[k - 1]); });
};
ROUND.sort = (r, st, c) => {
  const [, prompt, buckets, why] = r, names = Object.keys(buckets);
  const items = shuffle(names.flatMap(b => buckets[b].map(t => [t, b])));
  let k = 0, miss = 0; const wrongs = [];
  st.innerHTML = `<div class="q-r"><p class="q-kick">Sort it · ${items.length} items</p><h2>${fm(prompt)}</h2>
    <div class="q-sort-card"><span class="q-sort-n"></span><b></b></div>
    <div class="q-buckets" style="--n:${names.length}">${names.map((n, i) => `<button class="q-bucket" data-b="${esc(n)}"><kbd>${i + 1}</kbd><span>${fm(n)}</span><small>0</small></button>`).join("")}</div>
    <p class="q-flash">&nbsp;</p></div>`;
  const card = st.querySelector(".q-sort-card"), flash = st.querySelector(".q-flash"), cnt = {};
  const show = () => { card.querySelector("b").innerHTML = fm(items[k][0]); card.querySelector(".q-sort-n").textContent = `${k + 1}/${items.length}`; card.classList.remove("in"); void card.offsetWidth; card.classList.add("in"); };
  const put = btn => {
    if (k >= items.length) return;
    const [t, b] = items[k], pick = btn.dataset.b;
    const target = [...st.querySelectorAll(".q-bucket")].find(x => x.dataset.b === b);
    cnt[b] = (cnt[b] || 0) + 1; target.querySelector("small").textContent = cnt[b];
    if (pick === b){ flash.className = "q-flash ok"; flash.innerHTML = "✓"; target.classList.add("pulse"); setTimeout(() => target.classList.remove("pulse"), 300); }
    else { miss++; wrongs.push(`«${t}» → ${b}`); c.mistake(btn); flash.className = "q-flash no"; flash.innerHTML = `✗ ${fm(t)} belongs in <b>${fm(b)}</b>`; }
    k++;
    if (k >= items.length){ st.querySelectorAll(".q-bucket").forEach(x => x.disabled = true); card.style.visibility = "hidden"; c.done(!miss, (miss ? `Fix: ${wrongs.join("; ")}. ` : "") + (why || "")); }
    else show();
  };
  st.querySelectorAll(".q-bucket").forEach(b => b.onclick = () => put(b));
  c.setKey(e => { const n = +e.key; if (n >= 1 && n <= names.length) put(st.querySelectorAll(".q-bucket")[n - 1]); });
  show();
};
ROUND.order = (r, st, c) => {
  const [, prompt, steps, why] = r;
  let k = 0, miss = 0;
  st.innerHTML = `<div class="q-r"><p class="q-kick">Put it in order · tap the next step</p><h2>${fm(prompt)}</h2>
    <ol class="q-seq">${steps.map(() => `<li></li>`).join("")}</ol>
    <div class="q-pool">${shuffle(steps.map((s, i) => i)).map(i => `<button class="q-chip" data-i="${i}">${fm(steps[i])}</button>`).join("")}</div></div>`;
  const seq = st.querySelectorAll(".q-seq li");
  st.querySelectorAll(".q-pool .q-chip").forEach(b => b.onclick = () => {
    if (+b.dataset.i === k){ seq[k].innerHTML = fm(steps[k]); seq[k].classList.add("on"); b.remove(); k++; if (k >= steps.length) c.done(!miss, why); }
    else { miss++; c.mistake(b); }
  });
};
ROUND.match = (r, st, c) => {
  const [, prompt, pairs, why] = r;
  let selL = null, left = pairs.length, miss = 0;
  st.innerHTML = `<div class="q-r"><p class="q-kick">Match the pairs</p><h2>${fm(prompt)}</h2>
    <div class="q-match"><div>${shuffle(pairs.map((p, i) => i)).map(i => `<button class="q-chip l" data-i="${i}">${fm(pairs[i][0])}</button>`).join("")}</div>
    <div>${shuffle(pairs.map((p, i) => i)).map(i => `<button class="q-chip r" data-i="${i}">${fm(pairs[i][1])}</button>`).join("")}</div></div></div>`;
  st.querySelectorAll(".q-chip.l").forEach(b => b.onclick = () => { st.querySelectorAll(".q-chip.l").forEach(x => x.classList.remove("sel")); selL = b; b.classList.add("sel"); });
  st.querySelectorAll(".q-chip.r").forEach(b => b.onclick = () => {
    if (!selL){ c.mistake(b); return; }
    if (selL.dataset.i === b.dataset.i){ selL.classList.remove("sel"); selL.classList.add("ok"); b.classList.add("ok"); selL.disabled = b.disabled = true; selL = null; if (--left === 0) c.done(!miss, why); }
    else { miss++; c.mistake(b); c.mistake(selL); }
  });
};
ROUND.fill = (r, st, c) => {
  const [, prompt, tpl, answers, decoys, why] = r;
  const parts = tpl.split("___"); let k = 0, miss = 0;
  st.innerHTML = `<div class="q-r"><p class="q-kick">Fill the blanks</p><h2>${fm(prompt)}</h2>
    <pre class="q-code q-tpl">${parts.map((p, i) => esc(p) + (i < parts.length - 1 ? `<span class="q-blank ${i === 0 ? "cur" : ""}" data-b="${i}">____</span>` : "")).join("")}</pre>
    <div class="q-pool">${shuffle(answers.map((a, i) => ["a" + i, a]).concat((decoys || []).map((d, i) => ["d" + i, d]))).map(([key, t]) => `<button class="q-chip mono" data-t="${esc(t)}">${esc(t)}</button>`).join("")}</div></div>`;
  const blanks = st.querySelectorAll(".q-blank");
  st.querySelectorAll(".q-pool .q-chip").forEach(b => b.onclick = () => {
    if (b.dataset.t === answers[k]){ blanks[k].textContent = answers[k]; blanks[k].classList.remove("cur"); blanks[k].classList.add("on"); b.remove(); k++; if (blanks[k]) blanks[k].classList.add("cur"); if (k >= answers.length) c.done(!miss, why); }
    else { miss++; c.mistake(b); }
  });
};
ROUND.bug = (r, st, c) => {
  const [, prompt, lines, bad, why] = r;
  st.innerHTML = `<div class="q-r"><p class="q-kick">Spot the bug · tap the faulty line</p><h2>${fm(prompt)}</h2>
    <div class="q-lines">${lines.map((l, i) => `<button class="q-line" data-i="${i}"><span>${i + 1}</span><code>${esc(l)}</code></button>`).join("")}</div></div>`;
  st.querySelectorAll(".q-line").forEach(b => b.onclick = () => {
    const i = +b.dataset.i;
    st.querySelectorAll(".q-line").forEach(x => { x.disabled = true; if (+x.dataset.i === bad) x.classList.add("right"); });
    if (i !== bad) b.classList.add("wrong");
    c.done(i === bad, why);
  });
};
ROUND.tf = (r, st, c) => {
  const [, prompt, items] = r;
  const list = shuffle(items); let k = 0, miss = 0, busy = false, raf = 0; const wrongs = [];
  st.innerHTML = `<div class="q-r"><p class="q-kick">⚡ Speed round · true or false</p><h2>${fm(prompt)}</h2>
    <div class="q-tf"><span class="q-sort-n"></span><p></p><div class="q-tm small"><span></span></div></div>
    <div class="q-2"><button class="q-opt tfb" data-v="1"><kbd>←</kbd><span>True</span></button><button class="q-opt tfb" data-v="0"><kbd>→</kbd><span>False</span></button></div>
    <p class="q-flash">&nbsp;</p></div>`;
  const box = st.querySelector(".q-tf"), flash = st.querySelector(".q-flash"), bar = box.querySelector(".q-tm span");
  const show = () => {
    busy = false; box.querySelector("p").innerHTML = fm(list[k][0]); box.querySelector(".q-sort-n").textContent = `${k + 1}/${list.length}`;
    box.classList.remove("in"); void box.offsetWidth; box.classList.add("in");
    const t0 = performance.now(), secs = 12;
    cancelAnimationFrame(raf);
    const step = () => { if (busy || !document.body.contains(bar)) return; const left = 1 - (performance.now() - t0) / (secs * 1000); bar.style.width = Math.max(0, left * 100) + "%"; if (left <= 0){ answer(null); return; } raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
  };
  const answer = v => {
    if (busy) return; busy = true; cancelAnimationFrame(raf);
    const [s, truth, why] = list[k], ok = v === truth;
    if (ok){ flash.className = "q-flash ok"; flash.innerHTML = `✓ ${fm(why || "")}`; }
    else { miss++; wrongs.push(why || s); flash.className = "q-flash no"; flash.innerHTML = `✗ ${truth ? "True" : "False"}. ${fm(why || "")}`; c.mistake(box); }
    k++;
    setTimeout(() => { if (!document.body.contains(box)) return; if (k >= list.length){ st.querySelectorAll(".tfb").forEach(b => b.disabled = true); c.done(!miss, miss ? "Review: " + wrongs.join(" · ") : "All correct, and fast."); } else show(); }, ok ? 900 : 1900);
  };
  st.querySelectorAll(".tfb").forEach(b => b.onclick = () => answer(b.dataset.v === "1"));
  c.setKey(e => { if (e.key === "ArrowLeft" || e.key === "t") answer(true); if (e.key === "ArrowRight" || e.key === "f") answer(false); });
  show();
};
ROUND.num = (r, st, c) => {
  const [, q, ans, tol, unit, why, code] = r;
  st.innerHTML = `<div class="q-r"><p class="q-kick">🧮 Work it out</p><h2>${fm(q)}</h2>${code ? `<pre class="q-code">${esc(code)}</pre>` : ""}
    <form class="q-num"><input type="text" inputmode="decimal" autocomplete="off" placeholder="Your answer" aria-label="Your answer"><span>${esc(unit || "")}</span><button class="btn big solid">Check</button></form></div>`;
  const f = st.querySelector("form"), inp = f.querySelector("input");
  setTimeout(() => inp.focus({preventScroll:true}), 50);
  f.onsubmit = e => {
    e.preventDefault();
    const v = parseFloat(inp.value.replace(/[, _]/g, ""));
    if (isNaN(v)){ c.mistake(inp); return; }
    inp.disabled = true; f.querySelector("button").disabled = true;
    const ok = Math.abs(v - ans) <= (tol || 0);
    inp.classList.add(ok ? "right" : "wrong");
    c.done(ok, `Answer: **${ans.toLocaleString()}${unit ? " " + unit : ""}**. ${why || ""}`);
  };
};
Q.ROUND = ROUND;

/* ================= Story missions & mock interviews ================= */
// QUEST.missions(id, [...]), QUEST.interviews(id, [...]), QUEST.cards(id, {...}) are called from zone files after QUEST.zone().
// Mission: {title, icon, place, setup, meters:{k:{label, value, unit, pre, goal, better:"low"|"high", max, cap}}, steps:[...], learned:[...]}
// Steps: {say:[[who, text]...]}  who = cast id | "ui" | "code" | "sys" | "img" ("src|caption")
//        {choose, options:[{t, ok:true|false|"partial", fx, say, why, life, more}], model}
//        {task:[round], intro, label, ok:{fx}, bad:{fx}, life, more} · {card:"key"} · {fx:{...}}
// Card: {t, one, life, how:[...], ex (markdown), traps:[...], say}
Q.missions = function(id, list){ if (this.data[id]) this.data[id].missions = list; };
Q.interviews = function(id, list){ if (this.data[id]) this.data[id].interviews = list; };
// Compact authoring for story missions and mock interviews.
// QUEST.story(id, {title, icon, place, setup, meters:[[key, label, unit, value, goal, "high"|"low", max]],
//   beats:[[who, text] | ["ui", text] | ["q", question, [[text, 1|0.5|0, why, life, fx]]]], learned:[...]})
const okOf = v => v === 1 ? true : v === 0 ? false : "partial";
Q.story = function(id, d){
  const Z = this.data[id]; if (!Z) return;
  const meters = {}; d.meters.forEach(([k, label, unit, value, goal, better, max]) => meters[k] = {label, unit, value, goal, better, max, cap:better === "high" && unit === "%" ? 100 : undefined});
  const steps = []; let say = [];
  const flush = () => { if (say.length){ steps.push({say}); say = []; } };
  d.beats.forEach(b => { if (b[0] === "q"){ flush(); steps.push({choose:b[1], options:b[2].map(([t, ok, why, life, fx]) => ({t, ok:okOf(ok), why, life, fx}))}); } else say.push([b[0], b[1]]); });
  flush();
  (Z.missions = Z.missions || []).push({title:d.title, icon:d.icon || "🎬", place:d.place, setup:d.setup, meters, steps, learned:d.learned});
};
// QUEST.mock(id, {title, who, place, setup, intro, qs:[[question, modelAnswer, [[text, 1|0.5|0, why]]]], learned})
Q.mock = function(id, d){
  const Z = this.data[id]; if (!Z) return;
  const fx = ok => ok === 1 ? {signal:8, depth:9} : ok === 0 ? {signal:-8, flags:1} : {signal:-2, depth:1};
  const steps = [{say:[[d.who || "farah", d.intro]]}].concat(d.qs.map(([q, model, opts]) => ({choose:`“${q}”`, model, options:opts.map(([t, ok, why]) => ({t, ok:okOf(ok), why, fx:fx(ok)}))})));
  (Z.interviews = Z.interviews || []).push({title:d.title, icon:"🎤", place:d.place || "45-minute technical round", setup:d.setup, meters:{signal:{label:"Hire signal", value:40, unit:"%", goal:80, better:"high", max:100, cap:100}, depth:{label:"Depth", value:30, unit:"%", goal:75, better:"high", max:100, cap:100}, flags:{label:"Red flags", value:0, unit:"", goal:0, better:"low", max:5}}, steps, learned:d.learned});
};
function ivHub(){
  document.title = "Mock interviews · Dagdeep";
  const row = (z) => { const s = (P.iv[z.id] || {})[0] || 0; return `<a class="q-wrow" href="#iv-${z.id}-0" style="--h:${z.hue}"><span class="q-wrow-ic">🎤</span><span class="q-wrow-t"><b>${esc(z.title)} round</b><small>${esc(z.short)}</small></span><span class="q-wrow-s">${s ? stars(s, "sm") : `<i>New</i>`}</span></a>`; };
  root().innerHTML = `<div class="q-wrap q-hub"><a class="q-back" href="#play">← Home</a><h1>🎤 Mock interviews</h1>
    <p class="muted">An interviewer asks real questions. Pick the answer you'd give, and see a model answer after each one. Each round ends with a hire / no-hire verdict.</p>
    ${WORLDS.map(w => `<h2 class="q-sec-h">${w.id === "de" ? "🗄️" : "🤖"} ${esc(w.title)}</h2><div class="q-wlist">${ZONES.filter(z => z.world === w.id).map(row).join("")}</div>`).join("")}</div>`;
}
Q.cards = function(id, map){ if (this.data[id]) this.data[id].cardBook = map; };
const STORY = new Set(ZONES.map(z => z.id));
const msOpen = (id, i) => i === 0 || ((P.ms[id] || {})[i - 1] || 0) > 0;
const sleep = ms => new Promise(r => setTimeout(r, reduce() ? 0 : ms));
const shot = (src, cap) => `<figure class="q-shot"><a href="${esc(src)}" target="_blank" rel="noopener"><img src="${esc(src)}" alt="${esc(cap || "Screenshot")}" loading="lazy"></a>${cap ? `<figcaption>${fm(cap)}</figcaption>` : ""}</figure>`;
const cardHTML = (C, cls = "") => `<article class="q-xc ${cls}">
  <header><span class="q-xc-k">🃏 Concept card</span><h3>${fm(C.t)}</h3>${C.one ? `<p class="q-xc-one">${fm(C.one)}</p>` : ""}</header>
  ${C.life ? `<section class="q-xc-life"><h4>🏠 In real life</h4><p>${fm(C.life)}</p></section>` : ""}
  ${C.how ? `<section><h4>⚙️ How it really works</h4><ol>${C.how.map(x => `<li>${fm(x)}</li>`).join("")}</ol></section>` : ""}
  ${C.ex ? `<section><h4>🧪 Worked example</h4>${md(C.ex)}</section>` : ""}
  ${C.traps ? `<section><h4>⚠️ Gotchas</h4><ul>${C.traps.map(x => `<li>${fm(x)}</li>`).join("")}</ul></section>` : ""}
  ${C.say ? `<section class="q-xc-say"><h4>🎤 Say it in an interview</h4><p>${fm(C.say)}</p></section>` : ""}
</article>`;
function cardMissionIndex(Z){
  const m = {};
  (Z.missions || []).forEach((M, i) => M.steps.forEach(s => { if (s.card && !(s.card in m)) m[s.card] = i; }));
  return m;
}
const FACTS = {
  spark:["Spark started in 2009 at UC Berkeley's AMPLab as a research project to make iterative jobs faster than Hadoop MapReduce.","The 'Tungsten' project was named after the metal with the highest melting point — the goal was to push Spark close to bare-metal speed.","«spark.sql.shuffle.partitions» defaults to 200 — a number chosen in Spark's early days, and almost never right for your data.","Whole-stage codegen generates Java source for each stage at runtime; you can print it with «df.explain('codegen')»."],
  kafka:["Kafka was built at LinkedIn around 2010 and named after the writer Franz Kafka, because it's 'a system optimised for writing'.","Kafka 4.0 removed ZooKeeper entirely — metadata now lives in an internal Raft-replicated log (KRaft).","Kafka relies on the OS page cache instead of its own cache, which is why brokers like lots of free RAM and modest heaps.","A compacted topic can serve as a database changelog: replay it from the start and you rebuild the latest state of every key."],
  rag:["The term 'retrieval-augmented generation' comes from a 2020 research paper that combined a retriever with a sequence-to-sequence model.","BM25, the keyword ranking function still used in hybrid search, dates back to the 1990s Okapi information retrieval system.","Reciprocal Rank Fusion uses k = 60 because it worked well in the original 2009 experiments — and it stuck.","Models tend to use information at the start and end of a long context better than the middle: the 'lost in the middle' effect."]
};

function missionView(id, mi, kind){
  kind = kind || "ms";
  const z = ZMAP[id]; if (!z){ location.hash = "#play"; return; }
  needZone(id, () => {
    const Z = Q.data[id], list = kind === "iv" ? Z.interviews : Z.missions, M = (list || [])[mi], IV = kind === "iv";
    if (!M){ location.hash = "#zone-" + id; return; }
    if (!IV && !msOpen(id, mi)){ location.hash = "#zone-" + id; toast("Finish the previous mission first"); return; }
    M.steps.forEach(S => { if (S.options) mix(S.options); });
    P.last = id; save();
    document.title = `${M.title} · ${z.title} · Dagdeep`;
    const meters = JSON.parse(JSON.stringify(M.meters || {}));
    let mistakes = 0, keyFn = null, bonus = 0; const newCards = [];
    root().innerHTML = `<div class="q-wrap q-mis ${IV ? "q-iv" : ""}" style="--h:${z.hue}; --sc:hsl(${z.hue} 70% 45%)">
      <div class="q-mis-top"><a class="q-x" href="#zone-${id}/${IV ? "interview" : "missions"}" aria-label="Leave">✕</a>
        <div><p class="q-eyebrow">${esc(z.title)} · ${IV ? "Mock interview" : "Mission " + (mi + 1)}</p><h1>${M.icon ? M.icon + " " : ""}${esc(M.title)}</h1>${M.place ? `<p class="q-mis-place">${esc(M.place)}</p>` : ""}</div></div>
      <div class="q-meters"></div>
      <div class="q-feed" aria-live="polite"></div>
      <div class="q-actz"></div></div>`;
    const $ = s => root().querySelector(s);
    const feed = $(".q-feed"), act = $(".q-actz"), mEl = $(".q-meters");
    const alive = () => document.body.contains(feed);
    setKeys(e => { if (!alive()){ setKeys(null); return; } if (keyFn && !e.metaKey && !e.ctrlKey) keyFn(e); });
    const ok = k => { const m = meters[k]; return m.better === "low" ? m.value <= m.goal + 1e-9 : m.value >= m.goal - 1e-9; };
    const fmtV = (m, v) => `${m.pre || ""}${Number.isInteger(v) ? v.toLocaleString() : (+v.toFixed(1)).toLocaleString()}${m.unit || ""}`;
    Object.values(meters).forEach(m => { if (!m.max) m.max = Math.max(m.value, m.goal) * 1.2 || 100; });
    const drawMeters = () => {
      mEl.innerHTML = Object.entries(meters).map(([k, m]) => `<div class="q-meter ${ok(k) ? "met" : ""}" data-k="${k}">
        <small>${esc(m.label)}</small><b>${fmtV(m, m.value)}</b><span class="q-mbar"><span style="width:${Math.min(100, m.value / m.max * 100)}%"></span><i style="left:${Math.min(100, m.goal / m.max * 100)}%"></i></span><small class="q-goal">${ok(k) ? "✓ goal met" : `goal ${m.better === "low" ? "≤" : "≥"} ${fmtV(m, m.goal)}`}</small></div>`).join("");
    };
    const apply = fx => {
      if (!fx) return;
      Object.entries(fx).forEach(([k, d]) => { const m = meters[k]; if (!m) return; m.value = Math.max(0, m.value + d); if (m.cap) m.value = Math.min(m.cap, m.value); });
      drawMeters();
      Object.entries(fx).forEach(([k, d]) => { const m = meters[k], el = mEl.querySelector(`[data-k="${k}"]`); if (!m || !el || !d) return;
        const good = m.better === "low" ? d < 0 : d > 0;
        el.insertAdjacentHTML("beforeend", `<span class="q-delta ${good ? "good" : "bad"}">${d > 0 ? "+" : "−"}${fmtV(m, Math.abs(d))}</span>`);
        el.classList.add(good ? "pulse-g" : "pulse-b"); setTimeout(() => el.classList.remove("pulse-g", "pulse-b"), 700); });
    };
    const scroll = el => { if (el && el.scrollIntoView) el.scrollIntoView({behavior:reduce() ? "auto" : "smooth", block:"end"}); };
    const msg = async (who, text) => {
      if (!alive()) return;
      let h;
      if (who === "ui"){ const [title, ...lines] = String(text).split("\n"); h = `<div class="q-screen"><span>🖥 ${esc(title)}</span><pre>${esc(lines.join("\n"))}</pre></div>`; }
      else if (who === "img"){ const [src, cap] = String(text).split("|"); h = shot(src, cap); }
      else if (who === "code") h = `<pre class="q-code q-fcode">${esc(text)}</pre>`;
      else if (who === "sys") h = `<p class="q-sys">${fm(text)}</p>`;
      else if (who === "you") h = `<div class="q-msg me"><div class="q-bub">${fm(text)}</div></div>`;
      else { const c = CAST[who] || [who, "", 200]; h = `<div class="q-msg" style="--ch:${c[2]}"><span class="q-av">${esc(c[0][0])}</span><div class="q-bub"><b>${esc(c[0])} <small>${esc(c[1])}</small></b><p>${fm(text)}</p></div></div>`; }
      feed.insertAdjacentHTML("beforeend", h); scroll(feed.lastElementChild);
      await sleep(who === "img" ? 900 : Math.min(1400, 350 + String(text).length * 6));
    };
    const sayAll = async list => { for (const [w, t] of list || []){ if (!alive()) return; await msg(w, t); } };
    const cont = label => new Promise(res => {
      act.insertAdjacentHTML("beforeend", `<button class="btn big solid q-cont">${esc(label || "Continue ▸")}</button>`);
      const b = act.querySelector(".q-cont:last-of-type"); scroll(b);
      const go = () => { keyFn = null; b.remove(); res(); };
      b.onclick = go; keyFn = e => { if (e.key === "Enter"){ e.preventDefault(); go(); } };
    });
    const explain = (kind2, verdict, why, life, more, model) => {
      feed.insertAdjacentHTML("beforeend", `<div class="q-exp ${kind2}"><p class="q-exp-v">${verdict}</p>${why ? `<p>${fm(why)}</p>` : ""}
        ${life ? `<div class="q-life"><b>🏠 Real life</b><p>${fm(life)}</p></div>` : ""}
        ${more ? `<details class="q-more"><summary>🔍 Under the hood</summary><div>${md(more)}</div></details>` : ""}
        ${model ? `<details class="q-more q-model" open><summary>📝 Model answer</summary><div>${md(model)}</div></details>` : ""}</div>`);
      scroll(feed.lastElementChild);
    };
    const V = IV ? {ok:"✓ Strong answer", mid:"≈ Okay, but shallow", no:"✗ Red flag for the interviewer"} : {ok:"✓ Good call", mid:"≈ Helps a little, but not the real fix", no:"✗ That backfired"};
    const choose = S => new Promise(res => {
      const tried = new Set();
      const render = () => {
        act.innerHTML = `<div class="q-dec"><p class="q-kick">${IV ? "🎤 Your answer" : "🎯 Your call"}</p><h2>${fm(S.choose)}</h2><div class="q-opts">${S.options.map((o, i) => `<button class="q-opt ${tried.has(i) ? "tried" : ""}" data-i="${i}" ${tried.has(i) ? "disabled" : ""}><kbd>${i + 1}</kbd><span>${fm(o.t)}</span></button>`).join("")}</div></div>`;
        scroll(act.firstElementChild);
        act.querySelectorAll(".q-opt").forEach(b => b.onclick = () => pick(+b.dataset.i));
        keyFn = e => { const n = +e.key; if (n >= 1 && n <= S.options.length && !tried.has(n - 1)) pick(n - 1); };
      };
      const pick = async i => {
        keyFn = null; const o = S.options[i]; act.innerHTML = "";
        await msg("you", o.t); apply(o.fx); await sayAll(o.say);
        if (o.ok === true){ explain("ok", V.ok, o.why, o.life, o.more, S.model); await cont(); res(); }
        else {
          mistakes += o.ok === "partial" ? 0.5 : 1; tried.add(i);
          explain(o.ok === "partial" ? "mid" : "no", o.ok === "partial" ? V.mid : V.no, o.why, o.life, null, null);
          await cont(IV ? "Answer again ▸" : "Try another move ▸"); if (alive()) render();
        }
      };
      render();
    });
    const task = S => new Promise(async res => {
      await sayAll(S.intro);
      if (!alive()) return;
      act.innerHTML = `<div class="q-taskbox ${S.bonus ? "q-twistbox" : ""}"><p class="q-kick">${S.bonus ? "⚡ Plot twist · bonus question" : "🛠 Hands-on"}${S.label && !S.bonus ? " · " + esc(S.label) : ""}</p><div class="q-tstage"></div><div class="q-tres"></div></div>`;
      const st = act.querySelector(".q-tstage"), out = act.querySelector(".q-tres"); let fin = false;
      scroll(act.firstElementChild);
      const ctx = {
        done:(good, why) => {
          if (fin) return; fin = true; keyFn = null;
          if (S.bonus){ if (good){ bonus += 25; unlock("twist"); } }
          else if (good) apply(S.ok); else { mistakes++; apply(S.bad); }
          out.innerHTML = `<div class="q-exp ${good ? "ok" : "no"}"><p class="q-exp-v">${good ? (S.bonus ? "⚡ +25 bonus XP" : "✓ Nailed it") : (S.bonus ? "No harm done — bonus missed" : "✗ Not quite")}</p>${why ? `<p>${fm(why)}</p>` : ""}${S.life ? `<div class="q-life"><b>🏠 Real life</b><p>${fm(S.life)}</p></div>` : ""}${S.more ? `<details class="q-more"><summary>🔍 Under the hood</summary><div>${md(S.more)}</div></details>` : ""}</div><button class="btn big solid q-cont">Continue ▸</button>`;
          const b = out.querySelector(".q-cont"); scroll(b);
          const go = () => { keyFn = null; act.innerHTML = ""; feed.insertAdjacentHTML("beforeend", `<p class="q-sys">${good ? "✓" : "✗"} ${esc(S.bonus ? "Plot twist" : (S.label || "Task"))} ${good ? "done" : "attempted"}</p>`); res(); };
          b.onclick = go; keyFn = e => { if (e.key === "Enter"){ e.preventDefault(); go(); } };
        },
        collect:() => {}, mistake:el => { if (el){ el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake"); } },
        setKey:f => keyFn = f
      };
      ROUND[S.task[0]](S.task, st, ctx);
    });
    const card = key => new Promise(res => {
      const C = (Z.cardBook || {})[key]; if (!C) return res();
      feed.insertAdjacentHTML("beforeend", `<p class="q-unlock">🃏 New concept card: <b>${fm(C.t)}</b></p>`);
      act.innerHTML = cardHTML(C, "in") + `<button class="btn big solid q-cont">Add to my deck ▸</button>`;
      scroll(act.firstElementChild);
      const go = () => {
        keyFn = null; act.innerHTML = "";
        const cid = "c:" + key; P.cards[id] = P.cards[id] || [];
        if (!P.cards[id].includes(cid)){ P.cards[id].push(cid); newCards.push(C.t); save(); if (totalCards() >= 10) unlock("collector"); }
        res();
      };
      act.querySelector(".q-cont").onclick = go;
      keyFn = e => { if (e.key === "Enter"){ e.preventDefault(); go(); } };
    });
    const twistRound = () => {
      const pool = [];
      Z.levels.forEach(L => (L.rounds || []).forEach(r => { if (r[0] === "pick") pool.push(r); }));
      return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
    };
    const chest = key => {
      const box = act.querySelector(".q-chest"); if (!box) return;
      if (P.chest[key]){ box.innerHTML = `<p class="muted">🎁 Chest already opened for this ${IV ? "interview" : "mission"}.</p>`; return; }
      box.innerHTML = `<button class="q-chestbtn" type="button"><span>🎁</span><b>Mystery chest</b><small>Tap to open</small></button>`;
      box.querySelector("button").onclick = () => {
        const b = box.querySelector("button"); b.classList.add("opening"); b.disabled = true;
        setTimeout(() => {
          P.chest[key] = 1; const roll = Math.random(); let h;
          if (roll < 0.1){ addXP(200); unlock("lucky"); confetti(); h = `<span>🌟</span><b>Rare drop! +200 XP</b><small>One chest in ten has this.</small>`; }
          else if (roll < 0.55){ const x = 30 + Math.floor(Math.random() * 6) * 10; addXP(x); h = `<span>💰</span><b>+${x} bonus XP</b><small>Spend it on bragging rights.</small>`; }
          else if (roll < 0.8 && Z.cardBook){ const cs = Object.values(Z.cardBook), C = cs[Math.floor(Math.random() * cs.length)]; h = `<span>💎</span><b>Interview gem: ${fm(C.t)}</b><small>${fm(C.say || C.one)}</small>`; }
          else if (FACTS[id]){ const f = FACTS[id]; h = `<span>🧠</span><b>Did you know?</b><small>${fm(f[Math.floor(Math.random() * f.length)])}</small>`; }
          else { const f = M.learned && M.learned.length ? M.learned : ["Keep playing to unlock more."]; h = `<span>📌</span><b>Remember this</b><small>${fm(f[Math.floor(Math.random() * f.length)])}</small>`; }
          save(); box.innerHTML = `<div class="q-chestout">${h}</div>`;
        }, reduce() ? 0 : 900);
      };
    };
    const debrief = () => {
      setKeys(null);
      const s = mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1;
      P[kind][id] = P[kind][id] || {}; const prev = P[kind][id][mi] || 0;
      let gain = 40 + newCards.length * 5 + Math.max(0, s - prev) * 20 + bonus;
      if (s > prev) P[kind][id][mi] = s;
      save(); addXP(gain);
      if (!IV) unlock("first");
      if (s === 3){ confetti(); if (!IV) unlock("flawless"); }
      if (mistakes >= 3) unlock("comeback");
      const hr = new Date().getHours(); if (hr >= 23 || hr < 4) unlock("owl");
      const verdict = IV ? (s === 3 ? "🤝 Strong hire" : s === 2 ? "👍 Hire" : "🔁 Not yet — replay and tighten your answers") : null;
      if (IV && s === 3) unlock("hired");
      const nx = list[mi + 1];
      act.innerHTML = `<div class="q-res won q-debrief"><p class="q-eyebrow">${IV ? "Interview feedback" : "Mission debrief"}</p>${verdict ? `<h2>${verdict}</h2>` : ""}${stars(s, "big")}
        <div class="q-res-stats"><span><small>XP</small><b>+${gain}</b></span><span><small>${IV ? "Weak answers" : "Wrong calls"}</small><b>${mistakes}</b></span>${IV ? "" : `<span><small>New cards</small><b>${newCards.length}</b></span>`}${bonus ? `<span><small>Twist bonus</small><b>+${bonus}</b></span>` : ""}</div>
        <div class="q-final">${Object.entries(meters).map(([k, m]) => `<span class="${ok(k) ? "met" : ""}">${ok(k) ? "✓" : "✗"} ${esc(m.label)}: <b>${fmtV(m, m.value)}</b></span>`).join("")}</div>
        <div class="q-chest"></div>
        ${M.learned ? `<div class="gk-learned q-learned"><p>${IV ? "What interviewers listen for" : "What you now know"}</p><ul>${M.learned.map(x => `<li>${fm(x)}</li>`).join("")}</ul></div>` : ""}
        ${s < 3 ? `<p class="muted">${IV ? "Give the strong answer first time for a Strong hire." : "Make every call right first time for 3 stars."}</p>` : ""}
        <div class="q-res-b">${nx ? `<a class="btn big solid" href="#${IV ? "iv" : "mis"}-${id}-${mi + 1}">Next: ${esc(nx.title)} →</a>` : `<a class="btn big solid" href="#zone-${id}/${IV ? "interview" : "interview"}">${IV ? "Back to interview prep" : "Now crack the interview 🎤"}</a>`}
        <button class="btn big q-again">Replay</button><a class="btn big" href="#zone-${id}/cards">My cards</a></div></div>`;
      act.querySelector(".q-again").onclick = () => missionView(id, mi, kind);
      chest(`${id}:${kind}:${mi}`);
      scroll(act.firstElementChild);
    };
    drawMeters();
    (async () => {
      if (M.setup) await msg("sys", M.setup);
      const twistAt = !IV && Math.random() < 0.6 ? Math.floor(M.steps.length / 2) : -1;
      for (let si = 0; si < M.steps.length; si++){
        const S = M.steps[si];
        if (!alive()) return;
        if (si === twistAt){
          const r = twistRound();
          if (r) await task({task:r, bonus:true, intro:[["sys", "⚡ **Plot twist!** " + ["Arjun drops into the call", "The CTO pings you on chat", "Meera walks over with chai", "An auditor joins the bridge"][Math.floor(Math.random() * 4)] + " with a quick question. Bonus XP if you nail it — no penalty if you don't."]]});
        }
        if (S.say) await sayAll(S.say);
        if (S.fx) apply(S.fx);
        if (S.choose) await choose(S);
        if (S.task) await task(S);
        if (S.card) await card(S.card);
      }
      if (alive()) debrief();
    })();
  });
}

/* ================= On-call desk (workplace debugging) ================= */
// QUEST.cases(id, [...]) from a zone file. Case:
// {title, icon, sev, svc, clock:"03:12", pager, brief, channel, need,
//  slack:[{at:secs|on:clueId, who, t, cmd?}], hints:[...],
//  term:{host, user, motd, suggest:[...], cmds:[{m:[prefix...], out, clue?, note?, unlock?:[...]}]},
//  dash:[{title, unit, x:[...], series:[{name, v:[...]}], marks:[{i, label}], clue?, note?}],
//  ui:[{title, img?, cap?, md?, clue?, note?}], files:[{path, text, clues:{line:clueId}}],
//  clues:{id:text}, cause:{q, o:[{t, ok, say:[[who,t]], why}]},
//  fix:{q, o:[{t, kind:"must"|"good"|"meh"|"bad", why, say:[[who,t]]}], miss:[[who,t]]},
//  post:{summary, cause, fix, prevent:[...]}, learned:[...], cards:[key | card]}
Q.cases = function(id, list){
  const Z = this.data[id]; if (!Z) return;
  list.forEach(c => { c.cards = (c.cards || []).map(k => { if (typeof k === "string") return k; Z.cardBook = Z.cardBook || {}; Z.cardBook[k.k] = k; return k.k; }); });
  Z.cases = list;
};
// study refs: "zone:levelIndex" (a drill level's concept cards) or "zone/cardKey" (a story concept card)
const CASES = [
  {z:"spark", i:0, icon:"🐢", sev:2, title:"The nightly job got 4× slower", svc:"settlements-daily · Spark on EMR", topics:"Small files · partitions · streaming triggers", study:["spark/smallfiles","spark:2","spark:19"]},
  {z:"kafka", i:0, icon:"☠️", sev:1, title:"One partition is 3 million behind", svc:"payments-ledger consumer", topics:"Consumer lag · offsets · poison messages · DLQ", study:["kafka/dlq","kafka/offsets","kafka/groups","kafka:3"]},
  {z:"postgres", i:0, icon:"💽", sev:1, title:"Primary DB disk at 92% and climbing", svc:"orders-db · PostgreSQL 15", topics:"WAL · replication slots · Debezium", study:["postgres/slots","postgres:1","postgres:9","debezium:7"]},
  {z:"spark", i:1, icon:"💥", sev:2, title:"Executors keep getting killed", svc:"risk-features · Spark on EMR", topics:"Executor memory · memoryOverhead · pandas UDFs", study:["spark/memory","spark:12","spark:17"]},
  {z:"rag", i:0, icon:"🤖", sev:2, title:"The bot can't find the new policy", svc:"support-assistant · RAG", topics:"Embeddings · vector search · RAG evals", study:["rag/embeddings","rag/evals","rag:1","rag:5"]},
  {z:"mysql", i:0, icon:"🐌", sev:2, title:"Read replica is 40 minutes behind", svc:"payments-mysql · reporting replica", topics:"Row-based replication · primary keys · batched purges", study:["mysql:3","mysql:9","mysql:0"]},
  {z:"iceberg", i:0, icon:"🧊", sev:2, title:"Queries spend 3 minutes just planning", svc:"lake.payments · Iceberg on S3 + Trino", topics:"Snapshots · manifests · table maintenance", study:["iceberg:0","iceberg:4","iceberg:6"]},
  {z:"debezium", i:0, icon:"🕳️", sev:1, title:"The lake is missing two days of orders", svc:"orders-cdc · Debezium MySQL connector", topics:"Binlog retention · snapshots · connector ops", study:["debezium:2","debezium:6","debezium:8","debezium:10"]},
  {z:"dbt", i:0, icon:"📈", sev:1, title:"Revenue doubled overnight", svc:"finance mart · dbt on Snowflake", topics:"Incremental models · unique_key · tests", study:["dbt:1","dbt:6","dbt:2"]},
  {z:"redshift", i:0, icon:"🧭", sev:3, title:"The 9 AM dashboard takes 6 minutes", svc:"exec-dashboard · Redshift ra3", topics:"Distribution keys · sort keys · statistics", study:["redshift:1","redshift:2","redshift:5"]},
  {z:"agents", i:0, icon:"🔁", sev:1, title:"An agent burned ₹4 lakh overnight", svc:"refund-agent · LangGraph", topics:"Agent loops · step limits · tool errors · cost", study:["agents:1","agents:6","agents:7","observability:8"]},
  {z:"aiattack", i:0, icon:"🕵️", sev:1, title:"The bot emailed customer data outside", svc:"support-agent · tools: email, CRM", topics:"Indirect prompt injection · least privilege · exfiltration", study:["aiattack:0","aiattack:2","aiattack:6","aidefense:2"]}
];
Q.CASES = CASES;
const csStars = (z, i) => ((P.cs || {})[z] || {})[i] || 0;
const caseList = list => `<div class="q-cases">${list.map(c => { const s = csStars(c.z, c.i); return `<a class="q-case" href="#case-${c.z}-${c.i}" style="--h:${ZMAP[c.z].hue}">
  <span class="q-case-ic">${c.icon}</span><div><span class="q-sev s${c.sev}">SEV-${c.sev}</span><b>${esc(c.title)}</b><small>${esc(c.svc)}</small>${c.topics ? `<small class="q-case-top">📚 ${esc(c.topics)}</small>` : ""}${s ? stars(s, "sm") : ""}</div><span class="q-ep-go">${s ? "Replay" : "Take the page"}</span></a>`; }).join("")}</div>`;
const learnHTML = (r, open) => `<div class="q-studyl"><h4>${fm(r[1])}</h4><p>${fm(r[2])}</p>${r[3] && r[3].length ? `<ol class="q-flow">${r[3].map(f => `<li>${fm(f)}</li>`).join("")}</ol>` : ""}${r[4] ? `<pre class="q-code">${esc(r[4])}</pre>` : ""}${r[5] ? `<details class="q-deep" ${open ? "open" : ""}><summary>Go deeper</summary><div class="q-deep-b">${md(r[5])}</div></details>` : ""}</div>`;
const refInfo = ref => {
  let m;
  if ((m = ref.match(/^([a-z]+):(\d+)$/))){
    const Z = Q.data[m[1]], L = Z && Z.levels[+m[2]]; if (!L) return null;
    const ls = (L.rounds || []).filter(r => r[0] === "learn");
    return {ref, z:m[1], zone:ZMAP[m[1]].title, kind:`Drill ${+m[2] + 1}`, title:L.t, sub:ls.map(r => r[1]).join(" · "), body:ls.map(r => learnHTML(r)).join(""), href:`#learn-${m[1]}-${m[2]}`};
  }
  if ((m = ref.match(/^([a-z]+)\/(\w+)$/))){
    const Z = Q.data[m[1]], C = Z && Z.cardBook && Z.cardBook[m[2]]; if (!C) return null;
    return {ref, z:m[1], zone:ZMAP[m[1]].title, kind:"Concept card", title:C.t, sub:C.one || "", body:cardHTML(C, "deck"), href:`#card-${m[1]}-${m[2]}`};
  }
  return null;
};
const refList = (refs, mode) => `<div class="q-refs">${refs.map(refInfo).filter(Boolean).map(R => mode === "links"
  ? `<a class="q-reflink" href="${R.href}" target="_blank" rel="noopener"><span class="q-ref-k">📚 ${esc(R.zone)} · ${esc(R.kind)}</span><b>${fm(R.title)}</b><small>${fm(R.sub)}</small><span class="q-ref-go">↗</span></a>`
  : `<details class="q-ref"><summary><span class="q-ref-k">📚 ${esc(R.zone)} · ${esc(R.kind)}</span><b>${fm(R.title)}</b><small>${fm(R.sub)}</small></summary><div class="q-ref-b">${R.body}<a class="btn" href="${R.href}" target="_blank" rel="noopener">Open in the course ↗</a></div></details>`).join("")}</div>`;
const needZones = (ids, cb) => { const rest = ids.filter(x => ZMAP[x] && !Q.data[x]); if (!rest.length) return cb(); needZone(rest[0], () => needZones(ids, cb)); };
const reg = (z, i) => CASES.find(c => c.z === z && c.i === i) || {};
const refZones = refs => [...new Set((refs || []).map(r => r.split(/[:/]/)[0]))];
const casesFor = ref => ALLW().filter(c => (c.study || []).includes(ref));
function studyView(id, li, key){
  const z = ZMAP[id]; if (!z){ location.hash = "#play"; return; }
  needZone(id, () => {
    const Z = Q.data[id], ref = key ? `${id}/${key}` : `${id}:${li}`, R = refInfo(ref);
    if (!R){ location.hash = "#zone-" + id; return; }
    document.title = `${R.title} · ${z.title} · Dagdeep`;
    const L = key ? null : Z.levels[li], cs = casesFor(ref);
    const body = key ? cardHTML(Z.cardBook[key]) : (L.rounds || []).filter(r => r[0] === "learn").map(r => learnHTML(r, true)).join("");
    root().innerHTML = `<div class="q-wrap q-studyv" style="--h:${z.hue}; --hc:hsl(${z.hue} 70% 45%)">
      <a class="q-back" href="#zone-${id}/${key ? "cards" : "drills"}">← ${esc(z.title)}</a>
      <p class="q-eyebrow">📚 Course · ${esc(z.title)} · ${esc(R.kind)}</p><h1>${fm(R.title)}</h1>
      ${body || `<p class="muted">This drill is hands-on practice. Play it to learn by doing.</p>`}
      <div class="q-res-b">${key ? `<a class="btn big" href="#zone-${id}/cards">All ${esc(z.title)} cards</a>` : unlocked(id, li) ? `<a class="btn big solid" href="#lvl-${id}-${li}">Practise this drill ▶</a>` : `<a class="btn big" href="#zone-${id}/drills">${esc(z.title)} drills</a>`}</div>
      ${cs.length ? `<h2 class="q-sec-h">💼 Use it at work</h2><p class="muted">Work-simulator tasks that use this concept.</p>${workList(cs)}` : ""}</div>`;
  });
}
const termFmt = t => esc(t).replace(/\[(r|y|g|b|d|c)\]([\s\S]*?)\[\/\1\]/g, '<span class="t-$1">$2</span>');
const nfmt = v => v >= 1e9 ? +(v / 1e9).toFixed(1) + "B" : v >= 1e6 ? +(v / 1e6).toFixed(1) + "M" : v >= 1e3 ? +(v / 1e3).toFixed(1) + "k" : +(+v).toFixed(2) + "";
function chartSVG(D){
  const W = 560, H = 180, pl = 44, pr = 12, pt = 18, pb = 24, n = D.x.length;
  const top = Math.max(...D.series.flatMap(s => s.v)) || 1, mag = Math.pow(10, Math.floor(Math.log10(top))), max = D.max || Math.ceil(top / mag * 1.1) * mag;
  const X = i => pl + i * (W - pl - pr) / Math.max(1, n - 1), Y = v => pt + (H - pt - pb) * (1 - v / max);
  const cols = ["var(--hc)", "#8b95a5", "#d97706", "#0ea5e9"];
  const grid = [0, .5, 1].map(f => `<line x1="${pl}" x2="${W - pr}" y1="${Y(max * f)}" y2="${Y(max * f)}" class="g"/><text x="${pl - 6}" y="${Y(max * f) + 4}" text-anchor="end">${nfmt(max * f)}${f ? esc(D.unit || "") : ""}</text>`).join("");
  const step = Math.ceil(n / 6), xl = D.x.map((l, i) => i % step === 0 || i === n - 1 ? `<text x="${X(i)}" y="${H - 6}" text-anchor="middle">${esc(l)}</text>` : "").join("");
  const marks = (D.marks || []).map(m => `<line x1="${X(m.i)}" x2="${X(m.i)}" y1="${pt - 4}" y2="${H - pb}" class="mk"/><text x="${X(m.i) + 4}" y="${pt + 4}" class="mkt">${esc(m.label)}</text>`).join("");
  const lines = D.series.map((s, k) => `<polyline fill="none" stroke="${cols[k % 4]}" stroke-width="2.4" stroke-linejoin="round" points="${s.v.map((v, i) => X(i) + "," + Y(v)).join(" ")}"/>`).join("");
  const leg = D.series.length > 1 ? `<div class="q-leg">${D.series.map((s, k) => `<span><i style="background:${cols[k % 4]}"></i>${esc(s.name)}</span>`).join("")}</div>` : "";
  return `<svg viewBox="0 0 ${W} ${H}" class="q-chart" role="img" aria-label="${esc(D.title)}">${grid}${marks}${lines}${xl}</svg>${leg}`;
}
function caseView(id, ci){
  const z = ZMAP[id]; if (!z){ location.hash = "#play"; return; }
  needZone(id, () => {
    const Z = Q.data[id], C = (Z.cases || [])[ci];
    if (!C){ location.hash = "#zone-" + id; return; }
    const R = reg(id, ci); C.study = C.study || R.study || [];
    needZones(refZones(C.study), () => pagerView(id, ci, z, Z, C));
  });
}
function pagerView(id, ci, z, Z, C){
  {
    P.last = id; save(); setKeys(null);
    document.title = `${C.title} · On-call · Dagdeep`;
    const sev = C.sev || 2, need = C.need || 3, first = !P.ach.pager;
    root().innerHTML = `<div class="q-wrap q-pagerv" style="--h:${z.hue}">
      <div class="q-pager"><div class="q-pager-ring">📟</div>
        <p class="q-eyebrow">Incoming page · ${esc(C.clock || "03:12")}</p>
        <span class="q-sev s${sev}">SEV-${sev}</span>
        <h1>${esc(C.title)}</h1>
        <pre class="q-pager-alert">${termFmt(C.pager)}</pre>
        <p class="q-pager-brief">${fm(C.brief || "")}</p>
        <ul class="q-pg-rules">
          <li><b>Investigate</b> with the tools and 🚩 flag what explains the alert.</li>
          <li>With <b>${need} clues</b>, open 📝 Notes: pick the root cause and every fix you'd ship.</li>
          <li>Wrong calls backfire. ❓ Guide has the full rules and terms.</li></ul>
        ${C.study.length ? `<details class="q-pg-study"><summary>📚 Brush up first <small>(${C.study.length} course pages)</small></summary>${refList(C.study, "links")}</details>` : ""}
        <button class="btn big solid q-ack">Acknowledge &amp; join the bridge</button>
        <a class="q-back" href="#work/incident">Not now</a></div></div>`;
    const ackB = root().querySelector(".q-ack");
    ackB.onclick = () => desk(id, ci, z, Z, C);
    setKeys(e => { if (!document.body.contains(ackB)){ setKeys(null); return; } if (e.key === "Enter"){ e.preventDefault(); desk(id, ci, z, Z, C); } });
  }
}
function desk(id, ci, z, Z, C){
  setKeys(null); mix(C.cause.o); mix(C.fix.o);
  const sev = C.sev || 2, T = C.term || {}, clueIds = Object.keys(C.clues), need = C.need || Math.max(1, clueIds.length - 1);
  const st = {t0:Date.now(), found:{}, order:[], log:[], hints:0, wrong:0, noise:0, cmds:0, unread:0, app:"slack", fired:new Set(), chips:(T.suggest || []).slice(), hist:[], hp:0, cause:null, fix:new Set(), done:false};
  const base = (C.clock || "03:12").split(":").map(Number);
  const wall = s => { const m = base[0] * 60 + base[1] + Math.floor(s / 60); return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
  const el = () => Math.floor((Date.now() - st.t0) / 1000);
  const mmss = s => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const log = (ic, t) => st.log.push({s:el(), ic, t});
  const apps = [["slack", "💬", "Slack"], ["term", "⌨️", "Terminal"]];
  if (C.dash) apps.push(["dash", "📈", "Dashboards"]);
  if (C.ui) apps.push(["ui", "🖥", C.uiName || "Console"]);
  if (C.files) apps.push(["code", "🧾", "Code"]);
  apps.push(["notes", "📝", "Notes"], ["guide", "❓", "Guide"]);
  const host = T.host || "prod-bastion", user = T.user || "you";
  root().innerHTML = `<div class="q-wrap q-desk" style="--h:${z.hue}; --hc:hsl(${z.hue} 70% 45%)">
    <div class="q-incbar"><a class="q-x" href="#work/incident" aria-label="Leave">✕</a>
      <span class="q-sev s${sev}">SEV-${sev}</span>
      <div class="q-inc-t"><b>${esc(C.title)}</b><small>#${esc(C.channel || "inc")} · ${esc(C.svc || z.title)}</small></div>
      <span class="q-inc-st"><span class="q-inc-clock" title="Time since you acknowledged">⏱ 00:00</span><span class="q-inc-clues" title="Clues found · ${need} needed to write up">🔎 0/${clueIds.length}</span></span></div>
    <nav class="q-dock" role="tablist">${apps.map(([k, ic, l]) => `<button role="tab" data-app="${k}" aria-selected="${k === "slack"}"><span>${ic}</span><small>${l}</small><i class="q-badge-n" hidden></i></button>`).join("")}</nav>
    <div class="q-apps">
      <section class="q-app" data-app="slack"><p class="q-app-tip">Your team. They share leads and react to what you ship.</p><div class="q-slack-h"># ${esc(C.channel || "inc")}</div><div class="q-slack"></div>
        <div class="q-slack-f"><button class="btn q-hint">💡 Ask for a hint <small>(${(C.hints || []).length} left)</small></button></div></section>
      <section class="q-app" data-app="term" hidden><p class="q-app-tip">Type a command or tap a suggestion. 🚩 any output that explains the alert.</p><div class="q-term"><div class="q-term-out"><p class="t-d">${termFmt(T.motd || `Connected to ${host}. Type «help» for ideas.`).replace(/«(.+?)»/g, "<b>$1</b>")}</p></div>
        <form class="q-term-in" autocomplete="off"><span class="q-ps">${esc(user)}@${esc(host)}:~$</span><input aria-label="Terminal command" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go"></form></div>
        <div class="q-chips" aria-label="Suggested commands"></div></section>
      ${C.dash ? `<section class="q-app" data-app="dash" hidden><p class="q-app-tip">Find what changed, and when. Red lines are deploys/events.</p><div class="q-dash">${C.dash.map((D, k) => `<div class="q-dpanel" data-k="${k}"><header><b>${esc(D.title)}</b><button class="q-flag" data-src="dash" data-k="${k}">🚩 Flag</button></header>${chartSVG(D)}</div>`).join("")}</div></section>` : ""}
      ${C.ui ? `<section class="q-app" data-app="ui" hidden><p class="q-app-tip">The system's own UI. 🚩 what explains the alert.</p><div class="q-dash">${C.ui.map((U, k) => `<div class="q-dpanel q-uipanel" data-k="${k}"><header><b>${esc(U.title)}</b><button class="q-flag" data-src="ui" data-k="${k}">🚩 Flag</button></header>${U.img ? shot(U.img, U.cap) : ""}${U.md ? `<div class="q-uimd">${md(U.md)}</div>` : ""}</div>`).join("")}</div></section>` : ""}
      ${C.files ? `<section class="q-app" data-app="code" hidden><p class="q-app-tip">Tap a line to flag it.</p><div class="q-ftabs">${C.files.map((F, k) => `<button data-f="${k}" aria-pressed="${k === 0}">${esc(F.path.split("/").pop())}</button>`).join("")}</div><div class="q-codev"></div></section>` : ""}
      <section class="q-app" data-app="notes" hidden><p class="q-app-tip">Your evidence, then the write-up.</p><div class="q-notes"></div></section>
      <section class="q-app" data-app="guide" hidden><div class="q-guide"></div></section>
    </div></div>`;
  const $ = s => root().querySelector(s), $$ = s => root().querySelectorAll(s);
  const slackEl = $(".q-slack"), out = $(".q-term-out"), inp = $(".q-term-in input");
  const alive = () => document.body.contains(slackEl) && !st.done;
  const show = k => {
    st.app = k;
    $$(".q-dock button").forEach(b => b.setAttribute("aria-selected", b.dataset.app === k));
    $$(".q-app").forEach(a => a.hidden = a.dataset.app !== k);
    if (k === "slack"){ st.unread = 0; badge(); slackEl.lastElementChild && slackEl.lastElementChild.scrollIntoView({block:"nearest"}); }
    if (k === "notes") notes();
    if (k === "guide") guide();
    if (k === "term" && matchMedia("(hover: hover)").matches) inp.focus();
  };
  const badge = () => { const b = $('.q-dock [data-app="slack"] .q-badge-n'); if (b){ b.hidden = !st.unread; b.textContent = st.unread; } };
  $$(".q-dock button").forEach(b => b.onclick = () => show(b.dataset.app));
  $$(".q-stepper button").forEach(b => b.onclick = () => show(b.dataset.go));
  const stepper = () => {
    if (!$(".q-stepper")) return;
    const n = Object.keys(st.found).length, sb = $$(".q-stepper button"), stage = n < need ? 0 : st.cause == null ? 1 : 2;
    sb.forEach((b, k) => { b.classList.toggle("on", k === stage); b.classList.toggle("done", k < stage); });
    const sn = $(".q-st-n"); if (sn) sn.textContent = `${Math.min(n, need)}/${need} clues`;
  };
  const TOOLS = [["💬", "Slack", "The incident channel on Slack or Teams", "Read what teammates know. Tap ⌨️ commands they suggest. Ask for a hint if stuck (costs stars)."],
    ["⌨️", "Terminal", "SSH into a prod box or bastion", "Type commands (or tap suggestions). Flag outputs that explain the alert."],
    ...(C.dash ? [["📈", "Dashboards", "Grafana, Datadog, CloudWatch", "Find *when* things changed and *what* changed with it. Red dashed lines are deploys/events."]] : []),
    ...(C.ui ? [["🖥", C.uiName || "Console", "The system's own UI", "Look for the internal detail behind the symptom."]] : []),
    ...(C.files ? [["🧾", "Code", "GitHub / GitLab", "Find the line or the recent change that caused it."]] : []),
    ["📝", "Notes", "Your incident doc", "Evidence you've flagged, then the root cause and the fixes you ship."]];
  const guideEl = $(".q-guide");
  function guide(){
    guideEl.innerHTML = `<h3>🎯 Your goal</h3><p>Find <b>why</b> “${esc(C.title)}” is happening, back it with evidence, and ship the fix that resolves it <b>without breaking anything else</b>. That's what a good on-call engineer does.</p>
      <div class="q-gstat"><span>🔎 <b>${Object.keys(st.found).length}</b>/${need} clues</span><span>💡 <b>${st.hints}</b> hints</span><span>❌ <b>${st.wrong}</b> wrong calls</span><span>🙅 <b>${st.noise}</b> noise flags</span></div>
      <h3>🧭 How to play</h3><ol class="q-gsteps">
        <li><b>Investigate.</b> Start in Slack, then use the terminal and the other tools. Ask: <i>what changed, and when?</i></li>
        <li><b>Flag evidence 🚩.</b> Every terminal output, dashboard panel, console panel and code line can be flagged. <span class="q-gk yes">✓ green</span> = a real clue, saved to Notes. <span class="q-gk no">✗ grey</span> = noise; it tells you why it isn't the cause.</li>
        <li><b>Name the root cause.</b> After <b>${need} clues</b>, open 📝 Notes and pick the <b>one</b> cause that explains <i>all</i> the evidence.</li>
        <li><b>Ship the fix.</b> Tick <b>every</b> action you'd take now. A complete fix usually <b>stops the damage today</b> and <b>stops it from happening again</b>. Leave out anything that would make things worse.</li>
        <li><b>Read the postmortem.</b> It's built from your own actions, with the real root cause, the traps, and interview answers.</li></ol>
      <h3>🧰 Your tools</h3><div class="q-tw"><table><thead><tr><th>Tool</th><th>In real life</th><th>What to do here</th></tr></thead><tbody>${TOOLS.map(t => `<tr><td>${t[0]} <b>${esc(t[1])}</b></td><td>${esc(t[2])}</td><td>${fm(t[3])}</td></tr>`).join("")}</tbody></table></div>
      <h3>🧩 What happens when you ship</h3><ul>
        <li><b>Wrong root cause</b>: the team pushes back in Slack with evidence. Counts as a wrong call.</li>
        <li><b>A harmful fix</b> (e.g. deleting data, hiding the symptom): it backfires in prod. Wrong call.</li>
        <li><b>A missing essential fix</b>: the alert keeps firing or it'll happen again tomorrow. Wrong call.</li>
        <li><b>Nice-to-have fixes</b> (alerts, guardrails) are never wrong, and the postmortem lists any you skipped.</li></ul>
      <h3>⭐ Scoring</h3><div class="q-tw"><table><tbody><tr><td>⭐⭐⭐</td><td>No wrong calls, at most 1 hint, at most 3 noise flags</td></tr><tr><td>⭐⭐</td><td>At most 1 wrong call and at most 2 hints</td></tr><tr><td>⭐</td><td>Resolved</td></tr></tbody></table></div>
      ${C.terms ? `<h3>📖 Terms in this incident</h3><dl class="q-terms">${C.terms.map(([t, d]) => `<dt>${fm(t)}</dt><dd>${fm(d)}</dd>`).join("")}</dl>` : ""}
      ${C.study.length ? `<h3>📚 Study material for this incident</h3><p class="muted">Straight from the course. Expand to read here, or open the full page in a new tab. Your investigation stays put.</p>${refList(C.study)}` : ""}
      <button class="btn big solid q-gback">Back to investigating ▸</button>`;
    guideEl.querySelector(".q-gback").onclick = () => show(Object.keys(st.found).length >= need ? "notes" : "slack");
  }
  // Slack
  const post = async (list, gap = 700) => {
    for (const m of list){
      if (!alive()) return;
      const [who, t, cmd] = Array.isArray(m) ? m : [m.who, m.t, m.cmd];
      const c = CAST[who] || [who, "", 200];
      slackEl.insertAdjacentHTML("beforeend", `<div class="q-msg q-smsg" style="--ch:${c[2]}"><span class="q-av">${esc(c[0][0])}</span><div class="q-bub"><b>${esc(c[0])} <small>${esc(c[1])} · ${wall(el())}</small></b><p>${fm(t)}</p>${cmd ? `<button class="q-runchip" data-cmd="${esc(cmd)}">⌨️ ${esc(cmd)}</button>` : ""}</div></div>`);
      if (cmd && !st.chips.includes(cmd)){ st.chips.push(cmd); chips(); }
      if (st.app === "slack") slackEl.lastElementChild.scrollIntoView({block:"nearest", behavior:reduce() ? "auto" : "smooth"});
      else { st.unread++; badge(); toast(`💬 <b>${esc(c[0])}</b>: ${esc(String(t).replace(/[*«»]/g, "").slice(0, 70))}${String(t).length > 70 ? "…" : ""}`); }
      await sleep(gap);
    }
  };
  slackEl.addEventListener("click", e => { const b = e.target.closest(".q-runchip"); if (b){ show("term"); run(b.dataset.cmd); } });
  const hintB = $(".q-hint");
  hintB.onclick = () => {
    const H = C.hints || []; if (st.hints >= H.length) return;
    const h = H[st.hints++]; log("💡", "Asked for a hint");
    hintB.innerHTML = `💡 Ask for a hint <small>(${H.length - st.hints} left)</small>`; hintB.disabled = st.hints >= H.length;
    post([Array.isArray(h) ? h : ["priya", "💡 " + h]]);
  };
  hintB.disabled = !(C.hints || []).length;
  // Clock + timed messages
  const tick = setInterval(() => {
    if (!alive()){ clearInterval(tick); return; }
    const s = el(); const ce = $(".q-inc-clock"); if (ce) ce.textContent = "⏱ " + mmss(s);
    (C.slack || []).forEach((m, k) => { if (m.at != null && !st.fired.has(k) && s >= m.at){ st.fired.add(k); post([m]); } });
  }, 1000);
  (C.slack || []).forEach((m, k) => { if (m.at === 0){ st.fired.add(k); } });
  post((C.slack || []).filter(m => m.at === 0), 900);
  // Evidence
  const clueCount = () => { const n = Object.keys(st.found).length, e = $(".q-inc-clues"); if (e){ e.textContent = `🔎 ${n}/${clueIds.length}`; e.title = `${n} clues found · ${need} needed to write up`; e.classList.toggle("ok", n >= need); } stepper(); return n; };
  const flagNote = (anchor, html, cls) => {
    const isLine = anchor.classList.contains("q-cl");
    const old = isLine ? (anchor.nextElementSibling && anchor.nextElementSibling.classList.contains("q-flagnote") ? anchor.nextElementSibling : null) : anchor.querySelector(":scope > .q-flagnote");
    if (old) old.remove();
    anchor.insertAdjacentHTML(isLine ? "afterend" : "beforeend", `<div class="q-flagnote ${cls}">${html}</div>`);
  };
  const flag = (cid, src, anchor, note) => {
    if (cid){
      if (st.found[cid]){ toast("Already in your notes"); return; }
      st.found[cid] = src; st.order.push(cid); log("🔎", `Evidence from ${src}: ${C.clues[cid]}`);
      anchor.classList.add("flagged"); flagNote(anchor, `🔎 <b>Clue added to notes:</b> ${fm(C.clues[cid])}`, "yes");
      const n = clueCount();
      if (n === need) setTimeout(() => toast("📝 Enough evidence — open <b>Notes</b> to write up the root cause"), 900);
      const trig = (C.slack || []).map((m, k) => [m, k]).filter(([m, k]) => m.on === cid && !st.fired.has(k));
      trig.forEach(([, k]) => st.fired.add(k));
      if (trig.length) setTimeout(() => post(trig.map(([m]) => m)), 1200);
    } else {
      st.noise++; log("🙅", `Flagged noise in ${src}`);
      anchor.classList.add("noise"); flagNote(anchor, `🙅 <b>Not evidence.</b> ${fm(note || "This looks normal — it doesn't explain the alert.")}`, "no");
    }
  };
  $$(".q-flag").forEach(b => b.onclick = () => {
    const k = +b.dataset.k, src = b.dataset.src, D = (src === "dash" ? C.dash : C.ui)[k];
    flag(D.clue, src === "dash" ? `dashboard “${D.title}”` : `${C.uiName || "console"} “${D.title}”`, b.closest(".q-dpanel"), D.note);
  });
  // Code viewer
  if (C.files){
    const cv = $(".q-codev");
    const file = k => {
      const F = C.files[k];
      $$(".q-ftabs button").forEach(b => b.setAttribute("aria-pressed", +b.dataset.f === k));
      cv.innerHTML = `<div class="q-fpath">${esc(F.path)}${F.meta ? ` <small>${esc(F.meta)}</small>` : ""}</div><div class="q-clines">${F.text.split("\n").map((l, i) => `<button class="q-cl" data-f="${k}" data-n="${i + 1}"><span>${i + 1}</span><code>${esc(l) || " "}</code></button>`).join("")}</div>`;
      cv.querySelectorAll(".q-cl").forEach(b => b.onclick = () => {
        const n = +b.dataset.n, cid = (F.clues || {})[n];
        if (!cid && !l2(F, n)) { b.classList.add("q-meh"); setTimeout(() => b.classList.remove("q-meh"), 600); st.noise++; toast("🙅 That line is fine"); log("🙅", `Flagged a harmless line in ${F.path}`); return; }
        if (!cid){ flag(null, F.path, b, l2(F, n)); return; }
        flag(cid, `${F.path}:${n}`, b, null);
      });
    };
    const l2 = (F, n) => (F.notes || {})[n];
    $$(".q-ftabs button").forEach(b => b.onclick = () => file(+b.dataset.f));
    file(0);
  }
  // Terminal
  const norm = s => s.trim().replace(/\s+/g, " ").toLowerCase();
  const chips = () => { const c = $(".q-chips"); if (c) c.innerHTML = `<small>Try:</small>` + st.chips.map(x => `<button class="q-chip" data-cmd="${esc(x)}">${esc(x)}</button>`).join(""); c && c.querySelectorAll(".q-chip").forEach(b => b.onclick = () => run(b.dataset.cmd)); };
  chips();
  const known = new Set((T.cmds || []).flatMap(c => c.m.map(p => norm(p).split(" ")[0])));
  const run = raw => {
    const cmd = String(raw).trim(); if (!cmd) return;
    st.hist.push(cmd); st.hp = st.hist.length; st.cmds++;
    const n = norm(cmd), ps = `<p class="q-tcmd"><span class="q-ps">${esc(user)}@${esc(host)}:~$</span> ${esc(cmd)}</p>`;
    let body = "", hit = null;
    if (n === "clear"){ out.innerHTML = ""; inp.value = ""; return; }
    if (n === "help") body = `<pre>${termFmt(`Commands worth trying here:\n${st.chips.map(x => "  " + x).join("\n")}\n\nTeammates in Slack will suggest more as you dig.\nTap 🚩 on any output that explains the alert.\nOther: history, clear, whoami, date`)}</pre>`;
    else if (n === "history") body = `<pre>${esc(st.hist.map((h, i) => `${String(i + 1).padStart(4)}  ${h}`).join("\n"))}</pre>`;
    else if (n === "whoami") body = `<pre>${esc(user)}  (on-call, ${esc(C.svc || z.title)})</pre>`;
    else if (n === "date") body = `<pre>${esc(new Date().toDateString())} ${wall(el())}:00 IST</pre>`;
    else {
      let best = -1;
      (T.cmds || []).forEach(c => c.m.forEach(p => { const q = norm(p); if ((n === q || n.startsWith(q + " ") || n.startsWith(q)) && q.length > best){ best = q.length; hit = c; } }));
      if (hit){
        log("⌨️", `Ran «${cmd.length > 60 ? cmd.slice(0, 57) + "…" : cmd}»`);
        body = `<div class="q-tblock"><pre>${termFmt(hit.out)}</pre><button class="q-flag q-tflag">🚩 Flag this output</button></div>`;
        (hit.unlock || []).forEach(u => { if (!st.chips.includes(u)) st.chips.push(u); }); chips();
      } else if (known.has(n.split(" ")[0])) body = `<pre class="t-y">${esc("Nothing useful came back. Check the arguments, or type help for commands that work on this box.")}</pre>`;
      else body = `<pre class="t-r">${esc(`bash: ${cmd.split(" ")[0]}: command not found`)}</pre>`;
    }
    out.insertAdjacentHTML("beforeend", ps + body);
    const blk = out.lastElementChild;
    if (hit){ const b = blk.querySelector(".q-tflag"); b.onclick = () => flag(hit.clue, `terminal «${cmd.length > 40 ? cmd.slice(0, 37) + "…" : cmd}»`, blk, hit.note); }
    inp.value = ""; out.scrollTop = out.scrollHeight;
    if (st.app !== "term") show("term");
  };
  $(".q-term-in").onsubmit = e => { e.preventDefault(); run(inp.value); };
  inp.onkeydown = e => {
    if (e.key === "ArrowUp"){ e.preventDefault(); if (st.hp > 0) inp.value = st.hist[--st.hp]; }
    if (e.key === "ArrowDown"){ e.preventDefault(); if (st.hp < st.hist.length - 1) inp.value = st.hist[++st.hp]; else { st.hp = st.hist.length; inp.value = ""; } }
    if (e.key === "Tab"){ e.preventDefault(); const v = norm(inp.value); const m = st.chips.find(x => norm(x).startsWith(v) && v); if (m) inp.value = m; }
  };
  // Notes + write-up
  const notesEl = $(".q-notes");
  function notes(){
    const n = Object.keys(st.found).length;
    notesEl.innerHTML = `<h3>🔎 Evidence <small>${n} found · need ${need}</small></h3>
      ${n ? `<ol class="q-evid">${st.order.map(k => `<li><b>${fm(C.clues[k])}</b><small>${esc(st.found[k])}</small></li>`).join("")}</ol>` : `<p class="muted">Nothing yet. Run commands, read dashboards and code, and 🚩 flag what explains the alert.</p>`}
      <h3>📝 Incident write-up</h3>
      ${n < need ? `<div class="q-locked">🔒 Find at least <b>${need}</b> clues before you call the root cause. Guessing in an incident costs trust.</div>` : `
      <fieldset class="q-wf"><legend>${fm(C.cause.q || "What's the root cause?")}</legend>${C.cause.o.map((o, i) => `<label class="q-wopt"><input type="radio" name="cause" value="${i}" ${st.cause === i ? "checked" : ""}><span>${fm(o.t)}</span></label>`).join("")}</fieldset>
      <fieldset class="q-wf"><legend>${fm(C.fix.q || "What do you ship? Pick every action you'd take.")}</legend>${C.fix.o.map((o, i) => `<label class="q-wopt"><input type="checkbox" value="${i}" ${st.fix.has(i) ? "checked" : ""}><span>${fm(o.t)}</span></label>`).join("")}</fieldset>
      <button class="btn big solid q-ship">🚀 Ship the fix</button>`}`;
    notesEl.querySelectorAll('input[name="cause"]').forEach(r => r.onchange = () => { st.cause = +r.value; stepper(); });
    notesEl.querySelectorAll('input[type="checkbox"]').forEach(r => r.onchange = () => r.checked ? st.fix.add(+r.value) : st.fix.delete(+r.value));
    const sb = notesEl.querySelector(".q-ship"); if (sb) sb.onclick = ship;
  }
  async function ship(){
    if (st.cause == null || !st.fix.size){ toast("Pick a root cause and at least one action"); return; }
    const co = C.cause.o[st.cause];
    if (!co.ok){
      st.wrong++; log("❌", `Called the wrong root cause: ${co.t}`);
      show("slack"); toast("❌ The team isn't convinced — check Slack");
      await post(co.say && co.say.length ? co.say : [["priya", "That doesn't explain everything we're seeing. What does the evidence actually say?"]]);
      return;
    }
    const sel = [...st.fix].sort((a, b) => a - b).map(i => C.fix.o[i]);
    const bad = sel.filter(o => o.kind === "bad"), miss = C.fix.o.filter(o => o.kind === "must" && !sel.includes(o));
    if (bad.length){
      st.wrong++; log("💥", `Shipped a harmful change: ${bad.map(o => o.t).join("; ")}`);
      show("slack"); toast("💥 That change made things worse — check Slack");
      await post(bad.flatMap(o => o.say && o.say.length ? o.say : [["ravi", `Rolled back «${o.t}» — it made things worse.`]]));
      return;
    }
    if (miss.length){
      st.wrong++; log("⚠️", "Shipped a partial fix — alert still firing");
      show("slack"); toast("⚠️ Alert still firing — check Slack");
      await post(miss.flatMap(o => o.miss || []).concat(miss.some(o => o.miss) ? [] : (C.fix.miss || [["ravi", "Deployed, but the alert is still firing. We've treated a symptom, not the cause."]])));
      return;
    }
    log("🚀", "Shipped the fix"); log("✅", "Alert resolved — incident closed");
    resolve(sel);
  }
  function resolve(sel){
    st.done = true; clearInterval(tick);
    const secs = el(), s = st.wrong === 0 && st.hints <= 1 && st.noise <= 3 ? 3 : st.wrong <= 1 && st.hints <= 2 ? 2 : 1;
    P.cs = P.cs || {}; P.cs[id] = P.cs[id] || {}; const prev = P.cs[id][ci] || 0;
    const cards = (C.cards || []).map(k => [k, (Z.cardBook || {})[k]]).filter(([, c]) => c);
    let newC = 0; P.cards[id] = P.cards[id] || [];
    cards.forEach(([k]) => { const cid = "c:" + k; if (!P.cards[id].includes(cid)){ P.cards[id].push(cid); newC++; } });
    const gain = 60 + Math.max(0, s - prev) * 30 + newC * 5;
    if (s > prev) P.cs[id][ci] = s;
    save(); addXP(gain); unlock("pager"); if (st.wrong === 0 && st.hints === 0) unlock("sherlock");
    if (s === 3) confetti(); if (totalCards() >= 10) unlock("collector");
    const hr = new Date().getHours(); if (hr >= 23 || hr < 4) unlock("owl");
    const nxI = CASES.findIndex(c => c.z === id && c.i === ci), nx = CASES[nxI + 1];
    const good = sel.filter(o => o.kind === "must" || o.kind === "good"), meh = sel.filter(o => o.kind === "meh");
    root().innerHTML = `<div class="q-wrap q-postm" style="--h:${z.hue}; --hc:hsl(${z.hue} 70% 45%)">
      <div class="q-res won"><p class="q-eyebrow">Incident resolved · ${wall(secs)}</p><h2>✅ ${esc(C.title)}</h2>${stars(s, "big")}
        <div class="q-res-stats"><span><small>Time to resolve</small><b>${mmss(secs)}</b></span><span><small>Commands</small><b>${st.cmds}</b></span><span><small>Hints</small><b>${st.hints}</b></span><span><small>Wrong calls</small><b>${st.wrong}</b></span><span><small>XP</small><b>+${gain}</b></span></div>
        ${s < 3 ? `<p class="muted">3 stars: no wrong calls, at most 1 hint, and only flag real evidence.</p>` : ""}</div>
      <article class="q-pm"><header><small>POSTMORTEM · blameless</small><h2>${esc(C.title)}</h2><p>${esc(C.svc || "")} · SEV-${sev} · duration ${mmss(secs)}</p></header>
        ${C.post && C.post.summary ? `<section><h3>Summary</h3>${md(C.post.summary)}</section>` : ""}
        <section><h3>Timeline <small>(IST)</small></h3><ol class="q-tl"><li><time>${wall(0)}</time><span>📟 Paged: ${esc(C.title)}</span></li>${st.log.map(e => `<li class="${e.ic === "❌" || e.ic === "💥" || e.ic === "⚠️" ? "bad" : ""}"><time>${wall(e.s)}</time><span>${e.ic} ${fm(e.t)}</span></li>`).join("")}</ol></section>
        <section><h3>Root cause</h3>${md(C.post ? C.post.cause : "")}</section>
        <section><h3>What fixed it</h3><ul>${good.map(o => `<li><b>${fm(o.t)}</b>${o.why ? ` — ${fm(o.why)}` : ""}</li>`).join("")}${meh.map(o => `<li class="muted">${fm(o.t)} — <i>didn't hurt, didn't help.</i> ${fm(o.why || "")}</li>`).join("")}</ul>
          ${(() => { const skipped = C.fix.o.filter(o => o.kind === "good" && !sel.includes(o)); return skipped.length ? `<p class="muted">Also worth doing: ${skipped.map(o => fm(o.t)).join(" · ")}</p>` : ""; })()}</section>
        ${C.post && C.post.prevent ? `<section><h3>Action items · so it never happens again</h3><ul class="q-acts">${C.post.prevent.map(x => `<li>☐ ${fm(x)}</li>`).join("")}</ul></section>` : ""}
        <section><h3>Traps you avoided (or didn't)</h3><ul>${C.fix.o.filter(o => o.kind === "bad").map(o => `<li>❌ <b>${fm(o.t)}</b> — ${fm(o.why || "")}</li>`).join("")}${C.cause.o.filter(o => !o.ok && o.why).map(o => `<li>🪤 <b>${fm(o.t)}</b> — ${fm(o.why)}</li>`).join("")}</ul></section>
        ${C.deep ? `<section><h3>🔬 Deep dive</h3>${C.deep.map((d, i) => `<details class="q-deepd" ${i ? "" : "open"}><summary>${fm(d.t)}</summary><div>${md(d.md)}</div></details>`).join("")}</section>` : ""}
        ${C.study.length ? `<section><h3>📚 Go deeper in the course</h3>${refList(C.study, "links")}</section>` : ""}
        ${C.learned ? `<section class="q-learned"><h3>🎤 Say this in an interview</h3><ul>${C.learned.map(x => `<li>${fm(x)}</li>`).join("")}</ul></section>` : ""}
      </article>
      ${cards.length ? `<h2 class="q-sec-h">🃏 Cards from this incident</h2><div class="q-xcards">${cards.map(([, c]) => `<details class="q-xcd"><summary><b>${fm(c.t)}</b><small>${fm(c.one || "")}</small></summary>${cardHTML(c, "deck")}</details>`).join("")}</div>` : ""}
      <div class="q-res-b">${nx ? `<a class="btn big solid" href="#case-${nx.z}-${nx.i}">Next page: ${esc(nx.title)} →</a>` : `<a class="btn big solid" href="#play">Back to the desk</a>`}<button class="btn big q-again">Replay</button><a class="btn big" href="#zone-${id}/debug">All ${esc(z.title)} incidents</a></div></div>`;
    root().querySelector(".q-again").onclick = () => caseView(id, ci);
    window.scrollTo(0, 0);
  }
  show("slack");
}

/* ================= Work simulator: unique challenge types ================= */
// QUEST.work(zoneId, [...]) from a zone file. Every item: {type, title, brief, study?, deep:[{t, md}], ...type fields}
//  pr:       {repo, pr, author, desc, reasons:[...], files:[{path, diff}], bugs:[{f, at, a, why}], notes:[{f, at, note}], shipped}
//  logs:     {source, log, qs:[{q, a:[substr...], why, tip}], notes:[[substr, note]]}
//  tune:     {knobs:[{k, label, opts, def, help}], metrics:[{k, label, unit, gl, goal(v)}], sim(v) → {m, log:[...]}, best}
//  timeline: {events:[{t, kind:"trigger"|"cause"|"symptom"|"response"}] (in true order), whys:[{q, o, a, why}]}
//  triage:   {items:[{src, from, t, body, sev:"now"|"today"|"later"|"noise", why, act:{o, a, why}}]}
Q.work = function(id, list){ const Z = this.data[id]; if (Z) Z.work = list; };
const WTYPES = {
  incident:{ic:"📟", name:"Incident", line:"Get paged. Investigate. Fix prod."},
  pr:{ic:"🔍", name:"PR review", line:"Catch the bug before it ships.", how:["Read the pull request like a reviewer.", "Tap any line you think is a problem, then say what's wrong with it.", "Submit your review: approve, or request changes."]},
  logs:{ic:"🧾", name:"Log hunt", line:"Find the one line that matters.", how:["Answer one question at a time.", "Answer by tapping a log line. Filter by text or level to cut the noise.", "Wrong taps cost stars, so read before you tap."]},
  tune:{ic:"🎛️", name:"Tune it", line:"Turn the knobs until it fits.", how:["Pick a value for every setting. Tap ? to learn what each one does.", "Press Run and read what happened.", "Hit every goal in as few runs as you can."]},
  timeline:{ic:"🧭", name:"Postmortem", line:"Rebuild what happened, and why.", how:["Put the events in the order they happened.", "Label each one: trigger, root cause, symptom or response.", "Keep asking \"why?\" until you reach the real cause."]},
  triage:{ic:"🚦", name:"Triage", line:"Sort the morning queue.", how:["Alerts and tickets arrive one at a time.", "Decide how urgent each one is.", "Pick the right first move."]}
};
const WORK = [
  {type:"pr", z:"spark", i:0, icon:"🔍", title:"\"Make the daily job faster\"", sub:"A PySpark PR with three hidden problems", study:["spark:4","spark:6","spark/memory"]},
  {type:"logs", z:"spark", i:1, icon:"🧾", title:"Why did stage 7 fail?", sub:"2,000 lines of executor logs, one real cause", study:["spark:5","spark/memory"]},
  {type:"tune", z:"spark", i:2, icon:"🎛️", title:"Size the executors", sub:"Fit a 2 TB job on 20 nodes, under budget", study:["spark:12","spark:17"]},
  {type:"pr", z:"kafka", i:0, icon:"🔍", title:"\"New payments consumer\"", sub:"Looks clean. Loses money.", study:["kafka:3","kafka:4","kafka/offsets"]},
  {type:"tune", z:"kafka", i:1, icon:"🎛️", title:"Stop the rebalance storm", sub:"Consumers keep getting kicked out of the group", study:["kafka:4","kafka/groups"]},
  {type:"triage", z:"kafka", i:2, icon:"🚦", title:"Monday 9 AM queue", sub:"7 alerts. Two matter.", study:["kafka:3","observability:2"]},
  {type:"timeline", z:"postgres", i:0, icon:"🧭", title:"The checkout outage", sub:"A migration, a lock and a 14-minute outage", study:["postgres:3","postgres:5"]},
  {type:"logs", z:"postgres", i:1, icon:"🧾", title:"Who is blocking whom?", sub:"Lock waits, deadlocks and one idle transaction", study:["postgres:3","postgres:5"]},
  {type:"pr", z:"dbt", i:0, icon:"🔍", title:"\"Add merchant LTV model\"", sub:"An analytics PR that double-counts", study:["dbt:1","dbt:2","dbt:6"]},
  {type:"timeline", z:"debezium", i:0, icon:"🧭", title:"Duplicate orders in the lake", sub:"A connector restart and at-least-once delivery", study:["debezium:6","kafka/offsets"]},
  {type:"tune", z:"rag", i:0, icon:"🎛️", title:"Tune the retriever", sub:"Chunk size, overlap, top-k and reranking vs cost", study:["rag:1","rag:5","rag/evals"]},
  {type:"triage", z:"aiattack", i:0, icon:"🚦", title:"AI security inbox", sub:"Six reports about the support bot", study:["aiattack:0","aiattack:2","aidefense:2"]},
  {type:"logs", z:"agents", i:0, icon:"🧾", title:"Read the agent trace", sub:"Why did it refund the wrong order?", study:["agents:1","agents:7"]}
];
Q.WORK = WORK;
const wkStars = (z, i) => ((P.wk || {})[z] || {})[i] || 0;
const ALLW = () => CASES.map(c => Object.assign({type:"incident"}, c)).concat(WORK);
const wStars = c => c.type === "incident" ? csStars(c.z, c.i) : wkStars(c.z, c.i);
const wHref = c => c.type === "incident" ? `#case-${c.z}-${c.i}` : `#work-${c.z}-${c.i}`;
const workList = list => `<div class="q-wlist">${list.map(c => { const s = wStars(c), T = WTYPES[c.type];
  return `<a class="q-wrow" href="${wHref(c)}" style="--h:${ZMAP[c.z].hue}"><span class="q-wrow-ic">${c.icon || T.ic}</span><span class="q-wrow-t"><b>${esc(c.title)}</b><small>${T.ic} ${esc(T.name)} · ${esc(ZMAP[c.z].title)}${c.sub || c.svc ? " · " + esc(c.sub || c.svc) : ""}</small></span><span class="q-wrow-s">${s ? stars(s, "sm") : `<i>New</i>`}</span></a>`; }).join("")}</div>`;
function workHub(filter){
  const all = ALLW(), f = WTYPES[filter] ? filter : "all", list = f === "all" ? all : all.filter(c => c.type === f), done = all.filter(wStars).length;
  document.title = "Work simulator · Dagdeep";
  root().innerHTML = `<div class="q-wrap q-hub">
    <a class="q-back" href="#play">← Home</a>
    <h1>💼 Work simulator</h1>
    <p class="muted">Real tasks from a data and AI engineer's week. Each type plays differently. ${done}/${all.length} done.</p>
    <div class="q-wfilter" role="tablist"><button role="tab" data-f="all" aria-selected="${f === "all"}">All <small>${all.length}</small></button>${Object.entries(WTYPES).map(([k, T]) => `<button role="tab" data-f="${k}" aria-selected="${f === k}">${T.ic} ${T.name} <small>${all.filter(c => c.type === k).length}</small></button>`).join("")}</div>
    ${f !== "all" ? `<p class="q-wline">${WTYPES[f].ic} <b>${WTYPES[f].name}:</b> ${WTYPES[f].line}</p>` : ""}
    ${workList(list)}</div>`;
  root().querySelectorAll(".q-wfilter button").forEach(b => b.onclick = () => { history.replaceState(null, "", b.dataset.f === "all" ? "#work" : "#work/" + b.dataset.f); workHub(b.dataset.f); });
}
const homeWork = () => { const all = ALLW(), nx = all.find(c => !wStars(c));
  return `<section class="q-whome"><div class="q-sec-row"><h2 class="q-sec-h">💼 Work simulator</h2><a href="#work">See all ${all.length} →</a></div>
    <div class="q-wtypes">${Object.entries(WTYPES).map(([k, T]) => { const l = all.filter(c => c.type === k); return `<a href="#work/${k}"><span>${T.ic}</span><b>${T.name}</b><small>${l.filter(wStars).length}/${l.length}</small></a>`; }).join("")}</div>
    ${nx ? workList([nx]) : ""}</section>`; };

function workView(id, wi){
  const z = ZMAP[id]; if (!z){ location.hash = "#work"; return; }
  needZone(id, () => {
    const Z = Q.data[id], W = (Z.work || [])[wi], R = WORK.find(c => c.z === id && c.i === wi) || {};
    if (!W){ location.hash = "#work"; return; }
    W.study = W.study || R.study || [];
    needZones(refZones(W.study), () => wkIntro({id, wi, z, Z, W, R, T:WTYPES[W.type]}));
  });
}
const wkShell = (x, inner, prog) => `<div class="q-wrap q-wk" style="--h:${x.z.hue}; --hc:hsl(${x.z.hue} 70% 45%)">
  <header class="q-wkh"><a class="q-x" href="#work/${x.W.type}" aria-label="Leave">✕</a><span class="q-wtag">${x.T.ic} ${x.T.name}</span><b>${esc(x.W.title)}</b><span class="q-wkp">${prog || ""}</span></header>
  <div class="q-wkb">${inner}</div></div>`;
function wkIntro(x){
  P.last = x.id; save(); setKeys(null);
  const W = x.W;
  if (W.type === "pr"){ const o = shuffle(W.reasons.map((r, i) => i)), copy = W.reasons.slice(); o.forEach((j, k) => W.reasons[k] = copy[j]); W.bugs.forEach(b => b.a = o.indexOf(b.a)); }
  if (W.type === "triage") W.items.forEach(it => { if (it.act) it.act.a = mix(it.act.o, it.act.a); });
  if (W.type === "timeline") W.whys.forEach(q => { q.a = mix(q.o, q.a); });
  document.title = `${x.W.title} · ${x.T.name} · Dagdeep`;
  root().innerHTML = `<div class="q-wrap q-wk" style="--h:${x.z.hue}; --hc:hsl(${x.z.hue} 70% 45%)"><div class="q-wkintro">
    <a class="q-back" href="#work/${x.W.type}">← ${x.T.name}s</a>
    <div class="q-wk-ic">${x.T.ic}</div><p class="q-eyebrow">${x.T.name} · ${esc(x.z.title)}</p><h1>${esc(x.W.title)}</h1>
    <div class="q-wk-sit">${md(x.W.brief)}</div>
    <h3>How to play</h3><ol class="q-wk-how">${x.T.how.map(h => `<li>${fm(h)}</li>`).join("")}</ol>
    <p class="q-wk-score">⭐⭐⭐ ${esc(x.W.three || "almost no mistakes")} · fewer stars for each mistake</p>
    ${x.W.study.length ? `<details class="q-pg-study"><summary>📚 Brush up first <small>(${x.W.study.length} course pages)</small></summary>${refList(x.W.study, "links")}</details>` : ""}
    <button class="btn big solid q-wkgo">Start</button></div></div>`;
  root().querySelector(".q-wkgo").onclick = () => WPLAY[x.W.type](x);
}
function wkDone(x, s, stats, review){
  P.wk = P.wk || {}; P.wk[x.id] = P.wk[x.id] || {}; const prev = P.wk[x.id][x.wi] || 0;
  if (s > prev) P.wk[x.id][x.wi] = s;
  const gain = 40 + Math.max(0, s - prev) * 20; save(); addXP(gain);
  if (s === 3) confetti();
  const typesDone = new Set(ALLW().filter(wStars).map(c => c.type)); if (typesDone.size >= Object.keys(WTYPES).length) unlock("allround");
  const all = ALLW(), k = all.findIndex(c => c.type === x.W.type && c.z === x.id && c.i === x.wi), nx = all.slice(k + 1).concat(all.slice(0, k)).find(c => !wStars(c));
  root().innerHTML = wkShell(x, `<div class="q-res won"><h2>${s === 3 ? "Excellent work" : s === 2 ? "Good work" : "Done"}</h2>${stars(s, "big")}
      <div class="q-res-stats">${stats.map(([l, v]) => `<span><small>${esc(l)}</small><b>${esc(String(v))}</b></span>`).join("")}<span><small>XP</small><b>+${gain}</b></span></div></div>
    ${review ? `<section class="q-wsec">${review}</section>` : ""}
    <section class="q-wsec"><h3>🔬 Deep dive</h3>${(x.W.deep || []).map((d, i) => `<details class="q-deepd" ${i ? "" : "open"}><summary>${fm(d.t)}</summary><div>${md(d.md)}</div></details>`).join("")}</section>
    ${x.W.say ? `<section class="q-wsec q-learned"><h3>🎤 Say this in an interview</h3><p>${fm(x.W.say)}</p></section>` : ""}
    ${x.W.study.length ? `<section class="q-wsec"><h3>📚 Go deeper in the course</h3>${refList(x.W.study, "links")}</section>` : ""}
    <div class="q-res-b">${nx ? `<a class="btn big solid" href="${wHref(nx)}">Next: ${esc(nx.title)} →</a>` : ""}<button class="btn big q-again">Replay</button><a class="btn big" href="#work">All work</a></div>`, "");
  root().querySelector(".q-again").onclick = () => wkIntro(x);
  window.scrollTo(0, 0);
}
const starsBy = (m, a, b) => m <= a ? 3 : m <= b ? 2 : 1;
const WPLAY = {};

/* ---- PR review ---- */
WPLAY.pr = x => {
  const W = x.W, st = {found:new Set(), wrong:0, fp:0};
  const lineOf = (f, at) => W.files[f].diff.split("\n").findIndex(l => l.includes(at));
  const bugAt = {}; W.bugs.forEach((b, k) => { bugAt[b.f + ":" + lineOf(b.f, b.at)] = k; });
  const noteAt = {}; (W.notes || []).forEach(n => { noteAt[n.f + ":" + lineOf(n.f, n.at)] = n.note; });
  let add = 0, del = 0; W.files.forEach(F => F.diff.split("\n").forEach(l => { if (l[0] === "+") add++; if (l[0] === "-") del++; }));
  const prog = () => `${st.found.size}/${W.bugs.length} found`;
  root().innerHTML = wkShell(x, `<div class="q-pr">
    <div class="q-prhead"><b>${esc(W.pr)}</b><small>${esc(W.author)} wants to merge into <code>main</code> · ${esc(W.repo)} · <span class="t-add">+${add}</span> <span class="t-del">−${del}</span></small><div class="q-prdesc">${md(W.desc)}</div></div>
    ${W.files.map((F, f) => { let n = 0; return `<div class="q-prfile"><div class="q-prpath">${esc(F.path)}</div><div class="q-prdiff">${F.diff.split("\n").map((l, i) => { const k = l[0] === "@" ? "h" : l[0] === "+" ? "a" : l[0] === "-" ? "d" : "c"; if (k !== "h" && k !== "d") n++;
      return k === "h" ? `<div class="q-prl h">${esc(l)}</div>` : `<button class="q-prl ${k}" data-f="${f}" data-i="${i}"><span>${k === "d" ? "" : n}</span><i>${k === "a" ? "+" : k === "d" ? "−" : ""}</i><code>${esc(l.slice(1)) || " "}</code></button>`; }).join("")}</div></div>`; }).join("")}
    <div class="q-prbar"><span class="q-prcount">🔎 ${prog()}</span><button class="btn solid q-prsubmit">Submit review</button></div></div>`, prog());
  const bar = () => { root().querySelector(".q-prcount").textContent = "🔎 " + prog(); root().querySelector(".q-wkp").textContent = prog(); };
  const closeSheets = () => root().querySelectorAll(".q-prsheet").forEach(e => e.remove());
  root().querySelectorAll("button.q-prl").forEach(b => b.onclick = () => {
    const key = b.dataset.f + ":" + b.dataset.i, bk = bugAt[key];
    const open = b.nextElementSibling && b.nextElementSibling.classList.contains("q-prsheet"); closeSheets(); if (open) return;
    if (bk != null && st.found.has(bk)){ b.insertAdjacentHTML("afterend", `<div class="q-prsheet ok">✅ ${fm(W.bugs[bk].why)}</div>`); return; }
    b.insertAdjacentHTML("afterend", `<div class="q-prsheet"><b>What's wrong with this line?</b><div class="q-prr">${W.reasons.map((r, k) => `<button data-k="${k}">${fm(r)}</button>`).join("")}<button data-k="-1" class="q-prfine">Nothing, it's fine</button></div><p class="q-prmsg"></p></div>`);
    const sh = b.nextElementSibling, msg = sh.querySelector(".q-prmsg");
    sh.querySelectorAll(".q-prr button").forEach(o => o.onclick = () => {
      const k = +o.dataset.k;
      if (k === -1){ sh.remove(); return; }
      if (bk == null){ st.fp++; b.classList.add("fp"); msg.innerHTML = `⚪ <b>False alarm.</b> ${fm(noteAt[key] || "This line is fine as written.")}`; sh.querySelectorAll(".q-prr button").forEach(z => z.disabled = true); setTimeout(() => sh.remove(), 2600); return; }
      if (k === W.bugs[bk].a){ st.found.add(bk); b.classList.add("bug"); sh.classList.add("ok"); sh.innerHTML = `✅ <b>Good catch.</b> ${fm(W.bugs[bk].why)}`; bar(); }
      else { st.wrong++; o.disabled = true; o.classList.add("no"); msg.innerHTML = "❌ There <i>is</i> a problem on this line, but not that one. Try another reason."; }
    });
  });
  root().querySelector(".q-prsubmit").onclick = () => {
    closeSheets(); const old = root().querySelector(".q-prverdict"); if (old) old.remove();
    root().querySelector(".q-prbar").insertAdjacentHTML("beforebegin", `<div class="q-prverdict"><b>Your review</b><button data-v="approve">✅ Approve</button><button data-v="comment">💬 Comment only</button><button data-v="changes">⛔ Request changes</button></div>`);
    const vd = root().querySelector(".q-prverdict"); vd.scrollIntoView({block:"center", behavior:reduce() ? "auto" : "smooth"});
    vd.querySelectorAll("button").forEach(v => v.onclick = () => {
      const missed = W.bugs.filter((b, k) => !st.found.has(k)), ok = v.dataset.v === "changes";
      const m = st.wrong + st.fp + missed.length * 2 + (ok ? 0 : 2);
      const review = `<h3>${ok ? "⛔ Changes requested" : "😬 It shipped"}</h3>${ok ? "" : md(W.shipped)}
        <ul class="q-prrev">${W.bugs.map((b, k) => `<li class="${st.found.has(k) ? "ok" : "miss"}">${st.found.has(k) ? "✅" : "❌ Missed:"} <code>${esc(b.at)}</code><div>${fm(b.why)}</div></li>`).join("")}</ul>`;
      wkDone(x, starsBy(m, 1, 4), [["Found", `${st.found.size}/${W.bugs.length}`], ["Wrong reasons", st.wrong], ["False alarms", st.fp]], review);
    });
  };
};

/* ---- Log hunt ---- */
WPLAY.logs = x => {
  const W = x.W, L = W.log.trim().split("\n"), st = {q:0, miss:0, tips:0, lvl:"ALL", text:""};
  const lvlOf = l => (l.match(/\b(ERROR|WARN|INFO|DEBUG|FATAL)\b/) || [, "INFO"])[1];
  const prog = () => `Q${Math.min(st.q + 1, W.qs.length)}/${W.qs.length}`;
  root().innerHTML = wkShell(x, `<div class="q-logs">
    <div class="q-lq"></div>
    <div class="q-ltools"><input class="q-lsearch" type="search" placeholder="Filter lines… (e.g. ERROR, killed)" aria-label="Filter log lines" autocapitalize="off" spellcheck="false">
      <div class="q-llv">${["ALL", "ERROR", "WARN"].map(v => `<button data-l="${v}" aria-pressed="${v === "ALL"}">${v}</button>`).join("")}</div></div>
    <div class="q-lsrc">${esc(W.source)} · <span class="q-lcount"></span></div>
    <div class="q-lview">${L.map((l, i) => `<button class="q-ll ${lvlOf(l).toLowerCase()}" data-i="${i}"><span>${i + 1}</span><code>${termFmt(l)}</code></button>`).join("")}</div></div>`, prog());
  const qEl = root().querySelector(".q-lq"), rows = [...root().querySelectorAll(".q-ll")];
  const filter = () => { let n = 0; rows.forEach((r, i) => { const l = L[i], v = (st.lvl === "ALL" || lvlOf(l) === st.lvl || (st.lvl === "ERROR" && lvlOf(l) === "FATAL")) && (!st.text || l.toLowerCase().includes(st.text)); r.hidden = !v; if (v) n++; }); root().querySelector(".q-lcount").textContent = `${n} of ${L.length} lines`; };
  root().querySelector(".q-lsearch").oninput = e => { st.text = e.target.value.trim().toLowerCase(); filter(); };
  root().querySelectorAll(".q-llv button").forEach(b => b.onclick = () => { st.lvl = b.dataset.l; root().querySelectorAll(".q-llv button").forEach(z => z.setAttribute("aria-pressed", z === b)); filter(); });
  const ask = () => {
    root().querySelector(".q-wkp").textContent = prog();
    const q = W.qs[st.q];
    qEl.innerHTML = `<small>Question ${st.q + 1} of ${W.qs.length}</small><b>${fm(q.q)}</b><p class="q-lmsg">Tap the line that answers it.</p>${q.tip ? `<button class="q-ltip">💡 Tip</button>` : ""}`;
    const tb = qEl.querySelector(".q-ltip"); if (tb) tb.onclick = () => { st.tips++; tb.outerHTML = `<p class="q-ltipt">💡 ${fm(q.tip)}</p>`; };
  };
  rows.forEach((r, i) => r.onclick = () => {
    const q = W.qs[st.q]; if (!q) return;
    const msg = qEl.querySelector(".q-lmsg");
    if (q.a.some(a => L[i].includes(a))){
      r.classList.add("hit");
      qEl.innerHTML = `<small>Question ${st.q + 1} of ${W.qs.length} · ✅ line ${i + 1}</small><b>${fm(q.q)}</b><div class="q-lwhy">${md(q.why)}</div><button class="btn solid q-lnext">${st.q + 1 < W.qs.length ? "Next question →" : "Finish"}</button>`;
      qEl.querySelector(".q-lnext").onclick = () => { st.q++; if (st.q < W.qs.length){ ask(); qEl.scrollIntoView({block:"nearest"}); } else wkDone(x, starsBy(st.miss + st.tips, 1, 4), [["Wrong taps", st.miss], ["Tips used", st.tips]], ""); };
      qEl.scrollIntoView({block:"nearest", behavior:reduce() ? "auto" : "smooth"});
    } else {
      st.miss++; r.classList.add("miss"); setTimeout(() => r.classList.remove("miss"), 700);
      const note = (W.notes || []).find(([s]) => L[i].includes(s));
      msg.innerHTML = `❌ Line ${i + 1}: ${note ? fm(note[1]) : "not this one."}`;
    }
  });
  filter(); ask();
};

/* ---- Tune it ---- */
WPLAY.tune = x => {
  const W = x.W, v = {}, st = {runs:0, hist:[]};
  W.knobs.forEach(k => v[k.k] = k.def);
  const fmtV = (k, o) => k.fmt ? k.fmt(o) : String(o);
  root().innerHTML = wkShell(x, `<div class="q-tune">
    <div class="q-goals"><b>Goals</b>${W.metrics.map(m => `<span>${esc(m.label)} ${esc(m.gl)}</span>`).join("")}</div>
    <div class="q-knobs">${W.knobs.map(k => `<div class="q-knob"><div class="q-knob-h"><b>${esc(k.label)}</b><button class="q-kq" aria-label="What is ${esc(k.label)}?">?</button></div>
      <div class="q-khelp" hidden>${md(k.help)}</div>
      <div class="q-kopts">${k.opts.map(o => `<button data-k="${k.k}" data-v="${esc(JSON.stringify(o))}" aria-pressed="${o === k.def}">${esc(fmtV(k, o))}</button>`).join("")}</div></div>`).join("")}</div>
    <button class="btn big solid q-run">▶ Run</button>
    <div class="q-tout"></div></div>`, "0 runs");
  root().querySelectorAll(".q-kq").forEach(b => b.onclick = () => { const h = b.closest(".q-knob").querySelector(".q-khelp"); h.hidden = !h.hidden; });
  root().querySelectorAll(".q-kopts button").forEach(b => b.onclick = () => { v[b.dataset.k] = JSON.parse(b.dataset.v); b.parentElement.querySelectorAll("button").forEach(z => z.setAttribute("aria-pressed", z === b)); });
  root().querySelector(".q-run").onclick = () => {
    st.runs++; const r = W.sim(Object.assign({}, v)), ok = W.metrics.map(m => m.goal(r.m[m.k]));
    st.hist.push({v:Object.assign({}, v), ok:ok.every(Boolean)});
    root().querySelector(".q-wkp").textContent = `${st.runs} run${st.runs > 1 ? "s" : ""}`;
    const out = root().querySelector(".q-tout");
    out.innerHTML = `<div class="q-trun"><small>Run ${st.runs}</small><div class="q-tmet">${W.metrics.map((m, k) => `<span class="${ok[k] ? "ok" : "no"}"><small>${esc(m.label)}</small><b>${esc(m.show ? m.show(r.m[m.k]) : String(r.m[m.k]))}${esc(m.unit || "")}</b><i>${ok[k] ? "✓" : "✗"} ${esc(m.gl)}</i></span>`).join("")}</div>
      <ul class="q-tlog">${r.log.map(l => `<li>${fm(l)}</li>`).join("")}</ul>
      ${ok.every(Boolean) ? `<button class="btn big solid q-tdone">All goals met · finish →</button>` : `<p class="muted">Change a setting and run again.</p>`}</div>`;
    out.scrollIntoView({block:"nearest", behavior:reduce() ? "auto" : "smooth"});
    const d = out.querySelector(".q-tdone");
    if (d) d.onclick = () => wkDone(x, starsBy(st.runs, 2, 4), [["Runs", st.runs]], `<h3>Your winning settings</h3><div class="q-tw"><table><tbody>${W.knobs.map(k => `<tr><td>${esc(k.label)}</td><td><b>${esc(fmtV(k, v[k.k]))}</b></td></tr>`).join("")}</tbody></table></div>${W.best ? `<p>${fm(W.best)}</p>` : ""}`);
  };
};

/* ---- Postmortem timeline ---- */
WPLAY.timeline = x => {
  const W = x.W, n = W.events.length, st = {m:0, placed:[], pool:shuffle(W.events.map((e, i) => i)), step:1, lab:{}, why:0};
  const KINDS = [["trigger", "Trigger"], ["cause", "Root cause"], ["symptom", "Symptom"], ["response", "Response"]];
  const draw = () => {
    const step = st.step, body = root().querySelector(".q-tlbody");
    root().querySelector(".q-wkp").textContent = `Step ${step}/3`;
    if (step === 1){
      body.innerHTML = `<div class="q-tlstep"><b>1 · Put the events in order</b><small>Tap events in the order they happened. Tap a placed event to take it back.</small></div>
        <ol class="q-tlord">${st.placed.map((e, k) => `<li><button data-p="${k}">${fm(W.events[e].t)}</button></li>`).join("") || `<li class="q-tlempty">First event goes here</li>`}</ol>
        <div class="q-tlpool">${st.pool.map(e => `<button data-e="${e}">${fm(W.events[e].t)}</button>`).join("")}</div>
        ${st.placed.length === n ? `<button class="btn big solid q-tlchk">Check order</button>` : ""}<p class="q-tlmsg"></p>`;
      body.querySelectorAll(".q-tlpool button").forEach(b => b.onclick = () => { st.pool = st.pool.filter(e => e !== +b.dataset.e); st.placed.push(+b.dataset.e); draw(); });
      body.querySelectorAll(".q-tlord button").forEach(b => b.onclick = () => { const e = st.placed.splice(+b.dataset.p, 1)[0]; st.pool.push(e); draw(); });
      const c = body.querySelector(".q-tlchk"); if (c) c.onclick = () => {
        const bad = st.placed.map((e, k) => e !== k);
        if (!bad.some(Boolean)){ st.step = 2; draw(); return; }
        st.m++; const keep = []; st.placed.forEach((e, k) => { if (!bad[k] && keep.length === k) keep.push(e); else st.pool.push(e); });
        st.placed = keep; draw(); body.querySelector(".q-tlmsg").innerHTML = `❌ Not quite. The first ${keep.length} ${keep.length === 1 ? "is" : "are"} right; the rest went back. Think about what had to happen before what.`;
      };
    } else if (step === 2){
      body.innerHTML = `<div class="q-tlstep"><b>2 · Label each event</b><small>Trigger = what set it off. Root cause = the underlying weakness. Symptom = what people noticed. Response = what the team did.</small></div>
        <ol class="q-tllab">${W.events.map((e, i) => `<li><p>${fm(e.t)}</p><div>${KINDS.map(([k, l]) => `<button data-i="${i}" data-k="${k}" aria-pressed="${st.lab[i] === k}">${l}</button>`).join("")}</div></li>`).join("")}</ol>
        <button class="btn big solid q-tlchk">Check labels</button><p class="q-tlmsg"></p>`;
      body.querySelectorAll(".q-tllab button").forEach(b => b.onclick = () => { st.lab[b.dataset.i] = b.dataset.k; b.parentElement.querySelectorAll("button").forEach(z => z.setAttribute("aria-pressed", z === b)); });
      body.querySelector(".q-tlchk").onclick = () => {
        if (Object.keys(st.lab).length < n){ body.querySelector(".q-tlmsg").textContent = "Label every event first."; return; }
        const bad = W.events.map((e, i) => st.lab[i] !== e.kind);
        if (!bad.some(Boolean)){ st.step = 3; draw(); return; }
        st.m++; body.querySelectorAll(".q-tllab li").forEach((li, i) => li.classList.toggle("bad", bad[i]));
        body.querySelector(".q-tlmsg").innerHTML = `❌ ${bad.filter(Boolean).length} label${bad.filter(Boolean).length > 1 ? "s are" : " is"} wrong (marked red). Tip: a trigger is often innocent on its own; the root cause is the weakness it exposed.`;
      };
    } else {
      const done = W.whys.slice(0, st.why), q = W.whys[st.why];
      body.innerHTML = `<div class="q-tlstep"><b>3 · Ask "why?"</b><small>Each answer becomes the next question. Stop at a cause you can fix with a process or design change.</small></div>
        <ol class="q-whys">${done.map(w => `<li><small>${fm(w.q)}</small><b>${fm(w.o[w.a])}</b></li>`).join("")}</ol>
        ${q ? `<div class="q-whyq"><b>${fm(q.q)}</b>${q.o.map((o, k) => `<button data-k="${k}">${fm(o)}</button>`).join("")}<p class="q-tlmsg"></p></div>` : `<button class="btn big solid q-tlfin">Finish the postmortem →</button>`}`;
      body.querySelectorAll(".q-whyq button").forEach(b => b.onclick = () => {
        if (+b.dataset.k === q.a){ st.why++; draw(); }
        else { st.m++; b.disabled = true; b.classList.add("no"); body.querySelector(".q-tlmsg").innerHTML = `❌ ${fm(q.why || "That's true, but it doesn't answer this why.")}`; }
      });
      const f = body.querySelector(".q-tlfin"); if (f) f.onclick = () => wkDone(x, starsBy(st.m, 1, 3), [["Mistakes", st.m]],
        `<h3>The timeline</h3><ol class="q-tlfinal">${W.events.map(e => `<li>${e.at ? `<time>${esc(e.at)}</time>` : ""}<span class="q-tk ${e.kind}">${KINDS.find(k => k[0] === e.kind)[1]}</span>${fm(e.t)}</li>`).join("")}</ol>`);
    }
  };
  root().innerHTML = wkShell(x, `<div class="q-tl2"><div class="q-tlbody"></div></div>`, "Step 1/3");
  draw();
};

/* ---- Triage ---- */
WPLAY.triage = x => {
  const W = x.W, st = {i:0, m:0, sev:null};
  const SEV = [["now", "🔴 Drop everything"], ["today", "🟠 Today"], ["later", "🟡 Backlog"], ["noise", "⚪ Noise"]];
  const card = () => {
    const it = W.items[st.i]; st.sev = null;
    root().querySelector(".q-wkp").textContent = `${st.i + 1}/${W.items.length}`;
    root().querySelector(".q-trg").innerHTML = `<div class="q-trcard"><div class="q-trsrc"><span>${esc(it.src)}</span><small>${esc(it.from)}</small></div><b>${fm(it.t)}</b><div class="q-trbody">${md(it.body)}</div></div>
      <div class="q-trq"><b>How urgent is this?</b><div class="q-trsev">${SEV.map(([k, l]) => `<button data-s="${k}">${l}</button>`).join("")}</div><div class="q-trfb"></div></div>`;
    root().querySelectorAll(".q-trsev button").forEach(b => b.onclick = () => {
      const ok = b.dataset.s === it.sev, fb = root().querySelector(".q-trfb");
      if (!ok){ st.m++; b.disabled = true; b.classList.add("no"); fb.innerHTML = `<p>❌ Not quite. Look again: who is affected, how badly, and is it getting worse?</p>`; return; }
      root().querySelectorAll(".q-trsev button").forEach(z => z.disabled = true); b.classList.add("yes");
      fb.innerHTML = `<p>✅ ${fm(it.why)}</p>` + (it.act ? `<b>What's your first move?</b><div class="q-tract">${it.act.o.map((o, k) => `<button data-k="${k}">${fm(o)}</button>`).join("")}</div><p class="q-tramsg"></p>` : `<button class="btn solid q-trnext">Next →</button>`);
      const nextB = () => { const nb = fb.querySelector(".q-trnext"); nb.onclick = () => { st.i++; if (st.i < W.items.length) card(); else wkDone(x, starsBy(st.m, 1, 3), [["Mistakes", st.m], ["Items", W.items.length]], ""); }; };
      if (!it.act) return nextB();
      fb.querySelectorAll(".q-tract button").forEach(a => a.onclick = () => {
        if (+a.dataset.k === it.act.a){ fb.querySelectorAll(".q-tract button").forEach(z => z.disabled = true); a.classList.add("yes"); fb.querySelector(".q-tramsg").outerHTML = `<p>✅ ${fm(it.act.why)}</p><button class="btn solid q-trnext">${st.i + 1 < W.items.length ? "Next item →" : "Finish"}</button>`; nextB(); }
        else { st.m++; a.disabled = true; a.classList.add("no"); fb.querySelector(".q-tramsg").textContent = "❌ Not the best first move. Try again."; }
      });
    });
  };
  root().innerHTML = wkShell(x, `<div class="q-trg"></div>`, `1/${W.items.length}`);
  card();
};


/* ================= About (for the portfolio) ================= */
const AUTHOR = {name:"Vivek Kurisetti", role:"Senior Data Engineer", github:"https://github.com/vivek-kurisetti", repo:"https://github.com/vivek-kurisetti/Dagdeep", linkedin:"https://www.linkedin.com/in/vivek-kurisetti"};
function aboutView(){
  document.title = "About · Dagdeep";
  const all = ALLW(), stat = [["26", "topics", "Spark to MCP"], ["289", "drill levels", "1,500+ challenges"], ["32", "story missions", "real situations"], [String(all.length), "work tasks", "6 formats"], ["26", "mock interviews", "with model answers"]];
  const modes = [
    ["🎯", "Drills", "Short puzzles per concept: sort, match, fill the gap, spot the bug, estimate a number. Basic and expert tiers with boss levels."],
    ["🎬", "Story missions", "A real day at work. Make the calls, watch the meters move, collect detailed concept cards."],
    ["📟", "Incidents", "Get paged. Slack, a working terminal, dashboards and code. Find the root cause, ship a fix, read the postmortem."],
    ["🔍", "PR reviews", "Read a real-looking diff, tap the risky lines and say what's wrong before it ships."],
    ["🧾", "Log hunts", "Hundreds of filterable log lines. Find the one that matters."],
    ["🎛️", "Tune it", "Real config knobs and a simulator: hit every goal in as few runs as you can."],
    ["🧭", "Postmortems", "Order the events, label trigger vs root cause, then ask \"why?\" five times."],
    ["🚦", "Triage", "Sort a morning inbox of alerts by urgency and pick the first move."],
    ["🎤", "Mock interviews", "A full technical round per topic, with model answers and a hire verdict."],
    ["🏗️", "System design", "Interview-style design rounds: clarify, estimate, build the architecture, defend trade-offs. Plus reference architectures and project ideas."],
    ["🌊", "Data flows", "Animated, step-by-step views of how a write moves through MySQL and Iceberg."]];
  root().innerHTML = `<div class="q-wrap q-about">
    <section class="q-ab-hero"><p class="q-eyebrow">About this project</p><h1>Learn data &amp; AI engineering the way the job actually feels.</h1>
      <p class="q-ab-lede">Dagdeep turns data engineering and AI engineering into a game: every concept is something you <b>do</b>. Debug a broken pipeline, review a pull request, tune a Spark job, triage an inbox of alerts, then explain it all in a mock interview.</p>
      <div class="q-res-b"><a class="btn big solid" href="#play">Start playing</a><a class="btn big" href="#work">Try a work task</a></div></section>
    <div class="q-ab-stats">${stat.map(([n, l, s]) => `<div><b>${n}</b><span>${l}</span><small>${s}</small></div>`).join("")}</div>
    <h2 class="q-sec-h">Eleven ways to play</h2>
    <div class="q-ab-modes">${modes.map(([i, t, d]) => `<div><span>${i}</span><b>${t}</b><p>${d}</p></div>`).join("")}</div>
    <h2 class="q-sec-h">What's covered</h2>
    <div class="q-ab-topics">${WORLDS.map(w => `<div><b>${w.id === "de" ? "🗄️" : "🤖"} ${esc(w.title)}</b><p>${ZONES.filter(z => z.world === w.id).map(z => esc(z.title)).join(" · ")}</p></div>`).join("")}</div>
    <h2 class="q-sec-h">How it's built</h2>
    <div class="q-ab-build">
      <div><b>No framework, no build step</b><p>A single-page app in plain JavaScript with a hash router. Each topic is a separate content module loaded on demand, so the first page stays small.</p></div>
      <div><b>Content as data</b><p>~7,000 lines of hand-written scenarios, from incidents with terminal commands to log files and simulators. Six small engines turn them into very different games.</p></div>
      <div><b>Real artefacts</b><p>Spark UI screenshots come from real PySpark runs. Command outputs, EXPLAIN plans and logs mirror what you'd see in production.</p></div>
      <div><b>Accounts that sync</b><p>Progress saves in the browser. With Google sign-in (Firebase Auth), it syncs per user through Firestore, protected by per-user security rules. Export/import works for everyone.</p></div>
      <div><b>Tested by bots</b><p>Playwright bots play every drill, mission, incident, work task and interview end to end, on desktop and phone widths, checking for errors and layout overflow.</p></div>
      <div><b>Fast and accessible</b><p>Deferred scripts, lazy content and minified assets on GitHub Pages. Keyboard and screen-reader friendly, reduced-motion aware, light and dark themes.</p></div>
    </div>
    <section class="q-ab-me"><div><p class="q-eyebrow">Built by</p><h2>${esc(AUTHOR.name)}</h2><p>${esc(AUTHOR.role)}. I build near-real-time pipelines and lakehouses, and I made Dagdeep to teach the things that are hard to learn from docs: what breaks, why, and what to do about it.</p></div>
      <div class="q-ab-links"><a class="btn" href="${AUTHOR.repo}" target="_blank" rel="noopener">⌨️ Source on GitHub</a><a class="btn" href="${AUTHOR.linkedin}" target="_blank" rel="noopener">in&nbsp; LinkedIn</a></div></section>
  </div>`;
  window.scrollTo(0, 0);
}

Q._ = {esc, fm, md, root, stars, save, P, PR, addXP, toast, confetti, unlock, shuffle, reduce, ZMAP, refList, needZones, refZones, setKeys};
window.loadQuest = function(h){
  if (typeof showMode === "function") showMode("courses");
  setKeys(null); drawAcct();
  const ap = document.getElementById("qAcctPanel"); if (ap) ap.remove();
  let m;
  if ((m = h.match(/^lvl-([a-z]+)-(\d+)$/))) levelView(m[1], +m[2]);
  else if ((m = h.match(/^mis-([a-z]+)-(\d+)$/))) missionView(m[1], +m[2], "ms");
  else if ((m = h.match(/^iv-([a-z]+)-(\d+)$/))) missionView(m[1], +m[2], "iv");
  else if ((m = h.match(/^case-([a-z]+)-(\d+)$/))) caseView(m[1], +m[2]);
  else if ((m = h.match(/^work-([a-z]+)-(\d+)$/))) workView(m[1], +m[2]);
  else if (h === "interview") ivHub();
  else if (h === "about") aboutView();
  else if (/^(design(\/.*)?|sd-[a-z0-9-]+)$/.test(h)){
    // System design lives in design.js, loaded on first visit.
    const go = () => Q.design.route(h);
    if (Q.design) go();
    else { root().innerHTML = `<div class="q-wrap"><p class="muted">Loading…</p></div>`; const fail = () => { root().innerHTML = `<div class="q-wrap"><p>Couldn't load this section. Check your connection and refresh.</p></div>`; };
      const load = (src, cb) => { const sc = document.createElement("script"); sc.src = src; sc.onload = cb; sc.onerror = fail; document.head.appendChild(sc); };
      load("design-data.js", () => load("design.js", go)); }
  }
  else if ((m = h.match(/^work(?:\/([a-z]+))?$/))) workHub(m[1]);
  else if ((m = h.match(/^learn-([a-z]+)-(\d+)$/))) studyView(m[1], +m[2]);
  else if ((m = h.match(/^card-([a-z]+)-(\w+)$/))) studyView(m[1], 0, m[2]);
  else if ((m = h.match(/^zone-([a-z]+)(?:\/([a-z]+))?/))) zoneView(m[1], m[2]);
  else mapView();
  window.scrollTo(0, 0);
};
})();
