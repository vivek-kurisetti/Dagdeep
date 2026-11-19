QUEST.deep("debezium", {
"Read the database's own log": {
d: `Change Data Capture (CDC) by polling («SELECT * WHERE updated_at > last_run») misses **deletes**, misses rows updated twice between polls, depends on every developer remembering to set «updated_at», and adds query load to the database.

**Log-based CDC** reads the log the database already writes for crash recovery and replication: the MySQL **binlog**, Postgres **WAL** (via logical decoding), MongoDB **oplog/change streams**, SQL Server CDC tables, Oracle LogMiner/XStream. Every committed insert, update and delete appears **in commit order**, with before and after values, at low latency (typically sub-second) and with almost no extra load on the source.

Debezium turns those log entries into one Kafka event per row change.`,
life: `Instead of visiting a shop every hour to see what's on the shelves (polling), you get a copy of its cash register roll: every sale and every return, in order, as it happens.`,
work: `A lake loader pulled «orders» every 15 minutes using «updated_at». Refunds that deleted rows never reached the lake, and finance reports overstated revenue by 0.8%. Switching to Debezium on the MySQL binlog captured deletes as «op=d» events; data freshness went from 15 min to ~3 s and the reconciliation gap disappeared.`,
ex: `{
 "name": "orders-mysql",
 "config": {
  "connector.class": "io.debezium.connector.mysql.MySqlConnector",
  "database.hostname": "mysql-primary", "database.port": "3306",
  "database.user": "cdc", "database.password": "\${file:/secrets:pw}",
  "database.server.id": "5401", "topic.prefix": "pay",
  "table.include.list": "pay.orders,pay.refunds",
  "schema.history.internal.kafka.topic": "schema-history.pay"
 }
}`,
pit: [`Polling with updated_at and silently losing deletes.`, `Capturing every table "just in case" (more load, more topics).`, `Giving the CDC user full admin rights instead of replication privileges only.`],
q: [`Name two things polling-based CDC misses that log-based CDC captures.`, `Hard deletes and intermediate updates between two polls (plus changes where updated_at wasn't set).`]
},
"Runs on Kafka Connect": {
d: `Debezium connectors run inside **Kafka Connect**, a framework of worker processes. In **distributed mode**, workers form a group, connectors and their **tasks** are spread across workers, and Connect stores three things in internal Kafka topics:
- «config.storage.topic»: connector configs,
- «offset.storage.topic»: **source offsets** (binlog file/pos/GTID, Postgres LSN),
- «status.storage.topic»: running/failed states.

If a worker dies, its tasks move to another worker and resume from the stored offsets. You manage connectors via the **REST API** (port 8083). Most Debezium connectors run **one task** because a single log must be read in order. Transformations (**SMTs**) and **converters** (JSON, Avro + Schema Registry) are configured per connector.`,
life: `Kafka Connect is a staffing agency: it hires workers, gives each a job (connector task), and keeps a logbook of where each job left off so a replacement can continue if someone calls in sick.`,
work: `A team ran Debezium in standalone mode on one VM with offsets in a local file. The VM was replaced and the file was lost; the connector restarted with a full snapshot of 400 GB. Moving to a 3-worker distributed Connect cluster on Kubernetes kept offsets in Kafka, and later node failures caused only a 20-second pause.`,
ex: `curl -s localhost:8083/connectors | jq
curl -s localhost:8083/connectors/orders-mysql/status | jq
curl -X POST localhost:8083/connectors/orders-mysql/restart?includeTasks=true
curl -X PUT -H "Content-Type: application/json" \\
  localhost:8083/connectors/orders-mysql/config -d @orders.json`,
pit: [`Standalone mode in production.`, `Internal topics with replication factor 1.`, `Expecting more tasks to speed up a single-log connector.`],
q: [`Where does Debezium store "how far it has read" in distributed Connect?`, `In the Connect offset storage topic in Kafka, keyed by connector.`]
},
"MySQL prerequisites": {
d: `For the MySQL connector:
- «log_bin» enabled, «binlog_format=ROW» (statement format has no row images), «binlog_row_image=FULL» (so before/after have all columns).
- **GTID mode** on («gtid_mode=ON», «enforce_gtid_consistency=ON») so the connector can resume after failover to another server.
- A unique «database.server.id» for the connector (it acts like a replica).
- A user with «SELECT, RELOAD, SHOW DATABASES, REPLICATION SLAVE, REPLICATION CLIENT» (and LOCK TABLES if needed for snapshots).
- **Binlog retention** («binlog_expire_logs_seconds», or on RDS «mysql.rds_set_configuration('binlog retention hours', 72)») longer than any possible connector downtime. If the binlog the connector needs is purged, it must **re-snapshot**.`,
life: `Before a court stenographer can record a hearing, the room needs microphones on (binlog), full sentences not summaries (ROW/FULL), a seat number for them (server id), and recordings must be kept long enough to transcribe after a break.`,
work: `On RDS MySQL the default binlog retention was effectively a few hours. A Connect cluster upgrade over a weekend took 9 hours; the needed binlog was gone and the connector failed with "The connector is trying to read binlog starting at ... but this is no longer available". They re-snapshotted 600 GB and then set RDS binlog retention to 72 hours.`,
ex: `SHOW VARIABLES WHERE Variable_name IN
 ('log_bin','binlog_format','binlog_row_image','gtid_mode','binlog_expire_logs_seconds');
CREATE USER 'cdc'@'%' IDENTIFIED BY '...';
GRANT SELECT, RELOAD, SHOW DATABASES, REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO 'cdc'@'%';
CALL mysql.rds_set_configuration('binlog retention hours', 72);   -- RDS`,
pit: [`binlog_row_image=MINIMAL (missing columns in events).`, `Short binlog retention on managed DBs.`, `Reusing a server.id already used by a real replica.`],
q: [`What happens if the connector is down longer than binlog retention?`, `Its saved position no longer exists; it can't resume and must take a new snapshot.`]
},
"Postgres: slots hold WAL": {
d: `Postgres CDC uses **logical decoding**:
- «wal_level=logical» (restart required) so WAL contains enough information to rebuild row changes.
- A **publication** («CREATE PUBLICATION dbz FOR TABLE ...») chooses tables (for the «pgoutput» plugin).
- A **logical replication slot** («plugin.name=pgoutput») tracks the connector's **confirmed_flush_lsn**.

The slot guarantees no change is lost while the connector is down, by **retaining WAL** until the connector confirms it. That is also the risk: a stopped or slow connector makes «pg_wal» grow without bound. Debezium confirms LSNs after Kafka Connect commits offsets, so retained WAL is normally small. Set «max_slot_wal_keep_size» and alert on retained bytes per slot.`,
life: `A bookmark that the library promises to respect: they won't shred any newspaper after the bookmarked date until you come back. Very safe for you, until you forget to come back.`,
work: `Debezium on a Postgres primary was stopped during a Kafka migration. In 30 hours, «pg_wal» grew to 900 GB on a 1 TB volume; storage autoscaling saved the day. The runbook now says: if Debezium will be down > 2 hours, either keep an eye on retained WAL or drop the slot and plan an incremental snapshot.`,
ex: `ALTER SYSTEM SET wal_level = logical;   -- restart
CREATE PUBLICATION dbz_pub FOR TABLE public.orders, public.refunds;
SELECT slot_name, active, confirmed_flush_lsn,
 pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)) AS lag
FROM pg_replication_slots WHERE slot_type = 'logical';`,
pit: [`No alert on slot lag.`, `Creating slots on a replica without logical failover support (PG17+ has failover slots).`, `Leaving test slots behind.`],
q: [`Which LSN tells you how much WAL a logical slot is holding back?`, `confirmed_flush_lsn (and restart_lsn); compare with pg_current_wal_lsn().`]
},
"Heartbeats for quiet tables": {
d: `A slot's confirmed position only advances when the connector receives **changes for its tables** and commits offsets. If the captured tables are idle but other tables are busy, the WAL keeps growing while the connector has nothing to confirm, so the slot keeps all that WAL.

Fix with **heartbeats**:
- «heartbeat.interval.ms=10000»: Debezium periodically emits heartbeat events and commits its latest seen LSN.
- «heartbeat.action.query»: e.g. «INSERT INTO debezium_heartbeat ... ON CONFLICT DO UPDATE SET ts = now()». This creates a real change in a captured table, so the connector always has something to confirm (needed especially on Postgres where the connector may see no relevant WAL at all).

Heartbeats also give a liveness signal you can monitor downstream.`,
life: `A security guard must sign the log book every hour even if nothing happened, so the supervisor knows the post is alive and old log pages can be archived.`,
work: `Debezium captured a «config» table changed once a week on a DB doing 5k writes/s elsewhere. Retained WAL hit 300 GB in two days. Adding a heartbeat table to the publication and «heartbeat.action.query» every 10 s kept retained WAL under 1 GB.`,
ex: `CREATE TABLE debezium_heartbeat (id int PRIMARY KEY, ts timestamptz);
ALTER PUBLICATION dbz_pub ADD TABLE debezium_heartbeat;
-- connector
"heartbeat.interval.ms": "10000",
"heartbeat.action.query": "INSERT INTO debezium_heartbeat VALUES (1, now()) ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts"`,
pit: [`Heartbeat table not in the publication.`, `Forgetting the heartbeat topic in ACLs.`, `Very aggressive intervals creating noise.`],
q: [`Why can an idle captured table cause WAL growth?`, `The connector gets no changes to confirm, so the slot's confirmed LSN stays put while other traffic adds WAL.`]
},
"Initial snapshot": {
d: `A new connector first needs the **existing** rows, not just future changes. In «snapshot.mode=initial» it:
1. Records the current log position (binlog GTID/pos or a Postgres slot's consistent point).
2. Reads each captured table with consistent-read semantics, emitting «op=r» events.
3. Starts streaming from the recorded position, so nothing between snapshot and stream is lost or doubled (beyond at-least-once replays).

Other modes: «no_data» (only schema, start streaming), «when_needed» (snapshot if offsets are missing/invalid), «initial_only», «recovery». Large tables are slow to snapshot (single-threaded per table by default; «snapshot.max.threads» helps), and while it runs on Postgres the slot retains WAL. For big tables in production, prefer **incremental snapshots**.`,
life: `Joining a WhatsApp group late: first you scroll through the full history (snapshot), then you follow new messages live (streaming) from the exact point where history ended.`,
work: `An 1.8 TB Postgres «transactions» table took 26 hours to snapshot; WAL retained during it hit 700 GB. The team switched to «snapshot.mode=no_data» + **incremental snapshot** signals, which streamed new changes immediately and backfilled history in chunks over two days, without WAL build-up.`,
ex: `"snapshot.mode": "initial",
"snapshot.max.threads": "4",
"snapshot.fetch.size": "10000",
// later, schema only and backfill separately:
"snapshot.mode": "no_data"`,
pit: [`Huge initial snapshots on a busy primary during peak.`, `Changing table.include.list and expecting new tables to be snapshotted automatically (they need a signal).`, `Not sizing Kafka topics for the snapshot burst.`],
q: [`What op code marks snapshot events?`, `«r» (read).`]
},
"Incremental snapshots": {
d: `Incremental snapshots backfill a table **while streaming continues**. Trigger with a row in the **signaling table** («execute-snapshot» with a list of tables) or a Kafka signal topic.

How it works: Debezium reads the table in **chunks ordered by primary key** («incremental.snapshot.chunk.size»). Around each chunk it writes **low and high watermark** signals into the log. While reading the chunk it buffers the rows; any streaming event for a key in that chunk that arrives between the watermarks **replaces or drops** the buffered snapshot row, so a stale snapshot row never overwrites a newer change. Then the chunk is emitted.

It's resumable (progress is in offsets), can be paused/stopped, and needs no table locks. Requires a primary key (or a configured surrogate key).`,
life: `Copying a large ledger book page by page while clerks keep writing in it. Before and after each page you put sticky notes; if a clerk changes an entry on the page you just copied, you throw away your copy of that line and keep the clerk's newer one.`,
work: `After adding a new «merchant_settlements» table to the connector, the team inserted one signal row; Debezium backfilled 220 M rows in 1 M-row chunks over 6 hours while streaming stayed under 2 s lag. When peak traffic started, they paused it with «pause-snapshot» and resumed at night.`,
ex: `INSERT INTO debezium_signal (id, type, data) VALUES (
  'snap-2026-11-19', 'execute-snapshot',
  '{"data-collections": ["public.merchant_settlements"], "type": "incremental"}');
-- connector
"signal.data.collection": "public.debezium_signal",
"incremental.snapshot.chunk.size": "50000"`,
pit: [`Tables without PK.`, `Signal table not captured by the connector.`, `Chunk sizes too large (memory) or too small (slow).`],
q: [`How does incremental snapshot avoid overwriting a newer streamed change with an older snapshot row?`, `Watermarks around each chunk; streaming events inside the window for the same key remove the buffered snapshot row.`]
},
"The event envelope": {
d: `A Debezium change event value has:
- «before»: row state before the change (null for inserts; depends on replica identity / row image).
- «after»: row state after (null for deletes).
- «source»: metadata: connector, db, schema, table, «ts_ms» (when the change happened in the DB), position (binlog file/pos/GTID or LSN), «snapshot» flag.
- «op»: «c» create, «u» update, «d» delete, «r» read (snapshot), «t» truncate, «m» message.
- «ts_ms»: when Debezium processed it. «ts_ms − source.ts_ms» ≈ capture latency.

The **key** is the row's primary key, so all changes to a row land in the same Kafka partition, in order. With JSON converter and schemas enabled, each message also carries the full schema (verbose); Avro + Schema Registry sends only a schema id.`,
life: `An official change form: "previous address", "new address", "who processed it and when", and a box ticked "new / change / removal".`,
work: `A latency dashboard plotted «ts_ms − source.ts_ms» per table; p99 jumped to 90 s every night. The cause was a long-running batch transaction on the source: Debezium can only emit after commit, and «source.ts_ms» was the statement time. Splitting the batch into smaller transactions fixed the metric.`,
ex: `{
 "before": {"id": 42, "status": "PENDING", "amount": 5000},
 "after":  {"id": 42, "status": "PAID",    "amount": 5000},
 "source": {"connector":"mysql","db":"pay","table":"orders",
            "ts_ms":1763541000123,"file":"binlog.000812","pos":4471,"gtid":"3e11..:9912"},
 "op": "u",
 "ts_ms": 1763541000456
}`,
pit: [`Using «ts_ms» as event time instead of «source.ts_ms».`, `JSON with schemas enabled on high-volume topics (huge messages).`, `Expecting «before» on Postgres updates with default replica identity.`],
q: [`How do you measure capture latency from a Debezium event?`, `ts_ms (processed by Debezium) minus source.ts_ms (change time in the DB).`]
},
"Deletes produce two records": {
d: `For a deleted row Debezium emits:
1. A **delete event**: «op=d», «before» = old row (or just the key), «after» = null.
2. A **tombstone**: same key, **null value** («tombstones.on.delete=true», default).

Why both? The delete event tells consumers *what* was deleted. The tombstone lets **Kafka log compaction** remove all earlier records for that key. Without it, a compacted CDC topic would keep the last «op=u» forever, and any new consumer reading from the start would resurrect a deleted row.

Consumers and sinks must handle null-value records (many crash with NullPointerException on tombstones). JDBC sinks use them («delete.enabled=true») to issue DELETEs.`,
life: `When an employee leaves, HR sends a farewell email with their details (delete event) and also removes them from the company directory entirely (tombstone), so new joiners never see them.`,
work: `A custom Python consumer crashed with «TypeError: 'NoneType' object is not subscriptable» every time a customer deleted their saved card. The consumer didn't expect tombstones. Fix: skip messages where «value is None» unless the sink handles deletes, and use the delete event for the actual deletion.`,
ex: `for msg in consumer:
    if msg.value() is None:          # tombstone
        continue                      # or delete by key for compacted sinks
    ev = json.loads(msg.value())
    if ev["op"] == "d":
        sink.delete(ev["before"]["id"])
    else:
        sink.upsert(ev["after"])`,
pit: [`Consumers that can't handle null values.`, `Disabling tombstones on compacted topics.`, `Treating op=d as "update with null fields".`],
q: [`Why does a compacted CDC topic need tombstones?`, `Compaction keeps the latest value per key; only a null-value tombstone lets it remove the key, so deleted rows don't reappear for new consumers.`]
},
"Flatten for sinks": {
d: `Most sinks (JDBC, Elasticsearch, S3 → Hive tables) want a flat row, not an envelope. The **ExtractNewRecordState** SMT ("unwrap"):
- replaces the value with «after»;
- for deletes, can drop, rewrite («delete.handling.mode=rewrite» adds «__deleted=true» with the before values), or pass tombstones;
- can copy metadata fields («add.fields=op,table,source.ts_ms,lsn») as «__op», «__source_ts_ms»...

Topic names default to «<topic.prefix>.<db>.<table>» (MySQL) or «<prefix>.<schema>.<table>» (Postgres). Use **RegexRouter** or **ByLogicalTableRouter** to rename or merge (e.g. sharded tables «orders_00..orders_63» into one topic).

Keep the full envelope in Kafka when multiple consumers need different views; flatten in the sink connector instead.`,
life: `Taking the important page out of a courier envelope and filing just that page, but writing "received on / sender" in the margin so you don't lose the context.`,
work: `64 sharded MySQL tables «payments_00..63» produced 64 topics. A ByLogicalTableRouter SMT merged them into «pay.payments» with a «__shard» key field; the S3 sink with ExtractNewRecordState + «add.fields=op,source.ts_ms» wrote one Iceberg-ready dataset.`,
ex: `"transforms": "unwrap,route",
"transforms.unwrap.type": "io.debezium.transforms.ExtractNewRecordState",
"transforms.unwrap.delete.handling.mode": "rewrite",
"transforms.unwrap.add.fields": "op,table,source.ts_ms",
"transforms.route.type": "io.debezium.transforms.ByLogicalTableRouter",
"transforms.route.topic.regex": "pay\\\\.pay\\\\.payments_(.*)",
"transforms.route.topic.replacement": "pay.payments"`,
pit: [`Flattening at the source when other consumers need before/op.`, `Losing deletes by dropping them in unwrap.`, `Merging shards without adding a shard key (key collisions).`],
q: [`What does «delete.handling.mode=rewrite» do?`, `It emits the deleted row's before values as a flat record with «__deleted=true» instead of dropping the delete.`]
},
"The outbox pattern": {
d: `**Dual write** (update DB, then publish to Kafka) breaks whenever one side fails: DB commits but Kafka publish fails (event lost), or Kafka succeeds and the DB transaction rolls back (phantom event). No retry ordering fixes it fully.

**Outbox**: in the **same DB transaction** as the business change, insert a row into an «outbox» table: «id, aggregate_type, aggregate_id, type, payload». Debezium captures the outbox table; the **EventRouter** SMT routes each row to a topic by «aggregate_type», uses «aggregate_id» as the key, and emits the payload as the event.

Result: the event exists **if and only if** the business transaction committed, in commit order. The outbox table can be cleaned right after insert (Debezium reads the log, not the table) or periodically.`,
life: `Instead of mailing a letter and separately updating your diary (and sometimes forgetting one), you write the letter on a carbon copy page in the diary. The post office collects carbon pages from your diary every hour.`,
work: `The refund service updated «refunds» then called Kafka. During a Kafka outage, 1,900 refunds were committed but never published, so customers didn't get notifications. Moving to an outbox table + Debezium EventRouter made publishing exactly match commits; the next Kafka outage just delayed events by 12 minutes.`,
ex: `BEGIN;
UPDATE refunds SET status = 'APPROVED' WHERE id = 991;
INSERT INTO outbox (id, aggregatetype, aggregateid, type, payload)
VALUES (gen_random_uuid(), 'refund', '991', 'RefundApproved', '{"amount":5000}');
COMMIT;
-- connector
"transforms": "outbox",
"transforms.outbox.type": "io.debezium.transforms.outbox.EventRouter"`,
pit: [`Publishing to Kafka directly "as well" (back to dual writes).`, `Large payloads making the outbox table and WAL heavy.`, `Consumers not idempotent (outbox is still at-least-once).`],
q: [`Why does the outbox avoid the dual-write problem?`, `The event row is part of the same DB transaction; it's committed (and later captured) only if the business change commits.`]
},
"Idempotent sinks": {
d: `Debezium + Kafka Connect deliver **at-least-once**. After a crash or rebalance, a range of events is replayed. Sinks must produce the same result if they see an event twice and must not let an **older** event overwrite a newer one.

Practices:
- **Upsert by primary key** («INSERT ... ON CONFLICT DO UPDATE», «MERGE INTO»), never blind INSERT.
- Track a **source position** per row (binlog GTID/pos, Postgres LSN, or «source.ts_ms» + tiebreaker) and only apply if the incoming position is newer.
- Deletes as idempotent deletes (deleting twice is fine) or soft deletes with a position.
- In batch sinks (Spark/Flink into Iceberg), **dedupe within the batch** by key keeping the latest position before MERGE.`,
life: `A school updating marks from teachers' slips. If the same slip arrives twice, writing the same mark again is harmless. But if an old slip arrives late, you check its date before overwriting a newer mark.`,
work: `A Spark job MERGEd CDC batches into Iceberg. A replay delivered an old «u» event after a newer one in the same micro-batch; the MERGE picked an arbitrary row and the order status went backwards to PENDING. Adding «row_number() over (partition by id order by lsn desc)» and a condition «WHEN MATCHED AND s.lsn > t.lsn» fixed it.`,
ex: `MERGE INTO lake.orders t
USING (SELECT * FROM (
        SELECT *, row_number() OVER (PARTITION BY id ORDER BY lsn DESC) rn
        FROM batch) WHERE rn = 1) s
ON t.id = s.id
WHEN MATCHED AND s.op = 'd' AND s.lsn > t.lsn THEN DELETE
WHEN MATCHED AND s.lsn > t.lsn THEN UPDATE SET *
WHEN NOT MATCHED AND s.op != 'd' THEN INSERT *;`,
pit: [`Append-only sinks counting replays as new rows.`, `Ordering by Kafka offset across partitions.`, `Ordering by ts_ms only (ties within the same millisecond).`],
q: [`Why isn't "upsert by key" alone always enough?`, `A replayed older event could overwrite a newer row; you also need a position/version check.`]
},
"What the binlog actually contains": {
d: `In ROW format, one transaction in the binlog looks like:
1. **GTID_LOG_EVENT** (transaction id),
2. **QUERY_EVENT** «BEGIN»,
3. **TABLE_MAP_EVENT**: maps a numeric table id to «db.table» and column **types** (but not column **names**),
4. **WRITE_ROWS / UPDATE_ROWS / DELETE_ROWS** events with row images (before/after for updates),
5. **XID_EVENT** (commit).

DDL appears as a QUERY_EVENT with the SQL text. Because row events lack column names, Debezium must keep its own **schema history**: it parses every DDL and stores it in the schema history topic, so it can map positions to columns at any point in the log. That's why that topic must never be deleted or compacted.`,
life: `A cashier's tape that says "item #7 from shelf 3, ₹120" but not what item #7 is. You need the store's product list as it was on that day to decode it, and the list changes over time.`,
work: `Someone set the schema history topic to «cleanup.policy=compact» with 7-day retention. A connector restart a week later failed with "The db history topic is missing". Restoring required re-snapshotting schema («snapshot.mode=recovery»). The topic is now infinite retention, delete policy, RF=3.`,
ex: `mysqlbinlog --base64-output=DECODE-ROWS -vv binlog.000812 | less
# ### UPDATE \`pay\`.\`orders\`
# ### WHERE  @1=42 @2='PENDING'
# ### SET    @1=42 @2='PAID'
"schema.history.internal.kafka.topic": "schema-history.pay"   # retention.ms=-1`,
pit: [`Retention or compaction on the schema history topic.`, `DDL tools that the parser can't understand (rare, but check gh-ost/pt-osc table renames).`, `Assuming binlog events carry column names.`],
q: [`Why does the MySQL connector need a schema history topic?`, `Row events only carry column positions and types; Debezium needs the DDL history to know column names at each binlog position.`]
},
"Snapshot consistency": {
d: `The snapshot and the stream must meet at exactly one point: every change before the point is in the snapshot, every change after it comes from the binlog.

MySQL connector (default «snapshot.locking.mode=minimal»):
1. Take a **global read lock** («FLUSH TABLES WITH READ LOCK») briefly.
2. Read the current **binlog position/GTID set** and the table schemas.
3. Start a **REPEATABLE READ** transaction «WITH CONSISTENT SNAPSHOT».
4. Release the global lock (it was held for milliseconds to seconds).
5. Read all rows inside that transaction (consistent as of the recorded position).
6. Stream from the recorded position.

On RDS/Aurora where FTWRL isn't allowed, Debezium falls back to table-level locks, or you use «snapshot.locking.mode=none» if no DDL runs during the snapshot.`,
life: `Photographing a busy shop's shelves: you shout "freeze!" for one second, note the time on the CCTV, start the photo, then let everyone move. Anything after that time you'll watch on the CCTV recording.`,
work: `A snapshot on a busy primary sat waiting on FLUSH TABLES WITH READ LOCK behind a 20-minute analytics query; meanwhile every write queued behind the FTWRL request and the app stalled. Runbook change: run snapshots from a replica with GTIDs, or use incremental snapshots on the primary.`,
ex: `"snapshot.locking.mode": "minimal",     // or "none" if no DDL during snapshot
"snapshot.isolation.mode": "repeatable_read",
-- what it runs (simplified)
FLUSH TABLES WITH READ LOCK;
SHOW MASTER STATUS;    -- record position
START TRANSACTION WITH CONSISTENT SNAPSHOT;
UNLOCK TABLES;`,
pit: [`Global read lock blocked behind long queries.`, `«none» locking with DDL happening during snapshot.`, `Snapshotting from a replica without GTIDs (positions don't map).`],
q: [`Why hold a global read lock only briefly during the snapshot?`, `Just long enough to record a binlog position that matches the start of a consistent-read transaction; the long reads then need no locks.`]
},
"Replica identity decides the before image": {
d: `In Postgres, the WAL for UPDATE/DELETE contains old values only as allowed by the table's **REPLICA IDENTITY**:
- **DEFAULT**: only the old **primary key** (and only if the key changed for updates). «before» in Debezium is null or key-only.
- **FULL**: the entire old row. Debezium «before» is complete. Costs more WAL.
- **USING INDEX idx**: old values of a unique index's columns.
- **NOTHING**: no old values; updates/deletes can't be identified properly.

Tables **without a primary key** and with DEFAULT identity can't publish UPDATE/DELETE through pgoutput at all ("cannot update table because it does not have a replica identity").`,
life: `A change slip that says "update customer #42" vs one that also records the full old details. Without the old details you can't answer "what changed?".`,
work: `A fraud team needed old and new «limit_amount» to detect suspicious changes, but «before» was always null. Setting «ALTER TABLE credit_limits REPLICA IDENTITY FULL» gave full before images; WAL volume for that small table rose ~2×, which was acceptable. They did NOT set FULL on the 2 TB transactions table.`,
ex: `SELECT relname, relreplident FROM pg_class WHERE relname = 'credit_limits';
-- d = default, f = full, i = index, n = nothing
ALTER TABLE credit_limits REPLICA IDENTITY FULL;`,
pit: [`FULL on huge, write-heavy tables (WAL blow-up).`, `Tables without PK breaking updates in publications.`, `Expecting «before» values with DEFAULT identity.`],
q: [`With REPLICA IDENTITY DEFAULT, what does Debezium put in «before» for an UPDATE that doesn't change the PK?`, `Null (no old values are logged), unless the key changed.`]
},
"TOAST and unchanged values": {
d: `Postgres stores large values (over ~2 KB after compression) out of line in a **TOAST** table. If an UPDATE doesn't modify a TOASTed column, the WAL record doesn't include its value (the pointer is unchanged). Logical decoding therefore has nothing to send for that column.

Debezium fills such columns with a placeholder: «__debezium_unavailable_value» (configurable via «unavailable.value.placeholder»). A naive sink would overwrite the real JSON with that placeholder.

Fixes: «REPLICA IDENTITY FULL» (old row in WAL; Debezium can use it), or make the sink **skip** columns with the placeholder (merge only changed columns), or reprocess from a snapshot for those columns.`,
life: `A clerk updates someone's phone number on a form; the big attached document isn't re-copied, so the change slip just says "attachment: unchanged". If you replace your copy with the slip, you lose the attachment.`,
work: `An Elasticsearch index of products started showing "__debezium_unavailable_value" as descriptions after price-only updates. The sink did full-document replace. Switching to partial updates that ignore placeholder fields fixed the index; a nightly job repaired affected documents.`,
ex: `"unavailable.value.placeholder": "__debezium_unavailable_value",
-- sink logic (pseudo)
changed = {k: v for k, v in after.items() if v != "__debezium_unavailable_value"}
es.update(id, {"doc": changed})
-- or
ALTER TABLE products REPLICA IDENTITY FULL;`,
pit: [`Full-row replace sinks with TOASTed columns.`, `Not testing updates that don't touch big columns.`, `Assuming the placeholder means "set to null".`],
q: [`Why is a large jsonb column missing in some update events?`, `It wasn't changed and is TOASTed, so the WAL didn't include it; Debezium emits a placeholder.`]
},
"Backfill while streaming without locks": {
d: `This is the **DBLog** algorithm (Netflix) that Debezium's incremental snapshots implement:
1. Write a **low watermark** signal into the log.
2. «SELECT ... WHERE pk > last_pk ORDER BY pk LIMIT chunk» and buffer the rows in memory.
3. Write a **high watermark** signal.
4. As the streaming side reads the log between low and high watermark, every event whose key is in the buffered chunk **removes** that key from the buffer (the live event is newer or equal).
5. At the high watermark, emit the remaining buffered rows as «op=r», then continue with the next chunk.

So snapshot rows never override newer stream events, no table locks are needed, and progress (last_pk) is saved in offsets so it resumes after restarts.`,
life: `Photocopying pages while people edit the book. Before copying a page you note "start", after copying you note "end", and any edit someone made to that page between your notes beats your photocopy.`,
work: `A Postgres «ledger_entries» table (3 B rows) needed backfilling to a new Kafka cluster. Incremental snapshot with «chunk.size=100000» ran 30 hours at ~28k rows/s, with no locks and streaming lag under 3 s throughout; a Debezium restart mid-way resumed at the last chunk.`,
ex: `low watermark  -> signal row written (id=..., type=snapshot-window-open)
SELECT * FROM ledger_entries WHERE id > 81200000 ORDER BY id LIMIT 100000;
high watermark -> signal row written (snapshot-window-close)
stream events for ids in chunk between watermarks -> drop buffered rows`,
pit: [`Expecting snapshot rows in a strict place relative to the stream (they're interleaved).`, `Signal table not in the publication (watermarks never seen).`, `Non-unique or mutable chunk keys.`],
q: [`Why must the signal table be captured for incremental snapshots?`, `The watermark rows written there are how the connector detects the start and end of each chunk window in the log.`]
},
"Where duplicates come from": {
d: `Kafka Connect source tasks produce records, and **periodically** commit source offsets («offset.flush.interval.ms», 60 s default). If the worker crashes after records were written to Kafka but before the offset commit, the task restarts from the older offset and **re-emits** those records.

Other duplicate sources: producer retries without idempotence, snapshot restarts, incremental snapshot rows overlapping streamed changes, and rebalances.

Kafka Connect 3.3+ supports **exactly-once source** connectors («exactly.once.source.support=enabled» on workers): records and offsets are written in one Kafka transaction. Debezium supports this for several connectors; consumers need «read_committed». Even then, the sink must still be idempotent if it's outside Kafka.`,
life: `A data-entry clerk saves progress every 60 minutes. If the computer crashes at minute 50, she redoes the last 50 minutes of entries, and some of those were already sent.`,
work: `After a Connect worker OOM, the «orders» topic had ~45 s of duplicate events. A downstream counter of "orders created" over-counted by 3,000 that hour. The counter switched to «COUNT(DISTINCT order_id)» semantics, and the team enabled exactly-once source support on the Connect cluster.`,
ex: `# worker config
exactly.once.source.support=enabled
offset.flush.interval.ms=10000
# connector
"exactly.once.support": "required",
# consumers
isolation.level=read_committed`,
pit: [`Counting events instead of distinct keys.`, `Assuming Debezium is exactly-once by default.`, `Very long offset flush intervals.`],
q: [`Why does a crash cause duplicates in at-least-once source connectors?`, `Records already written to Kafka after the last offset commit are re-produced when the task restarts from that older offset.`]
},
"Schema evolution end to end": {
d: `A column added in MySQL/Postgres flows like this:
1. DDL runs on the source. MySQL: Debezium parses it from the binlog; Postgres: the next change event carries the new relation metadata.
2. Debezium builds a **new value schema** for the topic.
3. The Avro/Protobuf converter registers it with **Schema Registry**, which checks the subject's **compatibility** mode.
4. Consumers deserialize with the new schema; sinks may need to evolve tables («auto.evolve» in JDBC sink, schema evolution in Iceberg/Delta).

Breaking changes (drop NOT NULL column, type narrowing, rename) can fail at registration and **stop the connector**. Plan DDL as additive: add nullable columns with defaults, backfill, then switch readers, then drop old columns later.`,
life: `Adding a new field to a printed form: the printer (registry) checks old clerks can still process the new form. Renaming a field without notice is like reprinting with "Mob No." instead of "Phone": half the clerks get confused.`,
work: `A developer ran «ALTER TABLE orders MODIFY amount DECIMAL(12,2)» (was BIGINT paise). Schema Registry under BACKWARD rejected the new schema; the connector task failed and lag grew to 40 minutes. Rolling forward with a new column «amount_dec» (nullable), dual-writing, and migrating consumers was the safe path.`,
ex: `"key.converter": "io.confluent.connect.avro.AvroConverter",
"value.converter": "io.confluent.connect.avro.AvroConverter",
"value.converter.schema.registry.url": "http://registry:8081",
curl -s http://registry:8081/subjects/pay.pay.orders-value/versions | jq`,
pit: [`Running destructive DDL without checking CDC compatibility.`, `Compatibility NONE to "unblock" a connector.`, `Sinks without schema evolution enabled.`],
q: [`Why can a single ALTER TABLE stop a Debezium connector?`, `The new schema version may be rejected by Schema Registry's compatibility check, failing the task.`]
},
"Watch the right metrics": {
d: `Debezium exposes JMX MBeans per connector («debezium.mysql:type=connector-metrics,context=streaming,server=...»). The useful ones:
- **MilliSecondsBehindSource**: time between the change in the DB and Debezium processing it. The primary lag signal.
- **QueueRemainingCapacity** / QueueTotalCapacity: if remaining is near 0, Kafka producing is the bottleneck (or SMTs/converters are slow).
- **TotalNumberOfEventsSeen**, NumberOfCommittedTransactions: throughput.
- **Connected**: false = lost source connection.
- Snapshot metrics: RowsScanned, SnapshotRunning, RemainingTableCount.

Plus source-side metrics: Postgres retained WAL per slot; MySQL binlog files remaining vs the connector's position. And Connect metrics: task status, «source-record-poll-rate», offset commit failures.`,
life: `A delivery tracker: "how late are we behind the warehouse" (lag), "how full is the van waiting to depart" (queue), "is the driver still connected" (connected).`,
work: `Lag alerts fired at 3 AM. MilliSecondsBehindSource was rising, but QueueRemainingCapacity was 0: Debezium was reading fine but couldn't produce fast enough. Kafka brokers were throttling due to a quota. Raising the quota cleared the backlog in 15 minutes, rather than wrongly restarting the connector.`,
ex: `# Prometheus JMX exporter rule (sketch)
- pattern: "debezium.([^:]+)<type=connector-metrics, context=streaming, server=([^,]+)><>MilliSecondsBehindSource"
  name: debezium_streaming_lag_ms
# alert: debezium_streaming_lag_ms > 60000 for 5m`,
pit: [`Only watching Kafka consumer lag of downstream apps.`, `No alert on slot WAL retention.`, `Restarting connectors when the bottleneck is Kafka.`],
q: [`Lag rising and QueueRemainingCapacity is 0. Where is the bottleneck?`, `Between Debezium's queue and Kafka: producing/converting/SMTs are slower than reading the log.`]
}
});
