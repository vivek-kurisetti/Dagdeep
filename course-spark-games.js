// Spark course games, built on GameKit. Each entry returns a level config: {howTo, lives, learned, setup(stage, api)}.
(function(){
const G = window.COURSE_GAMES = window.COURSE_GAMES || {};
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const median = a => { const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const fmt = (n, d = 0) => Number(n).toFixed(d).replace(/\.0+$/, "");

// A countdown bar for one turn. Calls onTimeout when it runs out. Returns {stop, restart}.
function turnTimer(host, secs, api, onTimeout){
  host.innerHTML = `<div class="gm-turn"><span></span></div>`;
  const bar = host.querySelector("span");
  let t0 = performance.now(), dur = secs, id = 0, live = true;
  const step = () => {
    if (!live || api.over) return;
    const left = 1 - (performance.now() - t0) / (dur * 1000);
    bar.style.width = Math.max(0, left * 100) + "%";
    bar.classList.toggle("hot", left < 0.3);
    if (left <= 0){ live = false; onTimeout(); return; }
    id = requestAnimationFrame(step);
  };
  id = requestAnimationFrame(step);
  api.onEnd(() => { live = false; cancelAnimationFrame(id); });
  return {
    stop(){ live = false; cancelAnimationFrame(id); },
    restart(s){ cancelAnimationFrame(id); dur = s || dur; t0 = performance.now(); live = true; id = requestAnimationFrame(step); }
  };
}
function keys(api, map){
  const h = e => { if (api.over) return; const f = map[e.key]; if (f && !e.metaKey && !e.ctrlKey){ e.preventDefault(); f(); } };
  document.addEventListener("keydown", h);
  api.onEnd(() => document.removeEventListener("keydown", h));
}
const later = (api, fn, ms) => { const t = setTimeout(() => { if (!api.over) fn(); }, ms); api.onEnd(() => clearTimeout(t)); };

/* ---------------- 1. Plan or Run? ---------------- */
G.planOrRun = () => ({
  lives:3,
  howTo:["A line of PySpark appears. Does it only build the <b>plan</b>, or does it <b>run</b> a job?","Answer before the bar runs out. It gets faster as you go.","Keys: ← Plan, → Run. Streaks build a combo multiplier."],
  learned:["Transformations are lazy; actions trigger jobs","cache() is lazy, checkpoint() is eager","inferSchema scans data; explain() and schema don't"],
  setup(stage, api){
    const CARDS = shuffle([
      ["df.filter(\"status = 'SUCCESS'\")", 0, "filter is a transformation."],
      ["df.groupBy(\"merchant_id\").agg(F.sum(\"amount\"))", 0, "Aggregations are transformations until an action."],
      ["df.count()", 1, "count is an action."],
      ["df.cache()", 0, "cache() only marks the DataFrame; the next action fills it."],
      ["df.checkpoint()", 1, "checkpoint() is eager by default and runs a job."],
      ["spark.read.option(\"inferSchema\", True).csv(path)", 1, "inferSchema scans the data to guess types."],
      ["df.explain(\"formatted\")", 0, "explain only prints the plan."],
      ["df.columns", 0, "Columns are known from the plan."],
      ["df.rdd.getNumPartitions()", 0, "Plans the RDD but runs no job."],
      ["df.toPandas()", 1, "toPandas collects everything to the driver: an action."],
      ["df.foreach(send_alert)", 1, "foreach is an action."],
      ["df.show(5)", 1, "show runs a (limited) job."],
      ["df.write.mode(\"overwrite\").parquet(out)", 1, "Writing is an action."],
      ["df.join(mer, \"merchant_id\")", 0, "join is a transformation."],
      ["df.withColumn(\"day\", F.to_date(\"created_at\"))", 0, "withColumn is a transformation."],
      ["df.repartition(400, \"dt\")", 0, "repartition is a lazy transformation (it shuffles later, when run)."],
      ["df.take(10)", 1, "take is an action."],
      ["df.orderBy(F.desc(\"amount\"))", 0, "orderBy is a transformation."]
    ]).slice(0, 15);
    let i = 0, busy = false;
    stage.innerHTML = `<div class="gm-por">
      <p class="gm-prog"></p>
      <div class="gm-card"><code></code></div>
      <div class="gm-timer"></div>
      <p class="gm-why" aria-live="polite">&nbsp;</p>
      <div class="gm-2btn"><button class="btn big gm-plan">← Plan <small>transformation</small></button><button class="btn big solid gm-run">Run → <small>job</small></button></div></div>`;
    const card = stage.querySelector(".gm-card"), why = stage.querySelector(".gm-why"), prog = stage.querySelector(".gm-prog");
    const timer = turnTimer(stage.querySelector(".gm-timer"), 7, api, () => answer(-1));
    const show = () => {
      if (i >= CARDS.length){ api.finish(); return; }
      busy = false; card.className = "gm-card in"; card.dataset.a = CARDS[i][1]; card.querySelector("code").textContent = CARDS[i][0];
      prog.textContent = `Card ${i + 1} of ${CARDS.length}`;
      timer.restart(Math.max(3.5, 7 - i * 0.25));
    };
    const answer = v => {
      if (busy || api.over) return; busy = true; timer.stop();
      const [, isRun, w] = CARDS[i];
      if (v === isRun){ api.hit(100); card.className = "gm-card ok"; why.textContent = "✓ " + w; }
      else { api.miss(v < 0 ? "Too slow" : "Wrong"); card.className = "gm-card no"; why.textContent = (v < 0 ? "⏱ " : "✗ ") + w; }
      i++; later(api, show, 900);
    };
    stage.querySelector(".gm-plan").onclick = () => answer(0);
    stage.querySelector(".gm-run").onclick = () => answer(1);
    keys(api, {ArrowLeft:() => answer(0), ArrowRight:() => answer(1), p:() => answer(0), r:() => answer(1)});
    show();
  }
});

/* ---------------- 2. Partition Packer ---------------- */
G.packer = () => ({
  lives:3,
  howTo:["Tap an item, then tap a bin to place it. Tap a placed item to take it back.","Bins have a capacity. Overfilling one costs a life.","Fit everything into the bins you're given to clear each round."],
  learned:["Small files are packed into ~128 MB partitions, each counted as at least 4 MB","Large splittable files are cut into 128 MB splits","Stage time is set by the busiest core: balance the work"],
  setup(stage, api){
    const ROUNDS = [
      {title:"Round 1 · Pack small files into 4 partitions", note:"maxPartitionBytes = 128 MB. Each file counts as at least openCostInBytes (4 MB).", cap:128, unit:"MB", bins:4, binName:"Partition",
       items:[["p-0001",90],["p-0002",38],["p-0003",64],["p-0004",64],["p-0005",70],["p-0006",30],["p-0007",28],["p-0008",60],["p-0009",40],["p-0010",8],["tiny-a",1],["tiny-b",3]]},
      {title:"Round 2 · A big file arrives", note:"Parquet is splittable: tap it to cut it into 128 MB splits. The .gz file is not splittable.", cap:128, unit:"MB", bins:4, binName:"Partition",
       items:[["big.parquet",300,"split"],["events.json.gz",100],["p-0011",40],["p-0012",30]]},
      {title:"Round 3 · Schedule tasks on 4 cores", note:"The stage ends when the busiest core finishes. Keep every core under 32 s.", cap:32, unit:"s", bins:4, binName:"Core",
       items:[["t1",20],["t2",18],["t3",15],["t4",15],["t5",12],["t6",10],["t7",9],["t8",8],["t9",7],["t10",6]]}
    ];
    let r = 0, items = [], sel = null;
    const eff = it => Math.max(it.size, ROUNDS[r].unit === "MB" ? 4 : 0);
    const load = idx => {
      r = idx; sel = null;
      items = ROUNDS[r].items.map(([n, s, f], k) => ({id:k + "", name:n, size:s, split:f === "split", bin:-1}));
      draw();
    };
    const used = b => items.filter(it => it.bin === b).reduce((a, it) => a + eff(it), 0);
    const draw = () => {
      const R = ROUNDS[r];
      stage.innerHTML = `<div class="gm-pack">
        <p class="gm-prog">${esc(R.title)}</p><p class="gm-note">${esc(R.note)}</p>
        <div class="gm-tray">${items.filter(it => it.bin < 0).map(it => `<button class="gm-item ${sel === it.id ? "sel" : ""} ${it.split ? "big" : ""}" data-it="${it.id}" style="--w:${Math.min(100, eff(it) / R.cap * 100)}">${esc(it.name)}<b>${it.size} ${R.unit}${eff(it) > it.size ? " → 4" : ""}</b></button>`).join("") || `<span class="muted">All placed</span>`}</div>
        <div class="gm-bins">${Array.from({length:R.bins}, (_, b) => { const u = used(b); return `<div class="gm-bin" data-bin="${b}">
          <div class="gm-bin-h"><span>${R.binName} ${b + 1}</span><b>${fmt(u)}/${R.cap} ${R.unit}</b></div>
          <div class="gm-fill"><span style="width:${Math.min(100, u / R.cap * 100)}%"></span></div>
          <div class="gm-in">${items.filter(it => it.bin === b).map(it => `<button class="gm-chip" data-back="${it.id}">${esc(it.name)} · ${it.size}</button>`).join("")}</div></div>`; }).join("")}</div></div>`;
    };
    stage.addEventListener("click", e => {
      if (api.over) return;
      const it = e.target.closest("[data-it]"), bk = e.target.closest("[data-back]"), bin = e.target.closest("[data-bin]");
      if (bk && sel == null){ items.find(x => x.id === bk.dataset.back).bin = -1; sel = null; draw(); return; }
      if (it){
        const x = items.find(y => y.id === it.dataset.it);
        if (x.split){
          const R = ROUNDS[r], parts = []; let left = x.size;
          while (left > 0){ parts.push(Math.min(R.cap, left)); left -= R.cap; }
          items = items.filter(y => y !== x).concat(parts.map((p, k) => ({id:x.id + "s" + k, name:`${x.name} split ${k + 1}`, size:p, bin:-1})));
          api.hit(50, "split"); sel = null; draw(); return;
        }
        sel = sel === x.id ? null : x.id; draw(); return;
      }
      if (bin && sel != null){
        const b = +bin.dataset.bin, x = items.find(y => y.id === sel), R = ROUNDS[r];
        if (x.size > R.cap){ api.miss("Too big for any partition"); return; }
        if (used(b) + eff(x) > R.cap){ api.miss(`Overflow: ${fmt(used(b) + eff(x))} ${R.unit}`); bin.classList.add("shake"); return; }
        x.bin = b; sel = null; api.hit(40); draw();
        if (items.every(y => y.bin >= 0)){
          api.hit(200, "round clear");
          if (r + 1 < ROUNDS.length) later(api, () => load(r + 1), 700); else later(api, () => api.finish(), 500);
        }
      }
    });
    load(0);
  }
});

/* ---------------- 3. Shuffle Hunter ---------------- */
G.shuffleHunter = () => ({
  lives:3,
  howTo:["Operations ride the conveyor from right to left.","Tap every <b>wide</b> one (it shuffles) before it leaves.","Tapping a narrow one, or letting a shuffle escape, costs a life."],
  learned:["Wide ops (groupBy, join of big tables, distinct, orderBy, repartition, windows) shuffle","Narrow ops (filter, select, union, coalesce, sortWithinPartitions) don't","A broadcast join doesn't shuffle the big side"],
  setup(stage, api){
    const WIDE = ["groupBy(\"merchant_id\").agg(...)","big.join(big2, \"id\")","distinct()","orderBy(\"amount\")","repartition(400)","Window.partitionBy(\"merchant_id\")","dropDuplicates([\"payment_id\"])","repartition(\"dt\")","intersect(other)","groupBy(\"dt\").count()"];
    const NARROW = ["filter(\"amount > 0\")","select(\"id\", \"amount\")","withColumn(\"day\", ...)","union(other)","coalesce(10)","join(broadcast(mer), \"merchant_id\")","sortWithinPartitions(\"ts\")","explode(\"items\")","sample(0.01)","drop(\"raw\")"];
    const queue = shuffle(WIDE.map(t => [t, 1]).concat(NARROW.map(t => [t, 0])));
    stage.innerHTML = `<div class="gm-hunt"><p class="gm-prog">Wave 1</p><div class="gm-belt"><span class="gm-exit">exit</span></div><p class="gm-why" aria-live="polite">Tap the shuffles!</p></div>`;
    const belt = stage.querySelector(".gm-belt"), why = stage.querySelector(".gm-why"), prog = stage.querySelector(".gm-prog");
    const live = new Set(); let spawned = 0, last = 0, raf = 0;
    const spawn = now => {
      const [text, wide] = queue[spawned++];
      const n = spawned, travel = Math.max(4.2, 7.5 - n * 0.18);
      const b = document.createElement("button");
      b.className = "gm-op"; b.textContent = text; b.style.left = "100%"; b.style.top = (8 + (spawned % 3) * 30) + "%";
      belt.appendChild(b);
      const o = {b, wide, t0:now, travel, done:false};
      live.add(o);
      b.onclick = () => {
        if (o.done || api.over) return; o.done = true;
        if (wide){ api.hit(100, "shuffle"); b.classList.add("caught"); why.textContent = `✓ ${text} shuffles`; }
        else { api.miss("Narrow!"); b.classList.add("wrong"); why.textContent = `✗ ${text} is narrow: no shuffle`; }
        setTimeout(() => b.remove(), 400); live.delete(o);
      };
      prog.textContent = `Wave ${Math.min(3, 1 + Math.floor((n - 1) / 7))} · ${n}/${queue.length}`;
    };
    const loop = now => {
      if (api.over) return;
      const gap = Math.max(1100, 1900 - spawned * 45);
      if (spawned < queue.length && now - last > gap){ spawn(now); last = now; }
      live.forEach(o => {
        const p = (now - o.t0) / (o.travel * 1000);
        o.b.style.left = (100 - p * 112) + "%";
        if (p >= 1 && !o.done){
          o.done = true; live.delete(o); o.b.remove();
          if (o.wide){ api.miss("Shuffle escaped"); why.textContent = `✗ ${o.b.textContent} shuffles: catch it`; }
          else api.hit(20);
        }
      });
      if (spawned >= queue.length && live.size === 0){ api.finish(); return; }
      raf = requestAnimationFrame(loop);
    };
    api.onEnd(() => cancelAnimationFrame(raf));
    raf = requestAnimationFrame(loop);
  }
});

/* ---------------- 4. Hash Router ---------------- */
G.hashRouter = () => ({
  lives:3,
  howTo:["A row arrives with its key's hash. Send it to reducer <b>hash % R</b>.","Watch R: it changes between waves.","In the last wave, MegaMart is salted: the salt changes the hash and spreads the load."],
  learned:["Hash partitioning: the same key always goes to the same reducer","Changing the partition count moves almost every key","Salting spreads one hot key across several reducers"],
  setup(stage, api){
    const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    const KEYS = ["M-1042","MegaMart","M-2210","M-0007","M-5531","M-0981","M-3307","M-7714"];
    const hashes = {}; KEYS.forEach(k => hashes[k] = rnd(10, 99));
    const rows = [];
    for (let n = 0; n < 6; n++){ const k = n < 2 ? "MegaMart" : KEYS[rnd(0, KEYS.length - 1)]; rows.push({R:4, key:k, h:hashes[k]}); }
    for (let n = 0; n < 6; n++){ const k = n % 3 === 0 ? "MegaMart" : KEYS[rnd(0, KEYS.length - 1)]; rows.push({R:8, key:k, h:hashes[k]}); }
    for (let n = 0; n < 5; n++){ const s = n; rows.push({R:8, key:`MegaMart#${s}`, h:rnd(10, 99), salted:true}); }
    let i = 0, R = 0, load = [], busy = false;
    stage.innerHTML = `<div class="gm-hash"><p class="gm-prog"></p>
      <div class="gm-row"><span class="gm-key"></span><span class="gm-h"></span><span class="gm-mod"></span></div>
      <div class="gm-timer"></div>
      <div class="gm-reducers"></div><p class="gm-why" aria-live="polite">&nbsp;</p></div>`;
    const prog = stage.querySelector(".gm-prog"), red = stage.querySelector(".gm-reducers"), why = stage.querySelector(".gm-why"), row = stage.querySelector(".gm-row");
    const timer = turnTimer(stage.querySelector(".gm-timer"), 9, api, () => pick(-1));
    const drawRed = () => {
      const mx = Math.max(1, ...load);
      red.style.setProperty("--n", R);
      red.innerHTML = load.map((l, k) => `<button class="gm-red" data-r="${k}"><span class="gm-load" style="height:${l / mx * 100}%"></span><b>${k}</b><small>${l} rows</small></button>`).join("");
    };
    const show = () => {
      if (i >= rows.length){ api.finish(); return; }
      const w = rows[i];
      if (w.R !== R || (w.salted && !rows[i - 1].salted)){
        R = w.R; load = Array(R).fill(0); drawRed();
        api.say(w.salted ? "Wave 3: salted keys" : `Wave ${R === 4 ? 1 : 2}: R = ${R}`);
      }
      busy = false;
      prog.textContent = `${w.salted ? "Wave 3 · salted" : R === 4 ? "Wave 1" : "Wave 2"} · R = ${R} · row ${i + 1}/${rows.length}`;
      row.className = "gm-row in";
      row.querySelector(".gm-key").textContent = w.key;
      row.querySelector(".gm-h").innerHTML = `hash = <b>${w.h}</b>`;
      row.querySelector(".gm-mod").textContent = `→ ${w.h} % ${R} = ?`;
      timer.restart(Math.max(4.5, 9 - i * 0.3));
    };
    const pick = k => {
      if (busy || api.over) return; busy = true; timer.stop();
      const w = rows[i], want = w.h % R;
      if (k === want){ api.hit(100); load[k]++; why.textContent = `✓ ${w.key} → reducer ${want}`; }
      else { api.miss(k < 0 ? "Too slow" : "Wrong reducer"); load[want]++; why.textContent = `✗ ${w.h} % ${R} = ${want}`; }
      drawRed();
      if (i === 11) later(api, () => api.say(`MegaMart always lands on reducer ${hashes.MegaMart % 8}`), 200);
      i++; later(api, show, 800);
    };
    red.addEventListener("click", e => { const b = e.target.closest("[data-r]"); if (b) pick(+b.dataset.r); });
    keys(api, Object.fromEntries("01234567".split("").map(d => [d, () => { if (+d < R) pick(+d); }])));
    show();
  }
});

/* ---------------- 5. Join Duel ---------------- */
G.joinDuel = () => ({
  lives:3,
  howTo:["The Slow Query attacks with join scenarios.","Pick the join strategy Spark should use. Right answers hit it; wrong ones heal it and cost a life.","Missed scenarios come back at the end. You have 25 s per turn."],
  learned:["Broadcast the small side when the join type allows it","Full outer joins can't broadcast; left joins can only broadcast the right side","Non-equi joins need nested loop; bucketed tables can skip the shuffle"],
  setup(stage, api){
    const BHJ = "Broadcast hash join", SMJ = "Sort-merge join", SHJ = "Shuffle hash join", BNL = "Broadcast nested loop";
    const SC = [
      {s:"INNER JOIN payments (2 TB) with merchants (40 MB) ON merchant_id", a:BHJ, o:[BHJ, SMJ, SHJ, BNL], e:"Broadcast the 40 MB side; the 2 TB side never shuffles."},
      {s:"merchants (30 MB) LEFT JOIN payments (2 TB) ON merchant_id", a:SMJ, o:[BHJ + " (broadcast merchants)", BHJ + " (broadcast payments)", SMJ, BNL], e:"A left join can only broadcast the right side, and that's 2 TB. Sort-merge it."},
      {s:"payments (2 TB) FULL OUTER JOIN refunds (20 MB) ON payment_id", a:SMJ, o:[BHJ, SMJ, BNL, "Cartesian product"], e:"Full outer joins can't broadcast either side."},
      {s:"payments (3 TB) JOIN ledger (3 TB) ON txn_id, neither fits in memory per partition", a:SMJ, o:[BHJ, SHJ, SMJ, BNL], e:"Big × big with large partitions: sort-merge is the safe choice."},
      {s:"payments (2 TB) JOIN fx_rates (5 MB) ON ts BETWEEN valid_from AND valid_to", a:BNL, o:[BHJ, SMJ, SHJ, BNL], e:"No equality key: broadcast the small side and compare with a nested loop."},
      {s:"payments LEFT ANTI JOIN blocklist (2 MB) ON card_hash", a:BHJ, o:[BHJ, SMJ, BNL, "Cartesian product"], e:"Anti joins can broadcast the right side: perfect for a blocklist."},
      {s:"orders (800 GB) JOIN customers (6 GB), small per-partition build side, sorting is the bottleneck", a:SHJ, o:[BHJ, SHJ, SMJ, BNL], e:"Too big to broadcast, but each partition's build side fits: shuffle hash skips the sort."},
      {s:"Two 4 TB tables both bucketed into 512 buckets by merchant_id", a:SMJ + " (no shuffle)", o:[BHJ, SMJ + " (no shuffle)", SMJ + " (full shuffle)", BNL], e:"Matching buckets let Spark join bucket to bucket without an Exchange."}
    ];
    let q = shuffle(SC), total = SC.length, beaten = 0, busy = false, cur;
    stage.innerHTML = `<div class="gm-duel">
      <div class="gm-boss"><span class="gm-boss-ic">🐌</span><div><b>The Slow Query</b><div class="gm-hp"><span></span></div><small class="gm-hpt"></small></div></div>
      <div class="gm-sc"><p class="gm-prog"></p><p class="gm-q"></p></div><div class="gm-timer"></div>
      <div class="gm-opts"></div><p class="gm-why" aria-live="polite">&nbsp;</p></div>`;
    const hp = stage.querySelector(".gm-hp span"), hpt = stage.querySelector(".gm-hpt"), opts = stage.querySelector(".gm-opts"), why = stage.querySelector(".gm-why");
    const timer = turnTimer(stage.querySelector(".gm-timer"), 25, api, () => choose(null));
    const drawHP = () => { const p = (total - beaten) / total * 100; hp.style.width = p + "%"; hpt.textContent = `HP ${Math.round(p)}%`; };
    const next = () => {
      if (!q.length){ api.finish(); return; }
      busy = false; cur = q.shift();
      stage.querySelector(".gm-prog").textContent = `Scenario ${beaten + 1} of ${total}`;
      stage.querySelector(".gm-q").textContent = cur.s; opts.dataset.a = cur.a;
      opts.innerHTML = shuffle(cur.o).map(o => `<button class="btn gm-opt" data-o="${esc(o)}">${esc(o)}</button>`).join("");
      timer.restart();
    };
    const choose = o => {
      if (busy || api.over) return; busy = true; timer.stop();
      opts.querySelectorAll(".gm-opt").forEach(b => { b.disabled = true; if (b.dataset.o === cur.a) b.classList.add("right"); else if (b.dataset.o === o) b.classList.add("wrong"); });
      if (o === cur.a){ beaten++; api.hit(150, "hit!"); stage.querySelector(".gm-boss").classList.add("hurt"); setTimeout(() => stage.querySelector(".gm-boss").classList.remove("hurt"), 400); why.textContent = "✓ " + cur.e; }
      else { q.push(cur); api.miss(o ? "It healed" : "Too slow"); why.textContent = "✗ " + cur.e; }
      drawHP(); later(api, next, 1700);
    };
    opts.addEventListener("click", e => { const b = e.target.closest("[data-o]"); if (b) choose(b.dataset.o); });
    drawHP(); next();
  }
});

/* ---------------- 6. Skew Smasher ---------------- */
G.skewSmasher = () => ({
  lives:3,
  howTo:["Bars are shuffle partitions. The stage takes as long as the tallest one.","Spend coins on fixes until the tallest bar is at most 2× the median.","Wrong tools waste coins and cost a life. Three levels."],
  learned:["Handle NULL keys first","AQE skew join splits skewed join partitions, not aggregations","Salting / two-phase aggregation spreads a hot key; broadcast removes the shuffle"],
  setup(stage, api){
    const norm = (n, lo, hi) => Array.from({length:n}, (_, k) => ({k:`p${k}`, v:lo + ((k * 7) % (hi - lo + 1))}));
    const LEVELS = [
      {title:"Level 1 · Join payments with settlements (900 GB)", op:"join", small:false, coins:6,
       bars:[...norm(10, 9, 14), {k:"NULL", v:60, nul:true}, {k:"MegaMart", v:90, hot:true}]},
      {title:"Level 2 · groupBy(merchant_id).sum(amount)", op:"agg", small:false, coins:5,
       bars:[...norm(11, 6, 10), {k:"MegaMart", v:120, hot:true}]},
      {title:"Level 3 · Join payments with merchants (25 MB)", op:"join", small:true, coins:6,
       bars:[...norm(10, 8, 13), {k:"MegaMart", v:85, hot:true}, {k:"QuickBuy", v:55, hot:true}]}
    ];
    const TOOLS = [
      {id:"null", n:"Filter NULL keys", c:1}, {id:"aqe", n:"AQE skew join", c:2}, {id:"salt4", n:"Salt ×4", c:2}, {id:"salt16", n:"Salt ×16", c:3},
      {id:"bc", n:"Broadcast other side", c:2}, {id:"spec", n:"Speculation", c:1}, {id:"more", n:"Add executors", c:3}
    ];
    let L, bars, coins, lv = 0;
    const ok = () => { const vs = bars.map(b => b.v), m = median(vs); return Math.max(...vs) <= 2 * m; };
    const load = i => { lv = i; L = LEVELS[i]; bars = L.bars.map(b => Object.assign({}, b)); coins = L.coins; draw(); };
    const draw = () => {
      const vs = bars.map(b => b.v), mx = Math.max(...vs), md = median(vs);
      stage.innerHTML = `<div class="gm-skew"><p class="gm-prog">${esc(L.title)}</p>
        <div class="gm-meta"><span>🪙 <b>${coins}</b> coins</span><span>Tallest <b>${fmt(mx)} GB</b></span><span>Median <b>${fmt(md, 1)} GB</b></span><span class="${mx <= 2 * md ? "good" : "bad"}">Target ≤ ${fmt(2 * md, 1)} GB</span></div>
        <div class="gm-bars" style="--n:${bars.length}">${bars.map(b => `<span class="gm-bar ${b.nul ? "nul" : b.hot ? "hot" : ""} ${b.v > 2 * md ? "over" : ""}" style="height:${Math.max(3, b.v / Math.max(mx, 1) * 100)}%" title="${esc(b.k)}: ${fmt(b.v, 1)} GB"><i>${b.nul || b.hot ? esc(b.k.replace(/#.*/, "")) : ""}</i></span>`).join("")}</div>
        <div class="gm-tools">${TOOLS.map(t => `<button class="btn gm-tool" data-t="${t.id}" ${t.c > coins ? "disabled" : ""}>${esc(L.op === "agg" && t.id.startsWith("salt") ? t.n.replace("Salt", "Two-phase agg") : t.n)}<small>🪙 ${t.c}</small></button>`).join("")}</div>
        <p class="gm-why" aria-live="polite">&nbsp;</p></div>`;
    };
    const say = t => { const w = stage.querySelector(".gm-why"); if (w) w.textContent = t; };
    const largest = () => bars.filter(b => !b.nul).reduce((a, b) => b.v > a.v ? b : a);
    const apply = id => {
      const t = TOOLS.find(x => x.id === id); if (t.c > coins) return;
      coins -= t.c;
      const md = median(bars.map(b => b.v));
      let msg = "", good = true;
      if (id === "null"){
        const n = bars.find(b => b.nul);
        if (!n){ good = false; msg = "No NULL keys in this data."; }
        else { n.v = md; n.nul = false; n.k = "p-nulls-removed"; msg = "NULL keys never match: filtered before the shuffle."; }
      } else if (id === "aqe"){
        if (L.op !== "join"){ good = false; msg = "AQE skew join only splits join partitions, not aggregations."; }
        else {
          const big = bars.filter(b => b.v > 5 * md && b.v > 25);
          if (!big.length){ good = false; msg = "No partition is big enough for AQE to treat as skewed."; }
          else { big.forEach(b => { const n = Math.ceil(b.v / (md * 1.4)); bars.splice(bars.indexOf(b), 1, ...Array.from({length:n}, (_, k) => ({k:`${b.k}#${k}`, v:b.v / n, hot:b.hot, nul:b.nul}))); }); msg = "AQE split the oversized partitions and replicated the other side's matching rows."; }
        }
      } else if (id === "salt4" || id === "salt16"){
        const n = id === "salt4" ? 4 : 16, h = largest();
        if (h.v <= 2 * md){ good = false; msg = "Nothing hot left to salt: salting now just adds cost."; }
        else {
          const base = h.k.replace(/#.*/, ""), mine = bars.filter(x => x.k.replace(/#.*/, "") === base), tot = mine.reduce((a, x) => a + x.v, 0);
          bars.splice(bars.indexOf(mine[0]), 0, ...Array.from({length:n}, (_, k) => ({k:`${base}#${k}`, v:tot / n, hot:true})));
          bars = bars.filter(x => !mine.includes(x)); msg = L.op === "agg" ? `Aggregated by (key, salt) then by key: ${base} spread over ${n} tasks.` : `${base} spread over ${n} partitions; the other side is replicated ${n}×.`; }
      } else if (id === "bc"){
        if (L.op !== "join"){ good = false; msg = "There's no join to broadcast in an aggregation."; }
        else if (!L.small){ good = false; msg = "The other side is 900 GB: far too big to broadcast."; }
        else { bars = bars.map((b, k) => ({k:`task${k}`, v:md})); msg = "Broadcast the 25 MB side: the big side never shuffles, so no partition is skewed."; }
      } else if (id === "spec"){ good = false; msg = "A speculative copy reads the same 90 GB. Skew is a data problem."; }
      else { good = false; msg = "More executors don't help: the hot partition is still one task."; }
      draw(); say((good ? "✓ " : "✗ ") + msg);
      if (good) api.hit(120); else api.miss("Wasted");
      if (api.over) return;
      if (ok()){
        api.hit(coins * 60, "coins left");
        if (lv + 1 < LEVELS.length) later(api, () => load(lv + 1), 1400); else later(api, () => api.finish(), 900);
      } else if (!TOOLS.some(x => x.c <= coins)) api.fail("Out of coins");
    };
    stage.addEventListener("click", e => { const b = e.target.closest("[data-t]"); if (b && !b.disabled && !api.over && !ok()) apply(b.dataset.t); });
    load(0);
  }
});

/* ---------------- 7. Executor Fit ---------------- */
G.executorFit = () => ({
  lives:3,
  howTo:["Choose cores per executor, heap size and overhead, then deploy.","Each round has a node size and requirements. Watch the live numbers.","A failed deploy costs a life and tells you why."],
  learned:["Container = heap + overhead; PySpark needs more overhead","Memory per task ≈ (heap − 300 MB) × 0.6 ÷ cores","Leave a core and some memory per node for the OS"],
  setup(stage, api){
    const ROUNDS = [
      {title:"Round 1 · JVM batch job", node:[32, 256], need:{task:4, minOH:10, util:0.85}, note:"Nodes: 32 cores, 256 GB. Need ≥ 4 GB execution memory per task."},
      {title:"Round 2 · PySpark job with pandas UDFs", node:[32, 256], need:{task:3.5, minOH:20, util:0.85}, note:"Python workers live outside the heap: overhead must be ≥ 20%. Need ≥ 3.5 GB per task."},
      {title:"Round 3 · Smaller nodes, 6 GB broadcast", node:[16, 128], need:{task:4, minOH:10, util:0.85, heap:20}, note:"Nodes: 16 cores, 128 GB. A 6 GB broadcast table needs heap ≥ 20 GB. Need ≥ 4 GB per task."}
    ];
    let r = 0, c = 16, h = 100, oh = 10;
    const calc = () => {
      const R = ROUNDS[r], cores = R.node[0] - 1, mem = R.node[1] - 8;
      const over = Math.max(0.384, h * oh / 100), cont = h + over;
      const epn = Math.max(0, Math.min(Math.floor(cores / c), Math.floor(mem / cont)));
      const task = (h - 0.3) * 0.6 / c;
      return {cores, mem, over, cont, epn, task, idle:cores - epn * c, used:epn * cont};
    };
    const draw = () => {
      const R = ROUNDS[r], k = calc();
      stage.innerHTML = `<div class="gm-exec"><p class="gm-prog">${esc(R.title)}</p><p class="gm-note">${esc(R.note)} 1 core and 8 GB per node are reserved for the OS.</p>
        <div class="gm-steps">
          ${[["c","Cores / executor",c,""],["h","Heap",h," GB"],["oh","Overhead",oh,"%"]].map(([id, l, v, u]) => `<div class="gm-step"><small>${l}</small><div><button class="btn" data-s="${id}" data-d="-1">−</button><b>${v}${u}</b><button class="btn" data-s="${id}" data-d="1">+</button></div></div>`).join("")}
        </div>
        <div class="gm-node"><p>One node · ${R.node[0]} cores · ${R.node[1]} GB</p>
          <div class="gm-cores">${Array.from({length:R.node[0]}, (_, i) => { const ex = i < k.epn * c ? Math.floor(i / c) : -1; return `<span class="${i >= k.cores ? "os" : ex >= 0 ? "on" : ""}" style="--e:${ex}"></span>`; }).join("")}</div>
          <div class="gm-mem"><span style="width:${Math.min(100, k.used / R.node[1] * 100)}%"></span><span class="os" style="width:${8 / R.node[1] * 100}%"></span></div></div>
        <div class="gm-meta"><span>Executors/node <b>${k.epn}</b></span><span>Container <b>${fmt(k.cont, 1)} GB</b></span><span>Mem/task <b>${fmt(k.task, 2)} GB</b></span><span>Idle cores <b>${k.idle}</b></span><span>Memory used <b>${Math.round(k.used / k.mem * 100)}%</b></span></div>
        <button class="btn big solid gm-deploy">Deploy</button><p class="gm-why" aria-live="polite">&nbsp;</p></div>`;
    };
    const check = () => {
      const R = ROUNDS[r], N = R.need, k = calc();
      if (k.epn === 0) return "Not even one executor fits on a node.";
      if (oh < N.minOH) return `Containers killed: overhead ${oh}% is too low for this job (need ≥ ${N.minOH}%).`;
      if (h > 64) return `GC pauses: a ${h} GB heap stalls for seconds. Keep heaps ≤ 64 GB.`;
      if (N.heap && h < N.heap) return `The 6 GB broadcast doesn't fit comfortably in a ${h} GB heap.`;
      if (k.task < N.task) return `Spills: only ${fmt(k.task, 2)} GB per task (need ≥ ${N.task}).`;
      if (k.idle > 2) return `${k.idle} cores sit idle on every node.`;
      if (k.used / k.mem < N.util) return `Only ${Math.round(k.used / k.mem * 100)}% of node memory is used: you're paying for idle RAM.`;
      return "";
    };
    stage.addEventListener("click", e => {
      if (api.over) return;
      const s = e.target.closest("[data-s]");
      if (s){
        const d = +s.dataset.d;
        if (s.dataset.s === "c") c = Math.max(1, Math.min(ROUNDS[r].node[0], c + d));
        if (s.dataset.s === "h") h = Math.max(2, Math.min(200, h + d * ((d > 0 ? h >= 40 : h > 40) ? 4 : 2)));
        if (s.dataset.s === "oh") oh = Math.max(5, Math.min(40, oh + d * 5));
        draw(); return;
      }
      if (e.target.closest(".gm-deploy")){
        const err = check(), w = stage.querySelector(".gm-why");
        if (err){ api.miss("Failed"); w.textContent = "✗ " + err; return; }
        const k = calc();
        api.hit(250, "deployed"); w.textContent = `✓ ${k.epn} executors per node, ${fmt(k.task, 2)} GB per task, ${k.idle} idle cores.`;
        if (r + 1 < ROUNDS.length) later(api, () => { r++; c = 16; h = r === 2 ? 60 : 100; oh = 10; draw(); }, 1500);
        else later(api, () => api.finish(), 1000);
      }
    });
    draw();
  }
});

/* ---------------- 8. Boss: The Nightly Job ---------------- */
G.nightlyBoss = () => ({
  lives:3,
  howTo:["The nightly job runs 250 minutes. Finance needs it under 45.","Each phase shows a Spark UI symptom. Pick the fix within 20 s.","Right fixes cut the runtime; wrong ones cost a life and you try again."],
  learned:["Small files → compaction and good writes","Functions on partition columns break pruning","Bad estimates → broadcast; skewed aggregation → two-phase","Spills → more, smaller partitions; many output files → repartition by dt"],
  setup(stage, api){
    const PH = [
      {ui:["Stage 0 · scan payments","2,097,152 files · 69,212 tasks","median task 0.9 s · S3 503 Slow Down"], a:"Compact the table and write with a target file size", o:["Raise spark.sql.shuffle.partitions","Add 20 more nodes","Enable speculation"], cut:60, e:"Two million tiny files: compaction makes ~1,000 healthy 512 MB files."},
      {ui:["Stage 1 · scan reads 38 TB","Filter: date_format(created_at,'yyyy-MM-dd') = '2026-11-16'","PartitionFilters: []"], a:"Filter on the raw partition column range instead", o:["Cache the whole table first","Raise maxPartitionBytes to 1 GB","Broadcast payments"], cut:25, e:"Wrapping the column in a function hides it from pruning."},
      {ui:["Stage 4 · SortMergeJoin","payments 2.1 TB × merchants 58 MB","Shuffle write 2.2 TB · stats from 2024"], a:"Broadcast merchants and refresh statistics", o:["Salt the join key ×16","Double the shuffle partitions","Shuffle hash join with payments as build side"], cut:50, e:"58 MB fits on every executor: the 2 TB side stops shuffling."},
      {ui:["Stage 7 · HashAggregate by merchant_id","median task 31 s · max task 46 min","task 1,271 shuffle read 180 GB"], a:"Two-phase aggregation with a salt", o:["Rely on AQE skew join","Enable speculation","Increase executor memory"], cut:45, e:"Aggregate by (merchant_id, salt), then by merchant_id."},
      {ui:["Stage 9 · Sort","Spill (disk) 3.4 TB · GC time 38%","200 shuffle partitions of ~8 GB"], a:"Use ~8,000 shuffle partitions with AQE coalescing", o:["coalesce(50) before the sort","Cache before the shuffle","Give the driver more memory"], cut:18, e:"8 GB partitions don't fit in memory per task; 200 MB ones do."},
      {ui:["Stage 11 · write","48,000 files into 30 date partitions","every task writes every date"], a:"Repartition by dt before writing (hash distribution)", o:["coalesce(1) before writing","Disable compression","Raise maxRecordsPerFile"], cut:10, e:"Each date's rows go to few tasks, so each partition gets a few large files."}
    ];
    let p = 0, mins = 250, busy = false;
    stage.innerHTML = `<div class="gm-bossf">
      <div class="gm-clock"><div><small>Runtime</small><b class="gm-mins">250 min</b></div><div class="gm-hp big"><span></span></div><small>Target 45 min · deadline 6:00 AM</small></div>
      <div class="gm-ui"></div><div class="gm-timer"></div><div class="gm-opts"></div><p class="gm-why" aria-live="polite">&nbsp;</p></div>`;
    const ui = stage.querySelector(".gm-ui"), opts = stage.querySelector(".gm-opts"), why = stage.querySelector(".gm-why");
    const timer = turnTimer(stage.querySelector(".gm-timer"), 20, api, () => choose(null));
    const drawClock = () => { stage.querySelector(".gm-mins").textContent = `${mins} min`; stage.querySelector(".gm-hp span").style.width = Math.max(0, (mins - 45) / 205 * 100) + "%"; };
    const show = () => {
      if (p >= PH.length){ api.finish(); return; }
      busy = false; const P = PH[p];
      opts.dataset.a = P.a; ui.innerHTML = `<p class="gm-prog">Phase ${p + 1} of ${PH.length} · Spark UI</p>${P.ui.map(l => `<code>${esc(l)}</code>`).join("")}`;
      opts.innerHTML = shuffle([P.a, ...P.o]).map(o => `<button class="btn gm-opt" data-o="${esc(o)}">${esc(o)}</button>`).join("");
      timer.restart();
    };
    const choose = o => {
      if (busy || api.over) return; busy = true; timer.stop();
      const P = PH[p];
      opts.querySelectorAll(".gm-opt").forEach(b => { b.disabled = true; if (b.dataset.o === P.a && o === P.a) b.classList.add("right"); else if (b.dataset.o === o) b.classList.add("wrong"); });
      if (o === P.a){ mins -= P.cut; drawClock(); api.hit(200, `−${P.cut} min`); why.textContent = "✓ " + P.e; p++; later(api, show, 1600); }
      else { api.miss(o ? "Didn't help" : "Too slow"); why.textContent = o ? `✗ That doesn't address this symptom. Read the UI again.` : "⏱ The clock is ticking."; later(api, () => { busy = false; opts.querySelectorAll(".gm-opt").forEach(b => { if (!b.classList.contains("wrong")) b.disabled = false; }); timer.restart(); }, 1200); }
    };
    opts.addEventListener("click", e => { const b = e.target.closest("[data-o]"); if (b && !b.disabled) choose(b.dataset.o); });
    drawClock(); show();
  }
});
})();
