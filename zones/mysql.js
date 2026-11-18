QUEST.zone("mysql", {
mission:["ravi","The payments OLTP database is MySQL 8. Checkout latency spikes at sale time and replicas lag. Learn how InnoDB stores, indexes, locks and logs, then fix sale day."],
levels:[
{t:"InnoDB storage", sub:"Clustered index, buffer pool", rounds:[
 ["learn","The table IS the primary key index","InnoDB stores rows in a **B+tree clustered on the primary key**: leaf pages hold full rows. **Secondary indexes** store the indexed columns plus the **primary key**, so a lookup by secondary index does a second lookup in the clustered index."],
 ["pick","Why is a random UUIDv4 primary key bad for big InnoDB tables?",["UUIDs can't be indexed","Random inserts split pages all over the B+tree and bloat secondary indexes","It disables replication","It's not unique"],1,"Prefer auto-increment or time-ordered ids (UUIDv7, ordered binary UUIDs)."],
 ["learn","Buffer pool","InnoDB caches pages in the **buffer pool** (often 50–75% of RAM on a dedicated server). Changes are made in memory (dirty pages) and flushed later; durability comes from the redo log."],
 ["order","What happens on COMMIT (durable settings)",["Changes applied to pages in the buffer pool","Undo records kept for rollback/MVCC","Redo log prepared and fsynced","Binlog written and fsynced","Commit marked in redo (two-phase commit)"],"Redo and binlog agree via internal 2PC."],
 ["match","Logs",[["Redo log","Crash recovery of InnoDB pages"],["Undo log","Rollback and old row versions for MVCC"],["Binlog","Replication and point-in-time recovery, CDC"],["Slow query log","Queries above long_query_time"]],"Three engines of durability, one for tuning."],
 ["tf","Durability",[["innodb_flush_log_at_trx_commit=1 fsyncs redo every commit.",true,"Safest; 2 or 0 can lose up to ~1 s on crash."],["sync_binlog=1 fsyncs the binlog on each commit group.",true,"Use with the redo setting for full durability."],["Dirty pages must be flushed before COMMIT returns.",false,"Redo makes the commit durable; pages flush later."]]]
]},
{t:"Indexes & EXPLAIN", sub:"Leftmost prefix, covering", rounds:[
 ["learn","Composite indexes: leftmost prefix","An index on «(merchant_id, status, created_at)» helps filters on merchant_id; merchant_id + status; or all three. It can't seek on status alone. Equality columns first, then the range column."],
 ["sort","Can the index (merchant_id, status, created_at) be used to seek?",{"Yes":["WHERE merchant_id = 7","WHERE merchant_id = 7 AND status = 'PAID'","WHERE merchant_id = 7 AND status = 'PAID' AND created_at > '2026-11-01'"],"No (or only a scan)":["WHERE status = 'PAID'","WHERE created_at > '2026-11-01'","WHERE DATE(created_at) = '2026-11-17'"]},"Functions on columns and skipping the leading column defeat the index."],
 ["learn","Read EXPLAIN","«type»: const/eq_ref/ref/range are good, «ALL» is a full scan. «key» shows the index used, «rows» the estimate. «Extra: Using index» = covering index (no table lookup); «Using filesort» / «Using temporary» are warnings."],
 ["match","EXPLAIN type",[["const","At most one row by PK/unique"],["ref","Index lookup on non-unique key"],["range","Index range scan"],["ALL","Full table scan"]],"Aim to never see ALL on big tables."],
 ["bug","Which query can't use the index on created_at?",["SELECT id FROM pay WHERE created_at >= '2026-11-17' AND created_at < '2026-11-18'","SELECT id FROM pay WHERE DATE(created_at) = '2026-11-17'","SELECT id FROM pay WHERE created_at BETWEEN '2026-11-17 00:00' AND '2026-11-17 23:59:59'","SELECT id FROM pay ORDER BY created_at DESC LIMIT 10"],1,"DATE() wraps the column. Rewrite as a range (or add a functional index)."],
 ["pick","EXPLAIN shows «Using index». What does it mean?",["Full scan","The index covers all needed columns, no row lookups","Index is being rebuilt","Filesort"],1,"A covering index answers from the index alone."]
]},
{t:"Transactions & locks", sub:"MVCC, gap locks, deadlocks", rounds:[
 ["learn","MVCC and isolation","Default isolation is **REPEATABLE READ**: a consistent snapshot for plain SELECTs, built from undo logs. Locking reads («SELECT … FOR UPDATE», UPDATE, DELETE) lock index records."],
 ["learn","Next-key and gap locks","Under REPEATABLE READ, range locking reads take **next-key locks** (record + gap before it) to prevent phantoms. Locking on a non-indexed column can lock far more rows than you expect."],
 ["pick","UPDATE pay SET status='X' WHERE note LIKE '%x%' (no index on note) in REPEATABLE READ. Risk?",["Locks only matching rows","Scans and locks every row it examines, blocking others","No locks at all","Deadlock guaranteed"],1,"Index the filter column, or batch by primary key."],
 ["match","Isolation levels",[["READ UNCOMMITTED","Dirty reads possible"],["READ COMMITTED","New snapshot per statement, fewer gap locks"],["REPEATABLE READ","One snapshot per transaction (InnoDB default)"],["SERIALIZABLE","Plain SELECTs become locking reads"]],"Many high-write OLTP systems choose READ COMMITTED."],
 ["learn","Deadlocks","InnoDB detects deadlocks and rolls back one transaction. Reduce them: touch rows in a **consistent order**, keep transactions short, index the WHERE columns, and **retry** on error 1213."],
 ["tf","Lock facts",[["Long-running transactions can make the undo history grow.",true,"Purge can't remove versions they might still need."],["SELECT without FOR UPDATE takes row locks in REPEATABLE READ.",false,"Plain reads use the MVCC snapshot."],["Applications should retry deadlocked transactions.",true,"Deadlocks are normal under concurrency."]]]
]},
{t:"Replication & ops", sub:"Binlog, GTID, online DDL", rounds:[
 ["learn","How replication works","The source writes the **binlog**. A replica's I/O thread copies it to a **relay log**; the SQL (applier) threads replay it. **GTIDs** give every transaction a global id so failover and re-pointing are simple.",["Source writes binlog","Replica fetches into relay log","Applier threads replay","Replica catches up"]],
 ["match","Replication options",[["Asynchronous","Source doesn't wait: fastest, can lose last commits on failover"],["Semi-synchronous","Waits for a replica to receive the event"],["Group Replication","Paxos-based group with automatic failover"],["Multi-threaded applier","replica_parallel_workers to cut lag"]],"Pick by how much loss you can tolerate."],
 ["pick","Replica lag spikes during a huge single UPDATE of 50 million rows. Best fix?",["Batch the update by primary key ranges","Add more replicas","STATEMENT binlog format","Turn off GTIDs"],0,"One giant transaction replays as one giant transaction."],
 ["learn","Online schema changes","Many ALTERs are **INSTANT** or **INPLACE** in MySQL 8 (e.g. adding a column instantly). For heavy changes on huge tables, tools like **gh-ost** or **pt-online-schema-change** copy into a shadow table and swap."],
 ["fill","Ask for an instant column add",'ALTER TABLE payments ADD COLUMN risk_score INT NULL, ALGORITHM=___, LOCK=___;',["INSTANT","DEFAULT"],["COPY","EXCLUSIVE","FAST"],"If INSTANT isn't possible, MySQL errors instead of silently copying."]
]},
{t:"Boss: Sale day", boss:true, time:30, rounds:[
 ["pick","Checkout query: WHERE merchant_id=? AND status=? ORDER BY created_at, full scan + filesort. Fix?",["Index (merchant_id, status, created_at)","Index (created_at, status)","Bigger buffer pool only","READ UNCOMMITTED"],0,"Equality first, then the sort/range column."],
 ["pick","Deadlocks between two services updating the same rows. Fix?",["Consistent row order, short transactions, retry on 1213","SERIALIZABLE","Disable deadlock detection","Remove indexes"],0,"Order + retry."],
 ["pick","Replica 20 minutes behind after a backfill. Fix?",["Batch the backfill and enable parallel appliers","Promote it","Use STATEMENT format","Add CPU to source"],0,"Smaller transactions, parallel replay."],
 ["pick","Inserts are slow and index size exploded with random UUID keys. Fix?",["Time-ordered keys (auto-increment / UUIDv7)","More secondary indexes","Bigger redo log only","READ COMMITTED"],0,"Sequential inserts."],
 ["pick","Need to add a nullable column to a 2 TB table at noon. Use…",["ALGORITHM=INSTANT","ALGORITHM=COPY","Dump and reload","Downtime"],0,"Metadata-only change."],
 ["pick","After a crash, a few committed payments were missing. Settings were flush_log_at_trx_commit=2. Fix?",["Set it to 1 and sync_binlog=1","Bigger buffer pool","More replicas","Semi-sync off"],0,"Full durability."]
]}
]});

