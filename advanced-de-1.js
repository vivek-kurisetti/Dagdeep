// Advanced Data Engineer topics, part 1. Appended to existing stages so earlier topic IDs stay stable.
// Deep-dive syntax adds: ":::flow Title" blocks (Step :: detail), ":::lanes" with "# Lane" headers,
// ":::note / :::tip / :::warn Title" callouts, "### " subheadings and "|" tables.
(function(){
const R = window.ROADMAPS.de.c;
const add = (stageIdx, path, node) => { let n = R[stageIdx]; for (const i of path) n = n.c[i]; (n.c = n.c || []).push(node); };

/* ---------- de-2-5 Storage engines ---------- */
add(1, [], {t:"Storage engines: B+tree vs LSM tree", hard:true, d:"The two designs behind almost every database.",
k:["B+trees update pages in place; LSM trees append and merge in the background.","LSM trees trade read and space cost for very fast writes.","Bloom filters and compaction strategy decide LSM performance.","RocksDB (Flink state, Kafka Streams, MyRocks) and Cassandra are LSM; InnoDB and Postgres indexes are B+trees."],
w:"Knowing which engine sits under a system tells you how it behaves under heavy writes, deletes and point reads, and how to tune it.",
dd:`## Two ways to organise data on disk
Every storage engine answers one question: when a row changes, where do the new bytes go? A **B+tree** finds the page that holds the key and changes that page. An **LSM tree** (log-structured merge tree) never changes existing files; it writes new data to fresh, sorted files and merges files later in the background. Almost every database you will touch uses one of these two designs.

## B+tree: update in place
:::flow B+tree write path
Find the leaf :: walk root → internal pages → leaf, usually 3-4 page reads
Change the page in memory :: the page becomes dirty in the buffer pool
Write a log record :: WAL / redo makes the change durable at commit
Split if the page is full :: half the keys move to a new page; the parent gets a new pointer
Flush later :: background threads write whole pages (16 KB in InnoDB) back to disk
:::
Reads are predictable: a point lookup costs a few page reads, and a range scan walks linked leaf pages in order. The cost is on writes. Changing a 100-byte row eventually rewrites a whole 16 KB page, and keys that arrive in random order (UUIDv4) touch random pages, causing page splits and fragmentation.

## LSM tree: append, then merge
:::flow LSM write path
Append to the WAL :: sequential write for durability
Insert into the memtable :: an in-memory sorted structure (skip list)
Freeze when full :: the memtable becomes immutable; a new one takes writes
Flush to an SSTable :: an immutable, sorted file lands in level 0
Compact in the background :: files are merge-sorted into larger files at deeper levels
:::
Writes are fast because everything on the write path is sequential: one log append and one in-memory insert. The work moves to **compaction**, which repeatedly rewrites data as it moves down the levels.

## How an LSM read finds a key
:::flow LSM point read
Check the memtable :: newest data first
Check immutable memtables :: waiting to be flushed
Ask each L0 file's Bloom filter :: L0 files can overlap, so several may need checking
Check one file per deeper level :: files in L1+ have non-overlapping key ranges
Return the newest version :: or nothing, if the newest record is a tombstone
:::
Without help, a read might open many files. Two things keep it fast:
- **Bloom filters:** a compact bit array per SSTable that answers "definitely not here" or "maybe here". About 10 bits per key gives roughly a 1% false-positive rate. They never give false negatives.
- **Block cache and indexes:** each SSTable has an index of its blocks, and hot blocks stay in memory.
Range scans are harder for LSM trees, because a range must be merged across every level.

## Compaction strategies
| Strategy | How it works | Good at | Cost |
|---|---|---|---|
| Leveled (RocksDB default) | Each level is ~10x the previous; files in a level don't overlap | Reads, space | High write amplification |
| Size-tiered (Cassandra STCS) | Merge files of similar size together | Write-heavy loads | Space spikes during compaction, slower reads |
| Time-window (Cassandra TWCS) | Group files by time window; drop whole windows on TTL | Time series with expiry | Bad for updates to old data |

## The three amplifications
Every engine trades three costs against each other (the RUM conjecture: read, update, memory):
- **Write amplification:** bytes written to disk per byte of user data. LSM leveled compaction can rewrite data 10-30 times.
- **Read amplification:** files or pages touched per lookup.
- **Space amplification:** disk used versus live data size, due to old versions and tombstones waiting for compaction.
You can lower any one, but only by raising another.

:::note Deletes are writes
In an LSM tree a delete writes a **tombstone**. The old value stays on disk until compaction merges the tombstone with it. Many deletes, or wide range deletes, mean reads must skip piles of tombstones. This is the same idea as Iceberg merge-on-read delete files.
:::

## Where you meet each one
- **B+tree:** InnoDB tables and indexes, Postgres indexes, most relational databases.
- **LSM:** RocksDB (Flink's RocksDB state backend, Kafka Streams state stores, MyRocks), Cassandra, ScyllaDB, HBase, LevelDB.
When a Flink job with RocksDB state slows down, the levers are LSM levers: block cache size, write buffer (memtable) size, compaction threads, and keeping state small with TTL.`,
iq:[
 ["I","Why are LSM trees faster for writes than B+trees?","Writes are a sequential log append plus an in-memory insert into the memtable; files are written sequentially when flushed. B+trees must find and modify the right page, which means random I/O, page splits and rewriting whole pages for small changes. LSM trees pay later, during background compaction."],
 ["I","What is a Bloom filter and why does an LSM tree need it?","A probabilistic structure that answers 'definitely not present' or 'possibly present' using a bit array and several hash functions, with no false negatives. LSM reads may otherwise have to check many SSTables; the filter lets the engine skip files that cannot contain the key, so most point reads touch one file."],
 ["S","Compare leveled and size-tiered compaction.","Leveled keeps non-overlapping files per level with each level about 10x larger, so reads check one file per level and space overhead is low, but data is rewritten many times (high write amplification). Size-tiered merges similar-sized files, which writes less but can temporarily need double the space and leaves overlapping files, so reads touch more files. Choose leveled for read-heavy or space-sensitive workloads, size-tiered for write-heavy ones."],
 ["S","A Flink job using RocksDB state is getting slower as state grows. What do you look at?","Check state size and growth per operator, then RocksDB metrics: block cache hit rate, compaction pending bytes, write stalls, and the number of L0 files. Fix by adding state TTL, reducing key cardinality, giving RocksDB more managed memory, using faster local disks, increasing compaction parallelism, and using incremental checkpoints."]
]});

/* ---------- de-3-1-5 Catalyst and Tungsten ---------- */
add(2, [0], {t:"Catalyst and Tungsten: how Spark compiles a query", hard:true, d:"From a DataFrame to generated JVM code.",
k:["Catalyst turns your query into a logical plan, optimises it with rules, then picks a physical plan.","Cost-based optimisation needs column statistics.","Tungsten stores rows in a compact binary format and generates code that fuses operators.","UDFs are opaque to the optimiser and break pushdown and code generation."],
w:"When you understand the compiler, you can read explain() output, predict which filters get pushed down, and see why some code is ten times faster than equivalent-looking code.",
dd:`## The pipeline
Spark SQL and the DataFrame API share one engine. Whatever you write becomes a tree of operators that Catalyst optimises in four phases.

:::flow From query to execution
Unresolved logical plan :: parsed SQL or DataFrame calls; names not yet checked
Analysis :: the catalog resolves tables, columns and types
Logical optimisation :: rule batches rewrite the plan until nothing changes
Physical planning :: strategies produce physical plans; join algorithms are chosen
Code generation :: Tungsten fuses operators into Java code, compiled by Janino
Execution :: tasks run the generated code over binary rows or columnar batches
:::

## Logical optimisation rules
Rules are simple tree rewrites applied in batches until the plan stops changing. The important ones:
- **Predicate pushdown:** moves filters as close to the data source as possible, into the Parquet or Iceberg scan.
- **Column pruning:** removes columns nobody uses, so the scan reads fewer columns.
- **Constant folding and simplification:** «1 + 2» becomes «3»; «x AND true» becomes «x».
- **Combining operators:** adjacent filters and projections merge into one.
- **Join reordering:** with cost-based optimisation on, picks an order that keeps intermediate results small.

### Cost-based optimisation
CBO («spark.sql.cbo.enabled») uses table and column statistics to estimate row counts and choose join orders and strategies. Statistics come from «ANALYZE TABLE t COMPUTE STATISTICS FOR COLUMNS a, b». Without them, Spark guesses from file sizes. At runtime, AQE corrects many bad guesses using real shuffle statistics.

## Physical planning
For each logical join, aggregate or scan, planning strategies produce candidates: broadcast hash join, sort-merge join, hash aggregate or sort aggregate, and so on. Size estimates and hints decide the winner.

## Tungsten: memory and code
:::lanes What Tungsten changes
# Data layout
Rows stored as UnsafeRow :: compact binary, no Java objects per field
Explicit memory management :: fewer objects means far less garbage collection
Cache-friendly sort :: sorts pointers with key prefixes
# Execution
Whole-stage codegen :: a chain of operators becomes one Java method
No virtual calls per row :: a tight loop the JIT can optimise
Vectorised Parquet reads :: whole column batches instead of row by row
:::
Before code generation, each operator called the next through an iterator for every row (the Volcano model), with virtual function calls everywhere. Whole-stage code generation collapses a pipeline like scan, filter, project and partial aggregate into one loop. In explain output, operators prefixed with «*(n)» run inside generated stage «n».

## Reading explain output
~~~
df = (spark.table("lake.pay.payments")
        .filter("created_at >= '2026-11-01' AND status = 'SUCCESS'")
        .groupBy("merchant_id").agg(F.sum("amount")))
df.explain("formatted")

(1) BatchScan lake.pay.payments
    PushedFilters: [created_at >= 2026-11-01, status = SUCCESS]
    Output: [merchant_id, amount, status, created_at]
(2) Filter        -- re-checks rows; the scan only skipped whole files
(3) Project       -- keeps merchant_id, amount
(4) HashAggregate (partial)       *(1)
(5) Exchange hashpartitioning(merchant_id, 200)
(6) HashAggregate (final)         *(2)
~~~
What to check:
- **PushedFilters** and **PartitionFilters** on the scan: your filters reached the source.
- **Output columns** of the scan: only needed columns are read.
- **Exchange** nodes: each one is a shuffle.
- The join node name: BroadcastHashJoin or SortMergeJoin.

:::warn Why UDFs hurt
A Python or Scala UDF is a black box. Catalyst cannot push a filter through it, cannot prune columns it might read, and the UDF breaks the generated code loop. Python UDFs also serialise every row to a Python worker. A filter written as a UDF on top of a scan means the whole table is read. Use built-in functions, or pandas UDFs when Python is unavoidable.
:::

## Practical habits
- Filter and select early; Catalyst does it anyway, but readable code helps reviewers.
- Avoid casting columns in filters, such as «date_format(created_at, ...) = ...», because pushdown fails; compare the raw column to a literal of the same type.
- Collect column statistics on large dimension tables used in joins.
- When something is slow, read «explain("formatted")» before changing settings.`,
iq:[
 ["I","What is predicate pushdown in Spark and how do you verify it happened?","Catalyst moves filter conditions into the data source scan so files, row groups or partitions that cannot match are skipped. Verify with explain(): the scan node lists PushedFilters and PartitionFilters. If your filter is missing there, look for casts, UDFs or functions wrapping the column."],
 ["I","What is whole-stage code generation?","Tungsten fuses a chain of operators within a stage into a single generated Java function with a tight loop, instead of calling each operator per row through iterators. It removes virtual calls and object creation, so CPU efficiency improves a lot. Operators marked *(n) in explain output run inside generated stage n."],
 ["S","Why can a UDF make a query read the whole table?","Catalyst cannot see inside a UDF, so it cannot push a UDF-based filter into the scan or prune columns the UDF uses. The scan reads everything, then the UDF filters row by row, often after serialising rows to Python. Rewriting the condition with built-in expressions restores pushdown."],
 ["S","How does cost-based optimisation differ from AQE?","CBO plans before execution using stored table and column statistics to estimate cardinalities and pick join orders and strategies; it is only as good as the statistics. AQE re-plans during execution using actual shuffle statistics at stage boundaries: coalescing partitions, switching to broadcast joins and splitting skew. They complement each other."]
]});

/* ---------- de-3-1-6 Shuffle internals ---------- */
add(2, [0], {t:"Shuffle internals", hard:true, d:"What really happens between two stages.",
k:["Map tasks write one sorted data file plus an index file each.","Reduce tasks fetch a block from every map task: M x R blocks in total.","The external shuffle service keeps shuffle files available when executors go away.","Push-based and remote shuffle services fix the small random reads of huge shuffles."],
w:"Most expensive Spark incidents, such as fetch failures, disk full, long stages and lost executors, are shuffle problems. Knowing the mechanics turns them into routine fixes.",
dd:`## Why shuffles exist
A wide operation (groupBy, join, distinct, repartition) needs all rows with the same key in the same task. The data starts spread across every input partition, so it must be redistributed across the cluster. That redistribution is the shuffle, and it is the boundary between two stages.

## The map side
:::flow Map side of a shuffle (sort-based shuffle)
Compute the target partition :: hash(key) % numPartitions for each record
Buffer in memory :: records are grouped by target partition (and key, if needed)
Spill when memory is full :: sorted runs are written to local disk
Merge the spills :: one data file per map task, ordered by target partition
Write an index file :: byte offsets where each reducer's block starts
:::
Since Spark 1.2 the default is sort-based shuffle, so each map task produces one data file and one index file instead of one file per reducer. When there are few partitions (under «spark.shuffle.sort.bypassMergeThreshold», 200) and no map-side aggregation, Spark uses a bypass path that writes per-partition files and concatenates them.

## The reduce side
:::flow Reduce side of a shuffle
Ask the driver for map output locations :: MapOutputTracker knows where each block lives
Fetch blocks from every map output :: in parallel, up to spark.reducer.maxSizeInFlight (48 MB)
Deserialise and decompress :: blocks are compressed by default
Aggregate, sort or join :: with spills to disk if the data does not fit
Produce the stage's output :: or the next shuffle's map side
:::

## The M x R problem
Every reducer fetches one block from every map task. With 10,000 map tasks and 10,000 reduce partitions, that is 100 million blocks, each tiny. Disks see huge numbers of small random reads, and the network sees huge numbers of small requests. Symptoms: slow stages with low CPU, and fetch timeouts. Fixes:
- Fewer, larger partitions on both sides (AQE coalescing helps the reduce side).
- Larger input splits so there are fewer map tasks.
- **Push-based shuffle** (Spark 3.2+, YARN): map tasks push blocks to remote shuffle services, which merge blocks per reducer, so reducers read a few large files.
- **Remote shuffle services** (Apache Celeborn, Apache Uniffle): shuffle data lives on dedicated servers instead of executor disks, which also suits Kubernetes and spot instances.

## Where shuffle files live and why it matters
Shuffle files are written to the executor's local disk. If the executor dies, its shuffle output is lost and the map stage must be partially recomputed. The **external shuffle service** runs on each node, outside the executor, and serves shuffle files even after the executor has been removed. Dynamic allocation needs it (or shuffle tracking) so idle executors can be released safely.

:::warn FetchFailedException
A reducer could not fetch a block, usually because the node or executor holding it died (often a spot instance reclaimed), ran out of disk, or was too busy with GC to answer. Spark marks the map output lost, re-runs the parent stage for the missing blocks, then retries. Repeated fetch failures point to unstable nodes, full local disks, or oversized partitions.
:::

## Settings that matter
| Setting | Default | Why you touch it |
|---|---|---|
| spark.sql.shuffle.partitions | 200 | Too low for big jobs; set high and let AQE coalesce |
| spark.sql.adaptive.advisoryPartitionSizeInBytes | 64 MB | Target size AQE coalesces toward |
| spark.reducer.maxSizeInFlight | 48 MB | More parallel fetching per reducer |
| spark.shuffle.file.buffer | 32 KB | Larger buffers mean fewer disk writes |
| spark.shuffle.compress | true | Keep on; ZSTD or LZ4 codec |

## Practical checklist
- Reduce shuffled bytes first: filter early, project only needed columns, pre-aggregate, broadcast small sides.
- Size partitions at about 100-200 MB after the shuffle.
- Give executors fast local disks (NVMe on EMR) for shuffle and spill.
- On spot-heavy clusters, use decommissioning with shuffle migration or a remote shuffle service.`,
iq:[
 ["I","What files does a map task produce in Spark's sort-based shuffle?","One data file containing all of its output records ordered by target reduce partition, and one index file with the byte offset where each partition's block begins. Reducers use the index to fetch only their block."],
 ["I","What is the external shuffle service and why is it needed?","A long-running process on each node that serves shuffle files independently of executors. If an executor is removed (dynamic allocation) or crashes, its shuffle output is still available, so downstream stages do not need to recompute the map stage."],
 ["S","A large job fails with repeated FetchFailedException. How do you investigate and fix it?","Identify which executors or hosts the failed fetches pointed to: lost spot nodes, full local disks, long GC pauses, or network timeouts. Fixes: stabilise nodes (on-demand for core nodes, graceful decommissioning), increase local disk, reduce partition sizes so blocks are smaller, raise network timeouts and retries, enable the external shuffle service, or adopt push-based or remote shuffle."],
 ["S","Explain the M x R problem and how push-based shuffle addresses it.","Each of R reducers fetches a block from each of M map tasks, so the number of blocks grows as M times R, producing millions of tiny random reads. Push-based shuffle has map tasks push blocks to shuffle services that merge them per reduce partition, so each reducer reads a few large merged files sequentially."]
]});

/* ---------- de-4-4 Kafka internals ---------- */
add(3, [], {t:"Kafka internals", hard:true, d:"Segments, ISR, high watermark, idempotence and transactions.",
k:["Each partition is a directory of segment files with sparse offset and time indexes.","The high watermark is the last offset copied to all in-sync replicas; consumers only read up to it.","Leader epochs let replicas truncate divergent data after a failover.","Transactions use a coordinator, control markers and the last stable offset."],
w:"Durability, ordering and exactly-once in Kafka all come from a few internal mechanisms. Interviewers for streaming roles expect you to explain them.",
dd:`## A partition on disk
A partition is a directory on a broker containing **segments**. Each segment has:
- a «.log» file with the record batches,
- an «.index» file mapping offsets to byte positions (sparse, one entry every few KB),
- a «.timeindex» file mapping timestamps to offsets.
Only the newest (active) segment receives writes. A segment rolls when it reaches «segment.bytes» (1 GB by default) or «segment.ms». Retention deletes whole old segments, which is why deleting old data is cheap. To find offset N, Kafka binary-searches the segment file names (each named by its base offset), then the sparse index, then scans a little of the log.

## Replication: LEO, ISR and the high watermark
:::flow Produce with acks=all
Producer sends a batch to the leader :: the partition leader is on one broker
Leader appends to its log :: its log end offset (LEO) advances
Followers fetch from the leader :: like consumers, they request from their own LEO
Leader learns follower positions :: from the offsets in their fetch requests
High watermark advances :: to the lowest LEO among in-sync replicas
Leader acknowledges the producer :: once all ISR members have the batch
:::
- **LEO (log end offset):** the next offset a replica will write.
- **ISR (in-sync replicas):** replicas that have caught up within «replica.lag.time.max.ms».
- **High watermark (HW):** the offset up to which every ISR member has the data. Consumers can only read below the HW, so they never see data that could vanish in a failover.

## Leader failover
:::flow When a leader broker dies
Controller detects the failure :: KRaft controller quorum tracks broker heartbeats
New leader chosen from the ISR :: only fully caught-up replicas are eligible
Leader epoch increments :: a counter recording each leadership change
Followers truncate to the epoch boundary :: divergent, never-committed data is removed
Producers and consumers refresh metadata :: and continue with the new leader
:::
With «unclean.leader.election.enable=false» (the default), Kafka refuses to elect an out-of-sync replica, choosing unavailability over data loss. **Leader epochs** replaced the older truncate-to-high-watermark logic, which could lose or diverge data in some double-failure cases.

## Idempotent producer
Each producer gets a **producer ID** and attaches a **sequence number** per partition to every batch. If a retry delivers the same batch twice, the broker sees a duplicate sequence and discards it; a gap in sequence numbers is an error. This gives exactly-once writes per partition per producer session, and it is on by default in modern clients.

## Transactions
:::flow A transactional consume-process-produce loop
initTransactions :: the coordinator registers the transactional.id and fences older instances
beginTransaction :: local state only
Produce output records :: partitions are added to the transaction on the coordinator
sendOffsetsToTransaction :: consumer offsets become part of the same transaction
commitTransaction :: coordinator writes PREPARE_COMMIT to its transaction log
Commit markers written :: control records land in every involved partition
:::
Consumers with «isolation.level=read_committed» read only up to the **last stable offset (LSO)**: the first offset belonging to a still-open transaction. Records from aborted transactions are filtered out using the abort markers. **Fencing** by transactional.id and epoch stops a zombie instance (an old copy of the app that came back after a pause) from committing.

## Why Kafka is fast
- Sequential appends to segment files.
- Reads served from the OS page cache, not a JVM cache.
- Zero-copy «sendfile» from page cache to socket for consumers.
- Batching and compression of whole record batches end to end; brokers do not decompress them (unless converting formats).

## Compaction internals
For compacted topics, log cleaner threads rewrite older segments keeping only the latest record per key. «min.cleanable.dirty.ratio» controls when cleaning starts; tombstones are kept for «delete.retention.ms» so slow consumers still see deletes. The active segment is never compacted.

:::tip Debugging checklist
Under-replicated partitions mean followers cannot keep up or a broker is down. Producer errors like NotEnoughReplicas mean the ISR fell below min.insync.replicas. Consumers stuck at an offset in read_committed mode often mean a long-running or hung transaction holding back the LSO.
:::`,
iq:[
 ["I","What is the high watermark in Kafka?","The highest offset that has been replicated to all in-sync replicas. Consumers can only read records below it, guaranteeing they never read data that could be lost if the leader fails before followers copy it."],
 ["I","How does the idempotent producer prevent duplicates?","The broker assigns a producer ID, and the producer numbers batches per partition. When a retry resends a batch the broker has already written, the broker recognises the sequence number and discards the duplicate while still acknowledging success."],
 ["S","What are leader epochs and what problem do they solve?","A leader epoch is a number that increments with every leadership change and is stored with records. After a failover, followers use the epoch boundaries to find exactly where their log diverged from the new leader and truncate there. This fixed data loss and divergence cases that the old high-watermark-based truncation allowed."],
 ["S","Explain the last stable offset and how read_committed consumers use it.","The LSO is the offset of the first record in a transaction that is still open. read_committed consumers only read up to the LSO, so they never see records from transactions that might still abort, and they skip records from aborted transactions using the abort markers. A hung transaction blocks the LSO and stalls these consumers."]
]});

/* ---------- de-4-3-4 Backpressure ---------- */
add(3, [2], {t:"Backpressure and Flink's network stack", hard:true, d:"How a slow operator slows the whole job, and how to find it.",
k:["Flink moves data in network buffers with credit-based flow control.","When a downstream task is slow, upstream tasks block, all the way back to the source.","The bottleneck is the first busy task that is not itself backpressured.","Async I/O, fixing skew and buffer debloating are the main fixes."],
w:"Backpressure is how streaming jobs fail slowly: lag climbs, checkpoints time out, and nothing crashes. Finding the real bottleneck is a core streaming skill.",
dd:`## How data moves between tasks
Operators in the same task are chained and call each other directly. Between tasks (different slots, often different machines), records are serialised into **network buffers** (32 KB memory segments by default) and sent over Netty connections.

:::flow One record crossing the network
Operator emits a record :: serialised into the current output buffer
Buffer is full or a timeout fires :: execution.buffer-timeout, 100 ms by default
Sender checks credit :: may only send if the receiver has free buffers
Netty transfers the buffer :: over a TCP connection shared by many channels
Receiver deserialises :: the downstream operator processes the records
Buffer is recycled :: and the receiver announces new credit upstream
:::

## Credit-based flow control
Each receiving channel has a few exclusive buffers plus a shared floating pool. The receiver tells the sender how many buffers it has free: its **credit**. The sender only sends as many buffers as it has credit for. This stops one slow channel from blocking a whole TCP connection that other healthy channels share.

## How backpressure spreads
:::flow Backpressure from a slow sink
Sink slows down :: for example a database under load
Sink's input buffers fill :: it announces zero credit
Upstream task cannot send :: its output buffers fill
Upstream operator blocks :: waiting for a free buffer to write into
Pressure reaches the source :: the Kafka source reads more slowly
Consumer lag grows :: the visible symptom
:::
Nothing is dropped; the job simply runs at the speed of its slowest task.

## Finding the bottleneck
In the Flink web UI each task shows **backpressured** (blocked waiting to send), **busy** (processing) and **idle** time per second.
- Backpressured tasks are victims, not causes.
- Walk downstream from the source. The **first task that is busy and not backpressured** is the bottleneck.
- Compare subtasks of that operator: if one subtask is busy and the others idle, the cause is **skew**.

| What you see | Likely cause | Fix |
|---|---|---|
| One operator busy, all subtasks | Expensive logic or too little parallelism | Optimise code, raise parallelism |
| One subtask busy, others idle | Key skew | Better keys, pre-aggregation, local-global aggregation |
| Sink busy | Slow external system | Batch writes, more sink parallelism, async writes |
| Operator waiting on external calls | Synchronous lookups | Async I/O with a capacity limit |
| High GC or RocksDB time | State or memory pressure | Tune memory, state TTL, faster disks |

## Backpressure and checkpoints
Checkpoint barriers travel in-band with records. Under backpressure, barriers wait in full buffers behind data, so aligned checkpoints take longer and may time out. Two features help:
- **Buffer debloating** (Flink 1.14+): automatically shrinks the amount of in-flight data to about one second of throughput, so barriers move faster.
- **Unaligned checkpoints**: barriers overtake in-flight data, and that data is stored as part of the checkpoint.

:::tip Async I/O
Calling a database or REST API synchronously inside a map means each task waits for one response at a time. «AsyncDataStream.unorderedWait» keeps many requests in flight per task (bounded by a capacity) and is often a 10-50x throughput improvement for enrichment jobs.
:::`,
iq:[
 ["I","What is backpressure in a streaming system?","When a downstream operator cannot keep up, it stops accepting data, and that pressure propagates upstream until the source reads more slowly. No data is lost; the whole pipeline slows to the speed of the bottleneck, and source lag grows."],
 ["S","How do you find the bottleneck in a backpressured Flink job?","In the web UI, follow the job graph from the source and find the first operator whose tasks are busy but not backpressured; operators before it are backpressured victims. Then compare its subtasks: uniform load means expensive logic or too little parallelism, one hot subtask means skew. Check GC, state backend metrics and external call latency for that operator."],
 ["S","Why do checkpoints time out under backpressure, and what helps?","Barriers flow in-band, so they queue behind data in full network buffers and alignment waits for barriers from all inputs. Fix the bottleneck first; then enable buffer debloating to reduce in-flight data, or unaligned checkpoints so barriers can overtake buffered records."]
]});

})();
