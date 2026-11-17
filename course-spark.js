// Course: Spark Internals, played. Registers the course and its labs with the course engine.
(function(){
const COURSES = window.COURSES = window.COURSES || {};
const LABS = window.COURSE_LABS, U = window.COURSE_UTIL;

COURSES.spark = {
id:"spark", order:2, level:"Intermediate", hue:28, hours:3,
title:"Spark Internals, played",
short:"Partitions, stages, shuffles, joins, skew and memory, by running and fixing Spark jobs.",
tagline:"See what Spark really does with your DataFrame code. Size partitions, cut stages, simulate shuffles, pick join strategies, kill skew and rescue a four-hour nightly job.",
story:"You're the new data engineer at Paydesk. The nightly payments job takes four hours and finance wants its reports by 6 AM. Learn how Spark executes work, then make that job fast.",
units:[
{title:"How Spark runs your code", hue:28, desc:"Lazy plans, partitions, tasks and stages.",
items:[
{id:"1", title:"Lazy plans and actions", mins:7, lab:"jobCounter", labTitle:"Job counter",
sum:"Transformations only describe work. Actions make Spark do it, and every action can run the whole plan again.",
mission:"A teammate's notebook scans the payments table seven times and nobody knows why. Learn to count jobs by reading code.",
challenge:"Predict the right number of jobs for at least 4 of 5 snippets.",
body:`## Two kinds of operations
Spark splits DataFrame operations into two groups:
- **Transformations** (filter, select, withColumn, join, groupBy) return a new DataFrame and only add a step to the plan. Nothing runs.
- **Actions** (count, collect, show, write, toPandas) need a result, so Spark builds a physical plan and runs a **job**.

:::flow What happens when you call an action
Your transformations :: a chain of steps, the logical plan
Action called :: e.g. df.count()
Catalyst optimises :: pushes filters down, prunes columns, picks joins
Physical plan → DAG of stages :: split at shuffles
Tasks run on executors :: one per partition
Result returns or is written :: the job finishes
:::

## The trap: actions recompute everything
A DataFrame is a recipe, not stored data. Each action re-reads the source and re-runs every transformation. Calling «df.count()» and then «df.write...» reads the input twice.

:::lanes Without vs with cache
# No cache
count() :: read + filter + join, job 1
show() :: read + filter + join again, job 2
write() :: read + filter + join a third time, job 3
# cache() then actions
count() :: computes and keeps partitions in memory, job 1
show() :: reads the cached partitions
write() :: reads the cached partitions
:::

## When caching is worth it
- The same DataFrame feeds **two or more actions** and is expensive to compute.
- It fits comfortably in executor memory (or you use «MEMORY_AND_DISK»).
- You call «unpersist()» when you are done.
Caching something used once just wastes memory needed for shuffles and joins.

:::note Some "transformations" sneak in jobs
Reading CSV or JSON with schema inference, «sort» with range partitioning (it samples the data), and some «pivot» calls without explicit values can trigger extra small jobs. The Spark UI's Jobs tab shows every one.
:::`,
take:["Transformations build a plan; actions run jobs.","Every action recomputes the plan unless you cache.","Cache only DataFrames reused by several actions, then unpersist."]},

{id:"2", title:"Partitions, tasks and the small-files problem", mins:8, lab:"partitionPlanner", labTitle:"Partition planner",
sum:"Spark splits input into partitions; each partition becomes one task. Too many tiny files or partitions waste most of the time.",
mission:"The first stage of the nightly job reads 500 GB stored as two million 250 KB files and takes minutes before any real work. Fix it.",
challenge:"Bring the read stage under 90 seconds.",
body:`## Partitions are the unit of parallelism
When Spark reads files it groups their bytes into **input partitions**, about «spark.sql.files.maxPartitionBytes» each (128 MB by default). Each partition becomes one **task**, and each executor core runs one task at a time.

:::flow From files to tasks
List the files :: from the catalog or the storage listing
Pack bytes into partitions :: up to maxPartitionBytes each
One task per partition :: scheduled onto free cores
Waves :: tasks ÷ total cores, rounded up
Stage time ≈ waves × task time :: plus scheduling overhead
:::

## Why small files hurt
Every file costs something regardless of size: a request to S3, opening it, reading its footer, and a little planning work. Spark even adds «spark.sql.files.openCostInBytes» (4 MB) per file when packing, to account for that overhead.
| Layout | Files for 500 GB | Effect |
|---|---|---|
| 250 KB files | 2,000,000 | Minutes of listing and opening before useful work |
| 128 MB files | 4,000 | Good |
| 512 MB files | 1,000 | Good, fewer, larger tasks |

## Sizing partitions
- Aim for roughly **100-500 MB per task** of input; small enough to fit in memory, large enough that overhead is minor.
- Too few partitions leave cores idle and make each task heavy.
- Too many partitions spend more time scheduling than computing.

:::tip Fix the data, not just the reader
Raising maxPartitionBytes only changes packing. The real fix for small files is to **compact** them where they are written (rewrite_data_files for Iceberg, or repartition before writing), so every future reader benefits.
:::`,
take:["One partition = one task; tasks run in waves across cores.","Each file has fixed overhead; millions of tiny files dominate runtime.","Compact files at write time and aim for 100-500 MB tasks."]},

{id:"3", title:"Narrow vs wide: where stages begin", mins:7, lab:"stageCutter", labTitle:"Stage cutter",
sum:"Stages break wherever data must move between partitions. Learn to spot shuffles by reading code.",
mission:"The Spark UI shows 4 stages for a job you expected to run in one. Find out which lines create the boundaries.",
challenge:"Place every stage boundary correctly in both pipelines.",
body:`## Narrow transformations stay in place
A **narrow** transformation computes each output partition from exactly one input partition: «filter», «select», «withColumn», «map», union of DataFrames. Spark chains these together and runs them in a single pass inside one task.

## Wide transformations move data
A **wide** transformation needs rows from many input partitions to land together: «groupBy().agg()», «join» (unless one side is broadcast), «distinct», «repartition», «orderBy», window functions with PARTITION BY. Spark must **shuffle**: write the data out by key, then read it back on the other side. Every shuffle ends one stage and starts the next.

:::lanes Narrow vs wide
# Narrow (pipelined)
Partition 1 :: filter → select → withColumn
Partition 2 :: filter → select → withColumn
No data moves :: one stage
# Wide (shuffle)
Every partition :: writes rows grouped by key
Network exchange :: each reducer fetches its keys from all mappers
New stage :: aggregates, joins or sorts
:::

## Reading the plan
In «df.explain()», every **Exchange** node is a shuffle and therefore a stage boundary. «BroadcastExchange» is different: it copies a small table to every executor and does not split the big side's stage.

| Operation | Shuffle? |
|---|---|
| filter, select, withColumn | No |
| groupBy + agg | Yes (hash partitioning by key) |
| join with a broadcast side | No for the big side |
| join of two large tables | Yes, both sides |
| orderBy | Yes (range partitioning) |
| coalesce(n) | No (merges partitions locally) |
| repartition(n) | Yes |`,
take:["Narrow ops are pipelined inside a stage.","Wide ops shuffle and start a new stage.","Each Exchange in explain() is a stage boundary."]},

{id:"q1", kind:"quiz", title:"Checkpoint: how Spark runs your code", mins:3,
questions:[
 {q:"df = spark.read.parquet(p).filter(...).select(...) — how many jobs have run?", o:["0","1","2","Depends on file count"], a:0, e:"Reading Parquet with a known schema and adding transformations only builds a plan. Nothing runs until an action."},
 {q:"You call count() and then write() on the same uncached DataFrame. What happens?", o:["The second action reuses the first result","The input is read and processed twice","Spark errors","Only the write runs"], a:1, e:"Without caching, each action recomputes the plan from the source."},
 {q:"500 GB in 128 MB partitions on a cluster with 200 cores runs in about how many waves?", o:["1","4","20","4,000"], a:2, e:"500 GB / 128 MB ≈ 4,000 tasks; 4,000 / 200 cores = 20 waves."},
 {q:"Which operation does NOT cause a shuffle?", o:["groupBy().count()","distinct()","withColumn()","repartition(100)"], a:2, e:"withColumn is narrow: each output partition depends on one input partition."},
 {q:"Best long-term fix for millions of small files?", o:["More executors","Compact the files where they are written","Raise driver memory","Cache the table"], a:1, e:"Compaction fixes the layout for every reader; reader tuning only hides the cost."}
]}
]},

{title:"Shuffles, joins and skew", hue:205, desc:"Where most Spark time and money goes.",
items:[
{id:"4", title:"Inside a shuffle", mins:8, lab:"shuffleSim", labTitle:"Shuffle simulator",
sum:"Every map task writes a block for every reducer. Partition counts decide whether the shuffle is fast or a disaster.",
mission:"The join stage shuffles 1 TB and keeps failing with fetch timeouts. Find shuffle settings that keep blocks and partitions healthy.",
challenge:"Keep reduce partitions between 100 and 300 MB and avoid the tiny-block problem.",
body:`## Two sides of a shuffle
:::flow Map side, then reduce side
Map tasks compute a target partition per row :: hash(key) % spark.sql.shuffle.partitions
Rows are sorted by target partition :: spilled to disk if memory fills
One data file + index file per map task :: on the executor's local disk
Reduce tasks fetch their block from every map task :: over the network
Reducers merge and process :: aggregate, join or sort
:::

## The M × R problem
With M map tasks and R reduce partitions there are **M × R blocks**. 4,000 map tasks × 4,000 reducers = 16 million blocks. If 1 TB is shuffled, each block averages about 60 KB: millions of tiny random reads, slow fetches, and timeouts.

## Choosing shuffle partitions
| Too few reducers | Too many reducers |
|---|---|
| Huge partitions (GBs each) | Tiny partitions |
| Spills to disk, out-of-memory errors | Tiny blocks, scheduling overhead |
| Few tasks, idle cores | Small output files |
Target about **100-300 MB per reduce partition**: partitions ≈ shuffled bytes ÷ 200 MB. With AQE on, set the number high and let Spark coalesce small partitions at runtime.

:::tip When blocks are tiny no matter what
Reduce the map side too (larger input splits), shuffle less data (filter and project before the shuffle, pre-aggregate), or use **push-based shuffle** / a remote shuffle service, which merges blocks per reducer so reducers read a few large files.
:::

## Shuffle files and failures
Shuffle files sit on executor disks. If an executor disappears (for example a spot node is reclaimed), its blocks are lost, reducers hit FetchFailedException and Spark re-runs part of the map stage. The external shuffle service, graceful decommissioning or a remote shuffle service keep those files available.`,
take:["A shuffle has M × R blocks; tiny blocks kill performance.","Size reduce partitions around 100-300 MB; let AQE coalesce.","Shuffle less data before tuning partition counts."]},

{id:"5", title:"Choosing a join strategy", mins:8, lab:"joinPicker", labTitle:"Join strategy game",
sum:"Spark picks between broadcast, shuffle hash, sort-merge and nested-loop joins. Knowing why tells you how to make joins cheap.",
mission:"Five joins in the nightly job, five different situations. Pick the strategy Spark should use for each.",
challenge:"Choose the right strategy in at least 4 of 5 scenarios.",
body:`## The four strategies
:::lanes How each strategy works
# Broadcast hash join
Collect the small side :: on the driver
Send a copy to every executor :: broadcast
Each task joins its big-side partition locally :: no shuffle of the big table
# Sort-merge join
Shuffle both sides by key :: same partitioner
Sort each partition :: may spill to disk
Merge matching keys :: robust for huge inputs
# Shuffle hash join
Shuffle both sides by key :: like sort-merge
Build a hash table per partition :: on the smaller side
Probe with the other side :: no sort, needs memory
# Broadcast nested loop
Broadcast one side :: required for non-equi joins
Compare every pair :: very expensive
Avoid at scale :: rewrite to an equi-join when possible
:::

## How Spark decides
1. **Hints** win: «broadcast(df)», «/*+ MERGE */», «/*+ SHUFFLE_HASH */».
2. For equi-joins, if one side's estimated size is under «spark.sql.autoBroadcastJoinThreshold» (10 MB by default), it is broadcast.
3. Otherwise sort-merge join is the default, because it can spill and rarely runs out of memory.
4. Non-equi joins (ranges, inequalities) fall back to broadcast nested loop or a cartesian product.
With AQE enabled, Spark can switch a planned sort-merge join to a broadcast join at runtime if one side turns out small after filtering.

| Situation | Usually best |
|---|---|
| Big fact × small dimension (tens of MB) | Broadcast hash |
| Big × big on an equality key | Sort-merge |
| Big × medium, medium side fits per-partition in memory | Shuffle hash |
| Range condition, small side | Broadcast nested loop |

:::warn Broadcasting too much
Size on disk is not size in memory: a 300 MB compressed Parquet table can expand to several GB and crash executors or the driver. Broadcast only sides that are comfortably small in memory.
:::`,
take:["Broadcast small sides to avoid shuffling the big one.","Sort-merge is the safe default for big × big.","Non-equi joins are expensive; avoid them on large data."]},

{id:"6", title:"Taming skew", mins:9, lab:"skewFix", labTitle:"Skew fixer",
sum:"One hot key can make one task run for an hour while 199 finish in a minute. Measure it, then split it.",
mission:"One merchant generates 40% of all payments. The join stage waits on a single task. Make the stage finish on time.",
challenge:"Get the slowest task under 2× the median task time.",
body:`## What skew looks like
In the Spark UI's stage page, the task summary shows the median task taking 40 seconds and the max taking 40 minutes. Shuffle read size for that one task is enormous. The stage, and the whole job, waits for it.

:::flow Diagnosing skew
Find the slow stage :: Jobs → Stages, sorted by duration
Compare median vs max task :: duration and shuffle read size
Find the hot keys :: groupBy(key).count() ordered descending
Pick a fix :: depends on the key and the join
:::

## Common causes
- **NULL or default keys:** missing merchant IDs all hash to one partition.
- **Natural hot keys:** a marketplace's biggest merchant, a test account, a bot.
- **Low-cardinality keys:** joining on a status column.

## Fixes, from easiest
| Fix | How | Trade-off |
|---|---|---|
| Filter junk keys | Drop or separately handle NULL keys before the join | Only for keys that can't match |
| AQE skew join | spark.sql.adaptive.skewJoin.enabled splits big partitions | Works for joins, automatic |
| Broadcast | If the other side is small, no shuffle means no skew | Only when it fits |
| Salting | Add salt 0..N-1 to the big side, replicate the small side N times | N× copies of the small side |
| Isolate hot keys | Process hot keys in a separate job, union results | More code |

:::tip Salting in one picture
The hot key M42 becomes M42-0 … M42-15 on the big side, spread across 16 partitions. Each salted key still finds its match, because the small side was copied once per salt value.
:::`,
take:["Skew shows as one task far slower than the median.","Filter NULL keys, then try AQE skew handling or broadcasting.","Salting spreads a hot key at the cost of replicating the other side."]},

{id:"7", title:"Memory, spills and executor sizing", mins:8, lab:"memoryTuner", labTitle:"Executor tuner",
sum:"Each task gets a share of executor memory. When its data doesn't fit, Spark spills to disk and slows down.",
mission:"The aggregation stage spills hundreds of gigabytes to disk and two executors died with out-of-memory errors. Size the cluster properly.",
challenge:"Remove spills and memory risk while keeping 4-5 cores per executor.",
body:`## Where executor memory goes
:::flow Executor memory, roughly
Executor heap :: spark.executor.memory
Reserved :: 300 MB
Unified memory :: spark.memory.fraction (60%) of the rest, shared by execution and cache
User memory :: the remaining 40%, for your objects and UDFs
Overhead (off-heap) :: spark.executor.memoryOverhead, for JVM internals and Python workers
:::
Execution memory (sorts, hash tables for joins and aggregations, shuffle buffers) is shared by all tasks running on the executor, so **memory per task ≈ unified memory ÷ cores per executor**.

## Spills
When a task's sort or hash table outgrows its share, Spark writes sorted runs to disk and merges them later. Small spills are fine; large spills mean lots of extra disk I/O. Fixes:
- More shuffle partitions, so each task holds less data.
- More memory per task: more memory per executor, or fewer cores per executor.
- Less data per task: filter earlier, avoid skew.

## Sizing executors
| Choice | Problem |
|---|---|
| Huge executors (30+ cores, 200 GB) | Long garbage-collection pauses; one failure loses a lot |
| Tiny executors (1 core) | Overhead per executor; broadcast tables copied many times |
| 4-5 cores, 4-8 GB per core | Common sweet spot |

:::warn Container killed by YARN or Kubernetes
"Exceeding memory limits" usually means **overhead** is too small, especially in PySpark where Python workers live outside the heap. Raise spark.executor.memoryOverhead before raising the heap.
:::`,
take:["Memory per task ≈ unified memory ÷ cores per executor.","Spills mean tasks hold too much data: more partitions or more memory per task.","4-5 cores per executor and enough overhead is a solid default."]},

{id:"q2", kind:"quiz", title:"Checkpoint: shuffles, joins and skew", mins:3,
questions:[
 {q:"Shuffling 1 TB, what's a sensible number of shuffle partitions?", o:["200","~5,000","1,000,000","1"], a:1, e:"1 TB ÷ 200 MB ≈ 5,000 partitions of a healthy size."},
 {q:"Fact table 2 TB, dimension 40 MB. Best join?", o:["Sort-merge","Broadcast hash","Broadcast nested loop","Cartesian"], a:1, e:"The small dimension fits in memory everywhere, so the 2 TB side never shuffles."},
 {q:"Median task 30 s, max task 45 min, max task read 120 GB. Diagnosis?", o:["Too few executors","Data skew","Small files","Driver out of memory"], a:1, e:"One partition holds far more data than the others."},
 {q:"In salting, what happens to the smaller side?", o:["It is filtered","It is replicated once per salt value","It is broadcast","Nothing"], a:1, e:"Each salt value needs a matching copy of the small side's rows."},
 {q:"PySpark executors are killed for exceeding memory limits. First knob?", o:["spark.executor.memoryOverhead","spark.sql.shuffle.partitions","spark.driver.cores","autoBroadcastJoinThreshold"], a:0, e:"Python workers and off-heap buffers count against overhead, not the JVM heap."}
]},

{id:"boss", kind:"boss", title:"Final project: rescue the nightly job", mins:15, lab:"sparkRescue", labTitle:"Job rescue",
sum:"Apply everything to one real job: four stages, four problems, one deadline.",
mission:"The nightly payments job takes 4 h 10 min. Finance needs results by 6 AM, which means under 45 minutes. Every fix has a cost; choose wisely.",
challenge:"Get the job under 45 minutes while writing at most 300 output files.",
body:`## The job
:::flow Nightly payments job
Read payments :: 500 GB in 2 million small files
Join with merchants :: 60 MB dimension, currently sort-merge
Aggregate by merchant and day :: one merchant holds 40% of rows
Write the daily mart :: currently 24,000 tiny files
:::

## Your toolbox
Every fix you learned is available as a switch: compaction, partition sizing, join strategy, skew handling, shuffle partitions, early filtering, caching and output layout. The breakdown shows which stage dominates after each change, just like the Spark UI would.

:::tip Work like a performance engineer
Fix the biggest stage first, re-run, and check the breakdown again. Some switches cost money or memory; the goal is the deadline, not every switch on.
:::`,
take:["Find the dominant stage, fix it, measure again.","Layout (small files) and joins usually beat cluster size.","Output layout matters as much as input layout."]}
]}
]};

/* ======================= LABS ======================= */
const fmtT = s => s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round(s % 3600 / 60)} min` : s >= 60 ? `${Math.floor(s / 60)} min ${Math.round(s % 60)} s` : `${s.toFixed(1)} s`;

LABS.jobCounter = (el, ctx) => {
  const R = [
    {code:`df = spark.read.parquet("s3://lake/payments")\nok = df.filter("status = 'SUCCESS'")\nby_m = ok.groupBy("merchant_id").sum("amount")`, a:0, e:"Only transformations. Spark has built a plan and run nothing."},
    {code:`ok = spark.table("payments").filter("status = 'SUCCESS'")\nprint(ok.count())\nok.write.parquet("s3://out/ok")`, a:2, e:"Two actions, and no cache: the table is read and filtered twice."},
    {code:`ok = spark.table("payments").filter("status = 'SUCCESS'").cache()\nprint(ok.count())\nok.show(5)\nok.write.parquet("s3://out/ok")`, a:3, e:"Three actions are still three jobs, but after the first one the later jobs read cached partitions instead of the source."},
    {code:`m = spark.table("merchants")\njoined = spark.table("payments").join(m, "merchant_id")\njoined.write.saveAsTable("mart.payments_enriched")`, a:1, e:"One action (the write) runs one job; the join is just a step in its plan, even if it causes several stages."},
    {code:`for d in ["2026-11-14", "2026-11-15", "2026-11-16"]:\n    (spark.table("payments")\n       .filter(f"dt = '{d}'")\n       .write.mode("overwrite").parquet(f"s3://out/dt={d}"))`, a:3, e:"The loop calls write three times: three jobs, each reading one day thanks to partition pruning."}
  ];
  let i = 0, score = 0, picked = null;
  const draw = () => {
    if (i >= R.length){ el.innerHTML = `<div class="lab-result"><p class="big">${score} / ${R.length}</p><p>${score >= 4 ? "You read code like the Spark scheduler." : "Count the actions, then ask: is anything cached?"}</p><button class="btn" data-a="again">Play again</button></div>`; if (score >= 4) ctx.win(); return; }
    const r = R[i];
    el.innerHTML = `<div class="game-top"><span>Snippet ${i+1} of ${R.length}</span><span>Score ${score}</span></div><pre><code>${esc(r.code)}</code></pre>
      <p class="lab-q">How many Spark jobs does this run?</p><div class="opts four">${[0,1,2,3].map(k => `<button class="opt${picked != null ? (k === r.a ? " good" : k === picked ? " bad" : "") : ""}" data-k="${k}" ${picked != null ? "disabled" : ""}>${k}</button>`).join("")}</div>
      ${picked != null ? `<p class="lab-note ${picked === r.a ? "good" : ""}"><b>${picked === r.a ? "Correct." : "Not quite."}</b> ${esc(r.e)}</p><div class="lab-actions"><button class="btn solid" data-a="next">${i === R.length - 1 ? "See score" : "Next snippet →"}</button></div>` : ""}`;
  };
  el.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.a === "again"){ i = 0; score = 0; picked = null; draw(); return; }
    if (b.dataset.a === "next"){ i++; picked = null; draw(); return; }
    if (b.dataset.k != null && picked == null){ picked = +b.dataset.k; if (picked === R[i].a) score++; draw(); }
  });
  draw();
};

LABS.partitionPlanner = (el, ctx) => {
  const TOTAL = 500 * 1024; // MB
  const s = {fileKB:250, partMB:128, cores:200};
  el.innerHTML = `<p class="lab-q">500 GB of payments. Choose how the files are laid out and how Spark packs them.</p>
    <p class="lab-lbl">File size on S3</p><div class="seg seg4">${[[250,"250 KB"],[8192,"8 MB"],[131072,"128 MB"],[524288,"512 MB"]].map(([v, l]) => `<button data-f="${v}" role="radio">${l}<small>${v < 1024 ? "as written today" : v >= 131072 ? "compacted" : "partly"}</small></button>`).join("")}</div>
    <div class="slider-row"><label for="ppPart">maxPartitionBytes <b id="ppPartV"></b></label><input id="ppPart" type="range" min="0" max="5" step="1" value="2"></div>
    <div class="slider-row"><label for="ppCores">Cluster cores <b id="ppCoresV"></b></label><input id="ppCores" type="range" min="50" max="400" step="50" value="200"></div>
    <div id="ppOut"></div>`;
  const PARTS = [32, 64, 128, 256, 512, 1024];
  const draw = () => {
    const files = Math.round(TOTAL * 1024 / s.fileKB), fileMB = s.fileKB / 1024;
    const tasks = Math.ceil((TOTAL + files * Math.min(4, fileMB < 4 ? 4 : 0)) / s.partMB);
    const waves = Math.ceil(tasks / s.cores), taskMB = TOTAL / tasks;
    const openSec = files * 0.02 / s.cores;              // 20 ms to open each file, spread across cores
    const taskSec = 0.8 + taskMB / 60;                    // scheduling overhead + 60 MB/s per core
    const total = openSec + waves * taskSec;
    el.querySelectorAll("[data-f]").forEach(b => b.setAttribute("aria-checked", +b.dataset.f === s.fileKB));
    el.querySelector("#ppPartV").textContent = s.partMB >= 1024 ? "1 GB" : s.partMB + " MB"; el.querySelector("#ppCoresV").textContent = s.cores;
    const cells = Math.min(240, tasks), shown = Array.from({length:cells}, (_, k) => k % Math.max(1, Math.min(waves, 8)));
    el.querySelector("#ppOut").innerHTML = `<div class="lat-grid four"><div><small>Files</small><b>${files.toLocaleString()}</b></div><div><small>Tasks</small><b>${tasks.toLocaleString()}</b></div><div><small>Waves</small><b>${waves.toLocaleString()}</b></div><div class="${total < 90 ? "good" : "bad"}"><small>Stage time</small><b>${fmtT(total)}</b></div></div>
      <div class="waves">${shown.map((w, k) => `<i style="--w:${w}; --d:${k}"></i>`).join("")}${tasks > cells ? `<span>+${(tasks - cells).toLocaleString()} more</span>` : ""}</div>
      <div class="stack-bar"><span class="sb-open" style="width:${openSec / total * 100}%">opening files ${fmtT(openSec)}</span><span class="sb-work" style="width:${waves * taskSec / total * 100}%">processing ${fmtT(waves * taskSec)}</span></div>
      <p class="lab-note ${total < 90 ? "good" : ""}">${total < 90 ? "<b>Fast read.</b> Files are big enough that opening them is negligible, and tasks are a healthy size." : openSec > waves * taskSec ? "Most of the time goes into opening files, not reading data. Change the layout, not just the reader." : taskMB < 48 ? "Tasks are tiny: scheduling overhead dominates. Pack more bytes per partition." : "Tasks are big but there are many waves. More cores or larger partitions?"} Each task reads about ${taskMB >= 1024 ? (taskMB / 1024).toFixed(1) + " GB" : Math.round(taskMB) + " MB"}.</p>`;
    if (total < 90) ctx.win();
  };
  el.addEventListener("click", e => { const b = e.target.closest("[data-f]"); if (b){ s.fileKB = +b.dataset.f; draw(); } });
  el.addEventListener("input", e => { if (e.target.id === "ppPart") s.partMB = PARTS[+e.target.value]; if (e.target.id === "ppCores") s.cores = +e.target.value; draw(); });
  draw();
};

LABS.stageCutter = (el, ctx) => {
  const P = [
    {ops:["read payments", "filter status = SUCCESS", "withColumn day", "groupBy merchant, day", "agg sum(amount)", "write"], wide:[3]},
    {ops:["read payments", "select columns", "join merchants (both large)", "filter country = IN", "orderBy amount desc", "write ranked report"], wide:[2, 4]}
  ];
  let pi = 0, marks = new Set(), checked = false, solved = 0;
  const draw = () => {
    if (pi >= P.length){ el.innerHTML = `<div class="lab-result"><p class="big">${solved} / 2</p><p>${solved === 2 ? "Every shuffle found. That's how you read a Spark UI." : "Look for operations that need rows from many partitions."}</p><button class="btn" data-a="again">Try again</button></div>`; if (solved === 2) ctx.win(); return; }
    const p = P[pi], correct = checked && p.wide.length === marks.size && p.wide.every(w => marks.has(w));
    let stage = 1;
    el.innerHTML = `<div class="game-top"><span>Pipeline ${pi+1} of 2</span><span>Solved ${solved}</span></div><p class="lab-q">Tap the operations that start a new stage (they cause a shuffle).</p>
      <ol class="ops">${p.ops.map((o, k) => { if (marks.has(k) && k) stage++; const cls = checked ? (p.wide.includes(k) === marks.has(k) ? (marks.has(k) ? "ok cut" : "") : "no" + (marks.has(k) ? " cut" : "")) : (marks.has(k) ? "cut" : ""); return `<li class="${cls}">${marks.has(k) ? `<span class="cut-line">Stage ${stage} starts · shuffle</span>` : ""}<button class="op-b" data-k="${k}" ${k === 0 || checked ? "disabled" : ""}><span class="op-n">${k+1}</span>${esc(o)}</button></li>`; }).join("")}</ol>
      <p class="lab-note">Stages so far: <b>${marks.size + 1}</b></p>
      <div class="lab-actions">${checked ? `<button class="btn solid" data-a="next">${pi === P.length - 1 ? "See result" : "Next pipeline →"}</button>` : `<button class="btn solid" data-a="check">Check</button>`}</div>
      ${checked ? `<p class="lab-note ${correct ? "good" : ""}"><b>${correct ? "Exactly right." : "Not quite."}</b> ${pi === 0 ? "Only the groupBy needs all rows of a merchant-day together. Filter and withColumn run inside the first stage." : "The join of two large tables shuffles both sides, and a global orderBy shuffles again with range partitioning. The filter and the write stay in place."}</p>` : ""}`;
    if (checked && correct && !el.dataset["s" + pi]){ el.dataset["s" + pi] = 1; solved++; }
  };
  el.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.a === "again"){ pi = 0; marks = new Set(); checked = false; solved = 0; delete el.dataset.s0; delete el.dataset.s1; draw(); return; }
    if (b.dataset.a === "check"){ checked = true; draw(); return; }
    if (b.dataset.a === "next"){ pi++; marks = new Set(); checked = false; draw(); return; }
    if (b.dataset.k != null){ const k = +b.dataset.k; marks.has(k) ? marks.delete(k) : marks.add(k); draw(); }
  });
  draw();
};

LABS.shuffleSim = (el, ctx) => {
  const DATA = 1024 * 1024; // MB (1 TB)
  const MAPS = [1000, 2000, 4000, 8000], REDS = [200, 1000, 2000, 4000, 8000, 20000];
  const s = {m:2, r:0, push:false};
  el.innerHTML = `<p class="lab-q">1 TB is shuffled from the map stage to the join stage.</p>
    <div class="slider-row"><label for="shM">Map tasks <b id="shMV"></b></label><input id="shM" type="range" min="0" max="3" step="1" value="2"></div>
    <div class="slider-row"><label for="shR">spark.sql.shuffle.partitions <b id="shRV"></b></label><input id="shR" type="range" min="0" max="5" step="1" value="0"></div>
    <div class="toggles"><label><input type="checkbox" id="shPush"> Push-based shuffle <small>(blocks are merged per reducer on shuffle servers)</small></label></div>
    <div id="shOut"></div>`;
  const draw = () => {
    const M = MAPS[s.m], R = REDS[s.r], blocks = M * R, blockKB = DATA * 1024 / blocks, redMB = DATA / R;
    const tinyBlocks = blockKB < 1024 && !s.push, okRed = redMB >= 100 && redMB <= 300, win = okRed && !tinyBlocks;
    el.querySelector("#shMV").textContent = M.toLocaleString(); el.querySelector("#shRV").textContent = R.toLocaleString();
    const gm = 12, gr = 18;
    el.querySelector("#shOut").innerHTML = `<div class="mxr"><div class="mxr-grid" style="--c:${gr}">${Array.from({length:gm * gr}, (_, k) => `<i class="${tinyBlocks ? "tiny" : ""}" style="--d:${k % 37}"></i>`).join("")}</div><p class="muted">Each square is one block from a map task (row) to a reducer (column). Real count: <b>${blocks.toLocaleString()}</b></p></div>
      <div class="lat-grid four"><div class="${tinyBlocks ? "bad" : "good"}"><small>Avg block</small><b>${blockKB >= 1024 ? (blockKB / 1024).toFixed(1) + " MB" : Math.round(blockKB) + " KB"}</b></div><div><small>Blocks</small><b>${blocks >= 1e6 ? (blocks / 1e6).toFixed(1) + " M" : blocks.toLocaleString()}</b></div><div class="${okRed ? "good" : "bad"}"><small>Per reducer</small><b>${redMB >= 1024 ? (redMB / 1024).toFixed(1) + " GB" : Math.round(redMB) + " MB"}</b></div><div><small>Push-based</small><b>${s.push ? "on" : "off"}</b></div></div>
      <p class="lab-note ${win ? "good" : ""}">${win ? "<b>Healthy shuffle.</b> Reducers get a few hundred MB each and blocks are big enough to fetch efficiently." : redMB > 300 ? "Reducers hold too much: expect spills and out-of-memory errors. More shuffle partitions." : redMB < 100 ? "Reducer partitions are tiny: overhead and small output files. Fewer shuffle partitions." : "Millions of tiny blocks mean slow random reads and fetch timeouts. Fewer map tasks, or merge blocks with push-based shuffle."}</p>`;
    if (win) ctx.win();
  };
  el.addEventListener("input", e => { if (e.target.id === "shM") s.m = +e.target.value; if (e.target.id === "shR") s.r = +e.target.value; if (e.target.id === "shPush") s.push = e.target.checked; draw(); });
  draw();
};

LABS.joinPicker = (el, ctx) => {
  const ST = ["Broadcast hash", "Sort-merge", "Shuffle hash", "Broadcast nested loop"];
  const R = [
    {t:"payments (2 TB) JOIN merchants (40 MB) ON merchant_id", a:0, e:"The dimension fits easily in memory on every executor, so the 2 TB side is never shuffled."},
    {t:"payments (2 TB) JOIN refunds (900 GB) ON payment_id", a:1, e:"Both sides are huge. Sort-merge shuffles both, sorts and merges, and can spill safely."},
    {t:"payments (2 TB) JOIN fx_rates (5 MB) ON payments.ts BETWEEN rates.valid_from AND rates.valid_to", a:3, e:"A range condition can't use hash or sort-merge. The tiny side is broadcast and compared per row. Fine at 5 MB, dangerous if both are large."},
    {t:"payments (2 TB) JOIN customers (150 GB) ON customer_id, with ~10 GB per side after filtering and plenty of executor memory", a:2, e:"Both sides are shuffled, but each partition of the smaller side is small enough to hash in memory, so Spark can skip sorting. Sort-merge would also work, just slower."},
    {t:"orders (300 GB) JOIN order_items (1.2 TB) ON order_id, both bucketed by order_id into 512 buckets", a:1, e:"Matching bucketing lets a sort-merge join skip the shuffle entirely: each bucket joins with its partner."}
  ];
  let i = 0, score = 0, picked = null;
  const draw = () => {
    if (i >= R.length){ el.innerHTML = `<div class="lab-result"><p class="big">${score} / 5</p><p>${score >= 4 ? "You'd make a good query optimiser." : "Ask: is one side small? Is the condition an equality? How big is each side per partition?"}</p><button class="btn" data-a="again">Play again</button></div>`; if (score >= 4) ctx.win(); return; }
    const r = R[i];
    el.innerHTML = `<div class="game-top"><span>Join ${i+1} of 5</span><span>Score ${score}</span></div><p class="scenario">${esc(r.t)}</p>
      <div class="opts">${ST.map((o, k) => `<button class="opt${picked != null ? (k === r.a ? " good" : k === picked ? " bad" : "") : ""}" data-k="${k}" ${picked != null ? "disabled" : ""}>${o}</button>`).join("")}</div>
      ${picked != null ? `<p class="lab-note ${picked === r.a ? "good" : ""}"><b>${picked === r.a ? "Right." : "Better: " + ST[r.a] + "."}</b> ${esc(r.e)}</p><div class="lab-actions"><button class="btn solid" data-a="next">${i === 4 ? "See score" : "Next join →"}</button></div>` : ""}`;
  };
  el.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.a === "again"){ i = 0; score = 0; picked = null; draw(); return; }
    if (b.dataset.a === "next"){ i++; picked = null; draw(); return; }
    if (b.dataset.k != null && picked == null){ picked = +b.dataset.k; if (picked === R[i].a) score++; draw(); }
  });
  draw();
};

LABS.skewFix = (el, ctx) => {
  const s = {nulls:false, aqe:false, salt:1};
  el.innerHTML = `<p class="lab-q">16 reduce partitions after the join shuffle. Merchant M42 has 40% of rows; 10% of rows have a NULL merchant_id.</p>
    <div class="toggles"><label><input type="checkbox" id="skN"> Filter NULL merchant_id before the join <small>(they can never match)</small></label><label><input type="checkbox" id="skA"> AQE skew join <small>(splits oversized partitions into up to 4 pieces)</small></label></div>
    <div class="slider-row"><label for="skS">Salt factor for M42 <b id="skSV">1</b></label><input id="skS" type="range" min="0" max="5" step="1" value="0"></div>
    <div id="skOut"></div>`;
  const SALTS = [1, 2, 4, 8, 16, 32];
  const draw = () => {
    // base rows per partition (units), partition 0 has NULLs, partition 7 has M42
    let parts = Array.from({length:16}, () => 3.1);
    if (!s.nulls) parts[0] += 10;
    const hot = 40, salt = s.salt;
    if (salt > 1){ const share = hot / salt; for (let k = 0; k < salt; k++) parts[(7 + k * 5) % 16] += share; } else parts[7] += hot;
    if (s.aqe){ const med0 = [...parts].sort((a, b) => a - b)[8]; parts = parts.flatMap(p => p > med0 * 5 ? Array.from({length:4}, () => p / 4) : [p]); }
    const sorted = [...parts].sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)], max = sorted[sorted.length - 1], ratio = max / med;
    const win = ratio <= 2;
    el.querySelector("#skSV").textContent = salt;
    el.querySelector("#skOut").innerHTML = `<div class="skew-bars">${parts.map((p, k) => `<span class="${p === max ? "hot" : ""}" style="height:${p / max * 100}%" title="${p.toFixed(1)}"></span>`).join("")}</div>
      <div class="lat-grid four"><div><small>Tasks</small><b>${parts.length}</b></div><div><small>Median task</small><b>${(med * 12).toFixed(0)} s</b></div><div class="${win ? "good" : "bad"}"><small>Slowest task</small><b>${fmtT(max * 12)}</b></div><div class="${salt > 16 ? "bad" : ""}"><small>Small-side copies</small><b>${salt}×</b></div></div>
      <p class="lab-note ${win ? "good" : ""}">${win ? "<b>Balanced.</b> The stage now finishes close to the median task time." : !s.nulls && parts[0] > med * 2 ? "Partition 0 is swollen with NULL keys that can never match. Start there." : "M42 still lands in one or a few partitions. Spread it out: salting, AQE, or both."} Slowest / median = ${ratio.toFixed(1)}×.</p>`;
    if (win) ctx.win();
  };
  el.addEventListener("input", e => { if (e.target.id === "skN") s.nulls = e.target.checked; if (e.target.id === "skA") s.aqe = e.target.checked; if (e.target.id === "skS") s.salt = SALTS[+e.target.value]; draw(); });
  draw();
};

LABS.memoryTuner = (el, ctx) => {
  const SHUFFLE_GB = 800, NODE_CORES = 32, NODE_MEM = 256, NODES = 10;
  const s = {cores:16, mem:110, overhead:5, parts:2000};
  el.innerHTML = `<p class="lab-q">An aggregation shuffles 800 GB on 10 nodes (32 cores, 256 GB each). Size the executors.</p>
    <div class="slider-row"><label for="mtC">Cores per executor <b id="mtCV"></b></label><input id="mtC" type="range" min="1" max="32" step="1" value="16"></div>
    <div class="slider-row"><label for="mtM">Heap per executor <b id="mtMV"></b></label><input id="mtM" type="range" min="4" max="200" step="2" value="110"></div>
    <div class="slider-row"><label for="mtO">memoryOverhead <b id="mtOV"></b></label><input id="mtO" type="range" min="1" max="20" step="1" value="5"></div>
    <div class="slider-row"><label for="mtP">Shuffle partitions <b id="mtPV"></b></label><input id="mtP" type="range" min="200" max="20000" step="200" value="2000"></div>
    <div id="mtOut"></div>`;
  const draw = () => {
    const perNode = Math.max(1, Math.min(Math.floor((NODE_CORES - 1) / s.cores), Math.floor((NODE_MEM - 8) / (s.mem + s.overhead))));
    const execs = perNode * NODES, cores = execs * s.cores;
    const perTaskMB = (s.mem - 0.3) * 0.6 * 1024 / s.cores, partMB = SHUFFLE_GB * 1024 / s.parts, needMB = partMB * 2.2;
    const spill = needMB > perTaskMB, gc = s.mem > 64, ohRisk = s.overhead < Math.max(0.384, s.mem * 0.1);
    const coresOk = s.cores >= 4 && s.cores <= 5, win = !spill && !gc && !ohRisk && coresOk && cores >= 200;
    [["mtCV", s.cores], ["mtMV", s.mem + " GB"], ["mtOV", s.overhead + " GB"], ["mtPV", s.parts.toLocaleString()]].forEach(([id, v]) => el.querySelector("#" + id).textContent = v);
    el.querySelector("#mtOut").innerHTML = `<div class="mem-bar"><span class="mb-ex" style="width:${Math.min(100, perTaskMB / Math.max(perTaskMB, needMB) * 100)}%">memory per task ${Math.round(perTaskMB)} MB</span></div><div class="mem-bar need"><span style="width:${Math.min(100, needMB / Math.max(perTaskMB, needMB) * 100)}%" class="${spill ? "over" : ""}">a partition needs ~${Math.round(needMB)} MB in memory</span></div>
      <div class="lat-grid four"><div><small>Executors</small><b>${execs}</b></div><div class="${cores >= 200 ? "" : "bad"}"><small>Total cores</small><b>${cores}</b></div><div class="${spill ? "bad" : "good"}"><small>Spill</small><b>${spill ? "yes" : "none"}</b></div><div class="${gc || ohRisk ? "bad" : "good"}"><small>Memory risk</small><b>${gc ? "GC pauses" : ohRisk ? "overhead" : "low"}</b></div></div>
      <p class="lab-note ${win ? "good" : ""}">${win ? "<b>Well sized.</b> Tasks fit in memory, executors are a sensible size, and overhead covers off-heap use." : !coresOk ? "Aim for 4-5 cores per executor." : gc ? "Heaps above ~64 GB bring long garbage-collection pauses. Use more, smaller executors." : ohRisk ? "Overhead below ~10% of heap risks containers being killed (worse with PySpark)." : spill ? "Each task's share of memory is smaller than its partition needs. More partitions, or more memory per core." : "Use enough executors to keep at least 200 cores busy."}</p>`;
    if (win) ctx.win();
  };
  el.addEventListener("input", e => { const v = +e.target.value; if (e.target.id === "mtC") s.cores = v; if (e.target.id === "mtM") s.mem = v; if (e.target.id === "mtO") s.overhead = v; if (e.target.id === "mtP") s.parts = v; draw(); });
  draw();
};

LABS.sparkRescue = (el, ctx) => {
  const F = [
    {id:"compact", n:"Compact input files to 512 MB", d:"One-off rewrite; future reads are fast"},
    {id:"prune", n:"Filter to yesterday early", d:"Partition pruning before the join"},
    {id:"bcast", n:"Broadcast the merchants table", d:"60 MB dimension, no big-side shuffle"},
    {id:"aqe", n:"Enable AQE + skew join", d:"Coalesce partitions, split M42"},
    {id:"parts", n:"Set shuffle partitions to 4,000", d:"From the default 200"},
    {id:"cache", n:"Cache the joined DataFrame", d:"It is used by one action only"},
    {id:"outrep", n:"Repartition output by day", d:"Before writing the mart"},
    {id:"bigger", n:"Double the cluster", d:"Twice the cost every night"}
  ];
  const on = new Set();
  el.innerHTML = `<div class="def-grid">${F.map(f => `<button class="def" data-f="${f.id}" aria-pressed="false"><b>${f.n}</b><small>${f.d}</small></button>`).join("")}</div>
    <div class="lab-actions"><button class="btn solid" data-a="run">Run the job</button></div><div id="srOut"></div>`;
  const run = () => {
    const k = x => on.has(x), speed = k("bigger") ? 2 : 1;
    let read = k("compact") ? 4 : 38; if (k("prune")) read *= 0.12;
    let join = k("bcast") ? 6 : 70; if (k("prune")) join *= 0.15; if (!k("bcast") && !k("parts") && !k("aqe")) join *= 1.3;
    let agg = 95; if (k("aqe")) agg = 14; if (k("parts")) agg *= k("aqe") ? 1 : 0.8; if (k("prune")) agg *= 0.2;
    let write = k("outrep") ? 3 : 27; if (k("cache")) write += 9;
    const st = [["Read", read], ["Join", join], ["Aggregate", agg], ["Write", write]].map(([n, m]) => [n, m / speed]);
    const total = st.reduce((a, x) => a + x[1], 0), files = k("outrep") ? 120 : (k("aqe") ? 2400 : 24000);
    const win = total <= 45 && files <= 300, max = Math.max(...st.map(x => x[1]));
    el.querySelector("#srOut").innerHTML = `<div class="stage-bars">${st.map(([n, m]) => `<div class="stb"><span class="stb-n">${n}</span><span class="stb-t"><span class="stb-f${m === max ? " worst" : ""}" style="width:${m / max * 100}%"></span></span><span class="stb-v">${m.toFixed(1)} min</span></div>`).join("")}</div>
      <div class="lat-grid four"><div class="${total <= 45 ? "good" : "bad"}"><small>Job time</small><b>${total >= 60 ? Math.floor(total / 60) + " h " + Math.round(total % 60) + " min" : Math.round(total) + " min"}</b></div><div class="${files <= 300 ? "good" : "bad"}"><small>Output files</small><b>${files.toLocaleString()}</b></div><div class="${k("bigger") ? "bad" : "good"}"><small>Cluster cost</small><b>${k("bigger") ? "2×" : "1×"}</b></div><div><small>Fixes used</small><b>${on.size}</b></div></div>
      <p class="lab-note ${win ? "good" : ""}">${win ? `<b>Deadline met${k("bigger") ? ", but at double the cost" : " without a bigger cluster"}.</b> ${k("cache") ? "Caching a DataFrame used once only added memory pressure and time." : "Layout, pruning, the right join and skew handling did the work."}` : `The slowest stage is <b>${st.find(x => x[1] === max)[0]}</b>. Fix that one next.${files > 300 ? " The mart is still written as thousands of tiny files." : ""}`}</p>`;
    if (win) ctx.win();
  };
  el.addEventListener("click", e => {
    const d = e.target.closest("[data-f]");
    if (d){ const id = d.dataset.f; on.has(id) ? on.delete(id) : on.add(id); d.setAttribute("aria-pressed", on.has(id)); return; }
    if (e.target.closest("[data-a=run]")) run();
  });
};
})();
