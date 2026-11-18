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
 terms:[["Primary", "The database server that accepts writes. If its disk fills, writes stop."], ["WAL", "Write-ahead log: every change is written here first (16 MB files in pg_wal) for crash recovery and replication."], ["Checkpoint", "A point where dirty pages are flushed to disk, after which old WAL can be recycled, if nobody else needs it."], ["Replication slot", "A bookmark that tells Postgres to keep WAL until a consumer (a standby or a CDC tool) has read it."], ["restart_lsn", "The oldest WAL position a slot still needs. Everything after it is kept."], ["Debezium", "A CDC (change data capture) tool that streams database changes into Kafka using a logical replication slot."], ["max_slot_wal_keep_size", "A cap on how much WAL any slot may hold. -1 means no limit."]],
 deep:[{"t": "Logical decoding and slots in detail", "md": "- Debezium uses **logical replication**: a slot with an output plugin («pgoutput») decodes WAL into row changes.\n- The slot tracks «restart_lsn» (oldest WAL still needed) and «confirmed_flush_lsn» (what the consumer acknowledged).\n- Postgres keeps WAL from the oldest «restart_lsn» across **all** slots. An inactive slot also holds back «catalog_xmin», which can **block vacuum of system catalogs**.\n- Postgres 13+: «max_slot_wal_keep_size» invalidates slots that fall too far behind (column «wal_status» shows «lost»)."}, {"t": "Disk-full triage on a Postgres primary", "md": "1. «df -h» and «du -sh» on «base/» vs «pg_wal/» vs logs.\n2. pg_wal big → check **slots** («pg_replication_slots»), **archiving** («pg_stat_archiver», failed «archive_command» also retains WAL), and «wal_keep_size».\n3. base big → bloat («pgstattuple»), a runaway table, temp files («temp_files» in «pg_stat_database»).\n4. Buy time safely: extend the volume, remove *logs* (not WAL), never VACUUM FULL under pressure."}],
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

