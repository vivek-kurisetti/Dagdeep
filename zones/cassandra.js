QUEST.zone("cassandra", {
mission:["ravi","The fraud team stores every card swipe in Cassandra: millions of writes a second across three data centres. Learn how it spreads and stores data, then survive a node failure at peak."],
levels:[
{t:"The ring", sub:"Partitions, tokens, replicas", rounds:[
 ["learn","Partition key → token → nodes","The **partition key** is hashed (Murmur3) to a **token**. Each node owns token ranges (with **vnodes**, many small ranges). The replication strategy places **RF** copies on the next nodes in the ring.",["Hash partition key → token","Find owning node","Replicate to RF nodes","Any node can coordinate"]],
 ["learn","Masterless","Every node is equal. The client sends a request to any node, which becomes the **coordinator** for it. **Gossip** shares cluster state; there's no single point of failure."],
 ["pick","Which strategy for a cluster across two data centres?",["SimpleStrategy","NetworkTopologyStrategy","LocalStrategy","EverywhereStrategy"],1,"NetworkTopologyStrategy sets RF per DC and spreads replicas across racks."],
 ["fill","Create a keyspace for two DCs",'CREATE KEYSPACE fraud WITH replication = {\n  \'class\': \'___\', \'dc_mumbai\': ___, \'dc_hyd\': 3 };',["NetworkTopologyStrategy","3"],["SimpleStrategy","1"],"RF 3 per DC is the common production choice."],
 ["tf","Ring facts",[["Cassandra has a primary node per table.",false,"It's masterless."],["Adding a node moves some token ranges to it.",true,"Then run cleanup on the old owners."],["Clients should use a token-aware driver.",true,"Requests go straight to a replica."]]]
]},
{t:"Data modeling", sub:"Query-first tables", rounds:[
 ["learn","Model the queries, not the entities","No joins, no arbitrary WHERE. Design **one table per query**: the partition key is what you look up by, **clustering columns** order rows inside the partition. Duplicating data across tables is normal."],
 ["fill","Swipes per card, newest first",'CREATE TABLE swipes_by_card (\n  card_id text, swipe_ts timestamp, merchant text, amount decimal,\n  PRIMARY KEY ((___), ___)\n) WITH CLUSTERING ORDER BY (swipe_ts ___);',["card_id","swipe_ts","DESC"],["merchant","ASC","amount"],"Partition by card, cluster by time descending."],
 ["learn","Keep partitions bounded","A partition lives on one replica set. Unbounded partitions (all swipes of a merchant forever) grow huge and slow. Add a **time bucket** to the partition key, e.g. «((merchant_id, day), swipe_ts)». Keep partitions well under ~100 MB."],
 ["pick","Query: «SELECT * FROM swipes WHERE merchant = 'X'» on a table partitioned by card_id. What happens?",["Fast lookup","Error unless ALLOW FILTERING, then a full cluster scan","Uses a join","Uses the clustering order"],1,"Create a table partitioned by merchant (with a time bucket) instead."],
 ["sort","Good or bad partition key?",{"Good":["(card_id)","(merchant_id, day)","(device_id, hour)"],"Bad":["(country) for global swipes","(status)","(merchant_id) forever, no bucket"]},"High cardinality and bounded size."]
]},
{t:"Consistency", sub:"Tunable reads and writes", rounds:[
 ["learn","Tunable consistency","Each request picks a level: «ONE», «QUORUM» (majority of RF), «LOCAL_QUORUM» (majority in the local DC), «ALL»… If **R + W > RF**, every read overlaps the latest write: strong consistency."],
 ["pick","RF = 3. Which pair gives strong consistency?",["W=ONE, R=ONE","W=QUORUM, R=QUORUM","W=ONE, R=QUORUM","W=ANY, R=ONE"],1,"2 + 2 > 3."],
 ["match","Level → meaning (RF 3 per DC)",[["ONE","One replica answers: fastest, weakest"],["LOCAL_QUORUM","2 of 3 in the local DC"],["EACH_QUORUM","Quorum in every DC (writes)"],["ALL","Every replica: one node down = failure"]],"LOCAL_QUORUM is the multi-DC default."],
 ["learn","Repairing divergence","**Hinted handoff**: the coordinator stores writes for a down replica and replays them. **Read repair**: mismatched replicas fixed during reads. **Anti-entropy repair** («nodetool repair», or incremental repair) must run regularly, within gc_grace_seconds."],
 ["tf","Consistency facts",[["CL=ALL survives one replica being down.",false,"ALL needs every replica."],["Lightweight transactions (IF NOT EXISTS) use Paxos.",true,"Much slower; use sparingly."],["Last-write-wins uses write timestamps.",true,"Clock skew can lose updates."]]]
]},
{t:"Storage engine", sub:"Writes, compaction, tombstones", rounds:[
 ["learn","The write path","A write appends to the **commit log** (durability) and updates the in-memory **memtable**. Full memtables flush to immutable **SSTables**. No read-before-write: writes are fast.",["Commit log append","Memtable update","Flush to SSTable","Compaction merges SSTables"]],
 ["order","Write path in order",["Append to commit log","Write to memtable","Acknowledge to coordinator","Flush memtable to an SSTable later"],"Durable first, fast second."],
 ["match","Compaction strategy",[["STCS (size-tiered)","Write-heavy, general default"],["LCS (leveled)","Read-heavy, many updates; more I/O"],["TWCS (time-window)","Time-series data with TTL"],["UCS (unified, 5.0)","Tunable strategy replacing the others"]],"TWCS drops whole expired SSTables cheaply."],
 ["learn","Tombstones","A delete writes a **tombstone**. It's kept for «gc_grace_seconds» (default 10 days) so repair can spread it; only then compaction purges it. Many tombstones make reads slow and can hit the failure threshold."],
 ["pick","Queue-like table (insert, read, delete) gets slow reads and TombstoneOverwhelming errors. Why?",["Reads scan thousands of tombstones","Too many replicas","LCS","Commit log full"],0,"Cassandra is a poor queue. Use TTL + TWCS or a real queue."],
 ["tf","Engine facts",[["Updates modify rows in place on disk.",false,"They write new cells; compaction merges."],["If repair doesn't run within gc_grace_seconds, deleted data can come back.",true,"Zombie data."],["TTL data with TWCS can be dropped as whole SSTables.",true,"Very efficient for time series."]]]
]},
{t:"Boss: Peak-hour outage", boss:true, time:30, rounds:[
 ["pick","One node dies; writes at CL=ALL fail. Fix?",["Use LOCAL_QUORUM","Raise RF to 1","Use SimpleStrategy","Disable gossip"],0,"Quorum tolerates one replica down."],
 ["pick","One merchant's partition is 4 GB and its queries time out. Fix?",["Add a time bucket to the partition key","More replicas","ALLOW FILTERING","CL=ONE"],0,"Bound partition size."],
 ["pick","Deleted rows reappeared after a node returned. Cause?",["Repair didn't run within gc_grace_seconds","TWCS","Token-aware driver","LOCAL_QUORUM"],0,"Zombie data."],
 ["pick","Analysts want swipes by merchant; table is by card. Fix?",["New table partitioned by (merchant, day)","ALLOW FILTERING","Secondary index on everything","JOIN"],0,"One table per query."],
 ["pick","Reads read stale data with W=ONE, R=ONE, RF=3. Need strong reads?",["Use QUORUM for both","CL=ANY","More nodes","STCS"],0,"R + W > RF."],
 ["pick","Time-series with 30-day TTL fills disks. Best compaction?",["TWCS","LCS","STCS","None"],0,"Drop expired windows whole."]
]}
]});

