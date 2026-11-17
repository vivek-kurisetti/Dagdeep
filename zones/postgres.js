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
