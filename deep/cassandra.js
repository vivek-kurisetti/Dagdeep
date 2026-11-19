QUEST.deep("cassandra", {
"Partition key → token → nodes": {
d: `Cassandra places data with **consistent hashing**:
1. The **partition key** (first part of the primary key) is hashed with **Murmur3** into a 64-bit **token**.
2. The token ring is divided into ranges owned by nodes. With **vnodes** («num_tokens», e.g. 16), each node owns many small ranges, which evens out data and makes adding/removing nodes smoother.
3. The **replication strategy** picks replicas: «NetworkTopologyStrategy» walks the ring and places «RF» replicas per data centre on different racks.

All rows of one partition live together on the same replicas, sorted by clustering columns. The driver's **token-aware** load balancing sends requests directly to a replica, saving a network hop.`,
life: `Houses on a circular road numbered by a hash of the owner's name: the postman (driver) computes the number and goes straight to the right house, and every house has two neighbours holding copies of its mail.`,
work: `During node additions, a cluster using «num_tokens=256» took days to stream data and repair. Newer clusters use 16 vnodes with the token allocation algorithm («allocate_tokens_for_local_replication_factor»), giving balanced ownership and faster operations.`,
ex: `CREATE KEYSPACE pay WITH replication = {'class': 'NetworkTopologyStrategy', 'ap-south-1': 3};
SELECT token(merchant_id, day), merchant_id FROM pay.txns_by_merchant LIMIT 3;
nodetool getendpoints pay txns_by_merchant '881:2026-11-18'   # which nodes hold this partition
nodetool status pay                                            # ownership per node`,
pit: [`SimpleStrategy in multi-DC/production.`, `Too many vnodes making repairs slow.`, `Non-token-aware drivers adding an extra hop.`],
q: [`What decides which nodes store a row?`, `The token from hashing its partition key, the token ranges each node owns, and the replication strategy.`]
},
"Masterless": {
d: `There's no leader or master in Cassandra. Every node can serve any request:
- The node receiving a request acts as **coordinator**: it forwards to replicas, waits for enough acknowledgements per the consistency level, and responds.
- **Gossip**: every second nodes exchange state (up/down, load, schema version, tokens) with a few peers; information spreads quickly.
- **Failure detection** (phi accrual) marks nodes down based on gossip timing.
- Writes are accepted as long as enough replicas are reachable for the consistency level; down replicas catch up later (hints, repair).

Benefits: no single point of failure, linear scalability, multi-DC active-active writes. Costs: eventual consistency semantics to manage, and operational tasks like repair.`,
life: `A group of equally empowered shop assistants: any of them can take your order and coordinate with colleagues; if one is on leave, others still serve you and fill them in when they return.`,
work: `During an AZ outage, one third of nodes went down. With RF=3 spread over 3 AZs and «LOCAL_QUORUM», reads and writes continued (2 of 3 replicas per partition available). After the AZ recovered, hinted handoff and a scheduled repair brought the returning nodes up to date.`,
ex: `nodetool status          # UN = Up/Normal, DN = Down/Normal
nodetool gossipinfo
nodetool describecluster  # schema versions agree?`,
pit: [`All clients pointing at one node.`, `Schema changes during partial outages (schema disagreement).`, `Assuming masterless means no consistency trade-offs.`],
q: [`What is a coordinator in Cassandra?`, `Whichever node receives the client request; it forwards to replicas and gathers responses per the consistency level.`]
},
"Model the queries, not the entities": {
d: `Cassandra has no joins, no ad-hoc WHERE on arbitrary columns, and limited secondary indexing. You can efficiently query **by partition key** (equality) and **clustering columns** (in order, with ranges on the last restricted one). So you:
1. List the application's **queries** first.
2. Design **one table per query**, with the **partition key** = what you look up by, and **clustering columns** = how rows should be sorted/filtered within the partition.
3. **Denormalise**: the same data is written to several tables (e.g. txns by merchant, txns by customer). Use logged batches only for atomicity across tables of the same entity, not for performance.

«ALLOW FILTERING» and secondary indexes on high-cardinality columns are usually signs the model doesn't match the query.`,
life: `Instead of one master filing cabinet you search through, you keep several cabinets each organised for a specific question: "by customer", "by date", "by city".`,
work: `A relational-style design (txns table keyed by txn_id) forced «ALLOW FILTERING» to list a merchant's transactions for a day: queries timed out at scale. A new table «txns_by_merchant_day» with PK «((merchant_id, day), ts, txn_id)» answered it with one partition read in ~5 ms.`,
ex: `CREATE TABLE pay.txns_by_merchant_day (
  merchant_id bigint, day date, ts timestamp, txn_id uuid, amount decimal, status text,
  PRIMARY KEY ((merchant_id, day), ts, txn_id)
) WITH CLUSTERING ORDER BY (ts DESC, txn_id ASC);
SELECT * FROM pay.txns_by_merchant_day
WHERE merchant_id = 881 AND day = '2026-11-18' AND ts > '2026-11-18 10:00:00' LIMIT 50;`,
pit: [`ALLOW FILTERING in production queries.`, `Modelling entities first and queries later.`, `Using batches for bulk loading performance.`],
q: [`What should the partition key represent?`, `The value you look data up by in that query (so the query reads one partition).`]
},
"Keep partitions bounded": {
d: `A partition is stored on one replica set and read as a unit. If it grows without bound (all events of a busy merchant forever), you get:
- slow reads and high heap usage when reading wide partitions,
- compaction and repair struggling with huge partitions (warnings in logs for partitions above ~100 MB),
- **hot spots**: one replica set takes all traffic for that key.

Fix by **bucketing**: add a time bucket (day/hour/month) or a synthetic shard number to the partition key: «((merchant_id, day))» or «((merchant_id, bucket))». Choose bucket size so partitions stay under ~100 MB and ~100k rows. Queries spanning buckets then read several partitions (in parallel). Monitor «nodetool tablehistograms» / «tablestats» for max partition size.`,
life: `A diary per year instead of one endless diary per lifetime: easier to carry, search and store, and you just open the years you need.`,
work: `PK = «merchant_id» for transactions made Amazon-scale merchants' partitions grow to 6 GB; reads timed out and compaction caused GC pauses. Re-keying to «((merchant_id, day))» capped partitions at ~40 MB; a dashboard reading 7 days issues 7 parallel partition queries in ~15 ms.`,
ex: `nodetool tablehistograms pay txns_by_merchant     # Partition Size percentiles
nodetool tablestats pay.txns_by_merchant | grep -i "Compacted partition maximum bytes"
-- bucketed key
PRIMARY KEY ((merchant_id, day), ts, txn_id)`,
pit: [`Unbounded partitions for busy entities.`, `Buckets so small that queries read thousands of partitions.`, `Ignoring large partition warnings in logs.`],
q: [`How do you bound a partition that grows with time?`, `Add a time bucket (e.g. day or month) to the partition key.`]
},
"Tunable consistency": {
d: `Each read or write chooses a **consistency level** (CL): how many replicas must respond.
- «ONE», «TWO», «THREE», «QUORUM» (majority of RF across all DCs), «LOCAL_QUORUM» (majority in the coordinator's DC), «EACH_QUORUM», «ALL», «LOCAL_ONE», «ANY» (writes only, can be satisfied by a hint).

**Strong consistency for a read after write** holds when **R + W > RF**: e.g. RF = 3 with «LOCAL_QUORUM» writes (2) and «LOCAL_QUORUM» reads (2): 4 > 3, so the read set overlaps the write set. «ONE/ONE» is faster and more available but can return stale data.

Lightweight transactions («IF NOT EXISTS», «IF col = x») use Paxos for compare-and-set with «SERIAL / LOCAL_SERIAL» consistency: much slower; use sparingly.`,
life: `Asking a question to a committee of 3: if 2 members signed off on the latest decision and you ask any 2 members, at least one of them knows the latest decision.`,
work: `A wallet balance read used «ONE» while writes used «ONE»; users occasionally saw an old balance right after top-up. Switching both to «LOCAL_QUORUM» (RF 3) removed stale reads; p99 latency rose from 4 to 7 ms. Duplicate-request prevention used «INSERT ... IF NOT EXISTS» only for idempotency keys.`,
ex: `CONSISTENCY LOCAL_QUORUM;
SELECT balance FROM pay.wallets WHERE user_id = 42;
INSERT INTO pay.idempotency (key, created) VALUES ('req-991', toTimestamp(now())) IF NOT EXISTS;
-- driver: statement.setConsistencyLevel(ConsistencyLevel.LOCAL_QUORUM)`,
pit: [`QUORUM (cross-DC) when LOCAL_QUORUM was meant.`, `LWTs in high-throughput paths.`, `ONE/ONE for read-your-writes requirements.`],
q: [`RF = 3. Write at ONE, read at QUORUM. Strongly consistent?`, `No: 1 + 2 = 3, not > 3; the read might miss the single replica that has the write.`]
},
"Repairing divergence": {
d: `Replicas drift when nodes are down, writes time out or messages drop. Three mechanisms bring them back together:
- **Hinted handoff**: when a replica is down, the coordinator stores a **hint** and replays it when the replica returns (within «max_hint_window», default 3 hours). After that window, hints stop being stored.
- **Read repair**: during reads at CL > ONE, if replicas return different data, the coordinator writes the newest version back to stale replicas (blocking read repair for the queried data).
- **Anti-entropy repair** («nodetool repair», Reaper, or automated repair in newer versions): compares full data ranges with Merkle trees and streams differences. Required regularly (at least once per «gc_grace_seconds») so deletes (tombstones) reach all replicas before they're purged.`,
life: `When a colleague returns from leave: messages left for them (hints), corrections made when someone notices a mismatch (read repair), and a periodic full audit of the records (repair).`,
work: `A node was down for 9 hours (beyond the 3-hour hint window). It came back with missing data, and some deleted rows reappeared later ("zombies") because repair hadn't run within gc_grace_seconds. The team set up Cassandra Reaper with weekly incremental repairs and an alert when a node is down longer than the hint window.`,
ex: `nodetool repair -pr pay                 # primary range repair on this node
nodetool netstats                       # streaming progress
# cassandra.yaml
max_hint_window: 3h
hinted_handoff_enabled: true`,
pit: [`Never running repair.`, `Nodes down longer than the hint window without follow-up repair.`, `Full repairs on huge clusters during peak hours.`],
q: [`Why must repair run within gc_grace_seconds?`, `So tombstones reach all replicas before compaction purges them; otherwise deleted data can resurrect from a replica that missed the delete.`]
},
"The write path": {
d: `A write on a replica:
1. Appended to the **commit log** on disk (sequential write, for durability; synced periodically or per batch depending on «commitlog_sync»).
2. Applied to the **memtable** (in-memory, sorted by partition and clustering key).
3. Acknowledged to the coordinator.
4. When a memtable is full (or on flush), it's written as an immutable **SSTable** (data file plus index, summary, bloom filter, statistics), and the commit log segment can be recycled.
5. **Compaction** later merges SSTables, keeping the newest version of each cell (by write timestamp) and purging expired tombstones.

There's **no read-before-write**: an UPDATE is just a new write with a newer timestamp ("upsert"). That's why writes are very fast and why last-write-wins semantics apply.`,
life: `A clerk who notes every transaction in a daybook first (commit log), updates a whiteboard (memtable), and periodically copies the whiteboard into bound volumes (SSTables); later volumes are merged into fewer, cleaner books (compaction).`,
work: `A write-heavy telemetry cluster (200k writes/s) had commit logs and data on the same slow EBS volume; flushes and compactions stalled writes. Moving commit logs to a separate fast volume and tuning memtable/flush settings removed write timeouts.`,
ex: `nodetool tpstats            # MutationStage, pending flushes
nodetool tablestats pay.events | grep -E "SSTable count|Memtable"
nodetool flush pay events`,
pit: [`Read-before-write patterns (read then update) adding latency and races.`, `Clock skew between clients (last-write-wins by timestamp).`, `Commit log on slow shared disks.`],
q: [`Why are Cassandra writes fast?`, `They're a sequential commit log append plus an in-memory update, with no read-before-write; disk sorting happens later.`]
},
"Tombstones": {
d: `Deletes can't remove data immediately (SSTables are immutable and other replicas may still have the value). Instead Cassandra writes a **tombstone**: a marker with a timestamp. Tombstones are created by DELETE, by writing **nulls** (e.g. inserting null columns), by **TTL** expiry, and by collection overwrites.

Tombstones are kept for «gc_grace_seconds» (default 10 days) so repair can propagate them; after that, compaction can purge them (if all relevant SSTables are compacted together).

Problems: reads must scan over tombstones; a query that reads many (e.g. a queue-like table where you delete processed rows) slows down and hits «tombstone_warn_threshold» (1,000) and «tombstone_failure_threshold» (100,000), failing the query. Avoid queue patterns, avoid writing nulls (use unset), prefer TTL with TimeWindowCompactionStrategy for time series.`,
life: `Crossing out entries in a register instead of erasing them; the crossed-out lines stay until the next cleanup. Reading a page with thousands of crossed-out lines takes forever.`,
work: `A "pending jobs" table where workers deleted rows after processing caused reads to scan 300k tombstones; queries failed with TombstoneOverwhelmingException. Redesigning as time-bucketed partitions with TTL and TWCS (whole SSTables expire and get dropped) eliminated the issue.`,
ex: `-- avoid writing nulls (creates tombstones); use unset values in drivers
INSERT INTO pay.events (id, ts, payload) VALUES (?, ?, ?) USING TTL 604800;
ALTER TABLE pay.events WITH compaction = {'class': 'TimeWindowCompactionStrategy',
  'compaction_window_unit': 'DAYS', 'compaction_window_size': 1} AND default_time_to_live = 604800;
-- logs: "Read 5000 live rows and 120000 tombstone cells"`,
pit: [`Cassandra as a queue.`, `Inserting explicit nulls.`, `Lowering gc_grace_seconds without reliable repairs.`],
q: [`Name three things that create tombstones.`, `DELETE statements, writing null values, and TTL expiry (also collection overwrites).`]
},
"How a read finds data": {
d: `A read for a partition on a replica:
1. Check the **memtable**.
2. For each SSTable that might contain the partition: check its **bloom filter** (probabilistic "definitely not here / maybe here"); if maybe, check the **key cache** (partition offset cache); otherwise use the **partition summary** (sampled index in memory) to find the right block of the **partition index** on disk; then read the data at that offset (possibly using the **compression offset map**).
3. Merge the versions from memtable and all SSTables by timestamp; apply tombstones.
4. Return the result to the coordinator, which may compare digests from other replicas (read repair).

Read cost grows with the **number of SSTables** touched per read (watch «SSTables per read» histograms), wide partitions, and tombstones. Compaction strategy and data modelling control this.`,
life: `Looking for a customer's records across several filing cabinets: a quick "not in this cabinet" sticker check (bloom filter), a shortcut index card (key cache), then the actual folder; finally you combine all the pages, newest first.`,
work: `p99 read latency crept up to 120 ms. «nodetool tablehistograms» showed reads touching 18 SSTables at p99 on a SizeTiered table with frequent updates. Switching to LeveledCompactionStrategy (more write I/O, fewer SSTables per read) brought it to 3 SSTables and p99 to 12 ms.`,
ex: `nodetool tablehistograms pay accounts    # SSTables per read, partition size, latency
nodetool info | grep -i "key cache"
ALTER TABLE pay.accounts WITH compaction = {'class': 'LeveledCompactionStrategy'};
ALTER TABLE pay.accounts WITH bloom_filter_fp_chance = 0.01;`,
pit: [`Update-heavy tables on STCS with many SSTables per read.`, `Ignoring tombstones in read paths.`, `Huge partitions read whole.`],
q: [`What does the bloom filter tell a read?`, `Whether an SSTable definitely does not contain the partition (so it can be skipped) or might contain it.`]
},
"Amplification trade-offs": {
d: `Compaction strategies trade three costs:
- **Write amplification**: how many times data is rewritten on disk.
- **Read amplification**: how many SSTables a read touches.
- **Space amplification**: extra disk needed for obsolete data and temporary space during compaction.

Strategies:
- **SizeTieredCompactionStrategy (STCS)**: merges similar-sized SSTables. Low write amplification, good for write-heavy/insert-mostly; but reads may touch many SSTables and big compactions need lots of free disk (up to 50%).
- **LeveledCompactionStrategy (LCS)**: levels of fixed-size SSTables with non-overlapping ranges per level; ~90% of reads hit one SSTable. Great for read-heavy/update-heavy; higher write amplification and I/O.
- **TimeWindowCompactionStrategy (TWCS)**: compacts within time windows; ideal for time-series with TTL (whole windows expire and drop cheaply). Bad with out-of-order writes or updates to old data.
- **UnifiedCompactionStrategy (UCS)** (Cassandra 5.0): configurable to behave between tiered and leveled, adaptive per workload.`,
life: `Organising papers: dumping them in piles by size (cheap to file, slow to find), keeping strict sorted binders (slow to file, fast to find), or one box per week that you throw away when expired.`,
work: `An IoT table with 30-day TTL used STCS; disk usage was 3× live data and compactions needed huge free space. Moving to TWCS with daily windows made expired data drop as whole SSTables; disk usage fell to 1.2× live data.`,
ex: `ALTER TABLE iot.readings WITH compaction = {'class': 'TimeWindowCompactionStrategy',
  'compaction_window_unit': 'DAYS', 'compaction_window_size': 1};
ALTER TABLE pay.accounts WITH compaction = {'class': 'LeveledCompactionStrategy', 'sstable_size_in_mb': 160};
-- Cassandra 5.0
ALTER TABLE pay.events WITH compaction = {'class': 'UnifiedCompactionStrategy', 'scaling_parameters': 'T4'};
nodetool compactionstats`,
pit: [`TWCS with updates/deletes to old data.`, `STCS on read-heavy update workloads.`, `Running disks near full with STCS.`],
q: [`Which strategy suits time-series data with TTL?`, `TimeWindowCompactionStrategy.`]
},
"Anti-entropy repair": {
d: `«nodetool repair» compares replicas' data for token ranges:
1. Each replica builds a **Merkle tree** (hash tree) of its data for the range.
2. Trees are compared; only ranges whose hashes differ are **streamed** between replicas.

Variants:
- **Full repair**: compares all data.
- **Incremental repair**: tracks repaired vs unrepaired SSTables and only compares unrepaired data (much cheaper when run regularly; fixed and recommended in 4.0+).
- **Subrange repair**: split ranges into smaller pieces to limit impact.
- «-pr» (primary range) so each range is repaired once across the cluster.

Tools: **Cassandra Reaper** schedules and paces repairs; Cassandra 5.x adds built-in auto-repair options in some distributions. Repair must complete on every range at least once per «gc_grace_seconds».`,
life: `Two copies of a long ledger: instead of comparing every line, you compare checksums of each chapter, then each page within mismatched chapters, and copy only the differing pages.`,
work: `Monthly full repairs took 3 days and caused latency spikes. Moving to incremental repairs every 2 days via Reaper with subrange segmentation and intensity throttling kept repairs under 2 hours with no visible latency impact.`,
ex: `nodetool repair --full -pr pay                    # full, primary range
nodetool repair pay                               # incremental (default in 4.0+)
nodetool repair -st <start_token> -et <end_token> pay accounts   # subrange
# Reaper: schedule incremental repair every 2 days, intensity 0.5`,
pit: [`Running full repairs on all nodes at once.`, `Mixing incremental and full repair carelessly (pre-4.0 issues).`, `Not finishing repairs within gc_grace_seconds.`],
q: [`What does a Merkle tree save during repair?`, `Network and I/O: only ranges whose hashes differ are compared in detail and streamed.`]
},
"Size partitions with maths": {
d: `Estimate before production:
- **Rows per partition** = events per key per bucket (e.g. a merchant's transactions per day at peak).
- **Bytes per row** ≈ sum of column value sizes + clustering column sizes + per-cell overhead (timestamps, flags; roughly 10–30 bytes per cell in older formats, less in 3.0+ storage engine) + per-row overhead.
- **Partition size** = rows × bytes per row (before compression). Keep it **< ~100 MB** and **< ~100k rows** as a rule of thumb (Cassandra 4/5 handle larger partitions better, but latency, GC and repair still suffer).
- Plan for the **largest** keys (top merchant), not the average.

Also estimate total data per node: total data × RF ÷ nodes, keeping nodes in a manageable range (e.g. ≤ 1–2 TB per node for fast streaming/repair, depending on hardware and version).`,
life: `Choosing box sizes for moving: count items per room and their sizes first, so no single box becomes too heavy to lift.`,
work: `Top merchant: 3 M transactions/day × ~250 bytes per row ≈ 750 MB per day partition: too big. With «((merchant_id, day, hour))» buckets: peak hour 400k rows ≈ 100 MB; with an extra shard «bucket = txn_id hash % 4», ~25 MB. Average merchants stayed in one shard by using shard count per merchant tier.`,
ex: `rows_per_partition = 3_000_000 / 24          # per hour
bytes_per_row = 8 + 16 + 8 + 16 + 20 + 30 + 60   # ids, ts, amount, status, overhead (rough)
print(rows_per_partition * bytes_per_row / 1e6, "MB per hour partition")
# then verify in staging: nodetool tablehistograms (partition size percentiles)`,
pit: [`Sizing for averages, not the biggest keys.`, `Never validating estimates with real histograms.`, `Huge data per node making repair/streaming slow.`],
q: [`Why size for the largest key rather than the average?`, `One huge partition creates hot spots and slow reads/compactions even if most partitions are small.`]
}
});