/* ===== Work simulator: PostgreSQL ===== */
QUEST.work("postgres", [
{
 type:"timeline", title:"The checkout outage", three:"one mistake at most",
 brief:"Last Wednesday checkout was down for **14 minutes**. The fix in the moment was simple: cancel one query. Your manager asks you to write the postmortem, and to find the cause **behind** the cause, without blaming anyone.\n\nThe raw notes from the incident channel are below, shuffled.",
 events:[
  {at:"2025", kind:"cause", t:"The migration tool runs DDL with no «lock_timeout», so a migration waits for its lock as long as it takes."},
  {at:"09:40", kind:"cause", t:"An analyst starts a 25-minute report on the **primary**, reading «orders» (analytics isn't routed to a replica)."},
  {at:"10:02", kind:"trigger", t:"A deploy runs «ALTER TABLE orders ADD COLUMN gift_note text»."},
  {at:"10:03", kind:"symptom", t:"Checkout p99 jumps from 120 ms to 30 s and the app's connection pools run out."},
  {at:"10:05", kind:"symptom", t:"Checkout 5xx rate hits 38% and PagerDuty fires."},
  {at:"10:11", kind:"response", t:"On-call checks «pg_locks»: the ALTER waits on the report, and 340 queries wait on the ALTER."},
  {at:"10:16", kind:"response", t:"The report is cancelled. The ALTER finishes in 40 ms and traffic recovers."}
 ],
 whys:[
  {q:"Why did checkout fail?", o:["Every query touching «orders» was stuck waiting for a lock","The database ran out of CPU","The checkout service had a memory leak"], a:0, why:"CPU was idle during the outage: everything was *waiting*, not working."},
  {q:"Why was every query on «orders» waiting?", o:["They queued behind the ALTER, which was waiting for an ACCESS EXCLUSIVE lock","Autovacuum had locked the table","The table had grown too big to query"], a:0, why:"Autovacuum takes a weak lock that never blocks normal reads and writes."},
  {q:"Why did the ALTER wait so long?", o:["A 25-minute report held a conflicting lock, and the migration had no «lock_timeout»","ADD COLUMN always rewrites the whole table","Postgres was slow that day"], a:0, why:"Since Postgres 11, ADD COLUMN without a volatile default is metadata-only: it finished in 40 ms once it got the lock."},
  {q:"Why could this happen during a normal deploy?", o:["Our migration tooling doesn't set «lock_timeout» with retries, and long analytics queries run on the primary","The analyst shouldn't have run a report","Deploys shouldn't happen on Wednesdays"], a:0, why:"Blameless: the analyst did a normal thing. Ask what in our *system* let a normal action take checkout down."}
 ],
 deep:[
  {t:"The Postgres lock queue: how a 40 ms ALTER causes a 14-minute outage", md:"- Every query takes a table lock. A SELECT takes **ACCESS SHARE**; most ALTER TABLE forms need **ACCESS EXCLUSIVE**, which conflicts with **everything**.\n- Lock requests are granted **in order**. The ALTER can't get its lock while the report holds ACCESS SHARE, so it waits.\n- Here's the trap: **new** SELECTs and UPDATEs on «orders» conflict with the *waiting* ACCESS EXCLUSIVE request, so they queue **behind the ALTER**, even though they'd be compatible with the report.\n- Result: one long read + one DDL = the whole table frozen until the read finishes.\n\nDiagnose with «pg_locks» joined to «pg_stat_activity», or simply «select pid, pg_blocking_pids(pid), wait_event_type, query from pg_stat_activity where cardinality(pg_blocking_pids(pid)) > 0»."},
  {t:"Safe migrations: lock_timeout + retry", md:"~~~\nSET lock_timeout = '2s';         -- give up fast instead of blocking everyone\nSET statement_timeout = '30s';\nALTER TABLE orders ADD COLUMN gift_note text;\n-- tooling retries a few times with backoff on 'lock timeout'\n~~~\n- Waiting 2 s and failing is invisible to users; waiting 14 minutes is an outage.\n- Other safe patterns: «CREATE INDEX CONCURRENTLY»; add constraints as «NOT VALID» then «VALIDATE CONSTRAINT» (weaker lock); add columns without volatile defaults, backfill in batches.\n- Route analytics to a **read replica**, and set «idle_in_transaction_session_timeout» and «statement_timeout» for ad-hoc roles."},
  {t:"Writing a blameless postmortem", md:"- **Timeline** of facts with timestamps, including when contributing conditions were introduced.\n- Separate **trigger** (what set it off: often a normal action), **root causes** (weaknesses that let it become an incident), **symptoms** (what users and alerts saw) and **response**.\n- Ask **\"why?\"** until you reach something a **process or design change** can fix. \"Person X made a mistake\" is never the end: ask why the system let that mistake hurt.\n- Action items are specific, owned and dated: «lock_timeout in migration tool (owner, date)», not \"be more careful\"."}
 ],
 say:"The ALTER only needed 40 ms, but it queued for an ACCESS EXCLUSIVE lock behind a long report, and every new query queued behind it. The root causes were migrations without lock_timeout and analytics on the primary, so the actions were lock_timeout with retries in our tooling and routing reports to a replica."
},
{
 type:"logs", title:"Who is blocking whom?", three:"answer all 4 questions with at most 1 wrong tap",
 brief:"Payouts to merchants have been stuck for 45 minutes. The payout workers keep timing out, and the DB log is full of lock waits. Find the **deadlock**, find **who's holding everyone up**, and find **why**.\n\nThe log mixes Postgres server logs, a monitoring snapshot and the payout-worker's app log.",
 source:"postgresql.log + pg_stat_activity snapshot + payout-worker log · 14:00–14:48",
 log:(() => { const L = [];
  L.push("14:00:01 LOG:  checkpoint starting: time", "14:00:09 LOG:  checkpoint complete: wrote 9121 buffers (1.1%); 0 WAL file(s) added, 0 removed, 12 recycled", "14:00:31 LOG:  connection authorized: user=payout_svc database=payments application_name=payout-worker",
   "14:01:02 APP  INFO payout-worker[w3]: batch 88 claimed (412 payouts)", "14:01:02 APP  INFO payout-worker[w3]: BEGIN; UPDATE payouts SET status='processing' WHERE batch_id=88",
   "14:01:03 APP  INFO payout-worker[w3]: calling bank API for batch 88 (inside the open transaction)",
   "14:01:33 APP  ERROR payout-worker[w3]: bank API timeout after 30s for batch 88; returning to queue [y](exception handler returns without ROLLBACK; connection goes back to the pool)[/y]",
   "14:02:10 LOG:  automatic vacuum of table \"payments.public.webhooks\": index scans: 1, pages: 0 removed, 18211 remain",
   "14:03:12 LOG:  process 5120 still waiting for ShareLock on transaction 99812 after 1000.041 ms",
   "14:03:12 DETAIL:  Process holding the lock: 4412. Wait queue: 5120.",
   "14:03:12 STATEMENT:  UPDATE payouts SET status='processing' WHERE batch_id=88 AND status='queued'");
  for (let k = 0; k < 6; k++) L.push(`14:${String(5 + k * 3).padStart(2, "0")}:12 LOG:  process ${5133 + k * 7} still waiting for ShareLock on transaction 99812 after 1000.0${k}3 ms`, `14:${String(5 + k * 3).padStart(2, "0")}:12 DETAIL:  Process holding the lock: 4412. Wait queue: 5120, ${5133 + k * 7}${k ? ", …" : ""}.`);
  L.push("14:22:40 LOG:  process 6011 detected deadlock while waiting for ShareLock on transaction 99840 after 1000.112 ms",
   "14:22:40 ERROR:  deadlock detected",
   "14:22:40 DETAIL:  Process 6011 waits for ShareLock on transaction 99840; blocked by process 6020. Process 6020 waits for ShareLock on transaction 99838; blocked by process 6011.",
   "14:22:40 HINT:  See server log for query details.",
   "14:22:40 CONTEXT:  while updating tuple (412,7) in relation \"merchant_balances\"",
   "14:22:40 STATEMENT:  UPDATE merchant_balances SET pending = pending - $1 WHERE merchant_id = $2",
   "14:22:40 APP  WARN payout-worker[w5]: deadlock on merchant_balances, retrying batch 91 (worker updates merchants in input order)",
   "14:30:00 LOG:  checkpoint starting: time", "14:30:07 LOG:  checkpoint complete: wrote 7012 buffers (0.9%)",
   "14:44:00 MON  pg_stat_activity snapshot (top by xact_age):",
   "14:44:00 MON    pid=4412 user=payout_svc state=[r]idle in transaction[/r] xact_age=00:42:58 wait_event=ClientRead query=UPDATE payouts SET status='processing' WHERE batch_id=88",
   "14:44:00 MON    pid=5120 user=payout_svc state=active xact_age=00:41:02 wait_event=Lock:transactionid query=UPDATE payouts SET status='processing' WHERE batch_id=88 AND status='queued'",
   "14:44:00 MON    pid=7790 user=metabase state=active xact_age=00:00:03 wait_event= query=SELECT count(*) FROM payouts WHERE status='paid'",
   "14:45:10 LOG:  automatic analyze of table \"payments.public.payouts\"",
   "14:47:55 APP  INFO payout-worker[w2]: batch 93 complete (388 payouts)");
  return L.join("\n"); })(),
 qs:[
  {q:"There was a deadlock. Tap the line that shows the two processes waiting on each other.", a:["Process 6011 waits for ShareLock on transaction 99840; blocked by process 6020"], tip:"Filter for «deadlock».", why:"**6011 waits for 6020 and 6020 waits for 6011**: a cycle. Postgres checks for cycles after «deadlock_timeout» (1 s) and **kills one transaction** so the other can finish. The app log says why: workers update «merchant_balances» **in input order**, so two batches touching the same merchants in different orders can cross. Fix: **lock rows in a consistent order** (e.g. «ORDER BY merchant_id»). This one resolved itself, though; it's not why payouts are stuck."},
  {q:"Most workers are stuck waiting. Tap the line that names the process **holding** the lock they're all waiting for.", a:["Process holding the lock: 4412"], tip:"Filter for «holding».", why:"Every wait names the same holder: **process 4412**. Unlike a deadlock, this is a plain **blocking chain**: Postgres won't kill anyone, because 4412 isn't waiting on anything. It's just holding row locks and doing nothing."},
  {q:"What is process 4412 doing? Tap the line that shows its state.", a:["pid=4412 user=payout_svc state=[r]idle in transaction"], tip:"Filter for «4412».", why:"**idle in transaction for 43 minutes.** The session ran an UPDATE inside a transaction and then **never committed or rolled back**. Its row locks on batch 88 stay held until the transaction ends. «wait_event=ClientRead» means Postgres is waiting for the *client* to send something."},
  {q:"Why did the app leave that transaction open? Tap the app log line.", a:["bank API timeout after 30s for batch 88"], tip:"Filter for «batch 88».", why:"The worker called the **bank API inside an open DB transaction**, and on timeout its exception handler **returned without ROLLBACK**. The connection went back to the pool still holding the transaction. Fixes: never make network calls inside a DB transaction; always «rollback» in «finally» (or use a context manager); set «idle_in_transaction_session_timeout» (e.g. 60 s) as a safety net."}
 ],
 notes:[["checkpoint","Routine checkpoints. Unrelated."],["automatic vacuum","Autovacuum doing its job. Its locks don't block UPDATEs."],["automatic analyze","Routine statistics refresh."],["connection authorized","A normal login."],["metabase","A short analytics query, 3 s old. Not holding anyone up."],["still waiting","A waiter. Who is it waiting for?"],["batch 93 complete","A different batch that didn't touch the locked rows."],["claimed","Normal start of a batch."]],
 deep:[
  {t:"Deadlock vs blocking chain", md:"| | Deadlock | Blocking chain |\n|---|---|---|\n| Shape | A cycle: A waits for B, B waits for A | A line: everyone waits for one holder |\n| Postgres reaction | Detects after «deadlock_timeout» (1 s), **aborts one** | **Nothing**: waits forever (or until a timeout) |\n| Typical cause | Rows locked in different orders | A long or abandoned transaction |\n| Fix | Consistent lock ordering, smaller transactions, retry on 40P01 | Short transactions, timeouts, find and end the holder |"},
  {t:"Finding blockers live", md:"~~~\nselect pid, pg_blocking_pids(pid) as blocked_by, state,\n       now() - xact_start as xact_age, wait_event_type, left(query, 60)\nfrom pg_stat_activity\nwhere state <> 'idle'\norder by xact_start;\n~~~\n- Turn on «log_lock_waits = on» so any wait longer than «deadlock_timeout» is logged with the holder.\n- End a stuck session with «pg_cancel_backend(pid)» (cancels the current query) or «pg_terminate_backend(pid)» (ends the session, rolls back its transaction). For idle in transaction, you need **terminate**."},
  {t:"Why network calls inside transactions are dangerous", md:"- A transaction holds its row locks (and its snapshot) **until commit or rollback**. Anything slow in the middle (HTTP, sleeps, user input) multiplies lock time.\n- Long transactions also block **VACUUM** from removing dead rows newer than their snapshot, causing bloat across the whole database.\n- Pattern: mark the batch as *claimed* in a short transaction, commit, call the external API, then record the result in another short transaction. Make each step idempotent so retries are safe.\n- Safety nets: «idle_in_transaction_session_timeout», «statement_timeout», and pool settings that reset connections returned mid-transaction."}
 ],
 say:"Deadlocks are cycles that Postgres resolves by aborting one transaction; blocking chains are a single holder everyone waits on, and Postgres won't break those. I find the holder with pg_blocking_pids, check if it's idle in transaction, and fix the app: no network calls inside DB transactions, rollback in finally, and idle_in_transaction_session_timeout as a backstop."
}
]);

