QUEST.zone("spark", {
mission:["priya","Our nightly payments job takes **4 h 10 min** and Finance needs it by 6 AM. Learn how Spark really runs, level by level, then rescue the job in the boss fight."],
levels:[
{t:"Lazy plans", sub:"Transformations vs actions", rounds:[
 ["learn","DataFrames are recipes","A DataFrame holds a **logical plan**, not data. «filter», «select», «join» only add nodes to the plan. Nothing runs until an **action** asks for a result.",["Your code builds a plan","An action is called","Catalyst optimises","Tasks run on executors"]],
 ["sort","Does this line run a job?",{"Only builds the plan":["df.filter(...)","df.cache()","df.explain()","df.columns","df.repartition(200)"],"Runs a job":["df.count()","df.show()","df.write.parquet(p)","df.toPandas()","df.checkpoint()"]},"cache() is lazy (the next action fills it); checkpoint() is eager by default."],
 ["learn","Catalyst rewrites your plan","Before running, Catalyst applies rules: **predicate pushdown** (filters move into the scan), **column pruning** (unused columns dropped), constant folding and merging adjacent filters. Then the planner picks physical operators.",["Unresolved plan","Analysis (catalog)","Logical optimisation","Physical planning","Code generation"]],
 ["order","Put Spark's query pipeline in order",["Parse code into an unresolved logical plan","Resolve tables and columns against the catalog","Apply Catalyst optimisation rules","Choose physical operators (e.g. join type)","Generate Java bytecode for each stage","Run tasks on executors"],"Analysis → optimisation → physical planning → codegen → execution."],
 ["pick","Which filter can be pushed into a Parquet scan?",["«WHERE dt = '2026-11-16'»","«WHERE my_udf(dt) = 1»","«WHERE date_format(ts,'yyyy') = '2026'»","«WHERE CAST(amount AS STRING) LIKE '9%'»"],0,"A plain comparison on a column can be pushed down. Functions and UDFs wrapped around the column hide it from pushdown."],
 ["learn","Read explain() like a pro","Run «df.explain('formatted')». Check **PushedFilters** and **PartitionFilters** on the scan, that **Output** lists only needed columns, how many **Exchange** nodes there are (each is a shuffle), and the join operator names."],
 ["bug","This nightly job reads the input twice. Which line causes it?",["raw = spark.read.parquet(src).filter('dt = :d')","print('rows:', raw.count())","clean = raw.dropDuplicates(['payment_id'])","clean.write.mode('overwrite').parquet(out)"],1,"count() is a separate action, so the plan runs once for count and again for write. Remove it, or cache raw if you really need both."],
 ["tf","Lazy or not?",[["«df.cache()» immediately loads data into memory.",false,"It only marks the DataFrame; the next action fills the cache."],["UDFs block predicate pushdown.",true,"Catalyst can't see inside a UDF."],["«inferSchema» on CSV triggers a scan.",true,"Spark reads data to guess types; declare a schema instead."],["Whole-stage codegen fuses operators into one loop.",true,"Operators marked *(n) run inside generated stage n."]]]
]},
{t:"Plan or Run?", arcade:"planOrRun", sub:"Speed sorter"},
{t:"Partitions & small files", sub:"Splits, tasks, waves", rounds:[
 ["learn","One partition = one task","Spark splits input into partitions; each becomes a **task** that runs on one core. Tasks run in **waves**: waves ≈ tasks ÷ total cores. The stage ends when the slowest task ends.",["Files → partitions","Partitions → tasks","Tasks → cores","Waves until done"]],
 ["pick","500 GB in 128 MB partitions on 200 cores. How many waves?",["About 2","About 20","About 200","About 4,000"],1,"500 GB ÷ 128 MB ≈ 4,000 tasks; 4,000 ÷ 200 cores = 20 waves."],
 ["learn","How Spark sizes input splits","«maxSplitBytes = min(maxPartitionBytes, max(openCostInBytes, bytes ÷ parallelism))». Defaults: 128 MB and 4 MB. Small files are packed together, each counted as at least 4 MB. Gzip CSV can't be split: one file, one task."],
 ["fill","Complete the split-size formula",'maxSplitBytes = min(___, max(___, totalBytes / defaultParallelism))',["maxPartitionBytes","openCostInBytes"],["shuffle.partitions","blockSize"],"The open cost stops tiny files from becoming tiny tasks."],
 ["learn","Why small files hurt","Each file costs a LIST entry, an open request, a footer read and a metadata entry. Two million tiny files mean slow planning, 60,000+ tasks and S3 503 Slow Down errors. Compact them where they are written."],
 ["sort","Fixes for small files: does it help?",{"Helps":["Iceberg rewrite_data_files","repartition by dt before write","write.target-file-size-bytes","Longer streaming trigger interval"],"Doesn't fix the cause":["Enable speculation","Add more executors","Raise driver memory"]},"Fix where files are written, and compact what already exists."],
 ["match","repartition vs coalesce",[["repartition(n)","Full shuffle, even partitions, can increase n"],["coalesce(n)","No shuffle, merges neighbours, only decreases n"],["repartition('dt')","Hash by column so each date goes to few tasks"],["sortWithinPartitions","Sorts locally, no shuffle"]],"Use coalesce at the very end to cut file count cheaply; repartition when you need balance."],
 ["pick","A stage shows 69,000 tasks with a median of 0.9 s. Most likely cause?",["Data skew","Too-big partitions","Millions of small files","Not enough memory"],2,"Tens of thousands of sub-second tasks is the classic small-files signature."]
]},
{t:"Partition Packer", arcade:"packer", sub:"Bin-packing puzzle"},
{t:"Stages & shuffles", sub:"Narrow vs wide", rounds:[
 ["learn","Narrow vs wide","**Narrow**: each output partition needs one input partition (filter, select, union). **Wide**: it needs rows from many partitions (groupBy, join, distinct, orderBy), so Spark must **shuffle** and starts a new stage."],
 ["sort","Narrow or wide?",{"Narrow (same stage)":["filter","withColumn","union","coalesce(10)","sortWithinPartitions","explode"],"Wide (shuffle)":["groupBy().agg()","distinct()","orderBy()","repartition(400)","Window.partitionBy()"]},"Every wide op is an Exchange in the plan and a stage boundary."],
 ["learn","Partial aggregation","For «groupBy(k).sum(x)», each task first aggregates its own rows, so only one row per key per task is shuffled. That's why aggregations often shuffle far less than joins."],
 ["pick","Which join does NOT shuffle the big table?",["Sort-merge join","Shuffle hash join","Broadcast hash join","Full outer join"],2,"The small side is copied to every executor; the big side stays put."],
 ["learn","Stage boundaries in the DAG","The DAG scheduler walks back from the action. Every wide dependency ends a **ShuffleMapStage** that writes shuffle files; narrow ops are pipelined inside one stage. The last stage is the **ResultStage**."],
 ["order","How Spark recovers when an executor dies",["Reducer can't fetch a block: FetchFailed","Driver marks those map outputs as lost","Parent stage re-runs only the missing map tasks","Failed stage retries and reads the new blocks"],"Lineage lets Spark recompute just what was lost."],
 ["tf","Stages",[["A window without PARTITION BY runs in one task.",true,"All rows must meet in one partition."],["union() triggers a shuffle.",false,"Partitions are just concatenated."],["Skipped stages reuse earlier shuffle files.",true,"Same lineage, so Spark skips recomputing."],["coalesce() always keeps upstream parallelism.",false,"Placed early, it can shrink the whole stage to n tasks."]]]
]},
{t:"Shuffle Hunter", arcade:"shuffleHunter", sub:"Catch the shuffles"},
{t:"Inside a shuffle", sub:"Hashing, M × R, AQE", rounds:[
 ["learn","Who gets which row?","For hash partitioning, «target = pmod(hash(key), numPartitions)». Same key, same reducer, every time. Change the partition count and almost every key moves.",["Map task computes hash(key) % R","Writes one sorted file + index","Reducers fetch their block from every mapper"]],
 ["pick","4,000 map tasks and 4,000 reduce partitions. How many shuffle blocks?",["8,000","4,000","16 million","64,000"],2,"Every reducer reads one block from every mapper: M × R. Tiny blocks mean millions of small random reads."],
 ["learn","Size shuffle partitions by data","Target ~100–300 MB per partition: partitions ≈ shuffled bytes ÷ 200 MB. With **AQE** on, set a generous number and let it coalesce small partitions at runtime to «advisoryPartitionSizeInBytes»."],
 ["fill","Let AQE coalesce shuffle partitions",'spark.conf.set("spark.sql.___.enabled", "true")\nspark.conf.set("spark.sql.adaptive.___.enabled", "true")\nspark.conf.set("spark.sql.adaptive.advisoryPartitionSizeInBytes", "___")',["adaptive","coalescePartitions","256m"],["broadcast","speculation","4k"],"AQE re-plans at each shuffle boundary using real sizes."],
 ["match","Shuffle helpers",[["External shuffle service","Serves shuffle files after an executor is removed"],["Push-based shuffle","Mappers push blocks to be merged per reducer"],["Remote shuffle service","Shuffle data lives on dedicated servers (Celeborn, Uniffle)"],["Graceful decommission","Migrates shuffle blocks off nodes being reclaimed"]],"All four protect or speed up shuffle data, especially on spot nodes."],
 ["pick","Spot nodes keep disappearing and stages fail with FetchFailed. Best first fix?",["More shuffle partitions","Enable decommissioning with shuffle migration (or a remote shuffle service)","Bigger driver","Turn off compression"],1,"The lost nodes held shuffle files. Move or externalise them."],
 ["tf","Shuffle facts",[["spark.sql.shuffle.partitions defaults to 200.",true,"A placeholder; size it to your data."],["Shuffle files live in executor memory only.",false,"They're written to local disk."],["Compressing shuffle data is on by default.",true,"LZ4 by default; zstd compresses better."]]]
]},
{t:"Hash Router", arcade:"hashRouter", sub:"Be the partitioner"},
{t:"Join strategies", sub:"Broadcast, SMJ, SHJ, BNLJ", rounds:[
 ["learn","Four join strategies","**Broadcast hash**: copy the small side everywhere, no shuffle of the big side. **Sort-merge**: shuffle both, sort, merge (safe for any size). **Shuffle hash**: shuffle both, hash the smaller per partition. **Broadcast nested loop**: for non-equi joins."],
 ["match","Which strategy fits?",[["2 TB × 40 MB, equi-join","Broadcast hash join"],["3 TB × 3 TB","Sort-merge join"],["ts BETWEEN from AND to, small side","Broadcast nested loop"],["800 GB × 6 GB, build side fits per partition","Shuffle hash join"]],"Size and join condition decide the strategy."],
 ["learn","Which side can be broadcast?","Inner: either. Left outer / semi / anti: **right only**. Right outer: left only. Full outer: **neither**. The preserved side must see the whole other side to emit non-matches correctly."],
 ["pick","«merchants (30 MB) LEFT JOIN payments (2 TB)». What can Spark broadcast?",["merchants","payments","Both","Neither usefully: payments is the only legal side and it's 2 TB"],3,"Left joins can only broadcast the right side, and that's 2 TB, so this becomes a sort-merge join. Flip the join if the semantics allow."],
 ["learn","Bad estimates, bad joins","Spark decides from estimated sizes. Stale stats make small tables look big. Fix with «ANALYZE TABLE … COMPUTE STATISTICS», a «broadcast()» hint, or AQE converting a sort-merge join to broadcast at runtime."],
 ["fill","Force a broadcast join",'from pyspark.sql import functions as F\nenriched = pay.join(F.___(mer), "merchant_id", "___")',["broadcast","left"],["cache","full_outer","repartition"],"A left join may broadcast its right side (mer)."],
 ["bug","Which line makes this join explode in cost?",["pay = spark.table('pay').filter('dt = :d')","rates = spark.table('fx_rates')","j = pay.join(rates, (pay.ts >= rates.valid_from) & (pay.ts < rates.valid_to))","j.write.saveAsTable('pay_fx')"],2,"A pure range condition has no equality key: with two big sides it's a nested loop / cartesian. Add an equi-key like a day bucket, or broadcast rates if small."]
]},
{t:"Join Duel", arcade:"joinDuel", sub:"Beat the Slow Query"},
{t:"Taming skew", sub:"Hot keys and fixes", rounds:[
 ["learn","Spot skew in the UI","In a stage's task summary, **max ≫ median** for duration and shuffle read. One task chews 180 GB while the rest finish in 30 s. Speculation won't help: the copy reads the same data."],
 ["sort","Which fix for which skew?",{"Skewed join":["AQE skew join","Salt key + replicate small side","Broadcast the other side"],"Skewed groupBy":["Two-phase aggregation with a salt"],"Any skew":["Filter NULL / junk keys first"]},"AQE skew join only handles joins; aggregations need two-phase."],
 ["learn","Salting a join","Add «salt = rand() × N» to the hot side, explode the small side into N copies with salt 0…N-1, join on (key, salt), drop salt. The hot key now spreads across N partitions.",["Pick N from the skew ratio","Big side: random salt","Small side: replicate N×","Join on key + salt"]],
 ["fill","Two-phase aggregation",'step1 = pay.withColumn("salt", (F.rand() * 16).cast("int"))\\\n  .groupBy("merchant_id", "___").agg(F.sum("amount").alias("part"))\nstep2 = step1.groupBy("___").agg(F.sum("___").alias("gmv"))',["salt","merchant_id","part"],["amount","dt"],"Aggregate by (key, salt) first, then by key."],
 ["pick","Max task 46 min, median 31 s, 10% of rows have NULL merchant_id. First move?",["Enable speculation","Filter or separate the NULL keys","Double executors","Raise broadcast threshold"],1,"NULL keys never match in an inner join but all hash to one partition."],
 ["tf","Skew truths",[["AQE skew join fixes skewed aggregations.",false,"It splits skewed join partitions only."],["Salting multiplies the small side by N.",true,"So salt only the hot keys when you can."],["Averages need sum and count in two-phase aggregation.",true,"Average isn't associative; sum and count are."]]]
]},
{t:"Skew Smasher", arcade:"skewSmasher", sub:"Budget puzzle"},
{t:"Memory & executors", sub:"Spills, OOMs, sizing", rounds:[
 ["learn","Executor memory layout","Container = **heap + overhead** (+ PySpark memory). Heap: 300 MB reserved, then «memory.fraction» 0.6 is unified memory shared by execution (joins, sorts) and storage (cache). Overhead holds JVM internals, buffers and Python workers.",["Heap (spark.executor.memory)","Reserved 300 MB","Unified 60%: execution + storage","User 40%","Overhead: max(384 MB, 10%)"]],
 ["pick","Memory per task with a 16 GB heap and 4 cores?",["16 GB","~4 GB","~2.4 GB","~0.6 GB"],2,"(16 − 0.3) × 0.6 ÷ 4 ≈ 2.4 GB per task for sorts and hash tables."],
 ["match","Decode the error",[["Java heap space","Huge partition, skew or big broadcast"],["Container killed: exceeding memory limits","Off-heap use: raise memoryOverhead"],["GC overhead limit exceeded","Heap nearly full: smaller partitions or more memory"],["Driver OOM","collect(), toPandas() or a huge broadcast build"]],"Read where it failed before turning knobs."],
 ["learn","Sizing executors","Leave 1 core and some memory per node for the OS. ~5 cores per executor is a sweet spot. Fat executors mean long GC pauses; tiny ones copy broadcasts many times."],
 ["order","Size executors for 32-core, 256 GB nodes",["Reserve 1 core and ~8 GB for the OS","Pick 5 cores per executor → 6 executors per node","Split ~248 GB ÷ 6 ≈ 41 GB per container","Set heap ~37 GB and overhead ~4 GB","Size shuffle partitions so each fits ~4.4 GB per task"],"Then measure and adjust."],
 ["tf","Memory facts",[["Execution memory can evict cached blocks.",true,"Above the storageFraction-protected region."],["Python UDF memory counts against the JVM heap.",false,"Python workers live off-heap, counted in overhead."],["Large spills mean partitions don't fit memory per task.",true,"Make partitions smaller or give each task more memory."]]]
]},
{t:"Executor Fit", arcade:"executorFit", sub:"Packing puzzle"},
{t:"Boss: The Nightly Job", boss:true, time:30, rounds:[
 ["pick","Stage 0: 2.1M files, 69,212 tasks, median 0.9 s, S3 503 errors. Fix?",["Add 20 nodes","Compact the table and write with a target file size","More shuffle partitions","Enable speculation"],1,"Small files: compaction + good writes."],
 ["pick","Scan reads 38 TB for a one-day report. Filter: «date_format(created_at,'yyyy-MM-dd') = '2026-11-16'». Fix?",["Cache the table","Filter on the raw column range so pruning works","Raise maxPartitionBytes","Broadcast payments"],1,"A function around the column hides it from partition pruning."],
 ["pick","SortMergeJoin payments 2.1 TB × merchants 58 MB, stats from 2024. Fix?",["Salt ×16","Broadcast merchants and refresh stats","Double shuffle partitions","Shuffle hash with payments as build side"],1,"58 MB fits everywhere; the 2 TB side stops shuffling."],
 ["pick","HashAggregate by merchant_id: max 46 min, median 31 s, one task reads 180 GB. Fix?",["AQE skew join","Two-phase salted aggregation","Speculation","Bigger executors"],1,"AQE skew join doesn't apply to aggregations."],
 ["pick","Sort stage: Spill (disk) 3.4 TB, GC 38%, 200 partitions of 8 GB. Fix?",["coalesce(50)","~8,000 shuffle partitions with AQE coalescing","Cache before the shuffle","More driver memory"],1,"200 MB partitions fit in memory per task."],
 ["pick","Write: 48,000 files across 30 date partitions. Fix?",["coalesce(1)","Repartition by dt before writing","Disable compression","Raise maxRecordsPerFile"],1,"Each date goes to few tasks, so few, large files."]
]},
{t:"Boss arcade: The Nightly Job", arcade:"nightlyBoss", sub:"Under 45 minutes"}
]});

