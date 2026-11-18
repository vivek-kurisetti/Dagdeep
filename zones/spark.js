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

QUEST.cards("spark", {
lazy:{t:"Transformations vs actions (lazy evaluation)", one:"Spark builds a recipe first and cooks only when you ask for a result — and it cooks from scratch every time you ask.",
 life:"Writing a biryani recipe costs nothing. Cooking happens only when a guest asks for a plate. If one guest asks 'how many plates will this make?' and another asks to be served, a careless cook makes the whole biryani twice.",
 how:["Every DataFrame is a **logical plan** (a tree of steps), not data. «filter», «select», «join», «groupBy» just add nodes.","An **action** («count», «show», «collect», «write», «toPandas», «foreach») asks for a result, so Spark optimises the plan (Catalyst) and runs a **job**.","Each action runs the **full plan from the source** unless something in the plan is cached or checkpointed.","«cache()» is itself lazy: it marks the plan; the next action fills the cache; later actions reuse it. Call «unpersist()» when done.","Catalyst can only optimise what it sees, so laziness lets it push filters into the scan and drop unused columns before running anything."],
 ex:`~~~
raw   = spark.read.parquet("s3://lake/raw/payments/")      # nothing runs
clean = raw.filter("status = 'SUCCESS'").dropDuplicates(["payment_id"])   # nothing runs
print(clean.count())                       # JOB 0: read 500 GB → filter → dedup → count
clean.write.parquet("s3://lake/mart/pay")  # JOB 1: read 500 GB → filter → dedup AGAIN → write
~~~
Fix when you really need both:
~~~
clean.cache()
n = clean.count()          # computes once, fills the cache
clean.write.parquet(out)   # reads cached partitions
clean.unpersist()
~~~
| Line | Runs a job? |
|---|---|
| df.filter(...) | No |
| df.cache() | No (marks only) |
| df.checkpoint() | Yes (eager by default) |
| spark.read.option("inferSchema", True).csv(p) | Yes (scans to guess types) |
| df.explain() | No |`,
 traps:["Debug «count()» / «show()» left in production code silently doubles the work.","Caching something used once wastes memory that joins and sorts need.","«collect()» on big data pulls everything to the driver → driver OOM.","Python UDFs hide logic from Catalyst: no filter pushdown, no codegen."],
 say:"DataFrame operations are lazy transformations that build a logical plan; actions trigger jobs that execute the optimised plan from the source. Each action recomputes the lineage unless it's cached, so I avoid extra actions and cache only DataFrames reused by multiple actions."},
partitions:{t:"Partitions, tasks and waves", one:"Spark splits data into partitions; each partition is one task on one core; tasks run in waves.",
 life:"4,000 dishes and 200 cooks. Each cook makes one dish at a time, so the kitchen works in about 20 rounds. Dinner is served only when the slowest cook in the last round finishes.",
 how:["File sources are cut into **input partitions** of up to «spark.sql.files.maxPartitionBytes» (128 MB default); small files are packed together.","Each partition becomes **one task**; a task runs on **one core**.","**Waves** = tasks ÷ total cores (rounded up). Stage time ≈ waves × typical task time.","After a shuffle, the number of partitions is «spark.sql.shuffle.partitions» (200 default) or what AQE coalesces it to.","A stage ends when its **slowest task** ends — one straggler holds everyone."],
 ex:`500 GB input, 128 MB partitions, 50 executors × 4 cores = 200 cores:
- Tasks ≈ 500 × 1,024 ÷ 128 = **4,000**
- Waves = 4,000 ÷ 200 = **20**
- If a task takes 6 s → stage ≈ 20 × 6 s = **2 minutes**

| Symptom in Spark UI | Meaning |
|---|---|
| 60,000+ tasks, median < 1 s | Too many tiny partitions (small files) |
| 50 tasks, each 15 min, spills | Partitions too big |
| Median 30 s, max 40 min | Skew (one partition much bigger) |`,
 traps:["Fewer cores than partitions isn't bad — waves are normal. Wildly uneven task times are bad.","«coalesce(n)» early in a job can shrink the whole stage to n tasks.","Gzip CSV/JSON files can't be split: one file = one task however big."],
 say:"One partition maps to one task on one core, so parallelism is min(partitions, cores) and stage time is roughly waves × task time plus the slowest straggler. I size input partitions around 128–512 MB and shuffle partitions around 100–300 MB."},
smallfiles:{t:"The small-files problem", one:"Millions of tiny files make Spark spend its time opening files instead of reading data.",
 life:"Paying 2 million ₹10 UPI bills one by one versus one bank transfer of ₹2 crore. The money is the same; the per-transaction overhead kills you.",
 how:["Every file costs a **LIST** entry, an **open/GET** request, a Parquet **footer** read and a **metadata** entry.","Spark counts each file as at least «openCostInBytes» (4 MB) when packing partitions, so 2M tiny files explode the task count.","S3 throttles around 5,500 GET/s per prefix → **503 Slow Down** retries.","Tiny files come from **writers**: streaming commits every few seconds, over-fine partitioning (by hour/user), or every task writing to every date partition.","Fix at the source: compact existing files, and change writers to produce ~256 MB–1 GB files."],
 ex:`Iceberg compaction (schedule hourly/daily):
~~~
CALL system.rewrite_data_files(
  table => 'lake.raw.payments',
  where => "dt >= current_date - 2",
  options => map('target-file-size-bytes', '536870912'))   -- 512 MB
~~~
Write well in the first place:
~~~
(df.repartition("dt")                       # each date handled by few tasks
   .sortWithinPartitions("merchant_id")     # tight min/max per file
   .writeTo("lake.raw.payments").overwritePartitions())
~~~
Before vs after (our nightly job): 2,097,152 files → 1,020 files; Stage 0 from 69,212 tasks to ~1,000; read time 52 min → 9 min.`,
 traps:["Raising maxPartitionBytes hides the problem for one job; every other reader still suffers.","Compaction with «remove_orphan_files older_than = now()» can delete in-flight files — keep the safety window.","Partitioning a 1 GB/day table by hour guarantees small files."],
 say:"Small files add per-file overhead — listing, opening, footer reads, metadata and task scheduling — and trigger S3 throttling. I fix them where they're produced (writer distribution, target file size, sane partition granularity) and schedule compaction for the rest."},
shuffle:{t:"Shuffles and stages", one:"A shuffle redistributes rows across the cluster by key; every shuffle is a stage boundary and usually the most expensive step.",
 life:"A post office sorting letters by PIN code: every letter is read, bagged by destination, trucked to the right branch and unpacked. Expensive, but needed whenever letters for the same PIN must end up together.",
 how:["**Narrow** operations (filter, select, union) work partition by partition — no movement, same stage.","**Wide** operations (groupBy, join of big tables, distinct, orderBy, window with PARTITION BY) need all rows of a key together → **shuffle**.","Map side: each task computes «hash(key) % R», writes **one sorted file + index** to local disk.","Reduce side: each of R tasks fetches **its block from every map task** (M × R blocks) over the network.","In «explain()», every **Exchange** node is a shuffle and a stage boundary."],
 ex:`~~~
== Physical Plan ==
SortMergeJoin [merchant_id]
:- Exchange hashpartitioning(merchant_id, 200)   <- shuffle of payments (2.1 TB)
+- Exchange hashpartitioning(merchant_id, 200)   <- shuffle of merchants (58 MB)
~~~
Cost model: 2.1 TB serialized → written to local disks → fetched across the network → deserialized → sorted. M = 16,000 map tasks × R = 200 reducers = 3.2 M blocks.

Ways to shuffle less: filter and select columns **before** wide ops; pre-aggregate; broadcast small sides; bucket/partition both tables identically for repeated joins.`,
 traps:["groupBy aggregations shuffle less than joins thanks to partial (map-side) aggregation.","A window without PARTITION BY sends everything to one task.","Shuffle files live on executors' local disks — losing executors (spot) causes FetchFailed and recomputation."],
 say:"Wide transformations need all rows for a key together, so Spark hash-partitions map output to local disk and reducers fetch their blocks from every mapper. Each Exchange is a stage boundary; I minimise shuffles by filtering early, pre-aggregating and broadcasting small sides."},
broadcast:{t:"Broadcast joins", one:"Copy the small table to every executor so the big table never has to move.",
 life:"Instead of sending every customer to the manager's desk to check prices (a queue for everyone), photocopy the one-page price list and give a copy to every cashier.",
 how:["The driver collects the small side, then **broadcasts** it to every executor.","Each task builds a hash table from the copy and probes it with its partition of the big table.","The big side is **not shuffled at all** — usually the biggest win available.","Spark chooses it automatically if the estimated size < «autoBroadcastJoinThreshold» (10 MB); AQE can switch at runtime using real sizes; you can force it with «broadcast()»/hints.","Join type limits which side can be broadcast: inner → either; left outer/semi/anti → **right only**; right outer → left only; full outer → neither."],
 ex:`~~~
from pyspark.sql import functions as F
pay = spark.table("lake.pay.payments").filter("dt = '2026-11-17'")   # 2.1 TB
mer = spark.table("lake.pay.merchants")                              # 58 MB
out = pay.join(F.broadcast(mer), "merchant_id", "left")   # right side broadcast: allowed
~~~
Result on our job: shuffle write 2.2 TB → 0; join stage 38 min → 4 min.

Why the preserved side can't be broadcast: in «merchants LEFT JOIN payments», each task would only see part of payments, so it can't know a merchant has no payments anywhere → wrong NULL rows.`,
 traps:["Size on disk ≠ size in memory: 300 MB Parquet can be 3 GB as a hash table.","The broadcast is built on the driver: huge broadcasts need driver memory and can time out («broadcastTimeout»).","Stale table statistics make small tables look big → Spark picks sort-merge."],
 say:"For a big-to-small equi-join I broadcast the small side so each task joins locally and the big side isn't shuffled. I check the join type allows it, that the small side fits comfortably in memory, and I confirm BroadcastHashJoin in the plan."},
aqe:{t:"Adaptive Query Execution (AQE)", one:"Spark re-plans the rest of the query after each shuffle, using the real data sizes it just saw.",
 life:"A wedding caterer plans 500 plates, but after counting heads at the door re-plans: fewer serving counters if fewer guests came, a separate counter if one family brought 80 people.",
 how:["AQE cuts the plan into **query stages** at shuffles/broadcasts.","When a stage finishes, it reads the real **map output sizes**.","**Coalesce**: merges small reduce partitions up to «advisoryPartitionSizeInBytes».","**Switch join**: if a side turns out small, sort-merge → broadcast hash join.","**Skew join**: splits partitions > 5× median and > 256 MB into pieces (joins only)."],
 ex:`~~~
spark.conf.set("spark.sql.adaptive.enabled", "true")                       # default since 3.2
spark.conf.set("spark.sql.adaptive.coalescePartitions.initialPartitionNum", "8000")
spark.conf.set("spark.sql.adaptive.advisoryPartitionSizeInBytes", "256m")
~~~
Sizing rule without AQE: partitions ≈ shuffled bytes ÷ 200 MB. 1 TB → ~5,000. With AQE, start high (8,000) and let it merge down.

In the UI: «AdaptiveSparkPlan isFinalPlan=true», «AQEShuffleRead coalesced», new «BroadcastHashJoin» nodes.`,
 traps:["AQE can't re-plan the first scan stage — it has no runtime stats yet.","Skew join handling doesn't fix skewed groupBy aggregations.","Switching to broadcast after the fact still paid for writing that shuffle."],
 say:"AQE re-optimises at shuffle boundaries using actual statistics: it coalesces small partitions, converts joins to broadcast when a side is small, and splits skewed join partitions. I set a generous initial partition number and an advisory size, and check the final plan."},
skew:{t:"Data skew", one:"A few keys hold most of the rows, so one task does most of the work while the rest wait.",
 life:"DMart during Diwali: 20 billing counters, but everyone buying rice is sent to counter 7. The store closes only when counter 7's queue is done.",
 how:["After a shuffle, all rows of a key go to **one** reduce partition.","If one key (a mega-merchant, NULL, 'unknown') has 40% of rows, its task gets 40% of the data.","Diagnose: stage task summary → **max ≫ median** for duration and shuffle read.","Find keys: «groupBy(key).count().orderBy(desc)».","Fixes depend on the operation: NULL handling, AQE skew join, broadcast, salting, two-phase aggregation, isolating hot keys."],
 ex:`Stage 7 on Diwali night:
| Metric | Median task | Max task |
|---|---|---|
| Duration | 31 s | 46 min |
| Shuffle read | 0.3 GB | 180 GB |
Top keys: MegaMart 41.2 M rows, NULL 10.4 M rows, next merchant 0.6 M.

| Situation | Fix |
|---|---|
| NULL/junk keys | Filter or process separately |
| Skewed sort-merge join | AQE skew join → salting if needed |
| Other side small | Broadcast |
| Skewed groupBy | Two-phase (salted) aggregation |`,
 traps:["Speculation doesn't help: the duplicate task reads the same 180 GB.","More executors don't help: the hot partition is still one task.","Averages hide skew — always look at max vs median."],
 say:"Skew shows up as max task time and shuffle read far above the median. I find the hot keys, handle NULLs first, then use broadcast or AQE skew join for joins, and two-phase salted aggregation for groupBys."},
salting:{t:"Salting and two-phase aggregation", one:"Split a hot key into N sub-keys so N tasks share its work, then combine.",
 life:"Open 16 extra counters only for rice buyers. Each counter totals its own bills; at closing, the manager adds up the 16 totals.",
 how:["Add a random **salt** 0…N-1 to rows of the hot key.","**Aggregation**: group by (key, salt) → N partial sums spread over N tasks; then group by key to add the partials.","**Join**: salt the big side randomly and **replicate** the small side N times (one copy per salt), join on (key, salt).","Pick N from the skew ratio (hot partition size ÷ target size).","Salt only hot keys when possible to limit the small-side blow-up."],
 ex:`Two-phase aggregation:
~~~
N = 16
step1 = (pay.withColumn("salt", (F.rand() * N).cast("int"))
            .groupBy("merchant_id", "salt").agg(F.sum("amount").alias("part")))
step2 = step1.groupBy("merchant_id").agg(F.sum("part").alias("gmv"))
~~~
MegaMart's 180 GB partition becomes 16 × ~11 GB; max task 26 min → ~2 min.

Salted join:
~~~
big   = pay.withColumn("salt", (F.rand() * N).cast("int"))
small = mer.withColumn("salt", F.explode(F.array(*[F.lit(i) for i in range(N)])))
joined = big.join(small, ["merchant_id", "salt"]).drop("salt")
~~~`,
 traps:["Averages need sum and count separately (average of averages is wrong).","Non-deterministic rand() can misbehave on task retries for joins — seed it or derive salt from a hash of another column.","Salting a join multiplies the small side by N."],
 say:"For a skewed aggregation I add a random salt, aggregate by key and salt, then aggregate again by key. For joins I salt the big side and replicate the small side per salt value. It spreads a hot key over N tasks at the cost of extra rows."},
memory:{t:"Executor memory and containers", one:"An executor's container holds the JVM heap plus off-heap overhead; exceed the total and the cluster kills it.",
 life:"The airline weighs your suitcase AND your backpack. Your suitcase (heap) has space, but the backpack (Python workers, buffers) is overweight — you're stopped at the gate anyway.",
 how:["Container size = «spark.executor.memory» (heap) + «memoryOverhead» (default max(384 MB, 10%)) + optional «pyspark.memory».","Heap: 300 MB reserved; 60% (**unified memory**) shared by execution (joins, sorts, aggregations) and storage (cache).","Memory per task ≈ (heap − 0.3 GB) × 0.6 ÷ cores per executor.","When execution memory runs out, tasks **spill** to disk; when even that can't help, **OOM**.","Python UDF / pandas UDF workers run **outside the heap** → count against overhead."],
 ex:`Error: «Container killed by YARN for exceeding memory limits. 33.1 GB of 33 GB used»
- Heap 30 GB, overhead 3 GB (10%) = 33 GB container.
- pandas UDF workers used ~3.5 GB off-heap → over the limit.
- Fix: «spark.executor.memoryOverhead=6g» (≈20% for PySpark-heavy jobs).

Sizing for 32-core / 256 GB nodes: leave 1 core + 8 GB → 5 cores/executor × 6 executors; ~41 GB containers = 37 GB heap + 4 GB overhead; memory per task ≈ (37 − 0.3) × 0.6 ÷ 5 ≈ 4.4 GB.`,
 traps:["Raising heap doesn't fix off-heap overuse — and huge heaps (> 64 GB) cause long GC pauses.","Big spills mean partitions don't fit per-task memory: make partitions smaller first.","Driver OOM usually means collect()/toPandas() or a huge broadcast."],
 say:"Executors are containers of heap plus overhead. 'Exceeding memory limits' with a non-full heap is off-heap use — Python workers, buffers — so I raise memoryOverhead. For spills and heap OOM I reduce partition size or give each task more memory by using fewer cores per executor."}
});