QUEST.more("cassandra", [
{act:"Expert", t:"The read path", sub:"Bloom filters, indexes, caches", rounds:[
 ["learn","How a read finds data","A read checks the **memtable**, then every **SSTable** that might contain the partition. Per SSTable: **bloom filter** → partition key cache → partition **summary/index** (or trie index in 5.0) → **compression offsets** → read the chunk. Results from all sources are **merged by timestamp**.",["Memtable","Bloom filter per SSTable","Partition index lookup","Compression offset map → disk chunk","Merge cells by timestamp, apply tombstones"],null,`### Why SSTable count matters
Each SSTable that might hold the partition costs a lookup. Bloom filters («bloom_filter_fp_chance», 0.01 by default for STCS, 0.1 for LCS) avoid most negative lookups, but a partition spread across 20 SSTables means 20 reads and a merge. Compaction strategy decides how spread out partitions get: **LCS** guarantees most reads touch ~1 SSTable per level.

### Chunked compression
SSTables are compressed in chunks («chunk_length_in_kb», 16 KB default in 4.x). Reading one small row decompresses a whole chunk; for small random reads, smaller chunks reduce read amplification.

### Caches
- **Key cache**: partition key → index position (on by default).
- **Row cache**: whole partitions in memory; rarely worth it except for small, very hot, read-mostly tables.
- **Chunk cache** for decompressed chunks (off-heap).

### Coordinator side
At CL=QUORUM the coordinator sends a full read to the fastest replica and **digest** requests to others; if digests mismatch, it does a full read from all and a **blocking read repair** before answering. **Speculative retry** («speculative_retry = '99p'») sends an extra request when a replica is slower than the 99th percentile.`],
 ["order","Cassandra local read path",["Check the memtable","Bloom filter rules out most SSTables","Look up the partition in the index","Use compression offsets to find the chunk","Merge results by timestamp"],"Fewer SSTables per read = faster reads."],
 ["pick","p99 reads spike; nodetool tablehistograms shows reads touching 18 SSTables per partition (STCS). Fix?",["Switch to LCS for this read-heavy table","Add row cache","Raise RF","CL=ONE"],0,"LCS bounds SSTables per read."],
 ["match","Mechanism",[["Bloom filter","Skips SSTables that can't contain the key"],["Digest read","Checks replicas agree without full data"],["Speculative retry","Extra request when a replica is slow"],["Key cache","Skips the partition index lookup"]],"Every layer saves I/O or tail latency."],
 ["tf","Read truths",[["Row cache is a good default for every table.",false,"Only for small, hot, read-mostly data."],["QUORUM reads may trigger read repair.",true,"On digest mismatch."],["Smaller compression chunks can help small random reads.",true,"Less decompression per read."]]]
]},
{act:"Expert", t:"Compaction deep", sub:"STCS, LCS, TWCS, UCS maths", rounds:[
 ["learn","Amplification trade-offs","Compaction trades **write amplification** (rewriting data), **read amplification** (SSTables per read) and **space amplification** (temporary extra disk).",null,null,`| Strategy | Read amp | Write amp | Space overhead | Best for |
|---|---|---|---|---|
| STCS | High (many similar-sized SSTables) | Low | Up to ~50% free space needed for big compactions | Write-heavy, insert-mostly |
| LCS | Low (~1 SSTable per level) | High (~10× per level) | ~10% | Read-heavy, updates/deletes |
| TWCS | Low for time-bucketed reads | Low | Low | Time series with TTL, append-only |
| UCS (5.0) | Tunable | Tunable | Tunable | Configurable between tiered and leveled behaviour |

### STCS
Groups SSTables of similar size (4 by default, «min_threshold») and merges them. Over time you get a few huge SSTables; a major compaction of them needs as much free disk as their size.

### LCS
SSTables of fixed size («sstable_size_in_mb», 160 MB) in levels; each level is 10× the previous. Data moves level to level, rewritten each time: heavy I/O, but reads are predictable.

### TWCS
Groups data by time window («compaction_window_unit/size»), STCS within the current window, then never compacts closed windows again. With TTL, whole SSTables expire and are **dropped** without compaction. Don't update or delete old data in TWCS tables, and avoid mixing TTLs.`],
 ["num","With STCS, a node has two 400 GB SSTables about to be compacted together. Free disk needed for the merge (GB, worst case)?",800,0,"GB","The output can be as large as the inputs combined until they're deleted: plan up to 800 GB free."],
 ["sort","Pick the strategy",{"STCS":["Insert-heavy event ingestion, rarely read"],"LCS":["User profiles read constantly, updated often"],"TWCS":["Sensor readings with 30-day TTL, read by recent window"]},"Workload shape decides."],
 ["pick","A TWCS table also receives updates to week-old rows. Effect?",["Nothing","Old windows' data mixes into new SSTables; expired SSTables can't be dropped cleanly","Faster reads","Lower disk use"],1,"TWCS assumes append-only, time-ordered data."],
 ["tf","Compaction truths",[["LCS has higher write amplification than STCS.",true,"Data is rewritten through levels."],["TWCS compacts closed windows repeatedly.",false,"Closed windows are left alone."]]]
]},
{act:"Expert", t:"Repair, tombstones & consistency deep", sub:"Merkle trees, gc_grace, LWT", rounds:[
 ["learn","Anti-entropy repair","«nodetool repair» builds **Merkle trees** over token ranges on each replica, compares them, and streams only differing ranges. **Incremental repair** marks repaired SSTables so later repairs only compare new data.",null,null,`### Repair cadence and gc_grace_seconds
A tombstone must reach every replica before it's purged. If a replica missed a delete and repair doesn't run within «gc_grace_seconds» (10 days default), the other replicas purge the tombstone; the stale replica still has the old value and **resurrects** it on the next repair or read repair ("zombie data"). Rule: **complete a full repair cycle more often than gc_grace_seconds**. Tools like Cassandra Reaper schedule subrange repairs.

### Tombstone thresholds
«tombstone_warn_threshold» (1,000) and «tombstone_failure_threshold» (100,000) per query. Range deletes and partition deletes create single tombstones covering many rows; row-by-row deletes in a queue pattern create thousands.

### Lightweight transactions
«INSERT … IF NOT EXISTS», «UPDATE … IF balance = 100» use **Paxos**: prepare/promise, read, propose/accept, commit — about **4 round trips** instead of 1. Use «SERIAL»/«LOCAL_SERIAL» consistency for the Paxos phase. Great for uniqueness (claiming a username), terrible for high-throughput counters. Cassandra 5.x introduces Paxos v2 improvements; full ACID transactions (Accord) arrive in a later major version.

### Counters
Counter columns can't be mixed with normal columns, aren't idempotent (a retried increment may double count), and can't have TTL.`],
 ["order","How deleted data comes back",["Replica C is down when a DELETE writes tombstones to A and B","No repair runs for 12 days","gc_grace_seconds (10 days) passes; A and B purge the tombstone in compaction","C comes back with the old value","Read repair copies C's old value to A and B: zombie row"],"Repair within gc_grace_seconds prevents it."],
 ["pick","Why are counter updates risky for payments totals?",["Retried increments aren't idempotent and can double count","Counters are too slow to read","Counters need LCS","Counters can't be replicated"],0,"Use event logs + aggregation for money."],
 ["match","Tool",[["Merkle tree","Compares replica data by hash ranges"],["Incremental repair","Repairs only unrepaired SSTables"],["LOCAL_SERIAL","Paxos consistency within the local DC"],["Reaper","Schedules repairs in subranges"]],"Consistency needs maintenance."],
 ["num","An LWT needs about 4 round trips vs 1 for a normal write. A plain write takes 3 ms at QUORUM. Estimated LWT latency?",12,2,"ms","≈ 4 × 3 ms = 12 ms, plus contention retries under load."],
 ["tf","Consistency truths",[["Repair must complete within gc_grace_seconds to prevent zombies.",true,"Tombstones must reach every replica first."],["LWTs are fine for high-throughput counters.",false,"Paxos rounds limit throughput."]]]
]},
{act:"Expert", t:"Modeling & ops at scale", sub:"Partition sizing, SAI, JVM", rounds:[
 ["learn","Size partitions with maths","Estimate partition size before production: rows per partition × bytes per row (values + clustering columns + overhead). Keep partitions comfortably under ~100 MB and rows per partition in the low hundreds of thousands.",null,null,`### Worked example
Partition by «(merchant_id, day)», 1 row per swipe, ~200 bytes per row including overhead. A big merchant does 500,000 swipes/day → 100 MB/day partition: borderline. Bucket by hour («(merchant_id, day, hour)») → ~4 MB partitions, and queries for a day fan out to 24 partitions (run them in parallel).

### Secondary indexing options
- Legacy secondary indexes (2i): local to each node; a query without the partition key asks **every node** — avoid on large clusters.
- **SAI** (Storage-Attached Indexing, Cassandra 5.0): indexes built per SSTable, supports numeric ranges, multiple indexed columns, and vector search («ANN OF»). Still best combined with a partition key restriction.
- **Materialized views**: experimental and disabled by default; prefer denormalized tables maintained by the app (or a CDC pipeline).

### Operational tuning
- Heap 8–31 GB with G1 (or modern collectors in 5.0); keep off-heap memtables/bloom filters in mind.
- Disks: local NVMe; never put commit log and data on slow network storage.
- «nodetool status», «tpstats» (dropped mutations/reads), «tablestats», «proxyhistograms» for latency per request.`],
 ["num","A partition gets 2,000,000 rows/day at ~150 bytes each. Partition size per day (MB)?",300,5,"MB","2,000,000 × 150 B = 300 MB/day: too big. Add an hour bucket (~12.5 MB)."],
 ["sort","Good query or anti-pattern?",{"Good":["SELECT by full partition key","SAI range query within one partition","Parallel queries over 24 hourly buckets"],"Anti-pattern":["2i query without partition key on 200 nodes","ALLOW FILTERING full scans","Batch of 5,000 rows across different partitions"]},"Unlogged batches across partitions add coordinator load."],
 ["pick","nodetool tpstats shows many dropped MUTATION messages. Meaning?",["Writes timed out on replicas under load","Reads were cached","Compaction finished","Gossip healthy"],0,"The node is overloaded or GC-pausing; hints/repair must catch up."],
 ["tf","Ops truths",[["Multi-partition batches make writes faster.",false,"They overload the coordinator; use async individual writes."],["SAI supports vector search in Cassandra 5.0.",true,"ANN OF queries."]]]
]},
{act:"Expert", t:"Expert boss: The fraud store", boss:true, time:45, rounds:[
 ["pick","Reads touch 20 SSTables per partition on a read-heavy profile table. Fix?",["LCS","More bloom filter false positives","Row cache everywhere","CL=ALL"],0,"Bound read amplification."],
 ["pick","Disk fills during STCS major compaction. Lesson?",["Keep ~50% free space with STCS or switch strategy","Disable compaction","Raise RF","Lower gc_grace"],0,"Merges need room."],
 ["pick","Deleted fraud flags reappeared after an outage. Fix the process?",["Repair cycle shorter than gc_grace_seconds (Reaper)","Lower RF","Use counters","STCS"],0,"Prevent zombies."],
 ["pick","Merchant partitions reach 2 GB. Fix?",["Add hour/day bucket to the partition key","Increase heap","More replicas","ALLOW FILTERING"],0,"Bound partition size."],
 ["pick","Usernames must be unique across the cluster. Use…",["INSERT … IF NOT EXISTS (LWT)","Counter column","Batch","ALLOW FILTERING"],0,"Paxos for uniqueness."],
 ["pick","p99 latency spikes from one slow replica. Mitigate?",["Speculative retry (e.g. 99p)","CL=ALL","Row cache","Bigger batches"],0,"Hedge slow replicas."],
 ["pick","Sensor table with TTL and TWCS still grows; data is updated weeks later. Cause?",["Out-of-window writes defeat TWCS expiry","Too few nodes","Bloom filters","Key cache"],0,"TWCS needs time-ordered, append-only data."]
]}
]);