QUEST.more("spark", [
{act:"Expert", t:"AQE & runtime re-planning", sub:"Query stages, DPP, CBO", rounds:[
 ["learn","AQE re-plans between query stages","Adaptive Query Execution cuts the physical plan into **query stages** at every exchange. When a stage materializes, Spark reads its real **MapOutputStatistics** and re-optimizes the rest of the plan before running it.",["Split plan at exchanges","Run leaf stages","Collect real sizes per partition","Re-optimize remaining plan","Repeat"],null,`AQE has been on by default since Spark 3.2 («spark.sql.adaptive.enabled»). It can only use facts that exist **after** a shuffle or broadcast has been materialized, so the first scan stage is planned with static estimates.

### The three runtime optimizations
- **Coalesce shuffle partitions:** merges adjacent small reduce partitions up to «advisoryPartitionSizeInBytes» (default 64 MB), never below «coalescePartitions.minPartitionSize» (1 MB). Start from a high «initialPartitionNum» and let AQE shrink.
- **Switch join strategy:** if a join side's real size is below «spark.sql.adaptive.autoBroadcastJoinThreshold», a planned sort-merge join becomes a broadcast hash join. The **local shuffle reader** then reads the already-written shuffle files locally instead of over the network. If every partition is small enough («maxShuffledHashJoinLocalMapThreshold»), it can switch to shuffled hash join instead.
- **Split skewed partitions:** a partition is skewed if it's larger than «skewedPartitionFactor» (5) × median **and** larger than «skewedPartitionThresholdInBytes» (256 MB). AQE splits it by map-output ranges and replicates the matching partition on the other side.

### What AQE can't do
It can't fix the first stage's file split, can't split a skewed **aggregation** partition, and can't remove a shuffle that was already written: switching to broadcast after the fact still paid for writing the shuffle (the local reader just saves the network fetch).

In the Spark UI, look for «AdaptiveSparkPlan isFinalPlan=true», «AQEShuffleRead coalesced / skewed», and «BroadcastHashJoin» nodes that didn't exist in the initial plan.`],
 ["sort","Which AQE feature handles it?",{"Coalesce partitions":["2,000 reduce partitions of 3 MB each","Over-provisioned shuffle.partitions=8000"],"Switch to broadcast":["Filtered dimension turned out to be 12 MB","Join side estimated 4 GB, actually 40 MB"],"Skew join split":["One SMJ partition is 90 GB, median 300 MB"],"None of them":["Skewed groupBy final aggregation","Two million tiny input files"]},"AQE only acts on shuffle/broadcast statistics."],
 ["learn","Dynamic partition pruning","Fact table partitioned by «dt», joined to a dimension filtered to one week. **DPP** turns the dimension's filtered keys into a runtime filter on the fact scan, so only matching partitions are read.",null,null,`Without DPP, the filter applies to the dimension only, and the fact table (say 3 years, 1,095 date partitions) is fully scanned and then joined.

With DPP («spark.sql.optimizer.dynamicPartitionPruning.enabled», default true), Spark inserts a «dynamicpruningexpression» on the fact scan. When the dimension side is broadcast, Spark **reuses the broadcast** results as the filter, so it's almost free. Otherwise it may run a subquery if the estimated benefit is high («reuseBroadcastOnly»).

### Requirements
- The fact table must be **partitioned on the join key** (or Iceberg/Delta with partition transforms Spark understands).
- The dimension side must have a selective filter.
- It's an equi-join.

### How to see it
«explain()» shows «PartitionFilters: [isnotnull(dt), dynamicpruningexpression(dt IN dynamicpruning#123)]». In the SQL tab the fact scan's "number of partitions read" drops from 1,095 to 7.`],
 ["pick","Fact «sales» partitioned by «store_id» joins «stores» filtered to city='Hyderabad'. DPP doesn't kick in. Most likely reason?",["The join key isn't the fact table's partition column","AQE is on","The dimension is too small","Parquet doesn't support DPP"],0,"DPP prunes partitions, so the fact must be partitioned on the join key. Here it is store_id — check the join is on store_id and the filter is selective; if the join is on another column, no pruning happens."],
 ["learn","Statistics and CBO","Static planning depends on **statistics**: table size, row count, and with CBO, per-column distinct counts, nulls, min/max and histograms. Bad stats → wrong broadcast decisions and join order.",null,null,`### Where estimates come from
- No stats: «sizeInBytes» from file sizes, scaled by «spark.sql.sources.fileCompressionFactor». A filter doesn't reduce the estimate much without column stats.
- «ANALYZE TABLE t COMPUTE STATISTICS» → size and row count.
- «ANALYZE TABLE t COMPUTE STATISTICS FOR COLUMNS a, b» → distinct count, min, max, null count, avg/max length; histograms with «spark.sql.statistics.histogram.enabled».

### Cost-based optimizer
«spark.sql.cbo.enabled=true» uses column stats for selectivity estimates. «spark.sql.cbo.joinReorder.enabled=true» reorders inner joins (dynamic programming up to «joinReorder.dp.threshold», 12 tables) to keep intermediate results small. Star-schema detection («starSchemaDetection») puts the fact table and the most selective dimensions in a good order.

### Practical rule
Keep stats fresh on dimensions you join a lot, use broadcast hints for known-small tables, and let AQE fix the rest at runtime. Iceberg tables expose snapshot-level row counts and file sizes to Spark, and can carry Puffin NDV sketches.`],
 ["num","Fact table: 3 years of daily partitions (1,095). DPP prunes to a 7-day dimension filter. What fraction of partitions is read? (percent, 1 decimal)",0.6,0.1,"%","7 / 1,095 ≈ 0.64%. DPP turns a full scan into reading under 1% of partitions."],
 ["fill","Let AQE coalesce from a high start and handle skew",'spark.conf.set("spark.sql.adaptive.coalescePartitions.___", "8000")\nspark.conf.set("spark.sql.adaptive.advisoryPartitionSizeInBytes", "256m")\nspark.conf.set("spark.sql.adaptive.skewJoin.skewedPartition___", "5")\nspark.conf.set("spark.sql.adaptive.skewJoin.skewedPartitionThresholdInBytes", "256m")',["initialPartitionNum","Factor"],["maxPartitionNum","Ratio","minPartitionNum"],"initialPartitionNum overrides shuffle.partitions as AQE's starting point."],
 ["tf","AQE edge cases",[["AQE can re-plan the very first scan stage.",false,"It needs materialized exchange statistics."],["After switching SMJ to broadcast, the already-written shuffle is still paid for.",true,"The local reader only avoids network fetch."],["Skew join handling applies to full outer joins on both sides.",false,"Splitting is limited by join type: e.g. left outer can split only the left side."]]]
]},
{act:"Expert", t:"Tungsten memory & codegen", sub:"UnsafeRow, pages, spills", rounds:[
 ["learn","UnsafeRow layout","Tungsten stores rows as contiguous bytes, not Java objects: a **null bitset**, then **8 bytes per field**, then a **variable-length region**.",["Null bitset: 8 bytes per 64 fields","Fixed region: 8 bytes per field","Variable region: strings, arrays, structs"],null,`### Layout in detail
- **Null-tracking bitset:** one bit per field, rounded up to 8-byte words. 1–64 fields → 8 bytes, 65–128 → 16 bytes.
- **Fixed-length region:** each field gets one 8-byte slot. Primitives (int, long, double, date, timestamp) live directly in it.
- **Variable-length region:** for strings, binary, decimals with precision > 18, arrays, maps, nested structs. The fixed slot stores **offset (upper 32 bits) and size (lower 32 bits)** pointing into this region, which is word-aligned.

### Why it matters
- No per-field object headers: a Java «Long» costs 16 bytes plus a reference; in UnsafeRow it's 8 bytes.
- Equality and hashing work on raw bytes, which is why hash aggregation and sort can be so fast.
- Memory estimates: a row of 10 longs is 8 + 80 = 88 bytes. Add a 20-character UTF-8 string and you add 8 (slot) + 24 (20 bytes rounded up to 8) = 32 bytes.

Cached DataFrames use a different, columnar compressed format (InMemoryRelation with column batches), not UnsafeRows.`],
 ["num","An UnsafeRow has 12 fields, all longs/ints/doubles. How many bytes?",104,0,"bytes","Null bitset 8 bytes (12 ≤ 64 fields) + 12 × 8 bytes fixed region = 104 bytes."],
 ["learn","Task memory and spilling","Each task's **TaskMemoryManager** hands out memory **pages** to **MemoryConsumers** (sorters, hash maps). When a consumer can't get more execution memory, Spark asks consumers (itself first, or others) to **spill** to disk.",["Consumer asks for a page","Execution pool full?","Spill the largest consumers to disk","Retry allocation","If still impossible: OOM"],null,`### The sort path
«UnsafeExternalSorter» keeps records in pages and a separate **pointer array**: for each record, an 8-byte pointer and an 8-byte **key prefix**. Sorting compares prefixes first (radix sort when possible) and only dereferences full records on ties. When memory runs out it writes a sorted **spill file**; at the end it merges the in-memory data with all spill files.

### The aggregation path
«UnsafeFixedWidthAggregationMap» / «BytesToBytesMap» is a hash map in pages. If it can't grow, hash aggregation **falls back to sort-based aggregation**: the map is sorted and spilled, and the remaining input goes through an external sorter. You'll see "spill size" and sometimes a much slower task.

### Execution memory fairness
With N active tasks on an executor, each task is guaranteed at least 1/(2N) of the execution pool and can take up to 1/N. A task that can't get its minimum waits; one that hits 1/N spills.

### Reading the UI
"Spill (memory)" is the deserialized size spilled; "Spill (disk)" is the bytes written, usually much smaller. Peak execution memory per task in the stage's task metrics tells you how close you are.`],
 ["pick","With 4 tasks running on an executor, the most execution memory one task can hold is…",["All of it","1/2 of the pool","1/4 of the pool","1/8 of the pool"],2,"Each of N active tasks can use up to 1/N of the execution pool (and is guaranteed 1/(2N)). Then it spills."],
 ["learn","Whole-stage codegen limits","Whole-stage codegen generates one Java method per stage. Very wide schemas or huge expressions can make it slower or switch it off.",null,null,`### Limits to know
- **«spark.sql.codegen.maxFields» (100):** if a stage's output schema has more fields, whole-stage codegen is disabled for it.
- **HugeMethodLimit:** the JVM's JIT won't compile methods larger than 8,000 bytes of bytecode, so they run interpreted (very slow). Spark checks generated methods against «spark.sql.codegen.hugeMethodLimit» (65,535 by default) and falls back to non-codegen execution if exceeded.
- **«spark.sql.codegen.fallback» (true):** if compilation fails, Spark falls back to interpreted mode instead of failing.
- CASE WHEN with hundreds of branches, or 500-column transformations in one select, are classic triggers.

### Symptoms and fixes
- Operators missing the «*(n)» prefix in explain output.
- Log warnings like "Whole-stage codegen disabled for plan … because the number of fields exceeds".
- Fix by splitting very wide transformations into stages, using maps/arrays instead of thousands of columns, or replacing giant CASE chains with a join against a lookup table.`],
 ["sort","Effect on code generation",{"Keeps codegen efficient":["Built-in functions","Narrow projections","Lookup table join instead of 400-branch CASE"],"Breaks or hurts codegen":["Python UDF in the middle of a stage","Schema with 300 output fields","Single expression generating 70 KB of bytecode"]},"Codegen likes small, typed, built-in expressions."],
 ["tf","Tungsten truths",[["Spill (disk) is usually smaller than Spill (memory).",true,"Disk bytes are serialized and compressed."],["Hash aggregation can fall back to sort-based aggregation under memory pressure.",true,"It sorts and spills the map."],["A task always gets exactly memory ÷ cores.",false,"Between 1/(2N) and 1/N of the pool for N active tasks."]]]
]},
{act:"Expert", t:"Shuffle machinery", sub:"Writers, fetch, failures", rounds:[
 ["learn","How Spark picks a shuffle writer","Three writers, chosen per shuffle. The choice decides whether records are sorted, serialized once, or written to one file per reducer.",null,null,`| Writer | Conditions | How it works |
|---|---|---|
| BypassMergeSortShuffleWriter | No map-side combine and reduce partitions ≤ «spark.shuffle.sort.bypassMergeThreshold» (200) | Opens one file per reducer, writes records unsorted, concatenates into one data file + index |
| UnsafeShuffleWriter (serialized) | Serializer supports relocation (Kryo/UnsafeRow), no map-side combine, ≤ 16,777,216 partitions | Serializes each record once; sorts only 8-byte pointers packed with the 24-bit partition id |
| SortShuffleWriter | Everything else (e.g. RDD reduceByKey with map-side combine) | ExternalSorter on deserialized objects, spills and merges |

### Why 16,777,216?
The serialized sorter packs the partition id into **24 bits** of the 8-byte record pointer (the rest is page number and offset), so the maximum is 2^24 partitions.

### Output
Every writer ends with **one data file + one index file** per map task. The index holds R+1 offsets so a reducer can seek straight to its block. Since Spark 3.2, shuffle **checksums** let Spark diagnose whether corruption came from disk or network.`],
 ["num","A shuffle with 150 reduce partitions and no map-side combine. Which writer threshold applies? Enter the default bypassMergeThreshold.",200,0,"partitions","150 ≤ 200, so Spark can use the bypass writer: one temp file per reducer, no sort."],
 ["learn","Reduce-side fetching","Each reducer's **ShuffleBlockFetcherIterator** fetches local blocks directly and remote blocks over Netty, limited by bytes and requests in flight.",["Ask MapOutputTracker for block locations","Read local blocks from disk","Fetch remote blocks in parallel (≤ maxSizeInFlight)","Merge into the aggregation/sort","Retry or FetchFailed on errors"],null,`### Knobs
- «spark.reducer.maxSizeInFlight» (48 MB): total bytes being fetched at once per reducer. Each request targets about a fifth of this.
- «spark.reducer.maxReqsInFlight» (unlimited) and «spark.reducer.maxBlocksInFlightPerAddress» (unlimited): cap concurrent requests/blocks per remote host, useful when thousands of reducers hammer one external shuffle service.
- «spark.shuffle.io.maxRetries» (3) and «spark.shuffle.io.retryWait» (5 s): retries for transient network errors before giving up.
- «spark.maxRemoteBlockSizeFetchToMem»: very large blocks are streamed to disk instead of memory.

### FetchFailed vs task failure
A normal task failure retries the task (up to «spark.task.maxFailures», 4). A **FetchFailedException** is different: Spark assumes the **map output is lost**, unregisters it, re-runs the parent map tasks that produced it, and then retries the reduce stage (up to «spark.stage.maxConsecutiveAttempts», 4). Repeated FetchFailed on the same host usually means a dying node, full disk, or an overloaded shuffle service.

### Large blocks and skew
A single block over 2 GB used to fail outright; modern Spark streams large blocks, but huge skewed blocks still mean long fetches and memory pressure — fix the skew.`],
 ["order","What happens after a FetchFailedException",["Reducer task reports FetchFailed for map output on host X","DAGScheduler marks that map output as lost","Reduce stage is cancelled and marked for resubmission","Missing map tasks in the parent stage re-run","Reduce stage re-runs and fetches the new blocks"],"FetchFailed fails the stage, not just the task."],
 ["match","Symptom → knob or fix",[["Reducers overwhelm one shuffle service host","maxBlocksInFlightPerAddress / maxReqsInFlight"],["Transient network blips kill stages","shuffle.io.maxRetries and retryWait"],["Reducer OOM while fetching","Lower maxSizeInFlight, smaller partitions"],["FetchFailed loops on spot nodes","Decommissioning with shuffle migration or remote shuffle service"]],"Fix the cause first, then tune."],
 ["pick","A job has 25,000 map tasks and 25,000 reducers with 1 TB shuffled. Average block size?",["~1.6 KB","~40 MB","~1.6 MB","~400 KB"],0,"625 million blocks for 1 TB ≈ 1.6 KB each: a disaster of tiny reads. Cut M (bigger input splits) and let AQE coalesce R."]
]},
{act:"Expert", t:"Structured Streaming internals", sub:"Checkpoints, state, watermarks", rounds:[
 ["learn","The checkpoint is the source of truth","A streaming query's checkpoint directory holds **offsets/** (planned batch ranges, written before a batch runs), **commits/** (written after it finishes), **state/**, **sources/** and **metadata**.",["Plan batch N: write offsets/N","Run batch N","Write sink output","Write commits/N"],null,`### Recovery rule
On restart, Spark looks at the latest offsets file. If **offsets/N exists but commits/N doesn't**, batch N is re-run **with exactly the same offset range**. That's how replayable sources + deterministic replay give exactly-once — as long as the **sink is idempotent**.

### Sinks and exactly-once
- **File sink:** writes files, then records them in «_spark_metadata»; readers that use the log ignore files from failed batches.
- **foreachBatch:** you get a «batchId». Make writes idempotent: «MERGE» on keys, or write to a path/partition named by batchId, or store the last committed batchId in the target and skip repeats.
- **Kafka sink:** at-least-once; duplicates possible on replay unless downstream dedups.

### Kafka source details
Offsets live in the **checkpoint**, not in Kafka consumer-group commits. «maxOffsetsPerTrigger» caps batch size. Changing the topic set or deleting the checkpoint resets progress. Never point two queries at one checkpoint.`],
 ["pick","A query crashed after writing batch 41's output but before commits/41. On restart Spark…",["Skips batch 41","Re-runs batch 41 with the same offsets","Starts from latest Kafka offsets","Fails permanently"],1,"Same offsets → same data. Your sink must tolerate the repeat."],
 ["learn","State stores","Stateful operators (aggregations, dropDuplicates, stream-stream joins, flatMapGroupsWithState / transformWithState) keep **state per key** in a versioned state store on executors, checkpointed every batch.",null,null,`### Providers
- **HDFSBackedStateStore** (default): an in-memory hash map per partition on the executor JVM heap; each batch writes a **delta** file, periodically a **snapshot**. Large state → GC pressure and OOM.
- **RocksDB provider** («spark.sql.streaming.stateStore.providerClass» = RocksDBStateStoreProvider): state on local disk with a memory cache. Handles hundreds of GB per executor. With **changelog checkpointing** it uploads only changes per batch.

### Partitioning
State is partitioned by «spark.sql.shuffle.partitions» **at the time the checkpoint was created**; you can't change it later for that query without a new checkpoint.

### Keeping state bounded
Without a **watermark**, aggregation state for old windows and dedup keys grows forever. With «withWatermark("event_time", "30 minutes")», state older than the watermark is evicted.

### Watermark maths
watermark = max(event_time seen) − delay. In **append** mode, a window is emitted once the watermark passes its end, then dropped from state. Late rows for already-closed windows are dropped. In **update** mode, rows are emitted every batch they change.`],
 ["num","Max event time seen is 10:42:00, watermark delay 15 minutes, 10-minute tumbling windows. What's the latest window END (minutes past 10:00) that's already finalized in append mode?",20,0,"minutes past 10:00","Watermark = 10:27. Windows ending ≤ 10:27 are final: the [10:10, 10:20) window ends at 10:20. The [10:20, 10:30) window is still open."],
 ["sort","Bounded state or unbounded?",{"Bounded (cleaned by watermark)":["Windowed count with withWatermark","dropDuplicatesWithinWatermark","Stream-stream join with watermarks and time-range condition"],"Unbounded (grows forever)":["groupBy(user_id).count() with no watermark","dropDuplicates(['id']) on an endless stream without watermark"]},"Every stateful query needs a plan for eviction."],
 ["match","Trigger",[["Default (unspecified)","Next micro-batch as soon as the previous ends"],["processingTime('1 minute')","Micro-batch every minute"],["availableNow=True","Process all available data in batches, then stop"],["continuous (experimental)","Millisecond latency, at-least-once, limited operators"]],"availableNow is great for cheap scheduled streaming jobs."],
 ["tf","Streaming truths",[["You can change shuffle partitions for an existing stateful query's checkpoint.",false,"State partitioning is fixed by the checkpoint."],["Kafka source offsets are stored in the checkpoint.",true,"Not in consumer group commits."],["foreachBatch gives exactly-once automatically.",false,"Only if your batch write is idempotent."]]]
]},
{act:"Expert", t:"Scheduling & resources", sub:"Locality, pools, allocation", rounds:[
 ["learn","Two schedulers","The **DAGScheduler** turns a job into stages and submits a **TaskSet** per stage when parents are done. The **TaskScheduler** matches tasks to executor **resource offers**, honouring data locality, then sends them to executors.",["Job → stages (DAGScheduler)","Stage → TaskSet","Resource offers from executors","Locality-aware assignment (TaskScheduler)","Executor runs task"],null,`### Locality levels
PROCESS_LOCAL (data cached in that executor) → NODE_LOCAL (same host, e.g. HDFS block or another executor) → RACK_LOCAL → ANY. Spark waits «spark.locality.wait» (3 s by default, per level) for a better slot before downgrading.

On S3/cloud storage there's no host locality for file reads, so long waits just add latency: set «spark.locality.wait» lower (e.g. 0–1 s) for cloud-only jobs. For cached data, locality still matters.

### Scheduling mode
Within one application, jobs run **FIFO** by default. With «spark.scheduler.mode=FAIR» and pools (weight, minShare), concurrent jobs (e.g. from many notebook users or threads) share executors fairly. Set a job's pool with «sc.setLocalProperty("spark.scheduler.pool", "etl")».

### Task slots
Slots per executor = «spark.executor.cores» ÷ «spark.task.cpus». Setting task.cpus=2 halves parallelism, useful only for multithreaded tasks (some ML libraries).`],
 ["num","A stage has 12,000 tasks. 50 executors with 5 cores each, spark.task.cpus = 1. How many waves?",48,0,"waves","250 slots; 12,000 ÷ 250 = 48 waves."],
 ["learn","Dynamic allocation","Spark adds executors when tasks are pending and removes idle ones. Requests ramp up exponentially.",null,null,`### How it scales
- Pending tasks for «schedulerBacklogTimeout» (1 s) → request executors; if the backlog persists for «sustainedSchedulerBacklogTimeout», request again, doubling each round (1, 2, 4, 8…).
- Executors idle for «executorIdleTimeout» (60 s) are removed; those holding cached data only after «cachedExecutorIdleTimeout» (infinite by default).
- Bounds: «minExecutors», «maxExecutors», «initialExecutors».

### Shuffle files
Removing an executor would lose its shuffle files. You need either the **external shuffle service** (YARN, standalone) or «spark.dynamicAllocation.shuffleTracking.enabled» (Kubernetes): executors holding live shuffle data aren't removed until the shuffle is no longer needed.

### Speculation knobs
«spark.speculation=true»; a task is speculated if it runs longer than «multiplier» (1.5) × the median of completed tasks, once «quantile» (0.75) of tasks are done. Great for bad nodes; useless for skew; dangerous for non-idempotent side effects (writes to external systems).`],
 ["match","Setting → effect",[["spark.locality.wait=0 on S3-only jobs","Stop waiting for non-existent locality"],["FAIR scheduler pools","Concurrent jobs share executors"],["shuffleTracking.enabled","Dynamic allocation on K8s without an external shuffle service"],["spark.speculation.multiplier=1.5","Speculate tasks 1.5× slower than the median"]],"Scheduling knobs fix latency, sharing and stragglers."],
 ["pick","Speculation is on and a foreachPartition writes rows to a REST API. Risk?",["None","Duplicate writes when both the original and speculative copy run","Slower shuffle","Lost data"],1,"Speculated tasks can both complete side effects. Make writes idempotent or disable speculation."],
 ["tf","Scheduling truths",[["Jobs inside one Spark application run FIFO by default.",true,"Use FAIR pools to share."],["Dynamic allocation needs shuffle files to survive executor removal.",true,"External shuffle service or shuffle tracking."],["spark.task.cpus=2 doubles throughput.",false,"It halves the number of task slots."]]]
]},
{act:"Expert", t:"Expert boss: The platform audit", boss:true, time:45, rounds:[
 ["pick","AQE is on, yet a 3 GB-estimated dimension (12 MB after filter) still uses SMJ for the first join. Why?",["The decision needs a materialized exchange; add a broadcast hint or fresh column stats","AQE is broken","Parquet issue","Too many executors"],0,"AQE can't re-plan before statistics exist."],
 ["pick","Fact by dt, filtered dimension join scans all 1,095 partitions. Expected optimization missing?",["Dynamic partition pruning","Skew join","Speculation","Coalesce"],0,"Check join key = partition column and DPP enabled."],
 ["pick","500-column wide transform: operators lost the *(n) prefix and the stage is 6× slower. Cause?",["Whole-stage codegen disabled (maxFields / huge method)","Skew","Small files","FetchFailed"],0,"Split the projection or restructure the schema."],
 ["pick","Streaming dedup job's executors OOM after 3 days. Fix?",["Add a watermark (dropDuplicatesWithinWatermark) and use RocksDB state","More shuffle partitions in the same checkpoint","Disable checkpointing","Speculation"],0,"Bound and offload state."],
 ["pick","Restarted streaming job wrote batch 812 twice to Postgres via foreachBatch. Fix?",["Idempotent MERGE keyed on ids, or skip already-committed batchId","Delete the checkpoint","Use continuous trigger","More partitions"],0,"Replay is by design; sinks must tolerate it."],
 ["pick","S3-only ETL: tasks sit in 'pending' for seconds despite free cores. Fix?",["Lower spark.locality.wait","Raise locality wait","More executors","Bigger heap"],0,"There's no locality on S3 to wait for."],
 ["pick","Reducers on one host keep hitting fetch timeouts during a 40,000-reducer shuffle. Knob?",["maxBlocksInFlightPerAddress / maxReqsInFlight","maxPartitionBytes","codegen.maxFields","locality.wait"],0,"Throttle per-host fetch pressure (and cut reducer count)."]
]}
]);
