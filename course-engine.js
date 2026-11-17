// Course engine: routing, XP/levels/streaks/badges, course map, lessons, quizzes and the interactive labs.
// Uses helpers defined by the main page script at call time: $, esc, md, inl, showMode, reduceMotion.
(function(){
const C = window.COURSE_LLM;
const ITEMS = [];
C.units.forEach((u, ui) => u.items.forEach((it, ii) => { it.unit = ui; it.idx = ii; it.kind = it.kind || "lesson"; ITEMS.push(it); }));
const byId = id => ITEMS.find(i => i.id === id);
const LESSON_NO = {}; let n = 0; ITEMS.forEach(i => { if (i.kind === "lesson") LESSON_NO[i.id] = ++n; });

/* ---------------- progress state ---------------- */
const KEY = "course-llm-v1";
let S = {xp:0, done:{}, ch:{}, quiz:{}, badges:[], streak:0, last:null};
try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch(e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch(e) {} };
const LEVEL_XP = 300;
const level = () => Math.floor(S.xp / LEVEL_XP) + 1;
const today = () => { const d = new Date(); return d.getFullYear() + "-" + (d.getMonth()+1) + "-" + d.getDate(); };
function touchStreak(){
  const t = today(); if (S.last === t) return;
  const y = new Date(); y.setDate(y.getDate() - 1);
  const ys = y.getFullYear() + "-" + (y.getMonth()+1) + "-" + y.getDate();
  S.streak = S.last === ys ? S.streak + 1 : 1; S.last = t; save();
}
const ICON = {
  flame:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5.5 1-8.5z" fill="currentColor"/></svg>',
  star:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z" fill="currentColor"/></svg>',
  check:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  crown:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" fill="currentColor"/></svg>',
  quiz:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.2 9a3 3 0 1 1 4.3 2.7c-.9.4-1.5 1.2-1.5 2.2v.6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><circle cx="12" cy="18.4" r="1.6" fill="currentColor"/></svg>',
  flask:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6M10 3v6L4.5 18.5A2 2 0 0 0 6.2 21.5h11.6a2 2 0 0 0 1.7-3L14 9V3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M7 15h10" stroke="currentColor" stroke-width="2"/></svg>',
  bolt:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L4 14h7l-1 8 9-12h-7z" fill="currentColor"/></svg>',
  lock:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2.5" fill="currentColor"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>'
};
const BADGES = [
  {id:"first", name:"First token", desc:"Finish your first lesson", ic:"bolt", test:() => !!S.done["1"]},
  {id:"temp", name:"Temperature tamer", desc:"Beat the temperature challenge", ic:"flame", test:() => !!S.ch["4"]},
  {id:"whisper", name:"Prompt whisperer", desc:"Beat the system prompt challenge", ic:"star", test:() => !!S.ch["9"]},
  {id:"json", name:"JSON surgeon", desc:"Repair the broken JSON", ic:"check", test:() => !!S.ch["11"]},
  {id:"budget", name:"Budget boss", desc:"Bring the bill under budget", ic:"bolt", test:() => !!S.ch["14"]},
  {id:"ace", name:"Quiz ace", desc:"Score 100% on a checkpoint", ic:"quiz", test:() => Object.values(S.quiz).some(q => q && q.best === q.total)},
  {id:"streak", name:"On a roll", desc:"Learn 3 days in a row", ic:"flame", test:() => S.streak >= 3},
  {id:"master", name:"Ticket master", desc:"Ship the final project", ic:"crown", test:() => !!S.ch["boss"]}
];

/* ---------------- feedback: toasts, confetti ---------------- */
function toast(html, kind){
  let box = document.getElementById("toasts");
  if (!box){ box = document.createElement("div"); box.id = "toasts"; box.setAttribute("aria-live", "polite"); document.body.appendChild(box); }
  const t = document.createElement("div"); t.className = "toast " + (kind || ""); t.innerHTML = html; box.appendChild(t);
  setTimeout(() => t.classList.add("out"), 2600); setTimeout(() => t.remove(), 3100);
}
function confetti(){
  if (reduceMotion) return;
  const cv = document.createElement("canvas"); cv.className = "confetti"; document.body.appendChild(cv);
  const ctx = cv.getContext("2d"), W = cv.width = innerWidth, H = cv.height = innerHeight;
  const cols = ["#ff8a3d", "#3cc2ad", "#6aa1ff", "#a48cf0", "#e0b44a", "#ff5d73"];
  const P = Array.from({length:140}, () => ({x:W/2 + (Math.random()-.5)*W*.3, y:H*.35, vx:(Math.random()-.5)*14, vy:-Math.random()*13-4, r:Math.random()*6+3, c:cols[Math.floor(Math.random()*cols.length)], a:Math.random()*6, s:(Math.random()-.5)*.3}));
  let f = 0;
  (function tick(){
    ctx.clearRect(0, 0, W, H);
    P.forEach(p => { p.vy += .35; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.a += p.s; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r/2, -p.r/2, p.r, p.r*.6); ctx.restore(); });
    if (++f < 110) requestAnimationFrame(tick); else cv.remove();
  })();
}
function addXP(n, why){
  const before = level(); S.xp += n; touchStreak(); save();
  toast(`<b>+${n} XP</b> ${esc(why)}`, "xp");
  if (level() > before){ toast(`<b>Level ${level()}!</b> Keep going.`, "lvl"); confetti(); }
  checkBadges(); updateHud();
}
function checkBadges(){
  BADGES.forEach(b => { if (!S.badges.includes(b.id) && b.test()){ S.badges.push(b.id); save(); toast(`<span class="t-badge">${ICON[b.ic]}</span><b>Badge unlocked:</b> ${esc(b.name)}`, "badge"); } });
}
function updateHud(){
  document.querySelectorAll("[data-hud=xp]").forEach(e => e.textContent = S.xp);
  document.querySelectorAll("[data-hud=lvl]").forEach(e => e.textContent = level());
  document.querySelectorAll("[data-hud=streak]").forEach(e => e.textContent = S.streak);
  document.querySelectorAll("[data-hud=bar]").forEach(e => e.style.width = ((S.xp % LEVEL_XP) / LEVEL_XP * 100) + "%");
}

/* ---------------- live model ---------------- */
let SAMPLE = null, sampleAsked = false;
function initSample(){
  if (sampleAsked) return; sampleAsked = true;
  try {
    if (window.claude && typeof window.claude.use === "function"){
      window.claude.use("sample").then(s => { SAMPLE = s || null; document.querySelectorAll(".live-chip").forEach(paintLive); }).catch(() => {});
    }
  } catch(e) {}
}
const ENDPOINT = (window.SITE_CONFIG && window.SITE_CONFIG.llmEndpoint) || "";
const isLive = () => !!(SAMPLE || ENDPOINT);
function paintLive(el){ el.className = "live-chip " + (isLive() ? "on" : "off"); el.textContent = isLive() ? "Live model" : "Simulation mode"; el.title = isLive() ? "Runs your prompt against a real model" : "Replies come from a built-in rule engine"; }
async function ask(prompt){
  if (!SAMPLE && ENDPOINT){
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 30000);
    try {
      const r = await fetch(ENDPOINT, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({prompt}), signal:ctl.signal});
      if (!r.ok) return null;
      const j = await r.json(); return (j.text || "").trim();
    } catch(e){ return null; } finally { clearTimeout(t); }
  }
  if (!SAMPLE) return null;
  try { const r = await SAMPLE(prompt, {modelTier:"quick", cache:false}); return (r && r.text || "").trim(); }
  catch(e){ if (e && e.code === "not_granted"){ SAMPLE = null; document.querySelectorAll(".live-chip").forEach(paintLive); } throw e; }
}

