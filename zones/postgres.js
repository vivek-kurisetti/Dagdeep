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

/* ===== On-call desk: PostgreSQL incident ===== */
QUEST.cases("postgres", [
{
 title:"Primary DB disk at 92% and climbing", icon:"💽", sev:1, clock:"16:20", channel:"inc-2320-orders-db-disk", svc:"orders-db · PostgreSQL 15 primary", need:4,
 pager:`[r]FIRING[/r]  orders-db-primary  disk /var/lib/postgresql  [r]92% used[/r]
growth    ~38 GB/hour over the last 6h
forecast  [r]FULL in ~1h 40m[/r]  → primary will stop accepting writes
host      pg-orders-1 (r6i.4xlarge, 2 TB gp3)`,
 brief:"If this disk fills, Postgres stops writing and checkout goes down for everyone. Table sizes look normal according to the morning report. Last night there was a maintenance window: Kafka Connect workers were patched.",
 slack:[
  {at:0, who:"ravi", t:"Disk alert on orders-db. I can extend the EBS volume but it takes a while to optimise and it's a one-way door. Let's find what's eating it first."},
  {at:5, who:"priya", t:"Split the problem: is it **table data** or **something else** in the data directory?", cmd:"du -sh /var/lib/postgresql/15/main/*"},
  {at:45, who:"dev", t:"Is it a big table? I can kick off a VACUUM FULL on orders if you want."},
  {on:"walsize", who:"priya", t:"pg_wal at 410 GB? WAL should be recycled after checkpoints. Something must be **holding** it. Replication slots are the usual suspect.", cmd:"psql -c \"select slot_name, plugin, active, restart_lsn, pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) as retained from pg_replication_slots;\""},
  {on:"slot", who:"ravi", t:"«debezium_orders»: that's the CDC connector feeding the lakehouse. Was it touched in last night's maintenance?", cmd:"curl -s connect:8083/connectors/orders-cdc/status"},
  {on:"paused", who:"dev", t:"Oh no. I paused it before patching the Connect workers and… forgot to resume. Sorry 🙈"}
 ],
 hints:["Table sizes are normal, so look at the *other* things in the data directory: «du -sh» on it.","WAL that keeps growing means something hasn't consumed it yet. Check «pg_replication_slots» for an inactive slot.","Find who owns the inactive slot and why it stopped. Check the Kafka Connect connector's status."],
 term:{host:"pg-orders-1", user:"postgres", suggest:["df -h /var/lib/postgresql","du -sh /var/lib/postgresql/15/main/*","psql -c \"select relname, n_dead_tup from pg_stat_user_tables order by 2 desc limit 5;\""],
  cmds:[
  {m:["df -h"], out:`Filesystem      Size  Used Avail Use% Mounted on
/dev/nvme1n1    2.0T  [r]1.9T[/r]  158G  [r]92%[/r] /var/lib/postgresql`, note:"That's the alert itself. Now find *what* is using the space."},
  {m:["du -sh /var/lib/postgresql/15/main","du -sh"], out:`1.4T    /var/lib/postgresql/15/main/base
[r]410G[/r]    /var/lib/postgresql/15/main/[b]pg_wal[/b]
1.2G    /var/lib/postgresql/15/main/pg_xact
212M    /var/lib/postgresql/15/main/pg_stat_tmp
[d]base/ was 1.4T at yesterday's capacity review too[/d]`, clue:"walsize", unlock:["psql -c \"select slot_name, plugin, active, restart_lsn, pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) as retained from pg_replication_slots;\""]},
  {m:["psql -c \"select slot_name","psql -c \"select * from pg_replication_slots","psql -c 'select * from pg_replication_slots"], out:`   slot_name     |  plugin  | active | restart_lsn  | retained
-----------------+----------+--------+--------------+----------
 standby_1       |          | [g]t[/g]      | 3F1/A2000000 | 16 MB
 [y]debezium_orders[/y] | pgoutput | [r]f[/r]      | 3A7/1B00A8C0 | [r]409 GB[/r]
(2 rows)`, clue:"slot", unlock:["curl -s connect:8083/connectors/orders-cdc/status"]},
  {m:["psql -c \"select relname, n_dead_tup","psql -c \"select relname"], out:`    relname     | n_dead_tup
----------------+------------
 orders         |    [y]4120331[/y]
 order_items    |    1803112
 payments       |     611208
 [d]autovacuum last ran on orders 14 minutes ago[/d]`, note:"Some dead tuples, but autovacuum ran 14 minutes ago and table sizes match yesterday. This doesn't explain 38 GB/hour."},
  {m:["psql -c \"show max_slot_wal_keep_size","psql -c 'show max_slot_wal_keep_size"], out:` max_slot_wal_keep_size
------------------------
 [r]-1[/r]
[d](-1 = unlimited: slots may retain WAL forever)[/d]`, clue:"nolimit"},
  {m:["psql -c \"select pg_size_pretty(pg_database_size","psql -c \"select pg_size_pretty"], out:` pg_size_pretty
----------------
 1398 GB`, note:"Database size is the same as yesterday. Tables aren't what's growing."},
  {m:["curl -s connect:8083/connectors/orders-cdc/status","curl connect:8083/connectors/orders-cdc/status","curl -s connect:8083/connectors"], out:`{"name":"orders-cdc",
 "connector":{"state":"[r]PAUSED[/r]","worker_id":"connect-2:8083"},
 "tasks":[{"id":0,"state":"[r]PAUSED[/r]","worker_id":"connect-2:8083"}],
 "type":"source"}`, clue:"paused"},
  {m:["tail /var/log/postgresql","tail -n 30 /var/log/postgresql"], out:`16:02:11 LOG:  checkpoint complete: wrote 18211 buffers (2.2%); 0 WAL file(s) added, [y]0 removed[/y], 31 recycled
16:07:40 LOG:  checkpoint starting: time`, clue:"noremove"},
  {m:["ls /var/lib/postgresql/15/main/pg_wal","ls pg_wal"], out:`0000000100003A70000001B
0000000100003A70000001C
[d]… 26,214 files (16 MB each)[/d]`, note:"Lots of WAL segments, as expected given pg_wal's size. Don't touch these files by hand."}
 ]},
 dash:[
  {title:"Disk used % · pg-orders-1", unit:"%", x:["Tue 22:00","00:00","02:00","04:00","06:00","08:00","10:00","12:00","14:00","16:00"], series:[{name:"used %", v:[71,71,72,74,76,79,82,85,89,92]}], marks:[{i:1, label:"maint. window"}], note:"The symptom: it started climbing right after last night's maintenance window. Useful for *when*, not *what*."},
  {title:"WAL retained by replication slots (GB)", unit:"G", x:["Tue 22:00","00:00","02:00","04:00","06:00","08:00","10:00","12:00","14:00","16:00"], series:[{name:"debezium_orders", v:[0.1,4,30,62,110,170,232,298,360,409]}, {name:"standby_1", v:[0.02,0.02,0.02,0.02,0.02,0.02,0.02,0.02,0.02,0.02]}], marks:[{i:1, label:"maint."}], clue:"slotgrowth"},
  {title:"Table + index size (GB)", unit:"G", x:["Tue 22:00","00:00","02:00","04:00","06:00","08:00","10:00","12:00","14:00","16:00"], series:[{name:"all tables", v:[1396,1396,1396,1397,1397,1397,1397,1398,1398,1398]}], note:"Tables are flat. Bloat isn't eating the disk."},
  {title:"Transactions/s", x:["Tue 22:00","00:00","02:00","04:00","06:00","08:00","10:00","12:00","14:00","16:00"], series:[{name:"TPS", v:[2100,900,600,700,2400,5200,6100,5900,6300,6000]}], note:"A normal daily traffic curve. Busy hours produce more WAL, but on a healthy box that WAL gets recycled."}
 ],
 uiName:"Connect UI",
 ui:[
  {title:"Kafka Connect · connectors", md:`| Connector | Type | State | Tasks | Last state change |
|---|---|---|---|---|
| orders-cdc | Debezium Postgres source | **PAUSED** | 0/1 running | Tue 23:41 (by dev) |
| payments-cdc | Debezium MySQL source | RUNNING | 1/1 | Tue 23:58 (by dev) |
| lake-s3-sink | S3 sink | RUNNING | 4/4 | Mon 10:12 |`, clue:"paused"},
  {title:"Maintenance log · Tue night", md:`- 23:38 dev: patch Connect workers 1-3 (CVE fix)
- 23:41 dev: pause orders-cdc, payments-cdc
- 23:56 dev: rolling restart done
- 23:58 dev: resume payments-cdc
- 00:02 dev: maintenance closed ✅`, clue:"forgot"}
 ],
 clues:{
  walsize:"pg_wal is 410 GB, while table data (base/) hasn't grown",
  slot:"Replication slot debezium_orders is inactive and retains 409 GB of WAL",
  slotgrowth:"WAL retained by debezium_orders started growing at the maintenance window",
  paused:"Debezium connector orders-cdc is PAUSED (since Tue 23:41)",
  forgot:"Maintenance log: orders-cdc was paused but never resumed (only payments-cdc was)",
  nolimit:"max_slot_wal_keep_size = -1: an abandoned slot can retain WAL without limit",
  noremove:"Checkpoints remove 0 WAL files: something still needs the old WAL"
 },
 cause:{q:"What's the root cause?", o:[
  {t:"The Debezium connector was paused in last night's maintenance and never resumed. Its replication slot stays inactive and pins every WAL segment since then, with no cap (max_slot_wal_keep_size = -1)", ok:true},
  {t:"Table bloat from dead tuples on «orders»", ok:false, why:"Table size is flat at ~1.4 TB and autovacuum is running. The growth is all in pg_wal.", say:[["priya","Tables are flat at 1,398 GB. All the growth is in pg_wal. Bloat doesn't live there."]]},
  {t:"Higher traffic today is producing more WAL", ok:false, why:"Traffic is a normal curve, and on a healthy primary WAL is recycled after checkpoints. Here it isn't removed at all.", say:[["ravi","TPS looks like every other Wednesday. And checkpoints are removing *zero* WAL files. Something is holding on to it."]]},
  {t:"The physical standby is lagging", ok:false, why:"standby_1 is active and retains only 16 MB.", say:[["ravi","standby_1 is active and only 16 MB behind. It's not that slot."]]}
 ]},
 fix:{q:"What do you ship? Pick every action you'd take now.", o:[
  {t:"Resume «orders-cdc» and watch the slot's retained WAL drain as Debezium catches up", kind:"must", why:"Once the slot advances, Postgres can recycle the WAL, and the lakehouse gets its missing 16 hours of changes with nothing lost.", miss:[["ravi","Set the WAL cap, but «orders-cdc» is still PAUSED. The slot will hit the cap, get invalidated, and the lakehouse will need a full resnapshot. Why not just resume it?"]]},
  {t:"Set «max_slot_wal_keep_size» (e.g. 200 GB) so one abandoned slot can never fill the disk again", kind:"must", why:"Postgres gives up on the slot (invalidates it) instead of taking the primary down. A CDC resnapshot is far cheaper than a checkout outage.", miss:[["priya","Disk's draining, great. But nothing stops this happening at the next maintenance. One forgotten pause and we're back here. What's the guardrail?"]]},
  {t:"Alert on retained WAL per slot and on inactive slots older than 30 minutes", kind:"good", why:"You'd have been paged at 00:15, not 16:20."},
  {t:"Add \"resume connectors + check slot lag\" to the maintenance runbook's exit checklist", kind:"good", why:"Makes the human step hard to forget."},
  {t:"Extend the EBS volume by 500 GB as a buffer", kind:"meh", why:"Buys time. Fine as a safety net, but the slot would fill that too, and EBS volumes can't be shrunk."},
  {t:"Delete old files from pg_wal to free space fast", kind:"bad", why:"Postgres needs those segments for crash recovery and replication. Deleting them by hand can corrupt the cluster.", say:[["ravi","STOP — Postgres just PANICked: «could not open file pg_wal/0000000100003A70000001B». The primary is down. Failing over to standby_1… 😱"],["priya","Never delete WAL by hand. That's a two-hour outage instead of a ten-minute fix."]]},
  {t:"Run VACUUM FULL on «orders» to reclaim space", kind:"bad", why:"VACUUM FULL takes an ACCESS EXCLUSIVE lock and needs ~2× the table's space temporarily. On a nearly full disk at peak hours, that's two outages.", say:[["dev","VACUUM FULL took an exclusive lock on orders… checkout is timing out! And it's writing a full copy of the table to a disk with 150 GB free. Cancelling!"]]},
  {t:"Drop the «debezium_orders» slot right away", kind:"bad", why:"It frees space instantly, but the connector loses its position. The lakehouse misses changes and needs a full resnapshot of a 1.4 TB database. Do it only if the connector is truly dead.", say:[["meera","The lakehouse orders table stopped updating, and Debezium says it needs a full snapshot of 1.4 TB. Analytics will be stale for a day. Was that necessary when we could just resume it?"]]}
 ]},
 post:{
  summary:"orders-db primary disk went from 71% to 92% in 16 hours and was ~1h40m from a write outage. **409 GB of WAL** was pinned by an inactive logical replication slot.",
  cause:"During Tuesday night's Connect patching, «orders-cdc» (Debezium) was **paused and never resumed**. A logical replication slot guarantees the consumer every change since its «restart_lsn», so Postgres **cannot recycle WAL** past that point. With «max_slot_wal_keep_size = -1» there was no cap, and every checkpoint since 23:41 removed 0 WAL files. At ~6k TPS that came to ~38 GB/hour.",
  prevent:["«max_slot_wal_keep_size» set on every primary with logical slots","Alerts: retained WAL per slot and slots inactive for more than 30 minutes","Maintenance runbook exit checklist: connectors RUNNING, slot lag near zero","Weekly report of all replication slots and their owners"]
 },
 learned:["Disk filling on Postgres? Split it: **base/** (tables, bloat) vs **pg_wal** (WAL retention).","An **inactive replication slot** pins WAL forever unless «max_slot_wal_keep_size» caps it.","Never delete WAL files by hand, and never VACUUM FULL on a nearly full disk at peak.","Prefer the fix that loses **nothing** (resume the consumer) over the one that frees space fastest (drop the slot)."],
 cards:[{k:"slots", t:"Replication slots and WAL retention", one:"A replication slot is a bookmark that tells Postgres \"don't throw away WAL until I've read it\", even if the reader never comes back.",
  life:"A newspaper office keeps back issues until every subscriber has picked up their copy. One subscriber goes on holiday without telling anyone, and the back issues pile up until the storeroom is full and the presses stop.",
  how:["Postgres writes every change to **WAL** (write-ahead log) in 16 MB segment files under «pg_wal».","After a checkpoint, old segments are normally **recycled or removed**.","A **replication slot** (physical for standbys, logical for CDC like Debezium) records the oldest LSN its consumer still needs: «restart_lsn».","Postgres keeps all WAL from the oldest slot's «restart_lsn» onward. An **inactive** slot stops advancing, so WAL grows without bound.","«max_slot_wal_keep_size» caps this. Past the cap, the slot is **invalidated** (the consumer must resnapshot) but the primary survives.","Monitor: «pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)» per slot and «active = false»."],
  ex:"~~~\nselect slot_name, active,\n  pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) retained\nfrom pg_replication_slots;\n\n-- guardrail\nalter system set max_slot_wal_keep_size = '200GB';\nselect pg_reload_conf();\n~~~",
  traps:["Pausing a Debezium connector doesn't release its slot. WAL keeps piling up.","Deleting WAL files by hand can corrupt the database. Let Postgres remove them.","Dropping a CDC slot frees space but forces a full resnapshot downstream.","Low-traffic databases can hit this too: WAL from checkpoints and other databases still accumulates."],
  say:"Logical replication slots make Postgres retain WAL from the consumer's restart_lsn onward, so if a CDC connector like Debezium stops (paused, crashed, or abandoned), WAL accumulates until the disk fills. I diagnose by comparing pg_wal size to table size and querying pg_replication_slots for inactive slots with large retained WAL. The fix is to resume the consumer; the guardrails are max_slot_wal_keep_size and alerts on per-slot retained WAL and inactive slots."}]
}
]);
