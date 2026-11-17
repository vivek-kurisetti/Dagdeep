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