/* ---------------- shared ticket logic (simulator) ---------------- */
const LABELS = ["REFUND", "CHARGEBACK", "SETTLEMENT_DELAY", "KYC", "OTHER"];
function trueLabel(t){
  const s = t.toLowerCase();
  if (/(pan|aadhaar|kyc|document|verif)/.test(s)) return "KYC";
  if (/(settlement|payout|settle|funds not received|sales)/.test(s)) return "SETTLEMENT_DELAY";
  if (/(don't recognise|dont recognise|did not make|didn't make|dispute|bank called|unknown charge)/.test(s)) return "CHARGEBACK";
  if (/(refund|debited|money deducted|charged twice|failed)/.test(s)) return "REFUND";
  return "OTHER";
}
// Simulated model: honours labels/format only when the prompt asks, and only knows house rules it is told.
function simClassify(ticket, promptLower){
  const s = ticket.toLowerCase(), p = promptLower;
  if (/(debited|deducted)/.test(s) && /failed/.test(s)) return (/debited|deducted|failed/.test(p)) ? "REFUND" : "OTHER";
  if (/(bank called|dispute|recognise)/.test(s)) return (/dispute|recognis|chargeback/.test(p) && /recognis|bank|dispute/.test(p)) ? "CHARGEBACK" : "REFUND";
  if (/(funds not received|sales|payout)/.test(s)) return (/payout|settlement|merchant/.test(p)) ? "SETTLEMENT_DELAY" : "OTHER";
  return trueLabel(ticket);
}
const namesLabels = p => LABELS.filter(l => p.includes(l.toLowerCase())).length >= 4;
const wantsOnly = p => /(only|just|exactly|nothing else|single word|one word|no other)/.test(p);
function simReply(sys, ticket){
  const p = sys.toLowerCase();
  if (!namesLabels(p)) return "Thanks for reaching out, and sorry for the trouble! Could you share your order ID and the date of the payment so I can look into this for you?";
  const lab = simClassify(ticket, p);
  if (wantsOnly(p)) return lab;
  return `This looks like a ${lab} issue. I'd route it to the ${lab.replace("_", " ").toLowerCase()} team and let the customer know we're on it.`;
}

/* ---------------- small UI helpers ---------------- */
function bars(items, opts = {}){
  // items: {label, p, cut, hi, win}
  return `<div class="pbars">${items.map(it => `<div class="pbar${it.cut ? " cut" : ""}${it.hi ? " hi" : ""}${it.win ? " win" : ""}">` +
    `<span class="pb-l">${esc(it.label)}</span><span class="pb-t"><span class="pb-f" style="width:${Math.max(0.5, it.p * 100).toFixed(1)}%"></span></span>` +
    `<span class="pb-v">${opts.count != null ? it.count : (it.p * 100).toFixed(it.p < .1 ? 1 : 0) + "%"}</span></div>`).join("")}</div>`;
}
const softmax = (logits, T) => { if (T <= 0.001){ const m = Math.max(...logits); return logits.map(l => l === m ? 1 : 0); } const ex = logits.map(l => Math.exp(l / T)); const s = ex.reduce((a, b) => a + b, 0); return ex.map(e => e / s); };
const pick = (probs, r) => { let acc = 0; for (let i = 0; i < probs.length; i++){ acc += probs[i]; if (r < acc) return i; } return probs.length - 1; };
function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* ======================= LABS ======================= */
const LABS = {};

LABS.nextToken = (el, ctx) => {
  const R = [
    {p:"The capital of France is", o:[[" Paris",.92],[" a",.03],[" located",.03],[" the",.02]], e:"A fact the model saw countless times: near-certain."},
    {p:"Your refund will be processed in 5-7 working", o:[[" days",.95],[" hours",.02],[" weeks",.02],[" steps",.01]], e:"A stock phrase from support pages."},
    {p:"The payment failed because the card was", o:[[" declined",.46],[" expired",.28],[" blocked",.16],[" invalid",.10]], e:"A close call. Run this many times and you'll see different endings."},
    {p:"def add(a, b):\n    return a", o:[[" +",.9],[" *",.04],["+",.03],[",",.03]], e:"Code is very predictable once the pattern is clear."},
    {p:"I would like to", o:[[" know",.31],[" request",.24],[" cancel",.23],[" thank",.22]], e:"Many good continuations: the model is genuinely unsure here."},
    {p:"Order #7781 was delivered to the wrong", o:[[" address",.81],[" person",.12],[" city",.05],[" house",.02]], e:"Context narrows the options a lot."}
  ];
  let i = 0, score = 0;
  const draw = () => {
    if (i >= R.length){
      el.innerHTML = `<div class="lab-result"><p class="big">${score} / ${R.length}</p><p>${score >= 4 ? "You think like a language model." : "Close! The model's 'obvious' choices come from patterns in billions of sentences."}</p><button class="btn" data-a="again">Play again</button></div>`;
      if (score >= 4) ctx.win();
      return;
    }
    const r = R[i];
    el.innerHTML = `<div class="game-top"><span>Round ${i+1} of ${R.length}</span><span>Score ${score}</span></div>` +
      `<pre class="prefix"><code>${esc(r.p)}<span class="caret">▍</span></code></pre>` +
      `<p class="lab-q">Which token does the model rank highest?</p>` +
      `<div class="opts">${r.o.map((o, k) => o).sort(() => .5 - Math.random()).map(o => `<button class="opt" data-tok="${esc(o[0])}">${esc(o[0].replace(/^ /, "␣"))}</button>`).join("")}</div><div class="reveal"></div>`;
  };
  el.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.a === "again"){ i = 0; score = 0; draw(); return; }
    if (b.dataset.a === "next"){ i++; draw(); return; }
    if (b.classList.contains("opt") && !el.querySelector(".opt.picked")){
      const r = R[i], top = r.o[0][0], right = b.dataset.tok === top;
      b.classList.add("picked", right ? "good" : "bad"); if (right) score++;
      el.querySelectorAll(".opt").forEach(x => { if (x.dataset.tok === top) x.classList.add("good"); x.disabled = true; });
      el.querySelector(".reveal").innerHTML = bars(r.o.map(o => ({label:o[0].replace(/^ /, "␣"), p:o[1], hi:o[0] === top}))) +
        `<p class="lab-note">${right ? "<b>Correct.</b> " : "<b>Not this time.</b> "}${esc(r.e)}</p><button class="btn solid" data-a="next">${i === R.length - 1 ? "See score" : "Next round →"}</button>`;
    }
  });
  draw();
};

LABS.tokenizer = (el, ctx) => {
  const VOC = ["settle","ment","merchant","refund","process","pend","expect","account","customer","verif","ication","charge","back","pay","tion","able","ing","ed","ly","un","re","er","est","ness","work","day","card","order","deliver","ation","fail"];
  const WHOLE = new Set(["payment","refund","merchant","account","because","customer","working","settled","pending","delivered","yesterday","received","failed","charged","support"]);
  const tok = text => {
    const out = []; const re = /(\s*)([A-Za-z]+|\d+|[^\sA-Za-z\d])/gu; let m;
    while ((m = re.exec(text))){
      const sp = m[1] ? " " : ""; const w = m[2];
      if (/^\d+$/.test(w)){ for (let i = 0; i < w.length; i += 3) out.push((i === 0 ? sp : "") + w.slice(i, i + 3)); continue; }
      if (/^[A-Za-z]+$/.test(w)){
        if (w.length <= 6 || WHOLE.has(w.toLowerCase())){ out.push(sp + w); continue; }
        let rest = w, first = true;
        while (rest.length){
          let best = ""; VOC.forEach(v => { if (v.length > best.length && rest.toLowerCase().startsWith(v)) best = v; });
          const len = best.length >= 2 ? best.length : Math.min(4, rest.length);
          out.push((first ? sp : "") + rest.slice(0, len)); rest = rest.slice(len); first = false;
        }
        continue;
      }
      out.push(sp + w);
    }
    return out;
  };
  const idOf = t => { let h = 7; for (const c of t) h = (h * 31 + c.codePointAt(0)) % 99991; return h; };
  el.innerHTML = `<label class="lab-lbl" for="tkIn">Type anything</label><textarea id="tkIn" class="lab-ta" rows="3">PayU settled ₹7,499 to merchant M42 unexpectedly!</textarea>
    <div class="presets"><button class="chip-btn" data-t="Refund pending for order 88213, please check.">English ticket</button><button class="chip-btn" data-t="నా రీఫండ్ ఇంకా రాలేదు, దయచేసి సహాయం చేయండి">Telugu ticket</button><button class="chip-btn" data-t="SELECT merchant_id, SUM(amount) FROM payments GROUP BY 1;">SQL</button><button class="chip-btn" data-t="Antidisestablishmentarianism is unbelievably uncharacteristic.">Long words</button></div>
    <div class="tk-out" id="tkOut"></div><div class="tk-stats" id="tkStats"></div>`;
  const run = () => {
    const text = el.querySelector("#tkIn").value, toks = tok(text);
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    el.querySelector("#tkOut").innerHTML = toks.map((t, i) => `<span class="tk c${i % 6}" title="id ${idOf(t)}">${esc(t.replace(/ /g, "␣"))}<sub>${idOf(t)}</sub></span>`).join("") || `<span class="muted">Type something above.</span>`;
    const ratio = words ? toks.length / words : 0;
    el.querySelector("#tkStats").innerHTML = `<span><b>${text.length}</b> characters</span><span><b>${words}</b> words</span><span><b>${toks.length}</b> tokens</span><span class="${ratio >= 1.6 ? "good" : ""}"><b>${ratio.toFixed(2)}</b> tokens per word</span>`;
    if (words >= 5 && ratio >= 1.6) ctx.win();
  };
  el.addEventListener("input", run);
  el.addEventListener("click", e => { const b = e.target.closest("[data-t]"); if (b){ el.querySelector("#tkIn").value = b.dataset.t; run(); } });
  run();
};

