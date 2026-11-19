QUEST.deep("postgres", {
"Updates create new row versions": {
d: `Postgres implements **MVCC** by keeping multiple versions of a row in the table itself. Every tuple has **xmin** (the transaction that created it) and **xmax** (the transaction that deleted or replaced it). An UPDATE is really INSERT new version + mark old version's xmax. A DELETE just sets xmax.

Each query runs with a **snapshot**: the list of transactions that were committed when it started. A tuple is visible if its xmin committed before the snapshot and its xmax didn't. That's how readers never block writers and writers never block readers.

The cost: old versions (**dead tuples**) stay in the table until VACUUM removes them, and indexes may point to every version. Updating one column of a wide row copies the whole row. **HOT updates** (heap-only tuples) avoid index updates when no indexed column changes and the page has free space («fillfactor» < 100 helps).`,
life: `A notebook where you never erase: to change an address you strike through the old line and write a new one below. Anyone who opened the notebook earlier still reads the old line; a cleaner (vacuum) later removes struck lines.`,
work: `An «orders» table updated «status» 6 times per order lifecycle produced 6 versions per row; the table was 4× its live size. Setting «fillfactor = 80» made most status updates HOT (no index writes), and tuned autovacuum kept bloat under 20%. Update throughput rose ~35%.`,
ex: `SELECT xmin, xmax, ctid, status FROM orders WHERE id = 42;
UPDATE orders SET status = 'PAID' WHERE id = 42;
SELECT xmin, xmax, ctid, status FROM orders WHERE id = 42;  -- new ctid, new xmin
SELECT n_tup_upd, n_tup_hot_upd FROM pg_stat_user_tables WHERE relname='orders';
ALTER TABLE orders SET (fillfactor = 80);`,
pit: [`Frequent updates of a tiny column on a very wide row.`, `Indexing a frequently-updated column, which kills HOT updates.`, `Assuming row count = table size; dead tuples take space too.`],
q: [`Why don't SELECTs block UPDATEs in Postgres?`, `The UPDATE writes a new version; the SELECT keeps reading the version visible in its snapshot.`]
},
"Autovacuum and bloat": {
d: `**VACUUM** removes dead tuples no snapshot can see anymore, marks the space reusable in the **free space map**, updates the **visibility map** (for index-only scans), and freezes old XIDs. It doesn't shrink the file (only «VACUUM FULL» / pg_repack does, with heavy locking or a rebuild).

Autovacuum triggers at «autovacuum_vacuum_threshold (50) + autovacuum_vacuum_scale_factor (0.2) × reltuples» dead tuples. On a 500 M row table that's **100 M dead rows** before vacuum starts: far too late. Per-table settings (scale factor 0.01–0.02 or a fixed threshold) fix this.

The real enemy is the **oldest snapshot**: a long-running transaction, an idle-in-transaction session, or a lagging replica with «hot_standby_feedback» keeps the **xmin horizon** old, so VACUUM can't remove anything newer.`,
life: `A restaurant clears tables only when 20% of all tables are dirty. In a 500-table food court that's 100 dirty tables before anyone cleans. And if one customer keeps "sitting" for hours, nothing after their arrival can be cleared.`,
work: `A 300 GB «payment_attempts» table had 70% bloat; queries slowed 3×. Root cause: an analytics user ran a 9-hour report in an open transaction every night, pinning the xmin horizon. Fixes: «idle_in_transaction_session_timeout», reports moved to a replica, per-table «autovacuum_vacuum_scale_factor=0.01», and a one-time «pg_repack» that shrank it to 110 GB online.`,
ex: `SELECT relname, n_live_tup, n_dead_tup, last_autovacuum
FROM pg_stat_user_tables ORDER BY n_dead_tup DESC LIMIT 10;
SELECT pid, now()-xact_start AS age, state, query FROM pg_stat_activity
WHERE xact_start IS NOT NULL ORDER BY age DESC LIMIT 5;
ALTER TABLE payment_attempts SET (autovacuum_vacuum_scale_factor = 0.01,
  autovacuum_vacuum_cost_limit = 2000);`,
pit: [`Disabling autovacuum on "busy" tables.`, `Long or idle-in-transaction sessions pinning the horizon.`, `Expecting plain VACUUM to return disk space to the OS.`],
q: [`VACUUM ran but dead tuples didn't drop. What's the first thing to check?`, `The oldest open transaction / replication slot / standby feedback holding back the xmin horizon.`]
},
"Transaction ID wraparound": {
d: `Transaction IDs are **32-bit** (~4.2 billion) and compared in a circle: each XID sees ~2 billion as "past" and ~2 billion as "future". If an old tuple's xmin got more than 2 billion behind, it would suddenly look like it's from the future and **vanish**.

To prevent this, VACUUM **freezes** tuples old enough («vacuum_freeze_min_age»), marking them as visible to everyone forever. Each table tracks «relfrozenxid»; when its age passes «autovacuum_freeze_max_age» (200 M), an **anti-wraparound autovacuum** runs even if autovacuum is "off", and it can't be cancelled by lock conflicts.

If age approaches ~2 billion, Postgres warns, then **stops accepting new XIDs** (writes fail) until you vacuum. On busy systems burning 50k XIDs/s that's weeks, not years.`,
life: `A clock with only 12 hours on its face: if you don't mark yesterday's appointments as "done", at some point 3 o'clock yesterday looks like 3 o'clock in the future.`,
work: `A write-heavy OLTP DB (≈40k tx/s) hit "database is not accepting commands to avoid wraparound data loss" after an anti-wraparound vacuum kept getting slowed on a 2 TB table with default cost limits. Recovery took hours. After that: alert at age > 1 B, higher «autovacuum_vacuum_cost_limit», more autovacuum workers, and scheduled manual «VACUUM (FREEZE)» on the largest tables.`,
ex: `SELECT datname, age(datfrozenxid) FROM pg_database ORDER BY 2 DESC;
SELECT relname, age(relfrozenxid) AS xid_age,
       pg_size_pretty(pg_total_relation_size(oid))
FROM pg_class WHERE relkind = 'r' ORDER BY 2 DESC LIMIT 10;
VACUUM (FREEZE, VERBOSE) big_table;`,
pit: [`No alert on XID age.`, `Killing anti-wraparound vacuums repeatedly.`, `Long transactions that block freezing.`],
q: [`Why can wraparound make data "disappear"?`, `Without freezing, an old xmin more than 2^31 behind compares as a future transaction, so the row becomes invisible.`]
},
"Write-ahead log": {
d: `Rule: a data page change is never written to disk before the **WAL record** describing it. On COMMIT, Postgres flushes WAL (fsync) up to that commit's LSN; the actual table/index pages are written later by the background writer and **checkpoints**.

On crash, recovery starts from the last checkpoint's **redo point** and replays WAL forward. Checkpoints are triggered by «checkpoint_timeout» (5 min) or «max_wal_size»; after each checkpoint, the first change to every page writes a **full-page image** (to survive torn pages), which inflates WAL right after checkpoints.

WAL also drives **streaming replication**, **PITR** (base backup + archived WAL) and **logical decoding** (Debezium).`,
life: `A shop owner first writes each sale in a numbered daybook, then updates the stock register when free. If the register gets damaged, she redoes entries from the daybook since the last time she verified the register.`,
work: `A bulk load generated 120 GB of WAL per hour; checkpoints every 2 min ("checkpoints are occurring too frequently" warnings) caused I/O spikes and lots of full-page images. Raising «max_wal_size» to 64 GB and «checkpoint_timeout» to 15 min halved WAL volume and smoothed latency.`,
ex: `SHOW wal_level;           -- replica / logical
SELECT pg_current_wal_lsn();
SELECT * FROM pg_stat_bgwriter;   -- checkpoints_timed vs checkpoints_req
ALTER SYSTEM SET max_wal_size = '32GB';
ALTER SYSTEM SET checkpoint_completion_target = 0.9;`,
pit: [`Tiny max_wal_size causing constant checkpoints.`, `«fsync=off» in production.`, `Putting WAL on the slowest disk.`],
q: [`Why does WAL volume spike right after a checkpoint?`, `The first modification of each page after a checkpoint writes a full-page image to guard against torn pages.`]
},
"Replication slots retain WAL": {
d: `A **replication slot** makes the primary remember how far a consumer (a physical standby or a logical decoder like Debezium) has confirmed: «restart_lsn» / «confirmed_flush_lsn». WAL older than that is **kept**, even past «max_wal_size».

That's what makes slots safe: a consumer can disconnect for an hour and resume without missing changes. It's also the danger: a **dead or forgotten slot** retains WAL forever and «pg_wal» grows until the disk fills and the primary **stops**. Logical slots also hold back «catalog_xmin», which bloats system catalogs.

Safety net: «max_slot_wal_keep_size» (PG13+) caps retained WAL; beyond it the slot is invalidated (consumer must re-snapshot) rather than killing the primary.`,
life: `A library holds every returned book for a member who said "I'll come back for these". If that member moved away, the hold shelf fills the whole library.`,
work: `A Debezium connector was paused for a migration and forgotten. Five days later the primary's 2 TB disk hit 97%; «pg_wal» was 1.6 TB. On-call checked «pg_replication_slots», confirmed the slot was inactive, dropped it (planning a fresh Debezium snapshot), and WAL dropped within minutes. Then: «max_slot_wal_keep_size = 200GB» and an alert on retained WAL per slot.`,
ex: `SELECT slot_name, slot_type, active,
  pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS retained
FROM pg_replication_slots ORDER BY 4 DESC;
SELECT pg_drop_replication_slot('debezium_orders');
ALTER SYSTEM SET max_slot_wal_keep_size = '200GB';`,
pit: [`No monitoring on inactive slots.`, `Dropping a slot without planning the consumer's re-sync.`, `Leaving test slots on production.`],
q: [`Why can a stopped Debezium connector take down a Postgres primary?`, `Its replication slot keeps all WAL since its last confirmed LSN; pg_wal grows until the disk is full.`]
},
"Many index types": {
d: `- **B-tree** (default): equality, ranges, ORDER BY, prefix «LIKE 'abc%'». Most indexes.
- **Hash**: equality only; rarely better than B-tree.
- **GIN** (generalized inverted): many keys per row: «jsonb» containment («@>»), arrays, full-text «tsvector», trigram search. Slower to update; uses a pending list («fastupdate»).
- **GiST**: geometric types, ranges («tstzrange» overlap), nearest-neighbour, exclusion constraints (no overlapping bookings).
- **SP-GiST**: partitioned search spaces (IP ranges, quadtrees).
- **BRIN** (block range): stores min/max per range of pages. Tiny (KBs for TBs) and great when data is **physically ordered** by the column (append-only time series). Useless on random data.
- Extensions add more: **pgvector** HNSW/IVFFlat for embeddings.`,
life: `Different library catalogues: an alphabetical card index (B-tree), a subject index where one book appears under many topics (GIN), a map of shelves by area (GiST), and a sign per aisle saying "books from 2001–2005 here" (BRIN).`,
work: `An append-only «events» table (3 TB) had a 180 GB B-tree on «created_at». Replacing it with a **BRIN** index (2 MB) kept time-range queries fast because rows are inserted in time order. A «jsonb» attributes column got a GIN index with «jsonb_path_ops», turning 40 s filters into 80 ms.`,
ex: `CREATE INDEX ON events USING brin (created_at) WITH (pages_per_range = 64);
CREATE INDEX ON products USING gin (attrs jsonb_path_ops);
SELECT * FROM products WHERE attrs @> '{"brand":"boat"}';
CREATE INDEX ON docs USING hnsw (embedding vector_cosine_ops);`,
pit: [`BRIN on randomly ordered data.`, `GIN on write-heavy tables without considering update cost.`, `Indexing jsonb with a B-tree and expecting «@>» to use it.`],
q: [`When is BRIN a great fit?`, `Very large tables where the column correlates with physical order, like append-only timestamps.`]
},
"Partial and covering indexes": {
d: `A **partial index** includes only rows matching a WHERE clause. If 99% of orders are COMPLETED and queries look for PENDING ones, «CREATE INDEX ... WHERE status = 'PENDING'» is tiny, stays in memory, and is cheap to maintain. The query's WHERE must imply the index predicate.

A **covering index** («INCLUDE (cols)») stores extra columns in the leaf pages without making them part of the key. Then the query can be answered from the index alone: an **Index Only Scan**, which skips the heap, as long as the **visibility map** says pages are all-visible (so keep vacuum healthy).

Also useful: **expression indexes** («lower(email)», «(payload->>'merchant')») and **unique partial indexes** (one active subscription per user).`,
life: `A partial index is a separate "pending tasks" list instead of searching the full history. A covering index is a phone list that also shows each person's address, so you don't have to look them up in another book.`,
work: `A retry worker ran «SELECT id, attempts FROM payments WHERE status='FAILED' AND next_retry_at < now()» every 5 s on a 900 M row table. A partial covering index «(next_retry_at) INCLUDE (attempts) WHERE status='FAILED'» was 60 MB instead of 28 GB and gave Index Only Scans at 2 ms.`,
ex: `CREATE INDEX CONCURRENTLY idx_pay_retry ON payments (next_retry_at)
  INCLUDE (attempts) WHERE status = 'FAILED';
CREATE UNIQUE INDEX one_active_sub ON subscriptions (user_id) WHERE active;
CREATE INDEX ON users (lower(email));
EXPLAIN (ANALYZE) SELECT id, attempts FROM payments
WHERE status='FAILED' AND next_retry_at < now();`,
pit: [`Query predicate not matching the index predicate (e.g. parameterised status).`, `Expecting Index Only Scan on tables with a stale visibility map.`, `Forgetting CONCURRENTLY on production tables.`],
q: [`Why might an index-only scan still read the heap?`, `For pages not marked all-visible in the visibility map, Postgres must check the heap tuple's visibility.`]
},
"Read EXPLAIN ANALYZE": {
d: `«EXPLAIN» shows the plan with **estimates**; «EXPLAIN (ANALYZE, BUFFERS)» runs it and shows **actual** time, rows, loops and buffer hits/reads. Read it inside-out (deepest indented node first).

What to look for:
- **rows estimated vs actual**: a 100× gap means bad statistics or correlated columns; the planner chose based on wrong numbers.
- **loops**: actual time and rows are per loop; multiply. A Nested Loop inner side running 1 M loops is the classic disaster.
- **Buffers: shared read** (disk) vs **hit** (cache).
- Scan types: Seq Scan, Index Scan, Index Only Scan (check Heap Fetches), Bitmap Heap Scan (Recheck, lossy).
- Join types: Nested Loop (small outer), Hash Join (watch **Batches > 1** = spilled), Merge Join.
- Sort: «Sort Method: external merge Disk» means «work_mem» too small.`,
life: `A delivery app showing the predicted vs actual time for every leg of a trip. Where prediction and reality differ wildly is where the planner made a bad choice.`,
work: `A report query took 4 minutes. EXPLAIN ANALYZE showed a Nested Loop with the inner Index Scan executed **2.3 M loops**; the outer side was estimated at 120 rows. Columns «city» and «pincode» were correlated. «CREATE STATISTICS (dependencies) ON city, pincode» + ANALYZE fixed the estimate; the plan switched to a Hash Join: 4 min → 3 s.`,
ex: `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT o.* FROM orders o JOIN users u ON u.id = o.user_id
WHERE u.city = 'Hyderabad' AND u.pincode = '500049';
-- Nested Loop (rows=120) (actual rows=2300000 loops=1)
CREATE STATISTICS u_city_pin (dependencies) ON city, pincode FROM users;
ANALYZE users;`,
pit: [`Running EXPLAIN ANALYZE on a DELETE/UPDATE without a transaction (it really executes).`, `Ignoring loops when reading per-node times.`, `Looking only at total time instead of estimate errors.`],
q: [`A Hash Join shows «Batches: 16». What does it mean?`, `The hash table didn't fit in work_mem and spilled to disk in 16 batches; raise work_mem for that query or reduce input.`]
},
"Connections are processes": {
d: `Postgres forks a **backend process** per connection. Each has its own memory (catalog caches, plan caches, plus «work_mem» per sort/hash *operation*) and takes part in snapshot and lock bookkeeping. Thousands of mostly-idle connections waste RAM, slow snapshot computation and cause context-switch overhead; «max_connections» in the thousands is a smell.

The fix is a **connection pooler**: **PgBouncer** in **transaction mode** maps thousands of client connections onto a few dozen server connections, reusing a server connection per transaction. Trade-off: session state doesn't survive across transactions (SET, advisory locks, temp tables, and server-side prepared statements before PgBouncer 1.21).

Rule of thumb for active server connections: a small multiple of CPU cores (e.g. 2–4× cores).`,
life: `A bank with one dedicated clerk per customer, even those just sitting in the lobby, vs a token system where a few clerks serve whoever is ready.`,
work: `A Kubernetes app scaled to 120 pods × 20 pool size = 2,400 connections on a 16-core DB. RAM was exhausted and throughput dropped during peaks. Putting PgBouncer (transaction mode, «default_pool_size=40») in front cut server connections to 40 and p99 latency halved.`,
ex: `; pgbouncer.ini
[databases]
payments = host=10.0.1.5 dbname=payments
[pgbouncer]
pool_mode = transaction
max_client_conn = 5000
default_pool_size = 40
-- check
SELECT state, count(*) FROM pg_stat_activity GROUP BY 1;`,
pit: [`Raising max_connections instead of pooling.`, `Session features (SET, LISTEN, temp tables) behind transaction pooling.`, `Large work_mem × many connections → OOM.`],
q: [`Why can 2,000 idle connections still hurt performance?`, `Each is a process with memory, and every snapshot must scan all backends' state; overhead grows with connection count.`]
},
"What a heap page looks like": {
d: `A table (heap) is a set of **8 KB pages** in 1 GB segment files. Each page:
- **Page header** (24 bytes): LSN of last change, checksums, free space pointers.
- **Line pointer array** (4 bytes each) growing from the front.
- **Tuples** growing from the end; free space in between.
- Optional special space (used by indexes).

A tuple's address is the **ctid** «(block, item)». Each tuple has a ~23-byte header (xmin, xmax, infomask flags, etc.) plus alignment padding, then the data. Indexes point to ctids. Values over ~2 KB are compressed and/or moved to a **TOAST** table.

Knowing this explains: per-row overhead (~28+ bytes), why column order affects padding, and why HOT updates keep ctid chains on the same page.`,
life: `A page in a register: an index of line numbers at the top, entries written from the bottom up, and each entry stamped with "who wrote it" and "who crossed it out".`,
work: `A table with 2 billion narrow rows (a bigint, a smallint, a bigint, a boolean) used 140 GB. Reordering columns to bigint, bigint, smallint, boolean removed alignment padding and saved ~12% space (17 GB) on the rebuilt table.`,
ex: `CREATE EXTENSION pageinspect;
SELECT * FROM page_header(get_raw_page('orders', 0));
SELECT lp, t_xmin, t_xmax, t_ctid FROM heap_page_items(get_raw_page('orders', 0)) LIMIT 5;
SELECT ctid, * FROM orders LIMIT 3;`,
pit: [`Using ctid as a stable row id (it changes on update/vacuum full).`, `Ignoring per-tuple overhead when sizing narrow tables.`, `Storing huge JSON blobs and being surprised by TOAST reads.`],
q: [`Why is a 10-byte row much larger than 10 bytes on disk?`, `Each tuple has a ~23-byte header, a 4-byte line pointer and alignment padding.`]
},
"When autovacuum runs": {
d: `Autovacuum launcher wakes every «autovacuum_naptime» (1 min) and starts up to «autovacuum_max_workers» (3) workers. A table is vacuumed when:

«dead tuples > autovacuum_vacuum_threshold (50) + autovacuum_vacuum_scale_factor (0.2) × reltuples»

Since PG13, also on **inserts** («autovacuum_vacuum_insert_threshold/scale_factor») so append-only tables get their visibility map set and are frozen. **Analyze** runs when changed rows exceed «autovacuum_analyze_threshold + 0.1 × reltuples».

Workers are throttled by **cost-based delay**: they accumulate cost per page (hit/miss/dirty) and sleep after «autovacuum_vacuum_cost_limit» (200 by default via vacuum_cost_limit). On fast SSDs that's far too gentle; raise it so vacuum keeps up.`,
life: `A cleaning crew of three that checks the building every minute, cleans a floor once it's 20% messy, and is told to take breaks after every few rooms so they don't disturb office work.`,
work: `With 3 workers and default cost limits, a DB with 400 busy tables always had a queue; big tables waited hours. Setting «autovacuum_max_workers=6», «autovacuum_vacuum_cost_limit=3000», and per-table scale factors for the 10 largest tables kept dead tuples under 5%.`,
ex: `ALTER SYSTEM SET autovacuum_max_workers = 6;            -- needs restart
ALTER SYSTEM SET autovacuum_vacuum_cost_limit = 3000;
ALTER TABLE events SET (autovacuum_vacuum_insert_scale_factor = 0.02);
SELECT relname, n_dead_tup, n_ins_since_vacuum, last_autovacuum, last_autoanalyze
FROM pg_stat_user_tables ORDER BY n_dead_tup DESC LIMIT 10;
SELECT * FROM pg_stat_progress_vacuum;`,
pit: [`More workers without raising cost limit (they share it).`, `Default thresholds on billion-row tables.`, `Forgetting ANALYZE after bulk loads (stale plans).`],
q: [`Table has 100 M rows, defaults. How many dead tuples before autovacuum?`, `50 + 0.2 × 100 M ≈ 20 M dead tuples.`]
},
"Table locks and the lock queue": {
d: `Every statement takes a **table-level lock** mode. SELECT: ACCESS SHARE. INSERT/UPDATE/DELETE: ROW EXCLUSIVE. CREATE INDEX (non-concurrent): SHARE (blocks writes). Most ALTER TABLE: **ACCESS EXCLUSIVE** (blocks everything, even SELECT).

Lock requests wait in a **FIFO queue**. If an ALTER TABLE waits behind a long SELECT, every new query on that table queues **behind the ALTER**, even plain SELECTs that are compatible with the running one. A 1-second DDL can cause a multi-minute outage this way.

Defences: «SET lock_timeout = '3s'» before DDL and retry; use «CREATE INDEX CONCURRENTLY», «ADD CONSTRAINT ... NOT VALID» then «VALIDATE CONSTRAINT»; add columns with constant defaults (instant since PG11).`,
life: `A single-lane bridge. A truck (ALTER) needs the whole bridge, so it waits for one slow cyclist to finish crossing. Meanwhile every car arriving after the truck queues behind it, even though they could have shared the lane with the cyclist.`,
work: `A migration «ALTER TABLE payments ADD COLUMN ... » ran during the day. A 20-minute analytics query held ACCESS SHARE; the ALTER waited; within seconds 800 API queries piled up behind it and the app hit pool timeouts. The new migration policy: «lock_timeout = 5s», retry loop, and no long queries on the primary.`,
ex: `SET lock_timeout = '5s';
ALTER TABLE payments ADD COLUMN risk_score int;      -- retry on timeout
CREATE INDEX CONCURRENTLY idx_pay_mid ON payments (merchant_id);
ALTER TABLE payments ADD CONSTRAINT fk_m FOREIGN KEY (merchant_id)
  REFERENCES merchants(id) NOT VALID;
ALTER TABLE payments VALIDATE CONSTRAINT fk_m;
SELECT pid, pg_blocking_pids(pid), wait_event_type, query FROM pg_stat_activity
WHERE wait_event_type = 'Lock';`,
pit: [`DDL without lock_timeout.`, `Plain CREATE INDEX on a hot table.`, `Long transactions holding locks while idle.`],
q: [`Why does a waiting ALTER block new SELECTs?`, `Lock requests queue FIFO; new SELECTs conflict with the queued ACCESS EXCLUSIVE request, so they wait behind it.`]
},
"Costs and statistics": {
d: `The planner estimates a **cost** for each candidate plan from page reads and CPU work:
- «seq_page_cost» 1.0, «random_page_cost» 4.0 (set ~1.1 on SSD/cloud storage, otherwise index scans look too expensive),
- «cpu_tuple_cost», «cpu_index_tuple_cost», «cpu_operator_cost»,
- «effective_cache_size»: how much the OS + shared_buffers likely cache (affects index scan costing).

Row counts come from **statistics** gathered by ANALYZE into «pg_statistic» (view «pg_stats»): null fraction, n_distinct, **most common values** and frequencies, **histogram** bounds, correlation. Sample size grows with «default_statistics_target» (100); raise it per column for skewed data.

By default columns are assumed **independent**; **extended statistics** («CREATE STATISTICS» dependencies, ndistinct, mcv) model correlated columns.`,
life: `A cab app estimating fare from distance and traffic history. If it thinks your area has no traffic (bad stats) or that highways are as slow as lanes (bad cost settings), it picks the wrong route.`,
work: `On AWS RDS gp3, queries kept choosing sequential scans over a selective index. «random_page_cost» was still 4. Setting it to 1.1 made the planner pick index scans; a set of merchant lookups went from 1.2 s to 15 ms. Separately, a skewed «merchant_id» needed «ALTER COLUMN ... SET STATISTICS 1000» so the top merchants appeared in the MCV list.`,
ex: `ALTER SYSTEM SET random_page_cost = 1.1;
ALTER SYSTEM SET effective_cache_size = '48GB';
SELECT pg_reload_conf();
ALTER TABLE payments ALTER COLUMN merchant_id SET STATISTICS 1000;
ANALYZE payments;
SELECT most_common_vals, most_common_freqs FROM pg_stats
WHERE tablename='payments' AND attname='merchant_id';`,
pit: [`HDD-era random_page_cost on SSDs.`, `Not analyzing after big loads.`, `Ignoring correlated columns.`],
q: [`What does lowering random_page_cost from 4 to 1.1 change?`, `Index scans (random reads) look cheaper relative to sequential scans, so the planner uses indexes more often.`]
},
"Durability levels": {
d: `«synchronous_commit» decides what COMMIT waits for:
- «off»: returns before WAL is flushed locally. A crash can lose the last ~«3 × wal_writer_delay» of commits (no corruption, just lost recent transactions).
- «local»: local WAL flushed.
- «on» (default): local flush, and if synchronous standbys are configured, the standby has **flushed** it.
- «remote_write»: standby received and written to OS (not fsynced).
- «remote_apply»: standby has **applied** it, so reads on the standby see it.

«synchronous_standby_names» chooses which standbys count: «FIRST 1 (s1, s2)» or quorum «ANY 1 (s1, s2, s3)». It can be set **per transaction**, so you can pay sync latency only for critical writes.`,
life: `Sending a courier: "off" is dropping the parcel at the counter and leaving; "on" waits for the receipt; "remote_apply" waits until the recipient has unpacked and shelved it.`,
work: `A payments DB used synchronous replication to a standby in another AZ (+2 ms per commit). Bulk telemetry inserts on the same cluster didn't need that: they set «SET LOCAL synchronous_commit = off» in those transactions, doubling their throughput while payment commits stayed fully durable. Read-your-writes on replicas used «remote_apply» for one critical flow.`,
ex: `ALTER SYSTEM SET synchronous_standby_names = 'ANY 1 (standby_a, standby_b)';
BEGIN;
SET LOCAL synchronous_commit = off;     -- only this transaction
INSERT INTO telemetry ...;
COMMIT;`,
pit: [`One synchronous standby and no quorum: if it dies, commits hang.`, `Using synchronous_commit=off for money movement.`, `Confusing "off" with "fsync=off" (which can corrupt data).`],
q: [`What can you lose with synchronous_commit=off after a crash?`, `The most recent few hundred ms of committed transactions; the database stays consistent.`]
}
});
