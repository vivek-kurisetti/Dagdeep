QUEST.zone("debezium", {
mission:["priya","Finance wants every MySQL and Postgres change in the lake within a minute, without hammering the databases. That's change data capture. Let's master Debezium."],
levels:[
{t:"Why log-based CDC", sub:"Query vs log", rounds:[
 ["learn","Read the database's own log","Debezium reads the **transaction log** (MySQL binlog, Postgres WAL, Mongo oplog) instead of querying tables. It sees every insert, update and **delete**, in commit order, with almost no load on the database.",["App commits a transaction","DB writes it to its log","Debezium reads the log","Change events land in Kafka"]],
 ["sort","Query-based polling or log-based CDC?",{"Query polling (updated_at)":["Misses hard deletes","Misses changes between polls","Needs an updated_at column","Adds query load"],"Log-based CDC":["Sees every change incl. deletes","Commit order preserved","Before and after images","Low DB load"]},"Log-based CDC is complete and cheap."],
 ["learn","Runs on Kafka Connect","Debezium connectors are **Kafka Connect source connectors**. Connect stores connector offsets (log position) in a Kafka topic, so after a restart it resumes from the last position. Debezium Server runs without Kafka for other sinks."],
 ["match","Which log does Debezium read?",[["MySQL","Binlog (ROW format)"],["PostgreSQL","WAL via logical decoding (pgoutput)"],["MongoDB","Change streams (oplog)"],["SQL Server","CDC tables"]],"Each connector speaks its database's native log."],
 ["tf","CDC basics",[["Debezium needs an updated_at column.",false,"It reads the log, so no schema changes are needed."],["Debezium delivers at-least-once.",true,"After a crash it can replay; make sinks idempotent."],["Connector offsets are stored in Kafka Connect's offset topic.",true,"That's how it resumes."]]]
]},
{t:"MySQL & Postgres setup", sub:"Binlog, WAL, slots", rounds:[
 ["learn","MySQL prerequisites","Binlog on with «binlog_format=ROW» and «binlog_row_image=FULL», a unique «server.id» for the connector, GTIDs recommended, and binlog retention long enough to survive connector downtime."],
 ["fill","MySQL settings for Debezium",'binlog_format = ___\nbinlog_row_image = ___\ngtid_mode = ___',["ROW","FULL","ON"],["STATEMENT","MINIMAL","OFF","MIXED"],"ROW + FULL gives complete before/after images."],
 ["learn","Postgres: slots hold WAL","Postgres uses «wal_level=logical», a **publication** (which tables) and a **replication slot**. The slot remembers what the connector has confirmed and **keeps WAL until then**. A stopped connector means WAL piles up and can fill the disk."],
 ["pick","The connector has been down 3 days and the Postgres disk is nearly full. Why?",["Too many indexes","The replication slot is retaining WAL","Autovacuum stopped","Binlog retention"],1,"Slots never release WAL the consumer hasn't confirmed. Monitor slot lag; drop abandoned slots."],
 ["learn","Heartbeats for quiet tables","If the captured tables are idle but the DB is busy, the slot's confirmed position doesn't move and WAL grows. «heartbeat.interval.ms» plus a heartbeat action query keeps the offset advancing."],
 ["bug","Which Postgres setting breaks Debezium?",["wal_level = replica","max_replication_slots = 10","max_wal_senders = 10","publication: dbz_publication FOR TABLE payments"],0,"Logical decoding needs wal_level = logical."],
 ["tf","Setup facts",[["binlog_format=STATEMENT works fine for Debezium.",false,"It needs ROW events."],["Purged binlogs force a new snapshot.",true,"The connector's position no longer exists."],["pgoutput is built into Postgres 10+.",true,"No plugin install needed."]]]
]},
{t:"Snapshots", sub:"Initial and incremental", rounds:[
 ["learn","Initial snapshot","On first start, Debezium reads existing rows (events with «op=r») and then streams from the log position it recorded. Modes include «initial», «no_data» (schema only), «when_needed» and «initial_only»."],
 ["order","Initial snapshot flow (MySQL)",["Record the current binlog position","Read the table schemas","SELECT existing rows → op=r events","Switch to streaming from the recorded position"],"Nothing is missed between snapshot and stream."],
 ["learn","Incremental snapshots","Re-snapshot a table **while streaming** by inserting a row into the **signaling table** (or a Kafka signal). Debezium reads the table in chunks by primary key and uses watermarks to deduplicate against live changes. No global lock."],
 ["pick","You added a new table to capture. Best way to backfill it without stopping the connector?",["Delete offsets and restart","Send an execute-snapshot signal for that table","Copy rows manually to Kafka","Switch to snapshot.mode=always"],1,"Incremental snapshots backfill in chunks while streaming continues."],
 ["match","snapshot.mode",[["initial","Snapshot once, then stream"],["no_data","Only capture schema, then stream"],["when_needed","Snapshot if offsets are missing or invalid"],["initial_only","Snapshot and stop"]],"Pick the mode for the situation."]
]},
{t:"Change events", sub:"Envelope, deletes, topics", rounds:[
 ["learn","The event envelope","Each event value has «before», «after», «source» (db, table, position, ts) and «op»: c create, u update, d delete, r read (snapshot). «ts_ms» says when Debezium processed it."],
 ["match","op codes",[["c","Insert"],["u","Update"],["d","Delete"],["r","Snapshot read"]],"Four letters to remember."],
 ["learn","Deletes produce two records","A delete emits an event with «op=d» (before set, after null) and then a **tombstone** (key, null value) so Kafka compaction can remove the key."],
 ["pick","A delete event: which fields are set?",["before = row, after = null","before = null, after = row","Both set","Both null"],0,"The tombstone that follows has a null value entirely."],
 ["learn","Flatten for sinks","Many sinks want a flat row. The **ExtractNewRecordState** SMT unwraps «after» and can add «__op» and «__deleted» fields. Topics are named «prefix.db.table» by default."],
 ["sort","Envelope field or SMT?",{"Envelope field":["before","after","source","op"],"Transformation (SMT)":["ExtractNewRecordState","Outbox EventRouter","RegexRouter"]},"SMTs reshape events inside Connect."],
 ["tf","Event facts",[["Snapshot rows arrive with op=c.",false,"They use op=r."],["The record key is the table's primary key.",true,"So updates to a row stay ordered in one partition."],["Without a primary key, ordering per row isn't guaranteed.",true,"Set message.key.columns for keyless tables."]]]
]},
{t:"Patterns", sub:"Outbox, schema changes, sinks", rounds:[
 ["learn","The outbox pattern","Instead of writing to the DB and Kafka separately (dual write), the service writes its business row and an **outbox** row in the **same transaction**. Debezium streams the outbox table; the EventRouter SMT routes events by aggregate type."],
 ["pick","Why not just write to MySQL and then publish to Kafka in the service?",["Kafka is slower","If the service crashes between the two, they disagree","MySQL can't handle it","Debezium requires it"],1,"Dual writes aren't atomic. The outbox makes the event part of the DB transaction."],
 ["learn","Idempotent sinks","Debezium is at-least-once: after a crash, events replay. Sinks should **upsert by primary key** and order by source position («source.lsn» or binlog file+pos / GTID), not apply blindly."],
 ["order","CDC into an Iceberg table",["Debezium captures MySQL changes to Kafka","Stream job reads events and deduplicates by key + position","MERGE INTO the Iceberg table (upsert / delete)","Compaction merges the small files"],"Upsert by key makes replays safe."],
 ["sort","Safe or unsafe schema change for CDC consumers?",{"Usually safe":["Add a nullable column","Add a column with a default"],"Needs coordination":["Rename a column","Change a column type","Drop a column consumers use"]},"Pair CDC with Schema Registry compatibility rules."]
]},
{t:"Boss: Lake in a minute", boss:true, time:30, rounds:[
 ["pick","Connector restarts and says the binlog position no longer exists. Why?",["Binlog purged before the connector caught up","Wrong Kafka topic","Missing index","ROW format"],0,"Increase binlog retention; re-snapshot needed."],
 ["pick","Postgres disk alarm; captured tables are idle but other tables are busy. Fix?",["Enable heartbeats so the slot advances","Increase shared_buffers","Disable autovacuum","Add replicas"],0,"Heartbeats move the confirmed LSN."],
 ["pick","Lake table has deleted rows that never disappear. Sink ignores…",["op=d events","op=r events","source.ts_ms","Topic prefix"],0,"Deletes must be applied in the MERGE."],
 ["pick","Replayed events after a crash created duplicates in the warehouse. Fix?",["Upsert by primary key","Switch to snapshot.mode=always","acks=0","Drop the tombstones"],0,"At-least-once needs idempotent sinks."],
 ["pick","Order service sometimes publishes events for orders that were rolled back. Fix?",["Outbox pattern with Debezium","Bigger Kafka batches","Exactly-once consumer","More partitions"],0,"Events only exist if the transaction commits."],
 ["pick","You need to backfill a newly captured table without downtime. Use…",["Incremental snapshot signal","Delete connector offsets","snapshot.mode=no_data","Restart MySQL"],0,"Chunked backfill while streaming."]
]}
]});