QUEST.missions("spark", [
{title:"The 6 AM deadline", icon:"🌙", place:"Wed 03:10 AM · you're on call", setup:"Paydesk's nightly payments job usually finishes by 1 AM. Tonight it's still running. Finance needs the report at 6 AM.",
 meters:{runtime:{label:"Job runtime", value:250, unit:" min", goal:130, better:"low", max:300}, cost:{label:"Cost per run", value:9000, pre:"₹", unit:"", goal:9000, better:"low", max:18000}, trust:{label:"Finance trust", value:40, unit:"%", goal:60, better:"high", max:100, cap:100}},
 steps:[
  {say:[["ravi","📟 PagerDuty woke me up. «nightly_payments» has been running for 3 hours. It normally takes 70 minutes."],["arjun","I have a board meeting at 9. I need those numbers by 6. What's happening?"],["ui","Spark UI · Jobs\nJob 0  count at nightly.py:41      1 h 38 min   ✓\nJob 1  parquet at nightly.py:57    1 h 52 min   running…\nBoth jobs read s3://lake/raw/payments/  (500 GB)"]]},
  {choose:"The job is way behind. What's your first move?", options:[
   {t:"Add 20 more nodes to the cluster and rerun", ok:false, fx:{cost:6000, runtime:-10}, say:[["ravi","Cluster doubled… runtime barely moved. Bill doubled."]], why:"More machines help only when work is spread evenly and CPU is the bottleneck. You haven't looked at where the time goes yet.", life:"Hiring 20 more cooks doesn't help if every dish waits on one person opening 2 million tiny masala packets."},
   {t:"Open the Spark UI and find where the time goes", ok:true, say:[["priya","Good. Measure first, change second. What do you notice about those two jobs?"]], why:"The Spark UI breaks the application into jobs → stages → tasks. Two separate jobs both reading the same 500 GB is already a big clue.", life:"A doctor reads the reports before prescribing medicine."},
   {t:"Kill it and restart — probably a glitch", ok:false, fx:{runtime:30, trust:-10}, say:[["arjun","It started over?! That's another hour."]], why:"Restarting throws away progress and fixes nothing deterministic. The same code will behave the same way.", life:"Switching the TV off and on won't fix a dish antenna pointing the wrong way."}]},
  {say:[["code","raw   = spark.read.parquet(SRC)\nclean = raw.filter(\"status = 'SUCCESS'\").dropDuplicates(['payment_id'])\nprint('rows:', clean.count())                 # line 41\nclean.write.mode('overwrite').parquet(OUT)    # line 57"],["priya","Job 0 is the count, Job 1 is the write. Why does Spark run the whole pipeline twice?"]]},
  {choose:"Why are there two full jobs over the same data?", options:[
   {t:"count() is an action, so Spark runs the full plan for it — then again for write()", ok:true, fx:{runtime:-95, trust:10}, say:[["ravi","Commented out the debug count. Job 0 is gone."]], why:"filter and dropDuplicates only build a plan (transformations). Every **action** — count, write, show, collect — executes that plan from the source. Two actions = the 500 GB read, filter and dedup ran twice.", life:"You cooked the entire biryani just to count how many plates it makes, threw it away, and cooked it again to serve."},
   {t:"Spark caches DataFrames automatically, so it can't be that", ok:false, why:"Spark never caches by itself. Without cache(), each action recomputes everything from the source.", life:"The kitchen doesn't keep yesterday's biryani unless someone puts it in the fridge."},
   {t:"Parquet is slow — switch the source to CSV", ok:false, fx:{runtime:20}, why:"CSV is slower: no column pruning, no row-group skipping, more bytes to parse. And it doesn't explain two jobs.", life:"Switching from a sorted file cabinet to a pile of loose papers won't help you find things faster."}]},
  {card:"lazy"},
  {choose:"The audit team still needs the row count every night. How do you give it to them without paying twice?", options:[
   {t:"clean.cache(), then count(), then write(), then unpersist()", ok:true, fx:{trust:5}, why:"Now the expensive read + filter + dedup runs once; the second action reads the cached partitions. Unpersist frees memory for the rest of the job.", life:"Cook once, keep the pot on the counter, serve from it and count plates from the same pot."},
   {t:"Keep both actions — the audit needs it", ok:false, fx:{runtime:40}, why:"That brings back the duplicate job: the whole pipeline runs twice every night.", life:"Cooking two biryanis because two people asked questions about one."},
   {t:"Use collect() and count rows in Python on the driver", ok:false, fx:{trust:-10}, say:[["ravi","Driver died: java.lang.OutOfMemoryError."]], why:"collect() pulls every row to one machine. 500 GB doesn't fit on the driver.", life:"Asking all 4,000 dishes to be carried to one tiny table to be counted."}]},
  {task:["num","Stage 0 reads 500 GB in 128 MB partitions on 200 cores. About how many waves of tasks does it run?",20,1,"waves","500 GB ÷ 128 MB ≈ 4,000 tasks; 4,000 ÷ 200 cores = 20 waves."], intro:[["priya","Quick sanity check before we look at Stage 0. Do the maths."]], label:"Estimate the waves", ok:{trust:5}, life:"4,000 dishes, 200 cooks, one dish per cook at a time → 20 rounds of cooking."},
  {card:"partitions"},
  {say:[["ui","Spark UI · Stage 0 (scan payments)\nFiles listed: 2,097,152     Tasks: 69,212\nTask time  min 0.2 s · median 0.9 s · max 4 s\nS3 errors: 503 Slow Down × 18,402"],["ravi","69 thousand tasks and S3 throttled us 18,000 times. The streaming job writes a new file every few seconds."]]},
  {choose:"69,212 tiny tasks over 2 million files. What's the real fix?", options:[
   {t:"Compact the table into ~512 MB files and fix the writer that creates tiny files", ok:true, fx:{runtime:-60, trust:10}, why:"Every file costs a listing, an open request, a footer read and scheduling. Compacting 2M files into ~1,000 removes that overhead for every reader, and fixing the writer stops it coming back.", life:"Paying 2 million ₹10 bills one by one vs one bank transfer: same money, but the per-transaction fees and queues disappear."},
   {t:"Raise spark.sql.files.maxPartitionBytes to 1 GB", ok:"partial", fx:{runtime:-15}, why:"Fewer, bigger tasks for this job — but still 2 million file opens and S3 requests, and every other reader of the table still suffers.", life:"Asking the cashier to staple bills together still means 2 million bills to open."},
   {t:"Enable speculative execution", ok:false, fx:{cost:500}, why:"Speculation copies slow tasks. No task is slow here; there are just far too many tiny ones.", life:"Sending a second delivery boy for each of 2 million tiny parcels."}]},
  {task:["fill","Write the compaction call Ravi will schedule hourly",`CALL system.___(\n  table => 'lake.raw.payments',\n  options => map('target-file-size-bytes', '___'))`,["rewrite_data_files","536870912"],["expire_snapshots","134217728000"],"rewrite_data_files compacts small files; 536,870,912 bytes = 512 MB targets."], intro:[["ravi","Write me the compaction call and I'll put it on a schedule."]], label:"Schedule compaction", ok:{trust:5}, bad:{trust:-5}},
  {card:"smallfiles"},
  {say:[["arjun","Report landed at 5:20 AM. Cutting it close, but I made it. Thank you."],["priya","The job is down to about an hour and a half. Tomorrow: the joins. They shuffle terabytes they don't need to."]]}
 ],
 learned:["Transformations build a plan; every action runs it from scratch unless cached.","Partitions → tasks → waves; the slowest task sets the pace.","Small files cost overhead per file: compact them and fix the writer."]},
{title:"The 2 TB join", icon:"🔀", place:"Thu 11:00 AM · performance review", setup:"The job now takes 95 minutes. Priya spotted a join that shuffles 2.2 TB every night to attach merchant names.",
 meters:{runtime:{label:"Job runtime", value:95, unit:" min", goal:50, better:"low", max:130}, shuffle:{label:"Shuffle written", value:2.4, unit:" TB", goal:0.5, better:"low", max:3}, trust:{label:"Finance trust", value:70, unit:"%", goal:80, better:"high", max:100, cap:100}},
 steps:[
  {say:[["priya","Look at query 3 in the SQL tab."],["ui","Spark UI · SQL · Query 3\nSortMergeJoin [merchant_id]\n├─ Exchange hashpartitioning(merchant_id, 200)   ← payments  2.1 TB\n└─ Exchange hashpartitioning(merchant_id, 200)   ← merchants 58 MB\nShuffle write: 2.2 TB    Stage time: 38 min"]]},
  {choose:"What is that 'Exchange' doing?", options:[
   {t:"A shuffle: every row is re-sent across the network, grouped by merchant_id", ok:true, why:"An Exchange hash-partitions rows by key so equal keys meet in the same task. Here both sides — including all 2.1 TB of payments — are written to disk and fetched across the network.", life:"A post office sorting every letter by PIN code: read, bag, truck to the right branch, unpack."},
   {t:"A caching step that keeps data in memory", ok:false, why:"Caching shows as InMemoryTableScan/InMemoryRelation. Exchange means data movement.", life:"The fridge isn't the delivery truck."},
   {t:"Reading the tables from S3", ok:false, why:"Reads show as Scan/BatchScan nodes. Exchange happens after the scan, between stages.", life:"Picking letters up from the mailbox isn't the same as sorting them."}]},
  {card:"shuffle"},
  {task:["sort","Which steps make the post office sort every letter?",{"Shuffle (wide)":["groupBy('merchant_id').sum()","join of two big tables","distinct()","orderBy('amount')"],"No shuffle (narrow)":["filter(status = 'SUCCESS')","withColumn('day', ...)","union()","join(broadcast(merchants))"]},"Wide operations need all rows of a key together, so data moves. Narrow ones work partition by partition."], intro:[["priya","Before we fix it: can you spot which operations force a shuffle?"]], label:"Spot the shuffles", ok:{trust:5}},
  {choose:"payments is 2.1 TB, merchants is 58 MB. How do you fix this join?", options:[
   {t:"Broadcast merchants to every executor", ok:true, fx:{runtime:-35, shuffle:-2.1, trust:5}, say:[["ui","Spark UI · Query 3 (after)\nBroadcastHashJoin [merchant_id]\n└─ BroadcastExchange  ← merchants 58 MB\nShuffle write: 0 B    Stage time: 4 min"]], why:"Each executor gets a full copy of the 58 MB table and joins its own payments locally. The 2.1 TB side never moves.", life:"Instead of sending every customer to the manager's desk to check prices, photocopy the one-page price list for every cashier."},
   {t:"Salt the join key ×16", ok:false, fx:{runtime:5, shuffle:0.3}, why:"Salting fixes skew (one key too big), not size. It still shuffles 2 TB and multiplies the small side by 16.", life:"Opening 16 extra counters doesn't help when the problem is that everyone walks to the manager's desk."},
   {t:"Raise shuffle partitions from 200 to 8,000", ok:"partial", fx:{runtime:-5}, why:"Smaller partitions spill less, so it's a bit faster — but you still move 2.1 TB every night.", life:"More mail bags make sorting easier, but you're still trucking every letter."}]},
  {card:"broadcast"},
  {say:[["meera","My report needs every merchant, even ones with zero payments today. So it's «merchants LEFT JOIN payments». Can you still broadcast merchants?"]]},
  {choose:"merchants LEFT JOIN payments — what do you do?", options:[
   {t:"Aggregate payments per merchant first, then merchants LEFT JOIN that small result (broadcasting the aggregate)", ok:true, fx:{runtime:-10, shuffle:-0.2, trust:5}, why:"In a LEFT JOIN only the right side can be broadcast. Pre-aggregating payments shrinks the right side to one row per merchant (tiny after partial aggregation), so it can be broadcast — and the 2 TB never joins row by row.", life:"The guest list (left) must stay complete; you can hand out copies of the short 'who paid' summary (right), not the guest list."},
   {t:"Broadcast merchants anyway", ok:false, why:"Spark won't: the preserved (left) side can't be broadcast. Each task would only see part of payments and wrongly emit 'no payments' rows.", life:"Each cashier would think a guest never paid just because the payment went through another cashier."},
   {t:"Switch to a FULL OUTER JOIN", ok:false, fx:{runtime:5}, why:"Full outer joins can't broadcast either side — you'd force a sort-merge join of 2 TB.", life:"Now neither list can be photocopied."}]},
  {task:["num","After the fixes, the daily aggregation still shuffles 1 TB. Targeting ~200 MB per partition, how many shuffle partitions?",5000,100,"partitions","1,000,000 MB ÷ 200 MB ≈ 5,000. With AQE you can start higher and let it coalesce."], intro:[["priya","Last thing: spark.sql.shuffle.partitions is still the default 200. Size it."]], label:"Size the shuffle", ok:{runtime:-3, trust:5}, life:"Splitting 1 tonne of parcels into vans that carry 200 kg each → about 5,000 vans."},
  {card:"aqe"},
  {say:[["arjun","Report at 4:40 AM. Who did this? Chai is on me."],["priya","Under 50 minutes. Enjoy it — next week is Diwali, and MegaMart's sale triples our volume."]]}
 ],
 learned:["Every Exchange is a shuffle: data written, sent and read again.","Broadcast small tables; the join type decides which side can be broadcast.","Size shuffle partitions by data (~200 MB each) and let AQE adjust."]},
{title:"Diwali night", icon:"🪔", place:"Sat 01:30 AM · Diwali sale", setup:"MegaMart's festival sale tripled volume. The job that took 47 minutes yesterday has been running for 2 hours 20 minutes.",
 meters:{runtime:{label:"Job runtime", value:140, unit:" min", goal:45, better:"low", max:170}, maxtask:{label:"Slowest task", value:46, unit:" min", goal:5, better:"low", max:50}, trust:{label:"Finance trust", value:60, unit:"%", goal:80, better:"high", max:100, cap:100}},
 steps:[
  {say:[["arjun","It's Diwali and the job is crawling again. Please tell me this isn't another 4-hour night."],["ui","Spark UI · Stage 7 · HashAggregate by merchant_id\nTasks: 4,000 · median 31 s · max 46 min\nTask 1,271: shuffle read 180 GB   (others ~0.3 GB)"]]},
  {choose:"What do those numbers tell you?", options:[
   {t:"Data skew: one key holds a huge share of the rows, so one task does most of the work", ok:true, why:"Median 31 s vs max 46 min, and one task reading 180 GB while others read 0.3 GB. All rows of a key land in one partition, so a hot key makes one giant task.", life:"DMart on Diwali: 20 billing counters, but everyone buying rice is sent to counter 7. The store closes only when counter 7 is done."},
   {t:"Not enough executors — add more", ok:false, fx:{runtime:-2}, why:"The hot partition is still one task on one core. More executors just sit idle waiting for it.", life:"Opening more counters doesn't help if all rice buyers must use counter 7."},
   {t:"A slow node — turn on speculation", ok:false, fx:{runtime:5}, why:"Speculation launches a copy of task 1,271 elsewhere — which also has to read 180 GB. Skew is a data problem, not a hardware problem.", life:"Sending a second cashier to counter 7 with the same queue."}]},
  {card:"skew"},
  {say:[["meera","I ran the key counts. MegaMart is 40% of tonight's rows. And 10% of rows have merchant_id = NULL from the old checkout flow."],["ui","SELECT merchant_id, count(*) … ORDER BY 2 DESC\nMegaMart   41,203,118\nNULL       10,377,402\nM-77812       612,233"]]},
  {choose:"Two hot keys. What do you fix first?", options:[
   {t:"Take the NULL merchant_id rows out of the aggregation and handle them separately", ok:true, fx:{maxtask:-20, runtime:-30, trust:5}, why:"NULL isn't a real merchant: those rows hash to one partition and do pointless work. Filtering them (and reporting them separately) removes a whole hot partition cheaply.", life:"Parcels with no address shouldn't all be dumped on one sorting desk; put them aside for the 'unknown address' team."},
   {t:"Turn on AQE skew join", ok:false, why:"This stage is a groupBy aggregation, not a join. AQE's skew handling only splits join partitions.", life:"A rule for sharing queues at the exchange counter doesn't apply at the billing counter."},
   {t:"Give the driver more memory", ok:false, why:"The bottleneck is one executor task, not the driver.", life:"A bigger office for the store manager doesn't speed up counter 7."}]},
  {choose:"MegaMart alone still makes one task take 26 minutes. Next move?", options:[
   {t:"Two-phase aggregation: add a random salt 0–15, sum by (merchant, salt), then sum by merchant", ok:true, fx:{maxtask:-22, runtime:-55, trust:10}, why:"MegaMart's rows now spread over 16 tasks that each produce a partial sum; a tiny second aggregation adds the 16 partials. The giant task becomes 16 small ones.", life:"Open 16 extra counters just for rice buyers. Each counter totals its own bills; at closing the manager adds up 16 totals."},
   {t:"Broadcast the payments table", ok:false, why:"There's nothing to broadcast in a groupBy, and 2 TB can't be broadcast anyway.", life:"Photocopying the entire warehouse for every cashier."},
   {t:"Increase shuffle partitions to 20,000", ok:"partial", fx:{maxtask:-2}, why:"Other partitions get smaller, but every MegaMart row still hashes to the same single partition.", life:"Adding more counters while still sending every rice buyer to counter 7."}]},
  {card:"salting"},
  {task:["fill","Write the two-phase aggregation",`step1 = (pay.withColumn("salt", (F.rand() * 16).cast("int"))\n           .groupBy("merchant_id", "___").agg(F.sum("amount").alias("part")))\nstep2 = step1.groupBy("___").agg(F.sum("___").alias("gmv"))`,["salt","merchant_id","part"],["amount","dt"],"Aggregate by (key, salt), then by key, summing the partials."], intro:[["priya","Write it so Ravi can deploy before the 3 AM rerun."]], label:"Code the fix", ok:{trust:5}, bad:{trust:-5}},
  {say:[["ravi","📟 New alert during the rerun: 2 executors lost. 'Container killed by YARN for exceeding memory limits. 33.1 GB of 33 GB physical memory used.' The job has a pandas UDF for currency conversion."]]},
  {choose:"The heap is 30 GB and isn't full. What's the fix?", options:[
   {t:"Raise spark.executor.memoryOverhead — the Python workers live outside the heap", ok:true, fx:{runtime:-10, trust:5}, why:"The container limit is heap + overhead. pandas UDFs run in Python processes whose memory counts against overhead (10% by default). Raising overhead to ~20% stops the kills.", life:"The airline weighs your suitcase AND your backpack. The suitcase (heap) has room; the backpack (Python workers) is overweight."},
   {t:"Raise the executor heap to 60 GB", ok:false, fx:{runtime:5}, why:"A bigger heap makes a bigger container, but the Python workers still overflow the overhead slice — and huge heaps bring long GC pauses.", life:"Buying a bigger suitcase when it's the backpack that's overweight."},
   {t:"Reduce shuffle partitions", ok:false, fx:{runtime:5}, why:"Fewer partitions make each task's data bigger — more memory pressure, not less.", life:"Packing more into each backpack."}]},
  {card:"memory"},
  {say:[["arjun","Done at 3:05 AM on Diwali night?! 45 minutes. I'm showing this graph to the board."],["priya","You fixed lazy evaluation, small files, the join, skew and memory. That's most of the Spark interview, by the way."]]}
 ],
 learned:["Skew = max task ≫ median; find the hot keys first.","Handle NULL keys, then salt hot keys (two-phase aggregation for groupBys).","Container = heap + overhead; Python workers live in overhead."]}
]);