QUEST.more("mysql", [
{act:"Expert", t:"InnoDB pages & B+trees", sub:"Pages, splits, ICP, AHI", rounds:[
 ["learn","16 KB pages and tree height","InnoDB stores every index as a **B+tree of 16 KB pages**. Internal pages hold keys + child pointers; leaf pages of the clustered index hold **full rows**. High fan-out keeps trees shallow: billions of rows in 3–4 levels.",null,null,`### Fan-out maths
An internal page holds (16 KB ÷ (key size + 6-byte pointer + overhead)) entries: with an 8-byte BIGINT key, roughly 1,000 children. A leaf holding ~100 rows of ~150 bytes:
- 1 level: 100 rows
- 2 levels: 100,000 rows
- 3 levels: 100 million rows
- 4 levels: 100 billion rows
The top levels stay in the buffer pool, so a PK lookup is usually **one or two disk reads**.

### Page splits and fill
Inserting into a full page **splits** it into two half-full pages. Sequential PKs append to the right edge (pages filled ~15/16). Random keys (UUIDv4) split pages everywhere: more pages, more I/O, fragmented indexes. «MERGE_THRESHOLD» merges underfilled pages after deletes.

### Secondary index lookups
Secondary leaves store the index columns + **PK**. «SELECT * WHERE email = ?» does a secondary lookup, then a clustered index lookup by PK. **Wide PKs** bloat every secondary index.

### Executor optimizations
- **Index Condition Pushdown** (ICP): conditions on index columns not usable for seeking are checked in the storage engine before fetching rows («Using index condition»).
- **Multi-Range Read** (MRR): sorts PKs from a secondary range scan before fetching rows, turning random I/O into sequential.
- **Adaptive hash index**: InnoDB builds an in-memory hash for hot index pages automatically; can become a contention point in some workloads.
- **Doublewrite buffer** protects against torn pages on crash.`],
 ["num","Leaf pages hold 100 rows and internal pages fan out 1,000×. How many levels (including leaves) for 1 billion rows?",4,0,"levels","1e9 / 100 = 10M leaves → 10,000 → 10 → 1 root: leaf + 2 internal + root = 4 levels."],
 ["match","EXPLAIN Extra",[["Using index","Covering index: no row lookups"],["Using index condition","Index Condition Pushdown filters in the engine"],["Using MRR","Primary keys sorted before fetching rows"],["Using filesort","Sort not provided by an index"],["Using temporary","Intermediate temp table (GROUP BY/DISTINCT)"]],"Extra tells you how the work is done."],
 ["pick","A table has a 36-character VARCHAR UUID as PK and 6 secondary indexes. Biggest hidden cost?",["Every secondary index stores the 36-byte PK in every entry","The PK can't be indexed","Replication breaks","Binlog grows"],0,"Use a compact, ordered PK (BIGINT or BINARY(16) UUIDv7)."],
 ["tf","Page truths",[["Sequential inserts fill pages much better than random inserts.",true,"Random keys split pages to half full."],["A PK lookup in a 100M-row table usually needs dozens of disk reads.",false,"3 levels, mostly cached."],["Secondary index entries contain the primary key.",true,"That's how they find the row."]]]
]},
{act:"Expert", t:"Redo, undo & purge", sub:"Checkpoints, history list", rounds:[
 ["learn","Redo, checkpoints and LSN","Every change gets a **log sequence number** (LSN) and is written to the **redo log** before its page is flushed. A **checkpoint** advances as dirty pages are flushed; redo older than the checkpoint can be reused.",null,null,`### Redo capacity
MySQL 8.0.30+ sizes redo with «innodb_redo_log_capacity». If writes outrun page flushing, the **checkpoint age** approaches capacity and InnoDB forces aggressive (sync) flushing — throughput collapses into stalls. Size redo to hold several minutes of peak writes; tune «innodb_io_capacity» / «innodb_io_capacity_max» to your storage.

### Undo and MVCC
Updates write the old version to **undo logs**; consistent reads walk undo chains to reconstruct the version visible to their **read view**. Undo is also used for rollback.

### Purge and the history list
**Purge threads** remove undo records (and delete-marked index entries) no read view needs anymore. «History list length» (in SHOW ENGINE INNODB STATUS) counts unpurged transactions. A **long-running transaction** (even an idle one) holding an old read view blocks purge: HLL grows into millions, undo tablespaces swell and every read walking long version chains slows down.

### Crash recovery
On restart, InnoDB replays redo from the last checkpoint (roll forward), then rolls back uncommitted transactions using undo. The binlog/redo two-phase commit decides which prepared transactions commit.`],
 ["num","Redo capacity 8 GB; peak redo generation 40 MB/s with page flushing far behind. Seconds until redo is full (1 GB = 1,024 MB)?",205,2,"s","8,192 MB ÷ 40 MB/s ≈ 205 s. Then InnoDB stalls to flush. Size redo for minutes of peak."],
 ["pick","History list length is 25 million and growing. Most likely cause?",["A long-open transaction blocking purge","Too many indexes","Binlog format","Small buffer pool"],0,"Find it in information_schema.innodb_trx and end it."],
 ["order","InnoDB crash recovery",["Find the last checkpoint LSN","Replay redo forward from there","Check prepared transactions against the binlog","Commit those in the binlog, roll back the rest","Roll back uncommitted transactions using undo"],"Redo forward, undo backward."],
 ["tf","Log truths",[["Undo logs serve both rollback and MVCC reads.",true,"Old versions live in undo."],["An idle open transaction is harmless.",false,"Its read view blocks purge."],["Too small redo causes write stalls under heavy load.",true,"Checkpoint pressure."]]]
]},
{act:"Expert", t:"Locking deep", sub:"Gap, insert intention, MDL", rounds:[
 ["learn","Which locks a statement takes","Under REPEATABLE READ, locking reads and DML lock **index records** they scan: **record locks**, **gap locks** (the gap before a record), **next-key locks** (record + gap). **Insert intention** locks are gap locks taken by INSERTs that only conflict with existing gap locks.",null,null,`### Rules of thumb
- **Unique index, equality, row exists**: only a record lock on that row.
- **Unique index, row doesn't exist**: a gap lock — blocks inserts into that gap.
- **Non-unique index or range**: next-key locks on every scanned record + the gap after the last.
- **No usable index**: scans the clustered index, locking every row it examines.
- READ COMMITTED mostly disables gap locking (except for FK and duplicate-key checks) and releases locks on non-matching rows early.

### Queues without contention
«SELECT … FROM jobs WHERE status = 'NEW' ORDER BY id LIMIT 10 FOR UPDATE SKIP LOCKED» lets many workers grab different rows without waiting. «NOWAIT» fails immediately instead of waiting.

### Metadata locks
Any query holds a **metadata lock** (MDL) on tables it touches until its **transaction** ends. «ALTER TABLE» needs an exclusive MDL: it waits behind a long transaction, and **every new query on that table queues behind the ALTER** — an outage. Set «lock_wait_timeout» low for DDL and check «performance_schema.metadata_locks».

### Seeing locks
«performance_schema.data_locks» and «data_lock_waits», «sys.innodb_lock_waits», and «SHOW ENGINE INNODB STATUS» (latest deadlock).`],
 ["order","How an ALTER causes an outage",["An analyst's transaction reads payments and stays open","ALTER TABLE payments waits for an exclusive metadata lock","New SELECTs on payments queue behind the waiting ALTER","Connections pile up; app times out","Fix: kill the old transaction, use low lock_wait_timeout for DDL"],"MDL queues are FIFO."],
 ["pick","Ten workers poll a jobs table and constantly wait on each other's locks. Fix?",["SELECT … FOR UPDATE SKIP LOCKED","SERIALIZABLE","LOCK TABLES","Bigger buffer pool"],0,"Each worker takes different rows."],
 ["sort","Lock taken under REPEATABLE READ?",{"Record lock only":["UPDATE … WHERE id = 7 (PK, row exists)"],"Gap lock":["SELECT … WHERE id = 7 FOR UPDATE (PK, no such row)"],"Next-key locks on a range":["UPDATE … WHERE created_at > '2026-11-01' (non-unique index)"],"Locks every examined row":["UPDATE … WHERE note LIKE '%x%' (no index)"]},"Indexes decide lock footprint."],
 ["tf","Locking truths",[["READ COMMITTED reduces gap locking.",true,"Fewer deadlocks for many OLTP apps."],["A plain SELECT inside an open transaction holds a metadata lock until commit.",true,"That's what blocks DDL."]]]
]},
{act:"Expert", t:"Optimizer deep", sub:"Stats, histograms, EXPLAIN ANALYZE", rounds:[
 ["learn","How MySQL estimates","The optimizer estimates rows from **index statistics** (sampled pages: «innodb_stats_persistent_sample_pages», default 20), **index dives** for ranges, and optional **histograms** for non-indexed columns.",null,null,`### Tools
- «EXPLAIN ANALYZE» (8.0.18+): runs the query and shows actual rows and time per iterator next to estimates.
- «ANALYZE TABLE t» refreshes index stats; «ANALYZE TABLE t UPDATE HISTOGRAM ON status, country WITH 64 BUCKETS» adds histograms for skewed, non-indexed columns used in filters and joins.
- «eq_range_index_dive_limit» (200): beyond this many IN-list values, the optimizer uses statistics instead of dives — big IN lists can get bad estimates.

### Join algorithms
Nested loop with index lookups (the classic), and **hash join** (8.0.18+) for joins without usable indexes — replacing block nested loop.

### Steering
- Optimizer hints: «/*+ INDEX(t idx) */», «JOIN_ORDER(a, b)», «NO_RANGE_OPTIMIZATION», «SET_VAR(...)» per query.
- **Invisible indexes**: «ALTER TABLE t ALTER INDEX idx INVISIBLE» to test dropping an index safely.
- **Functional indexes**: «INDEX ((DATE(created_at)))» or on JSON paths.
- Derived condition pushdown (8.0.22+) pushes outer WHERE conditions into derived tables.`],
 ["pick","You want to know if dropping idx_old is safe without risking a rebuild. Use…",["ALTER INDEX idx_old INVISIBLE and watch","DROP and recreate if needed","FORCE INDEX","ANALYZE TABLE"],0,"Invisible indexes are maintained but ignored by the optimizer."],
 ["match","Tool → use",[["EXPLAIN ANALYZE","Actual vs estimated rows per step"],["Histogram","Selectivity of a skewed non-indexed column"],["Functional index","Index on DATE(created_at) or a JSON path"],["SET_VAR hint","Change a variable for one query"]],"Measure, then steer."],
 ["fill","Add a histogram for a skewed status column",'ANALYZE TABLE payments ___ HISTOGRAM ON status WITH ___ BUCKETS;',["UPDATE","64"],["CREATE","ALL","DROP"],"Helps when 99% of rows are SUCCESS and 0.1% are FAILED."],
 ["tf","Optimizer truths",[["MySQL 8 can hash join without indexes.",true,"Since 8.0.18."],["Huge IN lists always get accurate estimates.",false,"Past eq_range_index_dive_limit, stats are used."]]]
]},
{act:"Expert", t:"Replication & HA deep", sub:"Group commit, writesets, lossless", rounds:[
 ["learn","Parallel replication with writesets","Replicas can apply transactions in parallel when they don't conflict. With **WRITESET** dependency tracking, the source records a hash of the rows each transaction touched; non-overlapping transactions run in parallel on the replica even if they committed sequentially on the source.",null,null,`### Settings
- «replica_parallel_workers» (e.g. 8–16) and «replica_preserve_commit_order=ON» (commit in source order).
- Writeset-based dependency tracking is the default behaviour in recent versions (8.4).
- **Binlog group commit** batches many transactions' fsyncs into one, essential with «sync_binlog=1».

### Semi-sync: lossless
«rpl_semi_sync_source_wait_point = AFTER_SYNC» (lossless): the source writes and syncs the binlog, waits for a replica to acknowledge receipt, **then** commits in InnoDB and returns to the client. No client ever sees a commit that no replica has — failover won't lose acknowledged transactions. If no replica answers within the timeout, it falls back to async.

### Crash-safe replicas
Store replica positions in InnoDB tables (default), and «relay_log_recovery=ON» so a crashed replica re-fetches relay logs instead of trusting possibly corrupt ones.

### HA stacks
**InnoDB Cluster** (Group Replication + MySQL Router + Shell), **Orchestrator**-style topology managers, or managed services (RDS Multi-AZ, Aurora with shared storage replication). With GTIDs, re-pointing replicas after failover is «CHANGE REPLICATION SOURCE TO … SOURCE_AUTO_POSITION=1».`],
 ["order","Lossless semi-sync commit (AFTER_SYNC)",["Transaction prepares in InnoDB","Binlog written and synced","Wait for at least one replica ACK","Commit in InnoDB","Return OK to the client"],"Clients never see commits unknown to replicas."],
 ["pick","Replica lags with 1 applier thread while the source runs 2,000 small independent transactions/s. Fix?",["Parallel workers with writeset dependency tracking","STATEMENT binlog","Bigger relay log","Disable GTID"],0,"Apply non-conflicting transactions in parallel."],
 ["match","Setting",[["replica_parallel_workers","Number of applier threads"],["replica_preserve_commit_order","Replica commits in source order"],["AFTER_SYNC","Lossless semi-sync"],["relay_log_recovery","Crash-safe relay logs"]],"Correct and fast replicas."],
 ["tf","Replication truths",[["Semi-sync never falls back to async.",false,"It does after rpl_semi_sync_source_timeout."],["GTID auto-positioning simplifies re-pointing replicas.",true,"No file/pos maths."]]]
]},
{act:"Expert", t:"Expert boss: MySQL deep incident", boss:true, time:45, rounds:[
 ["pick","ALTER TABLE hangs and all queries on the table pile up. Root cause?",["Metadata lock queued behind a long open transaction","Disk full","Binlog format","Gap locks"],0,"Kill the blocker; set lock_wait_timeout for DDL."],
 ["pick","Write throughput collapses every few minutes with flush storms. Check…",["Redo capacity vs checkpoint age and io_capacity","Query cache","Histograms","Semi-sync"],0,"Checkpoint pressure."],
 ["pick","Reads slow down over days; history list length 40M. Fix?",["End long-running transactions so purge can run","Add replicas","Drop indexes","Bigger redo"],0,"Unblock purge."],
 ["pick","Job workers deadlock and wait on each other constantly. Fix?",["FOR UPDATE SKIP LOCKED with ordered picks","SERIALIZABLE","Table locks","No indexes"],0,"Queue pattern."],
 ["pick","Failover lost the last few acknowledged payments. Prevent?",["Semi-sync AFTER_SYNC (lossless)","Async with more replicas","STATEMENT binlog","Bigger buffer pool"],0,"Lossless commits."],
 ["pick","Optimizer picks a full scan for status = 'FAILED' (0.1% of rows, unindexed). Quick win?",["Histogram on status, or an index","FORCE INDEX on PK","Restart","Increase sample pages only"],0,"Give it selectivity info."],
 ["pick","Inserts slow; table uses VARCHAR(36) UUID PK with many indexes. Fix?",["Compact ordered PK (BIGINT / BINARY(16) UUIDv7)","More indexes","Partitioning by UUID","Larger pages"],0,"Sequential, small keys."]
]}
]);

