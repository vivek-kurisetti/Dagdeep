QUEST.deep("spark", {
"DataFrames are recipes": {
d: `A DataFrame is a description of work, not a pile of rows. Every transformation («filter», «select», «withColumn», «join») returns a **new** DataFrame whose plan has one more node. Nothing touches storage until an **action** («count», «collect», «write», «show») asks for a result.

That laziness is what lets Spark optimise: by the time an action runs, Spark sees the *whole* recipe at once, so it can push filters down, drop unused columns and pick join strategies for the full pipeline instead of step by step.

The flip side: every action re-runs the recipe from the source unless you «cache()» it. Two «count()» calls on the same DataFrame read S3 twice.`,
life: `A recipe card for biryani doesn't cook anything. Only when a guest orders (the action) does the kitchen read the full card, notice it can marinate and boil rice in parallel, and start cooking.`,
work: `A nightly job built «df = spark.read.parquet(txns)» and then called «df.count()» for logging, «df.filter(...).write(...)» for output and «df.groupBy(...).count().show()» for a sanity check. The Spark UI showed **3 jobs, each scanning 1.2 TB**. Adding «df.cache()» before the first action (or removing the debug count) cut runtime from 48 to 19 minutes.`,
ex: `df = spark.read.parquet("s3://lake/txns/")      # nothing read yet
paid = df.filter("status = 'PAID'")             # plan grows
out = paid.groupBy("merchant_id").sum("amount") # plan grows
out.explain()      # still nothing read
out.write.parquet("s3://out/")                  # ACTION: now Spark runs`,
pit: [`Calling «count()» or «show()» just to debug in production: each is a full job.`, `Thinking «cache()» runs immediately. It's lazy too; it fills on the next action.`, `Looping in Python and calling an action per iteration, creating hundreds of jobs.`],
q: [`You call «df.filter(...)» 10 times then «df.write». How many jobs scan the source?`, `One. The filters only extend the plan; the single write action runs the combined plan once.`]
},
"Catalyst rewrites your plan": {
d: `Catalyst turns your code into an execution plan in four phases: **analysis** (resolve column names and types against the catalog), **logical optimisation** (rule-based rewrites), **physical planning** (choose join algorithms, exchanges) and **code generation**.

The big logical rules: **predicate pushdown** moves «WHERE» conditions into the file scan so Parquet row groups and partitions get skipped; **column pruning** reads only the columns used downstream; **constant folding** computes «1+1» once; **filter combining** and **projection collapsing** merge adjacent steps.

Catalyst can only optimise what it understands. A Python UDF is a black box: a filter on its output can't be pushed into the scan.`,
life: `You ask a travel agent for "a flight to Delhi, then filter to morning ones under ₹6000". A good agent doesn't fetch every flight first; they send the morning and price filter straight to the airline search. That's pushdown.`,
work: `An analyst wrote «spark.read.parquet(events).select("*")» then filtered «dt = '2026-11-01'» three steps later. Catalyst still pushed the date filter into the scan as a **PartitionFilter**, so only 1 of 400 partitions was read. When the same filter was written inside a Python UDF, the plan read all 400.`,
ex: `df = (spark.read.parquet("s3://lake/events")
        .withColumn("x", col("a") + 1)
        .filter(col("dt") == "2026-11-01")
        .select("user_id", "x"))
df.explain(True)
# Optimized Logical Plan shows the filter moved down to the Relation
# and ReadSchema: struct<user_id, a> (only 2 columns read)`,
pit: [`Wrapping filter logic in a UDF and losing pushdown.`, `Casting the partition column («cast(dt as date) = ...») which can block partition pruning.`, `Assuming «select *» early costs nothing: it doesn't if pruned later, but UDFs or «collect» can force all columns.`],
q: [`Why does a filter on a Python UDF result often read the whole table?`, `Catalyst can't see inside the UDF, so it can't turn the condition into a scan filter; all rows must be read and passed to Python first.`]
},
"Read explain() like a pro": {
d: `«df.explain("formatted")» prints the physical plan as numbered operators plus details. Read it **bottom up**: the scan is at the bottom, the final operator at the top.

Checklist when reading a plan:
- **Scan**: «PushedFilters» and «PartitionFilters» show what was pushed down. «ReadSchema» should list only needed columns.
- **Exchange**: each one is a shuffle. Count them; every one is network + disk.
- **Join type**: «BroadcastHashJoin» vs «SortMergeJoin». Unexpected SMJ on a small dim table = stats problem.
- **WholeStageCodegen (*n)**: operators with the same star number are fused into one generated function.
- **AdaptiveSparkPlan isFinalPlan=false**: AQE may still change it; check the SQL tab after the run for the final plan.`,
life: `Like reading a train route map backwards from your destination: you see which stations (operators) you pass and where you have to change trains (exchanges), which is where time gets lost.`,
work: `A dashboard query took 9 minutes. «explain» showed «SortMergeJoin» against a 40 MB «merchants» table with «Exchange hashpartitioning» on the 2 TB fact side. Stats said merchants was 12 GB (stale). After «ANALYZE TABLE merchants COMPUTE STATISTICS», the plan flipped to «BroadcastHashJoin», one exchange disappeared, and the query took 70 seconds.`,
ex: `== Physical Plan ==
* HashAggregate (5)
+- Exchange hashpartitioning(merchant_id, 200)   <- shuffle
   +- * HashAggregate (3)                        <- partial agg
      +- * BroadcastHashJoin Inner (2)
         :- * Scan parquet txns (1)
         :     PartitionFilters: [isnotnull(dt), (dt = 2026-11-01)]
         :     PushedFilters: [EqualTo(status,PAID)]
         +- BroadcastExchange                      <- small side copied`,
pit: [`Reading only the top of the plan and missing the scan details.`, `Trusting the pre-run plan when AQE is on; the final plan can differ.`, `Ignoring «ReadSchema»: 300 columns read when you need 4.`],
q: [`You see two «Exchange» nodes for one groupBy + join. What does each cost?`, `Each is a full shuffle: map tasks write partitioned files to local disk, reducers fetch them over the network. Removing one (e.g. via broadcast) often halves the runtime.`]
},
"One partition = one task": {
d: `A **stage** runs one **task per partition**. A task is single-threaded and runs on one executor core. If you have 1,000 partitions and 100 cores, the stage runs in about **10 waves**.

This makes partition count the main dial for parallelism:
- Too few partitions: cores sit idle and each task is huge (risk of spill / OOM).
- Too many: scheduling overhead (~ms per task), tiny files on write, more shuffle blocks.

The stage finishes only when its **slowest task** finishes, so one oversized partition (skew) holds up the whole stage.`,
life: `200 parcels and 20 delivery riders. Each rider takes one parcel at a time, so it takes 10 rounds. If one parcel is a fridge, everyone else is done and waiting for that single rider.`,
work: `A job read a 3 GB gzip CSV. Gzip isn't splittable, so it became **1 partition = 1 task** on a 64-core cluster: 63 cores idle for 25 minutes. Converting the input to Parquet (splittable) gave 24 tasks and the stage dropped to 90 seconds. Alternative quick fix: «repartition(64)» right after the read.`,
ex: `df = spark.read.parquet("s3://lake/orders/")
print(df.rdd.getNumPartitions())   # e.g. 480
cores = sc.defaultParallelism       # e.g. 96
print("waves ≈", 480 / 96)          # 5 waves
df.repartition(192)                 # full shuffle into 192 partitions
df.coalesce(48)                     # merge without shuffle (only reduces)`,
pit: [`Using «coalesce(1)» to write one file on a big dataset: the whole last stage runs on one core.`, `Reading unsplittable gzip files and wondering why only one task runs.`, `Setting thousands of partitions for a few GB of data.`],
q: [`Stage has 401 tasks on 100 cores, each ~1 min. Roughly how long does it take?`, `5 waves (4 full + 1 task), so about 5 minutes; the last wave wastes 99 cores. 400 or 500 partitions would be a better fit.`]
},
"How Spark sizes input splits": {
d: `For file sources Spark computes a target split size:

«maxSplitBytes = min(maxPartitionBytes, max(openCostInBytes, totalBytes ÷ defaultParallelism))»

Defaults: «spark.sql.files.maxPartitionBytes» = 128 MB, «openCostInBytes» = 4 MB. Each file is "charged" an extra 4 MB to model the cost of opening it. Large files are cut into splits of maxSplitBytes; small files are **packed** together into one partition until it's full.

So a small input on a big cluster gets *smaller* splits (to use all cores), while a big input caps at 128 MB per task.`,
life: `Packing boxes into a van: big items are cut into van-sized loads, small items are bundled, but each item also takes some "handling time" no matter how tiny (the open cost).`,
work: `A 12 GB table on a 200-core cluster: 12 GB ÷ 200 = 60 MB, so splits were 60 MB and the read had ~200 tasks (one wave). On a 20-core cluster the same table used 128 MB splits: ~96 tasks in 5 waves. Raising maxPartitionBytes to 256 MB for a wide but simple scan halved task count and scheduling overhead.`,
ex: `spark.conf.set("spark.sql.files.maxPartitionBytes", "256m")
spark.conf.set("spark.sql.files.openCostInBytes", "8m")  # pack small files harder
df = spark.read.parquet("s3://lake/clicks/")
df.rdd.getNumPartitions()`,
pit: [`Expecting one task per file: small files are packed, big files are split.`, `Raising maxPartitionBytes too high and causing spill in memory-heavy downstream ops.`, `Forgetting that Parquet splits also align to row groups; a single 1 GB row group can't be split.`],
q: [`Why do 10,000 × 100 KB files not produce 10,000 tasks?`, `Spark packs small files into partitions up to maxSplitBytes, charging 4 MB open cost per file, so you get far fewer tasks (but still slow listing and opening).`]
},
"Why small files hurt": {
d: `Each file costs work that has nothing to do with its size: a **LIST** entry, an **open/GET** request, reading the Parquet **footer**, and a metadata entry in the table format (Hive metastore, Iceberg manifest). With millions of files, that fixed cost dominates.

Symptoms: the driver spends minutes "listing" before any task starts, S3 returns **503 Slow Down**, the Iceberg/Delta metadata balloons, and queries open thousands of files to read a few MB each. Parquet compression and column statistics also work worse on tiny files.

Causes: streaming micro-batches writing every few seconds, «partitionBy» on a high-cardinality column, too many shuffle partitions at write time.`,
life: `Reading 1,000 one-page letters vs one 1,000-page book. The words are the same, but opening 1,000 envelopes takes far longer than reading.`,
work: `A Kafka → S3 streaming job wrote every 30 s with 200 shuffle partitions, partitioned by hour: **200 files per batch, 576k files per day**, averaging 300 KB. Daily queries took 14 minutes, mostly planning. Fix: 5-minute trigger, «coalesce» to 8 before write, plus a nightly compaction to ~256 MB files. Query time dropped to 50 s.`,
ex: `# Before writing: aim for ~128-512 MB files
(df.repartition(16, "dt")          # group rows per partition value
   .write.partitionBy("dt")
   .option("maxRecordsPerFile", 5_000_000)
   .parquet("s3://lake/events/"))

-- Iceberg compaction
CALL system.rewrite_data_files(table => 'db.events',
  options => map('target-file-size-bytes','268435456'));`,
pit: [`«partitionBy("user_id")» creating millions of folders.`, `Leaving «spark.sql.shuffle.partitions = 200» for a 50 MB output, producing 200 tiny files.`, `Never compacting streaming tables.`],
q: [`Streaming job writes 300 KB files. Name two fixes.`, `Write less often / fewer partitions per batch (longer trigger, coalesce before write) and run periodic compaction (rewrite_data_files / OPTIMIZE) to ~256 MB files.`]
},
"Narrow vs wide": {
d: `A **narrow** dependency means each output partition depends on **one** input partition: «filter», «select», «withColumn», «map», «union». These run back to back inside one task, row by row, no network.

A **wide** dependency means an output partition needs rows from **many** input partitions: «groupBy», «join» (non-broadcast), «distinct», «orderBy», «repartition». Spark must **shuffle**: write rows to local disk grouped by target partition, then reducers fetch their piece from every mapper.

Wide operations are where time, memory and failures concentrate. Reducing the number of shuffles and the bytes shuffled is the core of Spark tuning.`,
life: `Narrow: each cashier counts the money in their own till. Wide: to total sales by product, every cashier must send slips for each product to the person responsible for that product, so slips cross the store.`,
work: `A pipeline did «distinct()» then «groupBy(user).agg(...)» then «orderBy(ts)»: three shuffles of 800 GB. Replacing «distinct» with dedupe inside the aggregation and dropping the unnecessary global sort (the sink didn't need order) removed two shuffles and cut runtime by 60%.`,
ex: `# narrow: one stage, no exchange
df.filter("amount > 0").withColumn("inr", col("amount") * 83)

# wide: introduces Exchange
df.groupBy("merchant_id").agg(sum("amount"))
df.join(other, "id")          # unless broadcast
df.orderBy("ts")              # range partitioning + sort`,
pit: [`Global «orderBy» on huge data when only per-group order is needed.`, `«repartition» before a «groupBy» on the same key: two shuffles where one is enough.`, `Using «distinct()» casually on wide rows.`],
q: [`Is «union» narrow or wide?`, `Narrow. It just concatenates partitions from both inputs; no data moves between executors.`]
},
"Partial aggregation": {
d: `For a «groupBy(k).agg(sum(x))», Spark runs aggregation in **two steps**. Each map task first builds a hash map of «k → partial sum» from its own rows (**partial / map-side aggregation**). Only those partial rows are shuffled. Reducers then **merge** partials into final results.

If 1 billion rows have 10,000 distinct keys across 500 tasks, at most 500 × 10,000 = 5 million rows are shuffled instead of 1 billion.

It works for **algebraic** aggregates (sum, count, min, max, avg as sum+count). It helps little when keys are nearly unique (each task's map has one row per input row) and it can't apply to «collect_list» style aggregates that keep all values.`,
life: `Every branch of a bank totals its own deposits per customer before sending to head office. Head office just adds up a few numbers per branch instead of every receipt.`,
work: `Counting transactions per merchant over 3 billion rows: the plan showed «HashAggregate (partial) → Exchange → HashAggregate (final)». Shuffle write was only **2.1 GB** versus 400 GB input. A similar job using «collect_list(txn_id)» per merchant shuffled 180 GB and spilled, because nothing could be pre-combined.`,
ex: `df.groupBy("merchant_id").agg(count("*"), sum("amount")).explain()
# HashAggregate(keys=[merchant_id], functions=[finalmerge_count, finalmerge_sum])
# +- Exchange hashpartitioning(merchant_id, 200)
#    +- HashAggregate(keys=[merchant_id], functions=[partial_count, partial_sum])`,
pit: [`Using «collect_list» when a sum or count would do.`, `Grouping by near-unique keys and expecting partial aggregation to shrink the shuffle.`, `Using «countDistinct» on many columns: each adds expand/shuffle work; consider «approx_count_distinct».`],
q: [`Why does «groupBy(user_id)» on a table with unique user_ids gain nothing from partial aggregation?`, `Each task sees each key once, so its partial map has as many rows as its input; nothing gets combined before the shuffle.`]
},
"Stage boundaries in the DAG": {
d: `When an action runs, the **DAGScheduler** walks back through the RDD lineage. Narrow dependencies are **pipelined** into the same stage. Every **shuffle dependency** cuts a boundary: the stage before it becomes a **ShuffleMapStage** (writes shuffle files), and the stage after reads them. The final stage producing the action's result is the **ResultStage**.

Stages run when their parents finish. Independent parents (e.g. the two sides of a join) can run in parallel. If a shuffle output is lost (executor died), Spark reruns only the parent map tasks needed, using lineage.

In the UI, «Jobs → Stages» shows this DAG; skipped stages mean the shuffle output was reused.`,
life: `An assembly line with hand-off points. Everything a worker can do alone happens at one station; whenever parts must be sorted and sent to different stations, there's a hand-off (stage boundary), and the next station can't start until the hand-off is complete.`,
work: `A job showed Stage 7 "skipped" on the second action. That was good: the shuffle files from the first action were still on executors and got reused. After enabling dynamic allocation without the shuffle service, executors were removed and the stage re-ran each time, adding 6 minutes. Turning on «spark.dynamicAllocation.shuffleTracking.enabled» fixed it.`,
ex: `orders.join(users, "user_id")        # Stage 1: scan+map orders
      .groupBy("country")            # Stage 2: scan+map users
      .count()                       # Stage 3: join+partial agg
      .collect()                     # Stage 4 (Result): final agg`,
pit: [`Confusing jobs (one per action) with stages (one per shuffle boundary).`, `Assuming a failed task restarts the whole job; Spark reruns only the needed tasks/stages.`, `Ignoring "skipped stages": they show where reuse is saving you time.`],
q: [`A pipeline has 3 shuffles and one write action. How many stages at least?`, `Four: three ShuffleMapStages before each shuffle plus the final ResultStage (more if a join reads two independent inputs).`]
},
"Who gets which row?": {
d: `With **hash partitioning**, each row's target is «pmod(hash(key), numPartitions)». Spark uses Murmur3 hash. Same key, same partition count → same target, always. That's why all rows of a key meet in one reducer for «groupBy» or «join».

Consequences:
- Change the partition count and nearly every key moves to a different partition; two datasets must use the **same** partitioning to join without reshuffle.
- A key with huge volume (null, "unknown", a big merchant) lands entirely in **one** partition: skew.
- **Range partitioning** (used by «orderBy») samples keys to choose boundaries, so partitions hold contiguous key ranges.`,
life: `Post offices sort letters by PIN code. Every letter to 500049 always goes to the same sorting bin. If a mega-mall at that PIN gets 50,000 letters, that one bin overflows while others are empty.`,
work: `A join on «merchant_id» had one task running 40 minutes while 199 finished in 20 s. The skewed key was «merchant_id = NULL» (12% of rows: guest checkouts). Nulls never match in an inner join anyway, so filtering them out before the join fixed the skew entirely.`,
ex: `from pyspark.sql.functions import spark_partition_id, hash, pmod, lit
(df.repartition(8, "merchant_id")
   .withColumn("pid", spark_partition_id())
   .groupBy("pid").count().show())
# same as pmod(hash(merchant_id), 8)`,
pit: [`Joining on nullable keys full of NULLs.`, `Assuming «repartition(n, key)» gives even partitions: it only gives *consistent* placement.`, `Bucketing two tables with different bucket counts and expecting a shuffle-free join.`],
q: [`Why do two tables bucketed by the same key into 64 and 128 buckets still shuffle when joined?`, `Placement depends on numPartitions; with different counts the same key lands in unrelated bucket numbers, so Spark must reshuffle one side.`]
},
"Size shuffle partitions by data": {
d: `«spark.sql.shuffle.partitions» (default **200**) sets how many reducers each shuffle has. It's the same for a 1 GB and a 5 TB shuffle unless you change it, which is why the default is usually wrong.

Rule of thumb: **partitions ≈ shuffle bytes ÷ 128–256 MB**. Find shuffle bytes in the stage's "Shuffle Write" column. Too few → huge tasks that spill to disk or OOM. Too many → thousands of tiny tasks and tiny output files.

With **AQE** («spark.sql.adaptive.enabled», on by default since 3.2), set a generously high initial number and let AQE **coalesce** small partitions after the map stage to «advisoryPartitionSizeInBytes» (64 MB default).`,
life: `Splitting 500 kg of laundry among washing machines. 200 machines for 5 kg wastes effort; 200 machines for 50,000 kg overloads every drum. Size the count by the load.`,
work: `Shuffle write was 1.6 TB with the default 200 partitions: **8 GB per task**, heavy spill, 2 hours. Setting partitions to 8,000 (≈200 MB each) brought it to 25 minutes. On another small daily job (3 GB shuffle), AQE coalesced 200 partitions down to 47 automatically.`,
ex: `spark.conf.set("spark.sql.adaptive.enabled", "true")
spark.conf.set("spark.sql.adaptive.coalescePartitions.enabled", "true")
spark.conf.set("spark.sql.adaptive.advisoryPartitionSizeInBytes", "256m")
spark.conf.set("spark.sql.shuffle.partitions", "4000")  # upper bound, AQE trims`,
pit: [`Leaving 200 for multi-TB jobs.`, `Hard-coding a huge number with AQE off, then writing 4,000 tiny files.`, `Tuning by trial and error instead of reading Shuffle Write bytes in the UI.`],
q: [`A shuffle writes 600 GB. Roughly how many partitions?`, `600 GB ÷ ~200 MB ≈ 3,000 partitions (AQE can trim if some are small).`]
},
"Four join strategies": {
d: `- **Broadcast hash join (BHJ)**: the small side is collected to the driver, broadcast to every executor, and hashed. The big side is streamed with **no shuffle**. Fastest, but the small side must fit in memory (default threshold «autoBroadcastJoinThreshold» = 10 MB, often raised to 100–500 MB).
- **Sort-merge join (SMJ)**: both sides shuffled by key, sorted, then merged. Works at any size and can spill. The default for big-big joins.
- **Shuffle hash join (SHJ)**: both sides shuffled; the smaller side of each partition is hashed in memory. Skips the sort; faster than SMJ when one side is much smaller per partition, but needs memory.
- **Broadcast nested loop / cartesian**: for non-equi joins («a.ts BETWEEN b.start AND b.end»). Can be very slow; avoid on big data.`,
life: `Matching guests to seat numbers. Broadcast: every usher gets a copy of the small seating chart. Sort-merge: sort both guest list and seat list alphabetically and walk them together. Nested loop: check every guest against every seat.`,
work: `Enriching 2 TB of payments with a 300 MB merchant table. SMJ: two shuffles, 34 minutes. With «broadcast(merchants)», no shuffle of payments: 6 minutes. A range join on time windows was running as BNLJ for 3 hours; rewriting it as an equi-join on a bucketed hour key plus a range filter took 12 minutes.`,
ex: `from pyspark.sql.functions import broadcast
pay.join(broadcast(merchants), "merchant_id")
-- SQL hints
SELECT /*+ BROADCAST(m) */ * FROM pay p JOIN merchants m USING (merchant_id);
SELECT /*+ SHUFFLE_HASH(m) */ ...;   SELECT /*+ MERGE(m) */ ...;`,
pit: [`Broadcasting something that's 2 GB after decompression: driver OOM.`, `Non-equi join conditions silently producing nested loop joins.`, `Raising the broadcast threshold globally to 1 GB and crashing unrelated queries.`],
q: [`Why is a broadcast join faster even though data is copied to every executor?`, `Only the small side is copied; the big side never shuffles, avoiding disk writes, network fetch and sort of terabytes.`]
},
"Which side can be broadcast?": {
d: `A broadcast join streams one side and looks up rows in the broadcast hash table. Rows from the **streamed side** that don't match can be emitted (as with null-padding), because each streamed row is seen once. But non-matching rows of the **broadcast side** can't be emitted correctly: each executor only sees part of the streamed side, so it can't know if a broadcast row matched elsewhere.

So:
- Inner: either side can be broadcast.
- Left outer, left semi, left anti: only the **right** side.
- Right outer: only the **left** side.
- Full outer: **neither** (Spark falls back to SMJ/SHJ).`,
life: `A teacher hands each class a copy of the prize list (broadcast) and asks "which of your students won?". Each class can report its students who didn't win (preserved streamed side). But no single class can say which prizes went unclaimed school-wide.`,
work: `A «small_dim LEFT JOIN huge_fact» kept doing a sort-merge join even with a broadcast hint on small_dim. The left side is preserved, so it can't be broadcast. Rewriting as «huge_fact RIGHT JOIN small_dim» didn't help either. The real fix: aggregate the fact to the dim's grain first (1 M rows), then join.`,
ex: `# OK: right side broadcast for left join
fact.join(broadcast(dim), "id", "left")
# Hint ignored: preserved (left) side can't be broadcast
broadcast(dim).join(fact, "id", "left")   # becomes SortMergeJoin`,
pit: [`Expecting a broadcast hint to always win; Spark ignores it when semantics forbid.`, `Using full outer joins on big tables and being surprised by two shuffles.`, `Forgetting anti joins («NOT EXISTS») follow the left-join rule.`],
q: [`Can a «LEFT ANTI JOIN» broadcast the left table?`, `No. Only the right side can be broadcast; the left (preserved) side must be streamed.`]
},
"Bad estimates, bad joins": {
d: `Spark picks join strategies from **estimated sizes**. For files without stats, it estimates from file size on disk; after filters, estimates can be wildly off (compressed Parquet is 3–10× smaller than in memory; a selective filter can cut size by 1000×).

Fixes, in order of preference:
1. Keep catalog stats fresh: «ANALYZE TABLE t COMPUTE STATISTICS [FOR COLUMNS ...]».
2. Let **AQE** convert SMJ to broadcast at runtime once the real size of a filtered side is known («spark.sql.adaptive.autoBroadcastJoinThreshold»).
3. Use a «broadcast()» hint when you *know* a side is small.

The reverse also happens: something estimated as small is actually 4 GB in memory, and the broadcast OOMs the driver.`,
life: `A moving company quotes from your description "small 1BHK". If you actually own a piano and 40 boxes of books, they bring the wrong truck. Up-to-date stats are an accurate inventory.`,
work: `After a backfill tripled the «users» table, the old stats still said 50 MB, Spark broadcast it, and the driver hit «OutOfMemoryError: Not enough memory to build and broadcast the table». Re-running ANALYZE made Spark pick SMJ again; later the team capped «spark.sql.autoBroadcastJoinThreshold» at 200 MB and rely on AQE for dynamic choices.`,
ex: `ANALYZE TABLE db.users COMPUTE STATISTICS;
ANALYZE TABLE db.users COMPUTE STATISTICS FOR COLUMNS country, status;
DESCRIBE EXTENDED db.users;          -- check Statistics: sizeInBytes, rowCount
spark.conf.set("spark.sql.adaptive.autoBroadcastJoinThreshold", "100m")`,
pit: [`Never refreshing stats after big loads.`, `Hinting broadcast on a table that grows over time.`, `Comparing Parquet file size to the broadcast threshold: in-memory size is much larger.`],
q: [`A filtered dimension is 5 MB at runtime but Spark planned SMJ. What feature can fix this without hints?`, `AQE: after the dimension's stage runs, it sees the real 5 MB and converts the SMJ into a broadcast hash join.`]
},
"Spot skew in the UI": {
d: `Skew means a few partitions are far bigger than the rest. Open the slow stage in the Spark UI and look at **Summary Metrics for Completed Tasks**: compare **Median** and **Max** for Duration, Shuffle Read Size and Spill. Max ≫ 75th percentile (10× or more) means skew.

Also check the task table sorted by duration: the slow task's **Shuffle Read Records** confirms it's data, not a slow node. If the same task index is slow on retries on different hosts, it's data skew; if random tasks are slow on one host, it's a node problem.

**Speculation** doesn't help skew: the speculative copy has to read the same giant partition.`,
life: `A checkout counter where one customer has 400 items and everyone else has 3. Opening another counter (speculation) for that same customer doesn't help; you need to split their cart.`,
work: `Stage 14: median task 28 s, max 52 min, max shuffle read 180 GB vs median 210 MB. Grouping the input by join key showed «merchant_id = 'AMZ-IN'» with 31% of rows. Turning on AQE skew join split that partition into 40 pieces and the stage finished in 4 minutes.`,
ex: `# find hot keys
(df.groupBy("merchant_id").count()
   .orderBy(desc("count")).show(10))
# AQE skew handling
spark.conf.set("spark.sql.adaptive.skewJoin.enabled", "true")
spark.conf.set("spark.sql.adaptive.skewJoin.skewedPartitionFactor", "5")
spark.conf.set("spark.sql.adaptive.skewJoin.skewedPartitionThresholdInBytes", "256m")`,
pit: [`Adding more executors to fix skew; the one big task still runs on one core.`, `Raising executor memory only, which hides the problem until data grows.`, `Not checking for NULL or default values as the hot key.`],
q: [`Median 30 s, max 45 min, and the max task has 100× the shuffle read. Node issue or skew?`, `Data skew: the slow task reads far more data. A node issue would show normal read size but slow time.`]
},
"Salting a join": {
d: `When a hot key overloads one reducer, **salting** spreads it out manually:
1. On the big (skewed) side add «salt = floor(rand() * N)».
2. On the other side, **explode** each row into N copies with salt 0..N-1.
3. Join on «(key, salt)». The hot key's rows now go to N different partitions.
4. Drop the salt.

Cost: the small side grows N×. So salt only hot keys (salt = 0 for normal keys, replicate only hot rows on the other side), and choose N from the skew ratio (e.g. hot partition 40 GB, target 1 GB → N ≈ 40).

For aggregations, salt then aggregate twice: first by «(key, salt)», then by «key».`,
life: `One ticket window has a 2-hour queue for "Platform 1". The station opens 10 windows all selling Platform 1 tickets; people are assigned a window by the last digit of their phone number.`,
work: `AQE skew join couldn't help because the skewed side was the **preserved** side of a left join with a UDF before it. Salting the top 5 merchants with N = 32 brought the stage from 70 minutes to 9. The replicated dim side grew from 1 M to only 1.15 M rows because only hot keys were exploded.`,
ex: `N = 32
hot = ["AMZ-IN", "FLIP-IN"]
big = big.withColumn("salt",
    when(col("mid").isin(hot), floor(rand() * N)).otherwise(lit(0)))
small = small.withColumn("salt",
    when(col("mid").isin(hot), explode(sequence(lit(0), lit(N - 1)))).otherwise(lit(0)))
out = big.join(small, ["mid", "salt"]).drop("salt")`,
pit: [`Salting every key and multiplying the small side by N.`, `Using «rand()» without a seed in a job that may retry, giving different salts on retry (fine for joins, risky if you rely on determinism).`, `Forgetting the second aggregation step when salting a groupBy.`],
q: [`Why must the non-skewed side be replicated N times?`, `Each big-side row of a hot key now has a random salt 0..N-1; to find its match, the other side must have that key present for every salt value.`]
},
"Executor memory layout": {
d: `An executor container's size = **heap** («spark.executor.memory») + **overhead** («spark.executor.memoryOverhead», default max(384 MB, 10% of heap)) + optional «spark.executor.pyspark.memory».

Inside the heap:
- **Reserved**: 300 MB for Spark internals.
- **Unified memory** = «spark.memory.fraction» (0.6) × (heap − 300 MB). Shared by **execution** (shuffles, joins, sorts, aggregations) and **storage** (cache, broadcast). Execution can evict cached blocks down to «storageFraction» (0.5).
- **User memory**: the rest (40%), for your objects, UDF data structures, metadata.

**Overhead** is off-heap: JVM metaspace, thread stacks, Netty network buffers, and Python worker processes in PySpark. "Container killed by YARN for exceeding memory limits" is almost always overhead, not heap.`,
life: `A rented flat: the agreement covers the rooms (heap) plus the balcony and parking (overhead). If you park a second car on the balcony, the landlord evicts you even though the rooms are half empty.`,
work: `A PySpark job with pandas UDFs died with «Container killed... 18.2 GB of 18 GB physical memory used». Heap was 16 GB, overhead 2 GB, but the Python workers used 3 GB outside the heap. Reducing heap to 12 GB and setting overhead to 6 GB (same container size) fixed it without asking for more memory.`,
ex: `--conf spark.executor.memory=12g
--conf spark.executor.memoryOverhead=4g        # off-heap + python
--conf spark.executor.cores=5
--conf spark.memory.fraction=0.6
# Unified ≈ 0.6 × (12g − 300m) ≈ 7 GB shared by execution + storage`,
pit: [`Raising heap when YARN kills the container for exceeding limits (needs overhead).`, `Caching big DataFrames that starve joins of execution memory.`, `Ignoring that Arrow / pandas UDF batches live in Python memory.`],
q: [`Exit code 137 / "killed by YARN for exceeding memory limits". Heap or overhead?`, `Usually overhead (off-heap, native, Python). Increase memoryOverhead or reduce heap while keeping the container size.`]
},
"Sizing executors": {
d: `Start from the node: leave **1 core** and **~1–2 GB** for the OS and node daemons. Then:
- **Cores per executor ≈ 4–5**. More cores share one heap, so GC pauses grow and HDFS/S3 client throughput suffers; fewer cores mean broadcasts and caches are duplicated in many small JVMs.
- **Executors per node** = usable cores ÷ cores per executor.
- **Memory per executor** = usable memory ÷ executors per node, then split into heap + overhead (~10–20%, more for PySpark).

Then match **total cores** to the work: shuffle partitions should be a few multiples of total cores so the stage runs in clean waves.`,
life: `Splitting a big kitchen into stations: one chef per burner is chaotic and wastes shared space, one chef for 20 burners can't keep up. Teams of ~5 burners per chef work best.`,
work: `Node: 16 cores, 128 GB (r5.4xlarge). Usable: 15 cores, ~120 GB. 3 executors × 5 cores; 40 GB each → 34 GB heap + 6 GB overhead. On 10 nodes: 30 executors, 150 cores; shuffle partitions set to 600 (4 waves). The old config of 1 executor per node with 15 cores and 110 GB heap had 20-second GC pauses.`,
ex: `spark-submit \\
  --num-executors 30 --executor-cores 5 \\
  --executor-memory 34g --conf spark.executor.memoryOverhead=6g \\
  --conf spark.sql.shuffle.partitions=600 job.py`,
pit: [`One giant executor per node (long GC).`, `1-core executors (every broadcast copied 15× per node).`, `Forgetting YARN/K8s overhead and requesting more than the node has, so executors never start.`],
q: [`Node has 32 cores and 256 GB. Suggest a layout.`, `~31 usable cores → 6 executors × 5 cores; ~240 GB ÷ 6 = 40 GB each → ~34 GB heap + ~6 GB overhead.`]
},
"AQE re-plans between query stages": {
d: `Without AQE, Spark fixes the whole physical plan up front using estimates. With **Adaptive Query Execution**, the plan is cut at each shuffle/broadcast into **query stages**. After a stage finishes, Spark knows the **real** size of every shuffle partition and re-optimises what's left.

Three main runtime rewrites:
- **Coalesce shuffle partitions**: merge small partitions to the advisory size.
- **Switch join strategy**: SMJ → broadcast if one side turned out small (or to shuffled hash join).
- **Skew join**: split oversized partitions and replicate the matching side.

The plan you see before running shows «AdaptiveSparkPlan isFinalPlan=false»; the SQL tab after execution shows the final plan.`,
life: `A GPS that recalculates the route at each junction using live traffic, instead of a route printed the night before.`,
work: `A report filtered a 9 TB table to a single region, then joined to another large table. Static planning chose SMJ on both sides. With AQE, the filtered side measured 80 MB after its stage, so the join became a broadcast and the second 3 TB side never shuffled: 41 min → 11 min.`,
ex: `spark.conf.set("spark.sql.adaptive.enabled", "true")          # default 3.2+
spark.conf.set("spark.sql.adaptive.coalescePartitions.enabled", "true")
spark.conf.set("spark.sql.adaptive.skewJoin.enabled", "true")
spark.conf.set("spark.sql.adaptive.localShuffleReader.enabled", "true")`,
pit: [`Reading the pre-execution plan and assuming that's what ran.`, `Setting shuffle partitions very low with AQE: it can coalesce, but not split non-skewed partitions.`, `Expecting AQE to fix skew on the preserved side of outer joins (it can't split that side).`],
q: [`Why can AQE choose better joins than static planning?`, `It decides after a stage has run, using actual shuffle partition sizes instead of estimates.`]
},
"Dynamic partition pruning": {
d: `Classic star schema: a huge fact table partitioned by «dt», joined to a small date or store dimension with a filter («WHERE d.week = 45»). Static pruning can't help: the filter is on the dimension, not on the fact's partition column.

**DPP** runs the filtered dimension first, collects its join keys, and injects them as a runtime filter («dynamicpruningexpression») into the fact scan, so only matching partitions are listed and read.

Conditions: the fact table is partitioned by the join key; the dimension side is filtered and selective; usually works best when the dim side is broadcast (the broadcast result is reused as the filter).`,
life: `You want all bills from "festival weeks". Instead of opening every month's folder, you first look up which dates were festival weeks, then open only those date folders.`,
work: `«sales» partitioned by «date_key» (1,800 days, 40 TB) joined to «calendar» filtered by «is_diwali_week». Without DPP: 40 TB scanned. With DPP: 7 partitions, 160 GB. The plan showed «PartitionFilters: [dynamicpruningexpression(date_key IN dynamicpruning#..)]».`,
ex: `SELECT s.store_id, sum(s.amount)
FROM sales s JOIN calendar c ON s.date_key = c.date_key
WHERE c.is_diwali_week = true
GROUP BY s.store_id;
-- spark.sql.optimizer.dynamicPartitionPruning.enabled = true (default)`,
pit: [`Joining on a column that isn't the fact's partition column (no pruning possible).`, `Wrapping the join key in a function on the fact side.`, `Assuming DPP works on unpartitioned tables (that's runtime filters/bloom filters, a different feature).`],
q: [`Fact partitioned by «dt», filter on «dim.region = 'south'», join on «store_id». Does DPP prune?`, `No. DPP prunes partitions of the join column; the fact must be partitioned by store_id for this join to prune.`]
},
"Statistics and CBO": {
d: `Spark has two layers of stats:
- **Table-level**: «sizeInBytes», «rowCount». Used for broadcast decisions even without CBO.
- **Column-level** (with «spark.sql.cbo.enabled»): distinct count, null count, min/max, avg/max length, optional **histograms**. Used to estimate filter selectivity and join cardinalities, and to **reorder joins** («spark.sql.cbo.joinReorder.enabled»).

Stats are collected with «ANALYZE TABLE», stored in the metastore, and become stale as data changes. For Delta/Iceberg, file-level min/max are kept in metadata and used for data skipping, but planner stats still need refreshing.`,
life: `A logistics planner deciding routes. Knowing only "the city is big" (table size) helps a bit. Knowing how many deliveries go to each area (column stats) lets them plan the best order of stops.`,
work: `A 6-table join ran in the order written: fact ⋈ big dim ⋈ ... ⋈ tiny filtered dim last, producing a 9 billion row intermediate. With CBO and column stats, Spark joined the selective tiny dim first, cutting the intermediate to 40 M rows: 52 → 8 minutes.`,
ex: `SET spark.sql.cbo.enabled=true;
SET spark.sql.cbo.joinReorder.enabled=true;
ANALYZE TABLE sales COMPUTE STATISTICS FOR COLUMNS store_id, dt;
DESCRIBE EXTENDED sales store_id;   -- distinct_count, min, max, num_nulls`,
pit: [`Enabling CBO without collecting column stats (it has nothing to use).`, `Running ANALYZE once and never again.`, `Relying on join reorder for very many tables (it's limited by «joinReorder.dp.threshold»).`],
q: [`Which stat drives the broadcast decision even with CBO off?`, `Table «sizeInBytes» (estimated size), compared with autoBroadcastJoinThreshold.`]
},
"UnsafeRow layout": {
d: `Tungsten avoids Java objects per row (each with headers, pointers and GC cost). An **UnsafeRow** is one contiguous byte region:
1. **Null bitset**: 1 bit per field, padded to 8-byte words.
2. **Fixed-length region**: 8 bytes per field. Ints, longs, doubles, dates sit here directly.
3. **Variable-length region**: strings, binary, nested structs. The fixed slot stores «(offset << 32) | length» pointing into this region.

Benefits: compact memory, cache-friendly scans, cheap comparison and hashing on raw bytes, and fast serialization for shuffle (bytes are copied as-is).`,
life: `Instead of a filing cabinet where each fact sits in its own folder with a label (Java objects), it's one printed form: tick boxes for "blank" fields at the top, fixed boxes for numbers, and a notes section at the bottom for long text.`,
work: `A job caching a DataFrame of 200 M rows used 14 GB as RDD of Python/Java objects but 3.1 GB as a cached DataFrame (Tungsten columnar/binary format). Switching the pipeline from RDD «map» code to DataFrame expressions also cut GC time from 35% to 4% of task time.`,
ex: `Row (id: long, amount: double, name: string)
[null bits: 8 bytes]
[id: 8 bytes][amount: 8 bytes][name: offset|len 8 bytes]
[variable region: "Vivek" padded to 8 bytes]`,
pit: [`Using RDD APIs with Python objects and losing Tungsten benefits.`, `Very wide rows of strings (lots of variable-region copies).`, `Assuming UDFs operate on UnsafeRow: rows are converted to Java/Python objects for UDFs.`],
q: [`How many bytes does the fixed region use for a row with 10 columns?`, `80 bytes (8 per field), plus the null bitset and any variable-length data.`]
},
"Task memory and spilling": {
d: `Every task gets memory through its **TaskMemoryManager**, which allocates **pages** to **MemoryConsumers** (UnsafeExternalSorter, hash maps for aggregation, etc.). Execution memory is shared fairly: with N running tasks, each can get between 1/2N and 1/N of the execution pool.

When a consumer needs more and the pool is exhausted, Spark asks consumers to **spill**: the sorter writes sorted runs to local disk; aggregation hash maps fall back to sort-based aggregation. Later, spilled runs are merged.

In the UI, **Spill (Memory)** is the in-memory size of spilled data; **Spill (Disk)** is its serialized size on disk. Spill isn't a failure, but heavy spill means repeated disk I/O and slow tasks.`,
life: `A desk too small for all the papers you're sorting. You sort a pile, put it in a drawer, sort the next pile, and at the end merge the drawer piles. It works, just slower than a bigger desk.`,
work: `A «sort + window» stage showed 900 GB spill (disk) for 300 GB shuffle read. Each task read ~1.5 GB with only ~1 GB execution memory per task (5 cores sharing). Doubling shuffle partitions halved per-task input and spill dropped to zero, faster than adding memory.`,
ex: `# Find it: Stage → Summary metrics → Spill (Memory) / Spill (Disk)
spark.conf.set("spark.sql.shuffle.partitions", "4000")     # smaller tasks
# or more memory per task:
--executor-memory 24g --executor-cores 4`,
pit: [`Treating spill as an error and only adding memory.`, `Fat tasks from too few shuffle partitions.`, `Small local disks (spill fills them and executors die with "No space left on device").`],
q: [`Spill appears after raising cores per executor from 4 to 8 with the same memory. Why?`, `More concurrent tasks share the same execution pool, so each task gets less memory and spills sooner.`]
},
"Whole-stage codegen limits": {
d: `Whole-stage codegen fuses a chain of operators (scan → filter → project → partial agg) into **one generated Java method** per stage, avoiding virtual calls and intermediate rows. That's the «*(n)» prefix in plans.

Limits:
- The JVM's JIT won't compile methods over **8,000 bytes of bytecode** («-XX:-DontCompileHugeMethods» aside), so a giant generated method runs **interpreted**, much slower.
- Spark falls back if the method exceeds «spark.sql.codegen.hugeMethodLimit» (64 KB) or if fields exceed «spark.sql.codegen.maxFields» (100).
- Some operators don't support codegen (Python UDFs, some generators), breaking the chain.

So very wide schemas (500+ columns) or huge «CASE WHEN» expressions can be slower than expected.`,
life: `A chef combining 5 small recipe steps into one fluid motion saves time, but trying to memorise a 300-step routine as one motion makes them slower than just following the card.`,
work: `A feature pipeline built 1,200 «withColumn» expressions in one select. Logs showed "Generated method too long to be JIT compiled" and the stage was 3× slower than expected. Splitting it into 4 selects of ~300 columns (and using «select» with a list instead of chained «withColumn») cut CPU time by 60%.`,
ex: `# prefer one select with a list over chained withColumn in a loop
exprs = [ (col(c) * 2).alias(c + "_x2") for c in cols ]
df = df.select("*", *exprs)
# check fallbacks in logs: "Found too long generated codes ... disabled"`,
pit: [`Looping «withColumn» hundreds of times (also slows analysis).`, `Assuming codegen is always on: check for missing «*(n)» markers.`, `Huge nested CASE WHEN maps that should be a lookup join.`],
q: [`Why can a 1,000-column transformation be slower per column than a 50-column one?`, `The generated method gets too large for the JIT to compile, so it runs interpreted, or codegen falls back entirely.`]
},
"How Spark picks a shuffle writer": {
d: `For each shuffle Spark picks one of three writers:
- **BypassMergeSortShuffleWriter**: if there's no map-side aggregation and partitions ≤ «spark.shuffle.sort.bypassMergeThreshold» (200). Writes one temp file per reducer, then concatenates. No sorting; fast for few partitions.
- **UnsafeShuffleWriter** (serialized/tungsten-sort): if the serializer supports relocation (Kryo/UnsafeRow), no map-side aggregation, and partitions < 16,777,216. Sorts **pointers** by partition ID on serialized bytes; very memory efficient.
- **SortShuffleWriter**: the general case, e.g. with map-side combine. Sorts records (deserialized) by partition (and key if needed).

All of them produce **one data file + one index file** per map task. The index tells reducers where their block starts.`,
life: `A post office choosing how to sort outgoing mail: with only a few destinations, drop each letter straight into a destination bag; with thousands, sort envelope labels without opening the letters; with letters that need combining, open and sort fully.`,
work: `A job with 150 shuffle partitions and no aggregation used the bypass writer: 150 open files per task × 5 cores, fine. When someone set partitions to 180 on a cluster with slow disks and 16 cores/executor, 2,880 files were open at once and disk I/O became the bottleneck; lowering the threshold so UnsafeShuffleWriter was used fixed it.`,
ex: `spark.shuffle.sort.bypassMergeThreshold = 200
spark.serializer = org.apache.spark.serializer.KryoSerializer
# Look in executor logs / thread dumps for the writer class names`,
pit: [`Many cores × bypass writer = huge number of open files.`, `Assuming one shuffle file per reducer per map (that was the old hash shuffle).`, `Ignoring local disk speed: shuffle is disk-bound.`],
q: [`What two files does every map task write for a shuffle?`, `A data file with all partitions' bytes concatenated, and an index file of offsets so reducers can find their block.`]
},
"Reduce-side fetching": {
d: `A reducer task must read its block from **every** map output. The **ShuffleBlockFetcherIterator** gets map output locations from the driver's MapOutputTracker, reads local blocks directly from disk, and fetches remote blocks over Netty.

Throttles:
- «spark.reducer.maxSizeInFlight» (48 MB): bytes of outstanding fetch requests.
- «spark.reducer.maxReqsInFlight», «maxBlocksInFlightPerAddress»: limit requests per host.
- Large blocks above «spark.network.maxRemoteBlockSizeFetchToMem» are streamed to disk.

Failures appear as **FetchFailedException** (executor that held the map output died, or timed out). The stage then retries and Spark recomputes the lost map outputs. **External shuffle service** or **push-based shuffle** keeps shuffle files available when executors go away.`,
life: `A teacher collecting one answer sheet from each of 500 students across many classrooms. She can only carry a limited number at once and if a classroom is locked (executor gone), that page has to be rewritten.`,
work: `On spot instances, executors were reclaimed mid-job and reducers threw «FetchFailedException: Failed to connect to ip-10-...». Each loss re-ran the map stage. Enabling node decommissioning («spark.decommission.enabled», «storage.decommission.shuffleBlocks.enabled») migrated shuffle blocks before shutdown, cutting retries from 9 to 1 on average.`,
ex: `spark.shuffle.service.enabled=true          # YARN external shuffle service
spark.reducer.maxSizeInFlight=96m
spark.shuffle.io.maxRetries=10
spark.shuffle.io.retryWait=10s
spark.decommission.enabled=true`,
pit: [`Spot/preemptible nodes without shuffle service or decommissioning.`, `Very large shuffle blocks (skew) causing fetch timeouts.`, `Treating FetchFailed as a code bug; it's usually infra or skew.`],
q: [`Why does losing one executor sometimes re-run an entire earlier stage?`, `Its map outputs (shuffle files) are lost, so every reducer needing them fails to fetch; Spark recomputes those map tasks from lineage.`]
},
"The checkpoint is the source of truth": {
d: `Structured Streaming keeps its progress in the **checkpoint directory**:
- «offsets/N»: written **before** batch N runs; the planned source ranges (Kafka offsets per partition).
- «commits/N»: written **after** batch N finished and the sink commit succeeded.
- «state/»: versioned state store files per operator and partition.
- «sources/», «metadata»: query id and source info.

On restart, Spark finds the latest offsets file; if no matching commit exists, it **re-runs that batch** with the same offsets. With an idempotent or transactional sink (Delta, Iceberg, foreachBatch with MERGE / batch id), that gives **exactly-once** results. Kafka committed consumer-group offsets are NOT used for recovery.`,
life: `A diary with "planned today: pages 40–60" written in the morning and "done" ticked at night. After a crash you check: planned but not ticked → redo pages 40–60 exactly, not "wherever I think I was".`,
work: `Someone deleted a checkpoint to "fix" a stuck stream, and it restarted from «startingOffsets = latest», silently skipping 3 hours of payments. Recovery: restart with a new checkpoint and explicit «startingOffsets» JSON from the last good commit file. Rule added: checkpoints are never deleted without a ticket.`,
ex: `(df.writeStream
   .format("delta")
   .option("checkpointLocation", "s3://chk/payments_v3/")
   .trigger(processingTime="1 minute")
   .start("s3://lake/payments/"))
# ls s3://chk/payments_v3/offsets/  commits/  state/  metadata`,
pit: [`Sharing one checkpoint path between two queries.`, `Changing stateful query logic incompatibly and reusing the checkpoint.`, `Expecting Kafka consumer-group offsets to control where the stream resumes.`],
q: [`offsets/42 exists, commits/42 doesn't. What happens on restart?`, `Spark re-runs batch 42 with exactly the offsets in offsets/42, then writes commits/42.`]
},
"State stores": {
d: `Stateful operators keep data across micro-batches: streaming aggregations, «dropDuplicates», stream-stream joins, «flatMapGroupsWithState» / «transformWithState». State is stored **per key, per shuffle partition** in a **state store** on the executor running that partition, versioned per batch and checkpointed («state/») as deltas and snapshots.

Providers: the default **HDFSBackedStateStore** keeps everything in JVM memory (GC pressure with large state); **RocksDB** keeps state on local disk with a memory cache, handling much larger state.

State grows forever unless you bound it with a **watermark** («withWatermark("ts", "30 minutes")»), so old windows/keys get evicted. The number of state partitions is fixed by the checkpoint (it uses the shuffle partitions value from the first run).`,
life: `A cashier keeping a running tally per customer in a notebook. Without a rule like "clear customers not seen for 30 minutes", the notebook only grows.`,
work: `A dedupe stream «dropDuplicates("txn_id")» without a watermark grew state to 140 GB over 3 weeks; micro-batches slowed from 20 s to 6 min and executors had GC storms. Adding «withWatermark("event_ts","2 hours")» and «dropDuplicatesWithinWatermark», plus switching to RocksDB, kept state at ~4 GB.`,
ex: `spark.conf.set("spark.sql.streaming.stateStore.providerClass",
  "org.apache.spark.sql.execution.streaming.state.RocksDBStateStoreProvider")
(events.withWatermark("event_ts", "2 hours")
       .dropDuplicatesWithinWatermark(["txn_id"]))
# monitor: query.lastProgress["stateOperators"][0]["numRowsTotal"]`,
pit: [`Stateful ops without watermarks.`, `Changing shuffle partitions and expecting state to redistribute (it can't).`, `Large state on the in-memory provider.`],
q: [`Why does state partition count stay fixed after the first run?`, `State is stored per shuffle partition in the checkpoint; changing the count would put keys in different partitions than their stored state.`]
},
"Two schedulers": {
d: `**DAGScheduler** (driver, per job): builds stages from the lineage, tracks which partitions of which stages are done, and submits a **TaskSet** for each stage whose parents are complete. It handles stage-level failures like FetchFailed (resubmits parent stages).

**TaskScheduler** (TaskSchedulerImpl + SchedulerBackend): receives TaskSets, wraps each in a **TaskSetManager**, and matches tasks to **resource offers** from executors. It honours **data locality** levels (PROCESS_LOCAL → NODE_LOCAL → RACK_LOCAL → ANY), waiting «spark.locality.wait» (3 s) before relaxing. It handles task retries («spark.task.maxFailures» = 4), speculation and blacklisting/exclusion of bad executors.

Scheduling between concurrent jobs uses FIFO by default, or FAIR pools.`,
life: `A project manager (DAGScheduler) decides which phases can start now that their prerequisites are done. A shift supervisor (TaskScheduler) assigns individual tasks to free workers, preferring workers already standing next to the materials.`,
work: `A notebook running many small concurrent queries had one huge report job hogging all slots under FIFO. Enabling FAIR scheduling with a pool for interactive queries and a pool for reports kept interactive latency under 10 s. Separately, high «locality.wait» on S3 data (no locality anyway) wasted 3 s per wave; setting it to 0 sped up short stages.`,
ex: `spark.scheduler.mode=FAIR
spark.locality.wait=0s          # data on S3 has no locality to wait for
spark.task.maxFailures=4
spark.speculation=true
sc.setLocalProperty("spark.scheduler.pool", "interactive")`,
pit: [`Waiting for locality on object storage.`, `Speculation for skew (doesn't help) or for non-idempotent writes.`, `Confusing task retries with stage retries.`],
q: [`Which scheduler re-submits a parent stage after a FetchFailedException?`, `The DAGScheduler; it marks the map outputs as lost and resubmits the parent ShuffleMapStage.`]
},
"Dynamic allocation": {
d: `With «spark.dynamicAllocation.enabled», Spark scales executors with demand. If tasks have been pending for «schedulerBacklogTimeout» (1 s), it requests executors, doubling the request each round (1, 2, 4, 8...) up to «maxExecutors». Executors idle for «executorIdleTimeout» (60 s) are released; those holding cached data use «cachedExecutorIdleTimeout».

The catch: removing an executor deletes its **shuffle files** unless they're served elsewhere. So you need the **external shuffle service** (YARN) or **shuffle tracking** («shuffleTracking.enabled», keeps executors that hold needed shuffle data) on Kubernetes.`,
life: `A restaurant that calls in extra staff as the queue builds (more each time the queue persists) and sends people home after they've been idle a while, but never sends home the person holding the only key to the storeroom.`,
work: `Shared EMR cluster: a job with static 100 executors held them for 3 hours though most stages needed 10. With dynamic allocation (min 5, max 150), cost dropped 45% and peak stages got even more parallelism. On K8s, enabling it without shuffle tracking caused repeated FetchFailed; adding «shuffleTracking.enabled=true» fixed it.`,
ex: `spark.dynamicAllocation.enabled=true
spark.dynamicAllocation.minExecutors=5
spark.dynamicAllocation.maxExecutors=150
spark.dynamicAllocation.executorIdleTimeout=60s
spark.dynamicAllocation.shuffleTracking.enabled=true   # K8s
spark.shuffle.service.enabled=true                      # YARN`,
pit: [`No max, letting one job eat the whole cluster.`, `No shuffle service/tracking, causing lost shuffle data.`, `Streaming jobs with dynamic allocation flapping executors every batch.`],
q: [`Why can't Spark simply remove any idle executor?`, `It may hold shuffle files that later stages need; without a shuffle service or tracking, removing it forces recomputation.`]
}
});