// ---- Story extras: real screenshots, under-the-hood explanations ----
(function(){
  const Z = QUEST.data.spark, M = Z.missions;
  const addSay = (mi, si, items) => { const S = M[mi].steps[si]; S.say = (S.say || []).concat(items); };
  const addOptSay = (mi, si, items) => { const o = M[mi].steps[si].options.find(o => o.ok === true); o.say = (o.say || []).concat(items); };
  addSay(0, 0, [["img", "img/spark-jobs-twice.png|Real Spark UI (Jobs tab) from a scaled-down replay: «count at nightly.py:41» and «parquet at nightly.py:57» are separate jobs, each running the whole plan."]]);
  addSay(0, 8, [["img", "img/spark-stage-smallfiles.png|Real Spark UI (stage details): a scan over 3,000 small files became 94 tasks, each packing ~32 tiny files. Scale that to 2 million files and you get our 69,212 tasks."]]);
  addSay(1, 0, [["img", "img/spark-sql-smj.png|Real Spark UI (SQL / DataFrame tab): a SortMergeJoin. Both sides go through an «Exchange» (shuffle) and a «Sort» before they meet."]]);
  addOptSay(1, 4, [["img", "img/spark-sql-bhj.png|Real Spark UI after the fix: «BroadcastExchange» on the small side and a «BroadcastHashJoin» — the big side has no Exchange at all."]]);
  addSay(2, 0, [["img", "img/spark-stage-skew.png|Real Spark UI (stage summary metrics) from a skewed replay: median task 0.5 s vs max 11 s, shuffle read median 1.9 MiB vs max 93.4 MiB. That gap is the signature of skew."]]);
  const C = Z.cardBook;
  C.lazy.ex += "\n\n![Real Spark UI: two jobs for one pipeline — count and write](img/spark-jobs-twice.png)";
  C.smallfiles.ex += "\n\n![Real Spark UI: stage reading thousands of tiny files](img/spark-stage-smallfiles.png)";
  C.broadcast.ex += "\n\n![Before: SortMergeJoin with Exchange on both sides](img/spark-sql-smj.png)\n\n![After: BroadcastHashJoin — no shuffle of the big side](img/spark-sql-bhj.png)";
  C.skew.ex += "\n\n![Real Spark UI: max task far above median = skew](img/spark-stage-skew.png)";
  const D = {
"0.1":`### What the Spark UI shows you
- **Jobs tab**: one row per action. Each job lists its stages and how many tasks succeeded.
- **Stages tab**: per stage — input size, shuffle read/write, and a **summary table** (min / 25th / median / 75th / max) for task duration, GC time, shuffle and spill.
- **SQL / DataFrame tab**: the physical plan as a graph with real row counts and sizes per operator.
- **Executors tab**: memory, GC, failed tasks per executor.

### The 60-second triage
1. Which **job** is long? 2. Which **stage** inside it? 3. In that stage: many tiny tasks (small files), few huge tasks (big partitions), or max ≫ median (skew)? 4. Spill or GC high (memory)? 5. In the SQL tab: which join and how many Exchanges?`,
"0.3":`### Why laziness exists
Because nothing runs until an action, Catalyst can see the whole pipeline and optimise it end to end: push «status = 'SUCCESS'» into the Parquet scan (skip row groups), read only needed columns, merge projections, pick join strategies.

### What "runs the plan again" really means
Spark keeps **lineage** (how to compute each partition), not results. A second action re-executes the lineage from the source: list files → read Parquet → filter → shuffle for dropDuplicates → aggregate. Only three things short-circuit it: **cache/persist**, **checkpoint**, or **shuffle files reused** from a previous job with identical lineage (you'll see "skipped stages").

### How to spot it
In the Jobs tab, two jobs with the same input size and almost the same stages = the same pipeline computed twice.`,
"0.5":`### What cache() actually stores
Default level for DataFrames is **MEMORY_AND_DISK**: partitions are stored in executors' storage memory in a compressed columnar format; what doesn't fit spills to local disk. The Storage tab shows how much was cached.

### Costs
- Storage memory competes with **execution memory** (joins, sorts). Execution can evict cached blocks.
- If an executor dies, its cached partitions are recomputed from lineage.
- Forgetting «unpersist()» keeps memory pinned for the rest of the app.

### Alternatives for the audit count
Read row counts from the **write's metrics** (the SQL tab shows "number of output rows"), or from Iceberg snapshot summaries («added-records»), which costs nothing extra.`,
"0.9":`### Where the time goes per file
1. **Listing**: S3 LIST returns 1,000 keys per call → 2,000+ calls before planning ends (Iceberg/Delta avoid this by tracking files in metadata).
2. **Opening**: one HTTP GET per file, plus a ranged read for the Parquet **footer** (schema + row-group stats).
3. **Scheduling**: each task has fixed overhead (serialise, launch, report) of tens of milliseconds.
4. **Throttling**: ~5,500 GET/s per prefix; beyond that S3 returns 503 and clients back off exponentially.

### Why compaction beats tuning
«maxPartitionBytes» only changes how files are grouped into tasks; every file is still opened. Compaction rewrites data into ~512 MB files once, so **every** reader (Spark, Athena, Trino) benefits. Pair it with fixing the writer: «write.distribution-mode=hash», «write.target-file-size-bytes», and longer streaming commit intervals.`,
"0.6":`### The formula
- Input partitions ≈ total bytes ÷ «maxSplitBytes» (≈128 MB) → 500 × 1,024 ÷ 128 ≈ 4,000.
- Cores = executors × cores per executor = 200.
- Waves = ⌈tasks ÷ cores⌉ = 20.

### Why it matters
Stage time ≈ waves × typical task time **+ the slowest task of the last wave**. Doubling cores halves the waves only if tasks are even and the source can feed them (S3 throughput, file counts).`,
"1.1":`### Inside an Exchange
**Map side** (end of the previous stage): each task computes «pmod(hash(merchant_id), 200)» for every row, buffers rows by target partition, spills sorted runs when memory fills, and writes **one data file + one index file** to local disk.

**Reduce side** (start of the next stage): each of the 200 reduce tasks asks the driver where its blocks are, then fetches **one block from every map task** over the network (M × R blocks), decompresses, and sorts/merges.

### Why it's expensive
Every row is serialised, written to disk, sent over the network and deserialised. For 2.1 TB that's terabytes of disk and network I/O — and on spot/preemptible nodes, losing an executor loses its shuffle files (FetchFailed → recompute).`,
"1.4":`### How Spark executes a broadcast
1. The small side is computed and **collected to the driver**.
2. The driver builds a hash table (or relation) and **broadcasts** it in chunks via a BitTorrent-like protocol to all executors.
3. Each task of the big side probes the hash table locally.

### When Spark picks it automatically
If the estimated size of one side < «spark.sql.autoBroadcastJoinThreshold» (10 MB) and the join type allows that side. Estimates come from table stats or file sizes — a 58 MB table after a filter might be reported as 4 GB if stats are stale. **AQE** fixes this at runtime using real sizes («spark.sql.adaptive.autoBroadcastJoinThreshold»).

### Safety limits
The hash table must fit on the driver and on every executor; «spark.sql.broadcastTimeout» (300 s) fails slow broadcasts. Comfortable range: up to a few hundred MB in memory.`,
"1.7":`### Why the preserved side can't be broadcast
In «A LEFT JOIN B», every row of A must appear, with NULLs when no B row matches. If A were broadcast, each task would hold all of A but only **its slice** of B, so it would wrongly emit "no match" rows for A-rows matched in other tasks.

| Join type | Can broadcast |
|---|---|
| inner | left or right |
| left outer / left semi / left anti | right only |
| right outer | left only |
| full outer | neither |

### The pre-aggregation trick
«payments.groupBy("merchant_id").agg(sum, count)» shrinks 2 TB to one row per merchant (partial aggregation does most of the work map-side), then «merchants LEFT JOIN agg» can broadcast the small aggregate.`,
"1.8":`### Sizing rule
Shuffle partitions ≈ shuffled bytes ÷ target size (100–300 MB). 1 TB ÷ 200 MB ≈ 5,000.

Too few (200 for 1 TB = 5 GB each): spills, GC, OOM. Too many (100,000): tiny blocks, M × R explosion, scheduler overhead.

With AQE, set «coalescePartitions.initialPartitionNum» high (e.g. 8,000) and «advisoryPartitionSizeInBytes» (e.g. 256 MB); AQE merges small partitions after seeing real sizes.`,
"2.1":`### Reading the summary table
For each metric Spark shows min / 25th / median / 75th / max across tasks. Even work looks like 0.4 / 0.5 / 0.5 / 0.6 / 0.8 s. Skew looks like 0.2 / 0.4 / 0.5 / 0.6 / **11 s** — one task (or a few) far out.

Check **Shuffle Read Size / Records** in the same table: if the max task also reads 50× the median bytes, the cause is **data** (a hot key), not a slow machine. If bytes are even but one task is slow, suspect a bad node (then speculation can help).

### Finding the key
Run a quick «groupBy(key).count().orderBy(desc("count")).limit(20)» on a sample or the day's data.`,
"2.4":`### Why NULL keys are special
- In an **inner join**, NULL never equals NULL, so those rows can't match anything — shuffling them is pure waste.
- In a **groupBy**, NULL is a valid group, and all NULL rows land in one partition.
- Source systems create placeholder keys too: «0», «-1», «'unknown'», «''».

### Patterns
~~~
valid = pay.filter("merchant_id IS NOT NULL")
nulls = pay.filter("merchant_id IS NULL")            # report or fix separately
~~~
For left joins where you must keep NULL-key rows: process them separately and «unionByName» the result back.`,
"2.5":`### Why partial aggregation wasn't enough
Spark already does map-side partial aggregation: each map task sums its own MegaMart rows. But on the reduce side, all partial rows for MegaMart still go to **one** reducer, and with millions of map outputs (or aggregations that can't combine well, like «collect_list» or distinct counts) that reducer still does huge work.

### How salting splits it
Phase 1 groups by «(merchant_id, salt)» → MegaMart becomes 16 groups spread across 16 reducers. Phase 2 groups by «merchant_id» over just 16 partial rows → trivial.

### Choosing N
N ≈ hot partition size ÷ target task size. 180 GB ÷ ~12 GB → 16. Salting non-hot keys is unnecessary; you can salt only when «merchant_id» is in a known hot list.`,
"2.9":`### Container memory, precisely
On YARN or Kubernetes the executor's container limit is: «spark.executor.memory» (heap) + «spark.executor.memoryOverhead» (default max(384 MB, 10% of heap)) + «spark.executor.pyspark.memory» (if set) + off-heap memory (if enabled).

### What lives in overhead
JVM metaspace and thread stacks, Netty network buffers (shuffle), native libraries (compression, Arrow), and — with PySpark — the **Python worker processes** that run UDFs and pandas UDFs (Arrow batches are copied there).

### Fix ladder
1. Raise «memoryOverhead» (15–25% for UDF-heavy PySpark).
2. Lower «spark.sql.execution.arrow.maxRecordsPerBatch» to shrink Arrow batches.
3. Replace Python UDFs with built-in functions where possible.
4. Fewer cores per executor (fewer concurrent Python workers per container).`
  };
  for (const k in D){ const [mi, si] = k.split(".").map(Number), S = M[mi].steps[si]; const tgt = S.options ? S.options.find(o => o.ok === true) : S; tgt.more = D[k]; }
})();