/* ===== On-call desk: MySQL incident ===== */
QUEST.cases("mysql", [
{
 title:"Read replica is 40 minutes behind", icon:"🐌", sev:2, clock:"02:05", channel:"inc-2331-replica-lag", svc:"payments-mysql · reporting replica", need:4,
 terms:[["Primary / replica","The primary takes writes. Replicas copy its changes and serve reads like reports."],["Binlog","The primary's log of changes. Replicas download it (I/O thread) and apply it (SQL/applier threads)."],["Row-based replication (RBR)","The binlog stores the before/after image of every changed row, not the SQL statement."],["Seconds_Behind_Source","How far, in seconds, the replica's applied changes lag behind the primary."],["Primary key","A unique, indexed row identifier. In RBR the replica uses it to find each row to change."],["Full table scan","Reading every row of a table. Doing it once per changed row means millions of scans."],["Purge job","A scheduled cleanup that deletes old rows, here from audit_log."]],
 pager:`[y]WARN[/y]  mysql-replica-reporting  Seconds_Behind_Source = [r]2,412[/r]
trend     +60s every minute (falling further behind)
impact    merchant settlement reports show [b]stale balances[/b]
primary   mysql-payments-1   load: normal`,
 brief:"Reports read from the replica, and merchants are seeing balances from 40 minutes ago. The primary is healthy. A new nightly **purge job** (deleting audit rows older than 90 days) went live tonight at 01:00, the kind of cleanup you write yourself.",
 slack:[
  {at:0, who:"ravi", t:"Replica lag alert. Primary is calm, so it's the replica struggling to *apply* something. Your DB, your call 🙂"},
  {at:5, who:"priya", t:"Start with the replica's own view: is it the I/O thread (downloading binlog) or the SQL thread (applying it) that's behind?", cmd:"mysql -h replica -e \"SHOW REPLICA STATUS\\G\""},
  {at:45, who:"meera", t:"Merchants are calling about balances not updating in the settlement report. Any ETA?"},
  {on:"sqlbehind", who:"priya", t:"I/O is caught up, SQL thread is stuck applying. What exactly is it chewing on?", cmd:"mysql -h replica -e \"SHOW PROCESSLIST\""},
  {on:"applying", who:"ravi", t:"Deleting rows from «audit_log»… that's tonight's purge job. Why would a delete that took 3 minutes on the primary take an hour here? Look at the table.", cmd:"mysql -h replica -e \"SHOW CREATE TABLE payments.audit_log\""},
  {on:"nopk", who:"priya", t:"No primary key! With row-based replication the replica has to *find* every deleted row. With no key, every row means a scan. Check how the job deletes.", cmd:"cat /opt/jobs/purge_audit_log.sql"}
 ],
 hints:["Check SHOW REPLICA STATUS: is it receiving the binlog slowly, or applying it slowly?","See what the replica's applier thread is doing in SHOW PROCESSLIST, then look at that table's definition.","In row-based replication the replica locates each changed row by primary key. Without one, each row event can mean a full table scan."],
 term:{host:"db-bastion", user:"dba", suggest:["mysql -h replica -e \"SHOW REPLICA STATUS\\G\"","mysql -h primary -e \"SHOW GLOBAL STATUS LIKE 'Threads_running'\""],
  cmds:[
  {m:["mysql -h replica -e \"show replica status","mysql -h replica -e \"show slave status","show replica status"], out:`        Replica_IO_Running: [g]Yes[/g]
       Replica_SQL_Running: [g]Yes[/g]
       Source_Log_File: binlog.004211     Read_Source_Log_Pos: 88120334
  Relay_Source_Log_File: [y]binlog.004207[/y]  Exec_Source_Log_Pos: 1201
   Seconds_Behind_Source: [r]2412[/r]
  Replica_SQL_Running_State: [y]Applying batch of row changes (delete)[/y]
           Last_SQL_Error: `, clue:"sqlbehind", unlock:["mysql -h replica -e \"SHOW PROCESSLIST\""]},
  {m:["mysql -h replica -e \"show processlist","mysql -h replica -e \"show full processlist","show processlist"], out:`Id   User         Command  Time   State                                        Info
12   system user  Connect  2398   [y]Applying batch of row changes (delete)[/y]    [b]DELETE FROM payments.audit_log[/b]
13   system user  Connect  2398   Waiting for an event from Coordinator        NULL
88   report_ro    Query    1      executing                                    SELECT ... FROM settlements ...`, clue:"applying", unlock:["mysql -h replica -e \"SHOW CREATE TABLE payments.audit_log\""]},
  {m:["mysql -h replica -e \"show create table payments.audit_log","mysql -h primary -e \"show create table payments.audit_log","show create table"], out:`CREATE TABLE \`audit_log\` (
  \`event_id\` varchar(36) NOT NULL,
  \`txn_id\` varchar(32) DEFAULT NULL,
  \`action\` varchar(32) DEFAULT NULL,
  \`payload\` json DEFAULT NULL,
  \`created_at\` datetime NOT NULL,
  KEY \`idx_created_at\` (\`created_at\`)
) ENGINE=InnoDB  [d]/* 412M rows */[/d]
[r]-- no PRIMARY KEY, no UNIQUE KEY[/r]`, clue:"nopk", unlock:["cat /opt/jobs/purge_audit_log.sql"]},
  {m:["cat /opt/jobs/purge_audit_log.sql","cat purge"], out:`-- nightly purge, scheduled 01:00 (new, went live tonight)
[y]DELETE FROM payments.audit_log WHERE created_at < NOW() - INTERVAL 90 DAY;[/y]
-- deletes ~[b]18.4M rows[/b] in ONE transaction`, clue:"onetxn"},
  {m:["mysql -h primary -e \"show global variables like 'binlog_format'","mysql -h primary -e \"show variables like 'binlog_format'"], out:`binlog_format      ROW
binlog_row_image   FULL`, note:"ROW is the standard, safe format. It's not wrong by itself; it's why a missing primary key hurts so much."},
  {m:["mysql -h primary -e \"show global status like 'threads_running'","mysql -h primary"], out:`Threads_running   6
[d]primary CPU 22%, no long transactions open now[/d]`, note:"The primary is relaxed. The DELETE finished there long ago; the replica is still replaying it."},
  {m:["iostat","iostat -x 1 3"], out:`Device   r/s     w/s    %util
nvme0n1  [y]9120[/y]    210    [y]97.8[/y]
[d](replica)[/d]`, note:"The replica's disk is pegged by reads. It's a symptom of all the table scans, not a hardware fault."}
 ]},
 dash:[
  {title:"Replica lag (seconds)", x:["00:30","00:45","01:00","01:15","01:30","01:45","02:00"], series:[{name:"lag", v:[0,0,0,780,1560,2100,2412]}], marks:[{i:2, label:"purge job"}], clue:"timing"},
  {title:"Primary CPU %", unit:"%", x:["00:30","00:45","01:00","01:15","01:30","01:45","02:00"], series:[{name:"CPU", v:[18,17,61,21,20,22,22]}], marks:[{i:2, label:"purge job"}], note:"The primary blipped for ~3 minutes during the DELETE and then went back to normal. The problem is downstream."},
  {title:"Replica rows read per second", x:["00:30","00:45","01:00","01:15","01:30","01:45","02:00"], series:[{name:"rows read/s", v:[4000,3800,4100,2.1e7,2.3e7,2.2e7,2.2e7]}], marks:[{i:2, label:"purge job"}], clue:"scans"},
  {title:"Network: binlog bytes received by replica", x:["00:30","00:45","01:00","01:15","01:30","01:45","02:00"], series:[{name:"MB/min", v:[12,11,240,14,12,13,12]}], note:"The binlog arrived quickly (the I/O thread is caught up). The network isn't the bottleneck."}
 ],
 clues:{
  sqlbehind:"The I/O thread is caught up; the SQL (applier) thread is 2,412 s behind",
  applying:"The replica's applier is stuck on «DELETE FROM payments.audit_log»",
  nopk:"«audit_log» has no primary or unique key (412M rows)",
  onetxn:"The new purge job deletes ~18.4M rows in a single transaction",
  timing:"Lag started climbing exactly when the 01:00 purge job ran",
  scans:"The replica is reading ~22M rows/s: full scans for each deleted row"
 },
 cause:{q:"What's the root cause?", o:[
  {t:"The new purge job deletes 18.4M rows in one transaction from a table with no primary key. With row-based replication, the replica must find each deleted row by scanning, so it falls further behind", ok:true},
  {t:"The network between primary and replica is slow", ok:false, why:"The I/O thread is caught up; the binlog arrived in minutes.", say:[["ravi","The I/O thread is caught up: Read_Source_Log_Pos is current. The binlog got here fine; it's the *applying* that's slow."]]},
  {t:"The replica's disk is failing", ok:false, why:"It's busy because of the scans, not broken. %util at 98% is the symptom.", say:[["priya","The disk is busy because we're asking it to scan 412M rows over and over. It's a symptom. What's making it scan?"]]},
  {t:"Report queries on the replica are blocking replication", ok:false, why:"One small report query is running; the applier is busy with the DELETE itself.", say:[["meera","There's one tiny report query running. The applier thread isn't waiting on a lock; it's busy deleting."]]}
 ]},
 fix:{q:"What do you ship? Pick every action you'd take.", o:[
  {t:"Add a primary key to «audit_log» (an auto-increment id, or a PK on event_id) and enforce «sql_require_primary_key=ON»", kind:"must", why:"With a key, each row event is an index lookup instead of a scan. That's the real fix for replication.", miss:[["priya","Batching is great, but every future update or delete on audit_log still has no key. The next bulk change will hurt the replica the same way."]]},
  {t:"Rewrite the purge to delete in batches (e.g. 10k rows per transaction by id/created_at, with short pauses)", kind:"must", why:"Small transactions replicate smoothly and can run in parallel. No single 18M-row event blocks everything.", miss:[["ravi","PK's added for the future, but the purge job is still one 18M-row transaction. Tomorrow night at 01:00 it'll freeze the replica again."]]},
  {t:"Tonight: point reports at the second replica (which skipped the purge window) until this one catches up", kind:"good", why:"Merchants get fresh numbers now, while the slow replica recovers."},
  {t:"Alert on replica lag growing for 5+ minutes, and review DDL/DML jobs that touch large tables", kind:"good", why:"Catches the next one early."},
  {t:"Turn on multi-threaded replication («replica_parallel_workers=8»)", kind:"meh", why:"Helps with many small transactions; a single giant transaction is still applied by one worker."},
  {t:"Skip the transaction on the replica («sql_replica_skip_counter=1»)", kind:"bad", why:"The replica would silently keep 18.4M rows the primary deleted. Reports and any failover would then be on different data.", say:[["meera","Audit counts on the replica don't match the primary any more: 18.4M extra rows. Which one do we trust? 😬"],["priya","Skipping events makes the replica diverge. We'll have to rebuild it from a backup now."]]},
  {t:"Restart the replica to clear the stuck delete", kind:"bad", why:"The applier rolls back and starts the whole 18.4M-row transaction again from zero.", say:[["ravi","Restarted. The applier rolled back 40 minutes of work and is starting the same DELETE again. Lag is now going *up* faster."]]},
  {t:"Point the reports at the primary", kind:"bad", why:"Heavy reporting queries on the payments primary risk slowing down live payments.", say:[["dev","Primary CPU just went 22% → 88% and checkout p99 doubled. Please take the reports off the primary!"]]}
 ]},
 post:{
  summary:"The reporting replica fell **40+ minutes** behind after the new nightly purge job ran at 01:00. Merchant settlement reports showed stale balances. The primary was healthy throughout.",
  cause:"The purge deleted **18.4M rows in one transaction** from «audit_log», a 412M-row table with **no primary key**. Under **row-based replication** the binlog holds one event per deleted row. The replica must locate each row before deleting it, and without a usable key that means scanning. That made it read ~22M rows/s while applying the single transaction, which can't be parallelised. On the primary the same DELETE used «idx_created_at» once and finished in 3 minutes.",
  prevent:["Every table gets a primary key; enforce with «sql_require_primary_key»","Purges and backfills run in small batches with pauses, and are reviewed for replication impact","Replica lag alerts with a runbook (fail reports over to another replica)","Test large DML on a staging replica first"]
 },
 learned:["Replica lag: check **I/O vs SQL thread** first. Receiving or applying?","Row-based replication + **no primary key** = a table scan per changed row on the replica.","Purge in **batches**. One giant transaction blocks replication and can't be parallelised.","Never «skip» replication events to make lag disappear. The replica silently diverges."]
}
]);