QUEST.story("postgres", {title:"The table that kept growing", icon:"🎈", place:"Tue 11 AM · capacity review", setup:"The 'sessions' table holds 2M live rows but takes 180 GB on disk, and queries on it get slower every week.",
 meters:[["size","Table size"," GB",180,10,"low",200],["lat","Query p95"," ms",900,50,"low",1000],["trust","Team confidence","%",40,70,"high",100]],
 beats:[["ravi","sessions is only 2M rows. Why is it 180 GB?"],["ui","n_live_tup: 2,104,331   n_dead_tup: 61,882,019\nlast_autovacuum: 9 days ago\noldest xact: 6 days (idle in transaction, user=report_bot)"],
  ["q","Why is the table so big?",[["Updates leave dead row versions (MVCC); autovacuum can't remove them while a 6-day-old transaction might still need them",1,"Postgres never updates in place: every UPDATE writes a new tuple. VACUUM cleans dead ones only when no transaction can still see them.","A library that keeps old editions until the last borrower returns theirs, and one borrower never comes back."],["The rows are very wide",0,"2M rows would need 90 KB each; the 61M dead tuples are the real story.","Blaming thick books for a full shelf of old editions."],["Indexes are too big",0.5,"Indexes bloat too, but the heap's dead tuples dominate.","Only counting the catalogue cards."]]],
  ["q","What do you do first?",[["End the idle-in-transaction session and set idle_in_transaction_session_timeout",1,"Removes the xmin horizon blocker so vacuum can work, and stops it happening again.","Getting the missing borrower to return the book, and adding late fees."],["Run VACUUM FULL now",0.5,"Reclaims space, but takes an ACCESS EXCLUSIVE lock for the whole rewrite and still can't remove tuples the old transaction needs.","Closing the library to rebuild shelves while the borrower still holds the book."],["Add more disk",0,"Treats the symptom; it keeps growing.","A bigger storeroom."]]],
  ["q","Dead tuples drop, but the file is still 180 GB. How do you shrink it without downtime?",[["pg_repack (or pg_squeeze): rebuild the table online with only a brief lock at the swap",1,"Plain VACUUM marks space reusable but rarely returns it to the OS; pg_repack copies live rows to a new table and swaps.","Moving books to a new, right-sized room while the library stays open."],["Plain VACUUM again",0.5,"Space becomes reusable inside the table, so growth stops, but the file doesn't shrink.","Empty shelves you can reuse, same room size."],["DROP and recreate the table",0,"Downtime and data loss risk.","Burning the library to tidy it."]]],
  ["q","How do you keep this table healthy?",[["Per-table autovacuum tuning (lower scale_factor), HOT-friendly updates (fillfactor), and alerts on dead tuples and long transactions",1,"High-churn tables need vacuum to run more often; fillfactor lets updates stay on the same page (HOT) without index changes.","Cleaning the busiest shelves daily, not monthly."],["Disable autovacuum to save CPU",0,"Guarantees bloat and, eventually, transaction ID wraparound.","Firing the cleaners."]]],
  ["ravi","Repacked: 180 GB → 6 GB, p95 at 30 ms. Alerts are in."]],
 learned:["MVCC: UPDATE = new tuple; VACUUM removes dead ones only below the oldest snapshot.","Long or idle transactions block vacuum everywhere.","VACUUM reuses space; pg_repack returns it online."]});