LABS.generate = (el, ctx) => {
  const T = {
    "<start>":[["Thanks",.55],["Sorry",.35],["Hi",.10]],
    "Thanks":[[" for",.85],[" so",.15]], " so":[[" much",1]], " much":[[" for",1]],
    " for":[[" your",.7],[" the",.3]], " your":[[" patience",.5],[" message",.35],[" payment",.15]],
    " the":[[" wait",.6],[" update",.4]], "Sorry":[[" for",.7],[" about",.3]], " about":[[" the",.6],[" this",.4]],
    " this":[[".",1]], " patience":[[".",.7],["!",.3]], " message":[[".",1]], " payment":[[".",.6],[" is",.4]],
    " is":[[" confirmed",.6],[" pending",.4]], " confirmed":[[".",1]], " pending":[[".",1]], " wait":[[".",.8],["!",.2]],
    " update":[[".",1]], "Hi":[[" there",1]], " there":[["!",.7],[",",.3]], ",":[[" thanks",1]], " thanks":[[" for",1]],
    ".":[["<eos>",.55],[" Your",.45]], "!":[["<eos>",.7],[" Your",.3]], " Your":[[" refund",.6],[" payment",.4]], " refund":[[" is",1]]
  };
  let seq = [], offTop = false;
  const last = () => seq.length ? seq[seq.length - 1] : "<start>";
  const draw = () => {
    const done = last() === "<eos>" || seq.length >= 30;
    const cand = done ? [] : (T[last()] || [["<eos>", 1]]);
    el.innerHTML = `<div class="gen-out">${seq.filter(t => t !== "<eos>").map((t, i) => `<span class="gt" style="--d:${i}">${esc(t)}</span>`).join("")}${done ? `<span class="eos">⏹ end</span>` : `<span class="caret">▍</span>`}</div>` +
      (done ? `<p class="lab-note">Finished in ${seq.length} steps${offTop ? ", including a less likely pick" : ""}. Every token was chosen from the ones offered at that step.</p>` :
      `<p class="lab-q">Step ${seq.length + 1}: candidates after <code>${esc(last())}</code>. Tap one, or let the model choose.</p>` +
      `<div class="cand">${cand.map((c, k) => `<button class="cand-b${k === 0 ? " top" : ""}" data-k="${k}"><span>${esc(c[0].replace(/^ /, "␣"))}</span><span class="pb-t"><span class="pb-f" style="width:${c[1]*100}%"></span></span><small>${Math.round(c[1]*100)}%</small></button>`).join("")}</div>`) +
      `<div class="lab-actions">${done ? "" : `<button class="btn" data-a="greedy">Pick most likely</button><button class="btn" data-a="sample">Sample randomly</button>`}<button class="btn ghost" data-a="reset">Start over</button></div>`;
    if (done && last() === "<eos>" && offTop) ctx.win();
  };
  el.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    const cand = T[last()] || [["<eos>", 1]];
    let k = null;
    if (b.dataset.k != null) k = +b.dataset.k;
    if (b.dataset.a === "greedy") k = 0;
    if (b.dataset.a === "sample") k = pick(cand.map(c => c[1]), Math.random());
    if (b.dataset.a === "reset"){ seq = []; offTop = false; draw(); return; }
    if (k != null){ if (k > 0) offTop = true; seq.push(cand[k][0]); draw(); }
  });
  draw();
};

LABS.temperature = (el, ctx) => {
  const toks = ["approved", "declined", "pending", "refunded", "banana"], logits = [2.2, 1.6, 0.9, 0.4, -1.6];
  let T = 1, counts = null;
  el.innerHTML = `<p class="lab-q">"The payment was ___"</p>
    <div class="slider-row"><label for="tSl">Temperature <b id="tVal">1.00</b></label><input id="tSl" type="range" min="0" max="2.5" step="0.05" value="1"></div>
    <div class="t-scale"><span>focused</span><span>as trained</span><span>chaotic</span></div>
    <div id="tBars"></div><div class="lab-actions"><button class="btn solid" data-a="s20">Sample 20 times</button></div><div id="tHist"></div>`;
  const draw = () => {
    const pr = softmax(logits, T);
    el.querySelector("#tVal").textContent = T.toFixed(2);
    el.querySelector("#tBars").innerHTML = bars(toks.map((t, i) => ({label:t, p:pr[i], hi:i === 0, win:t === "banana" && pr[i] > .05})));
    el.querySelector("#tHist").innerHTML = counts ? `<p class="lab-note">20 samples at T=${T.toFixed(2)}:</p><div class="hist">${counts.map((c, i) => `<div class="hb"><span class="hb-bar" style="height:${c * 5}%"></span><span class="hb-c">${c}</span><span class="hb-l">${toks[i]}</span></div>`).join("")}</div>` : "";
  };
  el.querySelector("#tSl").addEventListener("input", e => { T = +e.target.value; counts = null; draw(); });
  el.addEventListener("click", e => {
    if (!e.target.closest("[data-a=s20]")) return;
    const pr = softmax(logits, T); counts = toks.map(() => 0);
    for (let i = 0; i < 20; i++) counts[pick(pr, Math.random())]++;
    draw(); if (counts[4] > 0) ctx.win();
  });
  draw();
};

LABS.topkp = (el, ctx) => {
  const toks = ["tea","coffee","chai","water","milk","juice","soup","sugar","cement","regret"];
  const p0 = [.34,.27,.16,.08,.05,.04,.025,.02,.012,.008];
  let k = 10, p = 1;
  el.innerHTML = `<p class="lab-q">"I'll have a cup of ___"</p>
    <div class="slider-row"><label for="kSl">top-k <b id="kVal">10</b></label><input id="kSl" type="range" min="1" max="10" step="1" value="10"></div>
    <div class="slider-row"><label for="pSl">top-p <b id="pVal">1.00</b></label><input id="pSl" type="range" min="0.05" max="1" step="0.01" value="1"></div>
    <div id="kpBars"></div><p class="lab-note" id="kpNote"></p>`;
  const draw = () => {
    const keep = toks.map((_, i) => i < k);
    let acc = 0; const keepP = toks.map((_, i) => { const inside = acc < p - 1e-9; acc += p0[i]; return inside; });
    const kept = toks.map((_, i) => keep[i] && keepP[i]);
    const s = p0.reduce((a, v, i) => a + (kept[i] ? v : 0), 0);
    el.querySelector("#kVal").textContent = k; el.querySelector("#pVal").textContent = p.toFixed(2);
    el.querySelector("#kpBars").innerHTML = bars(toks.map((t, i) => ({label:t, p:kept[i] ? p0[i] / s : p0[i], cut:!kept[i], hi:kept[i]})));
    const n = kept.filter(Boolean).length;
    el.querySelector("#kpNote").innerHTML = `<b>${n}</b> candidate${n > 1 ? "s" : ""} survive. Their probabilities are rescaled to add up to 100%. Greyed-out tokens can never be picked.`;
    if (n === 3 && k === 10) ctx.win();
  };
  el.querySelector("#kSl").addEventListener("input", e => { k = +e.target.value; draw(); });
  el.querySelector("#pSl").addEventListener("input", e => { p = +e.target.value; draw(); });
  draw();
};

LABS.maxTokens = (el, ctx) => {
  const full = ["Your"," refund"," of"," ₹","1",",","299"," was"," approved"," today","."," It"," should"," reach"," your"," bank"," in"," 5","-","7"," working"," days","."];
  let m = 8;
  el.innerHTML = `<div class="slider-row"><label for="mSl">max_tokens <b id="mVal">8</b></label><input id="mSl" type="range" min="1" max="30" step="1" value="8"></div>
    <div class="mt-out" id="mtOut"></div><div class="mt-meta" id="mtMeta"></div>`;
  const draw = () => {
    const out = full.slice(0, m), cut = m < full.length;
    el.querySelector("#mVal").textContent = m;
    el.querySelector("#mtOut").innerHTML = out.map(t => `<span class="gt">${esc(t)}</span>`).join("") + (cut ? `<span class="cutmark">✂</span>` : "");
    el.querySelector("#mtMeta").innerHTML = `<span>tokens used <b>${out.length}</b></span><span class="sr ${cut ? "bad" : "good"}">finish_reason: <b>${cut ? "length" : "stop"}</b></span><span class="sr ${cut ? "bad" : "good"}">stop_reason: <b>${cut ? "max_tokens" : "end_turn"}</b></span>`;
    if (m === full.length) ctx.win();
  };
  el.querySelector("#mSl").addEventListener("input", e => { m = +e.target.value; draw(); });
  draw();
};

