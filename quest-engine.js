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
const DEF_P = () => ({stars:{}, cards:{}, lv:{}, last:null, ms:{}, iv:{}, ach:{}, chest:{}});
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
Q.useAccount = (user, cloud) => {
  const gq = raw("dagdeep-quest-v1"), gp = raw("dagdeep-profile-v1");
  NS = ":" + user.uid; Q.account = user;
  let q = cloud && cloud.quest, pr = cloud && cloud.profile;
  if (!q){
    const lq = raw(KQ()), lp = raw(KP());
    if (lq){ q = lq; pr = lp; }
    else if (gp && gp.xp > 0){ q = gq; pr = gp; setTimeout(() => toast("Your guest progress moved into your account"), 400); }
  }
  swap(P, Object.assign(DEF_P(), q || {})); swap(PR, Object.assign(DEF_PR(), pr || {}));
  save(); drawAcct(); rerender();
};
Q.useGuest = () => {
  NS = ""; Q.account = null; Q.cloud = null;
  swap(P, Object.assign(DEF_P(), raw(KQ()) || {})); swap(PR, Object.assign(DEF_PR(), raw(KP()) || {}));
  drawAcct(); rerender();
};
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
  ["fresh","🔄","Clean slate","Start fresh from scratch"]
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
  if (!p){ p = document.createElement("div"); p.id = "qAcctPanel"; p.className = "q-acctpanel"; document.body.appendChild(p); }
  const u = Q.account, A = window.DAGDEEP_AUTH || {}, r = rank(PR.xp);
  p.innerHTML = confirmReset ? `<p class="q-ap-h">Start fresh?</p><p class="muted">This clears XP, stars, cards and trophies ${u ? "for <b>" + esc(u.displayName || u.email) + "</b>" : "on this device"}. It can't be undone.</p>
      <button class="btn big solid q-danger" data-a="doreset">Yes, start from scratch</button><button class="btn big" data-a="cancel">Cancel</button>`
    : `<div class="q-ap-me">${u ? `<span class="q-av-md">${avatar(u)}</span><div><b>${esc(u.displayName || "Signed in")}</b><small>${esc(u.email || "")}</small></div>` : `<span class="q-av-md"><span>👤</span></span><div><b>Playing as guest</b><small>Progress is saved on this device only</small></div>`}</div>
      <p class="q-ap-sync">${u ? "☁️ Progress syncs to your Google account on every device." : "Sign in to keep your progress separate and synced everywhere."}</p>
      <div class="q-ap-stats"><span><b>${esc(r.name)}</b><small>rank</small></span><span><b>${PR.xp}</b><small>XP</small></span><span><b>${totalCards()}</b><small>cards</small></span></div>
      ${u ? `<button class="btn big" data-a="out">Sign out</button>` : `<button class="btn big q-gbtn" data-a="in">${GICON}<span>Continue with Google</span></button>${A.configured === false ? `<p class="q-ap-note">Google sign-in isn't switched on for this site yet.</p>` : ""}`}
      <button class="btn big q-reset" data-a="reset">🔄 Start fresh</button>`;
  p.onclick = async e => {
    e.stopPropagation();
    const a = e.target.closest("[data-a]"); if (!a) return;
    const act = a.dataset.a;
    if (act === "in"){ if (A.signIn){ try { await A.signIn(); p.remove(); } catch(err){ toast("Sign-in was cancelled or blocked"); } } else toast("Google sign-in isn't configured yet"); }
    if (act === "out"){ if (A.signOut) await A.signOut(); p.remove(); }
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
      <p class="muted">Real situations, real decisions, interview-ready answers.</p>
      <div class="q-statrow"><span><b>${esc(r.name)}</b><small>rank</small></span><span><b>${PR.xp.toLocaleString()}</b><small>XP</small></span><span><b>${PR.streak || 0}</b><small>day streak</small></span><span><b>${achN}/${ACH.length}</b><small>trophies</small></span></div>
      <div class="q-bar" title="${r.next ? (r.next[0] - PR.xp) + " XP to " + r.next[1] : ""}"><span style="width:${pct}%"></span></div>
    </section>
    ${nx ? `<a class="q-next" id="qNext" href="#mis-${nx.z}-${nx.i}"><span class="q-next-ic">${nx.M ? nx.M.icon : "🎬"}</span><div><small>${nx.i ? "Continue" : "Start here"} · ${esc(ZMAP[nx.z].title)} · mission ${nx.i + 1}</small><b>${nx.M ? esc(nx.M.title) : "Story mission"}</b>${nx.M ? `<p>${fm(nx.M.setup)}</p>` : ""}</div><span class="q-next-go">▶</span></a>` : ""}
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
        <div class="q-node-l"><b>${esc(L.t)}</b><small>${L.boss ? (L.act ? "Expert boss" : "Boss fight") : L.arcade ? "Arcade" : `${(L.rounds || []).length} rounds`}</small>${stars(s, "sm")}</div></li>`; }).join("")}</ol>`;
  // cards
  const deck = [];
  Z.levels.forEach((L, li) => (L.rounds || []).forEach((r, ri) => { if (r[0] === "learn") deck.push({id:`${li}-${ri}`, li, t:r[1], b:r[2], d:r[5], L}); }));
  let h = "";
  if (Z.cardBook){
    const where = cardMissionIndex(Z), keys = Object.keys(Z.cardBook), have = keys.filter(k => got.has("c:" + k));
    h += `<h2 class="q-sec-h">Story cards <small>${have.length}/${keys.length}</small></h2><p class="muted">Analogy, how it works, worked example, gotchas and an interview answer.</p>
      <div class="q-xcards">${keys.map(k => { const C = Z.cardBook[k]; return got.has("c:" + k) ? `<details class="q-xcd"><summary><b>${fm(C.t)}</b><small>${fm(C.one || "")}</small></summary>${cardHTML(C, "deck")}</details>` : `<div class="q-xcd lock"><b>?</b><small>Unlock in mission ${(where[k] ?? 0) + 1}</small></div>`; }).join("")}</div>`;
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
Q.cards = function(id, map){ if (this.data[id]) this.data[id].cardBook = map; };
const STORY = new Set(["spark", "kafka", "rag"]);
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
          else { const f = FACTS[id] || FACTS.spark; h = `<span>🧠</span><b>Did you know?</b><small>${fm(f[Math.floor(Math.random() * f.length)])}</small>`; }
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

window.loadQuest = function(h){
  if (typeof showMode === "function") showMode("courses");
  setKeys(null); drawAcct();
  const ap = document.getElementById("qAcctPanel"); if (ap) ap.remove();
  let m;
  if ((m = h.match(/^lvl-([a-z]+)-(\d+)$/))) levelView(m[1], +m[2]);
  else if ((m = h.match(/^mis-([a-z]+)-(\d+)$/))) missionView(m[1], +m[2], "ms");
  else if ((m = h.match(/^iv-([a-z]+)-(\d+)$/))) missionView(m[1], +m[2], "iv");
  else if ((m = h.match(/^zone-([a-z]+)(?:\/([a-z]+))?/))) zoneView(m[1], m[2]);
  else mapView();
  window.scrollTo(0, 0);
};
})();
