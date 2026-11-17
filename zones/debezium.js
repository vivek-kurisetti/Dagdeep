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