LABS.seeds = (el, ctx) => {
  const tickets = ["Txn 1", "Txn 2", "Txn 3", "Txn 4", "Txn 5"];
  const outs = ["approved", "declined", "pending"], pr = [.6, .3, .1];
  let history = [];
  el.innerHTML = `<div class="seed-row"><label for="sdIn">seed</label><input id="sdIn" type="number" value="42" min="0" max="999999"><button class="btn solid" data-a="run">Run</button><button class="btn" data-a="rand">Random seed</button></div>
    <div id="sdOut"></div><div id="sdHist" class="sd-hist"></div>`;
  const run = seed => {
    const r = mulberry32(seed), res = tickets.map(() => outs[pick(pr, r())]);
    const ok = res.filter(x => x === "approved").length;
    el.querySelector("#sdOut").innerHTML = `<div class="sd-grid">${res.map((x, i) => `<div class="sd-c ${x}"><small>${tickets[i]}</small><b>${x}</b></div>`).join("")}</div><p class="lab-note">${ok} of 5 approved with seed <b>${seed}</b>. Run the same seed again: you will get exactly this.</p>`;
    history.unshift(`seed ${seed}: ${res.map(x => x[0].toUpperCase()).join("")}`); history = history.slice(0, 6);
    el.querySelector("#sdHist").innerHTML = history.map(h => `<span>${h}</span>`).join("");
    if (ok >= 4) ctx.win();
  };
  el.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    const inp = el.querySelector("#sdIn");
    if (b.dataset.a === "rand") inp.value = Math.floor(Math.random() * 100000);
    run(Math.max(0, parseInt(inp.value, 10) || 0));
  });
};

LABS.chatOrder = (el, ctx) => {
  const M = [
    {r:"user", t:"Card charged twice for order 5521"},
    {r:"assistant", t:"REFUND"},
    {r:"system", t:"You label Paydesk tickets. Reply with one label."},
    {r:"user", t:"My refund for order 7781 hasn't arrived"}
  ];
  let order = [0, 1, 2, 3];
  const valid = () => { const r = order.map(i => M[i].r); if (r[0] !== "system") return "The system message should come first."; for (let i = 1; i < r.length; i++){ const want = i % 2 === 1 ? "user" : "assistant"; if (r[i] !== want) return `Message ${i+1} should be from the ${want}.`; } if (M[order[3]].t.indexOf("5521") < 0) return "Roles alternate, but the conversation should end with the new question the model must answer."; return ""; };
  const draw = () => {
    const err = valid();
    el.innerHTML = `<p class="lab-q">Use the arrows to reorder the messages.</p><ol class="msgs">${order.map((i, pos) => `<li class="msg r-${M[i].r}"><span class="role">${M[i].r}</span><span class="mt">${esc(M[i].t)}</span><span class="mv"><button class="icon-b" data-up="${pos}" aria-label="Move up" ${pos === 0 ? "disabled" : ""}>▲</button><button class="icon-b" data-dn="${pos}" aria-label="Move down" ${pos === 3 ? "disabled" : ""}>▼</button></span></li>`).join("")}</ol>` +
      `<p class="lab-note ${err ? "" : "good"}">${err ? esc(err) : "<b>Valid conversation.</b> The model will now write the next assistant message."}</p>` +
      `<p class="lab-lbl">What the model actually sees (simplified chat template)</p><pre><code>${esc(order.map(i => `<|${M[i].r}|>\n${M[i].t}\n<|end|>`).join("\n") + "\n<|assistant|>\n")}</code></pre>`;
    if (!err) ctx.win();
  };
  el.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.up){ const p = +b.dataset.up; [order[p-1], order[p]] = [order[p], order[p-1]]; }
    if (b.dataset.dn){ const p = +b.dataset.dn; [order[p+1], order[p]] = [order[p], order[p+1]]; }
    draw();
  });
  draw();
};