QUEST.mock("postgres", {title:"PostgreSQL round", who:"ana", intro:"I'm Ana. Let's go deep on Postgres: MVCC, indexes and operations.", setup:"Ana is a staff engineer on the payments database team.",
 qs:[["Explain MVCC in Postgres.","Every row version (tuple) has «xmin» (creating transaction) and «xmax» (deleting/updating one). A snapshot decides which versions are visible. UPDATE = insert a new version + mark the old dead. Readers never block writers. The cost: **dead tuples** that **VACUUM** must clean, and transaction ID **wraparound** that vacuum's freezing prevents.",[["Tuples carry xmin/xmax; snapshots decide visibility; updates create new versions; VACUUM cleans dead ones and freezes old ones",1,"Complete, including the costs."],["Postgres locks rows so readers wait for writers",0,"The opposite of MVCC."],["Each transaction gets a copy of the table",0,"Versions are per-row, not per-table copies."]]],
  ["When would you use a GIN index vs a B-tree vs BRIN?","- **B-tree**: equality and range on scalar columns, sorting. The default.\n- **GIN**: many keys per row: JSONB containment, arrays, full-text search.\n- **BRIN**: huge append-only tables where values correlate with physical order (timestamps): tiny index, block-range pruning.\n- Also **partial** indexes (WHERE status='pending') and **covering** indexes (INCLUDE).",[["B-tree for scalars/ranges, GIN for JSONB/arrays/full-text, BRIN for huge time-ordered tables",1,"Right tool for each shape."],["Always B-tree; others are niche",0.5,"Misses big wins on JSONB and time-series."],["GIN is just a faster B-tree",0,"Different structure for different data."]]],
  ["A query got slow after a data load. What do you check?","1. «EXPLAIN (ANALYZE, BUFFERS)»: compare estimated vs actual rows.\n2. Bad estimates → stale stats: «ANALYZE»; for correlated columns, «CREATE STATISTICS».\n3. Plan changes: seq scan vs index, nested loop on large rows.\n4. Bloat, «work_mem» spills (\"external merge\"), lock waits.",[["EXPLAIN ANALYZE, compare estimates to actuals, refresh stats, look for spills and plan changes",1,"Evidence-first."],["Add an index on every column in the WHERE clause",0,"Guessing; may not help and slows writes."],["Increase shared_buffers",0.5,"Rarely the cause of a sudden plan change."]]],
  ["How do you set up high availability for Postgres?","Streaming replication to one or more standbys (sync for zero data loss on critical writes, async otherwise), automatic failover with **Patroni** (or a managed service), a connection layer (PgBouncer/HAProxy/DNS) that follows the primary, **PITR backups** (WAL archiving, pgBackRest), and regular failover drills.",[["Streaming replicas + Patroni-style failover + a pooler that follows the primary + PITR backups + drills",1,"Covers availability and recovery."],["A nightly pg_dump",0,"Backup, not HA, and loses up to a day."],["Two primaries writing at once",0,"Postgres core isn't multi-primary; this causes conflicts."]]]],
 learned:["MVCC: versions, snapshots, vacuum and freezing.","Index types match data shapes.","Slow query: estimates vs actuals first."]});
