// GameKit: a small arcade framework shared by every course game.
// Usage: GameKit.start(el, cfg, onResult)
//   cfg.title, cfg.howTo (array of strings), cfg.lives (default 3), cfg.timeLimit (seconds, optional),
//   cfg.par (seconds for the 3-star time bonus, optional), cfg.learned (array), cfg.best (stars so far),
//   cfg.setup(stage, api) builds the level. api: hit(points,label), miss(label), finish(), elapsed(), onEnd(fn),
//   say(text), over (bool), lives(), score().
(function(){
const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.3C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.4.7-1.2 2.2-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.2C19.5 16.4 12 21 12 21z" fill="currentColor"/></svg>';
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z" fill="currentColor"/></svg>';
const starRow = (n, cls = "") => `<span class="gk-stars ${cls}">${[0,1,2].map(i => `<span class="${i < n ? "on" : ""}" style="--i:${i}">${STAR}</span>`).join("")}</span>`;
const reduce = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function start(el, cfg, onResult){
  const LIVES = cfg.lives || 3;
  const intro = () => {
    el.innerHTML = `<div class="gk gk-intro">
      <div class="gk-badge">LEVEL</div><h3>${cfg.title}</h3>
      ${cfg.best != null ? `<p class="gk-best">Best: ${starRow(cfg.best, "sm")}</p>` : ""}
      <ul class="gk-how">${(cfg.howTo || []).map(h => `<li>${h}</li>`).join("")}</ul>
      <div class="gk-rules"><span>${HEART} ${LIVES} lives</span>${cfg.timeLimit ? `<span>⏱ ${cfg.timeLimit} s</span>` : ""}${cfg.par ? `<span>${STAR} 3 stars: no lives lost${cfg.par ? `, under ${cfg.par} s` : ""}</span>` : `<span>${STAR} stars = lives left</span>`}</div>
      <button class="btn big solid gk-go">Play</button></div>`;
    el.querySelector(".gk-go").onclick = countdown;
  };
  const countdown = () => {
    if (reduce()){ play(); return; }
    let n = 3;
    el.innerHTML = `<div class="gk gk-count"><span>3</span></div>`;
    const t = setInterval(() => { n--; if (n === 0){ clearInterval(t); play(); } else el.querySelector(".gk-count span").outerHTML = `<span>${n}</span>`; }, 650);
  };
  const play = () => {
    let lives = LIVES, score = 0, combo = 0, over = false, t0 = performance.now(), raf = 0;
    const enders = [];
    el.innerHTML = `<div class="gk gk-play">
      <div class="gk-hud"><span class="gk-lives">${Array.from({length:LIVES}, (_, i) => `<span class="gk-h" data-i="${i}">${HEART}</span>`).join("")}</span>
        <span class="gk-combo" hidden></span><span class="gk-score"><b>0</b> pts</span><span class="gk-time"></span></div>
      ${cfg.timeLimit ? `<div class="gk-tbar"><span></span></div>` : ""}
      <div class="gk-stage"></div><div class="gk-fx" aria-live="polite"></div></div>`;
    const stage = el.querySelector(".gk-stage"), fx = el.querySelector(".gk-fx"), root = el.querySelector(".gk-play");
    const pop = (text, cls) => { const p = document.createElement("span"); p.className = "gk-pop " + cls; p.textContent = text; fx.appendChild(p); setTimeout(() => p.remove(), 900); };
    const elapsed = () => (performance.now() - t0) / 1000;
    const hud = () => {
      el.querySelector(".gk-score b").textContent = score.toLocaleString();
      el.querySelectorAll(".gk-h").forEach((h, i) => h.classList.toggle("lost", i >= lives));
      const c = el.querySelector(".gk-combo"); c.hidden = combo < 2; c.textContent = `combo ×${mult().toFixed(1).replace(".0", "")}`;
    };
    const mult = () => Math.min(3, 1 + Math.floor(combo / 3) * 0.5);
    const tick = () => {
      if (over) return;
      const e = elapsed();
      el.querySelector(".gk-time").textContent = cfg.timeLimit ? `${Math.max(0, Math.ceil(cfg.timeLimit - e))} s` : `${e.toFixed(0)} s`;
      if (cfg.timeLimit){ el.querySelector(".gk-tbar span").style.width = Math.max(0, 100 - e / cfg.timeLimit * 100) + "%"; if (e >= cfg.timeLimit){ end(api.timeUpWins ? true : false, "Time's up"); return; } }
      raf = requestAnimationFrame(tick);
    };
    const end = (won, why) => {
      if (over) return; over = true; cancelAnimationFrame(raf); enders.forEach(f => { try { f(); } catch(e) {} });
      const secs = elapsed();
      let stars = 0;
      if (won){ stars = cfg.stars ? cfg.stars({lives, score, secs, max:LIVES}) : Math.max(1, Math.min(3, lives - (LIVES - 3))); if (!cfg.stars && cfg.par && secs > cfg.par) stars = Math.max(1, stars - 1); }
      if (won) score += lives * 150;
      setTimeout(() => results(won, stars, score, secs, why), won ? 350 : 700);
    };
    const api = {
      hit(points = 100, label){ if (over) return; combo++; const p = Math.round(points * mult()); score += p; pop(`+${p}${label ? " " + label : ""}`, "good"); root.classList.remove("gk-ok"); void root.offsetWidth; root.classList.add("gk-ok"); hud(); },
      miss(label){ if (over) return; combo = 0; lives--; pop(label || "Miss", "bad"); root.classList.remove("gk-bad"); void root.offsetWidth; root.classList.add("gk-bad"); hud(); if (lives <= 0) end(false, "Out of lives"); },
      finish(){ end(true); },
      fail(why){ end(false, why); },
      say(text){ pop(text, "info"); },
      elapsed, onEnd(f){ enders.push(f); },
      get over(){ return over; }, lives: () => lives, score: () => score, timeUpWins:false
    };
    hud(); raf = requestAnimationFrame(tick);
    cfg.setup(stage, api);
  };
  const results = (won, stars, score, secs, why) => {
    el.innerHTML = `<div class="gk gk-result ${won ? "won" : "lost"}">
      <p class="gk-badge">${won ? "LEVEL CLEAR" : "GAME OVER"}</p>
      ${won ? starRow(stars, "big") : `<p class="gk-why">${why || "Out of lives"}</p>`}
      <div class="gk-stats"><span><small>Score</small><b>${score.toLocaleString()}</b></span><span><small>Time</small><b>${secs.toFixed(0)} s</b></span></div>
      ${cfg.learned ? `<div class="gk-learned"><p>What you practised</p><ul>${cfg.learned.map(l => `<li>${l}</li>`).join("")}</ul></div>` : ""}
      <div class="gk-btns"><button class="btn big ${won && stars === 3 ? "" : "solid"} gk-again">${won ? (stars < 3 ? "Replay for 3 stars" : "Play again") : "Try again"}</button></div></div>`;
    el.querySelector(".gk-again").onclick = () => { cfg.best = Math.max(cfg.best || 0, stars); countdown(); };
    if (onResult) onResult(won ? stars : 0, score);
  };
  intro();
}
window.GameKit = {start, starRow, STAR, HEART};
})();
