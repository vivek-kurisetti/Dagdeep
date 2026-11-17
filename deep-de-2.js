window.RM_DEEP = Object.assign(window.RM_DEEP || {}, {

"de-3-1-1": {dd:`## The pieces
- **Driver:** runs your program, builds the plan, schedules tasks and tracks results.
- **Executors:** JVM processes on worker nodes that run tasks and cache data. Each has a number of cores (task slots) and memory.
- **Cluster manager:** YARN, Kubernetes or Spark standalone; it hands out executors.

## From code to tasks
1. Transformations (filter, select, join) build a **logical plan**. Nothing runs yet: Spark is lazy.
2. An **action** (write, count, collect) triggers a **job**.
3. Catalyst optimizes the plan (pushes filters down, prunes columns, picks join strategies) and produces a **physical plan**.
4. The DAG scheduler splits the job into **stages** at every shuffle boundary.
5. Each stage runs one **task per partition**; tasks are the unit of parallelism.

## Narrow vs wide transformations
- **Narrow:** each output partition depends on one input partition (filter, map, select). They are pipelined inside one stage.
- **Wide:** an output partition needs data from many input partitions (groupBy, join without broadcast, distinct, repartition). This requires a **shuffle**: map tasks write partitioned files to local disk, and the next stage's tasks fetch their piece from every map task over the network.
Shuffles are usually the most expensive part of a job: disk writes, network transfer, serialization and sorting.

## Partitions
- Input partitions come from file splits (about «spark.sql.files.maxPartitionBytes», 128 MB by default).
- Shuffle partitions come from «spark.sql.shuffle.partitions» (200 by default), adjusted at runtime by AQE.
- Too few partitions: big tasks, spills and idle cores. Too many: scheduling overhead and tiny output files.

## Reading the Spark UI
- **Jobs and Stages:** find the slowest stage.
- **Task summary:** compare median and max duration. A max far above the median means skew.
- **Shuffle read and write sizes:** the data moved between stages.
- **Spill (memory and disk):** data that did not fit in execution memory.
- **SQL tab:** the physical plan with row counts per operator, including which join was chosen.`,
iq:[
 ["B","What is the difference between a transformation and an action?","Transformations (filter, select, join) return a new DataFrame and only build the plan. Actions (count, collect, write) trigger execution of a job. Because Spark is lazy, it can optimize the whole plan before running anything."],
 ["I","What is a shuffle and why is it expensive?","A shuffle redistributes data across partitions by key, needed for wide operations like groupBy and most joins. Map tasks write partitioned data to disk, reducers fetch it over the network, then often sort it. It costs disk I/O, network, serialization and memory, and it marks a stage boundary."],
 ["I","How do jobs, stages and tasks relate?","Each action creates a job. The job is split into stages at shuffle boundaries. Each stage runs as many tasks as it has partitions, in parallel across executor cores. So the number of tasks is driven by partitioning, and the number of stages by the number of shuffles."],
 ["S","A job has 199 tasks finishing in 30 seconds and one running for 40 minutes. What is happening and what do you do?","Data skew: one partition holds far more data, usually one hot key in a join or groupBy. Confirm with the task summary (max vs median input size) and by counting rows per key. Fixes: enable AQE skew join, broadcast the smaller side if possible, salt the hot key, filter or handle hot keys separately, or pre-aggregate before the shuffle."]
]},

"de-3-1-2": {dd:`## How Spark chooses a join strategy
For equi-joins, Spark SQL picks among:
- **Broadcast hash join:** the smaller side is collected and sent to every executor; each task joins its partition of the big side locally. No shuffle of the big side. Chosen when a side's estimated size is below «spark.sql.autoBroadcastJoinThreshold» (10 MB by default) or when you add a broadcast hint.
- **Shuffle hash join:** both sides shuffled by key, a hash table built on the smaller side per partition.
- **Sort-merge join:** both sides shuffled by key and sorted, then merged. The default for large-to-large joins; robust because it can spill.
- **Broadcast nested loop / cartesian:** for non-equi joins; very expensive at scale.
With AQE on, Spark can switch a sort-merge join to a broadcast join at runtime when it discovers that one side is small after filtering.

## Skew
Skew means a few keys hold a large share of rows. After the shuffle, those keys all land in one partition, so one task runs far longer than the rest. Typical causes: NULL keys, a default value such as 0 or "unknown", or one very large merchant.

Remedies, in order of effort:
1. **Filter or separate junk keys:** NULL keys never match in an inner join, so filter them before the shuffle.
2. **AQE skew join:** «spark.sql.adaptive.skewJoin.enabled» splits oversized partitions and replicates the matching part of the other side.
3. **Broadcast** the smaller side if it fits.
4. **Salting:** add a random salt (0..N-1) to the big side's key, and replicate the small side N times with every salt value, then join on key plus salt.
5. **Split processing:** handle the few hot keys in a separate job, then union.

## Partitioning to avoid shuffles
If two large tables are always joined on the same key, writing both **bucketed** by that key with the same number of buckets lets Spark join them without a shuffle. Iceberg's bucket transform supports storage-partitioned joins in recent Spark versions.

## repartition vs coalesce
«repartition(n)» does a full shuffle and can increase or decrease partitions, evenly distributed. «coalesce(n)» only merges partitions without a shuffle, so it is cheap but can create uneven partitions and reduces upstream parallelism if placed early.`,
iq:[
 ["B","What is a broadcast join and when should you use it?","Spark sends the small table to every executor so each partition of the large table can be joined locally, avoiding a shuffle of the large table. Use it when one side comfortably fits in executor memory, for example a dimension table of tens or hundreds of MB."],
 ["I","Explain sort-merge join.","Both inputs are shuffled so rows with the same key land in the same partition, each partition is sorted by key, and the two sorted streams are merged. It handles very large inputs because sorting can spill to disk. It is Spark's default for large equi-joins."],
 ["I","What is the difference between repartition and coalesce?","repartition triggers a full shuffle and produces evenly sized partitions; it can increase or decrease the count. coalesce merges existing partitions without a shuffle, so it is cheaper but only reduces the count and can leave partitions uneven. Use coalesce to reduce output files at the end, repartition when you need balance or a specific key distribution."],
 ["S","Walk through salting to fix a skewed join.","On the large side add salt = floor(rand() * N). On the small side, explode each row into N rows with salt 0..N-1. Join on (key, salt). The hot key's rows are now spread across N partitions while each still finds its match. Choose N from the skew ratio, and apply salting only to hot keys if the small side is large."]
]},

"de-3-1-3": {dd:`## Executor memory
An executor's heap («spark.executor.memory») is divided roughly into:
- **Reserved:** 300 MB.
- **Unified memory** («spark.memory.fraction», 0.6 of the rest): shared by **execution** (shuffles, joins, sorts, aggregations) and **storage** (cached data). Execution can evict cached blocks when it needs space.
- **User memory:** the rest, for your own objects and UDF data structures.
Off-heap overhead («spark.executor.memoryOverhead», default 10% or 384 MB) covers JVM internals, Python worker processes in PySpark, and network buffers. "Container killed for exceeding memory limits" on YARN or Kubernetes usually means overhead is too small, not the heap.

## Sizing executors
A common starting point is 4 to 5 cores per executor, memory of 4 to 8 GB per core, and leaving a core and some memory per node for the OS and node manager. Very large executors (30+ cores) suffer from long garbage-collection pauses; very small ones waste memory on overhead and can't broadcast tables.

## Adaptive Query Execution (AQE)
On by default since Spark 3.2. At each shuffle boundary, Spark looks at real statistics and:
- **Coalesces** small shuffle partitions into fewer, larger ones.
- **Switches join strategy**, for example sort-merge to broadcast, when a side turns out small.
- **Splits skewed partitions** in joins.
Set «spark.sql.shuffle.partitions» high enough for the largest stage, and let AQE coalesce downwards.

## Spills and caching
A spill happens when execution memory cannot hold a sort or hash table, so data goes to disk. Small spills are fine; large spills slow tasks badly. Reduce data per task (more partitions), filter earlier, or add memory.
Cache a DataFrame only if it is reused more than once and expensive to recompute, and call «unpersist()» when done. Caching everything just competes with execution memory.

## Other wins
- Avoid Python UDFs where a built-in function exists; built-ins run in the JVM without serialization. If you need Python, use pandas UDFs (vectorised through Arrow).
- Prune columns and filter as early as possible, and read from formats that support pushdown.
- Use dynamic allocation so idle executors are released.`,
iq:[
 ["B","What is AQE?","Adaptive Query Execution re-optimizes the plan at runtime using real statistics gathered at shuffle boundaries. It coalesces small shuffle partitions, switches sort-merge joins to broadcast joins when a side turns out to be small, and splits skewed partitions."],
 ["I","Executors are being killed with 'container exceeded memory limits'. What do you change?","That limit includes off-heap usage, so raise spark.executor.memoryOverhead, especially with PySpark or large shuffles. Also reduce memory per task: more shuffle partitions, fewer cores per executor, avoid collecting large objects in UDFs. Check for skew, since one huge partition can blow memory on its own."],
 ["I","Why are Python UDFs slow and what are the alternatives?","Each row is serialized from the JVM to a Python worker and back, and Catalyst cannot optimize inside the UDF. Prefer built-in functions in pyspark.sql.functions, or Spark SQL expressions. If Python logic is unavoidable, use pandas UDFs, which transfer batches via Arrow and run vectorised."],
 ["S","How would you size a cluster for a daily job that shuffles 2 TB?","Target about 128-200 MB per shuffle partition, so roughly 10,000-16,000 partitions. With 5-core executors and 4 GB per core, decide how many waves of tasks you accept: 400 cores run 16,000 tasks in 40 waves. Start there, enable AQE and dynamic allocation, then use the Spark UI (spill, GC time, skew) to adjust. Use spot instances for task nodes with retries."]
]},

"de-3-1-4": {dd:`## Why output layout matters
The way a job writes files decides how fast every later query is and how much the table costs to store and maintain. The two common problems are too many small files and non-atomic overwrites.

## Where small files come from
Each task writes at least one file per partition value it holds. With 800 shuffle partitions and data spread across 30 dates, you can get up to 24,000 files. Streaming jobs add a new set of files every trigger or checkpoint.

## Controlling file count
- **Repartition by the table's partition columns** before writing, so each task holds one or a few partition values.
- **Sort within partitions** by the main filter column so files have narrow min/max ranges.
- Set «maxRecordsPerFile» to cap file size when one partition value holds a lot of data.
- In Iceberg, set the table's «write.distribution-mode» to hash or range so Spark shuffles data appropriately before writing, and set «write.target-file-size-bytes».
- **Compact** regularly for streaming tables.

## Idempotent writes
A rerun of yesterday's job must not double the data. Options:
- **Overwrite the affected partitions**: «INSERT OVERWRITE» with dynamic partition overwrite, or «overwritePartitions()» in the DataFrameWriterV2 API.
- **MERGE** on a business key for upserts.
- Avoid plain append unless the source is guaranteed to be read once.

## Atomic commits
Writing Parquet straight to a path is not atomic: a failed job can leave partial files that readers see, and the old output committer relied on renames that are slow on S3. Table formats such as Iceberg write new files first and commit with one metadata swap, so readers see either the old or the new version, never a mix.`,
iq:[
 ["B","Why are many small files bad for a data lake?","Each file has fixed overhead: an S3 request, footer reads, task scheduling and metadata entries. Thousands of tiny files make planning slow, waste parallelism and raise request costs. Queries can spend more time opening files than reading data."],
 ["I","How do you make a daily Spark load safe to rerun?","Write with dynamic partition overwrite for the processed date, or MERGE on a unique key, so a rerun replaces that day's data instead of appending it again. Drive the date from the scheduler's logical date, not the current time, and commit through a table format for atomicity."],
 ["S","A Spark job writes 40,000 files per day into an Iceberg table. How do you fix it?","Set write.distribution-mode to hash on the partition columns (or repartition by them) so each task writes a few partition values, set a target file size, and sort by a common filter column. Let AQE coalesce shuffle partitions. Schedule rewrite_data_files for any remaining small files, and check that the partition spec is not too fine."]
]},

"de-3-2": {dd:`## MPP architecture
Redshift, like most warehouses, is massively parallel: a **leader node** parses and plans queries, and **compute nodes** divided into **slices** store data and execute in parallel. Performance depends on how evenly data is spread across slices and how much must move between them.

## Distribution styles
- **KEY:** rows with the same distribution key go to the same slice. Joins on that key need no data movement. Pick a high-cardinality key used in big joins; a skewed key overloads one slice.
- **ALL:** a full copy on every node. For small, slowly changing dimensions.
- **EVEN:** round-robin. For tables with no dominant join.
- **AUTO:** Redshift chooses and adjusts.
Look for «DS_BCAST_INNER» or «DS_DIST_BOTH» in EXPLAIN: they mean data is being broadcast or redistributed at query time.

## Sort keys and zone maps
Each 1 MB block stores min and max per column (zone maps). If a table is sorted on created_at, a date filter skips most blocks. Compound sort keys work like a composite index: most effective on the leading column.

## Loading and maintenance
- Load with **COPY** from many files of similar size (a multiple of the number of slices), ideally Parquet or compressed CSV. Avoid single-row inserts.
- Deletes and updates mark rows deleted; **VACUUM** reclaims space and re-sorts, **ANALYZE** refreshes statistics. Automatic versions run in the background.
- **UNLOAD** exports query results to S3 in parallel.

## Workloads and the lake
- **Workload management (WLM)** routes queries to queues with memory and concurrency limits; short query acceleration fast-tracks small queries.
- **Concurrency scaling** adds temporary capacity during spikes.
- **Spectrum** queries data in S3 (including Iceberg tables in recent versions) without loading it.
- **RA3** nodes separate compute from managed storage, so you size compute independently.

## Snowflake and BigQuery in one paragraph
Snowflake separates storage from virtual warehouses (compute clusters you size and suspend), stores data in micro-partitions with automatic pruning metadata, and supports clustering keys for large tables. BigQuery is serverless: you pay per bytes scanned (or reserved slots), and you partition and cluster tables to cut scanned bytes.`,
iq:[
 ["B","What are distribution styles in Redshift?","They control how rows are spread across slices: KEY (by a column, co-locating joins on that key), ALL (copy on every node, for small dimensions), EVEN (round-robin) and AUTO (Redshift decides). Good choices avoid redistributing data during joins."],
 ["I","A Redshift query joining two large tables is slow and EXPLAIN shows DS_DIST_BOTH. What does it mean and how do you fix it?","Both tables are being redistributed across the network for the join because neither is distributed on the join key. Change the distribution key of the large tables to the join column (if it is not skewed), or make the smaller one DISTSTYLE ALL if it is small enough. Then compare the plan again."],
 ["S","How would you load 500 GB per day into Redshift efficiently?","Write Parquet files to S3 in a dated prefix, split into many similarly sized files (a multiple of the slice count), and run one COPY per batch into a staging table. Then merge into the target with a transaction (delete-insert or MERGE), run ANALYZE on changed tables, and rely on auto vacuum or schedule VACUUM for heavy-delete tables. Alternatively keep cold history in the lake and query it via Spectrum."]
]},

"de-4-1": {dd:`## The log
A Kafka **topic** is split into **partitions**. Each partition is an append-only, ordered log stored as segment files on a broker. Every record gets an increasing **offset**. Consumers read sequentially from an offset of their choice, so many independent consumers can read the same data, and replay is just reading from an older offset.

## Keys and ordering
The producer's partitioner sends records with the same key to the same partition (hash of key modulo partition count). Ordering is guaranteed only within a partition. If you need all changes to one order in sequence, key by order_id. Changing the partition count later changes where keys map.

## Replication
Each partition has a **leader** and followers on other brokers (replication factor, typically 3). Followers that are caught up form the **in-sync replica set (ISR)**. With «acks=all» and «min.insync.replicas=2», a write is acknowledged only when at least two replicas have it, so losing one broker loses no acknowledged data. If the ISR falls below the minimum, producers get errors rather than silently losing durability.

## Retention and compaction
- **Delete policy:** keep data for a time («retention.ms») or size, then drop old segments.
- **Compact policy:** keep at least the latest record per key; a record with a null value (a tombstone) deletes the key. Good for changelog topics such as CDC or configuration.

## Throughput
Throughput scales with partitions, because each partition can be consumed by one consumer in a group. Producers gain throughput by batching («linger.ms», «batch.size») and compressing (lz4 or zstd). Kafka is fast because it writes sequentially, relies on the OS page cache and uses zero-copy transfer to consumers.

## Control plane
Modern Kafka uses **KRaft** (its own Raft-based controller quorum) instead of ZooKeeper to store metadata and elect partition leaders.`,
iq:[
 ["B","How does Kafka guarantee ordering?","Only within a partition. Records with the same key go to the same partition, so they are consumed in the order they were written. There is no global order across partitions."],
 ["I","What do acks=all and min.insync.replicas do together?","acks=all makes the producer wait until all in-sync replicas have the record. min.insync.replicas sets how many must be in sync for the write to be accepted. With replication factor 3 and min ISR 2, writes survive the loss of one broker, and if two are down, writes fail rather than becoming unsafe."],
 ["I","What is log compaction and when do you use it?","Kafka keeps at least the latest record for each key and removes older ones in the background; a null-value tombstone removes the key. It suits changelog or state topics, like CDC tables or configuration, where consumers need the latest value per key rather than the full history."],
 ["S","How would you choose the number of partitions for a new topic?","Estimate peak throughput and the per-partition throughput of your slowest consumer: partitions >= peak rate / consumer rate per partition, plus headroom for growth, since adding partitions later remaps keys. Consider the maximum consumer parallelism you want, per-key ordering needs, and broker limits on total partitions. For example, 30 MB/s peak with consumers handling 5 MB/s per partition suggests at least 6, so choose 12 for headroom."]
]},

"de-4-1-2": {dd:`## Consumer groups
Consumers sharing a «group.id» split a topic's partitions between them. Each partition is assigned to exactly one consumer in the group, so the maximum parallelism equals the partition count. Different groups read independently, each with its own offsets.

## Offsets
A consumer **commits** the offset of the next record it will read, stored in the internal «__consumer_offsets» topic. When the consumer restarts or a partition moves, reading resumes from the committed offset.

## Delivery semantics
- **At most once:** commit, then process. A crash after the commit loses records.
- **At least once:** process, then commit. A crash before the commit causes reprocessing. This is the usual choice; make the processing idempotent (upserts by key, dedup by event ID).
- **Exactly once:** within Kafka, use transactions: a consume-process-produce application writes its output records and its consumer offsets in one transaction, and downstream consumers use «isolation.level=read_committed». For external sinks, exactly-once needs the sink to take part, for example a two-phase commit tied to checkpoints, or idempotent writes.

## Rebalancing
When consumers join, leave or miss heartbeats, the group rebalances partitions. With the classic eager protocol, everyone stops during the rebalance. **Cooperative incremental** rebalancing moves only the partitions that need to move. **Static membership** («group.instance.id») avoids rebalances on quick restarts. If processing a batch takes longer than «max.poll.interval.ms», the consumer is considered dead and its partitions are reassigned, causing duplicate processing.

## Lag
Consumer lag is the difference between the latest offset in a partition and the group's committed offset. Rising lag means consumers cannot keep up. Monitor it per partition; one lagging partition often points to a hot key or a stuck consumer.`,
iq:[
 ["B","What is a consumer group?","A set of consumers sharing a group ID that divide a topic's partitions among themselves, each partition read by one member. It lets you scale consumption horizontally. Separate groups read the same topic independently."],
 ["I","Explain at-least-once vs exactly-once delivery.","At-least-once processes then commits offsets, so failures cause replays and possible duplicates; idempotent sinks make it safe. Exactly-once means each record's effect happens once: in Kafka-to-Kafka flows via transactions that atomically write output and offsets, and to external systems via transactional or idempotent sinks coordinated with offsets."],
 ["I","Consumer lag keeps growing on one partition only. What do you check?","A hot key sending most traffic to that partition, a slow or stuck consumer instance (GC pauses, a blocked call), or a poison message causing retries. Check per-partition produce rate, the consumer's processing time and logs. Fixes include better keying, more efficient processing, or a dead-letter path for bad records."],
 ["S","Why do frequent rebalances happen and how do you prevent them?","Consumers exceed max.poll.interval.ms because a batch takes too long, miss heartbeats (session.timeout.ms) due to GC or network issues, or restart often during deploys. Reduce max.poll.records or speed up processing, tune timeouts, use cooperative rebalancing and static membership so restarts don't trigger full rebalances."]
]},

"de-4-2": {dd:`## Why CDC instead of queries
Polling a table with «WHERE updated_at > last_run» misses deletes, misses rows whose updated_at was not set, puts load on the database and only sees the final state between polls. Log-based CDC reads the database's own change log, so it captures every insert, update and delete in commit order, with low overhead and low latency.

## How the Debezium MySQL connector works
1. On first start it takes a **consistent snapshot**: it records the current binlog position or GTID set and reads existing rows, emitting them as read events (op "r"). Incremental snapshots can do this in chunks without long locks, and can be re-triggered per table later.
2. It then **streams the binlog** from the recorded position, acting as a replica with its own server ID.
3. Each row change becomes an event with an **envelope**: before, after, op (c, u, d, r), source metadata (binlog file, position, GTID, table) and timestamps.
4. Events go to one topic per table, keyed by the primary key, so changes to the same row stay in order.
5. Kafka Connect stores the connector's **offsets** (its binlog position) so it resumes after restarts.

## Schema changes
DDL is recorded in a schema history topic so the connector can interpret older binlog events with the correct table structure. Downstream, schema changes flow through the schema registry. Additive changes (new nullable column) are easy; renames and type changes need a plan.

## Deletes and tombstones
A delete produces an event with op "d" and before set, after null, followed by a **tombstone** (null value) so compacted topics can drop the key. Sinks must handle both.

## Operational risks
- **Binlog retention** shorter than connector downtime forces a new snapshot.
- **Large transactions** produce bursts of events.
- **Failover** is safe with GTIDs if the new primary has the needed binlogs.
- **Ordering across tables** is not guaranteed; if you need a consistent multi-table view, use transaction metadata or reconcile downstream.
- Monitor connector status, the lag between source timestamp and processing time, and errors routed to a dead-letter topic.`,
iq:[
 ["B","What is change data capture?","Capturing every insert, update and delete from a database as a stream of events, usually by reading its transaction log (binlog or WAL), so downstream systems can stay in sync in near real time without querying the source tables."],
 ["I","Why is log-based CDC better than polling with an updated_at column?","Polling misses deletes and rows where updated_at isn't maintained, only sees the latest state between polls, adds query load on the source and has higher latency. Log-based CDC captures every change in commit order, including deletes and intermediate states, with minimal load."],
 ["I","What does a Debezium change event contain?","An envelope with before (row image before the change, null for inserts), after (row image after, null for deletes), op (c, u, d, r for snapshot reads), source metadata (connector, database, table, binlog file and position, GTID, transaction info) and ts_ms. The record key is the primary key."],
 ["S","The Debezium connector was down for 3 days and binlog retention is 2 days. What happens and how do you recover?","The connector's saved position no longer exists on the server, so it cannot resume streaming and fails. Recovery: take a new snapshot (incremental snapshot to avoid long locks), and make downstream loads idempotent so re-emitted rows upsert cleanly. Prevent it by sizing retention for your worst outage, alerting on connector downtime, and keeping binlogs on a replica as a backup source."]
]},

"de-4-3-1": {dd:`## Event time vs processing time
**Event time** is when something happened (the payment timestamp). **Processing time** is when your job sees it. They differ because of network delays, mobile clients going offline, retries and backlog after outages. Aggregations that should reflect reality (payments per minute) must use event time, otherwise a 10-minute outage piles all its events into one later minute.

## Watermarks
A watermark is the engine's estimate that no more events older than time T will arrive. A common strategy is "bounded out-of-orderness": watermark = highest event time seen minus a fixed delay, such as 2 minutes. When the watermark passes the end of a window, the window's result is emitted and its state can be cleared.

The delay is a trade-off:
- **Larger delay:** fewer late events dropped, but results are later and more state is kept.
- **Smaller delay:** fresher results, more late events.
In Flink, a source partition that stops receiving data holds the watermark back for the whole job; configure idleness so idle partitions are ignored.

## Window types
- **Tumbling:** fixed, non-overlapping (every 5 minutes).
- **Sliding (hopping):** fixed size, overlapping (10-minute windows every minute).
- **Session:** gaps of inactivity close the window (a user session ends after 30 minutes idle).
- **Global** with custom triggers, for special cases.

## Late data
Events behind the watermark can be:
- **Dropped** (the default).
- Accepted with **allowed lateness**: the window keeps its state a bit longer and emits updated results.
- Sent to a **side output** for separate handling or later batch correction.
Many teams combine a fast streaming result with a daily batch job that recomputes yesterday from complete data.

## Spark Structured Streaming equivalent
«withWatermark("event_time", "2 minutes")» followed by «groupBy(window("event_time", "5 minutes"), ...)». The output mode (append, update, complete) decides when results are emitted.`,
iq:[
 ["B","What is the difference between event time and processing time?","Event time is the timestamp of when the event occurred, carried in the data. Processing time is the clock time when the system processes it. Event-time processing gives correct results even when data arrives late or out of order; processing-time is simpler but distorts results during delays."],
 ["I","What is a watermark?","A marker that tells the stream processor event time has progressed to T, meaning events older than T are not expected. It decides when windows can close and emit results and when state can be dropped. Typically computed as max event time seen minus an allowed delay."],
 ["S","Your Flink job's windows stopped emitting after one Kafka partition went quiet. Why?","The operator's watermark is the minimum across its inputs. An idle partition never advances its watermark, so the combined watermark stays stuck and windows never close. Configure source idleness (withIdleness) so idle partitions are excluded, or make sure all partitions receive data."],
 ["S","How would you handle events arriving hours late in a revenue dashboard?","Use event-time windows with a watermark sized for normal lateness, allowed lateness or a side output for stragglers, and an upsert sink so updated window results overwrite earlier ones. For hours-late data, rely on a daily batch reconciliation that recomputes previous days from the complete table and corrects the dashboard."]
]},

"de-4-3-2": {dd:`## Why state exists
Aggregations, joins, deduplication and pattern detection must remember earlier events: counts per window, the last status per order, IDs already seen. That memory is **state**. In Flink, keyed state is partitioned by key along with the stream, so each parallel task owns the state for its keys.

## State backends
- **Heap (HashMap) backend:** state as Java objects in memory. Fast, limited by heap size.
- **RocksDB backend:** state in an embedded key-value store on local disk, with memory as cache. Handles state much larger than memory, at some CPU and serialization cost. Supports incremental checkpoints.

## Checkpoints
Flink uses a variant of the Chandy-Lamport algorithm:
1. The JobManager injects a **barrier** into each source.
2. Each source records its position (Kafka offsets) and forwards the barrier.
3. When an operator has received the barrier on all inputs, it snapshots its state to durable storage (S3) and forwards the barrier.
4. When every sink has acknowledged, the checkpoint is complete.
On failure, Flink restores all operators from the last completed checkpoint and rewinds sources to the recorded offsets, so state and input stay consistent.
**Aligned** checkpoints wait for barriers on all inputs, which can stall under backpressure. **Unaligned** checkpoints include in-flight data in the snapshot to complete faster.

## Savepoints
A savepoint is a manually triggered, portable checkpoint used for upgrades, code changes, rescaling and migrations. Give operators stable UIDs so state can be mapped to the new job graph.

## Keeping state under control
- Set **state TTL** for per-key state that should expire (for example dedup IDs after 24 hours).
- Avoid unbounded keys, such as keying by a timestamp.
- Watch checkpoint duration and size; growing values signal a state leak or backpressure.`,
iq:[
 ["B","What is a checkpoint in Flink?","A consistent, durable snapshot of all operator state together with source positions, taken periodically. After a failure the job restores from the latest checkpoint and replays from the saved offsets, giving exactly-once state semantics."],
 ["I","Heap or RocksDB state backend: how do you choose?","Heap is fastest but limited by JVM memory and garbage collection; good for small state. RocksDB stores state on local disk with memory caching, supports state far larger than memory and incremental checkpoints, at higher CPU cost. Large keyed state, long windows or big joins usually need RocksDB."],
 ["S","Checkpoints in your Flink job keep timing out. How do you debug?","Check for backpressure first: aligned barriers wait behind slow operators. Look at checkpoint size and duration per operator for state growth, and at sink latency. Fixes include resolving the bottleneck (scale out, fix skew, async I/O for external calls), enabling unaligned checkpoints, incremental RocksDB checkpoints, state TTL, and longer timeouts with minimum pause between checkpoints."]
]},

"de-4-3-3": {dd:`## What exactly-once really means
Exactly-once in streaming means each input record affects the final state and the output **exactly once**, even when tasks fail and replay. Records may physically be processed more than once; what matters is that duplicate effects are never visible.

## Three ingredients
1. **Replayable sources:** Kafka can be read again from saved offsets.
2. **Consistent state snapshots:** checkpoints store state and offsets together.
3. **Transactional or idempotent sinks:** the output commit is tied to the checkpoint, or writing the same thing twice has no extra effect.

## Two-phase commit sinks
Flink's two-phase commit sink works like this:
1. During a checkpoint interval, the sink writes data in a pending form: an open Kafka transaction, or data files not yet committed to Iceberg.
2. On the checkpoint barrier, it **pre-commits**: flushes and records what it wrote in the checkpoint state.
3. When the checkpoint completes, it **commits**: commits the Kafka transaction or makes one Iceberg commit containing the files.
4. If the job fails before the commit, it restores and either commits the recorded pending work (if the checkpoint completed) or discards it.

## The Iceberg sink
Writers produce data and delete files and report them to a single committer. When a checkpoint completes, the committer creates one Iceberg snapshot, storing the checkpoint ID in the snapshot summary so a restarted job can tell whether that checkpoint was already committed. Freshness therefore equals the checkpoint interval.

## Idempotent alternative
If the sink supports upserts by a unique key (a primary-key table, MERGE on payment_id), at-least-once delivery produces the same final state. This is often simpler and is the right choice for databases and key-value stores.

## End to end
Exactly-once inside the pipeline does not fix duplicates already in the source. If the producer retried without idempotence, the duplicates are real data and need deduplication by event ID.`,
iq:[
 ["I","How does Flink achieve exactly-once with Kafka as the sink?","The Kafka sink opens a transaction per checkpoint interval, writes records in it, pre-commits on the barrier, and commits when the checkpoint completes. Consumers using read_committed only see committed data. On failure, uncommitted transactions are aborted and replayed from the checkpoint."],
 ["S","Is exactly-once possible when writing to an external database?","Yes, if the sink is transactional and tied to checkpoints (two-phase commit), or if writes are idempotent (upserts on a unique key), so replays produce the same final state. Plain inserts into a table without keys give at-least-once and duplicates on recovery."]
]}

});