LABS.systemPrompt = (el, ctx) => {
  const TICKETS = ["My refund for order 7781 still hasn't arrived after 10 days.", "Please update the PAN card on my account, it shows the old one.", "I was charged twice for the same order yesterday."];
  el.innerHTML = `<label class="lab-lbl" for="spSys">System prompt</label><textarea id="spSys" class="lab-ta" rows="5">Help with tickets.</textarea>
    <label class="lab-lbl" for="spTk">Ticket (user message)</label><select id="spTk" class="lab-sel">${TICKETS.map((t, i) => `<option value="${i}">${esc(t)}</option>`).join("")}</select>
    <div class="lab-actions"><button class="btn solid" data-a="run">Run prompt</button><button class="btn ghost" data-a="hint">Show a hint</button></div>
    <div class="chat" id="spChat"></div>`;
  el.addEventListener("click", async e => {
    const b = e.target.closest("button"); if (!b) return;
    const chat = el.querySelector("#spChat");
    if (b.dataset.a === "hint"){ chat.innerHTML = `<div class="hint-box">Name the five labels (REFUND, CHARGEBACK, SETTLEMENT_DELAY, KYC, OTHER) and say exactly what the reply must contain: the label only, no other words.</div>`; return; }
    const sys = el.querySelector("#spSys").value.trim(), tk = TICKETS[+el.querySelector("#spTk").value];
    chat.innerHTML = `<div class="bubble user">${esc(tk)}</div><div class="bubble bot typing"><span></span><span></span><span></span></div>`;
    b.disabled = true;
    let reply;
    try {
      reply = await ask(`You are acting as the assistant in a teaching playground. Treat the SYSTEM PROMPT below as your system instructions and follow it exactly, then reply to the USER MESSAGE. Output only the assistant's reply.\n\nSYSTEM PROMPT:\n${sys}\n\nUSER MESSAGE:\n${tk}`);
    } catch(err){ reply = null; }
    if (reply == null) reply = simReply(sys, tk);
    b.disabled = false;
    const clean = reply.trim().replace(/[."'`]/g, "").toUpperCase();
    const ok = LABELS.includes(clean);
    chat.innerHTML = `<div class="bubble user">${esc(tk)}</div><div class="bubble bot">${esc(reply)}</div><p class="lab-note ${ok ? "good" : ""}">${ok ? "<b>Exactly one label.</b> Your router can use this directly." : `Not a bare label yet: ${reply.split(/\s+/).length} words. Code can't route that reliably.`}</p>`;
    if (ok) ctx.win();
  });
};

LABS.fewShot = (el, ctx) => {
  const EX = [
    {t:"Money got debited but the app says payment failed.", l:"REFUND"},
    {t:"My bank says I disputed a payment but I never did.", l:"CHARGEBACK"},
    {t:"Merchant here, yesterday's sales payout hasn't come.", l:"SETTLEMENT_DELAY"},
    {t:"How do I upload my Aadhaar for verification?", l:"KYC"},
    {t:"Can I change the email on my account?", l:"OTHER"},
    {t:"Refund for order 4410 hasn't reached me.", l:"REFUND"}
  ];
  const TEST = [
    {t:"₹2,000 deducted from my account, but the order shows failed.", l:"REFUND"},
    {t:"Funds not received for my shop's sales on Monday.", l:"SETTLEMENT_DELAY"},
    {t:"Bank called saying I raised a dispute. I don't recognise it.", l:"CHARGEBACK"}
  ];
  const sel = new Set([3, 4]);
  el.innerHTML = `<p class="lab-q">Tap examples to include them in the prompt.</p><div class="ex-grid">${EX.map((x, i) => `<button class="ex-card${sel.has(i) ? " on" : ""}" data-i="${i}"><span>${esc(x.t)}</span><b>${x.l}</b></button>`).join("")}</div>
    <div class="lab-actions"><button class="btn solid" data-a="run">Run on 3 tricky tickets</button><span class="tok-count" id="fsTok"></span></div><div id="fsOut"></div>`;
  const tokCount = () => { el.querySelector("#fsTok").textContent = `≈ ${60 + [...sel].reduce((a, i) => a + Math.round(EX[i].t.length / 4) + 4, 0)} prompt tokens`; };
  tokCount();
  el.addEventListener("click", async e => {
    const c = e.target.closest(".ex-card");
    if (c){ const i = +c.dataset.i; sel.has(i) ? sel.delete(i) : sel.add(i); c.classList.toggle("on"); tokCount(); return; }
    const b = e.target.closest("[data-a=run]"); if (!b) return;
    const exText = [...sel].map(i => `Ticket: ${EX[i].t}\nLabel: ${EX[i].l}`).join("\n\n");
    const base = `Classify Paydesk support tickets. Labels: REFUND, CHARGEBACK, SETTLEMENT_DELAY, KYC, OTHER. Reply with the label only.`;
    const out = el.querySelector("#fsOut"); out.innerHTML = `<div class="spinner">Running…</div>`; b.disabled = true;
    let preds = null;
    if (isLive()){
      try {
        const txt = await ask(`${base}\n\n${exText ? "Examples:\n\n" + exText + "\n\n" : ""}Now classify each of these tickets independently. Return ONLY a JSON array of 3 label strings in order.\n${TEST.map((x, i) => `${i+1}. ${x.t}`).join("\n")}`);
        const m = txt.match(/\[[\s\S]*\]/); preds = m ? JSON.parse(m[0]).map(s => String(s).trim().toUpperCase()) : null;
      } catch(err){ preds = null; }
    }
    if (!preds){ const pl = (base + " " + exText).toLowerCase(); preds = TEST.map(x => simClassify(x.t, pl)); }
    b.disabled = false;
    const score = TEST.filter((x, i) => preds[i] === x.l).length;
    out.innerHTML = `<div class="score-tbl">${TEST.map((x, i) => `<div class="sr-row ${preds[i] === x.l ? "ok" : "no"}"><span class="sr-ic">${preds[i] === x.l ? "✓" : "✗"}</span><span>${esc(x.t)}</span><span class="sr-pred">${esc(preds[i] || "?")}${preds[i] === x.l ? "" : ` <small>(want ${x.l})</small>`}</span></div>`).join("")}</div><p class="lab-note ${score === 3 ? "good" : ""}"><b>${score} / 3</b> correct. ${score === 3 ? "The examples taught the house rules." : "Which tricky case has no matching example yet?"}</p>`;
    if (score === 3) ctx.win();
  });
};

LABS.jsonFix = (el, ctx) => {
  const start = `{\n  'ticket_id': "T-1042",\n  "label": "Refund",\n  "priority": high,\n  "confidence": 1.4,\n}`;
  el.innerHTML = `<p class="lab-q">The model returned this. Fix it so it parses and matches the schema.</p>
    <div class="json-wrap"><textarea id="jsIn" class="lab-ta mono" rows="8" spellcheck="false">${esc(start)}</textarea>
    <div class="schema"><p class="lab-lbl">Schema</p><pre><code>ticket_id   string
label       REFUND | CHARGEBACK |
            SETTLEMENT_DELAY | KYC | OTHER
priority    low | medium | high
confidence  number from 0 to 1</code></pre></div></div>
    <ul class="checks" id="jsChecks"></ul><div class="lab-actions"><button class="btn ghost" data-a="reset">Reset</button></div>`;
  const run = () => {
    const v = el.querySelector("#jsIn").value; let obj = null, perr = "";
    try { obj = JSON.parse(v); } catch(e){ perr = e.message.replace(/^JSON\.parse: /, ""); }
    const C = [
      ["Parses as JSON", !perr, perr ? "Parser says: " + perr : ""],
      ["ticket_id is a string", obj && typeof obj.ticket_id === "string"],
      ["label is one of the allowed values", obj && LABELS.includes(obj.label), obj && obj.label && !LABELS.includes(obj.label) ? `"${obj.label}" isn't in the list (case matters)` : ""],
      ["priority is low, medium or high", obj && ["low", "medium", "high"].includes(obj.priority)],
      ["confidence is a number from 0 to 1", obj && typeof obj.confidence === "number" && obj.confidence >= 0 && obj.confidence <= 1]
    ];
    el.querySelector("#jsChecks").innerHTML = C.map(c => `<li class="${c[1] ? "ok" : "no"}"><span class="ck">${c[1] ? "✓" : "✗"}</span>${c[0]}${!c[1] && c[2] ? `<small>${esc(c[2])}</small>` : ""}</li>`).join("");
    if (C.every(c => c[1])) ctx.win();
  };
  el.addEventListener("input", run);
  el.addEventListener("click", e => { if (e.target.closest("[data-a=reset]")){ el.querySelector("#jsIn").value = start; run(); } });
  run();
};

const EVAL_SET = [
  {t:"Refund for order 9001 hasn't reached my bank yet.", l:"REFUND"},
  {t:"₹540 debited from my account, but the payment shows failed.", l:"REFUND"},
  {t:"There's a ₹3,000 charge I don't recognise on my statement.", l:"CHARGEBACK"},
  {t:"Merchant: settlement for last week is still pending.", l:"SETTLEMENT_DELAY"},
  {t:"My PAN verification keeps getting rejected.", l:"KYC"},
  {t:"How do I download my invoices?", l:"OTHER"},
  {t:"Funds not received for my store's sales yesterday.", l:"SETTLEMENT_DELAY"},
  {t:"Bank called saying I disputed a payment, I didn't.", l:"CHARGEBACK"}
];
async function runSet(sys, set, wantJson){
  let preds = null;
  if (isLive()){
    try {
      const txt = await ask(`Treat the SYSTEM PROMPT below as your instructions. Apply it to each numbered ticket independently, as if each were its own conversation. Return ONLY a JSON array with exactly ${set.length} elements, in order, where each element is the exact reply you would give for that ticket${wantJson ? " (an object if the instructions ask for JSON)" : " (a string)"}.\n\nSYSTEM PROMPT:\n${sys}\n\nTICKETS:\n${set.map((x, i) => `${i+1}. ${x.t}`).join("\n")}`);
      const m = txt.match(/\[[\s\S]*\]/); const arr = m ? JSON.parse(m[0]) : null;
      if (arr && arr.length === set.length) preds = arr;
    } catch(err){ preds = null; }
  }
  if (!preds){
    const p = sys.toLowerCase();
    preds = set.map(x => {
      if (!namesLabels(p)) return "Sorry about that! Could you share more details?";
      const lab = simClassify(x.t, p);
      if (wantJson && /json/.test(p)) return {label:lab, priority:/merchant|settlement|sales/i.test(x.t) ? "medium" : /refund|debited|charge|disput/i.test(x.t) ? "high" : "low"};
      return wantsOnly(p) ? lab : `Label: ${lab}`;
    });
  }
  return preds;
}
const labelOf = r => {
  if (r && typeof r === "object") return String(r.label || "").toUpperCase();
  const s = String(r || "").trim();
  try { const o = JSON.parse(s); if (o && o.label) return String(o.label).toUpperCase(); } catch(e) {}
  const up = s.toUpperCase().replace(/[^A-Z_ ]/g, " ");
  return LABELS.find(l => up.split(/\s+/).includes(l)) || up.trim();
};

LABS.evalLab = (el, ctx) => {
  el.innerHTML = `<label class="lab-lbl" for="evSys">System prompt under test</label><textarea id="evSys" class="lab-ta" rows="6">Classify Paydesk tickets into REFUND, CHARGEBACK, SETTLEMENT_DELAY, KYC or OTHER. Reply with the label only.</textarea>
    <div class="lab-actions"><button class="btn solid" data-a="run">Run on 8 test tickets</button></div><div id="evOut"></div><div class="runs" id="evRuns"></div>`;
  const runs = [];
  el.addEventListener("click", async e => {
    const b = e.target.closest("[data-a=run]"); if (!b) return;
    const sys = el.querySelector("#evSys").value, out = el.querySelector("#evOut");
    out.innerHTML = `<div class="spinner">Scoring…</div>`; b.disabled = true;
    const preds = await runSet(sys, EVAL_SET, false); b.disabled = false;
    const got = preds.map(labelOf), score = EVAL_SET.filter((x, i) => got[i] === x.l).length;
    runs.unshift(score);
    out.innerHTML = `<div class="score-tbl">${EVAL_SET.map((x, i) => `<div class="sr-row ${got[i] === x.l ? "ok" : "no"}"><span class="sr-ic">${got[i] === x.l ? "✓" : "✗"}</span><span>${esc(x.t)}</span><span class="sr-pred">${esc(got[i] || "?")}${got[i] === x.l ? "" : ` <small>(want ${x.l})</small>`}</span></div>`).join("")}</div>` +
      `<div class="score-big"><span class="ring lg" style="--p:${score / 8 * 100}; --rc:${score >= 7 ? "var(--k-disk)" : "var(--accent)"}"><b>${score}/8</b></span><p>${score >= 7 ? "Ship-worthy on this set. Next: check a hold-out set." : "Read the misses. Which house rule is the prompt missing?"}</p></div>`;
    el.querySelector("#evRuns").innerHTML = `<span class="lab-lbl">Run history</span>` + runs.map((r, i) => `<span class="run-chip ${r >= 7 ? "good" : ""}">${i === 0 ? "latest " : ""}${r}/8</span>`).join("");
    if (score >= 7) ctx.win();
  });
};

LABS.contextPack = (el, ctx) => {
  const LIMIT = 8000;
  const IT = [
    {n:"System prompt", t:600, req:true}, {n:"New ticket", t:300, req:true}, {n:"Reserved for the answer", t:1000, req:true},
    {n:"Refund policy section", t:2200, need:true}, {n:"Few-shot examples", t:1200, need:true}, {n:"Last 5 messages", t:1500, need:true},
    {n:"Full chat history", t:6000}, {n:"Entire FAQ (200 pages)", t:9000}, {n:"Customer's past 50 orders", t:3500}
  ];
  const on = new Set([0, 1, 2, 6]);
  const cols = ["var(--k-proc)", "var(--k-disk)", "var(--k-mem)", "var(--accent)", "var(--k-meta)", "var(--k-log)", "#8a94a6", "#b0b7c3", "#9aa5b8"];
  const draw = () => {
    const used = [...on].reduce((a, i) => a + IT[i].t, 0), over = used > LIMIT;
    const needs = IT.every((x, i) => !x.need || on.has(i));
    el.innerHTML = `<div class="ctx-bar ${over ? "over" : ""}">${[...on].sort((a, b) => a - b).map(i => `<span style="width:${IT[i].t / Math.max(LIMIT, used) * 100}%; background:${cols[i]}" title="${esc(IT[i].n)}"></span>`).join("")}<i class="ctx-lim" style="left:${LIMIT / Math.max(LIMIT, used) * 100}%"></i></div>
      <p class="ctx-num ${over ? "bad" : "good"}"><b>${used.toLocaleString()}</b> / ${LIMIT.toLocaleString()} tokens ${over ? "— over the limit, the request would fail" : "— fits"}</p>
      <div class="ctx-items">${IT.map((x, i) => `<button class="ctx-it${on.has(i) ? " on" : ""}${x.req ? " req" : ""}" data-i="${i}" ${x.req ? "disabled" : ""}><span class="sw" style="background:${cols[i]}"></span><span>${esc(x.n)}</span><small>${x.t.toLocaleString()}${x.req ? " · required" : ""}</small></button>`).join("")}</div>
      <p class="lab-note">${!needs ? "The bot needs the refund policy, examples and recent messages to answer well." : over ? "Something big has to go." : "<b>Packed.</b> Everything useful fits, with room for the answer."}</p>`;
    if (!over && needs) ctx.win();
  };
  el.addEventListener("click", e => { const b = e.target.closest(".ctx-it"); if (!b || b.disabled) return; const i = +b.dataset.i; on.has(i) ? on.delete(i) : on.add(i); draw(); });
  draw();
};

LABS.costLab = (el, ctx) => {
  const MODELS = {small:{n:"Small", i:.25, o:1.25}, medium:{n:"Medium", i:3, o:15}, large:{n:"Large", i:15, o:75}};
  const s = {model:"large", req:50000, inTok:4000, outTok:300, cache:false, batch:false};
  el.innerHTML = `<div class="seg" role="radiogroup" aria-label="Model">${Object.entries(MODELS).map(([k, m]) => `<button data-m="${k}" role="radio">${m.n}<small>$${m.i} / $${m.o} per M</small></button>`).join("")}</div>
    <div class="slider-row"><label for="cIn">Input tokens per call <b id="cInV"></b></label><input id="cIn" type="range" min="300" max="6000" step="100" value="4000"></div>
    <div class="slider-row"><label for="cOut">Output tokens per call <b id="cOutV"></b></label><input id="cOut" type="range" min="5" max="800" step="5" value="300"></div>
    <div class="toggles"><label><input type="checkbox" id="cCache"> Prompt caching <small>(70% of input is a repeated prefix, billed at 10%)</small></label><label><input type="checkbox" id="cBatch"> Batch API <small>(50% off, results within hours)</small></label></div>
    <div class="cost-out" id="cOutBox"></div>`;
  const draw = () => {
    const m = MODELS[s.model];
    const inCost = s.cache ? (s.inTok * .3 * m.i + s.inTok * .7 * m.i * .1) : s.inTok * m.i;
    let per = (inCost + s.outTok * m.o) / 1e6; if (s.batch) per *= .5;
    const month = per * s.req * 30, ok = month <= 3000;
    el.querySelectorAll("[data-m]").forEach(b => b.setAttribute("aria-checked", b.dataset.m === s.model));
    el.querySelector("#cInV").textContent = s.inTok.toLocaleString(); el.querySelector("#cOutV").textContent = s.outTok;
    el.querySelector("#cOutBox").innerHTML = `<div class="cost-big ${ok ? "good" : "bad"}"><small>Monthly cost for 50,000 tickets/day</small><b>$${Math.round(month).toLocaleString()}</b><span>budget $3,000</span></div>
      <div class="budget-bar"><span style="width:${Math.min(100, month / 3000 * 100)}%"></span></div><p class="lab-note">$${per.toFixed(5)} per ticket. Prices are illustrative.</p>`;
    if (ok) ctx.win();
  };
  el.addEventListener("click", e => { const b = e.target.closest("[data-m]"); if (b){ s.model = b.dataset.m; draw(); } });
  el.addEventListener("input", e => {
    if (e.target.id === "cIn") s.inTok = +e.target.value; if (e.target.id === "cOut") s.outTok = +e.target.value;
    if (e.target.id === "cCache") s.cache = e.target.checked; if (e.target.id === "cBatch") s.batch = e.target.checked; draw();
  });
  draw();
};

LABS.latencyLab = (el, ctx) => {
  const MODELS = {small:{n:"Small", base:.25, tps:200}, medium:{n:"Medium", base:.5, tps:90}, large:{n:"Large", base:1.2, tps:40}};
  const s = {model:"medium", inTok:4000, outTok:400, stream:false};
  el.innerHTML = `<div class="seg" role="radiogroup" aria-label="Model">${Object.entries(MODELS).map(([k, m]) => `<button data-m="${k}" role="radio">${m.n}<small>${m.tps} tok/s</small></button>`).join("")}</div>
    <div class="slider-row"><label for="lIn">Prompt tokens <b id="lInV"></b></label><input id="lIn" type="range" min="200" max="8000" step="100" value="4000"></div>
    <div class="slider-row"><label for="lOut">Output tokens <b id="lOutV"></b></label><input id="lOut" type="range" min="20" max="800" step="10" value="400"></div>
    <div class="toggles"><label><input type="checkbox" id="lStr"> Stream the response</label></div>
    <div id="lOutBox"></div><div class="lab-actions"><button class="btn solid" data-a="race">Watch it run</button></div><div class="race" id="lRace"></div>`;
  let calc;
  const draw = () => {
    const m = MODELS[s.model], ttft = m.base + s.inTok / 1000 * .1, total = ttft + s.outTok / m.tps, felt = s.stream ? ttft : total;
    calc = {ttft, total, felt};
    el.querySelectorAll("[data-m]").forEach(b => b.setAttribute("aria-checked", b.dataset.m === s.model));
    el.querySelector("#lInV").textContent = s.inTok.toLocaleString(); el.querySelector("#lOutV").textContent = s.outTok;
    const ok = s.model === "medium" && felt < 1 && total < 4;
    el.querySelector("#lOutBox").innerHTML = `<div class="lat-grid"><div class="${felt < 1 ? "good" : "bad"}"><small>Felt wait</small><b>${felt.toFixed(2)} s</b></div><div><small>Time to first token</small><b>${ttft.toFixed(2)} s</b></div><div class="${total < 4 ? "good" : "bad"}"><small>Total time</small><b>${total.toFixed(2)} s</b></div></div>` +
      (s.model !== "medium" ? `<p class="lab-note">The challenge needs the Medium model for quality.</p>` : "");
    if (ok) ctx.win();
  };
  el.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.m){ s.model = b.dataset.m; draw(); return; }
    if (b.dataset.a === "race"){
      const box = el.querySelector("#lRace"), words = "Thanks for your patience. Your refund of ₹1,299 was approved today and should reach your bank in 5-7 working days. You'll get an SMS once it's processed.".split(" ");
      box.innerHTML = `<div class="race-screen"><span class="race-t">0.0 s</span><p class="race-txt"></p></div>`;
      const t0 = performance.now(), txt = box.querySelector(".race-txt"), clock = box.querySelector(".race-t");
      const tick = () => {
        const t = (performance.now() - t0) / 1000;
        clock.textContent = t.toFixed(1) + " s";
        const shown = t < calc.ttft ? 0 : Math.min(words.length, Math.floor((t - calc.ttft) / (calc.total - calc.ttft) * words.length));
        if (s.stream) txt.textContent = shown ? words.slice(0, shown).join(" ") : "…";
        else txt.textContent = t >= calc.total ? words.join(" ") : "waiting…";
        if (t < calc.total + .05) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  });
  el.addEventListener("input", e => { if (e.target.id === "lIn") s.inTok = +e.target.value; if (e.target.id === "lOut") s.outTok = +e.target.value; if (e.target.id === "lStr") s.stream = e.target.checked; draw(); });
  draw();
};

LABS.boss = (el, ctx) => {
  const HIDDEN = [
    {t:"₹1,850 was deducted but my order says payment failed.", l:"REFUND"},
    {t:"My refund for order 6612 hasn't arrived after a week.", l:"REFUND"},
    {t:"I see a payment to 'QuickMart' I don't recognise.", l:"CHARGEBACK"},
    {t:"My bank told me I disputed a transaction. I didn't.", l:"CHARGEBACK"},
    {t:"Merchant here: Tuesday's payout still not credited.", l:"SETTLEMENT_DELAY"},
    {t:"Funds not received for my shop's sales this weekend.", l:"SETTLEMENT_DELAY"},
    {t:"Aadhaar upload fails at the verification step.", l:"KYC"},
    {t:"Which documents do I need for business KYC?", l:"KYC"},
    {t:"How can I change my registered email address?", l:"OTHER"},
    {t:"Do you have an API for generating invoices?", l:"OTHER"}
  ];
  const starter = `You sort Paydesk support tickets.

Labels: REFUND, CHARGEBACK, SETTLEMENT_DELAY, KYC, OTHER
Priority: high, medium or low.

Reply with JSON only, like {"label": "REFUND", "priority": "high"}`;
  el.innerHTML = `<label class="lab-lbl" for="bsSys">Your system prompt (add the house rules and a few examples)</label><textarea id="bsSys" class="lab-ta" rows="10">${esc(starter)}</textarea>
    <div class="lab-actions"><button class="btn solid" data-a="run">Run on 10 hidden tickets</button></div><div id="bsOut"></div>`;
  el.addEventListener("click", async e => {
    const b = e.target.closest("[data-a=run]"); if (!b) return;
    const sys = el.querySelector("#bsSys").value, out = el.querySelector("#bsOut");
    out.innerHTML = `<div class="spinner">Routing 10 tickets…</div>`; b.disabled = true;
    const preds = await runSet(sys, HIDDEN, true); b.disabled = false;
    const got = preds.map(labelOf), score = HIDDEN.filter((x, i) => got[i] === x.l).length;
    const jsonOk = preds.filter(p => typeof p === "object" || (() => { try { return !!JSON.parse(p).label; } catch(e){ return false; } })()).length;
    out.innerHTML = `<div class="score-big"><span class="ring lg" style="--p:${score * 10}; --rc:${score >= 8 ? "var(--k-disk)" : "var(--accent)"}"><b>${score}/10</b></span><p>${score >= 8 ? "<b>Shipped!</b> Your sorter is live." : "Not yet. Check which house rule the misses break."}<br><small>${jsonOk}/10 replies were valid JSON.</small></p></div>` +
      `<div class="score-tbl">${HIDDEN.map((x, i) => `<div class="sr-row ${got[i] === x.l ? "ok" : "no"}"><span class="sr-ic">${got[i] === x.l ? "✓" : "✗"}</span><span>${esc(x.t)}</span><span class="sr-pred">${esc(got[i] || "?")}${got[i] === x.l ? "" : ` <small>(want ${x.l})</small>`}</span></div>`).join("")}</div>`;
    if (score >= 8) ctx.win();
  });
};

window.COURSE_LABS = LABS;
window.COURSE_UTIL = {bars, pick, mulberry32, softmax};

/* ======================= PAGES ======================= */
const root = () => document.getElementById("cRoot");
const unitHue = u => C.units[u].hue;
const nodeIcon = it => it.kind === "quiz" ? ICON.quiz : it.kind === "boss" ? ICON.crown : `<span class="n-num">${LESSON_NO[it.id]}</span>`;
const nextUp = () => ITEMS.find(i => !S.done[i.id]) || ITEMS[ITEMS.length - 1];

function hudHTML(){
  return `<div class="hud"><div class="hud-c lvl"><span class="hud-ic">${ICON.star}</span><div><small>Level <b data-hud="lvl">${level()}</b></small><div class="xpbar"><span data-hud="bar" style="width:${(S.xp % LEVEL_XP) / LEVEL_XP * 100}%"></span></div><small><b data-hud="xp">${S.xp}</b> XP</small></div></div>` +
    `<div class="hud-c streak"><span class="hud-ic">${ICON.flame}</span><div><b data-hud="streak">${S.streak}</b><small>day streak</small></div></div></div>`;
}

function renderHome(){
  const up = nextUp(), doneN = ITEMS.filter(i => S.done[i.id]).length;
  root().innerHTML = `<section class="c-hero">
      <div class="c-hero-txt"><p class="c-eyebrow">Course · ${Object.keys(LESSON_NO).length} lessons · ${ITEMS.filter(i => i.kind === "quiz").length} checkpoints · 1 final project</p><h1>${esc(C.title)}</h1><p>${esc(C.tagline)}</p><p class="c-story">${esc(C.story)}</p>
        <div class="c-cta"><a class="btn big solid" href="#lesson-llm-${up.id}">${doneN ? "Continue" : "Start"}: ${esc(up.title)} →</a><span class="muted">${doneN}/${ITEMS.length} complete</span></div></div>
      <div class="c-hero-side">${hudHTML()}<div class="c-badges">${BADGES.map(b => `<div class="bdg ${S.badges.includes(b.id) ? "on" : ""}" title="${esc(b.desc)}"><span>${S.badges.includes(b.id) ? ICON[b.ic] : ICON.lock}</span><small>${esc(b.name)}</small></div>`).join("")}</div></div>
    </section>
    <div class="c-path">${C.units.map((u, ui) => {
      const done = u.items.filter(i => S.done[i.id]).length;
      return `<section class="c-unit st" style="--h:${u.hue}"><header class="c-unit-h"><span class="u-no">Unit ${ui+1}</span><h2>${esc(u.title)}</h2><p>${esc(u.desc)}</p><span class="u-prog">${done}/${u.items.length}</span></header>
        <div class="c-track"><svg class="c-trail" aria-hidden="true"></svg><ol class="c-nodes">${u.items.map((it, ii) => {
          const isDone = !!S.done[it.id], cur = it === up;
          return `<li style="--x:${[0, 1, 1.5, 1, 0, -1, -1.5, -1][ii % 8]}; --i:${ii}"><a class="c-node k-${it.kind}${isDone ? " done" : ""}${cur ? " cur" : ""}" href="#lesson-llm-${it.id}" aria-label="${esc(it.title)}">${isDone ? ICON.check : nodeIcon(it)}${cur ? `<span class="c-bubble">${doneN ? "NEXT" : "START"}</span>` : ""}</a>` +
            `<div class="c-node-lbl"><b>${esc(it.title)}</b><small>${it.mins} min${it.labTitle ? ` · ${it.kind === "boss" ? "Project" : "Lab"}: ${esc(it.labTitle)}` : it.kind === "quiz" ? ` · ${it.questions.length} questions` : ""}</small></div></li>`;
        }).join("")}</ol></div></section>`;
    }).join("")}</div>`;
  requestAnimationFrame(drawTrails);
}
function drawTrails(){
  document.querySelectorAll(".c-track").forEach(tr => {
    const svg = tr.querySelector(".c-trail"), box = tr.getBoundingClientRect();
    const pts = [...tr.querySelectorAll(".c-node")].map(n => { const r = n.getBoundingClientRect(); return [r.left - box.left + r.width / 2, r.top - box.top + r.height / 2]; });
    if (pts.length < 2) return;
    svg.setAttribute("width", box.width); svg.setAttribute("height", box.height); svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
    let d = `M${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++){ const [x0, y0] = pts[i-1], [x1, y1] = pts[i], my = (y0 + y1) / 2; d += ` C${x0} ${my}, ${x1} ${my}, ${x1} ${y1}`; }
    svg.innerHTML = `<path d="${d}" class="trail-bg"/><path d="${d}" class="trail-fg"/>`;
  });
}

function renderItem(id){
  const it = byId(id); if (!it){ renderHome(); return; }
  const u = C.units[it.unit], idx = ITEMS.indexOf(it), prev = ITEMS[idx - 1], next = ITEMS[idx + 1];
  const kicker = it.kind === "quiz" ? "Checkpoint" : it.kind === "boss" ? "Final project" : `Lesson ${LESSON_NO[it.id]}`;
  let main = "";
  if (it.kind === "quiz") main = quizHTML(it);
  else {
    main = `<div class="l-mission"><span class="m-ic">${ICON.flask}</span><div><b>Mission</b><p>${esc(it.mission)}</p></div></div>
      <div class="l-body deep">${md(it.body)}</div>
      <section class="lab" id="lab"><header class="lab-h"><span class="lab-tag">${it.kind === "boss" ? "Project" : "Lab"}</span><h2>${esc(it.labTitle)}</h2><span class="live-chip"></span></header>
        <div class="challenge ${S.ch[it.id] ? "won" : ""}" id="chal"><span class="ch-ic">${S.ch[it.id] ? ICON.check : ICON.bolt}</span><div><b>${S.ch[it.id] ? "Challenge complete" : "Challenge"}</b><p>${esc(it.challenge)}</p></div><span class="ch-xp">+${it.kind === "boss" ? 150 : 50} XP</span></div>
        <div class="lab-body" id="labBody"></div></section>
      <section class="l-take"><h3>Key takeaways</h3><ul>${it.take.map(t => `<li>${esc(t)}</li>`).join("")}</ul></section>`;
  }
  root().innerHTML = `<div class="l-top"><a class="btn ghost" href="#course-llm">← Course map</a>
      <ol class="l-dots">${u.items.map(x => `<li><a href="#lesson-llm-${x.id}" class="${x === it ? "on" : ""}${S.done[x.id] ? " done" : ""}" aria-label="${esc(x.title)}"></a></li>`).join("")}</ol>
      <span class="l-xp">${ICON.star}<b data-hud="xp">${S.xp}</b> XP</span></div>
    <article class="l-main st" style="--h:${u.hue}">
      <header class="l-head"><p class="l-kicker">Unit ${it.unit + 1}: ${esc(u.title)} · ${kicker} · ${it.mins} min</p><h1>${esc(it.title)}</h1>${it.sum ? `<p class="l-sum">${esc(it.sum)}</p>` : ""}</header>
      ${main}
      <div class="l-foot">${it.kind !== "quiz" ? `<button class="btn big ${S.done[it.id] ? "" : "solid"}" id="lDone" ${S.done[it.id] ? "disabled" : ""}>${S.done[it.id] ? "✓ Completed" : it.kind === "boss" ? "Beat the challenge to complete" : "Complete lesson · +20 XP"}</button>` : ""}
        <span class="spacer"></span>${prev ? `<a class="btn" href="#lesson-llm-${prev.id}">← ${esc(prev.title)}</a>` : ""}${next ? `<a class="btn solid" href="#lesson-llm-${next.id}">${esc(next.title)} →</a>` : ""}</div>
    </article>`;
  if (it.kind === "boss" && !S.done[it.id]) document.getElementById("lDone").disabled = true;
  if (it.lab && LABS[it.lab]){
    initSample();
    document.querySelectorAll(".live-chip").forEach(paintLive);
    const usesLive = ["systemPrompt", "fewShot", "evalLab", "boss"].includes(it.lab);
    if (!usesLive) document.querySelectorAll(".live-chip").forEach(c => c.remove());
    const won = () => {
      if (S.ch[it.id]) return;
      S.ch[it.id] = true; save();
      const ch = document.getElementById("chal"); if (ch){ ch.classList.add("won"); ch.querySelector(".ch-ic").innerHTML = ICON.check; ch.querySelector("b").textContent = "Challenge complete"; }
      confetti(); addXP(it.kind === "boss" ? 150 : 50, "challenge complete");
      if (it.kind === "boss") completeItem(it, true);
    };
    LABS[it.lab](document.getElementById("labBody"), {win:won});
  }
  if (it.kind === "quiz") wireQuiz(it);
  const btn = document.getElementById("lDone");
  if (btn && it.kind === "lesson") btn.addEventListener("click", () => completeItem(it));
}
function completeItem(it, silent){
  if (S.done[it.id]) return;
  S.done[it.id] = true; save();
  if (!silent) addXP(20, "lesson complete"); else checkBadges();
  const b = document.getElementById("lDone"); if (b){ b.textContent = "✓ Completed"; b.disabled = true; b.classList.remove("solid"); }
  document.querySelectorAll(".l-dots a.on").forEach(a => a.classList.add("done"));
}

function quizHTML(it){
  return `<p class="l-mission q-intro"><span class="m-ic">${ICON.quiz}</span><span>Answer all ${it.questions.length}. You need 60% to pass. +10 XP for each answer you get right the first time.</span></p>
    <div class="quiz">${it.questions.map((q, qi) => `<div class="qz" data-q="${qi}"><p class="qz-q"><span>${qi+1}</span>${esc(q.q)}</p><div class="qz-o">${q.o.map((o, oi) => `<button class="qz-b" data-o="${oi}">${esc(o)}</button>`).join("")}</div><p class="qz-e" hidden></p></div>`).join("")}</div>
    <div class="qz-result" id="qzRes" hidden></div>`;
}
function wireQuiz(it){
  const answered = {}; let right = 0;
  const key = it.id, rec = S.quiz[key] || {best:0, total:it.questions.length, seen:{}};
  document.querySelector(".quiz").addEventListener("click", e => {
    const b = e.target.closest(".qz-b"); if (!b) return;
    const box = b.closest(".qz"), qi = +box.dataset.q; if (answered[qi] != null) return;
    const q = it.questions[qi], oi = +b.dataset.o, ok = oi === q.a; answered[qi] = ok; if (ok) right++;
    box.querySelectorAll(".qz-b").forEach((x, k) => { x.disabled = true; if (k === q.a) x.classList.add("good"); });
    if (!ok) b.classList.add("bad");
    box.classList.add(ok ? "ok" : "no");
    const e2 = box.querySelector(".qz-e"); e2.hidden = false; e2.innerHTML = `<b>${ok ? "Correct." : "Not quite."}</b> ${esc(q.e)}`;
    if (ok && !rec.seen[qi]){ rec.seen[qi] = true; S.quiz[key] = rec; save(); addXP(10, "correct answer"); }
    if (Object.keys(answered).length === it.questions.length){
      const total = it.questions.length, pass = right / total >= .6;
      rec.best = Math.max(rec.best, right); S.quiz[key] = rec; save();
      if (pass) completeItem(it, true);
      checkBadges();
      const res = document.getElementById("qzRes"); res.hidden = false;
      res.innerHTML = `<span class="ring lg" style="--p:${right / total * 100}; --rc:${pass ? "var(--k-disk)" : "var(--accent)"}"><b>${right}/${total}</b></span><div><h3>${right === total ? "Perfect score!" : pass ? "Checkpoint passed" : "Almost there"}</h3><p>${pass ? "On to the next unit." : "Re-read the explanations above and try again."}</p><button class="btn" id="qzAgain">Try again</button></div>`;
      if (right === total) confetti();
      document.getElementById("qzAgain").onclick = () => renderItem(it.id);
      res.scrollIntoView({block:"nearest", behavior: reduceMotion ? "auto" : "smooth"});
    }
  });
}

window.loadCourse = function(h){
  showMode("courses");
  touchStreak(); checkBadges();
  if (h.startsWith("lesson-llm-")) renderItem(h.slice(11)); else renderHome();
  window.scrollTo(0, 0);
};
let rzT; window.addEventListener("resize", () => { clearTimeout(rzT); rzT = setTimeout(() => { if (document.querySelector(".c-track")) drawTrails(); }, 150); });
})();
