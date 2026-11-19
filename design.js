/* Dagdeep · System design: interactive design rounds, reference architectures, project ideas.
   Loaded on demand by quest-engine.js. Content lives in SD_ROUNDS, SD_ARCH, SD_PROJECTS (design-data.js). */
(() => {
const Q = window.QUEST, {esc, fm, md, root, stars, save, P, addXP, toast, confetti, unlock, shuffle, reduce, refList, needZones, refZones} = Q._;
const D = window.DAGDEEP_DESIGN;

/* ---------- architecture diagrams ----------
   spec: {nodes:{id:{c, r, label, sub, k}}, edges:[[from, to, label?]]}
   k: src | stream | proc | store | serve | ai | user | ops */
const KC = {src:"#64748b", stream:"#d97706", proc:"#2563eb", store:"#0f8a7a", serve:"#7c3aed", ai:"#db2777", user:"#334155", ops:"#b45309"};
function arch(spec, fill){
  // On phones the flow runs top-to-bottom so the diagram stays readable without sideways scrolling.
  const V = window.innerWidth < 640, N0 = spec.nodes, ids = Object.keys(N0);
  const N = Object.fromEntries(ids.map(i => [i, Object.assign({}, N0[i], V ? {c:N0[i].r, r:N0[i].c} : {})]));
  const cols = Math.max(...ids.map(i => N[i].c)) + 1, rows = Math.max(...ids.map(i => N[i].r)) + 1;
  const CW = V ? 186 : 200, RH = V ? 96 : 92, NW = 166, NH = 60, PX = 16, PY = 18, W = cols * CW + PX, H = rows * RH + PY;
  const pos = id => ({x:PX + N[id].c * CW, y:PY + N[id].r * RH});
  const lab = id => { let l = N[id].label; if (fill) l = l.replace(/\{(\w+)\}/g, (m, k) => fill[k] || "?"); return l; };
  const wrap = (t, n) => { const w = String(t).split(" "), out = [""]; w.forEach(x => { if ((out[out.length - 1] + " " + x).trim().length > n && out[out.length - 1]) out.push(x); else out[out.length - 1] = (out[out.length - 1] + " " + x).trim(); }); return out.slice(0, 2); };
  const edges = (spec.edges || []).map(([a, b, l]) => {
    const A = pos(a), B = pos(b); let d, lx, ly;
    if (V && N[b].r !== N[a].r){ const dn = N[b].r > N[a].r, x1 = A.x + NW / 2, y1 = dn ? A.y + NH : A.y, x2 = B.x + NW / 2, y2 = dn ? B.y - 4 : B.y + NH + 4, my = (y1 + y2) / 2; d = `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`; lx = (x1 + x2) / 2 + 6; ly = my; }
    else if (V){ const rt = N[b].c > N[a].c, x1 = rt ? A.x + NW : A.x, x2 = rt ? B.x - 4 : B.x + NW + 4, y = A.y + NH / 2; d = `M${x1},${y} L${x2},${y}`; lx = (x1 + x2) / 2; ly = y - 6; }
    else if (N[b].c > N[a].c){ const x1 = A.x + NW, y1 = A.y + NH / 2, x2 = B.x, y2 = B.y + NH / 2, mx = (x1 + x2) / 2; d = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2 - 4},${y2}`; lx = mx; ly = (y1 + y2) / 2 - 6; }
    else if (N[b].c < N[a].c){ const x1 = A.x, y1 = A.y + NH / 2, x2 = B.x + NW, y2 = B.y + NH / 2, mx = (x1 + x2) / 2; d = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2 + 4},${y2}`; lx = mx; ly = (y1 + y2) / 2 - 6; }
    else { const dn = N[b].r > N[a].r, x = A.x + NW / 2, y1 = dn ? A.y + NH : A.y, y2 = dn ? B.y - 4 : B.y + NH + 4; d = `M${x},${y1} L${x},${y2}`; lx = x + 6; ly = (y1 + y2) / 2; }
    return `<path d="${d}" class="sd-e" marker-end="url(#sdArrow)"/>${l ? `<text x="${lx}" y="${ly}" class="sd-el" ${V || N[b].c === N[a].c ? "" : 'text-anchor="middle"'}>${esc(l)}</text>` : ""}`;
  }).join("");
  const nodes = ids.map(id => { const p = pos(id), n = N[id], c = KC[n.k] || KC.proc, L = wrap(lab(id), 20);
    return `<g><rect x="${p.x}" y="${p.y}" width="${NW}" height="${NH}" rx="12" class="sd-n" style="--kc:${c}"/><rect x="${p.x}" y="${p.y}" width="5" height="${NH}" rx="2" fill="${c}"/>
      ${L.map((t, i) => `<text x="${p.x + 14}" y="${p.y + (n.sub ? 22 : 30) + i * 15 - (L.length > 1 ? 6 : 0)}" class="sd-nt">${esc(t)}</text>`).join("")}
      ${n.sub ? `<text x="${p.x + 14}" y="${p.y + NH - 10}" class="sd-ns">${esc(n.sub)}</text>` : ""}</g>`; }).join("");
  return `<div class="sd-arch"><svg viewBox="0 0 ${W} ${H}" style="${V ? `max-width:${W}px; margin:0 auto` : `min-width:${Math.min(W, 760)}px`}" role="img" aria-label="Architecture diagram"><defs><marker id="sdArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="sd-ah"/></marker></defs>${edges}${nodes}</svg></div>`;
}

/* ---------- pages ---------- */
const shell = (inner, back) => `<div class="q-wrap sd">${back ? `<a class="q-back" href="${back[0]}">← ${esc(back[1])}</a>` : ""}${inner}</div>`;
const sdStars = id => (P.sd || {})[id] || 0;
function hub(){
  document.title = "System design · Dagdeep";
  const R = D.rounds;
  root().innerHTML = shell(`<p class="q-eyebrow">System design</p><h1 class="sd-h1">Design it like you would in the interview, and at work.</h1>
    <p class="sd-lede">Practise the full loop: clarify the problem, estimate the scale, sketch the architecture, then defend your trade-offs. Write your own answer first or pick from options, then compare with a reference design.</p>
    <div class="sd-tiles">
      <a href="#design/guide"><span>🧭</span><b>How to approach a design</b><small>A 6-step framework and what interviewers look for</small></a>
      <a href="#design/arch"><span>🗺️</span><b>Architecture gallery</b><small>${D.arch.length} reference architectures with diagrams and trade-offs</small></a>
      <a href="#design/projects"><span>💡</span><b>Project ideas</b><small>${D.projects.length} portfolio projects to build yourself</small></a></div>
    <h2 class="q-sec-h">🏗️ Design rounds</h2>
    ${["de", "ai"].map(w => `<h3 class="sd-wh">${w === "de" ? "🗄️ Data engineering" : "🤖 AI engineering"}</h3><div class="q-wlist">${R.filter(r => r.world === w).map(r => { const s = sdStars(r.id);
      return `<a class="q-wrow" href="#sd-${r.id}" style="--h:${r.hue}"><span class="q-wrow-ic">${r.icon}</span><span class="q-wrow-t"><b>${esc(r.title)}</b><small>${esc(r.level)} · ${esc(r.time)} · ${esc(r.tags)}</small></span><span class="q-wrow-s">${s ? stars(s, "sm") : `<i>New</i>`}</span></a>`; }).join("")}</div>`).join("")}`, ["#play", "Home"]);
}
function guide(){
  document.title = "How to approach a design · Dagdeep";
  root().innerHTML = shell(`<p class="q-eyebrow">System design · framework</p><h1 class="sd-h1">How to approach a design</h1>
    <div class="sd-guide">${md(D.guide)}</div>
    <div class="q-res-b"><a class="btn big solid" href="#sd-${D.rounds[0].id}">Try a design round →</a><a class="btn big" href="#design/arch">See reference architectures</a></div>`, ["#design", "System design"]);
}
function gallery(){
  document.title = "Architecture gallery · Dagdeep";
  root().innerHTML = shell(`<p class="q-eyebrow">System design · gallery</p><h1 class="sd-h1">Reference architectures</h1>
    <p class="sd-lede">Common shapes you'll design again and again. Each one shows the flow, when to use it, and what goes wrong.</p>
    ${D.arch.map((a, i) => `<details class="sd-card" ${i ? "" : "open"} id="arch-${a.id}"><summary><span>${a.icon}</span><div><b>${esc(a.title)}</b><small>${esc(a.one)}</small></div></summary>
      ${arch(a.diagram)}<div class="sd-legend">${Object.entries({src:"Source", stream:"Stream / log", proc:"Processing", store:"Storage", serve:"Serving", ai:"AI / model", ops:"Ops / control"}).map(([k, l]) => `<span><i style="background:${KC[k]}"></i>${l}</span>`).join("")}</div>
      <div class="sd-cols"><div><h4>How it works</h4>${md(a.how)}</div><div><h4>Use it when</h4>${md(a.when)}<h4>Watch out for</h4>${md(a.watch)}</div></div>
      ${a.related ? `<p class="sd-rel">Practise it: ${a.related.map(r => `<a href="#sd-${r}">${esc((D.rounds.find(x => x.id === r) || {}).title || r)}</a>`).join(" · ")}</p>` : ""}</details>`).join("")}`, ["#design", "System design"]);
}
function projects(filter){
  document.title = "Project ideas · Dagdeep";
  const f = filter || "all", L = D.projects.filter(p => f === "all" || p.world === f || p.level === f);
  root().innerHTML = shell(`<p class="q-eyebrow">System design · build it yourself</p><h1 class="sd-h1">Project ideas for your portfolio</h1>
    <p class="sd-lede">Ideas, not code: what to build, what you'll learn, a suggested stack and how to make it stand out. Each one is small enough to finish and deep enough to talk about in interviews.</p>
    <div class="q-wfilter" role="tablist">${[["all", "All"], ["de", "🗄️ Data"], ["ai", "🤖 AI"], ["Starter", "Starter"], ["Intermediate", "Intermediate"], ["Advanced", "Advanced"]].map(([k, l]) => `<button role="tab" data-f="${k}" aria-selected="${f === k}">${l}</button>`).join("")}</div>
    <div class="sd-projects">${L.map(p => `<article class="sd-proj"><div class="sd-proj-h"><span>${p.icon}</span><div><b>${esc(p.title)}</b><small>${esc(p.level)} · ${esc(p.time)}</small></div></div>
      <p>${fm(p.idea)}</p>
      <h4>You'll learn</h4><ul>${p.learn.map(x => `<li>${fm(x)}</li>`).join("")}</ul>
      <h4>Suggested stack</h4><p class="sd-stack">${p.stack.map(x => `<span>${esc(x)}</span>`).join("")}</p>
      <h4>Make it stand out</h4><ul>${p.stretch.map(x => `<li>${fm(x)}</li>`).join("")}</ul>
      ${p.zones ? `<p class="sd-rel">Brush up: ${p.zones.map(z => `<a href="#zone-${z}">${esc((Q._.ZMAP[z] || {}).title || z)}</a>`).join(" · ")}</p>` : ""}</article>`).join("")}</div>`, ["#design", "System design"]);
  root().querySelectorAll(".q-wfilter button").forEach(b => b.onclick = () => { history.replaceState(null, "", "#design/projects" + (b.dataset.f === "all" ? "" : "/" + b.dataset.f)); projects(b.dataset.f); });
}

/* ---------- design round ---------- */
function round(id){
  const R = D.rounds.find(r => r.id === id); if (!R){ location.hash = "#design"; return; }
  document.title = `${R.title} · System design · Dagdeep`;
  const mode = (() => { try { return localStorage.getItem("dagdeep-sd-mode") || "write"; } catch(e){ return "write"; } })();
  root().innerHTML = shell(`<div class="sd-intro" style="--h:${R.hue}"><div class="q-wk-ic">${R.icon}</div><p class="q-eyebrow">Design round · ${esc(R.level)} · ${esc(R.time)}</p><h1 class="sd-h1">${esc(R.title)}</h1>
    <div class="sd-prompt"><b>🎤 Interviewer:</b> ${md(R.prompt)}</div>
    <h3>How this round works</h3><ol class="q-wk-how"><li><b>Clarify</b> the requirements, <b>estimate</b> the scale, <b>build</b> the architecture, then go <b>deep</b> on trade-offs.</li><li>At every step you can <b>write your own answer first</b>, then compare it with the options and a model answer.</li><li>You get a score, a reference architecture and follow-up questions to practise.</li></ol>
    <h3>Answer style</h3><div class="sd-mode" role="radiogroup"><button data-m="write" role="radio" aria-checked="${mode === "write"}">✍️ Write first, then compare<small>Best practice for interviews</small></button><button data-m="pick" role="radio" aria-checked="${mode === "pick"}">☑️ Pick from options<small>Faster</small></button></div>
    ${R.study && R.study.length ? `<details class="q-pg-study"><summary>📚 Brush up first <small>(${R.study.length} course pages)</small></summary><div class="sd-studybox"></div></details>` : ""}
    <button class="btn big solid sd-go">Start the round</button></div>`, ["#design", "System design"]);
  let m = mode;
  root().querySelectorAll(".sd-mode button").forEach(b => b.onclick = () => { m = b.dataset.m; try { localStorage.setItem("dagdeep-sd-mode", m); } catch(e){} root().querySelectorAll(".sd-mode button").forEach(z => z.setAttribute("aria-checked", z === b)); });
  const sb = root().querySelector(".sd-studybox"); if (sb) needZones(refZones(R.study), () => { sb.innerHTML = refList(R.study, "links"); });
  root().querySelector(".sd-go").onclick = () => play(R, m);
}
function play(R, mode){
  const st = {i:0, pts:0, max:0, fill:{}, notes:[]};
  root().innerHTML = shell(`<header class="q-wkh sd-bar" style="--h:${R.hue}"><a class="q-x" href="#design" aria-label="Leave">✕</a><span class="q-wtag">🏗️ Design</span><b>${esc(R.title)}</b><span class="q-wkp"></span></header>
    <div class="sd-steps"></div><div class="sd-now"></div>`);
  const now = root().querySelector(".sd-now"), done = root().querySelector(".sd-steps");
  const prog = () => root().querySelector(".q-wkp").textContent = `Step ${Math.min(st.i + 1, R.steps.length)}/${R.steps.length}`;
  const LABEL = {clarify:"1 · Clarify", estimate:"2 · Estimate", build:"3 · Architecture", choose:"Deep dive", write:"Deep dive"};
  const writeBox = (S, ph) => `<div class="sd-write"><label><b>✍️ Your answer</b><small>Write it as you'd say it in the interview. Bullet points are fine.</small><textarea rows="5" placeholder="${esc(ph || "Type your answer…")}"></textarea></label><button class="btn sd-reveal">Compare with the options →</button></div>`;
  const next = () => { st.i++; if (st.i < R.steps.length) step(); else finish(); };
  const archive = (S, html) => { done.insertAdjacentHTML("beforeend", `<details class="sd-done"><summary><span>${LABEL[S.kind] || "Step"}</span>${fm(S.q)}</summary><div>${html}</div></details>`); };
  function step(){
    prog(); const S = R.steps[st.i], wantWrite = mode === "write" && S.kind !== "estimate";
    const head = `<p class="sd-k">${LABEL[S.kind] || "Step"}</p><h2 class="sd-q">${fm(S.q)}</h2>${S.ctx ? `<div class="sd-ctx">${md(S.ctx)}</div>` : ""}`;
    now.innerHTML = `<section class="sd-step">${head}<div class="sd-body"></div></section>`;
    const body = now.querySelector(".sd-body"); let typed = "";
    const showMain = () => {
      const yours = typed.trim() ? `<div class="sd-yours"><small>Your answer</small><p>${esc(typed).replace(/\n/g, "<br>")}</p></div>` : "";
      if (S.kind === "clarify"){
        const o = shuffle(S.o.map((x, i) => i));
        body.innerHTML = yours + `<p class="sd-hint">Pick the ${S.o.filter(x => x[1]).length} questions that matter most. Every good question you pick earns points; weak ones cost.</p><div class="sd-multi">${o.map(i => `<button data-i="${i}" aria-pressed="false">${fm(S.o[i][0])}</button>`).join("")}</div><button class="btn big solid sd-check">Check</button>`;
        body.querySelectorAll(".sd-multi button").forEach(b => b.onclick = () => b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") !== "true"));
        body.querySelector(".sd-check").onclick = () => {
          const sel = [...body.querySelectorAll(".sd-multi button")].filter(b => b.getAttribute("aria-pressed") === "true").map(b => +b.dataset.i);
          if (!sel.length){ toast("Pick at least one question"); return; }
          const good = S.o.filter(x => x[1]).length, hit = sel.filter(i => S.o[i][1]).length, bad = sel.length - hit, got = Math.max(0, hit - bad);
          st.pts += got; st.max += good;
          const fb = S.o.map((x, i) => `<li class="${x[1] ? "ok" : "no"} ${sel.includes(i) ? "sel" : ""}">${x[1] ? "✅" : "⚪"} <b>${fm(x[0])}</b>${sel.includes(i) ? " <em>(you picked)</em>" : ""}<div>${fm(x[2])}</div></li>`).join("");
          body.innerHTML = yours + `<p class="sd-score">You picked <b>${hit}</b> of ${good} key questions${bad ? ` and <b>${bad}</b> weak one${bad > 1 ? "s" : ""}` : ""}.</p><ul class="sd-fb">${fb}</ul>${S.answer ? `<div class="sd-model"><b>✅ What the interviewer tells you</b>${md(S.answer)}</div>` : ""}<button class="btn big solid sd-next">Continue →</button>`;
          body.querySelector(".sd-next").onclick = () => { archive(S, `<ul class="sd-fb">${fb}</ul>${S.answer ? md(S.answer) : ""}`); next(); };
        };
      } else if (S.kind === "estimate"){
        body.innerHTML = `<div class="sd-ctx">${md(S.given)}</div>${S.ask.map((a, k) => `<label class="sd-num"><span>${fm(a.label)}</span><span class="sd-numin"><input type="number" inputmode="decimal" data-k="${k}" aria-label="${esc(a.label)}"><em>${esc(a.unit)}</em></span></label>`).join("")}<button class="btn big solid sd-check">Check my maths</button>`;
        body.querySelector(".sd-check").onclick = () => {
          const ins = [...body.querySelectorAll(".sd-num input")]; if (ins.some(x => x.value === "")){ toast("Fill in every estimate"); return; }
          let got = 0; const res = S.ask.map((a, k) => { const v = +ins[k].value, ok = Math.abs(v - a.a) <= Math.abs(a.a) * (a.tol || 0.3); if (ok) got++; return `<li class="${ok ? "ok" : "no"}">${ok ? "✅" : "❌"} <b>${fm(a.label)}</b>: you said ${esc(String(v))} ${esc(a.unit)}, about <b>${esc(a.a.toLocaleString())} ${esc(a.unit)}</b><div>${md(a.how)}</div></li>`; }).join("");
          st.pts += got; st.max += S.ask.length;
          body.innerHTML = `<ul class="sd-fb">${res}</ul>${S.so ? `<div class="sd-model"><b>📐 So what?</b>${md(S.so)}</div>` : ""}<button class="btn big solid sd-next">Continue →</button>`;
          body.querySelector(".sd-next").onclick = () => { archive(S, `<ul class="sd-fb">${res}</ul>`); next(); };
        };
      } else if (S.kind === "build"){
        body.innerHTML = yours + `<p class="sd-hint">Choose a component for each box. The diagram updates as you go.</p><div class="sd-slots">${S.slots.map(sl => `<div class="sd-slot"><b>${esc(sl.label)}</b><div>${shuffle(sl.o.map((x, i) => i)).map(i => `<button data-s="${sl.id}" data-i="${i}" aria-pressed="false">${esc(sl.o[i][0])}</button>`).join("")}</div></div>`).join("")}</div><div class="sd-live"></div><button class="btn big solid sd-check">Check my design</button>`;
        const pick = {}; const live = () => { body.querySelector(".sd-live").innerHTML = arch(S.diagram, Object.fromEntries(S.slots.map(sl => [sl.id, pick[sl.id] != null ? sl.o[pick[sl.id]][0] : "?"]))); };
        body.querySelectorAll(".sd-slot button").forEach(b => b.onclick = () => { pick[b.dataset.s] = +b.dataset.i; b.parentElement.querySelectorAll("button").forEach(z => z.setAttribute("aria-pressed", z === b)); live(); });
        live();
        body.querySelector(".sd-check").onclick = () => {
          if (S.slots.some(sl => pick[sl.id] == null)){ toast("Fill every box first"); return; }
          let got = 0; const res = S.slots.map(sl => { const c = sl.o[pick[sl.id]], ok = c[1] === 1, best = sl.o.find(x => x[1] === 1); if (ok) got++; else if (c[1] === 0.5) got += 0.5; st.fill[sl.id] = best[0];
            return `<li class="${ok ? "ok" : c[1] === 0.5 ? "meh" : "no"}">${ok ? "✅" : c[1] === 0.5 ? "🟡" : "❌"} <b>${esc(sl.label)}: ${esc(c[0])}</b><div>${fm(c[2])}${ok ? "" : ` <b>Better:</b> ${esc(best[0])}: ${fm(best[2])}`}</div></li>`; }).join("");
          st.pts += got; st.max += S.slots.length;
          body.innerHTML = yours + `<ul class="sd-fb">${res}</ul><div class="sd-model"><b>🗺️ Reference design</b>${arch(S.diagram, st.fill)}${S.answer ? md(S.answer) : ""}</div><button class="btn big solid sd-next">Continue →</button>`;
          body.querySelector(".sd-next").onclick = () => { archive(S, arch(S.diagram, st.fill) + `<ul class="sd-fb">${res}</ul>`); next(); };
        };
      } else if (S.kind === "choose"){
        const o = shuffle(S.o.map((x, i) => i)); let tries = 0;
        body.innerHTML = yours + `<div class="sd-opts">${o.map(i => `<button data-i="${i}">${fm(S.o[i][0])}</button>`).join("")}</div><div class="sd-ofb"></div>`;
        body.querySelectorAll(".sd-opts button").forEach(b => b.onclick = () => {
          const x = S.o[+b.dataset.i]; tries++;
          if (x[1] === 1){ const got = tries === 1 ? 2 : tries === 2 ? 1 : 0; st.pts += got; st.max += 2; body.querySelectorAll(".sd-opts button").forEach(z => z.disabled = true); b.classList.add("yes");
            body.querySelector(".sd-ofb").innerHTML = `<p class="sd-score">✅ ${fm(x[2])}</p>${S.answer ? `<div class="sd-model"><b>🎯 Strong answer</b>${md(S.answer)}</div>` : ""}<button class="btn big solid sd-next">Continue →</button>`;
            body.querySelector(".sd-next").onclick = () => { archive(S, `<p><b>${fm(x[0])}</b></p>${S.answer ? md(S.answer) : ""}`); next(); }; }
          else { b.disabled = true; b.classList.add("no"); body.querySelector(".sd-ofb").innerHTML = `<p class="sd-score">❌ ${fm(x[2])}</p>`; }
        });
      } else if (S.kind === "write"){
        // auto-tick the points the answer mentions; the player can adjust before scoring
        const t = typed.toLowerCase();
        body.innerHTML = yours + `<div class="sd-model"><b>🎯 Model answer</b>${md(S.model)}</div><p class="sd-hint">Tick the points your answer covered${typed.trim() ? " (we pre-ticked the ones we spotted)" : ""}. Be honest: it's for you.</p>
          <div class="sd-points">${S.points.map(([p, kw], k) => `<label><input type="checkbox" data-k="${k}" ${typed.trim() && kw.some(w => t.includes(w)) ? "checked" : ""}><span>${fm(p)}</span></label>`).join("")}</div><button class="btn big solid sd-check">Score it</button>`;
        body.querySelector(".sd-check").onclick = () => { const got = body.querySelectorAll(".sd-points input:checked").length; st.pts += got; st.max += S.points.length;
          archive(S, (typed.trim() ? `<div class="sd-yours"><small>Your answer</small><p>${esc(typed).replace(/\n/g, "<br>")}</p></div>` : "") + md(S.model)); next(); };
      }
    };
    if (wantWrite){
      body.innerHTML = writeBox(S, S.ph);
      const ta = body.querySelector("textarea"); setTimeout(() => { if (matchMedia("(hover: hover)").matches) ta.focus(); }, 50);
      body.querySelector(".sd-reveal").onclick = () => { typed = ta.value; if (!typed.trim() && S.kind === "write"){ toast("Write something first, even a few bullets"); return; } showMain(); };
      if (S.kind === "write") body.querySelector(".sd-reveal").textContent = "Compare with the model answer →";
    } else if (S.kind === "write"){
      body.innerHTML = writeBox(S, S.ph); const ta = body.querySelector("textarea");
      body.querySelector(".sd-reveal").textContent = "Compare with the model answer →";
      body.querySelector(".sd-reveal").onclick = () => { typed = ta.value; showMain(); };
    } else showMain();
    now.scrollIntoView({block:"start", behavior:reduce() ? "auto" : "smooth"});
  }
  function finish(){
    const pct = st.max ? Math.round(st.pts / st.max * 100) : 0, s = pct >= 80 ? 3 : pct >= 60 ? 2 : 1;
    const verdict = pct >= 85 ? ["🤝 Strong hire", "You drove the design, sized it and defended trade-offs."] : pct >= 70 ? ["👍 Hire", "Solid design. Tighten the weaker steps below."] : pct >= 55 ? ["🤔 Lean no hire", "The bones are there; practise the steps you missed."] : ["🙅 No hire (yet)", "Review the reference design and try again."];
    P.sd = P.sd || {}; const prev = P.sd[R.id] || 0; if (s > prev) P.sd[R.id] = s; save(); addXP(60 + Math.max(0, s - prev) * 30); if (s === 3) confetti();
    const nx = D.rounds[(D.rounds.indexOf(R) + 1) % D.rounds.length];
    now.innerHTML = `<section class="q-res won"><p class="q-eyebrow">Design round complete</p><h2>${verdict[0]}</h2>${stars(s, "big")}<p>${verdict[1]}</p><div class="q-res-stats"><span><small>Score</small><b>${pct}%</b></span><span><small>Points</small><b>${Math.round(st.pts * 10) / 10}/${st.max}</b></span></div></section>
      <section class="q-wsec"><h3>🗺️ Reference architecture</h3>${arch(R.reference.diagram)}${md(R.reference.md)}</section>
      ${R.deep ? `<section class="q-wsec"><h3>🔬 Deep dive</h3>${R.deep.map((d, i) => `<details class="q-deepd" ${i ? "" : "open"}><summary>${fm(d.t)}</summary><div>${md(d.md)}</div></details>`).join("")}</section>` : ""}
      <section class="q-wsec"><h3>🎤 Follow-ups to practise out loud</h3><ol>${R.followups.map(f => `<li>${fm(f)}</li>`).join("")}</ol></section>
      ${R.study && R.study.length ? `<section class="q-wsec sd-studyend"><h3>📚 Go deeper in the course</h3><div class="sd-studybox2"></div></section>` : ""}
      <div class="q-res-b"><a class="btn big solid" href="#sd-${nx.id}">Next: ${esc(nx.title)} →</a><a class="btn big" href="#sd-${R.id}">Replay</a><a class="btn big" href="#design">All design rounds</a></div>`;
    const sb2 = now.querySelector(".sd-studybox2"); if (sb2) needZones(refZones(R.study), () => { sb2.innerHTML = refList(R.study, "links"); });
    root().querySelector(".q-wkp").textContent = "Done";
    window.scrollTo(0, 0);
  }
  step();
}

Q.design = {route:h => {
  let m;
  if (h === "design") hub();
  else if (h === "design/guide") guide();
  else if (h === "design/arch") gallery();
  else if ((m = h.match(/^design\/projects(?:\/(\w+))?$/))) projects(m[1]);
  else if ((m = h.match(/^sd-([a-z0-9-]+)$/))) round(m[1]);
  else hub();
}, arch};
})();