QUEST.interviews("spark", [
{title:"Spark round: Senior Data Engineer", icon:"🎤", place:"45-minute technical round", setup:"Ananya is a Staff Data Engineer at a fintech. She'll probe how deeply you understand Spark — not just definitions.",
 meters:{signal:{label:"Hire signal", value:40, unit:"%", goal:80, better:"high", max:100, cap:100}, depth:{label:"Depth", value:30, unit:"%", goal:75, better:"high", max:100, cap:100}, flags:{label:"Red flags", value:0, unit:"", goal:0, better:"low", max:5}},
 steps:[
  {say:[["ana","Hi! Let's start broad and go deep. Interrupt me if anything's unclear."]]},
  {choose:"“Walk me through what happens when you call df.write.parquet(path) on a DataFrame built from a filter, a join and a groupBy.”", model:`**Structure:** action → plan → stages → tasks → commit.
1. «write» is an **action**, so Spark takes the logical plan built by the transformations.
2. **Catalyst** analyses it (resolves columns against the catalog), optimises it (predicate pushdown, column pruning, constant folding), and picks a **physical plan** — e.g. broadcast vs sort-merge join, hash aggregate.
3. Tungsten generates code for each stage (whole-stage codegen).
4. The **DAG scheduler** cuts the plan into **stages at shuffle boundaries** (the join and the groupBy each add an Exchange), and the task scheduler runs **one task per partition** on executor cores.
5. Map stages write shuffle files to local disk; the next stage fetches its blocks.
6. The final stage writes Parquet files, and the **output committer** commits them so readers never see partial output.
*Bonus:* mention AQE re-planning at shuffle boundaries.`, options:[
   {t:"It's an action: Catalyst optimises the plan, picks join/aggregation strategies, the scheduler splits it into stages at the shuffles from the join and groupBy, tasks run per partition, and the final stage writes and commits the files.", ok:true, fx:{signal:6, depth:7}, why:"You gave the full pipeline in order and named the stage boundaries. Interviewers listen for **action vs transformation**, **Catalyst**, **stages at shuffles**, **tasks per partition**."},
   {t:"Spark runs the filter, join and groupBy and then writes the Parquet files.", ok:"partial", fx:{signal:-2}, why:"True but shallow: no laziness, no optimiser, no stages. It sounds like someone who has used Spark but not looked inside."},
   {t:"Each transformation runs as soon as I write it, and write just saves the result.", ok:false, fx:{signal:-8, flags:1}, why:"Red flag: transformations are lazy. This answer suggests a mental model from pandas."}]},
  {say:[["ana","Good. Practical one."]]},
  {choose:"“A nightly job that took 40 minutes now takes 3 hours. Same code. How do you debug it?”", model:`**Measure before changing anything.**
1. Compare the **Spark UI / history server** for a good run and a bad run: which **job** and **stage** grew?
2. In that stage: input size and **file count** (small files?), **task count**, **max vs median** task time and shuffle read (skew?), **spill** and **GC** (memory?).
3. **SQL tab**: did the **join strategy** flip (broadcast → sort-merge because stats are stale or data grew past the threshold)?
4. External changes: data volume growth, new upstream writer producing tiny files, cluster/instance type change, spot interruptions (FetchFailed retries).
5. Fix the root cause, re-run, compare again.`, options:[
   {t:"Increase executors and memory until it's fast again.", ok:false, fx:{signal:-8, flags:1}, why:"Red flag: throwing hardware at an undiagnosed problem. Skew, small files or a flipped join won't be fixed by more nodes — and the bill doubles."},
   {t:"Compare a good and bad run in the Spark UI: find the stage that grew, then check file counts, max vs median tasks for skew, spills and GC, and whether the join strategy changed in the SQL tab. Also check data growth and upstream changes.", ok:true, fx:{signal:6, depth:7}, why:"Structured, evidence-first, and you listed the four usual culprits. That's what a senior answer sounds like."},
   {t:"Check the logs for errors.", ok:"partial", fx:{signal:-2}, why:"Errors may not exist — slow jobs are usually healthy but inefficient. Needs a performance method."}]},
  {choose:"“Explain a shuffle. How do you make shuffles cheaper?”", model:`A shuffle redistributes rows so all rows with the same key land in the same partition. Map tasks hash each row's key («hash % numPartitions»), write a sorted data file + index to **local disk**; reduce tasks fetch their block from **every** map task over the network (M × R blocks), then sort/aggregate.
**Make it cheaper:** shuffle less data (filter and project first, pre-aggregate), avoid it (broadcast small sides, bucketing/storage-partitioned joins), right-size partitions (~100–300 MB, AQE coalescing), and handle skew. Infrastructure: external/remote shuffle service, decommissioning on spot.`, options:[
   {t:"It's when Spark moves data between executors by key; it's slow so I avoid it.", ok:"partial", fx:{signal:-1}, why:"Directionally right, but no mechanics and no concrete tools."},
   {t:"Rows are hash-partitioned by key; map tasks write sorted files to local disk and reducers fetch a block from every mapper. I shrink it by filtering and projecting early, pre-aggregating, broadcasting small sides, bucketing for repeated joins, and sizing partitions with AQE.", ok:true, fx:{signal:6, depth:7}, why:"Mechanism + four concrete levers. Mentioning local disk and M × R shows real depth."},
   {t:"A shuffle is when Spark reorders rows in memory randomly to balance load.", ok:false, fx:{signal:-8, flags:1}, why:"Incorrect: it's key-based redistribution through disk and network."}]},
  {task:["num","Ananya: “Your join shuffles 1.2 TB. Targeting about 200 MB per partition, roughly how many shuffle partitions?”",6000,200,"partitions","1.2 TB ≈ 1,200,000 MB ÷ 200 MB ≈ 6,000. With AQE, start higher and let it coalesce."], label:"Back-of-envelope", ok:{signal:4, depth:4}, bad:{signal:-4}},
  {choose:"“When do you use a broadcast join, and what can go wrong?”", model:`Use it when one side is **small enough to fit in memory on every executor** (and the driver, which builds it) and the **join type allows** that side: inner → either; left outer/semi/anti → right only; full outer → never. It removes the shuffle of the big side.
**What goes wrong:** in-memory size ≫ on-disk size (OOM); stale stats make Spark skip it or broadcast something too big; «broadcastTimeout»; very wide small tables. Use hints deliberately, keep stats fresh, and let **AQE** convert at runtime.`, options:[
   {t:"When one side is small: Spark copies it to every executor so the big side isn't shuffled. Watch the join type (left joins can only broadcast the right side), in-memory size vs file size, driver memory, stale stats; AQE can switch at runtime.", ok:true, fx:{signal:6, depth:7}, why:"You covered the mechanism, the join-type rule and failure modes."},
   {t:"Always broadcast the smaller table; Spark handles it.", ok:false, fx:{signal:-6, flags:1}, why:"'Always' is the red flag: full outer joins can't broadcast, and 'smaller' can still be gigabytes."},
   {t:"When a table is under 10 MB.", ok:"partial", fx:{signal:-1}, why:"That's the default threshold, not the reasoning. Senior answers explain why and the limits."}]},
  {choose:"“One task runs 40 minutes, the rest 30 seconds. What's going on and what do you do?”", model:`Classic **data skew** — confirm with the stage summary: max shuffle read ≫ median. Find hot keys with a quick count by key.
Fixes by case: **NULL/placeholder keys** → filter or handle separately; **skewed join** → AQE skew join, broadcast if the other side is small, or **salting** (random salt on the big side, replicate the small side N times); **skewed aggregation** → **two-phase aggregation** (group by key+salt, then key); a few known whales → process them separately. **Speculation doesn't help**: the copy reads the same data.`, options:[
   {t:"Probably a slow node; enable speculation.", ok:false, fx:{signal:-6, flags:1}, why:"Speculation copies the task — the copy reads the same skewed data."},
   {t:"Skew: check max vs median shuffle read, find hot keys, handle NULLs, then AQE skew join / broadcast / salting for joins or two-phase aggregation for groupBys. Speculation won't help.", ok:true, fx:{signal:6, depth:7}, why:"Diagnosis, root cause, and fixes matched to the operation — exactly the expected answer."},
   {t:"Increase spark.sql.shuffle.partitions.", ok:"partial", fx:{signal:-1}, why:"Helps uneven-but-not-hot partitions; a single hot key still lands in one partition."}]},
  {choose:"“cache(), persist() and checkpoint() — when do you use each?”", model:`- **cache()** = «persist(MEMORY_AND_DISK)» for DataFrames: lazy; filled by the next action; keeps lineage. Use when a DataFrame is **reused by multiple actions** and expensive to recompute. «unpersist()» after.
- **persist(level)**: choose the storage level (MEMORY_ONLY, DISK_ONLY, serialized…) for memory/CPU trade-offs.
- **checkpoint()**: **eager**, writes to reliable storage and **truncates lineage** — for very long lineages (iterative algorithms, streaming state) where recomputation or plan size explodes.
- For pipeline restartability, writing an **intermediate table** is often better than either.`, options:[
   {t:"cache keeps it in memory, persist on disk, checkpoint saves it.", ok:"partial", fx:{signal:-1}, why:"Partly wrong (cache also spills to disk) and misses laziness and lineage truncation."},
   {t:"cache = persist(MEMORY_AND_DISK), lazy, keeps lineage — for DataFrames reused by several actions. persist lets me pick the level. checkpoint is eager, writes to reliable storage and truncates lineage — for very long lineages. For restartability I'd write an intermediate table.", ok:true, fx:{signal:6, depth:7}, why:"Precise and practical, including when not to use them."},
   {t:"I cache everything to make jobs faster.", ok:false, fx:{signal:-8, flags:1}, why:"Caching single-use DataFrames wastes memory that joins and sorts need."}]},
  {say:[["ana","Last one — and it's where most people stumble."]]},
  {choose:"“Executors keep dying with 'Container killed … exceeding memory limits', but heap usage looks fine. Explain.”", model:`The container limit is **heap + memoryOverhead (+ pyspark.memory + off-heap)**. A non-full heap with container kills means **off-heap** usage: Python workers for UDFs/pandas UDFs (Arrow batches), Netty buffers, native libraries.
Fix: raise «spark.executor.memoryOverhead» (15–25% for PySpark), set «spark.executor.pyspark.memory», shrink Arrow batch sizes, replace Python UDFs with built-ins, or use fewer cores per executor. Distinguish from **Java heap OOM** (partition too big / skew / big broadcast → smaller partitions) and **driver OOM** (collect/toPandas/huge broadcast build).`, options:[
   {t:"The container also includes off-heap overhead — Python UDF workers, Netty buffers, native memory. I'd raise memoryOverhead (or pyspark.memory), shrink Arrow batches or replace UDFs; and I'd distinguish it from heap OOM and driver OOM.", ok:true, fx:{signal:6, depth:7}, why:"Correct cause, concrete fixes, and you separated it from other memory errors."},
   {t:"Increase executor memory to 64 GB.", ok:false, fx:{signal:-6, flags:1}, why:"More heap doesn't fix off-heap overuse and brings GC pauses."},
   {t:"It's a YARN bug; retry the job.", ok:false, fx:{signal:-8, flags:1}, why:"It's expected behaviour when total container memory is exceeded."}]},
  {say:[["ana","Thanks — I've got what I need. You explained mechanisms, not just definitions, and you always started with measurement. That's the bar for senior."]]}
 ],
 learned:["Start every debugging answer with **measurement** (Spark UI, compare runs).","Explain **mechanisms** (lazy plans, stages at shuffles, map/reduce files), then **levers**.","Name the **trade-offs and limits** (join-type rules, memory, when a fix doesn't apply).","Avoid red flags: 'add more nodes', 'cache everything', 'speculation fixes slowness'."]}
]);

