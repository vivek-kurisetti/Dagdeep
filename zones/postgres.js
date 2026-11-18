QUEST.zone("postgres", {
mission:["dev","The ledger runs on PostgreSQL. Tables are bloating, a query plan flipped overnight, and Debezium's slot is holding WAL. Learn how Postgres works, then rescue the ledger."],
levels:[
{t:"MVCC & VACUUM", sub:"Row versions", rounds:[
 ["learn","Updates create new row versions","Postgres never updates in place: an UPDATE writes a **new tuple** and marks the old one dead (xmin/xmax transaction ids). Readers see the version visible to their snapshot. Dead tuples stay until **VACUUM** cleans them.",["UPDATE writes new tuple","Old tuple marked dead (xmax)","Snapshots pick the visible version","VACUUM reclaims dead tuples"]],
 ["learn","Autovacuum and bloat","**Autovacuum** runs when dead tuples exceed «threshold + scale_factor × rows» (default 20%). On huge, hot tables that's too late: lower the scale factor per table. Long-running transactions **block cleanup** of anything newer than their snapshot."],
 ["pick","A 500 GB table bloated to 1.4 TB. An analytics session has been open for 3 days. Connection?",["None","The old snapshot prevents VACUUM from removing dead tuples","It disabled autovacuum","It filled WAL"],1,"Kill idle-in-transaction sessions; set idle_in_transaction_session_timeout."],
 ["match","Maintenance commands",[["VACUUM","Mark dead space reusable, update visibility map"],["VACUUM FULL","Rewrite table compactly (exclusive lock)"],["ANALYZE","Refresh planner statistics"],["pg_repack","Rewrite online without long locks"]],"VACUUM FULL blocks everything; avoid it on live tables."],
 ["learn","Transaction ID wraparound","XIDs are 32-bit. VACUUM **freezes** old tuples so ids can wrap safely. If freezing falls far behind, Postgres eventually refuses writes to protect data. Monitor «age(datfrozenxid)»."],
 ["tf","MVCC facts",[["Readers block writers in Postgres.",false,"MVCC: readers and writers don't block each other."],["HOT updates avoid touching indexes when no indexed column changes.",true,"Lower fillfactor leaves room for them."],["Plain VACUUM returns disk space to the OS.",false,"Usually only VACUUM FULL / repack shrink the file."]]]
]},
{t:"WAL & replication", sub:"Durability, slots", rounds:[
 ["learn","Write-ahead log","Every change is written to the **WAL** before data pages. On crash, Postgres replays WAL from the last **checkpoint**. Streaming replicas receive WAL too. «synchronous_commit» controls whether COMMIT waits for WAL flush."],
 ["sort","Physical or logical replication?",{"Physical (streaming)":["Byte-for-byte hot standby","Failover replica of the whole cluster"],"Logical":["Replicate selected tables","Feed Debezium CDC","Upgrade across major versions"]},"Logical decoding turns WAL into row changes."],
 ["learn","Replication slots retain WAL","A slot remembers what its consumer confirmed and keeps WAL until then. An abandoned slot (dead Debezium, dropped replica) makes «pg_wal» grow until the disk fills. Set «max_slot_wal_keep_size» as a safety net."],
 ["fill","Find slots holding WAL",'SELECT slot_name, active,\n  pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), ___)) AS retained\nFROM ___;',["restart_lsn","pg_replication_slots"],["confirmed_xid","pg_stat_activity","pg_locks"],"Inactive slots with large retained WAL are the culprits."],
 ["order","Checkpoint and crash recovery",["Changes logged to WAL","Dirty pages written at checkpoint","Crash happens","On restart, replay WAL from the last checkpoint"],"Bigger max_wal_size = fewer checkpoints, longer recovery."]
]},
{t:"Indexes", sub:"B-tree, GIN, BRIN and friends", rounds:[
 ["learn","Many index types","**B-tree**: equality and ranges (default). **GIN**: jsonb, arrays, full-text. **GiST**: geometry, ranges, nearest-neighbour. **BRIN**: tiny block-range summaries for huge, naturally ordered tables. **Hash**: equality only."],
 ["match","Pick the index",[["WHERE created_at range on an append-only 2 TB log","BRIN"],["WHERE payload @> '{\"status\":\"PAID\"}'","GIN on jsonb"],["WHERE email = ? AND deleted_at IS NULL","Partial B-tree index"],["WHERE lower(email) = ?","Expression index on lower(email)"]],"Choose by query shape and data layout."],
 ["learn","Partial and covering indexes","A **partial** index covers only rows matching a predicate («WHERE status='PENDING'»): small and fast. «INCLUDE (cols)» adds payload columns for **index-only scans**, which need a fresh visibility map (VACUUM)."],
 ["fill","Small index for the pending queue",'CREATE INDEX ___ idx_pay_pending\nON payments (created_at)\n___ status = \'PENDING\';',["CONCURRENTLY","WHERE"],["ONLINE","FILTER","IF"],"CONCURRENTLY avoids blocking writes during the build."],
 ["tf","Index facts",[["Every index slows down writes.",true,"Each insert/update maintains them."],["Index-only scans never touch the heap.",false,"They check the visibility map; unvisited pages still hit the heap."],["CREATE INDEX CONCURRENTLY can't run inside a transaction block.",true,"It runs in multiple transactions."]]]
]},
{t:"Planner & tuning", sub:"EXPLAIN ANALYZE", rounds:[
 ["learn","Read EXPLAIN ANALYZE","Compare **estimated rows vs actual rows**: big gaps mean bad statistics. Node types: Seq Scan, Index Scan, Index Only Scan, Bitmap Heap Scan, Nested Loop, Hash Join, Merge Join. Add «BUFFERS» to see I/O."],
 ["pick","Plan estimates 10 rows, actual 2 million, and picks a Nested Loop. First fix?",["ANALYZE the table / raise statistics target / extended statistics","Disable nested loops globally","Add RAM","VACUUM FULL"],0,"Bad estimates cause bad join choices."],
 ["match","Memory settings",[["shared_buffers","Postgres page cache (~25% RAM typical)"],["work_mem","Per sort/hash operation memory"],["maintenance_work_mem","VACUUM and CREATE INDEX memory"],["effective_cache_size","Planner's guess of OS + PG cache"]],"work_mem is per operation, per connection: careful."],
 ["learn","Connections are processes","Each connection is a backend process with real memory cost. Hundreds of app connections → use a pooler like **PgBouncer** (transaction pooling) instead of raising max_connections."],
 ["sort","Good idea or bad idea?",{"Good":["PgBouncer in front of 2,000 app clients","Partition a 5 TB time-series table by month","Per-table autovacuum_vacuum_scale_factor=0.01 on hot tables"],"Bad":["max_connections=5000","work_mem=2GB globally","VACUUM FULL on the live ledger at noon"]},"Tune with the process model in mind."]
]},
{t:"Boss: Rescue the ledger", boss:true, time:30, rounds:[
 ["pick","pg_wal is 800 GB and growing; Debezium was decommissioned last month. Fix?",["Drop the inactive replication slot","Raise max_wal_size","VACUUM FULL","More replicas"],0,"The slot was retaining WAL."],
 ["pick","Table bloat keeps growing; sessions show 'idle in transaction' for days. Fix?",["Terminate them and set idle_in_transaction_session_timeout","Disable autovacuum","Add indexes","Increase shared_buffers"],0,"Old snapshots block cleanup."],
 ["pick","Plan flipped to a nested loop after a big load; estimates are wildly off. Fix?",["ANALYZE the table","REINDEX","Restart","VACUUM FULL"],0,"Fresh statistics."],
 ["pick","Range queries on a 3 TB append-only events table need a tiny index. Use…",["BRIN on created_at","GIN","Hash","Bitmap"],0,"BRIN summaries are tiny."],
 ["pick","App opens 3,000 connections and memory explodes. Fix?",["PgBouncer transaction pooling","max_connections=10000","Bigger work_mem","Logical replication"],0,"Pool connections."],
 ["pick","Need a new index on the live ledger without blocking writes. Use…",["CREATE INDEX CONCURRENTLY","CREATE INDEX in a transaction","VACUUM FULL first","LOCK TABLE"],0,"Non-blocking build."]
]}
]});

