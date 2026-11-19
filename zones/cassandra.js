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

QUEST.story("cassandra", {title:"The tombstone timeout", icon:"🪦", place:"Thu 3 PM · notifications service", setup:"Reading a user's notification inbox started timing out. Users with old accounts can't load their inbox at all.",
 meters:[["to","Read timeouts","/min",120,0,"low",150],["p99","Read p99"," ms",5000,50,"low",5000],["trust","Team confidence","%",40,70,"high",100]],
 beats:[["ravi","Logs say: 'Scanned over 100000 tombstones during query'. What's a tombstone?"],["ui","Table: inbox (user_id, created_at, msg)  PRIMARY KEY (user_id, created_at)\nApp: reads 'latest 20', deletes notifications after they're read"],
  ["q","Why are reads slow?",[["Deletes write tombstones; reading the latest 20 must skip over thousands of tombstones in the same partition until gc_grace_seconds passes and compaction removes them",1,"Cassandra deletes are writes (markers). A queue-like pattern of insert + delete per partition piles them up.","Crossed-out lines in a notebook you still have to read past."],["The cluster needs more nodes",0.5,"Each read still scans the same partition's tombstones.","More notebooks, same crossed-out pages."],["Cassandra doesn't support deletes",0,"It does, via tombstones.","Of course you can cross things out."]]],
  ["q","How do you fix the data model?",[["Use TTLs instead of deletes, cluster by created_at DESC, and bucket partitions by time (user_id, month)",1,"Bounded partitions, newest rows first, and expiry handled by TTL plus TimeWindowCompactionStrategy.","A new notebook every month; old ones get thrown away whole."],["Lower gc_grace_seconds to 0",0.5,"Tombstones go faster, but a node that was down can resurrect deleted data after repair.","Shredding crossed-out pages before every copy is updated."],["Run major compaction every hour",0,"Heavy I/O and still fights the model.","Rewriting the notebook constantly."]]],
  ["q","Which compaction strategy fits time-series data with TTLs?",[["TWCS (TimeWindowCompactionStrategy): whole SSTables expire and drop together",1,"Data written in the same window expires together, so entire files are dropped without merging.","Throwing away a whole month's box at once."],["SizeTiered",0.5,"Default, but mixes old and new data in files, so expired data lingers.","Mixing receipts from all months in one box."]]],
  ["ravi","Remodelled: p99 at 12 ms, zero timeouts."]],
 learned:["Deletes are tombstones; queue patterns kill Cassandra reads.","Bound partitions with time buckets; prefer TTL to deletes.","TWCS for time-series with TTL."]});
QUEST.mock("cassandra", {title:"Cassandra round", who:"farah", intro:"Farah again. Cassandra rewards good modelling and punishes bad. Let's see.", setup:"Farah's team runs Cassandra for high-write event data.",
 qs:[["How do you model data in Cassandra?","**Query-first**: one table per query pattern. The **partition key** decides which node holds the data (spread writes, keep partitions bounded: under ~100 MB); **clustering columns** sort rows within a partition. Denormalize freely; no joins.",[["Design one table per query; partition key spreads and bounds data; clustering columns order it; denormalize",1,"The Cassandra mindset."],["Normalize and use joins",0,"No joins in Cassandra."],["Use secondary indexes for every query",0.5,"They scatter-gather across nodes and don't scale for high-cardinality lookups."]]],
  ["Explain tunable consistency.","Each read/write picks a consistency level: ONE, QUORUM, ALL, LOCAL_QUORUM. With replication factor RF, **R + W > RF** gives read-your-writes (e.g. QUORUM/QUORUM with RF=3). LOCAL_QUORUM keeps latency inside one datacenter.",[["Per-request levels; R + W > RF for strong reads, e.g. QUORUM + QUORUM at RF 3; LOCAL_QUORUM for multi-DC",1,"The formula and the practice."],["Cassandra is always eventually consistent",0.5,"Tunable: it can be strongly consistent per request."],["Consistency is set once for the cluster",0,"It's per request."]]],
  ["How does a write work internally?","Write to the **commit log** (durability) and the **memtable** (memory), acknowledge. Memtables flush to immutable **SSTables**; **compaction** merges them. Reads check memtable + SSTables, using **bloom filters** and partition indexes to skip files.",[["Commit log + memtable, flush to immutable SSTables, compaction merges; reads use bloom filters",1,"LSM-tree internals."],["Writes update rows in place on disk",0,"Cassandra never updates in place."],["Writes go to a leader node first",0,"Masterless: any node can coordinate."]]],
  ["What's repair and why does it matter?","Anti-entropy **repair** compares replicas (Merkle trees) and fixes differences. It must run within **gc_grace_seconds** (default 10 days), or a replica that missed a delete can bring deleted data back (zombie data). Use incremental repair or Reaper on a schedule.",[["It syncs replicas; it must run within gc_grace_seconds or deleted data can resurrect",1,"The key operational risk."],["It fixes corrupted SSTables only",0.5,"That's scrub."],["It's optional",0,"Skipping repair causes inconsistency and zombies."]]]],
 learned:["Query-first tables, bounded partitions.","R + W > RF for strong reads.","Repair within gc_grace_seconds."]});

