QUEST.deep("mysql", {
"The table IS the primary key index": {
d: `InnoDB tables are **index-organised**: the table is a B+tree ordered by the **primary key**, and the leaf pages contain the full rows. There's no separate heap. If you don't define a PK, InnoDB uses the first non-null unique key or creates a hidden 6-byte row id.

Every **secondary index** leaf stores the indexed columns **plus the PK value**. A lookup by secondary index finds the PK, then does a second B-tree search in the clustered index (a "bookmark lookup"). So:
- A big PK (UUID string, composite of 4 columns) makes **every** secondary index bigger.
- **Random PKs** (UUIDv4) insert into random leaf pages → page splits, fragmentation, poor cache locality. Sequential PKs (auto-increment, UUIDv7, ULID) append to the right edge.
- Range scans on the PK are very fast because rows are physically ordered by it.`,
life: `A phone directory sorted by name where each entry has the full address (clustered). A separate "by street" index lists street + name, and you look the name up again in the main directory to get the full details.`,
work: `A «payment_events» table used «CHAR(36) UUID» PKs. Inserts slowed as the table hit 800 M rows; the buffer pool was full of half-empty pages from splits, and 5 secondary indexes each carried 36-byte PKs. Moving to «BIGINT AUTO_INCREMENT» PK (UUID kept as a unique secondary column) cut table+index size by 40% and insert latency by 3×.`,
ex: `CREATE TABLE payment_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_uuid BINARY(16) NOT NULL UNIQUE,     -- store UUID compactly
  merchant_id BIGINT NOT NULL,
  created_at DATETIME(3) NOT NULL,
  KEY idx_merchant_time (merchant_id, created_at)
) ENGINE=InnoDB;`,
pit: [`Random UUID strings as PK on write-heavy tables.`, `Wide composite PKs bloating every index.`, `Tables without explicit PK (hidden row id, also bad for replication).`],
q: [`Why does a wide primary key make secondary indexes bigger?`, `Every secondary index entry stores the full PK value as its pointer to the row.`]
},
"Buffer pool": {
d: `The **buffer pool** caches 16 KB data and index pages. Reads check it first; misses read from disk. Writes modify pages **in memory** (making them dirty) and log the change to the **redo log**; page flushing happens later in the background, which is what makes writes fast and still durable.

It's managed with a **midpoint-insertion LRU**: new pages go into the "old" sublist (3/8 of the pool) and only move to the "young" part if accessed again after «innodb_old_blocks_time» (1 s). That protects hot data from being evicted by one big table scan or mysqldump.

Size: «innodb_buffer_pool_size» ≈ 50–75% of RAM on a dedicated server; split into «innodb_buffer_pool_instances» to reduce mutex contention. Watch the **hit ratio** (should be > 99% for OLTP) and free/dirty page counts.`,
life: `A chef's counter: ingredients in use stay within arm's reach (buffer pool). Getting something from the cold storage (disk) is slow. One-time items from a big delivery are placed at the back of the counter so they don't push the everyday spices away.`,
work: `An RDS MySQL instance with 64 GB RAM had «innodb_buffer_pool_size» left at a small custom value of 8 GB after a migration. Read IOPS were maxed at 12k and p99 at 300 ms. Setting it to 48 GB raised hit ratio from 92% to 99.7%, and IOPS dropped to 1.5k.`,
ex: `SHOW VARIABLES LIKE 'innodb_buffer_pool_size';
SHOW ENGINE INNODB STATUS\\G      -- BUFFER POOL AND MEMORY section
SELECT (1 - (SELECT VARIABLE_VALUE FROM performance_schema.global_status WHERE VARIABLE_NAME='Innodb_buffer_pool_reads')
        / (SELECT VARIABLE_VALUE FROM performance_schema.global_status WHERE VARIABLE_NAME='Innodb_buffer_pool_read_requests')) AS hit_ratio;
SET GLOBAL innodb_buffer_pool_size = 48*1024*1024*1024;   -- resizable online`,
pit: [`Leaving the default (128 MB) on a production server.`, `Setting it so large the OS swaps.`, `Ignoring warm-up after restarts (use buffer pool dump/load).`],
q: [`Why doesn't a full table scan wipe out the hot pages?`, `New pages enter the old sublist and only become young if re-accessed after innodb_old_blocks_time; a one-pass scan stays in the old part.`]
},
"Composite indexes: leftmost prefix": {
d: `A composite index on «(a, b, c)» is sorted by a, then b within a, then c within b. MySQL can **seek** using any **leftmost prefix**: «a», «a,b», «a,b,c». It can't seek on «b» alone or «c» alone (MySQL 8 has **skip scan** for some cases, but don't rely on it).

Order the columns: **equality predicates first**, then the **range** column, then columns for ORDER BY or covering. Once a range condition is used («b > 10»), columns after it can't be used for seeking (only for filtering via index condition pushdown).

Example: «WHERE merchant_id = ? AND status = ? AND created_at >= ? ORDER BY created_at» → index «(merchant_id, status, created_at)» seeks directly and returns rows already ordered, no filesort.`,
life: `A phone book sorted by city, then surname, then first name. Finding "Hyderabad, Reddy" is fast. Finding everyone named "Ravi" anywhere means reading the whole book.`,
work: `A merchant dashboard query «WHERE merchant_id=? AND created_at BETWEEN ? AND ? AND status='SUCCESS'» used index «(merchant_id, created_at, status)»: the range on created_at stopped status from being used to seek, scanning 2 M rows per call. Reordering to «(merchant_id, status, created_at)» scanned 40k rows; latency 1.8 s → 25 ms.`,
ex: `ALTER TABLE payments ADD INDEX idx_m_s_t (merchant_id, status, created_at), ALGORITHM=INPLACE, LOCK=NONE;
EXPLAIN SELECT id, amount FROM payments
WHERE merchant_id = 9 AND status = 'SUCCESS'
  AND created_at >= '2026-11-01' ORDER BY created_at LIMIT 50;`,
pit: [`Putting the range column before equality columns.`, `Creating (a), (a,b), (a,b,c) separately (redundant).`, `Functions on indexed columns («DATE(created_at) = ...») blocking seeks.`],
q: [`Index (a, b, c). Query «WHERE b = 1 AND c = 2». Can it seek?`, `Not normally: the leftmost column a isn't constrained (only skip scan could help if a has few distinct values).`]
},
"Read EXPLAIN": {
d: `Key columns in MySQL's EXPLAIN:
- **type** (best → worst): system/const (PK lookup), eq_ref (one row per join row by unique key), ref (non-unique lookup), range, index (full index scan), **ALL** (full table scan).
- **key**: index actually used; **possible_keys**: candidates.
- **key_len**: how many bytes of a composite index are used (tells you how many columns were used for seeking).
- **rows** × **filtered**: estimated rows examined and % passing conditions.
- **Extra**: «Using index» (covering), «Using where», «Using index condition» (ICP), **«Using filesort»**, **«Using temporary»** (both often costly).

«EXPLAIN ANALYZE» (8.0.18+) runs the query and prints actual times and row counts per iterator, like Postgres.`,
life: `Reading a restaurant's order ticket to see how your dish will be made: "from the fridge, ready" (const), "chop fresh" (range) or "check every item in the store" (ALL).`,
work: `A refunds API had «type: index, key: PRIMARY, rows: 48M, Extra: Using where» because the query did «ORDER BY id DESC LIMIT 20» with a filter on «merchant_id». MySQL chose to walk the PK backwards hoping to find matches fast; for small merchants it read millions of rows. Adding «(merchant_id, id)» made it «type: ref» with 20 rows read.`,
ex: `EXPLAIN FORMAT=TREE
SELECT * FROM refunds WHERE merchant_id = 77 ORDER BY id DESC LIMIT 20;
EXPLAIN ANALYZE
SELECT * FROM refunds WHERE merchant_id = 77 ORDER BY id DESC LIMIT 20;`,
pit: [`Trusting «rows» as exact (it's an estimate).`, `Ignoring key_len and assuming all index columns are used.`, `Missing «Using filesort» on high-QPS queries.`],
q: [`key_len shows 8 on an index (bigint a, bigint b, datetime c). What does that tell you?`, `Only the first column (a, 8 bytes) is used for seeking.`]
},
"MVCC and isolation": {
d: `InnoDB keeps old row versions in **undo logs**. A **consistent read** (plain SELECT) uses a **read view**: the set of transactions active at its start. If a row's latest version is too new, InnoDB follows the undo chain back to a visible version.

Default isolation is **REPEATABLE READ**: the read view is created at the first read and reused for the whole transaction, so repeated SELECTs see the same data. **READ COMMITTED** creates a fresh read view per statement and uses fewer gap locks (popular for high-write OLTP).

But **locking reads** («SELECT ... FOR UPDATE / FOR SHARE»), UPDATE and DELETE read the **latest committed** version and lock it, not the snapshot. Long transactions keep old undo alive: the **history list length** grows and the purge thread falls behind, slowing everything.`,
life: `Taking a photocopy of the stock register when you start your shift (snapshot). You read from your copy all day. But to actually take an item off the shelf (locking read), you must check the live shelf.`,
work: `A batch job opened a transaction, read 10 M rows over 40 minutes, then committed. During that time «History list length» grew to 6 M and OLTP queries slowed by 4× because consistent reads walked long undo chains. Splitting the job into 10k-row transactions (keyset pagination) kept history length under 5k.`,
ex: `SELECT @@transaction_isolation;
SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;
SHOW ENGINE INNODB STATUS\\G      -- "History list length 6123456"
SELECT * FROM accounts WHERE id = 7 FOR UPDATE;   -- latest version, locked`,
pit: [`Long-running transactions (even read-only ones under RR).`, `Assuming SELECT ... FOR UPDATE sees the snapshot.`, `Read-modify-write without locking (lost updates).`],
q: [`Under REPEATABLE READ, can a plain SELECT and a SELECT ... FOR UPDATE in the same transaction return different values?`, `Yes. The plain SELECT reads the snapshot; FOR UPDATE reads and locks the latest committed version.`]
},
"Next-key and gap locks": {
d: `InnoDB locks **index records**, not rows in the abstract. Under REPEATABLE READ, locking reads and DML on a range take **next-key locks**: a lock on the record **plus the gap before it**. Gap locks stop other transactions from inserting into the range, preventing **phantoms** (new rows appearing in a re-run range query).

Because locks are on the index that was scanned, a locking statement with **no usable index** scans the clustered index and locks every row it touches (effectively the table). Unique-index equality lookups for an existing row lock only that record (no gap).

Gap locks are compatible with each other (they only block inserts), and that's a common deadlock source: two transactions hold gap locks on the same gap and both try to insert into it.`,
life: `Reserving seats 10–20 in a cinema also blocks anyone from adding a folding chair between them. If you didn't specify seat numbers (no index), staff block the whole hall.`,
work: `«UPDATE orders SET flagged=1 WHERE customer_email='x@y.com'» had no index on email. Under RR it locked every row it scanned (the whole 30 M row table) for 8 seconds, blocking checkout inserts. Adding the index (and switching that service to READ COMMITTED) reduced locks to a handful of rows.`,
ex: `-- session 1
START TRANSACTION;
SELECT * FROM orders WHERE amount BETWEEN 100 AND 200 FOR UPDATE;
-- session 2 blocks: INSERT INTO orders (amount) VALUES (150);
SELECT * FROM performance_schema.data_locks\\G   -- LOCK_MODE: X,GAP / X / X,REC_NOT_GAP`,
pit: [`Locking statements on unindexed columns.`, `Assuming RR doesn't lock ranges.`, `Concurrent "check then insert" patterns using gap locks (deadlocks).`],
q: [`Why can an UPDATE with a WHERE on an unindexed column block unrelated inserts?`, `It scans and locks every clustered-index record (and gaps) it reads, effectively the whole table.`]
},
"Deadlocks": {
d: `A deadlock happens when transactions wait on each other in a cycle: T1 holds lock A and wants B, T2 holds B and wants A. InnoDB's detector («innodb_deadlock_detect») spots cycles immediately and rolls back the transaction with less work (fewer undo records), returning **error 1213**. If detection is off, «innodb_lock_wait_timeout» (50 s) eventually breaks the wait (error 1205).

Deadlocks are normal in busy OLTP; the goal is to make them **rare and harmless**:
- Access rows in a **consistent order** (e.g. sort ids before updating).
- Keep transactions **short**; no network calls inside.
- Index the columns in WHERE so fewer rows/gaps are locked.
- Consider READ COMMITTED to avoid gap locks.
- **Retry** the transaction on 1213 in application code.`,
life: `Two people in a narrow corridor, each waiting for the other to step aside. A manager (detector) tells one of them to walk back so the other can pass.`,
work: `A wallet transfer service updated sender then receiver. Transfers A→B and B→A at the same time deadlocked ~40 times a minute during a cashback campaign. Fix: always lock the lower account id first («SELECT ... WHERE id IN (a,b) ORDER BY id FOR UPDATE»), plus a 3-attempt retry with jitter. Deadlocks dropped to near zero.`,
ex: `SHOW ENGINE INNODB STATUS\\G   -- LATEST DETECTED DEADLOCK section
SET GLOBAL innodb_print_all_deadlocks = ON;    -- log every deadlock
-- consistent order
SELECT id FROM accounts WHERE id IN (17, 42) ORDER BY id FOR UPDATE;
UPDATE accounts SET bal = bal - 100 WHERE id = 17;
UPDATE accounts SET bal = bal + 100 WHERE id = 42;`,
pit: [`No retry logic for 1213.`, `HTTP calls inside DB transactions.`, `Treating every deadlock as a bug to eliminate rather than to make rare.`],
q: [`Which transaction does InnoDB roll back in a deadlock?`, `Usually the one with less work done (smaller undo), to minimise rollback cost.`]
},
"How replication works": {
d: `The source writes every committed transaction to the **binary log** (binlog), in «ROW» format by default (row images, not SQL text). On each replica:
1. The **I/O (receiver) thread** connects to the source, reads binlog events and writes them to the local **relay log**.
2. The **SQL (applier) threads** read the relay log and apply events.

Replication is **asynchronous** by default: the source commits without waiting. **Semi-sync** makes the source wait until at least one replica has received (not applied) the event. **GTIDs** («server_uuid:N») uniquely identify transactions so replicas know exactly what they've applied, making failover and re-pointing replicas easy («SOURCE_AUTO_POSITION=1»).

Lag («Seconds_Behind_Source») comes from slow applying: big transactions, single-threaded applier, missing PKs on replica tables.`,
life: `A head office writes every transaction into a register (binlog). Branch clerks photocopy new pages (I/O thread) into their own folder (relay log), and another clerk enters them into the branch books (SQL thread).`,
work: `A nightly «DELETE FROM logs WHERE created_at < ...» deleted 40 M rows in one statement; with ROW binlogs, the replica had to apply 40 M row events in one transaction, and lag hit 3 hours, breaking read-after-write for the app. Chunking the delete into 10k-row batches kept lag under 5 seconds.`,
ex: `-- on replica
SHOW REPLICA STATUS\\G   -- Replica_IO_Running, Replica_SQL_Running, Seconds_Behind_Source
CHANGE REPLICATION SOURCE TO SOURCE_HOST='10.0.0.5', SOURCE_AUTO_POSITION=1;
-- chunked purge on source
DELETE FROM logs WHERE created_at < '2026-08-01' ORDER BY id LIMIT 10000;`,
pit: [`Huge single transactions (replica lag and binlog bloat).`, `Tables without PKs (row apply does full scans per row event).`, `Reading from replicas right after writes without handling lag.`],
q: [`Semi-sync replication: does the source wait until the replica has applied the transaction?`, `No, only until at least one replica has received and written it to its relay log.`]
},
"Online schema changes": {
d: `MySQL 8 ALTER algorithms:
- **INSTANT**: metadata-only changes, done in milliseconds: adding a column (any position since 8.0.29), renaming columns, changing defaults, dropping a column (8.0.29+).
- **INPLACE**: rebuilds or modifies without copying to a new table, mostly allowing concurrent DML («LOCK=NONE»): adding secondary indexes, many column changes. Still heavy I/O and causes replica lag (the replica applies it after the source finishes).
- **COPY**: creates a new table and copies rows, blocking writes. Changing a column's data type usually needs this.

For big tables, tools like **gh-ost** (reads the binlog, copies rows in chunks to a ghost table, then atomically swaps) or **pt-online-schema-change** (triggers) do it with throttling and no long locks. Always request explicit «ALGORITHM» and «LOCK» so MySQL errors instead of silently doing a blocking copy.`,
life: `Renovating a busy shop. Repainting the sign (instant) takes a minute. Rearranging shelves while open (inplace) is slow but customers keep shopping. Moving to a new building (copy) needs a temporary shop and a quick switchover (gh-ost).`,
work: `Changing «amount INT» to «BIGINT» on a 1.2 TB «transactions» table needed a COPY. Using gh-ost with «--max-load=Threads_running=50» and «--max-lag-millis=1500» took 19 hours online, throttling automatically during peak; the final cut-over lock lasted 2 seconds.`,
ex: `ALTER TABLE transactions ADD COLUMN risk_tag VARCHAR(16), ALGORITHM=INSTANT;
ALTER TABLE transactions ADD INDEX idx_rt (risk_tag), ALGORITHM=INPLACE, LOCK=NONE;
gh-ost --database=pay --table=transactions \\
  --alter="MODIFY amount BIGINT NOT NULL" \\
  --max-load=Threads_running=50 --max-lag-millis=1500 --execute`,
pit: [`Running ALTER without ALGORITHM/LOCK and getting a silent table copy.`, `Forgetting the replica must replay the whole INPLACE ALTER (lag).`, `Cutting over gh-ost during peak traffic.`],
q: [`Why can an INPLACE ALTER that took 2 hours on the source cause 2 hours of replica lag?`, `The replica applies the ALTER only after receiving it, and it blocks the SQL thread while running (unless parallel apply helps).`]
},
"16 KB pages and tree height": {
d: `Every InnoDB index is a **B+tree of 16 KB pages**. Internal (non-leaf) pages hold keys and child page numbers; leaf pages of the clustered index hold full rows, leaf pages of secondary indexes hold key + PK.

Because internal entries are small (a BIGINT key + 6-byte pointer ≈ 14 bytes), each internal page has **~1,000+ children**. That fan-out keeps trees shallow:
- height 2: ~1,000 leaf pages,
- height 3: ~1 M leaf pages (tens of millions of rows),
- height 4: billions of rows.

So a PK lookup on a billion-row table is ~4 page reads, and the top levels are almost always in the buffer pool. Big keys (long strings, UUID text) reduce fan-out and add levels. Page splits on random inserts leave pages ~50% full, wasting space.`,
life: `A library: one directory sign points to 1,000 aisles, each aisle sign points to 1,000 shelves. You find any of a billion books by reading three or four signs.`,
work: `Interview question in practice: "Why is a PK lookup on our 2 B row table still ~1 ms?" Height ≈ 4; the root and level-2 pages are cached, so typically 1 disk read at most. When the team switched to a 64-byte string PK, fan-out dropped ~4× and indexes grew 30%, adding a level for some secondary indexes.`,
ex: `-- approximate pages and size
SELECT index_name, stat_value AS pages FROM mysql.innodb_index_stats
WHERE table_name = 'payments' AND stat_name = 'size';
SELECT stat_value FROM mysql.innodb_index_stats
WHERE table_name='payments' AND index_name='PRIMARY' AND stat_name='n_leaf_pages';`,
pit: [`Long string keys reducing fan-out.`, `Random inserts causing splits and half-empty pages.`, `Assuming a lookup cost grows linearly with table size (it's logarithmic).`],
q: [`Roughly how many page reads for a PK lookup in a 1 B row table?`, `About 3–4 (tree height), with upper levels usually cached.`]
},
"Redo, checkpoints and LSN": {
d: `Every change to a page gets a **log sequence number (LSN)**, a byte position in the redo stream. The change is written to the **redo log** (in MySQL 8.0.30+, files in «#innodb_redo») before the dirty page is flushed.

On COMMIT, with «innodb_flush_log_at_trx_commit=1», the redo is written and fsynced, so the commit survives a crash. «2» writes to OS cache each commit and fsyncs once per second (OS crash can lose ~1 s); «0» flushes per second from InnoDB (mysqld crash can lose ~1 s).

The **checkpoint LSN** is the point up to which all dirty pages are on disk. Redo before it can be reused. If the redo capacity («innodb_redo_log_capacity») is too small relative to the write rate, InnoDB must do **aggressive (sync) flushing** to advance the checkpoint, causing stalls. Crash recovery replays redo from the checkpoint LSN.`,
life: `A cashier's running tape (redo). The manager periodically updates the ledger book and marks "ledger correct up to tape position X" (checkpoint). If the tape fills up before the ledger catches up, the cashier must stop and wait.`,
work: `During a bulk load, throughput dropped every few minutes to near zero. INNODB STATUS showed checkpoint age near capacity and "sync flush" activity. Raising «innodb_redo_log_capacity» from 100 MB (old default-based config) to 8 GB and «innodb_io_capacity» to match the SSD removed the stalls.`,
ex: `SHOW VARIABLES LIKE 'innodb_redo_log_capacity';
SET GLOBAL innodb_redo_log_capacity = 8589934592;   -- 8 GB, dynamic in 8.0.30+
SHOW ENGINE INNODB STATUS\\G   -- LOG: Log sequence number, Last checkpoint at
SHOW VARIABLES LIKE 'innodb_flush_log_at_trx_commit';`,
pit: [`Tiny redo logs on write-heavy servers.`, `Setting flush_log_at_trx_commit=2 on financial data without understanding the loss window.`, `Under-set innodb_io_capacity on fast disks.`],
q: [`What happens when the redo log is nearly full of un-checkpointed changes?`, `InnoDB forces aggressive flushing of dirty pages to advance the checkpoint, stalling writes.`]
},
"Which locks a statement takes": {
d: `Rules of thumb under REPEATABLE READ:
- Plain SELECT: **no row locks** (consistent read).
- «SELECT ... FOR SHARE»: S locks; «FOR UPDATE», UPDATE, DELETE: X locks on every **index record scanned**, as next-key locks (record + gap) for ranges and non-unique indexes.
- Unique index, equality, row exists: **record lock only**. Row doesn't exist: a **gap lock** on where it would be.
- INSERT: an **insert intention** gap lock (compatible with other inserts into different positions) then an X record lock; duplicate-key checks take S locks (classic deadlock source with concurrent inserts of the same key).
- Locks are taken on the index used, and if a secondary index is used, the matching clustered records are locked too.

Under READ COMMITTED most gap locks disappear and non-matching rows are unlocked after evaluation.`,
life: `Library rules: browsing needs no permission (plain read); borrowing locks the specific book (record lock); reserving "all books on shelf 4" also stops anyone adding a new book to that shelf (gap).`,
work: `Two workers did «SELECT ... FOR UPDATE WHERE job_id = ?» for a non-existent id, then INSERT it. Both got the same gap lock, then both tried to insert into the gap: deadlock every few seconds. Using «INSERT ... ON DUPLICATE KEY UPDATE» (single statement) removed the check-then-insert race.`,
ex: `SELECT object_name, index_name, lock_type, lock_mode, lock_status, lock_data
FROM performance_schema.data_locks;
-- replace check-then-insert:
INSERT INTO jobs (job_id, state) VALUES (?, 'NEW')
ON DUPLICATE KEY UPDATE state = state;`,
pit: [`SELECT FOR UPDATE on a missing row followed by INSERT.`, `Assuming locks follow WHERE columns rather than scanned index records.`, `Not checking data_locks when debugging lock waits.`],
q: [`What lock does «SELECT ... FOR UPDATE WHERE pk = 5» take if row 5 exists?`, `An exclusive record lock on that one PK record (no gap lock, since it's a unique equality match).`]
},
"How MySQL estimates": {
d: `The optimizer needs row estimates to choose indexes and join order:
- **Index dives**: for ranges («IN (...)», BETWEEN), it reads the B-tree to estimate rows per range. Accurate but costly; above «eq_range_index_dive_limit» (200) values, it falls back to statistics.
- **Persistent index statistics**: cardinality per index prefix from sampling «innodb_stats_persistent_sample_pages» (20) pages; refreshed automatically when ~10% of rows change, or by ANALYZE TABLE.
- **Histograms** (8.0): «ANALYZE TABLE t UPDATE HISTOGRAM ON col» for **non-indexed** columns with skew, used for filtering estimates and join order.

Bad estimates lead to wrong index choices; quick fixes include ANALYZE TABLE, more sample pages, histograms, and (last resort) index hints «FORCE INDEX» or optimizer hints.`,
life: `Estimating the crowd at a stadium by counting people in 20 random rows (sampling). If the crowd is concentrated in one stand, your estimate can be badly off unless you sample more or count by stand (histogram).`,
work: `A query on «status» (99.5% 'DONE', 0.5% 'PENDING') sometimes ignored the status index. Without a histogram, the optimizer assumed uniform distribution. «ANALYZE TABLE jobs UPDATE HISTOGRAM ON status WITH 16 BUCKETS» made estimates accurate for the PENDING lookups.`,
ex: `ANALYZE TABLE jobs;
ALTER TABLE jobs STATS_SAMPLE_PAGES = 200;
ANALYZE TABLE jobs UPDATE HISTOGRAM ON status WITH 16 BUCKETS;
SELECT * FROM information_schema.COLUMN_STATISTICS WHERE TABLE_NAME='jobs';
EXPLAIN SELECT * FROM jobs WHERE status = 'PENDING';`,
pit: [`Huge IN lists exceeding the dive limit and getting poor estimates.`, `Forcing indexes permanently instead of fixing stats.`, `Expecting histograms to be used for indexed column access path choice (they're mainly for non-indexed filters).`],
q: [`Why might an «IN» list with 500 values be planned worse than one with 50?`, `Above eq_range_index_dive_limit, MySQL stops doing index dives and uses less accurate cardinality statistics.`]
},
"Parallel replication with writesets": {
d: `A single applier thread can't keep up with a busy multi-threaded source. Replicas apply in parallel with «replica_parallel_workers» > 0 (default 4 in 8.0.27+), but they must know which transactions are independent.

- **LOGICAL_CLOCK (commit order)**: transactions that committed together in the same group commit on the source can run in parallel. Limited by how much group commit happens.
- **WRITESET** («binlog_transaction_dependency_tracking=WRITESET», default behaviour in 8.4): the source records a hash of every row (PK/unique keys) each transaction modifies. Transactions with **non-overlapping writesets** can be applied in parallel even if they committed at different times.

Keep commit order on the replica («replica_preserve_commit_order=ON») so readers never see a state the source never had.`,
life: `Checkout counters at a mall: orders that touch different products can be packed by different staff at the same time; only orders touching the same item must wait for each other.`,
work: `A replica with 1 applier lagged 40 minutes during sale peaks (source at 9k TPS). Enabling WRITESET and 16 parallel workers brought lag under 2 s, because most transactions touched different orders. One hot «inventory» row still serialized its own updates.`,
ex: `-- source
SET GLOBAL binlog_transaction_dependency_tracking = 'WRITESET';
SET GLOBAL transaction_write_set_extraction = 'XXHASH64';
-- replica
STOP REPLICA SQL_THREAD;
SET GLOBAL replica_parallel_workers = 16;
SET GLOBAL replica_preserve_commit_order = ON;
START REPLICA SQL_THREAD;`,
pit: [`Tables without PK/unique keys (writesets can't be computed, falls back).`, `Hot rows updated by every transaction (serialized anyway).`, `Turning off preserve_commit_order and exposing inconsistent reads.`],
q: [`What makes two transactions safe to apply in parallel with WRITESET?`, `They modified no common rows (no overlap in their PK/unique key hashes).`]
}
});