QUEST.more("debezium", [
{act:"Expert", t:"MySQL connector internals", sub:"Binlog events, schema history", rounds:[
 ["learn","What the binlog actually contains","In ROW format, a transaction is a stream of events: **GTID**, **QUERY** (BEGIN or DDL), **TABLE_MAP** (table id → db.table + column types), **WRITE_ROWS / UPDATE_ROWS / DELETE_ROWS**, and **XID** (commit).",["GTID event","QUERY BEGIN","TABLE_MAP","WRITE/UPDATE/DELETE_ROWS","XID commit"],null,`### Row events carry values, not column names
A row event holds raw column values in position order plus the column types from TABLE_MAP. To turn position 3 into «amount DECIMAL(18,2)», the connector needs the **table schema as it was at that point in the binlog**.

### Schema history topic
That's why the MySQL connector keeps a **schema history topic** («schema.history.internal.kafka.topic»). Every DDL it sees is recorded. On restart, it replays the DDL history up to the stored binlog position to rebuild in-memory schemas, then parses new events correctly.
- Must be a **single-partition** topic with **infinite retention** (no compaction or deletion).
- Losing it means the connector can't interpret old positions: recover with a schema-only snapshot («snapshot.mode=recovery» / «schema_only_recovery» in older versions).
- «schema.history.internal.store.only.captured.tables.ddl=true» keeps it small on servers with thousands of tables.

### Offsets
The stored offset includes binlog file + position, the **GTID set**, the row number within the event and whether a snapshot was running. With GTIDs, the connector can resume on a **different server** (after failover) as long as it has the same GTID history.

### binlog_row_image
FULL gives complete before and after images. MINIMAL logs only changed columns plus the key, so «before»/«after» are partial — downstream upserts would overwrite columns with nulls.`],
 ["order","Order of binlog events for one INSERT transaction",["GTID event","QUERY event: BEGIN","TABLE_MAP for payments","WRITE_ROWS with the row values","XID commit event"],"Debezium emits the change event; XID marks the transaction boundary."],
 ["pick","The schema history topic was created with 7-day retention. A month later the connector restarts and fails to parse events. Why?",["Old DDL was deleted, so it can't rebuild the schema at its binlog position","Kafka is down","ROW format","GTID mismatch"],0,"Schema history needs infinite retention and one partition."],
 ["learn","Snapshot consistency","The initial snapshot must line up exactly with a binlog position. Debezium opens a **REPEATABLE READ** transaction with a consistent snapshot and records the position while briefly holding a lock.",null,null,`### The classic sequence
1. Acquire a **global read lock** («FLUSH TABLES WITH READ LOCK») — or table-level locks if the user lacks RELOAD privilege.
2. Start a REPEATABLE READ transaction («START TRANSACTION WITH CONSISTENT SNAPSHOT»).
3. Read the current binlog file, position and GTID set.
4. Read the schemas of captured tables.
5. **Release the lock** («snapshot.locking.mode=minimal», the default) — the transaction keeps a consistent view without blocking writers.
6. SELECT all rows → «op=r» events.
7. Commit the read transaction and start streaming from the recorded position.

### Trade-offs
- «snapshot.locking.mode=none»: no lock at all; safe only if no DDL happens during the snapshot.
- Huge tables: the long-running REPEATABLE READ transaction keeps undo history alive on the source. Prefer **incremental snapshots** for very large tables.
- On Aurora/RDS without RELOAD, Debezium uses table-level locks held for the whole snapshot — schedule it carefully.`],
 ["match","Setting",[["binlog_row_image=FULL","Complete before and after row images"],["snapshot.locking.mode=minimal","Lock only while reading schema and position"],["schema.history.internal.kafka.topic","Stores DDL to rebuild schemas on restart"],["gtid_mode=ON","Resume after failover to another server"]],"Each one protects correctness."],
 ["tf","MySQL CDC truths",[["binlog_row_image=MINIMAL is fine for full-row upserts downstream.",false,"Unchanged columns are missing."],["The snapshot lock is held for the whole snapshot in minimal mode.",false,"Released after schema and position are captured."],["Long snapshots keep old row versions alive in InnoDB undo.",true,"The repeatable-read transaction pins them."]]]
]},
{act:"Expert", t:"Postgres connector internals", sub:"Replica identity, TOAST, slots", rounds:[
 ["learn","Replica identity decides the before image","Postgres logical decoding only includes old values that the table's **REPLICA IDENTITY** allows.",null,null,`| REPLICA IDENTITY | Before image on UPDATE/DELETE |
|---|---|
| DEFAULT | Only the primary key columns (and only if the key changed, for updates) |
| USING INDEX idx | Columns of that unique index |
| FULL | Every column (more WAL volume) |
| NOTHING | No old values at all |

Tables **without a primary key** and DEFAULT identity can't publish UPDATE/DELETE at all (Postgres errors on the write if they're in a publication). Use FULL or add a key.

### pgoutput and publications
Debezium uses the built-in **pgoutput** plugin. A **publication** lists tables (or ALL TABLES); «publication.autocreate.mode» = all_tables / filtered / disabled controls whether Debezium creates it. Changing «table.include.list» with a filtered publication updates it.

### Ordering and transactions
Logical decoding emits changes **in commit order**, transaction by transaction. Each event carries «lsn» and «txId» in «source». Large transactions are decoded fully at commit (or streamed in chunks with pgoutput protocol v2+ when enabled).`],
 ["pick","An UPDATE event's «before» only has payment_id, other fields null. Why?",["REPLICA IDENTITY DEFAULT","Wrong slot","TOAST","pgoutput bug"],0,"Set REPLICA IDENTITY FULL if downstream needs old values."],
 ["learn","TOAST and unchanged values","Large values (text, jsonb over ~2 KB) are stored out of line in **TOAST**. If an UPDATE doesn't touch a TOASTed column, the WAL doesn't contain it, so Debezium emits a placeholder: «__debezium_unavailable_value».",null,null,`### Why it bites
A downstream upsert that blindly writes «after» replaces a real 40 KB JSON document with the placeholder string. Options:
- Set REPLICA IDENTITY FULL (then old values, including TOAST, are logged).
- Handle the placeholder in the sink: if a field equals the unavailable marker, **keep the existing value** (column-level merge).
- Configure «unavailable.value.placeholder» to something easy to detect.

### Slots: the operational risk
The slot tracks «confirmed_flush_lsn». WAL from «restart_lsn» onward can't be removed. Watch:
~~~
SELECT slot_name, active, wal_status,
       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS retained
FROM pg_replication_slots;
~~~
«max_slot_wal_keep_size» caps retention (the slot is invalidated if exceeded — you'll need a new snapshot, but the database survives).

### Failover
Classic slots exist only on the primary. On failover to a replica, the slot is gone and Debezium must re-snapshot. Postgres 17 adds **failover slots** synchronized to standbys; managed services offer their own variants.`],
 ["bug","Which line will corrupt large JSON columns in the lake?",["valid = df.filter(col('op') != 'r')","merged = target.merge(changes, 'payment_id')","merged.update_all_columns_from('after')","merged.commit()"],2,"Untouched TOAST columns arrive as __debezium_unavailable_value; blindly copying 'after' overwrites real data."],
 ["sort","Fix for which problem?",{"REPLICA IDENTITY FULL":["Need full before images","Keyless table must publish updates"],"Heartbeats":["Slot not advancing on a busy DB with idle captured tables"],"max_slot_wal_keep_size":["Protect the DB disk from an abandoned slot"],"Failover slots (PG17)":["Keep CDC position after promoting a standby"]},"Know which knob fixes which outage."],
 ["tf","Postgres CDC truths",[["Logical decoding delivers changes in commit order.",true,"Transaction by transaction."],["A table without a primary key works fine with REPLICA IDENTITY DEFAULT.",false,"Updates/deletes can't be published."],["An invalidated slot can be resumed without a re-snapshot.",false,"Needed WAL is gone."]]]
]},
{act:"Expert", t:"Incremental snapshots", sub:"Watermark algorithm (DBLog)", rounds:[
 ["learn","Backfill while streaming without locks","Incremental snapshots read a table in **primary-key chunks** while the log keeps streaming. Watermarks around each chunk let Debezium drop chunk rows that were changed concurrently.",["Write LOW watermark to signal table","SELECT next chunk by PK","Write HIGH watermark","Stream events between LOW and HIGH; remove those keys from the chunk buffer","Emit remaining chunk rows as op=r"],null,`### The algorithm (based on Netflix's DBLog)
1. Debezium writes an **open (low) watermark** row to the signaling table. It appears in the log stream.
2. It runs «SELECT … WHERE pk > last_pk ORDER BY pk LIMIT chunk_size» and holds the rows in memory.
3. It writes a **close (high) watermark**.
4. While streaming, any change event for a key **in the chunk buffer** that appears between the low and high watermarks means the row changed concurrently: the buffered snapshot row is **dropped** (the streamed event is newer).
5. At the high watermark, the remaining buffered rows are emitted as «op=r» events.

### Consequences
- No table locks and no long transaction.
- Snapshot rows and live changes are interleaved in the topic; consumers must treat «r» like an upsert and order by source position.
- Progress is stored in offsets, so the snapshot **resumes** after restarts.
- «incremental.snapshot.chunk.size» (1,024 rows by default) trades memory for speed.

### Triggering
Insert into the signaling table: «INSERT INTO debezium_signal VALUES ('ad-hoc-1', 'execute-snapshot', '{"data-collections": ["shop.payments"], "type": "incremental"}')». Or send the signal through a Kafka signal topic, which also enables **read-only** incremental snapshots on MySQL with GTIDs (no writes to the source).`],
 ["order","One chunk of an incremental snapshot",["Write the low watermark","Read chunk rows by PK into a buffer","Write the high watermark","Drop buffered rows whose keys changed between the watermarks","Emit the remaining rows as op=r"],"Newer streamed changes win."],
 ["pick","During an incremental snapshot, payment 77 is updated between the watermarks. What reaches Kafka for payment 77 from this chunk?",["Both the snapshot row and the update","Only the streamed update event","Only the snapshot row","Nothing"],1,"The buffered snapshot row is dropped because the streamed event is newer."],
 ["num","A table has 60 million rows, chunk size 1,024. About how many chunks will the incremental snapshot run? (thousands, rounded)",59,1,"thousand chunks","60,000,000 ÷ 1,024 ≈ 58,594 chunks ≈ 59 thousand. Larger chunks = fewer round trips, more memory."],
 ["tf","Incremental snapshot truths",[["Incremental snapshots need a global read lock.",false,"No locks; watermarks handle concurrency."],["They resume after a connector restart.",true,"Progress is stored in offsets."],["Consumers must treat op=r rows as upserts.",true,"They interleave with live changes."]]]
]},
{act:"Expert", t:"Delivery, ordering & schemas", sub:"Duplicates, transactions, evolution", rounds:[
 ["learn","Where duplicates come from","Kafka Connect commits source offsets periodically («offset.flush.interval.ms», 60 s by default). If the connector crashes, it restarts from the last committed offset and **re-emits** everything after it.",null,null,`### Sizing the replay
At 2,000 events/s and a 60 s flush interval, a crash can replay up to ~120,000 events. Lower the interval to reduce replays (more offset writes), but never rely on zero duplicates.

### Exactly-once source (KIP-618)
Kafka Connect 3.3+ supports exactly-once for source connectors that implement it: records and offsets are written in one Kafka transaction («exactly.once.source.support=enabled» on the worker). Several Debezium connectors support it. Downstream consumers still need read_committed and sinks still need idempotency.

### Ordering
- Per row: events use the table's primary key as the Kafka key → same partition → ordered.
- Across tables or rows: **no global order** in Kafka. To rebuild transactions, enable «provide.transaction.metadata=true»: Debezium emits BEGIN/END events with event counts per table to a «.transaction» topic, and each event carries «transaction.id» and order.
- Primary key change: Debezium emits a **delete** (old key) + tombstone + **create** (new key), with headers linking them.

### Idempotent sinks
Upsert by key and **ignore older events** using a monotonic source position: Postgres «lsn», MySQL «gtid»+row or file+pos, or Debezium's «source.ts_ms» only as a weak fallback.`],
 ["num","Connector emits 2,000 events/s; offset.flush.interval.ms = 60,000. Worst-case events replayed after a crash?",120000,5000,"events","2,000 × 60 s = 120,000. Make sinks idempotent."],
 ["match","Need → feature",[["Rebuild whole source transactions downstream","provide.transaction.metadata"],["Records + offsets atomically in Kafka","Exactly-once source support (KIP-618)"],["Drop older replays in the sink","Compare source LSN / GTID position"],["Handle a primary key update","Delete + tombstone + create events"]],"Ordering and dedup are your sink's job."],
 ["learn","Schema evolution end to end","With Avro/Protobuf + Schema Registry, each DDL change produces a new schema version for the topic. Debezium's change event schemas follow the source columns.",null,null,`### What breaks consumers
- **Add nullable column**: new optional field — BACKWARD compatible.
- **Drop column**: field disappears — fine for readers that don't need it, breaks those that do.
- **Rename column**: looks like drop + add. Data in the old name stops arriving.
- **Change type** (INT → BIGINT, VARCHAR(20) → TEXT): may be compatible (int widening) or not (string → int).

### Safe rollout recipe
1. Agree compatibility mode per subject (BACKWARD is typical).
2. Make DDL additive first (add new column, dual-write), migrate consumers, then remove the old column.
3. For the lake, map new fields into the table schema (Iceberg schema evolution by field id) before data arrives, or enable automatic schema evolution in the sink.

### Gotchas
- «decimal.handling.mode» (precise/double/string): precise uses Connect Decimal (bytes), which many consumers can't read directly.
- «time.precision.mode» and timezone handling for TIMESTAMP vs DATETIME.
- Enum/SET columns, JSON columns, spatial types map to strings or structs: check before production.`],
 ["sort","Compatible under BACKWARD or not?",{"Compatible":["Add a nullable column","Widen INT to BIGINT"],"Breaking":["Rename a column","Change VARCHAR to INT","Drop a column a consumer requires"]},"Plan DDL with your consumers."],
 ["tf","Delivery truths",[["Debezium guarantees no duplicates by default.",false,"At-least-once by default."],["A primary key update becomes delete + create events.",true,"Keys change partitions."],["Kafka gives a global order across all tables.",false,"Only per partition."]]]
]},
{act:"Expert", t:"Operating CDC at scale", sub:"Metrics, tuning, sinks", rounds:[
 ["learn","Watch the right metrics","Debezium exposes JMX metrics per connector. The key ones tell you whether you're keeping up with the source and whether the internal queue is backing up.",null,null,`| Metric | Meaning | Alert when |
|---|---|---|
| MilliSecondsBehindSource | Delay between commit in the DB and processing | Growing steadily |
| QueueRemainingCapacity | Free slots in the internal queue | Near 0 (Kafka/producer is the bottleneck) |
| TotalNumberOfEventsSeen | Throughput | Drops to 0 while DB is busy |
| SnapshotRunning / RemainingTableCount | Snapshot progress | Stuck |
| Connected | Connection to the DB | false |

Plus source-side checks: binlog retention vs connector lag (MySQL), slot retained WAL (Postgres).

### Throughput knobs
- «max.batch.size» (2,048) and «max.queue.size» (8,192): events per batch from the reader and buffered events. Queue size must exceed batch size.
- «poll.interval.ms»: how long to wait for new events.
- Producer settings via «producer.override.*» (linger.ms, compression.type, batch.size) — needs the worker's override policy.
- Large snapshots: «snapshot.fetch.size», «snapshot.max.threads» for parallel table snapshots.

### Data hygiene
«column.exclude.list» to drop columns, «column.mask.with.N.chars» / hashing to mask PII before it ever reaches Kafka, «message.key.columns» for keyless tables, «skipped.operations» to ignore e.g. truncates.`],
 ["pick","MilliSecondsBehindSource grows and QueueRemainingCapacity is 0. Bottleneck?",["Writing to Kafka (producer side)","Reading the binlog","The source DB CPU","Schema registry"],0,"The reader is fast; the queue can't drain. Tune producer batching/compression or add broker capacity."],
 ["match","Need → setting",[["Never ship card numbers to Kafka","column.mask.with / column.exclude.list"],["Keyless table needs ordering per order_id","message.key.columns"],["Ignore TRUNCATE events","skipped.operations"],["Snapshot 40 tables faster","snapshot.max.threads"]],"Clean data at the source."],
 ["order","Recover from 'binlog position no longer available'",["Stop the connector","Increase binlog retention on the source","Decide: full re-snapshot or incremental snapshot of affected tables","Reset offsets or use snapshot.mode=when_needed","Restart and verify lag + row counts"],"Then alert on lag before retention runs out."],
 ["tf","Ops truths",[["max.queue.size must be larger than max.batch.size.",true,"Otherwise the connector refuses to start."],["Masking in Debezium keeps raw PII out of Kafka.",true,"Do it as early as possible."]]]
]},
{act:"Expert", t:"Expert boss: CDC war room", boss:true, time:45, rounds:[
 ["pick","MySQL connector can't parse events after restart; schema history topic had 7-day retention. Fix?",["Recreate history via schema-only recovery snapshot; set infinite retention, 1 partition","Delete offsets","Use STATEMENT binlog","Restart MySQL"],0,"Rebuild history; never let it expire."],
 ["pick","Lake rows show '__debezium_unavailable_value' in a jsonb column. Fix?",["REPLICA IDENTITY FULL or keep existing value in the sink when placeholder appears","Raise heartbeat","Bigger slot","Incremental snapshot"],0,"TOAST placeholder handling."],
 ["pick","After a Postgres failover, Debezium wants a full snapshot. Prevent next time?",["Failover slots (PG17) / provider slot sync","More WAL","Bigger chunk size","Avro"],0,"Slots must survive promotion."],
 ["pick","Backfill a 2 TB table on a busy primary without locks or long transactions?",["Incremental snapshot via signal","initial snapshot with global lock","mysqldump","Restart connector with snapshot.mode=always"],0,"Chunked with watermarks."],
 ["pick","Warehouse needs whole-transaction consistency across orders and items. Enable…",["provide.transaction.metadata","heartbeat.interval.ms","tombstones.on.delete=false","max.batch.size"],0,"BEGIN/END with counts per table."],
 ["pick","Sink applies an older event after a newer one following a replay. Fix?",["Ignore events with source position ≤ stored position per key","Bigger flush interval","Disable retries","More partitions"],0,"Monotonic position check."],
 ["pick","Lag grows; queue full; producer compression none. Quick win?",["producer.override.compression.type=zstd + linger.ms","Raise max.batch.size only","Lower max.queue.size","More snapshot threads"],0,"Bigger, compressed producer batches."]
]}
]);