/* ===== On-call desk: Cassandra incident ===== */
QUEST.cases("cassandra", [
{
 title:"Reads time out on three nodes", icon:"🐘", sev:2, clock:"19:40", channel:"inc-2402-events-timeouts", svc:"user-events · Cassandra 4.1, 12 nodes", need:4,
 impact:{label:"Failed reads", ic:"❌", rate:35, start:41000},
 terms:[["Partition","All rows sharing a partition key live together on the same replicas. It's the unit of distribution."],["Wide / large partition","A partition that grew far beyond ~100 MB. Reading or compacting it is slow and memory-hungry."],["Replica","Each partition is stored on RF nodes (here 3). A hot or huge partition hurts exactly those nodes."],["GC pause","The JVM stops to clean up memory. Long pauses make a node look dead to the others."],["Bucketing","Adding a time bucket (day, hour) to the partition key so no partition grows forever."]],
 deep:[{t:"Why one partition can hurt three nodes", md:"A partition key hashes to one token range, owned by **RF replicas** (here 3). Every read and every compaction of that partition happens on those three nodes. A 2.4 GB partition means huge index entries, big memory allocations during reads and compaction, long **GC pauses**, and timeouts for *every* query those nodes coordinate, not only the bad key. Other nodes look healthy, which is the giveaway."},{t:"Designing partitions that stay bounded", md:"- Aim for partitions under ~100 MB and ~100k rows.\n- Add a **time bucket** to the key: «((user_id, day), event_ts)».\n- Protect against abusive keys: rate-limit or drop events from bots before they hit the database.\n- Watch «nodetool tablehistograms» max partition size and the «Writing large partition» warning («compaction_large_partition_warning_threshold»)."}],
 pager:`[r]FIRING[/r]  user-events read timeouts  [r]3.1%[/r] of reads (SLO 0.1%)
nodes     cass-04, cass-07, cass-11 p99 read [r]4.8 s[/r]; other 9 nodes p99 [g]6 ms[/g]
since     ~17:00, getting worse`,
 brief:"The **user-events** table stores app events per user. Reads for the activity feed time out, but only on **three** of twelve nodes. Nothing was deployed today.",
 slack:[
  {at:0, who:"ravi", t:"Only 3 nodes are sick. Same hardware as the rest. Weird."},
  {at:5, who:"priya", t:"3 nodes is a number that should ring a bell: our replication factor is 3. Check the table's partition sizes.", cmd:"nodetool tablehistograms events user_events"},
  {at:50, who:"dev", t:"Shall I add 4 more nodes? I can have them in 30 minutes."},
  {on:"bigpart", who:"priya", t:"A 2.4 GB partition. Which key? Cassandra logs a warning when it compacts a large partition.", cmd:"grep -i 'large partition' /var/log/cassandra/system.log"},
  {on:"botkey", who:"sana", t:"BOT-9921… that's a scraper we've seen before. It's been sending ~400 events/s with the same fake user id since this afternoon."}
 ],
 hints:["Three sick nodes out of twelve, with RF=3: what do those three nodes have in common?","Look at partition sizes with «nodetool tablehistograms». Is one partition enormous?","Find which partition key it is from the large-partition warning in system.log."],
 term:{host:"cass-04", user:"oncall", suggest:["nodetool status","nodetool tablehistograms events user_events"],
  cmds:[
  {m:["nodetool status"], out:`Datacenter: ap-south-1
--  Address     Load       Tokens  Owns   Host ID   Rack
UN  10.6.1.4    [y]612 GiB[/y]    16      25.1%  …        1a
UN  10.6.1.7    [y]598 GiB[/y]    16      24.9%  …        1b
UN  10.6.1.11   [y]605 GiB[/y]    16      25.0%  …        1c
UN  10.6.1.2    561 GiB    16      24.8%  …        1a
[d]… all 12 nodes Up/Normal[/d]`, note:"All nodes are up and data is balanced. Nothing is down; three nodes are just slow."},
  {m:["nodetool tablehistograms"], out:`events/user_events histograms
Percentile  Read Latency  Partition Size   Cell Count
50%         0.61 ms       2.3 KiB          12
99%         88 ms         310 KiB          4,102
Max         [r]4.9 s[/r]         [r]2.4 GiB[/r]          [r]31,881,204[/r]`, clue:"bigpart", unlock:["grep -i 'large partition' /var/log/cassandra/system.log"]},
  {m:["grep -i 'large partition'","grep -i large"], out:`WARN  [CompactionExecutor:41] 17:12:03 BigTableWriter.java:274 - [y]Writing large partition events/user_events:BOT-9921 (1.1 GiB)[/y]
WARN  [CompactionExecutor:44] 19:31:40 BigTableWriter.java:274 - [r]Writing large partition events/user_events:BOT-9921 (2.4 GiB)[/r]`, clue:"botkey", unlock:["nodetool getendpoints events user_events BOT-9921","grep GCInspector /var/log/cassandra/system.log"]},
  {m:["nodetool getendpoints"], out:`10.6.1.4
10.6.1.7
10.6.1.11`, clue:"replicas"},
  {m:["grep gcinspector","grep -i gc"], out:`INFO  [Service Thread] 19:35:12 GCInspector.java:299 - G1 Young Generation GC in 1120ms
WARN  [Service Thread] 19:36:40 GCInspector.java:299 - [r]G1 Old Generation GC in 8412ms[/r]. Heap 15.6 GiB / 16 GiB`, clue:"gc"},
  {m:["nodetool compactionstats"], out:`pending tasks: 14
compaction  events  user_events  [y]2.1 GiB / 2.4 GiB[/y]  bytes  87%`, note:"14 pending compactions is moderate. Notice what's being compacted, though: the giant partition."},
  {m:["df -h"], out:`/dev/nvme1n1  1.7T  612G  1.1T  36% /var/lib/cassandra`, note:"Plenty of disk. Not a capacity problem."}
 ]},
 dash:[
  {title:"Read p99 by node (ms)", x:["16:00","17:00","18:00","19:00","19:40"], series:[{name:"cass-04/07/11", v:[6,90,800,2600,4800]}, {name:"other 9 nodes", v:[6,6,6,7,6]}], marks:[{i:1, label:"17:00"}], clue:"threenodes"},
  {title:"Events written per second, top user_id", x:["16:00","17:00","18:00","19:00","19:40"], series:[{name:"BOT-9921", v:[0,410,405,412,409]}, {name:"next highest user", v:[2,2,3,2,2]}], marks:[{i:1, label:"bot starts"}], clue:"botrate"},
  {title:"Cluster CPU %", unit:"%", x:["16:00","17:00","18:00","19:00","19:40"], series:[{name:"avg", v:[31,33,35,36,37]}], note:"Average CPU barely moved. The pain is concentrated on three nodes, so cluster averages hide it."}
 ],
 clues:{bigpart:"Max partition size is 2.4 GiB (31M cells); p99 is 310 KiB", botkey:"The large partition is user_events:BOT-9921, growing since 17:12", replicas:"BOT-9921's replicas are exactly cass-04, cass-07 and cass-11", gc:"Those nodes show 8-second old-gen GC pauses with a full heap", threenodes:"Only three nodes are slow; the other nine are at 6 ms", botrate:"BOT-9921 writes ~410 events/s since 17:00; normal users write 2"},
 cause:{q:"What's the root cause?", o:[
  {t:"A scraper bot writes ~400 events/s under one user id, growing a single 2.4 GB partition; its three replicas suffer huge reads/compactions and long GC pauses", ok:true},
  {t:"The cluster is out of capacity", ok:false, why:"Nine nodes are idle at 6 ms; disk at 36%.", say:[["ravi","Nine nodes are fine at 6 ms and disks are a third full. It isn't capacity."]]},
  {t:"Tombstones from deletes", ok:false, why:"No deletes on this table; the warning is about partition size.", say:[["priya","This table has no deletes. The warning is about a huge partition, not tombstones."]]},
  {t:"A network problem in one rack", ok:false, why:"The three nodes are in three different racks.", say:[["ravi","cass-04, 07 and 11 are in racks 1a, 1b and 1c. Not one rack."]]}]},
 fix:{q:"What do you ship?", o:[
  {t:"Block or rate-limit BOT-9921 at the API gateway", kind:"must", why:"Stops the partition growing right now.", miss:[["sana","Partition is still growing at 400 events/s. Stop the bot first."]]},
  {t:"Delete (or TTL) the bot's partition and move the table to a bucketed key ((user_id, day), event_ts)", kind:"must", why:"Removes the monster and makes it impossible for any one user to grow a partition forever.", miss:[["priya","Bot's blocked, but a 2.4 GB partition still sits on three nodes and gets compacted and read. And any future heavy user can do this again."]]},
  {t:"Alert on max partition size and the large-partition warning", kind:"good", why:"You'd catch it at 100 MB, not 2.4 GB."},
  {t:"Add 4 more nodes", kind:"bad", why:"The partition still lives on the same 3 replicas: more nodes don't split a partition.", say:[["dev","4 nodes added, streaming data for an hour… and cass-04/07/11 still time out. The partition didn't move."]]},
  {t:"Raise read_request_timeout to 30 s", kind:"bad", why:"Hides the timeouts; users wait 30 s instead and threads pile up.", say:[["ravi","Timeouts went down, but app threads are now stuck for 30 s and the feed API is falling over."]]},
  {t:"Run a major compaction on all nodes", kind:"meh", why:"Heavy I/O for hours; doesn't remove a live, growing partition."}]},
 post:{summary:"Feed reads timed out for ~3% of users for 2.5 hours. Only three of twelve nodes were affected.", cause:"A scraper wrote ~410 events/s under the fake user id «BOT-9921». The table is keyed by «user_id» alone, so all of it went into **one partition** that reached **2.4 GB / 31M cells**. Its three replicas (RF=3) spent their heap reading and compacting it, hit **8 s GC pauses**, and timed out on unrelated queries too.", prevent:["Bucket partitions by time","Rate-limit events per user at the edge","Alert on max partition size and large-partition warnings"]},
 learned:["A few sick nodes = check what they **share**: the replicas of one partition.","Partitions must be **bounded**: add a time bucket.","More nodes don't split a hot or huge partition."],
 cards:[]
}
]);