QUEST.more("postgres", [
{act:"Expert", t:"Heap & page internals", sub:"Tuples, ctid, HOT, TOAST", rounds:[
 ["learn","What a heap page looks like","Tables are files of **8 KB pages**. Each page has a header, an array of **line pointers** (item ids), and tuples growing from the end. A tuple's physical address is its **ctid** (page, item).",null,null,`### Tuple header (23 bytes + alignment)
«xmin» (inserting transaction), «xmax» (deleting/locking transaction), «cmin/cmax», «ctid» (points to the newer version after an update), infomask bits (committed/aborted hints, HOT flags), null bitmap. On a 64-bit system, header + alignment make each row cost ~24+ bytes before any data.

### Updates and HOT
An UPDATE writes a **new tuple version**. If no **indexed column** changed and the new version fits on the **same page**, it's a **heap-only tuple (HOT)** update: indexes aren't touched, and old versions can be pruned within the page without VACUUM. «fillfactor=80–90» leaves room on pages for HOT updates on update-heavy tables. Check «n_tup_hot_upd» vs «n_tup_upd» in «pg_stat_user_tables».

### TOAST
Values over ~2 KB are compressed (pglz or lz4) and/or moved to a **TOAST table** in chunks. Rows stay small in the heap; reading the big column costs extra lookups. Updating other columns doesn't rewrite unchanged TOAST data.

### Visibility map and free space map
The **visibility map** marks pages where all tuples are visible to everyone (enables **index-only scans** and lets VACUUM skip pages); it also tracks all-frozen pages. The **free space map** tells inserts where room exists.`],
 ["pick","An update-heavy table changes only a non-indexed «status» column, yet indexes keep bloating. Best fix?",["Lower fillfactor (e.g. 85) so HOT updates fit on the same page","Add an index on status","VACUUM FULL nightly","Raise work_mem"],0,"HOT needs free space on the page."],
 ["match","Structure",[["ctid","Physical location (page, item) of a tuple version"],["xmin / xmax","Transactions that created / deleted the version"],["Visibility map","Pages all-visible: enables index-only scans"],["TOAST","Out-of-line storage for large values"],["HOT update","New version on same page, no index changes"]],"MVCC is visible in the tuple header."],
 ["num","A table has 8 KB pages and rows of ~180 bytes including headers and pointers. Approximately how many rows per page at fillfactor 100?",45,2,"rows","8,192 ÷ 180 ≈ 45 (minus a small page header)."],
 ["tf","Page truths",[["ctid is a stable row identifier you can store.",false,"It changes on update or VACUUM FULL."],["Index-only scans depend on the visibility map.",true,"Unvisited pages still need heap checks."],["HOT updates can happen when an indexed column changes.",false,"No indexed column may change."]]]
]},
{act:"Expert", t:"VACUUM, freezing & the xmin horizon", sub:"Why cleanup stops", rounds:[
 ["learn","When autovacuum runs","Autovacuum VACUUMs a table when dead tuples exceed «autovacuum_vacuum_threshold» (50) + «autovacuum_vacuum_scale_factor» (0.2) × live rows, and ANALYZEs on a similar formula (0.1). Since PG13, inserts also trigger vacuums («autovacuum_vacuum_insert_*»).",null,null,`### The xmin horizon
VACUUM can only remove tuples that are dead to **every** possible snapshot. The oldest snapshot anywhere sets the **xmin horizon**. Things that hold it back:
- Long-running or idle-in-transaction sessions.
- **Replication slots** («xmin» / «catalog_xmin», e.g. a lagging logical slot).
- Standbys with «hot_standby_feedback=on» running long queries.
- Forgotten **prepared transactions** («pg_prepared_xacts»).
Check with «pg_stat_activity.backend_xmin», «pg_replication_slots», «pg_prepared_xacts».

### Freezing and wraparound
Transaction ids are 32-bit with circular comparison: only ~2.1 billion "in the past" are distinguishable. VACUUM **freezes** old tuples (marks them visible to all) so their xmin no longer matters.
- «vacuum_freeze_min_age» (50M): freeze tuples older than this when vacuuming.
- «autovacuum_freeze_max_age» (200M): force an **anti-wraparound** vacuum when a table's «relfrozenxid» age exceeds this — even if autovacuum is "off".
- Approaching ~2 billion, Postgres refuses new XIDs to prevent data loss.

### Throttling
«autovacuum_vacuum_cost_limit» / «cost_delay» throttle I/O; on fast storage, defaults are often too gentle for big tables. Raise «autovacuum_max_workers» and per-table settings for hot tables.`],
 ["num","A table has 10,000,000 live rows and default settings. Dead tuples needed before autovacuum triggers?",2000050,10,"dead tuples","50 + 0.2 × 10,000,000 = 2,000,050. Lower the scale factor for big hot tables (e.g. 0.01)."],
 ["sort","Holds back the xmin horizon?",{"Yes":["Session idle in transaction for 2 days","Inactive logical replication slot","Forgotten prepared transaction","Long report on a standby with hot_standby_feedback=on"],"No":["A finished transaction","An index on the table","A large shared_buffers"]},"Any of these keeps dead tuples alive."],
 ["pick","age(datfrozenxid) is 1.6 billion and climbing. Most urgent action?",["Find what blocks freezing (old xmin, slots) and run aggressive VACUUM (FREEZE)","Add RAM","Drop indexes","Raise max_connections"],0,"Wraparound protection will stop writes near 2 billion."],
 ["tf","Vacuum truths",[["Anti-wraparound vacuum runs even with autovacuum disabled.",true,"Forced to protect data."],["A replication slot can block VACUUM from removing dead rows.",true,"Through its xmin/catalog_xmin."],["Inserts never trigger autovacuum.",false,"Since PG13 they can."]]]
]},
{act:"Expert", t:"Locks & concurrency", sub:"Lock queue, row locks, SSI", rounds:[
 ["learn","Table locks and the lock queue","Every statement takes a table-level lock: SELECT takes **ACCESS SHARE**; most «ALTER TABLE» forms take **ACCESS EXCLUSIVE**, which conflicts with everything. Waiting locks form a **queue**: once an ALTER waits, later SELECTs queue **behind it**.",null,null,`### The classic outage
1. A long SELECT holds ACCESS SHARE.
2. «ALTER TABLE payments ADD COLUMN …» waits for ACCESS EXCLUSIVE.
3. Every new query on payments waits behind the ALTER. The app stalls.
Fix: «SET lock_timeout = '3s'» before DDL and retry; many changes (adding a nullable column, adding a column with a constant default since PG11) are metadata-only and fast once the lock is acquired.

### Row locks
Stored in the tuple's «xmax» (plus multixacts for shared locks), not in memory. Modes: **FOR UPDATE**, **FOR NO KEY UPDATE** (what UPDATE takes when key columns aren't changed), **FOR SHARE**, **FOR KEY SHARE** (what foreign key checks take). FK checks use KEY SHARE so they don't block non-key updates.

### Patterns
- Queues: «SELECT … FOR UPDATE SKIP LOCKED LIMIT 10».
- **Advisory locks** («pg_try_advisory_lock(key)») for app-level mutexes (e.g. one cron instance).
- Deadlocks are detected after «deadlock_timeout» (1 s); one transaction is aborted.

### Isolation
Default READ COMMITTED. REPEATABLE READ gives a transaction-wide snapshot. **SERIALIZABLE** uses **Serializable Snapshot Isolation (SSI)**: tracks read/write dependencies and aborts transactions that would create anomalies (retry on serialization failure, SQLSTATE 40001).`],
 ["order","Safe DDL on a busy table",["SET lock_timeout = '3s'","Run the ALTER (metadata-only change if possible)","If it times out, retry later instead of queueing traffic","For indexes, use CREATE INDEX CONCURRENTLY","For big rewrites, use a new table + backfill + swap"],"Never let DDL wait unbounded in the lock queue."],
 ["match","Lock",[["ACCESS SHARE","Taken by SELECT"],["ACCESS EXCLUSIVE","Most ALTER TABLE, DROP, TRUNCATE"],["FOR NO KEY UPDATE","Row lock of UPDATE not touching keys"],["FOR KEY SHARE","Row lock of foreign key checks"],["Advisory lock","App-defined mutex by key"]],"Know which locks conflict."],
 ["pick","Two SERIALIZABLE transactions both succeed in tests but one fails in prod with 40001. Correct handling?",["Retry the transaction","Switch to READ UNCOMMITTED","Ignore the error","Add an index only"],0,"SSI aborts to prevent anomalies; apps must retry."],
 ["tf","Lock truths",[["Adding a column with a constant default rewrites the table in PG11+.",false,"Metadata-only since PG11."],["Row locks are kept in a shared memory lock table.",false,"Recorded in tuple xmax."]]]
]},
{act:"Expert", t:"Planner deep", sub:"Costs, extended stats, plan caching", rounds:[
 ["learn","Costs and statistics","The planner picks the cheapest plan by **cost units**: «seq_page_cost» (1.0), «random_page_cost» (4.0 — set ~1.1 on SSDs), «cpu_tuple_cost», «cpu_index_tuple_cost», «cpu_operator_cost», combined with **row estimates** from «pg_statistic».",null,null,`### Statistics
«ANALYZE» samples 300 × «default_statistics_target» (100) rows per table: most-common values, histograms, null fraction, n_distinct, correlation. Raise the target per column for skewed columns: «ALTER TABLE t ALTER COLUMN merchant_id SET STATISTICS 1000».

### Correlated columns
The planner assumes columns are **independent**. «WHERE city = 'Hyderabad' AND state = 'Telangana'» gets underestimated. Fix with **extended statistics**:
~~~
CREATE STATISTICS addr_stats (dependencies, ndistinct, mcv) ON city, state FROM merchants;
ANALYZE merchants;
~~~

### Prepared statements
After 5 executions, Postgres may switch from **custom plans** (planned with actual parameter values) to a cached **generic plan**. For skewed data, a generic plan can be terrible for some values. «plan_cache_mode = force_custom_plan» per session/role fixes it.

### Parallelism and JIT
Parallel seq/index scans, joins and aggregates with «max_parallel_workers_per_gather». **JIT** compilation can add 100s of ms to short analytic queries; lower «jit_above_cost» or disable for OLTP.

### Partitioning
Declarative range/list/hash partitioning with **partition pruning** at plan time and execution time; keep partition counts in the hundreds to low thousands.`],
 ["fill","Fix underestimates on correlated columns",'CREATE ___ merchant_geo (dependencies, mcv)\n  ON city, ___ FROM merchants;\n___ merchants;',["STATISTICS","state","ANALYZE"],["INDEX","VACUUM","merchant_id"],"Extended stats teach the planner about correlation."],
 ["pick","A prepared query is fast for most merchants but terrible for the biggest one after the 6th call. Why?",["Switched to a generic plan that ignores the value's skew","Autovacuum","Missing WAL","JIT disabled"],0,"Use plan_cache_mode = force_custom_plan for that workload."],
 ["num","default_statistics_target = 100. How many rows does ANALYZE sample per table?",30000,0,"rows","300 × 100 = 30,000 rows (for the table sample)."],
 ["tf","Planner truths",[["random_page_cost 4.0 suits modern SSDs.",false,"Lower it toward 1.1."],["The planner assumes column independence without extended stats.",true,"Correlated filters get underestimated."]]]
]},
{act:"Expert", t:"Replication, backups & HA", sub:"synchronous_commit, standbys, PITR", rounds:[
 ["learn","Durability levels","«synchronous_commit» decides what COMMIT waits for when synchronous standbys are configured («synchronous_standby_names»).",null,null,`| Level | COMMIT waits until | Risk |
|---|---|---|
| off | Nothing (WAL flushed shortly after) | Lose last ~600 ms on crash (no corruption) |
| local | Local WAL flushed | Lose data on primary loss |
| remote_write | Standby received WAL (in OS memory) | Lose if standby OS crashes too |
| on | Standby flushed WAL to disk | Durable on two nodes |
| remote_apply | Standby applied it (visible to reads) | Slowest; read-your-writes on standby |

«synchronous_standby_names = 'ANY 1 (s1, s2)'» waits for any one of two standbys (quorum commit).

### Standby query conflicts
Long queries on a hot standby can conflict with replay (e.g. VACUUM removed rows the query needs). Options: «max_standby_streaming_delay» (delay replay), or «hot_standby_feedback=on» (primary keeps those rows — causing bloat on the primary).

### Backups and PITR
Base backup («pg_basebackup», pgBackRest, Barman) + continuous **WAL archiving** → restore to any point in time («recovery_target_time»). Test restores regularly.

### Failover
Patroni (with etcd/Consul) or managed services promote a standby; **pg_rewind** resynchronizes an old primary as a new standby without a full copy. Logical replication slots need failover slot support (PG17) to survive promotion.`],
 ["match","Need → setting",[["Read-your-writes on a standby","synchronous_commit = remote_apply"],["Survive primary disk loss with no data loss","synchronous_commit = on with a sync standby"],["Faster bulk loads, tolerate losing last ms","synchronous_commit = off for that session"],["Restore to 10:41 before a bad DELETE","Base backup + WAL archive PITR"]],"Durability is a per-transaction choice."],
 ["pick","Long reports on the standby get cancelled with 'conflict with recovery'. Options?",["Raise max_standby_streaming_delay or enable hot_standby_feedback (watch primary bloat)","Restart the primary","Drop indexes","synchronous_commit=off"],0,"Trade replay delay or primary bloat."],
 ["order","Point-in-time recovery",["Restore the latest base backup before the incident","Configure restore_command to fetch archived WAL","Set recovery_target_time just before the bad DELETE","Start the server and replay WAL to the target","Verify, then promote"],"Backups are only real if restores are tested."],
 ["tf","HA truths",[["synchronous_commit = off can corrupt the database.",false,"It may lose recent commits, not corrupt."],["pg_rewind avoids a full re-clone of the old primary.",true,"Copies only changed blocks."]]]
]},
{act:"Expert", t:"Expert boss: Ledger deep dive", boss:true, time:45, rounds:[
 ["pick","ALTER TABLE ledger stalls the whole app. Prevent?",["lock_timeout before DDL + retry","Bigger shared_buffers","Disable autovacuum","SERIALIZABLE"],0,"Don't queue behind long queries."],
 ["pick","Dead tuples pile up; pg_stat_activity shows nothing long-running. Next check?",["pg_replication_slots xmin/catalog_xmin and pg_prepared_xacts","shared_buffers","work_mem","Indexes"],0,"Hidden horizon holders."],
 ["pick","An update-heavy status table bloats indexes. Fix?",["Lower fillfactor for HOT updates; avoid indexing status","Index status","VACUUM FULL hourly","More connections"],0,"HOT updates skip indexes."],
 ["pick","Planner estimates 50 rows for city+state filter; actual 500,000. Fix?",["Extended statistics on (city, state)","random_page_cost=10","More RAM","Disable seqscan"],0,"Correlation stats."],
 ["pick","A prepared statement becomes slow after five calls for one merchant. Fix?",["plan_cache_mode = force_custom_plan","Restart","VACUUM","Raise JIT"],0,"Generic plan problem."],
 ["pick","Someone ran DELETE without WHERE at 10:42. Recover?",["PITR to 10:41 from base backup + WAL archive","pg_rewind","VACUUM","Logical replication"],0,"Point-in-time recovery."],
 ["pick","Must never lose a committed payment even if the primary's disk dies. Use…",["Sync standby with synchronous_commit = on","synchronous_commit = local","Async replica","Logical replication only"],0,"Two durable copies at commit."]
]}
]);