/* ===== On-call desk: Debezium incident ===== */
QUEST.cases("debezium", [
{
 title:"The lake is missing two days of orders", icon:"🕳️", sev:1, clock:"10:15", channel:"inc-2340-orders-cdc-gap", svc:"orders-cdc · Debezium MySQL connector", need:4, uiName:"Connect UI",
 terms:[["CDC","Change data capture: streaming every insert, update and delete from a database's log into Kafka."],["Binlog","MySQL's change log, stored in numbered files (binlog.000412…). Debezium reads it like a replica would."],["Binlog retention","How long MySQL keeps binlog files before purging them («binlog_expire_logs_seconds»)."],["Connector offset","Where Debezium last read: binlog file + position (or GTID). It resumes from there after a restart."],["Snapshot","Debezium's initial full read of the tables. «when_needed» re-snapshots if the offset is no longer usable."],["Incremental snapshot","A snapshot done in chunks while streaming continues, triggered by a signal. No downtime, no table locks."],["Secrets rotation","Regularly changing database passwords. Every client must get the new one."]],
 pager:`[r]FIRING[/r]  lake.orders freshness > 6h   (last change applied: [r]Mon 16 Nov 09:02[/r])
connector  orders-cdc   state [r]FAILED[/r]
task 0     io.debezium.DebeziumException: [y]The connector is trying to read binlog starting at
           binlog.000412, pos 88231, but this is no longer available on the server.[/y]`,
 brief:"Finance noticed the lake's «orders» table hasn't changed since Monday morning. It's Wednesday. The connector streams MySQL «orders» into Kafka and on to the lake. A routine **DB password rotation** ran on Monday at 09:00.",
 slack:[
  {at:0, who:"meera", t:"lake.orders stopped at Monday 09:02. My reconciliation is off by ~2 days of orders. 😟"},
  {at:5, who:"priya", t:"The error says the binlog file it wants is gone. Two questions: why did it stop reading in the first place, and how long do we keep binlogs?", cmd:"curl -s connect:8083/connectors/orders-cdc/status"},
  {at:55, who:"dev", t:"Can we just restart it? Restarting fixes most Connect issues."},
  {on:"purged", who:"priya", t:"So the earliest binlog on the server is newer than our offset. How long does MySQL keep binlogs?", cmd:"mysql -h orders-db -e \"SHOW VARIABLES LIKE 'binlog_expire_logs_seconds'\""},
  {on:"retention", who:"ravi", t:"One day of binlog. So if the connector was down for more than a day, its position is gone. Why did it go down Monday? Check the worker logs from then.", cmd:"grep -i orders-cdc /var/log/kafka-connect/connect.log.2026-11-16 | head"},
  {on:"authfail", who:"sana", t:"That's the Monday rotation. The new password went to the app's vault path. Is the Connect secret even updated? Compare them."  , cmd:"vault kv get secret/connect/orders-cdc"}
 ],
 hints:["Read the connector status trace: what position is it trying to resume from?","Compare that with the oldest binlog still on the server (SHOW BINARY LOGS) and the retention setting.","Find why the connector stopped on Monday: look at the Connect worker log from that morning."],
 term:{host:"cdc-ops", user:"oncall", suggest:["curl -s connect:8083/connectors/orders-cdc/status","mysql -h orders-db -e \"SHOW BINARY LOGS\""],
  cmds:[
  {m:["curl -s connect:8083/connectors/orders-cdc/status","curl connect:8083/connectors/orders-cdc/status"], out:`{"name":"orders-cdc","connector":{"state":"RUNNING"},
 "tasks":[{"id":0,"state":"[r]FAILED[/r]","trace":"io.debezium.DebeziumException: The connector is trying to read binlog starting at
   SourceInfo [currentGtid=null, currentBinlogFilename=[y]binlog.000412[/y], currentBinlogPosition=88231 ...],
   but this is no longer available on the server. Reconfigure the connector to use a snapshot when needed."}]}`, clue:"wantoffset", unlock:["mysql -h orders-db -e \"SHOW BINARY LOGS\""]},
  {m:["mysql -h orders-db -e \"show binary logs","mysql -h orders-db -e \"show master logs"], out:`Log_name         File_size
[r]binlog.000431[/r]    1073741901    [d]<- oldest available (Tue 17 Nov 10:20)[/d]
binlog.000432    1073741822
...
binlog.000447     412290112    [d]<- current[/d]`, clue:"purged", unlock:["mysql -h orders-db -e \"SHOW VARIABLES LIKE 'binlog_expire_logs_seconds'\""]},
  {m:["mysql -h orders-db -e \"show variables like 'binlog_expire","mysql -h orders-db -e \"show variables like 'binlog"], out:`Variable_name                 Value
binlog_expire_logs_seconds    [r]86400[/r]    [d](1 day)[/d]
binlog_format                 ROW
binlog_row_image              FULL`, clue:"retention", unlock:["grep -i orders-cdc /var/log/kafka-connect/connect.log.2026-11-16 | head"]},
  {m:["grep -i orders-cdc /var/log/kafka-connect","grep orders-cdc","cat /var/log/kafka-connect"], out:`2026-11-16 09:02:40 INFO  [orders-cdc|task-0] Connected to MySQL binlog at orders-db:3306, starting at binlog.000412 pos 88231
2026-11-16 09:03:12 [r]ERROR [orders-cdc|task-0] Access denied for user 'debezium'@'10.4.%' (using password: YES)[/r]
2026-11-16 09:03:12 ERROR [orders-cdc|task-0] Task is being killed and will not recover until manually restarted
2026-11-16 09:03:12 INFO  [orders-cdc|task-0] [y]Task state FAILED[/y]
[d](no alerts were configured on task state)[/d]`, clue:"authfail"},
  {m:["vault kv get","vault read"], out:`== Secret Path ==  secret/data/orders-db/app
password   ******** (version 14, updated 2026-11-16 09:00)
== Secret Path ==  secret/data/connect/orders-cdc
password   ******** ([y]version 6, updated 2026-08-12[/y])`, clue:"oldsecret"},
  {m:["kafka-topics","kafka-console-consumer"], out:`Topic: dbserver.orders.orders  PartitionCount: 6  ReplicationFactor: 3
[d]last message timestamp: 2026-11-16 09:02:38[/d]`, note:"Confirms the topic stopped receiving changes on Monday, which is the symptom. Kafka itself is healthy."},
  {m:["mysql -h orders-db -e \"select count(*)","mysql -h orders-db -e \"select"], out:`count(*)
  [b]1,284,113[/b]   [d]-- orders created since Mon 09:00 (all present in MySQL)[/d]`, note:"The data is safe in MySQL. Only the lake copy is behind, so nothing is lost if you re-sync properly."}
 ]},
 dash:[
  {title:"Events produced by orders-cdc (per hour)", x:["Mon 06","Mon 09","Mon 12","Tue 00","Tue 12","Wed 00","Wed 09"], series:[{name:"events/h", v:[52000,8100,0,0,0,0,0]}], marks:[{i:1, label:"password rotation"}], clue:"stopped"},
  {title:"MySQL orders-db write QPS", x:["Mon 06","Mon 09","Mon 12","Tue 00","Tue 12","Wed 00","Wed 09"], series:[{name:"QPS", v:[310,880,920,210,940,190,870]}], note:"Normal traffic: orders kept flowing into MySQL the whole time. The source is fine."},
  {title:"Kafka broker disk %", unit:"%", x:["Mon 06","Mon 09","Mon 12","Tue 00","Tue 12","Wed 00","Wed 09"], series:[{name:"disk", v:[48,48,47,47,47,46,46]}], note:"Brokers are healthy. Kafka isn't the problem."}
 ],
 ui:[
  {title:"Connectors", md:`| Connector | State | Task 0 | Since |
|---|---|---|---|
| orders-cdc | RUNNING | **FAILED** | Mon 09:03 |
| payments-cdc | RUNNING | RUNNING | Mon 09:41 (restarted after rotation) |
| lake-s3-sink | RUNNING | RUNNING | — |`, clue:"stopped"},
  {title:"orders-cdc · config (excerpt)", md:`| Key | Value |
|---|---|
| snapshot.mode | **initial** |
| database.password | \${vault:connect/orders-cdc:password} |
| signal.data.collection | *(not set)* |
| errors.max.retries | -1 |`, clue:"config"}
 ],
 clues:{
  wantoffset:"The task wants to resume from binlog.000412 (Monday's position)",
  purged:"The oldest binlog on the server is binlog.000431 (Tue 10:20); 000412 is already purged",
  retention:"binlog_expire_logs_seconds = 86400: MySQL keeps only 1 day of binlog",
  authfail:"Mon 09:03: Access denied for user 'debezium', and the task FAILED with no alert",
  oldsecret:"Vault: the app password was rotated Monday, but the Connect secret is from August",
  stopped:"orders-cdc stopped producing events right after the Monday 09:00 rotation",
  config:"snapshot.mode=initial and no signal table, so it can't re-sync on its own"
 },
 cause:{q:"What's the root cause?", o:[
  {t:"Monday's password rotation didn't update the connector's secret, so the task failed silently. It stayed down longer than the 1-day binlog retention, so its saved position was purged and it can't resume", ok:true},
  {t:"Kafka lost the messages", ok:false, why:"The topic simply stopped receiving events Monday. Brokers are healthy.", say:[["ravi","Kafka never received anything after Monday 09:02. Nothing was lost in Kafka; nothing was sent."]]},
  {t:"MySQL purged the binlog too early: that's a MySQL bug", ok:false, why:"MySQL did exactly what it was configured to do (keep 1 day). The question is why the connector was down for 2 days.", say:[["priya","MySQL kept exactly one day, as configured. The real question is why our connector was down for two days without anyone noticing."]]},
  {t:"The lake S3 sink is broken", ok:false, why:"The sink is running; there are no new events to sink.", say:[["meera","The sink is fine. It's waiting for events that never arrive."]]}
 ]},
 fix:{q:"What do you ship? Pick every action you'd take.", o:[
  {t:"Point the connector at the current secret (and grant its user what it needs)", kind:"must", why:"Without valid credentials nothing else can work.", miss:[["dev","Re-snapshot started… and failed in 2 seconds: Access denied for user 'debezium'. It's still on the old password."]]},
  {t:"Re-sync the gap: set snapshot.mode=when_needed (or add a signal table and run an incremental snapshot of «orders»), then resume streaming", kind:"must", why:"A snapshot re-reads current table state, so the lake gets every order from the last two days with no locks or downtime (incremental).", miss:[["meera","The connector is RUNNING again but it can't resume: the binlog file is gone. lake.orders is still frozen at Monday."]]},
  {t:"Raise binlog retention to 7 days (check disk headroom first)", kind:"good", why:"Gives a week of buffer to fix a stopped connector before its position disappears."},
  {t:"Alert on connector task state ≠ RUNNING and on lake table freshness", kind:"good", why:"You'd have known on Monday at 09:05, not Wednesday."},
  {t:"Put the Connect secret in the rotation runbook (or make Connect read the same rotated path)", kind:"good", why:"Fixes the process that caused it."},
  {t:"Just restart the connector", kind:"meh", why:"A restart doesn't change the credentials or bring back purged binlogs. It fails again straight away."},
  {t:"Set snapshot.mode=never and start reading from the current binlog position", kind:"bad", why:"It would look healthy while 1.28M orders from the gap never reach the lake. Silent data loss.", say:[["meera","The connector is green, but my reconciliation is now permanently short by 1.28M orders from Mon–Wed. Those changes were skipped. 😱"],["priya","Skipping ahead makes the gap permanent. We'll have to re-snapshot anyway."]]},
  {t:"Hand-edit the stored offset to point at the oldest available binlog (000431)", kind:"bad", why:"Same gap, more confusing: changes between Monday and Tuesday 10:20 are skipped silently.", say:[["meera","Orders from Monday 09:00 to Tuesday 10:20 are missing in the lake. Did we skip a day?"]]}
 ]},
 post:{
  summary:"The Debezium «orders-cdc» connector was down from **Mon 09:03 to Wed 10:15**. lake.orders missed ~**1.28M orders**. No data was lost at the source.",
  cause:"The Monday DB password rotation updated the application's Vault path but not the Connect secret. The task got **Access denied** and moved to **FAILED**, which in Kafka Connect means it won't retry until restarted, and nothing alerted on task state. MySQL keeps binlogs for **1 day**. By Tuesday 10:20, binlog.000412 (the connector's saved position) had been purged, so a simple restart could never resume. With «snapshot.mode=initial» and no signal table, there was no automatic way back.",
  prevent:["Alerts on Connect task state and on lake freshness per table","Binlog retention ≥ the time to detect and fix a stopped connector (7 days)","Rotation runbooks list every consumer of a credential, including CDC","Configure a signal table so incremental snapshots are always one command away"]
 },
 learned:["A CDC connector is only as safe as its **source log retention**. Stop longer than that and the position is gone.","Restarting doesn't fix a **purged offset**. You need a **snapshot** (ideally incremental).","Never skip ahead to \"latest\" in CDC. It turns an outage into **silent data loss**.","Alert on **task state** and **freshness**, not only on errors in logs."]
}
]);
