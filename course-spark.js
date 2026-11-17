// Course: Spark Internals: The Nightly Job (story + puzzle game). Games live in course-spark-games.js.
(function(){
const COURSES = window.COURSES = window.COURSES || {};
COURSES.spark = {
id:"spark", order:2, level:"Intermediate", hue:28, hours:6, game:true,
title:"Spark Internals: The Nightly Job",
short:"A story-driven game: rescue a 4-hour Spark job, chapter by chapter, with deep codex chapters and arcade levels.",
tagline:"Seven chapters, seven games, one boss. Read the codex to learn how Spark really works, then prove it in arcade levels with lives, combos and stars.",
story:"Paydesk's nightly payments job takes 4 h 10 min. Finance needs its reports by 6 AM. Priya, your tech lead, gives you two weeks and one rule: understand it before you change it.",
units:[
{title:"Act I · How Spark thinks", hue:28, desc:"Plans, partitions and stages.",
items:[
/* ======================= CHAPTER 1 ======================= */
{id:"1", title:"The plan before the work", mins:22,
sum:"Spark builds a plan from your code, optimises it, compiles it, and only then runs anything.",
scene:[
 ["priya","Welcome to Paydesk. Our nightly job reads every payment, joins merchants, aggregates by day and writes the finance mart. It takes **4 hours 10 minutes**."],
 ["arjun","And I need those numbers by 6 AM. Every morning I'm explaining to the CFO why they're late."],
 ["priya","Before you touch it, learn how Spark reads code. Half the problems in this job are code that *looks* cheap and isn't."],
 ["you","Where do I start?"],
 ["priya","With one question: when does Spark actually do work? Read the codex, then show me you can tell a plan from a job, fast."]
],
game:{id:"planOrRun", title:"Plan or Run?"},
codex:`## DataFrames are recipes, not results
A DataFrame doesn't hold data. It holds a **logical plan**: a tree describing where data comes from and which operations to apply. When you write «df.filter(...).select(...)», Spark adds two nodes to the tree and returns immediately. No file is opened, no executor is busy. This is **lazy evaluation**, and it's what lets Spark optimise the whole pipeline before running any of it.

## Transformations and actions
Operations fall into two groups:
- **Transformations** return a new DataFrame and only extend the plan: «select», «filter», «withColumn», «join», «groupBy().agg()», «union», «orderBy», «repartition», «cache».
- **Actions** need an actual result, so they trigger a **job**: «count», «collect», «show», «take», «first», «toPandas», «foreach», «write…save/saveAsTable/insertInto».

Some cases surprise people:
| Code | Runs a job? | Why |
|---|---|---|
| «df.cache()» | No | Marks the DataFrame for caching; the next action fills the cache |
| «df.checkpoint()» | Yes | Eager by default: computes and writes the data to reliable storage |
| «spark.read.option("inferSchema", True).csv(p)» | Yes | Spark scans data to guess column types |
| «spark.read.parquet(p)» | Small one at most | Schema comes from file footers; may list files |
| «df.explain()» | No | Prints the plan only |
| «df.columns», «df.schema» | No | Known from the plan |
| «df.rdd.getNumPartitions()» | No | Plans the RDD but runs nothing |
| «df.show()» | Yes | Runs a job that fetches the first rows (limit) |
| «df.write.parquet(p)» | Yes | The most common action in pipelines |

## From code to execution
:::flow What happens when an action is called
Unresolved logical plan :: names and columns not yet checked
Analysis :: the catalog resolves tables, columns and types
Logical optimisation :: Catalyst applies rewrite rules until nothing changes
Physical planning :: strategies choose join algorithms, aggregations, scans
Code generation :: Tungsten compiles stages into Java bytecode
DAG scheduling :: the plan is cut into stages at shuffles
Tasks run :: one per partition, on executor cores
:::

## Catalyst's logical optimisations
Catalyst applies batches of rules repeatedly until the plan stops changing:
- **Predicate pushdown:** filters move down, into the scan. For Parquet and Iceberg this means whole files and row groups are skipped using min/max statistics.
- **Column pruning:** columns nobody uses are dropped, so the scan reads fewer column chunks.
- **Constant folding and simplification:** «x > 1 + 2» becomes «x > 3»; «a AND true» becomes «a».
- **Operator collapsing:** adjacent filters merge; adjacent projections merge.
- **Join reordering:** with cost-based optimisation and statistics, joins are reordered to keep intermediate results small.

### Cost-based optimisation needs statistics
«spark.sql.cbo.enabled» uses table- and column-level statistics: row counts, distinct counts, min/max, null counts. Collect them with «ANALYZE TABLE t COMPUTE STATISTICS FOR COLUMNS merchant_id, created_at». Without statistics, Spark estimates from file sizes, which are often wrong after filters. Adaptive Query Execution (chapter 5) fixes many bad estimates at runtime.

## Physical planning and Tungsten
For each logical operator, planner strategies produce physical candidates: broadcast hash join or sort-merge join, hash aggregate or sort aggregate. Then **Tungsten** makes execution efficient:
- **UnsafeRow:** rows stored as compact binary in managed memory, not Java objects, so less garbage collection.
- **Whole-stage code generation:** a chain like scan → filter → project → partial aggregate becomes *one* generated Java method with a tight loop, instead of virtual calls per row per operator. In «explain()» output, operators marked «*(1)» run inside generated stage 1.
- **Vectorised reads:** Parquet and ORC are read in column batches, thousands of values at a time.

## Reading explain output
~~~
daily = (spark.table("lake.pay.payments")
           .filter("created_at >= '2026-11-16' AND status = 'SUCCESS'")
           .groupBy("merchant_id").agg(F.sum("amount").alias("gmv")))
daily.explain("formatted")

(1) BatchScan lake.pay.payments
    Output: [merchant_id, amount, status, created_at]
    PushedFilters: [created_at >= 2026-11-16, status = SUCCESS]
(2) Filter                      -- re-checks rows; the scan skipped whole files
(3) Project [merchant_id, amount]
(4) HashAggregate (partial)     *(1)  -- pre-aggregates before the shuffle
(5) Exchange hashpartitioning(merchant_id, 200)
(6) HashAggregate (final)       *(2)
~~~
Check four things: **PushedFilters / PartitionFilters** reached the scan; the scan's **Output** lists only needed columns; count the **Exchange** nodes (each is a shuffle); and the **join node names**.

## Caching: when and how
Without caching, every action recomputes the plan from source. Calling «count()» then «write()» reads and processes the input twice.
| Storage level | Where | Use |
|---|---|---|
| MEMORY_AND_DISK | Memory, spill to disk | Default for «DataFrame.cache()» |
| MEMORY_ONLY | Memory; recompute evicted parts | Small, hot data |
| DISK_ONLY | Local disk | Expensive to compute, too big for memory |
| OFF_HEAP | Off-heap memory | Rare; needs off-heap configured |

:::lanes Cache vs checkpoint vs write a table
# cache / persist
Keeps partitions on executors :: fast reuse in this application
Lineage is kept :: lost partitions are recomputed
Gone when the app ends :: or on unpersist()
# checkpoint
Writes data to reliable storage :: HDFS or S3 checkpoint dir
Truncates lineage :: useful for very long iterative plans
Eager by default :: runs a job immediately
# Write an intermediate table
Durable and visible to other jobs :: Iceberg or Parquet
Restartable pipeline :: rerun only later steps
Costs storage and a write :: worth it for expensive steps
:::

Cache only when a DataFrame feeds **two or more actions** and is expensive to compute; call «unpersist()» when you're done. Cached data competes with execution memory for shuffles and joins.

:::warn UDFs blind the optimiser
A Python or Scala UDF is opaque. Catalyst can't push a UDF-based filter into the scan, can't prune columns the UDF might use, and the UDF breaks whole-stage code generation. Python UDFs also serialise every row to a Python worker. Prefer built-in functions; if you must use Python, use pandas UDFs (Arrow-batched).
:::

## Mistakes that cost hours
- «df.count()» just to log row counts in production code: a whole extra job each time.
- Caching a DataFrame used once.
- «inferSchema» on large CSV in a nightly job: an extra full scan. Declare the schema.
- Filters written on transformed columns (cast, date_format) that can't be pushed down.
- Calling «collect()» on large results: everything goes to the driver.`,
iq:[
 ["B","What's the difference between a transformation and an action?","Transformations return a new DataFrame and only extend the logical plan; nothing runs. Actions need a result (count, show, collect, write), so Spark optimises the plan and runs a job. Laziness lets Catalyst optimise the whole pipeline at once."],
 ["I","Is cache() an action? What happens when you call it?","No. cache() marks the DataFrame to be stored at MEMORY_AND_DISK; the first action that computes it fills the cache, and later actions read cached partitions. checkpoint(), by contrast, is eager by default and runs a job immediately."],
 ["I","How do you check that predicate pushdown worked?","Run explain('formatted') and look at the scan node: PushedFilters and PartitionFilters should list your conditions, and Output should list only needed columns. If a filter is missing, look for casts, functions or UDFs wrapping the column."],
 ["S","What does whole-stage code generation do and why is it faster?","It fuses a chain of operators inside a stage into a single generated Java method with a tight loop, instead of each operator calling the next per row through iterators. That removes virtual calls and object creation and lets the JIT optimise the loop. Operators marked *(n) in explain output run in generated stage n."],
 ["S","When would you checkpoint instead of cache?","When the lineage is very long (iterative algorithms, many chained transformations), so recomputing a lost partition would be expensive or the plan itself becomes huge. Checkpoint writes to reliable storage and truncates lineage. For pipeline restartability, writing an intermediate table is often better still."]
],
take:["Transformations build a plan; actions run jobs.","Catalyst pushes filters and prunes columns; check explain() to confirm.","Cache only DataFrames reused by several actions, then unpersist.","UDFs block pushdown and code generation."]},

/* ======================= CHAPTER 2 ======================= */
{id:"2", title:"Partitions, tasks and the small-files trap", mins:24,
sum:"How Spark cuts data into partitions, schedules tasks in waves, and why millions of tiny files ruin everything.",
scene:[
 ["ui","Stage 0 · 2,097,152 files listed · 69,212 tasks · median task 0.9 s · stage time 8 min 49 s"],
 ["you","Sixty-nine thousand tasks just to read 500 GB?"],
 ["priya","The upstream streaming job writes a new file every few seconds. Two million tiny files. Spark spends more time opening files than reading them."],
 ["ravi","And every one of those tasks hits S3. We get throttled at 3 AM."],
 ["priya","Learn how partitions and tasks work, then fix the layout. Packing data well is a puzzle; let's see you solve it."]
],
game:{id:"packer", title:"Partition Packer"},
codex:`## Three kinds of partitions
"Partition" means three different things in Spark, and mixing them up causes confusion:
| Kind | Decided by | Typical setting |
|---|---|---|
| Input partitions (reading files) | File sizes and split settings | spark.sql.files.maxPartitionBytes |
| Shuffle partitions (after groupBy, join) | Shuffle partition count, AQE | spark.sql.shuffle.partitions |
| Table partitions (on storage) | How the table is laid out | PARTITIONED BY (days(created_at)) |
This chapter is mostly about the first and third; shuffle partitions are chapter 4.

## How Spark splits files into input partitions
For file sources, Spark computes a target split size:
~~~
bytesPerCore  = totalBytes / defaultParallelism
maxSplitBytes = min(maxPartitionBytes, max(openCostInBytes, bytesPerCore))
~~~
- «spark.sql.files.maxPartitionBytes» defaults to **128 MB**.
- «spark.sql.files.openCostInBytes» defaults to **4 MB**: an estimate of the cost of opening a file, expressed as bytes. Each file is counted as at least this big when packing.
Large splittable files are cut into maxSplitBytes chunks (for Parquet, aligned to row groups). Small files are packed together into partitions until a partition reaches maxSplitBytes. Non-splittable files (gzip-compressed CSV or JSON) become one partition each, however big they are.

## Tasks, cores and waves
:::flow From partitions to stage time
One task per partition :: the unit of scheduling
Tasks run on executor cores :: one task per core at a time
Waves = tasks ÷ total cores :: rounded up
Stage time ≈ waves × typical task time :: plus the slowest task in the last wave
:::
Example: 500 GB in 128 MB partitions is about 4,000 tasks. On 200 cores that's 20 waves. If each task takes 3 seconds, the stage takes about a minute, as long as no task is much slower than the rest.

### Stragglers
The stage isn't done until its slowest task finishes. One slow node, one oversized partition, or one skewed key creates a **straggler**. «spark.speculation=true» launches duplicate copies of very slow tasks on other executors and uses whichever finishes first: useful for flaky nodes, useless for skew (the copy has the same data).

## The small-files problem
Every file has fixed costs regardless of size:
- **Listing:** S3 returns 1,000 keys per LIST request; two million files means thousands of requests before planning even ends (table formats avoid this by tracking files in metadata).
- **Opening:** an HTTP request and connection per file, often plus a footer read for Parquet.
- **Metadata:** each file is an entry in Iceberg manifests or Hive partitions; planning slows down.
- **Packing overhead:** with openCostInBytes, two million 250 KB files count as ~8.4 TB for packing purposes, producing tens of thousands of tasks.
- **S3 throttling:** around 5,500 GET requests per second per prefix before you see 503 Slow Down errors.

:::lanes Where small files come from
# Streaming writers
Commit every few seconds :: each commit writes new files
Many partitions × many tasks :: files multiply
# Over-partitioned tables
Partitioned by hour, or by a high-cardinality column :: tiny partitions
Each partition gets its own files :: per task
# Careless batch writes
200 shuffle partitions × 30 dates :: up to 6,000 files
No repartition before write :: every task writes to every date
:::

## Fixing small files
1. **Compact where they live.** For Iceberg: «CALL system.rewrite_data_files(table => 'pay.payments', options => map('target-file-size-bytes','536870912'))». For Hive-style tables: rewrite partitions with a repartition. Schedule it.
2. **Write well in the first place.** Repartition by the table's partition columns before writing, so each task writes few partition values:
~~~
(df.repartition("dt")                      # rows for a date go to the same task
   .sortWithinPartitions("merchant_id")     # tight min/max per file
   .writeTo("lake.pay.payments").overwritePartitions())

# Iceberg can do the distribution for you
spark.sql("ALTER TABLE lake.pay.payments SET TBLPROPERTIES ("
          "'write.distribution-mode'='hash', 'write.target-file-size-bytes'='536870912')")
~~~
3. **Cap file size** with «maxRecordsPerFile» when one partition value holds a lot of data.
4. **Streaming:** longer trigger or checkpoint intervals, plus scheduled compaction.
Raising maxPartitionBytes only hides the reader-side cost for one job; compaction fixes it for every reader.

## repartition vs coalesce
| | repartition(n) | coalesce(n) |
|---|---|---|
| Shuffle | Yes, full | No |
| Can increase partitions | Yes | No |
| Balance | Even (hash or round-robin) | Merges neighbours; can be uneven |
| Upstream parallelism | Unaffected | Reduced if placed early (the whole stage runs with n tasks) |
Use coalesce at the very end to reduce output files cheaply; use repartition when you need balance, more partitions, or a specific key distribution.

## Choosing sizes
- Input tasks of roughly **128-512 MB** each.
- Data files of roughly **256 MB-1 GB** in the lake.
- Table partitions that hold at least a few hundred MB: partition by day, not by hour, for a table that gets 1 GB a day.

:::tip Quick diagnosis
Stage with tens of thousands of sub-second tasks → small files or tiny partitions. Stage with a few hundred multi-minute tasks and spills → partitions too big. Look at the task count and median duration first.
:::`,
iq:[
 ["B","Why are many small files bad?","Each file has fixed overhead: listing, opening, footer reads, metadata entries and task scheduling. Millions of tiny files make planning slow, create huge numbers of tiny tasks, trigger S3 throttling, and spend more time on overhead than on reading data."],
 ["I","How does Spark decide input partition sizes for files?","It computes maxSplitBytes = min(maxPartitionBytes, max(openCostInBytes, totalBytes / defaultParallelism)), splits large splittable files into chunks of that size, and packs small files together, counting each file as at least openCostInBytes. Non-splittable files like gzip CSV become one partition each."],
 ["I","repartition or coalesce before writing output?","coalesce is cheaper (no shuffle) and fine for reducing file count at the end if partitions are reasonably balanced, but it can shrink upstream parallelism if the optimiser pushes it earlier. repartition (often by the table's partition column) shuffles but gives even files and groups each partition value into few tasks."],
 ["S","A job writes 40,000 files a day into an Iceberg table. How do you fix it?","Set write.distribution-mode to hash (or repartition by partition columns) so each task writes few partition values, set write.target-file-size-bytes, sort by a common filter column, and let AQE coalesce shuffle partitions. Schedule rewrite_data_files for residual small files and check the partition spec isn't too fine."]
],
take:["One partition becomes one task; tasks run in waves across cores.","Small files cost listing, opening, metadata and tasks; compact them where they're written.","Use repartition for balance, coalesce for cheap file-count reduction at the end."]},

/* ======================= CHAPTER 3 ======================= */
{id:"3", title:"Stages, shuffles and the DAG", mins:20,
sum:"Spark cuts every job into stages at shuffle boundaries. Read code the way the DAG scheduler does.",
scene:[
 ["ui","Job 14 · 6 stages · Stage 3: Exchange hashpartitioning(merchant_id, 200) · shuffle write 1.1 TB"],
 ["you","Six stages for one write? I counted two shuffles in my head."],
 ["priya","Then your head is missing four. Every Exchange in the plan is a stage boundary, and each one writes everything to disk and sends it over the network."],
 ["priya","Train your eye. In this level, operations roll past on a conveyor. Catch every shuffle before it escapes, and don't touch the narrow ones."]
],
game:{id:"shuffleHunter", title:"Shuffle Hunter"},
codex:`## Narrow and wide dependencies
Every DataFrame operation creates a dependency between the partitions of its input and output:
- **Narrow:** each output partition depends on a bounded set of input partitions, usually one. «filter», «select», «withColumn», «union», «coalesce», «sample». No data crosses the network.
- **Wide:** an output partition depends on data from many or all input partitions. «groupBy().agg()», «join» of two large tables, «distinct», «dropDuplicates», «orderBy», «repartition», window functions with «PARTITION BY». Data must be **shuffled**.

## How the DAG scheduler cuts stages
:::flow From a job to stages
Action submits a job :: with the final physical plan
Scheduler walks back from the result :: following dependencies
Each wide dependency ends a stage :: a ShuffleMapStage writes shuffle files
Narrow operations are pipelined :: chained inside the same stage
Stages run in dependency order :: parents first, independent stages in parallel
The last stage is the ResultStage :: it returns rows or writes output
:::
Inside a stage, all narrow operations run back-to-back in each task: one pass over the data, no intermediate materialisation. Whole-stage code generation (chapter 1) turns that chain into a single loop.

## Which operations shuffle?
| Operation | Shuffle? | Notes |
|---|---|---|
| filter, select, withColumn, explode | No | Narrow |
| union | No | Partitions are concatenated |
| coalesce(n) | No | Merges partitions locally |
| repartition(n), repartition(col) | Yes | Round-robin or hash |
| groupBy().agg() | Yes | Partial aggregation first reduces data |
| distinct / dropDuplicates | Yes | Hash on all (or chosen) columns |
| join, small side broadcast | No for the big side | BroadcastExchange copies the small side |
| join, both sides large | Yes | Both sides hash-partitioned by key |
| orderBy / sort | Yes | Range partitioning after sampling |
| sortWithinPartitions | No | Sorts each partition locally |
| Window with PARTITION BY | Yes | Hash by partition keys, then sort |
| Window without PARTITION BY | Yes, to one partition | Everything goes to a single task |

## Partial aggregation shrinks shuffles
For «groupBy(merchant_id).sum(amount)», Spark doesn't shuffle every row. Each task first aggregates its own rows (HashAggregate partial), then only one row per merchant per task crosses the network, and a final HashAggregate combines them. That's why aggregations are often cheap to shuffle while joins and distinct on high-cardinality keys are not.

## Reading the plan for stage boundaries
~~~
== Physical Plan ==
*(5) Project [...]
+- *(5) SortMergeJoin [merchant_id], [merchant_id], Inner
   :- *(2) Sort [merchant_id ASC]
   :  +- Exchange hashpartitioning(merchant_id, 4000)       <- shuffle 1
   :     +- *(1) Filter (status = SUCCESS)
   :        +- *(1) ColumnarToRow
   :           +- BatchScan lake.pay.payments
   +- *(4) Sort [merchant_id ASC]
      +- Exchange hashpartitioning(merchant_id, 4000)       <- shuffle 2
         +- *(3) Filter isnotnull(merchant_id)
            +- BatchScan lake.pay.merchants
~~~
Each «Exchange» is a boundary. Here two scan stages feed one join stage. Replace the merchants side with a broadcast and the second exchange disappears; so does the shuffle of the big side.

## Skipped stages and exchange reuse
In the Spark UI you'll see **skipped** stages. When a later job needs the output of a shuffle that was already written (same lineage), Spark reuses the shuffle files instead of recomputing. «ReusedExchange» in a plan means the same exchange appears twice (for example a self-join) and is computed once.

## Fault tolerance comes from lineage
If an executor dies, Spark recomputes only the lost partitions by replaying their lineage from the last shuffle files. If shuffle files themselves are lost, the parent stage is partially re-run (that's a FetchFailed in chapter 4). Long lineages without shuffles or checkpoints are expensive to recover.

## Avoiding shuffles you don't need
- **Broadcast** small dimension tables (chapter 5).
- **Pre-aggregate** before joining: join merchants to daily totals, not to every payment.
- **Bucketed or storage-partitioned joins:** two tables bucketed identically by the join key can join without a shuffle.
- **Don't repartition twice:** a repartition right before a groupBy on the same key is wasted.
- **Global sort only when required:** sortWithinPartitions is enough for writing well-clustered files.`,
iq:[
 ["B","What creates a new stage in Spark?","A wide dependency, which requires a shuffle: groupBy aggregations, joins of two large tables, distinct, repartition, orderBy, window functions with PARTITION BY. Narrow operations are pipelined within the current stage."],
 ["I","Why is a groupBy aggregation often cheaper to shuffle than a join?","Spark does partial (map-side) aggregation: each task aggregates its own rows first, so only one row per key per task is shuffled. A join has to shuffle every row of both sides."],
 ["I","What are skipped stages in the Spark UI?","Stages whose shuffle output already exists from an earlier job with the same lineage. Spark reuses those shuffle files instead of recomputing the stage."],
 ["S","How does Spark recover when an executor dies mid-job?","Lost cached or in-progress partitions are recomputed from lineage. If the executor held shuffle output needed downstream, reducers get FetchFailed and the scheduler re-runs the affected map tasks of the parent stage, then retries the downstream stage. The external shuffle service or decommissioning with shuffle migration reduces this cost."]
],
take:["Narrow ops are pipelined; wide ops shuffle and start a stage.","Every Exchange in explain() is a stage boundary.","Partial aggregation shrinks shuffles; broadcasts remove them."]},

{id:"q1", kind:"quiz", title:"Act I checkpoint", mins:4,
questions:[
 {q:"Which of these runs a Spark job immediately?", o:["df.cache()","df.checkpoint()","df.explain()","df.columns"], a:1, e:"checkpoint() is eager by default; cache() is lazy and only marks the DataFrame."},
 {q:"500 GB in 128 MB input partitions on 200 cores: roughly how many waves?", o:["1","4","20","4,000"], a:2, e:"About 4,000 tasks / 200 cores = 20 waves."},
 {q:"Why does reading 2 million 250 KB files produce so many tasks?", o:["Parquet can't be split","Each file counts as at least openCostInBytes (4 MB) when packing","S3 limits partitions","Spark uses one task per file always"], a:1, e:"Packing treats each file as ≥ 4 MB, so tiny files inflate the task count."},
 {q:"Which operation does NOT shuffle?", o:["distinct()","sortWithinPartitions()","orderBy()","repartition(100)"], a:1, e:"sortWithinPartitions sorts each partition locally without moving data."},
 {q:"A window function with no PARTITION BY on 1 TB will…", o:["Run in parallel everywhere","Send all rows to a single task","Be skipped","Broadcast"], a:1, e:"Without partition keys, all rows must be in one partition to compute the window."},
 {q:"Speculation helps most with…", o:["Data skew","A flaky or slow node","Small files","Spills"], a:1, e:"A duplicate task on another node helps hardware slowness, not data that is genuinely bigger."}
]}
]},

{title:"Act II · Data on the move", hue:205, desc:"Shuffles, joins, skew and memory.",
items:[
/* ======================= CHAPTER 4 ======================= */
{id:"4", title:"Inside a shuffle", mins:24,
sum:"Map tasks write sorted blocks, reducers fetch one from every mapper. Hash partitioning decides who gets what.",
scene:[
 ["ravi","3:12 AM. FetchFailedException on stage 4. Then again at 3:40. Then the spot nodes went away."],
 ["you","What's actually being fetched?"],
 ["priya","Shuffle blocks. Every map task writes one block for every reducer: 4,000 mappers times 4,000 reducers is sixteen million blocks, mostly tiny."],
 ["priya","To feel it, be the partitioner. Rows arrive with a key hash; send each one to the reducer that owns it. Fast."]
],
game:{id:"hashRouter", title:"Hash Router"},
codex:`## Why rows have to move
Wide operations need rows with the same key in the same task. Rows start spread across every input partition, so Spark redistributes them by key: the shuffle. It's usually the most expensive thing a job does: rows are serialised, sorted, written to local disk, sent over the network, read back and deserialised.

## Who gets which row
For hash partitioning (groupBy, join, repartition by column):
~~~
target = pmod(murmur3_hash(key), spark.sql.shuffle.partitions)
~~~
Every row with the same key lands in the same reduce partition. Change the number of partitions and almost every key moves to a different reducer: harmless here because the shuffle is recomputed each run, but the same maths is why Kafka warns you about adding partitions.

## The map side
:::flow Writing shuffle output (sort-based shuffle)
Compute the target partition :: hash(key) % numPartitions for each row
Buffer records in memory :: ordered by target partition
Spill sorted runs when memory fills :: to local disk
Merge runs into one data file :: ordered by target partition
Write an index file :: byte offset where each reducer's block starts
Report locations to the driver :: the MapOutputTracker
:::
Spark picks one of three writers:
| Writer | When | Why |
|---|---|---|
| BypassMergeSortShuffleWriter | Few partitions (≤ 200) and no map-side aggregation | Writes one file per reducer then concatenates; avoids sorting |
| UnsafeShuffleWriter (serialized) | Serializer supports relocation, no aggregation, < 16M partitions | Sorts serialized bytes by partition ID; very efficient |
| SortShuffleWriter | Everything else, e.g. map-side combine | General path; sorts deserialised records |

## The reduce side
:::flow Reading shuffle input
Ask where blocks live :: MapOutputTracker returns locations and sizes
Fetch blocks from every map output :: in parallel, up to maxSizeInFlight (48 MB)
Decompress and deserialise :: LZ4 by default
Aggregate, sort or join :: spilling to disk if it doesn't fit
Produce the stage output :: or feed the next shuffle
:::

## The M × R problem
There are M × R blocks: every reducer fetches one from every mapper. 4,000 × 4,000 = 16 million blocks. If 1 TB is shuffled, each averages ~65 KB. Tiny blocks mean millions of small random disk reads and network requests, slow stages with idle CPUs, and fetch timeouts.
| Fix | Effect |
|---|---|
| Shuffle less data | Filter and project early, pre-aggregate, broadcast small sides |
| Fewer map tasks | Larger input splits or compacted files |
| Sensible reduce partitions | ~100-300 MB each; let AQE coalesce |
| Push-based shuffle (Spark 3.2+, YARN) | Mappers push blocks to shuffle services that merge them per reducer |
| Remote shuffle service (Celeborn, Uniffle) | Shuffle data lives on dedicated servers; good for Kubernetes and spot |

## Choosing the number of shuffle partitions
The default of 200 is a placeholder. Size by data: **partitions ≈ shuffled bytes ÷ 200 MB**. With AQE («spark.sql.adaptive.enabled», on by default since Spark 3.2), set a generous number and let Spark coalesce:
~~~
spark.conf.set("spark.sql.shuffle.partitions", "4000")
spark.conf.set("spark.sql.adaptive.coalescePartitions.enabled", "true")
spark.conf.set("spark.sql.adaptive.advisoryPartitionSizeInBytes", "256m")
~~~
At each shuffle boundary AQE looks at actual partition sizes and merges small neighbours up to the advisory size.

## Where shuffle files live, and why executors dying hurts
Shuffle files sit on the executor's local disks. Lose the executor and its blocks are gone; reducers throw **FetchFailedException**, Spark marks those map outputs lost, re-runs the needed map tasks and retries. Ways to protect them:
- The **external shuffle service** serves files from a separate process on the node, so they survive executor removal (needed for dynamic allocation on YARN).
- **Graceful decommissioning** («spark.decommission.enabled», shuffle block migration) moves blocks off nodes about to be reclaimed.
- **Remote shuffle services** take shuffle data off executors entirely.

:::warn Signs of a shuffle in trouble
Shuffle read time much larger than compute time; "Fetch wait time" high; repeated FetchFailed on the same hosts; local disks filling up; huge "Shuffle spill (disk)". Fix the data volume first, then the partitioning, then the infrastructure.
:::

## Settings worth knowing
| Setting | Default | Note |
|---|---|---|
| spark.sql.shuffle.partitions | 200 | Size it to your data |
| spark.sql.adaptive.advisoryPartitionSizeInBytes | 64 MB | AQE coalescing target |
| spark.reducer.maxSizeInFlight | 48 MB | Fetch parallelism per reducer |
| spark.shuffle.file.buffer | 32 KB | Bigger buffer, fewer disk writes |
| spark.shuffle.compress / io.compression.codec | true / lz4 | Keep compression on; zstd for better ratios |
| spark.shuffle.sort.bypassMergeThreshold | 200 | Bypass writer threshold |`,
iq:[
 ["I","What files does a map task produce in sort-based shuffle?","One data file holding all its output ordered by target reduce partition, plus an index file with the byte offset of each partition's block. Reducers use the index to fetch only their block."],
 ["I","How would you choose spark.sql.shuffle.partitions?","Divide the shuffled data size by a target of about 100-300 MB per partition. With AQE enabled, set it generously and let coalescing merge small partitions toward the advisory size."],
 ["S","Explain the M × R problem and how push-based shuffle helps.","Every reducer fetches one block from every map task, so blocks grow as M×R and become tiny, causing millions of small random reads. Push-based shuffle has map tasks push blocks to shuffle services which merge them per reduce partition, so reducers read a few large merged files."],
 ["S","A job repeatedly fails with FetchFailedException on spot instances. What do you do?","The lost nodes held shuffle files. Use on-demand core nodes for shuffle-heavy stages, enable graceful decommissioning with shuffle migration or the external shuffle service, consider a remote shuffle service, reduce partition sizes so recomputation is cheaper, and tune network timeouts and retries."]
],
take:["Hash partitioning sends each key to exactly one reducer.","M × R blocks: keep blocks and partitions sensibly sized.","Protect shuffle files from executor loss on spot clusters."]},

/* ======================= CHAPTER 5 ======================= */
{id:"5", title:"Join strategies", mins:22,
sum:"Broadcast, shuffle hash, sort-merge or nested loop: how Spark chooses, and how you make joins cheap.",
scene:[
 ["ui","Stage 6 · SortMergeJoin · payments 2.1 TB × merchants 58 MB · shuffle write 2.2 TB"],
 ["you","We're shuffling two terabytes to join a 58 MB table?"],
 ["priya","Statistics are stale, so Spark thinks merchants is huge. That's one join. There are seven more in the codebase, all different."],
 ["priya","The Slow Query is waiting for you. Every right strategy hits it; every wrong one heals it."]
],
game:{id:"joinDuel", title:"Join Duel"},
codex:`## The four physical join strategies
:::lanes How each strategy executes
# Broadcast hash join
Driver collects the small side :: then broadcasts it to every executor
Each task builds a hash table :: from the broadcast copy
Each big-side partition probes it :: no shuffle of the big side
# Shuffle hash join
Shuffle both sides by key :: same partitioner
Build a hash table per partition :: from the smaller side
Probe with the other side :: no sort, but the build side must fit in memory
# Sort-merge join
Shuffle both sides by key :: same partitioner
Sort each partition by key :: spills to disk if needed
Merge the sorted streams :: robust for any size
# Broadcast nested loop
Broadcast one side :: required for non-equi conditions
Compare every pair of rows :: O(n × m)
Only for small inputs :: or rewrite the condition
:::

## How Spark chooses
1. **Hints first:** «broadcast(df)» or «/*+ BROADCAST(m) */», «/*+ MERGE */», «/*+ SHUFFLE_HASH */», «/*+ SHUFFLE_REPLICATE_NL */».
2. For **equi-joins**, if one side's estimated size is below «spark.sql.autoBroadcastJoinThreshold» (10 MB default) and the join type allows that side to be broadcast, use broadcast hash join.
3. Else if «spark.sql.join.preferSortMergeJoin» is false and one side is much smaller and fits per partition, shuffle hash join.
4. Else **sort-merge join**: the safe default.
5. **Non-equi joins** (ranges, inequalities): broadcast nested loop if one side is small enough, otherwise a cartesian product. Very expensive at scale.

### Which side can be broadcast?
| Join type | Can broadcast |
|---|---|
| Inner | Either side |
| Left outer, left semi, left anti | Right side only |
| Right outer | Left side only |
| Full outer | Neither (falls back to sort-merge) |

## Why estimates go wrong, and AQE
Spark decides from **estimated** sizes: table statistics, or file sizes. A 2 TB table filtered to one day may be tiny, but the static plan doesn't know. Stale or missing statistics make small tables look big.
With **Adaptive Query Execution**, Spark re-plans at shuffle boundaries using real sizes: a sort-merge join whose side turns out smaller than «spark.sql.adaptive.autoBroadcastJoinThreshold» is converted to a broadcast join at runtime. AQE can also convert to shuffle hash joins when partitions are small (local shuffle reader avoids reading across the network).

## Broadcasting safely
- Size on disk ≠ size in memory. A 300 MB Parquet table can decompress to several GB as a hash table.
- The broadcast is built on the **driver** first: large broadcasts need driver memory («spark.driver.maxResultSize», driver heap).
- «spark.sql.broadcastTimeout» (300 s) fails slow broadcasts.
- Rule of thumb: broadcast what's comfortably under a few hundred MB in memory, and set hints deliberately rather than raising the global threshold.

## Making big × big joins cheaper
- **Filter and project before joining.** Join one day, not all history; select needed columns.
- **Pre-aggregate** one side if you only need totals.
- **Bucketing / storage-partitioned joins:** two tables bucketed into the same number of buckets on the join key can sort-merge join without a shuffle. Iceberg supports storage-partitioned joins with «bucket(N, key)» transforms in recent Spark versions.
- **Semi and anti joins** («left_semi», «left_anti») instead of join + distinct or join + filter isNull.
- **Join order:** join the most selective tables first; CBO with statistics can do this.

~~~
from pyspark.sql import functions as F
pay = spark.table("lake.pay.payments").filter("dt = '2026-11-16'").select("payment_id", "merchant_id", "amount")
mer = spark.table("lake.pay.merchants").select("merchant_id", "city", "category")
enriched = pay.join(F.broadcast(mer), "merchant_id", "left")      # right side broadcast, left join OK
enriched.explain()   # look for BroadcastHashJoin, BroadcastExchange
~~~

:::warn Non-equi joins hide in innocent SQL
«ON p.ts BETWEEN r.valid_from AND r.valid_to» has no equality key. With two large sides this becomes a cartesian product. Add an equality condition (for example on a day bucket) so Spark can hash-partition, then apply the range as a filter.
:::

## Checklist for a slow join
- Which strategy did Spark pick? (explain, SQL tab in the UI)
- Are size estimates sane? Refresh statistics.
- Can the small side be broadcast? Does the join type allow it?
- Are both sides filtered and pruned before the join?
- Is one key hot? (chapter 6)`,
iq:[
 ["B","What is a broadcast join and when do you use it?","Spark sends the small table to every executor and each task joins its partition of the large table locally, so the large table is never shuffled. Use it when one side is comfortably small in memory, like a dimension table."],
 ["I","Why can't Spark broadcast the left side of a left outer join?","The left side must be fully preserved, including rows with no match. If the left side were broadcast, each task would only see part of the right side and couldn't decide that a left row has no match anywhere, so it would emit wrong NULL rows."],
 ["I","Spark chose sort-merge for a join with a 50 MB table. Why, and how do you fix it?","Its size estimate was probably above the broadcast threshold: stale or missing statistics, or estimating from unfiltered file sizes. Refresh statistics, add a broadcast hint, or rely on AQE to convert at runtime after seeing the real size."],
 ["S","How do you make a join between two multi-terabyte tables efficient?","Filter and project both sides first, pre-aggregate where possible, make sure the key isn't skewed, size shuffle partitions properly with AQE, and for recurring joins bucket both tables identically on the join key (or use storage-partitioned joins) so the shuffle disappears."],
 ["S","How would you handle a range join like timestamp BETWEEN valid_from AND valid_to on large data?","Add an equality key to enable hash partitioning, for example explode each validity interval into the days it covers and join on day plus the range filter, or broadcast the range side if small. Avoid a pure cartesian/nested-loop plan."]
],
take:["Broadcast small sides; sort-merge is the safe default for big × big.","Bad estimates cause bad joins: keep statistics fresh and use AQE.","Outer join types limit which side can be broadcast."]},

/* ======================= CHAPTER 6 ======================= */
{id:"6", title:"Taming skew", mins:22,
sum:"One hot key turns one task into a 45-minute straggler. Diagnose it, then smash it with the right tool.",
scene:[
 ["ui","Stage 7 · tasks 4,000 · median 31 s · max 46 min · max shuffle read 180 GB (task 1,271)"],
 ["meera","That's MegaMart. They're 40% of our volume since the festival sale."],
 ["you","And 10% of rows have a NULL merchant_id from the old checkout."],
 ["priya","Two different skews, two different fixes. You have limited tools and a budget; spend them wisely."]
],
game:{id:"skewSmasher", title:"Skew Smasher"},
codex:`## What skew is
**Data skew** means a few keys hold a large share of rows. After a shuffle, all rows for a key land in one reduce partition, so one task gets gigabytes while others get megabytes. The stage, and the job, wait for that task.

## Diagnosing it
:::flow From symptom to hot key
Find the slow stage :: Stages tab, sorted by duration
Open the task summary :: compare median and max duration
Compare shuffle read size :: max far above median means skew
Find the keys :: count rows per key
Decide on a fix :: by cause and operation
:::
~~~
(spark.table("lake.pay.payments").filter("dt = '2026-11-16'")
   .groupBy("merchant_id").count()
   .orderBy(F.desc("count")).show(10))
# merchant_id | count
# MegaMart    | 41,203,118
# null        | 10,377,402
# M-77812     |    612,233
~~~
If a few keys dominate, it's skew. If all tasks are slow, it's not skew: look at partition sizes, spills or I/O.

## Common causes
- **NULL or placeholder keys:** missing IDs, 0, "unknown", "N/A".
- **Natural hot keys:** the biggest merchant, a test account, a bot.
- **Low-cardinality keys:** joining or grouping on country or status.
- **Skewed writes:** «partitionBy("dt")» where one date has 10× the data.

## Fix 1: deal with NULL keys
NULL keys never match in an inner join, yet they all hash to one partition and get shuffled. Filter them before the join, or handle them separately and union back:
~~~
valid  = pay.filter("merchant_id IS NOT NULL")
nulls  = pay.filter("merchant_id IS NULL").withColumn("city", F.lit(None))
result = valid.join(F.broadcast(mer), "merchant_id", "left").unionByName(nulls, allowMissingColumns=True)
~~~

## Fix 2: AQE skew join
With «spark.sql.adaptive.skewJoin.enabled» (default true in Spark 3.2+), Spark detects partitions larger than both «skewedPartitionFactor» × median (5) and «skewedPartitionThresholdInBytes» (256 MB), splits them into smaller pieces, and replicates the matching partition of the other side. It's automatic, but it only applies to **sort-merge joins** (and shuffle hash joins in newer versions) and has limits: it doesn't fix skewed aggregations.

## Fix 3: broadcast
If the other side is small enough, broadcasting removes the shuffle entirely, so there's no skewed partition at all.

## Fix 4: salting a join
:::flow Salting a hot key
Choose N :: e.g. 16, from the skew ratio
Big side: add salt :: random 0..N-1 per row
Small side: replicate :: one copy of each row per salt value
Join on key + salt :: the hot key now spreads over N partitions
Drop the salt :: results are identical
:::
~~~
N = 16
big   = pay.withColumn("salt", (F.rand() * N).cast("int"))
small = mer.withColumn("salt", F.explode(F.array(*[F.lit(i) for i in range(N)])))
joined = big.join(small, ["merchant_id", "salt"]).drop("salt")
~~~
Cost: the small side grows N×. To limit that, salt **only the hot keys**: give rows with hot keys a random salt and everything else salt 0, and replicate only the hot keys' rows on the small side.

## Fix 5: two-phase aggregation for skewed groupBy
Partial aggregation helps, but a single hot key still ends up in one final task. Aggregate twice:
~~~
step1 = (pay.withColumn("salt", (F.rand() * 16).cast("int"))
            .groupBy("merchant_id", "salt").agg(F.sum("amount").alias("part")))
step2 = step1.groupBy("merchant_id").agg(F.sum("part").alias("gmv"))
~~~
This works for any associative aggregate (sum, count, min, max); averages need sum and count separately.

## Fix 6: isolate the hot keys
Process the top few keys in their own job (or with broadcast and higher parallelism), process the rest normally, and union. More code, but precise.

| Situation | Best fix |
|---|---|
| NULL or junk keys | Filter or handle separately |
| Skewed sort-merge join | AQE skew join, then salting if needed |
| Other side is small | Broadcast |
| Skewed groupBy | Two-phase aggregation |
| A handful of known whales | Isolate hot keys |
| Skewed writes to one table partition | Repartition by (dt, salt) or by dt plus a bucket |

:::tip Speculation won't save you
Speculative execution launches a copy of a slow task elsewhere, but the copy reads the same 180 GB. Skew is a data problem; fix the data distribution.
:::`,
iq:[
 ["B","How do you recognise data skew in the Spark UI?","In the stage's task summary, the max task duration and shuffle read size are far above the median: one or a few tasks process most of the data while the rest finish quickly."],
 ["I","Walk through salting a skewed join.","Add a random salt 0..N-1 to the large side's hot key rows, replicate the small side's rows once per salt value, join on key plus salt, then drop the salt. The hot key is spread across N partitions; the cost is N× copies of the small side, which you limit by salting only hot keys."],
 ["I","Does AQE fix all skew?","No. AQE skew join splits oversized partitions in sort-merge (and in newer versions shuffle hash) joins. It doesn't fix skewed aggregations, skew in writes, or skew where the other side can't be split usefully; those need two-phase aggregation, salting or isolating hot keys."],
 ["S","A groupBy on merchant_id has one merchant with 40% of rows. How do you speed it up?","Use two-phase aggregation: add a random salt, aggregate by (merchant_id, salt), then aggregate again by merchant_id. For non-associative aggregates, compute components (sum and count for averages). Also make sure partial aggregation is enabled and NULL keys are handled."]
],
take:["Skew shows as max task ≫ median task.","Handle NULL keys first; then AQE, broadcast, salting or two-phase aggregation.","Speculation doesn't help skew."]},

/* ======================= CHAPTER 7 ======================= */
{id:"7", title:"Memory, spills and executors", mins:22,
sum:"How executor memory is divided, why tasks spill or die, and how to size executors that fit the cluster.",
scene:[
 ["ravi","Two executors killed last night: Container killed by YARN for exceeding memory limits. 33.1 GB of 33 GB used."],
 ["you","But the heap is only 30 GB."],
 ["priya","Exactly. Memory isn't just the heap. And our executors are 16 cores with 110 GB each, which is its own problem."],
 ["priya","Your last puzzle: fit executors onto the nodes so nothing spills, nothing is wasted, and nothing gets killed."]
],
game:{id:"executorFit", title:"Executor Fit"},
codex:`## The executor memory model
An executor is a JVM process. Its memory is more than the heap:
:::flow Memory requested for one executor container
spark.executor.memory :: the JVM heap
Reserved :: 300 MB of the heap, for Spark internals
Unified memory :: spark.memory.fraction (0.6) × (heap − 300 MB)
User memory :: the remaining 40%: your objects, UDF data, metadata
memoryOverhead :: off-heap: max(384 MB, 10% of heap), for JVM internals, buffers, Python workers
spark.executor.pyspark.memory :: optional cap for Python workers
:::
The container size the cluster manager enforces is **heap + overhead (+ PySpark memory, + off-heap if enabled)**. "Container killed for exceeding memory limits" means the process's total usage went past that, usually because of off-heap usage, not the heap.

## Unified memory: execution and storage
Unified memory is shared by:
- **Execution:** hash tables for joins and aggregations, sort buffers, shuffle buffers.
- **Storage:** cached DataFrames and broadcast variables.
«spark.memory.storageFraction» (0.5) is a protected region for storage. Execution can borrow free storage memory and **evict** cached blocks beyond the protected region; storage can borrow free execution memory but can't evict execution data. When execution needs memory nobody can give up, it **spills**.

## Memory per task
All tasks on an executor share its execution memory, so roughly:
~~~
memory per task ≈ (heap − 300 MB) × 0.6 ÷ cores per executor
~~~
A 16 GB heap with 4 cores gives each task about 2.4 GB for sorts and hash tables. If a task's partition needs more, it spills; if a single record or hash table can't fit at all, you get OutOfMemoryError.

## Spills
"Spill (memory)" is the size of data that was in memory when spilled; "Spill (disk)" is the serialised size written. Some spill is normal. Large spills multiply I/O and slow tasks dramatically. Fixes, in order:
1. **Smaller partitions:** more shuffle partitions, or AQE advisory size.
2. **Less data per task:** filter and project earlier, fix skew.
3. **More memory per task:** more heap per core, or fewer cores per executor.

## Out-of-memory errors decoded
| Error | Where | Usual cause | Fix |
|---|---|---|---|
| java.lang.OutOfMemoryError: Java heap space | Executor | Huge partition, giant record, skew, big broadcast | More partitions, fix skew, smaller broadcast |
| Container killed … exceeding memory limits | Executor | Off-heap use: Python workers, Netty buffers, native libs | Raise memoryOverhead / pyspark.memory |
| GC overhead limit exceeded | Executor | Heap almost full, constant GC | Smaller partitions, more memory, fewer cores per executor |
| OutOfMemoryError on the driver | Driver | collect(), toPandas(), large broadcast build, huge plans | Don't collect big data; raise driver memory; fewer files in plan |

## Sizing executors
:::lanes Three sizing styles
# Fat executors (30+ cores, 200 GB)
Few JVMs, big heaps :: long garbage-collection pauses
One failure loses a lot :: of cached and shuffle data
HDFS / S3 client throughput limits :: per JVM
# Tiny executors (1 core, 4 GB)
Many JVMs :: overhead per executor adds up
Broadcasts copied to every executor :: lots of memory
No sharing within an executor :: less efficient
# Balanced (4-5 cores, 4-8 GB per core)
Good parallelism per JVM :: moderate heap
Common sweet spot :: start here and measure
:::
Worked example for nodes with 32 cores and 256 GB:
- Leave 1 core and ~8 GB for the OS and node agents: 31 cores, ~248 GB usable.
- 5 cores per executor → 6 executors per node (30 cores).
- 248 GB ÷ 6 ≈ 41 GB per executor container → heap ~37 GB + overhead ~4 GB.
- Memory per task ≈ (37 − 0.3) × 0.6 ÷ 5 ≈ 4.4 GB.

## Driver memory
The driver holds the plan, task metadata, accumulator values, results of «collect()», and builds broadcast tables. Planning a scan over millions of files also needs driver memory. Keep collect() for small results; write large outputs from executors.

## Dynamic allocation
«spark.dynamicAllocation.enabled» adds executors when tasks queue up and removes idle ones, which saves money on spiky jobs. It needs the external shuffle service or shuffle tracking so removed executors' shuffle files remain available.

:::tip PySpark specifics
Python UDFs and pandas UDFs run in separate Python processes outside the JVM heap. Their memory counts against overhead (or «spark.executor.pyspark.memory»). For PySpark-heavy jobs, overhead of 15-25% of the heap is common.
:::`,
iq:[
 ["B","What is a spill?","When a task's sort buffers or hash tables outgrow its share of execution memory, Spark writes sorted data to local disk and merges it later. It's correct but slow; large spills mean partitions are too big or memory per task too small."],
 ["I","Executors are killed for exceeding container memory limits, but the heap isn't full. Why?","The container limit includes off-heap memory: JVM internals, Netty buffers, and especially Python worker processes in PySpark. Raise spark.executor.memoryOverhead (or set spark.executor.pyspark.memory), or reduce memory used by UDFs."],
 ["I","How is unified memory shared between execution and storage?","Both use spark.memory.fraction of the heap. Execution can borrow free storage memory and evict cached blocks above the storageFraction-protected region; storage can use free execution memory but can't evict it. If execution can't get memory, it spills."],
 ["S","Size executors for 10 nodes with 32 cores and 256 GB each.","Reserve a core and some memory per node for the OS, use about 5 cores per executor for 6 executors per node, give each container about 41 GB split into ~37 GB heap and ~4 GB overhead (more for PySpark). That's 60 executors and 300 cores, with ~4.4 GB of execution memory per task. Then tune shuffle partitions so partitions fit."]
],
take:["Container memory = heap + overhead (+ Python); the heap is only part of it.","Memory per task ≈ unified memory ÷ cores; spills mean partitions don't fit.","4-5 cores per executor with enough overhead is a strong default."]},

{id:"q2", kind:"quiz", title:"Act II checkpoint", mins:4,
questions:[
 {q:"With 4,000 shuffle partitions, which reducer gets key K?", o:["The least busy one","pmod(hash(K), 4000)","A random one","The one on the same node"], a:1, e:"Hash partitioning is deterministic: the same key always goes to the same partition."},
 {q:"Shuffling 1 TB: a sensible starting number of shuffle partitions?", o:["200","~5,000","1,000,000","1"], a:1, e:"1 TB ÷ ~200 MB ≈ 5,000; with AQE you can set it higher and let it coalesce."},
 {q:"LEFT OUTER JOIN payments (2 TB) with merchants (40 MB). What can be broadcast?", o:["Payments","Merchants","Both","Neither"], a:1, e:"In a left outer join only the right side can be broadcast."},
 {q:"Max task 46 min, median 31 s, max shuffle read 180 GB. First diagnosis?", o:["Too few executors","Data skew","Small files","Driver OOM"], a:1, e:"One partition holds far more data than the rest."},
 {q:"A groupBy is skewed on one merchant. Best fix?", o:["AQE skew join","Two-phase (salted) aggregation","Speculation","More driver memory"], a:1, e:"AQE skew join handles joins, not aggregations; aggregate by (key, salt), then by key."},
 {q:"PySpark executors are killed for exceeding memory limits. First knob?", o:["spark.executor.memoryOverhead","spark.sql.shuffle.partitions","spark.driver.cores","autoBroadcastJoinThreshold"], a:0, e:"Python workers use memory outside the JVM heap, counted against overhead."}
]},

/* ======================= BOSS ======================= */
{id:"boss", kind:"boss", title:"Boss: The Nightly Job", mins:20,
sum:"Six symptoms, six fixes, one deadline. Bring the 4 h 10 min job under 45 minutes before 6 AM.",
scene:[
 ["arjun","It's Thursday. Board meeting at 9. I need the numbers by 6 AM, no excuses."],
 ["priya","You know everything you need now. The job will throw its problems at you one at a time. Read each symptom like the Spark UI shows it and pick the fix."],
 ["ravi","Wrong fixes cost time. Run out of lives and we're explaining to the board."],
 ["you","Let's go."]
],
game:{id:"nightlyBoss", title:"The Nightly Job"},
codex:`## The performance playbook
Every Spark performance problem can be handled with the same loop:
:::flow Measure, classify, fix, repeat
Measure :: find the stage that dominates job time
Classify :: is it I/O, shuffle volume, skew, spill, join strategy, or output layout?
Fix the cause :: not the symptom, and change one thing at a time
Re-measure :: the bottleneck moves; find the next one
Stop at the target :: 45 minutes, not "as fast as possible"
:::

## Symptom → cause → fix
| What the UI shows | Likely cause | Fix |
|---|---|---|
| Tens of thousands of sub-second tasks reading tiny inputs | Small files | Compact files; write with distribution mode and target file size |
| Whole table scanned for one day's data | No partition pruning | Filter on the partition column early; avoid functions on it |
| SortMergeJoin with a small side, terabytes of shuffle write | Bad size estimate | Broadcast hint, refresh statistics, AQE |
| Max task ≫ median, one task reads 100+ GB | Skew | Handle NULLs, AQE skew join, salting, two-phase aggregation |
| Huge "Spill (disk)", GC time high | Partitions too big for memory per task | More shuffle partitions, better executor sizing |
| Output of tens of thousands of files | Every task writes every partition value | Repartition by partition column before write |
| A cached DataFrame used once | Unnecessary cache | Remove it; free memory for execution |
| Executors lost, FetchFailed | Unstable nodes holding shuffle files | On-demand core nodes, decommissioning, remote shuffle |

## Before you scale up
Doubling the cluster rarely halves the time: skewed stages stay skewed, small-file overhead stays, and the bill doubles every night. Fix layout, joins and skew first; scale only for what's left.

## After the fix: keep it fixed
- Add the job's runtime and per-stage durations to a dashboard and alert on regressions.
- Schedule compaction for the source table.
- Keep statistics fresh on dimension tables.
- Record the reasoning in the repo: the next person will thank you.`,
iq:[
 ["S","Walk me through how you'd speed up a slow Spark job.","Find the dominant stage in the Spark UI, then classify the problem: small files and I/O, missing pruning, shuffle volume and join strategy, skew (max ≫ median task), spills (partition too big for memory per task), or output layout. Fix the cause in that stage, re-measure, and repeat until the target is met; scale the cluster only for what remains."],
 ["S","Why doesn't doubling the cluster halve the runtime?","Skewed stages are limited by their largest task, small-file overhead and S3 request limits don't shrink, driver-side planning stays the same, and shuffles get more blocks. Only well-balanced, CPU-bound stages scale linearly, while cost always doubles."]
],
take:["Measure → classify → fix → re-measure.","Layout, pruning, joins and skew beat cluster size.","Lock in wins with monitoring and scheduled maintenance."]}
]}
]};
})();