/* ===== On-call desk: Spark incidents ===== */
QUEST.cases("spark", [
{
 title:"The nightly job got 4× slower", icon:"🐢", sev:2, clock:"06:12", channel:"inc-2291-settlements-slow", svc:"settlements-daily · Spark on EMR", need:4,
 terms:[["SLA", "Service-level agreement: the time by which a job's output must be ready (here, 07:00 for Finance)."], ["Driver / executors", "The driver plans the job and hands out tasks; executors are the worker processes that run them."], ["Task", "The smallest unit of Spark work: roughly one task per input split. Each task has a fixed cost to schedule and start."], ["Small files", "Many files far smaller than ~128 MB. Each one costs a listing call, an S3 open and footer reads, whatever its size."], ["Listing", "Before reading, the driver asks S3 for every file under the path. Millions of files = minutes of listing."], ["Streaming trigger", "How often a Structured Streaming query runs a micro-batch. Each micro-batch writes new files."], ["Compaction", "Rewriting many small files into fewer large ones, without changing the data."]],
 pager:`[r]FIRING[/r]  settlements_daily runtime > SLA
cluster   emr-prod-etl (j-2QX8KD41)   10 × r5.2xlarge
started   05:00 IST     status RUNNING (stage 2/7)
runtime   [y]1h 12m[/y] so far    p50 last 30 days: 24m
SLA       settlement file to Finance by [b]07:00 IST[/b]`,
 brief:"The settlement file goes to the bank at 9:30. Nobody has touched this job's code since last Wednesday, yet it's been slow **every night since Monday**. You have Slack, a terminal on the EMR master, dashboards and the Spark UI.",
 slack:[
  {at:0, who:"ravi", t:"Morning. Paged you since it's your pipeline. I glanced at EMR: all 10 nodes healthy, no spot losses."},
  {at:4, who:"priya", t:"First question in any \"it got slow\" incident: **what changed?** The job's code didn't. So check its *inputs*. Start with the driver log.", cmd:"tail -n 40 /var/log/spark/settlements_daily/driver.log"},
  {at:40, who:"arjun", t:"Hi! Any ETA? I need the file by 7 for the bank cutoff 🙏"},
  {at:110, who:"ravi", t:"FYI the Spark UI for the live run is in the 🖥 Spark UI tab, and the lake dashboards are up."},
  {on:"listing", who:"priya", t:"22 minutes just *listing* files is a smell. How many files are in today's input? Compare with a normal day.", cmd:"aws s3 ls s3://payu-lake/raw/txn_events/dt=2026-11-17/ --recursive --summarize"},
  {on:"smallfiles", who:"priya", t:"Same bytes, 400× the files. Who writes «raw/txn_events»? The streaming job does. Did *it* change on Monday?", cmd:"git -C ~/repos/txn-streaming log --oneline --since=2026-11-14"},
  {on:"commit", who:"ravi", t:"Kiran's change was for the live dashboard team. They wanted fresher numbers. Check the 🧾 Code tab for the actual diff."}
 ],
 hints:["The cluster is healthy and the data volume is the same. Something about *how* the data is laid out changed.","Run «aws s3 ls … --summarize» for today's partition and for last Friday's (dt=2026-11-14). Compare object counts.","Look at what writes into raw/txn_events: the streaming job. Check its git log and its trigger interval in the Code tab."],
 term:{host:"emr-prod-etl-master", user:"oncall", suggest:["yarn application -list","tail -n 40 /var/log/spark/settlements_daily/driver.log","aws emr list-instances --cluster-id j-2QX8KD41"],
  cmds:[
  {m:["yarn application -list","yarn app -list"], out:`Total number of applications (application-types: [] and states: [RUNNING]):1
                Application-Id      Application-Name   State       Progress   Tracking-URL
application_1731800400_0412   settlements_daily     [g]RUNNING[/g]     31%        http://ip-10-2-4-11:20888/proxy/application_1731800400_0412/`, note:"It's running, just slowly. Confirms the symptom, not the cause."},
  {m:["aws emr list-instances","aws emr describe-cluster"], out:`InstanceGroup   Type          Market     State     Count
MASTER          m5.xlarge     ON_DEMAND  RUNNING   1
CORE            r5.2xlarge    ON_DEMAND  RUNNING   10
[d]No instances terminated in the last 7 days.[/d]`, note:"All nodes are healthy. Hardware isn't the problem."},
  {m:["tail -n 40 /var/log/spark/settlements_daily/driver.log","tail /var/log/spark/settlements_daily/driver.log","cat /var/log/spark/settlements_daily/driver.log","tail -f /var/log/spark","tail /var/log/spark"], out:`05:00:04 INFO  SparkContext: Running Spark version 3.5.1
05:00:05 [y]WARN[/y]  SparkConf: The configuration key 'spark.yarn.executor.memoryOverhead' has been deprecated as of Spark 2.3 and may be removed in the future. Please use the new key 'spark.executor.memoryOverhead' instead.
05:00:11 INFO  InMemoryFileIndex: [b]Listing leaf files and directories in parallel under 1 paths.[/b] The first several paths are: s3://payu-lake/raw/txn_events/dt=2026-11-17
05:22:47 INFO  InMemoryFileIndex: [r]It took 1356432 ms to list leaf files for 1 paths.[/r]
05:22:52 INFO  FileSourceStrategy: Pushed Filters: IsNotNull(merchant_id)
05:22:58 INFO  DAGScheduler: Submitting [b]1281904 missing tasks[/b] from ShuffleMapStage 1 (scan txn_events)
05:41:10 INFO  TaskSetManager: Finished task 418220.0 in stage 1.0 (TID 418401) in [c]41 ms[/c] on ip-10-2-4-19 (418221/1281904)
06:11:58 INFO  TaskSetManager: Finished task 902114.0 in stage 1.0 (TID 902301) in [c]38 ms[/c] on ip-10-2-4-23 (902115/1281904)`, clue:"listing", unlock:["aws s3 ls s3://payu-lake/raw/txn_events/dt=2026-11-17/ --recursive --summarize"]},
  {m:["grep -i warn /var/log/spark","grep warn"], out:`05:00:05 WARN SparkConf: The configuration key 'spark.yarn.executor.memoryOverhead' has been deprecated as of Spark 2.3 ...
[d](1 match)[/d]`, note:"A deprecation warning. It's been in this log for a year and is harmless."},
  {m:["aws s3 ls s3://payu-lake/raw/txn_events/dt=2026-11-17","aws s3 ls s3://payu-lake/raw/txn_events/dt=2026-11-16","aws s3 ls s3://payu-lake/raw/txn_events/dt=2026-11-18"], out:`2026-11-17 00:00:12      31877 raw/txn_events/dt=2026-11-17/part-00000-7c1e...-c000.snappy.parquet
2026-11-17 00:00:12      34102 raw/txn_events/dt=2026-11-17/part-00001-7c1e...-c000.snappy.parquet
2026-11-17 00:00:22      29944 raw/txn_events/dt=2026-11-17/part-00000-91ab...-c000.snappy.parquet
[d]... 1281898 more lines ...[/d]

Total Objects: [r]1281904[/r]
   Total Size: [b]41.2 GiB[/b]     [d](average object ≈ 33 KB)[/d]`, clue:"smallfiles", unlock:["aws s3 ls s3://payu-lake/raw/txn_events/dt=2026-11-14/ --recursive --summarize"]},
  {m:["aws s3 ls s3://payu-lake/raw/txn_events/dt=2026-11-14","aws s3 ls s3://payu-lake/raw/txn_events/dt=2026-11-13","aws s3 ls s3://payu-lake/raw/txn_events/dt=2026-11-12"], out:`2026-11-14 00:05:01   148221930 raw/txn_events/dt=2026-11-14/part-00000-3d0f...-c000.snappy.parquet
2026-11-14 00:05:01   151004113 raw/txn_events/dt=2026-11-14/part-00001-3d0f...-c000.snappy.parquet
[d]... 2878 more lines ...[/d]

Total Objects: [g]2880[/g]
   Total Size: [b]39.8 GiB[/b]     [d](average object ≈ 14 MB)[/d]`, clue:"normalday"},
  {m:["git -C ~/repos/txn-streaming log","git log"], out:`[y]a91f3c2[/y] (Mon 16 Nov, kiran) Lower trigger to 10s so live dashboards are fresher
[y]5be0e71[/y] (Thu 12 Nov, kiran) Add merchant_category to event schema
[y]c4d22a9[/y] (Tue 10 Nov, dev)   Bump delta-spark to 3.2.1`, clue:"commit"},
  {m:["git -C ~/repos/settlements log"], out:`[y]e019bb4[/y] (Wed 11 Nov, you) Round settlement amounts to 2 dp before aggregation
[d]No commits since Wed 11 Nov.[/d]`, note:"Right — the job's own code hasn't changed since before the slowdown."},
  {m:["top","free -h","htop"], out:`top - 06:14:02 up 6 days, load average: 0.84, 0.91, 0.88
MiB Mem :  15827.4 total,   9120.6 free,   5012.2 used
PID   USER   %CPU  %MEM  COMMAND
8812  hadoop  38.1  21.4  java (spark driver)`, note:"The driver is mostly idle and has plenty of memory. Nothing is starved here."}
 ]},
 dash:[
  {title:"settlements_daily runtime (min)", unit:"m", x:["Wed","Thu","Fri","Sat","Sun","Mon","Tue","Today"], series:[{name:"runtime", v:[24,25,23,26,24,97,101,72]}], marks:[{i:5, label:"Mon"}], note:"That's the symptom you were paged for. It tells you *when* things changed (Monday), not *why*."},
  {title:"Objects written per day · raw/txn_events", x:["Wed","Thu","Fri","Sat","Sun","Mon","Tue"], series:[{name:"objects", v:[2880,2876,2880,2880,2880,1281904,1281904]}], marks:[{i:5, label:"Mon"}], clue:"filerate"},
  {title:"Bytes landed per day (GiB)", unit:"G", x:["Wed","Thu","Fri","Sat","Sun","Mon","Tue"], series:[{name:"GiB", v:[39.6,40.1,39.8,38.9,37.2,40.4,41.2]}], clue:"volume"},
  {title:"Executor CPU % · JVM GC %", unit:"%", x:["Wed","Thu","Fri","Sat","Sun","Mon","Tue"], series:[{name:"CPU %", v:[71,69,72,70,68,19,17]}, {name:"GC %", v:[3,3,2,3,3,3,2]}], note:"GC is flat, so memory is fine. CPU dropped because executors are *waiting* on S3 opens and task scheduling, not computing. Adding CPU won't help."}
 ],
 uiName:"Spark UI",
 ui:[
  {title:"Stages · live run", md:`| Stage | Description | Tasks | Median task | Duration |
|---|---|---|---|---|
| 0 | Listing leaf files (1 path) | 1 | — | **22.6 min** |
| 1 | scan txn_events · Exchange | 902,115 / **1,281,904** | **38 ms** | 49 min (running) |
| 2–6 | aggregate · join merchants · write | pending | — | — |`, clue:"tasks"},
  {title:"Executors · live run", md:`| | Active | Dead | Failed tasks | GC time | Shuffle spill |
|---|---|---|---|---|---|
| Executors | 10 | 0 | 0 | 2.9% | 0 B |`, note:"All executors healthy: no deaths, failures, GC or spill. The engine is fine; it's being fed badly."},
  {title:"Staging repro · one hour of Monday's data", img:"img/spark-stage-smallfiles.png", cap:"Real Spark UI: 94 tasks read only 61.7 MiB in total (~0.66 MiB each); median task 0.4 s. Each task is mostly overhead.", clue:"tasks"}
 ],
 files:[
  {path:"txn-streaming/src/ingest_txn_events.py", meta:"changed in a91f3c2 (Mon)", text:`from pyspark.sql import functions as F

events = (spark.readStream.format("kafka")
    .option("subscribe", "txn-events")
    .option("maxOffsetsPerTrigger", 2_000_000)
    .load())

parsed = events.select(F.from_json(F.col("value").cast("string"), SCHEMA).alias("e")).select("e.*")

(parsed.withColumn("dt", F.to_date("event_ts"))
    .repartition(48)
    .writeStream
    .format("parquet")
    .option("checkpointLocation", "s3://payu-lake/_chk/txn_events")
    .partitionBy("dt")
    .trigger(processingTime="10 seconds")   # was "5 minutes"
    .start("s3://payu-lake/raw/txn_events"))`, clues:{17:"trigger", 12:"repartition"}, notes:{5:"maxOffsetsPerTrigger only caps how much each micro-batch reads. It's not why files are tiny."}}
 ],
 clues:{
  listing:"Driver spent 22.6 min just listing files for one partition",
  smallfiles:"Today's partition has 1,281,904 objects averaging ~33 KB",
  normalday:"Last Friday: same ~40 GiB in only 2,880 files (~14 MB each)",
  filerate:"Objects written per day jumped from ~2.9k to ~1.28M on Monday",
  volume:"Bytes per day are flat at ~40 GiB, so the data didn't grow",
  tasks:"Scan stage has ~1.28M tasks at ~38 ms each: scheduling overhead dominates",
  commit:"Monday's commit a91f3c2 lowered the streaming trigger to 10 s",
  trigger:"ingest_txn_events.py: «trigger(processingTime=\"10 seconds\")» (was 5 minutes)",
  repartition:"Each micro-batch is repartitioned to 48 files: 48 files × 8,640 batches/day"
 },
 cause:{q:"What's the root cause?", o:[
  {t:"Monday's streaming change (10 s trigger × 48 partitions) floods the raw table with ~1.3M tiny files. Listing and per-file task overhead now dominate the nightly job.", ok:true},
  {t:"Monday's Diwali traffic increased data volume ~4×", ok:false, why:"Bytes per day stayed flat at ~40 GiB. Only the file count changed.", say:[["meera","Volume's flat though: 40 GiB a day all week. I check that for the finance dashboards."]]},
  {t:"The cluster is undersized — we need more executors", ok:false, why:"CPU at 17% and zero GC/spill say executors are idle, waiting on overhead.", say:[["ravi","Executors are at 17% CPU. They're bored, not overloaded. Why would more of them help?"]]},
  {t:"Driver memory pressure from the deprecated memoryOverhead config", ok:false, why:"The WARN is a year old, and the driver has 9 GB free.", say:[["priya","That WARN has been there since 2025, and the driver has 9 GB free. Follow the timeline: what changed on *Monday*?"]]}
 ]},
 fix:{q:"What do you ship? Pick every action you'd take now.", o:[
  {t:"Compact today's partition into ~128 MB files, then re-run the job on the compacted copy", kind:"must", why:"Gets today's settlement file out. 1.28M files become ~330, so listing and scan go back to minutes.", miss:[["arjun","It's 06:58 and the job is still on stage 2. I'm telling the bank we'll be late 😞"]]},
  {t:"Set the streaming trigger back to 5 minutes (or add an hourly compaction step), and agree a freshness target with the dashboard team", kind:"must", why:"Stops new small files at the source. Without this, tomorrow night is slow again.", miss:[["priya","Today's file is out, nice. But the streaming job is still writing ~53k files an hour, so we'll be back here tomorrow night. What stops the bleeding?"]]},
  {t:"Move raw/txn_events to Iceberg and schedule «rewrite_data_files» with a 128 MB target", kind:"good", why:"Makes compaction routine, so freshness and file size stop fighting each other."},
  {t:"Alert when files-per-partition or average file size crosses a threshold", kind:"good", why:"Catches this the morning it starts, not after three slow nights."},
  {t:"Raise «spark.sql.files.maxPartitionBytes» and «openCostInBytes»", kind:"meh", why:"Packs more small files into each task, so fewer tasks. Driver listing and per-file S3 opens stay just as slow."},
  {t:"Double the cluster to 20 nodes for tonight", kind:"bad", why:"Listing runs on the driver and per-file overhead doesn't parallelise away. You pay double and gain almost nothing.", say:[["ravi","Scaled to 20 nodes. Runtime estimate went from 98 → 91 min. The listing phase didn't move at all."],["arjun","Also… why did the EMR cost alert just fire? 💸"]]},
  {t:"Delete the tiny files under 10 KB to speed things up", kind:"bad", why:"Those files are real transactions. Deleting data to make a job faster is never the fix.", say:[["meera","Hold on!! Settlement totals for the 17th just dropped by ₹3.2 cr. Did someone delete raw files?"],["priya","Restoring from S3 versioning now. Please never delete raw data to make a job faster."]]},
  {t:"Kill the job and restart it with 64 GB of driver memory", kind:"bad", why:"Memory wasn't the bottleneck, and restarting throws away 70 minutes of progress.", say:[["ravi","Restarted with 64g. We lost 70 minutes of progress and it's back to listing files. 😬"]]}
 ]},
 post:{
  summary:"settlements_daily breached its 07:00 SLA three nights in a row. Its input partition held **1.28M objects (~33 KB each)** instead of ~2,900 (~14 MB each) after an upstream streaming job lowered its trigger interval. Data volume was unchanged.",
  cause:"Commit «a91f3c2» set the streaming writer's trigger from 5 minutes to **10 seconds**, and each micro-batch wrote **48 files** («repartition(48)»). That's 8,640 batches × 48 ≈ **415k files a day**, which retries and late batches pushed past 1.28M. The nightly batch paid twice:\n- **Driver listing**: 22.6 min to list one partition.\n- **Per-file task overhead**: 1.28M scan tasks at ~38 ms each, mostly open, schedule and footer reads.",
  prevent:["Compaction is part of every streaming sink: an hourly rewrite or Iceberg «rewrite_data_files»","Changes to a shared table's file layout need a heads-up to downstream owners","Alert on objects per partition and average file size","Add a «why fresh?» field to trigger changes and agree freshness SLOs per consumer"]
 },
 learned:["\"It got slow and nothing changed\" → diff the **inputs**: file count, bytes, schema, skew.","Small files hurt twice: **driver listing** plus **per-task overhead**. Bigger clusters don't fix either.","Streaming freshness and file size trade off. **Compaction** reconciles them.","Fix today, then fix the source, then add the **alert** that would have caught it."],
 cards:["smallfiles","partitions"]
},
{
 title:"Executors keep getting killed", icon:"💥", sev:2, clock:"14:05", channel:"inc-2307-risk-features-oom", svc:"risk-features · Spark on EMR", need:4,
 terms:[["Exit 137", "The process got SIGKILL (128 + 9). On YARN that usually means the container went over its memory limit."], ["Container", "The memory box YARN gives an executor: heap + memoryOverhead. Go over it and YARN kills it."], ["JVM heap", "Memory managed by Java (spark.executor.memory): DataFrames, caching, shuffle buffers."], ["memoryOverhead", "Memory outside the heap: Python workers, Arrow buffers, native libs, thread stacks. Default max(384 MB, 10% of heap)."], ["pandas UDF", "A Python function Spark runs on Arrow batches in separate Python processes, outside the JVM."], ["Arrow batch", "A columnar chunk of rows Spark ships to Python; «maxRecordsPerBatch» sets its size."]],
 pager:`[r]FIRING[/r]  risk_features_hourly FAILED (attempt 4/4)
error     Job aborted due to stage failure: Task 37 in stage 4.0 failed 4 times
          ExecutorLostFailure (executor 12 exited caused by one of the running tasks)
          Reason: [y]Container from a bad node … Exit status: 137[/y]
impact    fraud model is scoring with features [b]2 hours stale[/b]`,
 brief:"The hourly feature job for the fraud model has failed twice in a row. Risk is nervous: stale features mean fraud slips through. Yesterday's 6 PM deploy shipped a new feature column.",
 slack:[
  {at:0, who:"ravi", t:"Exit 137 = something got SIGKILLed. Could be spot reclaim, could be memory. Your call."},
  {at:5, who:"priya", t:"Don't guess from the exit code. Get the actual container logs for the failed app.", cmd:"yarn logs -applicationId application_1731900011_0088 | grep -i killed"},
  {at:45, who:"sana", t:"Risk team here (wearing my fraud hat today) — how long until features are fresh? Chargebacks are spiking."},
  {on:"killed", who:"priya", t:"So it's not spot. YARN killed it for exceeding the container limit. Is the overflow on the **heap** or **outside** it? Check the executor config.", cmd:"cat /etc/spark/conf/spark-defaults.conf"},
  {on:"conf", who:"ravi", t:"Overhead's at the default (10% of 30g = 3g). Did anything new start using off-heap memory yesterday? Check the deploy.", cmd:"git -C ~/repos/risk-features log --oneline -5"},
  {on:"commit", who:"priya", t:"A «pandas_udf»: the Python workers and Arrow buffers all live **outside** the JVM heap. Look at the code."}
 ],
 hints:["Exit 137 with \"Container killed by YARN for exceeding physical memory limits\" means the *whole container* overflowed, not the Java heap.","A Java OutOfMemoryError would show up as a heap error. Here the heap looks fine; the extra memory is outside it.","Yesterday's deploy added a pandas UDF. Python workers and Arrow batches count against memoryOverhead, which is still at the default 3 GB."],
 term:{host:"emr-risk-master", user:"oncall", suggest:["yarn application -list -appStates FAILED","aws ec2 describe-spot-instance-requests --filters Name=state,Values=closed"],
  cmds:[
  {m:["yarn application -list"], out:`Application-Id                   Name                    State    Final-State
application_1731900011_0088      risk_features_hourly    FINISHED [r]FAILED[/r]
application_1731900011_0071      risk_features_hourly    FINISHED [r]FAILED[/r]
application_1731900011_0059      risk_features_hourly    FINISHED [g]SUCCEEDED[/g]`, note:"Confirms the failures started after a run that succeeded. Now find out why.", unlock:["yarn logs -applicationId application_1731900011_0088 | grep -i killed"]},
  {m:["yarn logs -applicationid application_1731900011_0088","yarn logs"], out:`Container: container_1731900011_0088_01_000013 on ip-10-4-1-77
LogType:stderr
2026-11-18 13:41:09 INFO PythonRunner: Times: total = 41210, boot = 3, init = 412, finish = 40795
2026-11-18 13:41:52 [r]ERROR YarnScheduler: Lost executor 12 on ip-10-4-1-77: Container killed by YARN for exceeding physical memory limits. 33.1 GB of 33 GB physical memory used.[/r] Consider boosting spark.executor.memoryOverhead.
2026-11-18 13:41:52 WARN TaskSetManager: Lost task 37.0 in stage 4.0 (TID 1191): ExecutorLostFailure (executor 12 exited caused by one of the running tasks) Reason: Container killed … Exit status: 137
[d]-- jvm heap at time of kill (from GC log): used 18.2 GB / 30 GB --[/d]`, clue:"killed", unlock:["cat /etc/spark/conf/spark-defaults.conf"]},
  {m:["aws ec2 describe-spot-instance-requests"], out:`{
    "SpotInstanceRequests": []
}
[d]No spot requests closed in the last 24h (cluster is ON_DEMAND).[/d]`, note:"No spot reclaims. The cluster is on-demand, so that theory is out."},
  {m:["cat /etc/spark/conf/spark-defaults.conf","cat spark-defaults.conf"], out:`spark.executor.memory              30g
spark.executor.cores               5
[d]# spark.executor.memoryOverhead    (unset → max(384m, 10% of 30g) = 3g)[/d]
spark.sql.execution.arrow.pyspark.enabled  true
spark.sql.execution.arrow.maxRecordsPerBatch  [y]100000[/y]
spark.dynamicAllocation.enabled    true`, clue:"conf", unlock:["git -C ~/repos/risk-features log --oneline -5"]},
  {m:["git -C ~/repos/risk-features log","git log"], out:`[y]7f2a9e0[/y] (Tue 17 Nov 18:02, nisha) Add device_risk_embedding feature via pandas_udf (sentence-transformers)
[y]33ce1d4[/y] (Fri 13 Nov, you)          Backfill velocity features for Diwali week
[y]9a01b77[/y] (Wed 11 Nov, dev)          Upgrade EMR to 7.3`, clue:"commit"},
  {m:["dmesg","dmesg | grep -i oom"], out:`[d][6 days] no kernel OOM-killer events on this host[/d]`, note:"No kernel OOM kills on the master. YARN's monitor did the killing on the core node."},
  {m:["df -h"], out:`Filesystem   Size  Used Avail Use% Mounted on
/dev/nvme0n1  100G   41G   59G  41% /
/dev/nvme1n1  1.7T  390G  1.3T  23% /mnt`, note:"Disks are fine. Nothing to do with this incident."}
 ]},
 dash:[
  {title:"Container physical memory · executor 12 (GB)", unit:"G", x:["13:30","13:33","13:36","13:39","13:41"], series:[{name:"RSS", v:[19,24,29,32.4,33.1]}, {name:"YARN limit", v:[33,33,33,33,33]}], clue:"rss"},
  {title:"JVM heap used · executor 12 (GB)", unit:"G", x:["13:30","13:33","13:36","13:39","13:41"], series:[{name:"heap", v:[16.1,17.4,18.0,18.2,18.2]}, {name:"heap max", v:[30,30,30,30,30]}], clue:"heap"},
  {title:"Input rows per hour (M)", unit:"M", x:["Fri","Sat","Sun","Mon","Tue","Wed"], series:[{name:"rows", v:[41,39,38,42,43,42]}], note:"Input volume is steady. More data didn't cause this."},
  {title:"Cluster nodes", x:["12:00","12:30","13:00","13:30","14:00"], series:[{name:"core nodes", v:[12,12,12,12,12]}], note:"No nodes lost. It's containers, not machines, dying."}
 ],
 uiName:"Spark UI",
 ui:[
  {title:"Executors · failed run", md:`| Executor | Status | Heap used / max | Failed tasks | Reason |
|---|---|---|---|---|
| 12 | **Dead** | 18.2 / 30 GB | 4 | Container killed (33.1/33 GB) |
| 7 | **Dead** | 17.9 / 30 GB | 3 | Container killed (33.0/33 GB) |
| 3 | Active | 15.4 / 30 GB | 0 | — |`, clue:"heap"},
  {title:"Stage 4 · tasks", md:`| Stage | Description | Tasks | Median | Max | Shuffle read max |
|---|---|---|---|---|---|
| 4 | «ArrowEvalPython» device_risk_embedding | 200 | 38 s | 41 s | 212 MB |`, note:"Task times and shuffle reads are even, so this isn't skew. Every task in the UDF stage is heavy."}
 ],
 files:[
  {path:"risk-features/features/device_risk.py", meta:"added in 7f2a9e0 (Tue 18:02)", text:`import pandas as pd
from pyspark.sql.functions import pandas_udf
from sentence_transformers import SentenceTransformer

@pandas_udf("array<float>")
def device_risk_embedding(fingerprints: pd.Series) -> pd.Series:
    model = SentenceTransformer("all-MiniLM-L6-v2")   # loaded per batch, ~90 MB
    vecs = model.encode(fingerprints.tolist(), batch_size=512)
    return pd.Series(list(vecs))

features = features.withColumn("device_emb", device_risk_embedding("device_fingerprint"))`, clues:{5:"udf", 7:"modelload"}, notes:{11:"Adding the column is fine. What matters is where the UDF runs."}}
 ],
 clues:{
  killed:"YARN killed executors: 33.1 GB of 33 GB *physical* memory (exit 137)",
  heap:"JVM heap was only ~18 GB of 30 GB when the container died",
  rss:"Container RSS climbed to the 33 GB limit during the UDF stage",
  conf:"memoryOverhead unset → default 3 GB; Arrow batches of 100k rows",
  commit:"Tuesday's deploy 7f2a9e0 added a pandas_udf with a sentence-transformers model",
  udf:"device_risk.py: a pandas_udf runs in Python workers, outside the JVM heap",
  modelload:"The model (~90 MB plus tensors) is loaded inside every Arrow batch, in every Python worker"
 },
 cause:{q:"What's the root cause?", o:[
  {t:"The new pandas UDF's Python workers (model + Arrow batches) use off-heap memory, overflowing the default 3 GB memoryOverhead, so YARN kills the container", ok:true},
  {t:"Java heap OutOfMemoryError: 30 GB isn't enough", ok:false, why:"The heap peaked at ~18 GB of 30. The overflow happened outside the heap.", say:[["priya","Heap peaked at 18 of 30 GB. If it were a heap OOM we'd see «java.lang.OutOfMemoryError», not a YARN kill."]]},
  {t:"Spot instances are being reclaimed", ok:false, why:"The cluster is on-demand, and no nodes were lost.", say:[["ravi","We're fully on-demand, and node count is flat at 12. It's not spot."]]},
  {t:"Data skew: one huge key in stage 4", ok:false, why:"Median and max task times are ~equal; shuffle reads are even.", say:[["priya","Median 38 s, max 41 s. That's not skew. Every task is heavy."]]}
 ]},
 fix:{q:"What do you ship? Pick every action you'd take.", o:[
  {t:"Set «spark.executor.memoryOverhead=8g» and drop heap to «24g» so the container still fits the node", kind:"must", why:"Moves memory to where the Python workers actually use it, without asking YARN for more than the node has.", miss:[["ravi","Re-ran with smaller Arrow batches. Got further, but executor 9 just died with 33.4/33 GB. Overhead is still 3 GB."]]},
  {t:"Lower «arrow.maxRecordsPerBatch» to 10k and load the model once per worker (cache it at module level or use «mapInPandas» with an iterator)", kind:"must", why:"Cuts peak Python memory per batch and stops reloading a model in every batch.", miss:[["priya","It's green now, but each Python worker still loads the model in every batch, and with 100k-row batches memory is right at the edge. Next week's bigger traffic will kill it again."]]},
  {t:"Precompute embeddings in a separate GPU/inference job and join them in", kind:"good", why:"Keeps heavy ML inference out of the ETL critical path. Longer term, the cleaner design."},
  {t:"Alert on container RSS vs limit, not just the job's success or failure", kind:"good", why:"You'd see the squeeze at 90% before the kills start."},
  {t:"Enable speculative execution", kind:"meh", why:"Duplicates slow tasks; every copy still overflows the same way."},
  {t:"Raise «spark.executor.memory» to 60g", kind:"bad", why:"r5.2xlarge has 64 GB; 60g heap + overhead won't fit, and the heap wasn't the problem anyway.", say:[["ravi","Submitted with 60g executors… now YARN can't place a single container: «Required executor memory (61440+6144 MB) is above the max threshold of this cluster». Job's stuck at 0 executors."]]},
  {t:"Disable the new feature column without telling the risk team", kind:"bad", why:"Silently changing a fraud model's inputs is a model-risk incident of its own.", say:[["sana","Wait — the fraud model just started scoring with a null device_emb? Who changed the features without telling us? That's a model-risk incident now."]]}
 ]},
 post:{
  summary:"risk_features_hourly failed 2 runs in a row with exit 137, so fraud features went **2+ hours stale**. Tuesday's deploy added a pandas UDF that loads a sentence-transformers model.",
  cause:"An executor container = **heap (30 GB) + memoryOverhead (3 GB default)**. A pandas UDF runs in **Python worker processes** fed by **Arrow batches**, and all of that memory is *outside* the JVM heap, inside the overhead budget. Each worker loaded a ~90 MB model *per batch* and held 100k-row Arrow batches. With 5 cores, that's 5 workers per executor. RSS climbed to 33.1 GB and YARN's memory monitor killed the container. The heap sat at 18 GB the whole time.",
  prevent:["Any PR adding a Python/pandas UDF must set and justify memoryOverhead","Load models once per worker (iterator-style «mapInPandas» or a module-level cache)","Move ML inference to a dedicated inference job; ETL joins the results","Dashboard: container RSS vs YARN limit per executor"]
 },
 learned:["Exit 137 + \"exceeding physical memory limits\" = **container** overflow. Look **off-heap**, not at the heap.","Python UDFs, Arrow, PySpark workers and native libraries all live in **memoryOverhead**.","Bigger heap can make it **worse**: it steals room the off-heap side needs.","Prove the theory with two numbers: **heap used** vs **container RSS** at the moment of death."],
 cards:["memory"]
}
]);
