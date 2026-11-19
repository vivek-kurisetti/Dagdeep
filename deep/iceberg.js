QUEST.deep("iceberg", {
"Iceberg is metadata": {
d: `A Hive table is "whatever files are in this folder", so engines must LIST directories and can't know which files belong to a committed write. An Iceberg table is defined entirely by **metadata files**:
- The **catalog** stores one pointer: the current «metadata.json».
- «metadata.json»: schema(s), partition spec(s), properties, and the list of **snapshots**.
- Each snapshot points to a **manifest list** (Avro): one entry per manifest, with partition range summaries.
- Each **manifest** (Avro) lists data/delete files with partition values, record counts and **per-column stats** (min, max, null counts).
- **Data files** (Parquet/ORC/Avro) hold the rows.

Queries never list directories; they read metadata to find exactly the files needed. That's what gives ACID commits, time travel, schema/partition evolution and fast planning at petabyte scale.`,
life: `A library where the books' shelf positions don't matter; the catalogue cards decide which books are part of the collection. Swap the catalogue drawer and you've atomically changed the collection.`,
work: `A Hive-style S3 table with 2 M files took 6 minutes just listing before Spark ran anything, and readers sometimes saw half-written partitions. After migrating to Iceberg, planning used manifests (seconds), and readers only ever saw committed snapshots.`,
ex: `s3://lake/payments/
  metadata/
    v42.metadata.json        <- catalog points here
    snap-8812...avro         <- manifest list
    a1b2...-m0.avro          <- manifest
  data/
    dt=2026-11-19/00012-...parquet
SELECT * FROM lake.payments.snapshots;
SELECT file_path, record_count FROM lake.payments.files LIMIT 5;`,
pit: [`Copying data files by hand into the folder (they're not part of the table).`, `Deleting "old" files directly in S3.`, `Pointing two catalogs at the same table and committing from both.`],
q: [`What single thing changes when an Iceberg commit happens?`, `The catalog's pointer to the current metadata.json (atomically swapped).`]
},
"Commits are an atomic swap": {
d: `A write in Iceberg:
1. Writes new data files (invisible to readers so far).
2. Writes new manifests, a new manifest list, and a new «metadata.json» based on the snapshot it started from.
3. Asks the catalog: "swap the pointer from v42 to v43 **only if** it's still v42" (compare-and-swap).

If another writer committed first, the swap fails. The writer **refreshes**, checks whether its change still applies (e.g. appends rarely conflict; overwrites/deletes touching the same files do), **re-applies** its metadata on top of the new snapshot and retries («commit.retry.num-retries»). Data files are reused; only metadata is rewritten.

This is **optimistic concurrency** with **snapshot isolation** for readers: a query reads one snapshot from start to finish.`,
life: `Editing a shared Google Sheet offline: when you reconnect, if someone else changed it, your edits are re-applied on top of theirs, unless you both edited the same cells, in which case one of you has to redo.`,
work: `Two jobs wrote to the same table: an hourly append and a nightly compaction. Compaction kept failing with «CommitFailedException: Cannot commit, found new delete files» because a streaming MERGE touched the same partitions. Setting compaction to «partial-progress.enabled» and running it on partitions older than 1 day removed conflicts.`,
ex: `ALTER TABLE lake.payments SET TBLPROPERTIES (
  'commit.retry.num-retries' = '10',
  'commit.retry.min-wait-ms' = '200');
CALL system.rewrite_data_files(table => 'lake.payments',
  where => 'dt < current_date()',
  options => map('partial-progress.enabled', 'true'));`,
pit: [`Many writers updating the same partitions concurrently.`, `Catalogs without atomic swap (plain file-system "catalogs" on S3).`, `Ignoring commit retry metrics.`],
q: [`Two jobs append to the same Iceberg table at the same time. Does one fail?`, `Usually not: the loser's commit fails the swap, refreshes, re-applies its appended files on top and retries successfully.`]
},
"Hidden partitioning": {
d: `In Hive you add a column «dt» derived from «ts», and every query must filter on «dt» explicitly or it scans everything; if someone writes the wrong «dt», data is silently misplaced.

Iceberg partitions by **transforms** of real columns, stored in the partition spec:
- «years/months/days/hours(ts)»,
- «bucket(N, col)» (hash buckets for high-cardinality ids),
- «truncate(W, col)» (string prefixes / integer ranges),
- «identity(col)».

Users just filter «WHERE ts >= '2026-11-19 10:00'» and Iceberg maps it to partition ranges for pruning. The partition value is computed on write, never typed by users, so it can't be wrong.`,
life: `A smart filing cabinet that files every receipt under its month automatically. You ask "receipts from 12–15 Nov" and it opens only November, without you knowing how it's organised.`,
work: `Analysts kept forgetting «AND dt = ...» on a Hive «events» table; each mistake scanned 400 TB. After moving to Iceberg with «days(event_ts)», ordinary «WHERE event_ts BETWEEN ...» filters pruned automatically and the monthly scan bill dropped 70%.`,
ex: `CREATE TABLE lake.events (
  event_id string, user_id bigint, event_ts timestamp, payload string)
USING iceberg
PARTITIONED BY (days(event_ts), bucket(16, user_id));
SELECT count(*) FROM lake.events
WHERE event_ts >= TIMESTAMP '2026-11-19 00:00:00';   -- prunes to 1 day`,
pit: [`Partitioning by identity on high-cardinality columns (user_id).`, `Too fine partitions (hours) on small tables → tiny files.`, `Wrapping the column in functions the transform can't map («date_format(ts, ...)»).`],
q: [`A table is partitioned by «days(ts)». Does «WHERE ts > now() - interval 2 hours» prune?`, `Yes. Iceberg converts the ts predicate into the matching day partitions.`]
},
"Partition evolution": {
d: `Data patterns change: a table partitioned by «months(ts)» grows 50× and now needs «days(ts)». In Hive that means rewriting the whole table. In Iceberg, partition specs are **versioned**: «ALTER TABLE ... REPLACE PARTITION FIELD months(ts) WITH days(ts)» creates spec 1. Old files keep spec 0, new files use spec 1, and the planner prunes each file using **its own spec**.

No data is rewritten. If you want old data in the new layout too, run «rewrite_data_files» later at your own pace. The same works for adding a bucket field or dropping a partition field.`,
life: `A school changes its record filing from "by year" to "by month" starting this year. Old folders stay as they are; the clerk knows to look in a year folder for old records and month folders for new ones.`,
work: `«merchant_txns» was partitioned by «months(ts)»; monthly partitions reached 3 TB and daily queries scanned the whole month. Evolving to «days(ts)» made new data prune to 1/30th immediately. A background compaction later rewrote the last 3 months in the new spec.`,
ex: `ALTER TABLE lake.merchant_txns REPLACE PARTITION FIELD months(ts) WITH days(ts);
ALTER TABLE lake.merchant_txns ADD PARTITION FIELD bucket(32, merchant_id);
SELECT spec_id, count(*) FROM lake.merchant_txns.files GROUP BY spec_id;`,
pit: [`Assuming old data is re-partitioned automatically.`, `Engines/old readers that don't support multiple specs.`, `Evolving to over-fine partitions.`],
q: [`After changing the partition spec, do queries still prune old files?`, `Yes, each file is pruned using the spec it was written with.`]
},
"Time travel and rollback": {
d: `Every commit creates a **snapshot**, and old snapshots stay readable until expired. You can:
- Query a past state: «FOR VERSION AS OF <snapshot_id>» or «FOR TIMESTAMP AS OF '...'» (or DataFrame options «snapshot-id», «as-of-timestamp»).
- Compare versions: incremental reads between two snapshots («start-snapshot-id», «end-snapshot-id») or the changelog view.
- **Roll back**: «rollback_to_snapshot» / «rollback_to_timestamp» just moves the current pointer back; no data is copied. «cherrypick_snapshot» applies a specific snapshot's changes.

How far back you can go depends on «expire_snapshots» settings («history.expire.max-snapshot-age-ms», min snapshots to keep).`,
life: `Google Docs version history: view yesterday's version, compare, or restore it with one click, without retyping anything.`,
work: `A buggy dbt model overwrote «fact_settlements» with zero amounts at 02:10. Finance noticed at 09:00. The on-call engineer ran «CALL system.rollback_to_timestamp('lake.fact_settlements', TIMESTAMP '2026-11-19 02:00:00')» and the table was correct again in seconds, while the model was fixed.`,
ex: `SELECT snapshot_id, committed_at, operation FROM lake.fact_settlements.snapshots ORDER BY committed_at DESC;
SELECT sum(amount) FROM lake.fact_settlements FOR TIMESTAMP AS OF '2026-11-19 02:00:00';
CALL system.rollback_to_snapshot('lake.fact_settlements', 8812345678901);`,
pit: [`Aggressive snapshot expiry removing your safety net.`, `Thinking rollback undoes downstream copies (it only affects this table).`, `Time-travel queries on very old snapshots after files were expired (fails).`],
q: [`Does rollback_to_snapshot copy data?`, `No, it only changes the table's current snapshot pointer.`]
},
"Branches and tags": {
d: `Iceberg supports Git-like **refs**:
- **Tag**: a named, immutable pointer to a snapshot («eom-2026-10», «audit-q3»), with its own retention, so it survives snapshot expiry. Great for month-end reports and reproducible ML datasets.
- **Branch**: an independent line of snapshots. Writes can target a branch («INSERT INTO t.branch_audit ...» or «spark.wap.branch»).

**Write-Audit-Publish (WAP)**: write a batch into an audit branch, run data quality checks against it, then **fast-forward** main to the branch if it passes. Readers of main never see bad data; failed batches are simply dropped.`,
life: `A newspaper's draft edition: editors write and proofread in a draft (branch), and only when it passes checks does it become today's printed edition (fast-forward main). Special editions are archived with a label (tag).`,
work: `A daily «payments_gold» load occasionally had duplicate rows from an upstream bug. With WAP, the job wrote to branch «audit», ran checks (unique payment_id, amount sum within 0.5% of source), and only then fast-forwarded main. Two bad batches in a month were caught; dashboards never showed wrong numbers.`,
ex: `ALTER TABLE lake.payments_gold CREATE BRANCH audit;
INSERT INTO lake.payments_gold.branch_audit SELECT * FROM staging;
SELECT count(*) - count(DISTINCT payment_id) FROM lake.payments_gold.branch_audit;  -- must be 0
CALL system.fast_forward('lake.payments_gold', 'main', 'audit');
ALTER TABLE lake.payments_gold CREATE TAG \`eom-2026-10\` RETAIN 400 DAYS;`,
pit: [`Branches that never get cleaned up.`, `Readers accidentally reading the branch.`, `Assuming fast-forward works after main moved independently (it must be an ancestor).`],
q: [`Why use a tag for a month-end dataset instead of remembering a snapshot id?`, `Tags have their own retention, so the snapshot isn't expired, and the name is meaningful and stable.`]
},
"Copy-on-write vs merge-on-read": {
d: `Iceberg data files are immutable, so updates and deletes need a strategy (set per operation: «write.update.mode», «write.delete.mode», «write.merge.mode»):
- **Copy-on-write (COW)**: rewrite every data file that contains an affected row. Writes are expensive (changing 1 row in a 512 MB file rewrites 512 MB); reads are as fast as an append-only table.
- **Merge-on-read (MOR)**: write small **delete files**: **position deletes** (file path + row position), **equality deletes** (delete where key = x, used by streaming upserts), or in format v3 **deletion vectors** (compact bitmaps per data file). Readers merge deletes at read time. Fast writes, slower reads until **compaction** applies deletes.

Rule of thumb: frequent small updates (CDC, streaming) → MOR + regular compaction. Rare, large batch updates → COW.`,
life: `Correcting a printed book: COW reprints every affected page. MOR staples an errata sheet in the back that readers must check; periodically you reprint with corrections merged.`,
work: `A CDC MERGE every 5 minutes into «orders» used COW: each MERGE rewrote ~300 GB because updates were spread across all days, and commits took 20 minutes. Switching to MOR made each MERGE write a few MB of delete files (40 s), and an hourly compaction kept read latency stable.`,
ex: `ALTER TABLE lake.orders SET TBLPROPERTIES (
  'write.delete.mode' = 'merge-on-read',
  'write.update.mode' = 'merge-on-read',
  'write.merge.mode'  = 'merge-on-read');
SELECT content, count(*) FROM lake.orders.files GROUP BY content;  -- 0 data, 1 pos del, 2 eq del`,
pit: [`MOR without compaction (reads get slower every hour).`, `COW for high-frequency CDC (write amplification).`, `Equality deletes on huge key sets left uncompacted.`],
q: [`Why do MOR reads slow down over time?`, `Readers must apply more and more delete files to each data file until compaction folds them in.`]
},
"The four chores": {
d: `Iceberg tables need routine maintenance (scheduled jobs or a managed service):
1. **rewrite_data_files**: compact small files into target size (e.g. 512 MB), optionally **sort/z-order** for better skipping, and apply delete files.
2. **expire_snapshots**: remove old snapshots and the files only they reference. Controls time travel window and storage cost.
3. **rewrite_manifests**: regroup manifest entries so manifests align with partitions, speeding planning on tables with many small commits.
4. **remove_orphan_files**: delete files in the table location not referenced by any snapshot (from failed writes). Use an «older_than» of a few days so in-flight writes aren't removed.

Order typically: compact → expire → rewrite manifests; orphan cleanup weekly.`,
life: `Running a house: tidy and combine loose papers (compaction), throw away old drafts you no longer need (expire), reorganise the index (manifests), and clear junk that never got filed (orphans).`,
work: `A streaming table had 3 M files, 40k snapshots and 25k manifests; planning took 90 s. A nightly maintenance job (compact to 512 MB, expire snapshots > 3 days keeping 50, rewrite manifests) brought it to 9k files and 2-second planning; S3 storage dropped 35% from expired files.`,
ex: `CALL system.rewrite_data_files(table => 'lake.events',
  strategy => 'sort', sort_order => 'user_id',
  options => map('target-file-size-bytes','536870912','min-input-files','5'));
CALL system.expire_snapshots(table => 'lake.events',
  older_than => TIMESTAMP '2026-11-16 00:00:00', retain_last => 50);
CALL system.rewrite_manifests('lake.events');
CALL system.remove_orphan_files(table => 'lake.events', older_than => TIMESTAMP '2026-11-12 00:00:00');`,
pit: [`Never expiring snapshots (storage grows forever).`, `remove_orphan_files with a short older_than during active writes.`, `Compacting hot partitions while streaming writers commit there (conflicts).`],
q: [`Why does expire_snapshots reduce storage while compaction alone doesn't?`, `Compaction writes new files but old ones are still referenced by old snapshots; expiring those snapshots lets the old files be deleted.`]
},
"Catalog choices": {
d: `The catalog's job: map table name → current metadata.json, and perform the atomic swap on commit. Options:
- **Hive Metastore**: widely supported; uses a lock or atomic parameter update.
- **AWS Glue**: managed, uses optimistic version checks; integrates with Athena, EMR, Redshift Spectrum.
- **JDBC catalog**: a Postgres/MySQL table; simple.
- **REST catalogs**: Apache Polaris, Unity Catalog, Nessie, AWS S3 Tables, Lakekeeper, Snowflake Open Catalog. A standard HTTP API any engine can use; servers can add **credential vending** (short-lived scoped S3 credentials), server-side commit checks, multi-table transactions, and access control.
- **Hadoop/file-system catalog**: relies on atomic rename; not safe on S3.

Pick one catalog per table as the **source of truth**; other engines should read through it.`,
life: `A city's land registry: whichever office you choose, there must be exactly one official register of who owns each plot. Two registers for the same plot leads to disputes.`,
work: `Spark wrote via Glue while a Flink job wrote via a Hadoop catalog to the same S3 path. Flink's commits overwrote Glue's pointer history and Athena showed stale data. Moving both engines to the Glue catalog (later to a REST catalog with credential vending) made commits consistent.`,
ex: `spark.sql.catalog.lake = org.apache.iceberg.spark.SparkCatalog
spark.sql.catalog.lake.type = rest
spark.sql.catalog.lake.uri = https://polaris.internal/api/catalog
spark.sql.catalog.lake.warehouse = prod
spark.sql.catalog.lake.credential = <client_id>:<secret>   # from a secret store`,
pit: [`Hadoop catalog on S3.`, `Two catalogs for one table.`, `Embedding long-lived S3 keys everywhere instead of vended credentials.`],
q: [`Why is a Hadoop (file-system) catalog unsafe on S3?`, `It relies on atomic rename to swap metadata, which S3 doesn't provide, so concurrent commits can clobber each other.`]
},
"Three layers of pruning": {
d: `Before reading any row, Iceberg narrows down files in three steps:
1. **Manifest list**: each manifest has partition **summaries** (lower/upper bounds per partition field). Manifests whose ranges can't match the filter are skipped entirely.
2. **Manifest entries**: each data file has its partition tuple and per-column **min/max, null and value counts**. Files whose stats can't match are skipped.
3. **Inside files**: the reader uses Parquet **row group** stats, dictionary filtering, page indexes and bloom filters to skip parts of files.

Effectiveness depends on **data layout**: if values are randomly spread, every file's min/max covers everything and nothing is skipped. **Sorting** or **z-ordering** on common filter columns makes ranges tight.`,
life: `Finding a document: first skip whole cabinets by the label on the front (manifest list), then skip folders by their date-range sticker (file stats), then flip only to the relevant pages (row groups).`,
work: `Queries filtering «merchant_id = ?» on «payments» (partitioned by day) still read every file of the day: merchant ids were random across files. Compacting with «sort_order => 'merchant_id'» made each file cover a narrow merchant range; files read per query dropped from 600 to 4.`,
ex: `ALTER TABLE lake.payments WRITE ORDERED BY merchant_id, ts;
CALL system.rewrite_data_files(table => 'lake.payments', strategy => 'sort',
  sort_order => 'zorder(merchant_id, customer_id)');
SELECT file_path, readable_metrics.merchant_id.lower_bound, readable_metrics.merchant_id.upper_bound
FROM lake.payments.files LIMIT 5;`,
pit: [`Expecting stats to help on unsorted data.`, `Stats disabled/truncated for long string columns.`, `Filters with functions on columns that prevent using stats.`],
q: [`Why can min/max stats be useless even if they're collected?`, `If data isn't clustered, each file's min and max span almost the whole value range, so no file can be excluded.`]
},
"Sequence numbers order everything": {
d: `Format v2 introduced **sequence numbers**. Each commit gets the next sequence number; every file added in that commit records it as its **data sequence number**.

Why it matters: a delete file must apply only to data written **before** it, not after.
- **Equality deletes** apply to data files with data sequence number **strictly less** than the delete's.
- **Position deletes** apply to data files with sequence number **≤** the delete's (they reference specific files).

So if a row with key 42 is deleted (equality delete, seq 10) and later re-inserted (data file, seq 11), the new row survives. Compaction preserves the original data sequence numbers of rewritten rows so delete semantics remain correct.`,
life: `A notice saying "cancel all bookings made before today under name Ravi" shouldn't cancel the booking Ravi makes tomorrow. Timestamps on bookings and on the notice make that clear.`,
work: `A Flink upsert job wrote equality deletes and inserts for the same key in the same checkpoint. Readers using an old engine (v1-only) showed deleted rows reappearing. Upgrading readers to v2-aware engines fixed it; the team added a rule that every engine touching v2 tables must be on a supported version.`,
ex: `SELECT snapshot_id, sequence_number, committed_at FROM lake.orders.snapshots ORDER BY sequence_number DESC LIMIT 3;
SELECT content, file_path, sequence_number FROM lake.orders.entries LIMIT 10;`,
pit: [`Old engines reading v2 tables without delete support.`, `Assuming file timestamps decide order (they don't).`, `Custom tools that rewrite files without preserving sequence numbers.`],
q: [`An equality delete for key 42 has sequence 10. A data file with key 42 has sequence 10 too. Is the row deleted?`, `No. Equality deletes only apply to data files with a strictly lower sequence number (written in an earlier commit).`]
},
"What each spec version added": {
d: `- **v1**: analytic tables: snapshots, manifests, schema and partition evolution, hidden partitioning, file-level stats. Append and overwrite only (row-level changes via COW).
- **v2**: **row-level deletes** (position and equality delete files), **sequence numbers**, stricter metadata requirements. Enables MOR, CDC and streaming upserts.
- **v3** (Iceberg 1.8+): **deletion vectors** (Puffin bitmap per data file; at most one per file, replacing position delete files), **row lineage** (row ids and last-updated sequence for incremental processing), new types (**variant** for semi-structured data, **geometry/geography**, nanosecond timestamps), **default values** for columns, multi-argument transforms, table encryption keys.

Upgrade: «ALTER TABLE t SET TBLPROPERTIES ('format-version'='3')» is metadata-only, but **every** reader and writer must support v3 first. You can't downgrade.`,
life: `Upgrading a file format like .doc to .docx: the file converts instantly, but anyone still on old Word can't open it anymore.`,
work: `The team wanted deletion vectors to speed up MOR reads. Before upgrading «orders» to v3, they audited consumers: Spark 3.5 + Iceberg 1.9 (OK), Trino (OK on new version), and an old Athena engine version (not OK). They upgraded Athena first, then flipped the property.`,
ex: `SHOW TBLPROPERTIES lake.orders ('format-version');
ALTER TABLE lake.orders SET TBLPROPERTIES ('format-version' = '2');
-- later, once all engines support it
ALTER TABLE lake.orders SET TBLPROPERTIES ('format-version' = '3');`,
pit: [`Upgrading before all engines support the version.`, `Expecting a downgrade path.`, `Mixing v1-only tools with v2 delete files.`],
q: [`What's the main change v2 added over v1?`, `Row-level deletes (position and equality delete files) with sequence numbers, enabling merge-on-read.`]
},
"Upserts from Flink": {
d: `Flink's Iceberg sink in **upsert mode** («write.upsert.enabled=true») with **identifier fields** (the primary key):
- For each incoming change, it writes an **equality delete** for the key and the **new row** in data files.
- Data and delete files are committed at each **Flink checkpoint** (exactly-once via the two-phase commit of the sink), so freshness = checkpoint interval.
- The table must be format v2+, and the partition spec must include the identifier fields' partitioning (or rows for a key in two partitions break upserts).

Costs: one equality delete per changed key per checkpoint → many delete files. Readers must apply them, so you need frequent **compaction** (Flink's own maintenance or Spark rewrite_data_files) to keep reads fast.`,
life: `Updating a contact list by writing "remove Ravi's old entry" plus "add Ravi's new entry" on a sticky note every few minutes. Readers check the sticky notes; periodically someone rewrites the clean list.`,
work: `Flink CDC from MySQL into Iceberg «customers» with 1-minute checkpoints. After a week, reads took 45 s due to 10k equality delete files. A 30-minute Spark compaction (rewrite_data_files with delete-file thresholds) brought reads to 3 s; checkpoints moved to 2 minutes to cut file counts.`,
ex: `CREATE TABLE lake.customers (
  id BIGINT, name STRING, city STRING, updated_at TIMESTAMP,
  PRIMARY KEY (id) NOT ENFORCED
) WITH ('format-version'='2', 'write.upsert.enabled'='true');
INSERT INTO lake.customers SELECT * FROM mysql_cdc_customers;`,
pit: [`No compaction for upsert tables.`, `Partitioning by a column that changes for a key (row moves partitions).`, `Very short checkpoint intervals creating tiny files.`],
q: [`What determines how fresh an Iceberg table is when written by Flink?`, `The checkpoint interval: files are committed only when a checkpoint completes.`]
},
"The REST catalog spec": {
d: `The **Iceberg REST catalog** is an OpenAPI-defined HTTP protocol: «GET /v1/{prefix}/namespaces/{ns}/tables/{table}» to load, «POST .../tables/{table}» to commit with **requirements** (e.g. "current snapshot id must be X") and **updates** (add snapshot, set properties). The server checks requirements and applies updates atomically.

Benefits over engine-side catalogs:
- Any engine with a REST client works with any server (Spark, Flink, Trino, DuckDB, PyIceberg, Snowflake).
- **Credential vending**: the server returns short-lived, table-scoped storage credentials, so engines never hold broad S3 keys.
- Server-side features: access control, auditing, multi-table commits, view support, scan planning offload.

Implementations: Apache Polaris, Unity Catalog, Nessie, AWS S3 Tables / Glue REST endpoint, Lakekeeper, Gravitino.`,
life: `Using a bank's official app instead of everyone keeping a key to the vault: the app checks who you are, lets you do only what you're allowed, and gives you a temporary token rather than a permanent key.`,
work: `Analysts' notebooks had read-write IAM keys to the whole lake bucket. Moving to a REST catalog with credential vending gave each session temporary, table-scoped credentials based on the user's role. An auditor's requirement ("who changed table X when") was met by the catalog's commit audit log.`,
ex: `from pyiceberg.catalog import load_catalog
cat = load_catalog("prod", **{
  "type": "rest", "uri": "https://catalog.internal/api/catalog",
  "warehouse": "lake", "credential": os.environ["CATALOG_CRED"],
  "header.X-Iceberg-Access-Delegation": "vended-credentials"})
tbl = cat.load_table("finance.payments")
df = tbl.scan(row_filter="dt >= '2026-11-01'").to_arrow()`,
pit: [`Hard-coding client secrets in notebooks.`, `Assuming every REST server supports every optional feature.`, `Bypassing the catalog with direct S3 writes.`],
q: [`What does credential vending give you?`, `Short-lived, scoped storage credentials issued per table/request, so engines don't need long-lived broad bucket access.`]
}
});
