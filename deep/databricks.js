QUEST.deep("databricks", {
"Parquet + a transaction log": {
d: `A **Delta Lake** table = Parquet data files + a «_delta_log/» directory. The log is an ordered sequence of commits: «00000000000000000000.json», «...001.json», ... Each commit lists **actions** (files added/removed, schema/metadata changes, commit info). Every 10 commits (configurable), a **checkpoint** («.checkpoint.parquet») summarises the full state so readers don't replay thousands of JSON files.

To read version N, an engine reads the latest checkpoint ≤ N plus subsequent JSON commits, computes the set of **active files**, and reads only those (using per-file **stats** for data skipping). Files not in the active set (deleted/overwritten) remain on storage until «VACUUM».

This gives ACID transactions, **time travel** («VERSION AS OF», «TIMESTAMP AS OF»), schema enforcement and evolution, and audit history («DESCRIBE HISTORY»).`,
life: `A ledger book that records "added these pages, removed those pages" for every change, plus a monthly summary page so you don't reread the whole ledger to know what's current.`,
work: `A Spark job wrote Parquet to S3 directly; a failed run left half-written files that downstream readers picked up, double-counting a day's GMV. Moving the table to Delta meant readers only saw committed versions; failed runs left orphan files that VACUUM cleaned later.`,
ex: `ls s3://lake/payments/_delta_log/
00000000000000000098.json  00000000000000000099.json  00000000000000000100.checkpoint.parquet  _last_checkpoint
DESCRIBE HISTORY lake.payments;
SELECT count(*) FROM lake.payments VERSION AS OF 97;
SELECT count(*) FROM lake.payments TIMESTAMP AS OF '2026-11-18 23:00:00';`,
pit: [`Writing Parquet files into a Delta folder by hand.`, `Deleting log files manually.`, `VACUUM with very short retention breaking time travel and readers.`],
q: [`How does a reader know which Parquet files belong to the current version?`, `It replays the transaction log (latest checkpoint + later commits) to compute the active file set.`]
},
"ACID via optimistic concurrency": {
d: `Writers don't lock the table. A writer: reads the current version (say 100), writes new data files, then tries to commit by creating «...101.json». Storage must guarantee **put-if-absent** (S3 conditional writes or a commit coordination service; Databricks handles this). If another writer already created 101, the commit fails, and Delta checks for **logical conflicts**:
- If the other commit touched files/partitions this transaction read or modified (e.g. both updated the same rows' files), it's a real conflict → «ConcurrentModificationException» (e.g. ConcurrentAppendException, ConcurrentDeleteReadException).
- If not (e.g. both appended to different partitions), Delta **retries** the commit as 102 automatically.

Isolation levels: **WriteSerializable** (default) and **Serializable**. **Row-level concurrency** (with deletion vectors / liquid clustering) reduces conflicts by detecting them at row level rather than file level.`,
life: `Two editors working on a shared document offline: when they sync, if they changed different sections both edits are kept; if they changed the same paragraph, one has to redo theirs.`,
work: `Two jobs MERGEd into «orders» concurrently (CDC stream + nightly correction job) and the nightly job failed with ConcurrentAppendException. Adding a partition predicate to the correction MERGE (only older dates) and enabling row-level concurrency with deletion vectors let both run without conflicts.`,
ex: `MERGE INTO lake.orders t USING corrections s
ON t.order_id = s.order_id AND t.order_date < current_date() - INTERVAL 2 DAYS   -- narrow the conflict scope
WHEN MATCHED THEN UPDATE SET *;
ALTER TABLE lake.orders SET TBLPROPERTIES ('delta.enableDeletionVectors' = true);`,
pit: [`Concurrent MERGEs without disjoint predicates.`, `Not retrying on transient concurrency exceptions.`, `Multi-cluster writes to S3 without proper commit coordination (outside Databricks).`],
q: [`Two jobs append to different partitions of a Delta table at the same time. Does one fail?`, `Usually no: there's no logical conflict, so the losing commit is retried automatically at the next version.`]
},
"Liquid clustering": {
d: `**Liquid clustering** («CLUSTER BY (col1, col2)») replaces Hive-style partitioning and Z-ORDER for most tables. Data is organised by the clustering keys using a space-filling curve so rows with similar key values sit in the same files, giving good **data skipping** for filters on any of the keys.

Advantages:
- **Incremental**: «OPTIMIZE» only reclusters new or poorly clustered data, not the whole table (Z-ORDER rewrites everything each time). Clustering can also happen on write for some operations, and **predictive optimization** can run it automatically.
- **Flexible**: change keys anytime with «ALTER TABLE ... CLUSTER BY (...)», no rewrite needed; new data follows new keys.
- **No partition skew / small files** from high-cardinality partition columns.
- «CLUSTER BY AUTO» lets Databricks choose keys from query history.
- Works with row-level concurrency for fewer write conflicts.

Choose keys = columns most used in filters (e.g. «event_date», «merchant_id»), up to 4.`,
life: `A self-organising library that keeps similar books near each other and only re-shelves new arrivals, and lets you change the organising scheme without moving every existing book.`,
work: `«events» was partitioned by «date» and «country» (40k partitions, tiny files) and Z-ORDERed by «user_id» weekly (6-hour job). Switching to «CLUSTER BY (event_date, user_id)» with predictive optimization removed the weekly job, cut file count 90%, and kept user-level lookups fast.`,
ex: `CREATE TABLE lake.events (event_id STRING, user_id BIGINT, event_date DATE, payload STRING)
CLUSTER BY (event_date, user_id);
ALTER TABLE lake.payments CLUSTER BY (merchant_id, payment_date);   -- change keys later
OPTIMIZE lake.events;                                               -- incremental
ALTER TABLE lake.events CLUSTER BY AUTO;`,
pit: [`Combining liquid clustering with partitioning/Z-ORDER (not compatible).`, `Choosing keys nobody filters on.`, `Never running OPTIMIZE (or predictive optimization).`],
q: [`Why is liquid clustering more flexible than partitioning?`, `Keys can be changed without rewriting data, and clustering is incremental, avoiding partition skew and tiny files.`]
},
"Three-level namespace": {
d: `**Unity Catalog** (UC) organises data assets as «catalog.schema.object» under a **metastore** (typically one per region, attached to workspaces):
- **Catalogs**: top level, often per environment or domain («prod», «dev», «payments»).
- **Schemas** (databases) within catalogs.
- **Objects**: tables (managed or external), views, materialized views, **volumes** (governed file storage), **functions**, **ML models**.

UC provides centralised: **access control** (GRANT on catalog/schema/table, row filters, column masks), **lineage** (table and column level, automatically captured), **audit logs**, data discovery, tags, and **Delta Sharing** for sharing data with other organisations. Access to storage goes through **storage credentials** and **external locations**, so users don't hold cloud keys.`,
life: `A city → neighbourhood → building address system with a central registry that knows who owns each building, who can enter, and which roads connect them.`,
work: `Before UC, each workspace had its own Hive metastore and IAM roles; nobody knew who could read card-related tables. Migrating to UC with catalogs per domain, column masks on PII, and lineage made audits simple: "who accessed «payments.pii.cards» last month" became one query on system tables.`,
ex: `CREATE CATALOG payments;
CREATE SCHEMA payments.gold;
GRANT USE CATALOG ON CATALOG payments TO \`analysts\`;
GRANT SELECT ON TABLE payments.gold.daily_gmv TO \`analysts\`;
CREATE FUNCTION payments.gold.mask_pan(pan STRING) RETURN CASE WHEN is_account_group_member('pci') THEN pan ELSE concat('XXXX', right(pan, 4)) END;
ALTER TABLE payments.silver.cards ALTER COLUMN pan SET MASK payments.gold.mask_pan;`,
pit: [`Granting on tables but forgetting USE CATALOG/USE SCHEMA.`, `Users with direct cloud storage access bypassing UC.`, `One giant catalog for everything.`],
q: [`What are the three levels of a Unity Catalog name?`, `catalog.schema.object (table, view, volume, function, model).`]
},
"Auto Loader": {
d: `**Auto Loader** («format("cloudFiles")») incrementally ingests new files from cloud storage as a Structured Streaming source:
- Tracks which files were processed in the stream's **checkpoint** (RocksDB), giving **exactly-once** ingestion, even with millions of files.
- Discovery modes: **directory listing** (default, incremental listing) or **file notification** (uses cloud queues/events; scales to huge directories).
- **Schema inference and evolution**: infers schema, stores it at «cloudFiles.schemaLocation»; new columns can be added automatically («addNewColumns») or captured in a **rescued data column** («_rescued_data») instead of failing.
- Supports JSON, CSV, Parquet, Avro, ORC, text, binary.
- Run continuously or with «trigger(availableNow=True)» for incremental batch-style runs.`,
life: `A mailroom clerk who keeps a logbook of every letter already opened, so each new letter is opened exactly once, and who notes any unexpected new form fields instead of throwing the letter away.`,
work: `A custom ingestion job listed an S3 prefix with 30 M files every run (15 minutes of listing) and sometimes reprocessed files after failures. Auto Loader with file notifications and an «availableNow» trigger every 15 minutes ingested only new files, with exactly-once semantics; schema changes from a partner landed in «_rescued_data» instead of breaking the job.`,
ex: `df = (spark.readStream.format("cloudFiles")
      .option("cloudFiles.format", "json")
      .option("cloudFiles.schemaLocation", "s3://chk/partner_events/schema")
      .option("cloudFiles.useNotifications", "true")
      .option("cloudFiles.schemaEvolutionMode", "addNewColumns")
      .load("s3://partner-drop/events/"))
(df.writeStream.option("checkpointLocation", "s3://chk/partner_events/")
   .trigger(availableNow=True).toTable("bronze.partner_events"))`,
pit: [`Sharing checkpoints between streams.`, `Directory listing on enormous prefixes without notifications.`, `Ignoring _rescued_data (silent data loss in practice).`],
q: [`How does Auto Loader avoid processing a file twice?`, `It records processed files in the stream's checkpoint and commits progress with the sink, giving exactly-once ingestion.`]
},
"Medallion layers": {
d: `A common lakehouse layering:
- **Bronze**: raw data as received (append-only), with ingestion metadata (source file, load time). Keeps history for replays and audits.
- **Silver**: cleaned and conformed: types cast, deduplicated, invalid records quarantined, joined/enriched, CDC applied (current state tables, SCD). Still fairly granular.
- **Gold**: business-level aggregates and data products: facts/dimensions, KPIs, features for ML, tailored for consumers (BI, APIs).

**Lakeflow Declarative Pipelines** (formerly Delta Live Tables) let you declare these tables in SQL/Python («CREATE OR REFRESH STREAMING TABLE», «MATERIALIZED VIEW»), with **expectations** (data quality rules that warn, drop or fail), automatic dependency management, «AUTO CDC» / «APPLY CHANGES INTO» for CDC/SCD, and managed infrastructure.

Medallion is a guideline, not a rule: name and number layers to fit your domain.`,
life: `Water treatment: raw water collected (bronze), filtered and purified (silver), bottled and labelled for customers (gold).`,
work: `Payment events from Kafka landed in bronze; silver deduplicated by «payment_id» and applied status changes (CDC) with expectations dropping rows with null merchant ids (logged); gold built daily merchant GMV and settlement facts. When a bug was found in silver logic, the team replayed from bronze without asking the source to resend data.`,
ex: `CREATE OR REFRESH STREAMING TABLE bronze_payments AS
SELECT *, _metadata.file_path AS src_file FROM STREAM read_files('s3://raw/payments/', format => 'json');

CREATE OR REFRESH STREAMING TABLE silver_payments (
  CONSTRAINT valid_merchant EXPECT (merchant_id IS NOT NULL) ON VIOLATION DROP ROW);
APPLY CHANGES INTO silver_payments FROM STREAM(bronze_payments)
KEYS (payment_id) SEQUENCE BY updated_at STORED AS SCD TYPE 1;

CREATE OR REFRESH MATERIALIZED VIEW gold_daily_gmv AS
SELECT merchant_id, date(created_at) d, sum(amount) gmv FROM silver_payments WHERE status = 'SUCCESS' GROUP BY 1, 2;`,
pit: [`Transforming data in bronze (losing raw history).`, `Too many layers with no clear purpose.`, `No data quality checks between layers.`],
q: [`Why keep bronze raw and append-only?`, `So you can replay and rebuild silver/gold after logic bugs, and audit exactly what was received.`]
},
"Pick the right compute": {
d: `Main Databricks compute types:
- **Job compute**: clusters created for a job run and terminated after; lower DBU rate; isolate production pipelines; or **serverless jobs** with fast startup and no cluster management.
- **All-purpose compute**: interactive clusters for notebooks and development; higher DBU rate; shared by users; set auto-termination.
- **SQL warehouses**: for SQL/BI workloads: **serverless** (instant start, auto-scaling), Pro or Classic; Photon-enabled; scale with clusters for concurrency.
- **Serverless notebooks/pipelines** and **Model Serving** for real-time inference.

Cost hygiene: run production on job/serverless compute (not all-purpose), auto-termination on interactive clusters, cluster policies to limit sizes/instance types, spot instances for workers where safe, Photon where it speeds up SQL/DataFrame workloads enough to pay for itself. Track usage in «system.billing.usage».`,
life: `Taxi (job compute: hired per trip), company car pool (all-purpose: shared, always there, pricier), and a bus service for many passengers with standard routes (SQL warehouses).`,
work: `Analysts scheduled 40 production notebooks on a shared all-purpose cluster running 24/7. Moving them to job compute with policies (spot workers, auto-scaling 2–8) and setting 30-minute auto-termination on the interactive cluster cut the monthly bill by 45%.`,
ex: `SELECT sku_name, sum(usage_quantity) AS dbus
FROM system.billing.usage
WHERE usage_date >= current_date() - INTERVAL 30 DAYS
GROUP BY 1 ORDER BY 2 DESC;
-- cluster policy snippet
{"autotermination_minutes": {"type": "range", "maxValue": 60, "defaultValue": 30},
 "node_type_id": {"type": "allowlist", "values": ["m6i.xlarge", "m6i.2xlarge"]}}`,
pit: [`Production jobs on all-purpose clusters.`, `No auto-termination.`, `Serverless everywhere without checking cost per workload.`],
q: [`Why run scheduled pipelines on job compute rather than all-purpose clusters?`, `Job compute has lower rates and is isolated and ephemeral per run, avoiding idle costs and noisy neighbours.`]
},
"What's inside a commit": {
d: `Each commit file contains newline-delimited JSON **actions**:
- «add»: a data file path, partition values, size, modification time, **stats** (numRecords, minValues, maxValues, nullCount for the first 32 columns by default), optional **deletionVector** descriptor and tags.
- «remove»: a logical delete of a file (tombstone with deletion timestamp); physical deletion happens in VACUUM after the retention period.
- «metaData»: schema, partition columns, table properties, configuration.
- «protocol»: minimum reader/writer versions and **table features** required (e.g. deletionVectors, columnMapping, liquid clustering).
- «commitInfo»: operation (WRITE, MERGE, OPTIMIZE), parameters, metrics, user, timestamp.
- «txn»: application transaction ids for idempotent streaming writes.
- «cdc»: change data files when Change Data Feed is on.

Data skipping uses «add» stats; «delta.dataSkippingNumIndexedCols» or «delta.dataSkippingStatsColumns» control which columns get stats.`,
life: `Each ledger entry says "page 51 added (covers invoices 1,200–1,450)", "page 12 retired", "new column added to the form", with who did it and why.`,
work: `Queries filtering on «merchant_id» skipped no files. Inspecting the log showed «merchant_id» was column 47, beyond the default 32 columns with stats. Setting «delta.dataSkippingStatsColumns = 'merchant_id,payment_date,status'» and recomputing stats («ANALYZE TABLE ... COMPUTE DELTA STATISTICS») made skipping work.`,
ex: `{"add":{"path":"part-00012-...snappy.parquet","partitionValues":{},"size":104857600,
  "stats":"{\\"numRecords\\":812000,\\"minValues\\":{\\"payment_date\\":\\"2026-11-18\\"},\\"maxValues\\":{\\"payment_date\\":\\"2026-11-18\\"}}","dataChange":true}}
{"remove":{"path":"part-00003-...parquet","deletionTimestamp":1763541000000,"dataChange":true}}
{"commitInfo":{"operation":"MERGE","operationMetrics":{"numTargetRowsUpdated":"1532"}}}
ALTER TABLE lake.payments SET TBLPROPERTIES ('delta.dataSkippingStatsColumns' = 'merchant_id,payment_date,status');`,
pit: [`Filter columns without stats.`, `Ignoring protocol/table features (old readers can't read).`, `Assuming "remove" deletes data immediately.`],
q: [`Why might data skipping not work for a column?`, `The column may not have min/max stats (e.g. beyond the first 32 indexed columns), so files can't be excluded.`]
},
"Delta as a streaming source and sink": {
d: `**As a source**: «spark.readStream.table("t")» processes each new commit's added files in order. Options: «maxFilesPerTrigger» / «maxBytesPerTrigger» to bound batch size, «startingVersion»/«startingTimestamp». By default it expects **append-only** sources; if upstream rows are updated/deleted, the stream fails unless you set «skipChangeCommits» (ignore them) or read the **Change Data Feed** («readChangeFeed = true») to get inserts/updates/deletes with «_change_type».

**As a sink**: «writeStream.toTable(...)» with a checkpoint gives **exactly-once**: the stream's batch id and query id are written into the commit («txn» action), so a retried batch is detected and skipped. «foreachBatch» + MERGE enables upserts; use «txnAppId»/«txnVersion» options for idempotent writes inside foreachBatch.

This lets you chain bronze → silver → gold as streams, or use «trigger(availableNow=True)» for incremental batch.`,
life: `A conveyor belt between factory stations: each station picks up new boxes in order from the previous station's output shelf and stamps each delivery with a batch number so nothing is processed twice.`,
work: `A silver stream reading from bronze failed after someone ran a DELETE on bronze for GDPR. Switching the silver pipeline to read the Change Data Feed handled deletes properly (propagating them to silver), instead of using skipChangeCommits which would have kept deleted users' data downstream.`,
ex: `ALTER TABLE bronze.users SET TBLPROPERTIES (delta.enableChangeDataFeed = true);
changes = (spark.readStream.option("readChangeFeed", "true").table("bronze.users"))
def upsert(batch, batch_id):
    (batch.filter("_change_type != 'update_preimage'").createOrReplaceTempView("ch"))
    batch.sparkSession.sql("""MERGE INTO silver.users t USING ch s ON t.id = s.id
      WHEN MATCHED AND s._change_type = 'delete' THEN DELETE
      WHEN MATCHED THEN UPDATE SET * WHEN NOT MATCHED AND s._change_type != 'delete' THEN INSERT *""")
changes.writeStream.foreachBatch(upsert).option("checkpointLocation", "s3://chk/silver_users").start()`,
pit: [`Streaming from tables that get updated without CDF or skipChangeCommits.`, `foreachBatch MERGE without idempotency/dedupe.`, `Unbounded batches on first start (no maxFilesPerTrigger).`],
q: [`Why does a Delta streaming read fail after an UPDATE on the source?`, `Delta streaming sources assume append-only; changed/removed files violate that unless you skip change commits or read the change data feed.`]
},
"Unity Catalog under the hood": {
d: `How UC enforces governance:
1. A user/job on compute asks to read «payments.gold.daily_gmv».
2. Compute (in UC-enabled access modes: standard/shared or dedicated) asks UC: is this principal allowed? UC checks grants, row filters, column masks, ABAC policies.
3. If allowed, UC returns the table's storage location and vends **short-lived, down-scoped cloud credentials** (only for that table's path) to the compute.
4. The engine reads the files and applies row filters/column masks; access is recorded in **audit logs** and **lineage** in system tables.

Users never need direct S3/ADLS permissions. **Storage credentials** (IAM role / managed identity) and **external locations** define which paths UC can access. **Managed tables** live in UC-managed storage (enabling features like predictive optimization); **external tables** point to your paths. UC also exposes Iceberg REST and Delta Sharing interfaces for external engines.`,
life: `A bank vault where you don't get a master key: you show your ID at the desk, the clerk checks your access, and gives you a temporary key that opens only your locker for the next few minutes, logging the visit.`,
work: `An analyst read raw card data by querying the S3 path directly with their notebook's instance profile, bypassing table permissions. After migrating to UC with standard access mode clusters and removing broad instance profiles, all reads went through UC; the same attempt was denied and logged.`,
ex: `CREATE STORAGE CREDENTIAL lake_cred WITH (AWS_IAM_ROLE = 'arn:aws:iam::123456789012:role/uc-lake');
CREATE EXTERNAL LOCATION lake_raw URL 's3://lake-raw/' WITH (STORAGE CREDENTIAL lake_cred);
GRANT READ FILES ON EXTERNAL LOCATION lake_raw TO \`data-engineers\`;
SELECT event_time, user_identity.email, action_name, request_params
FROM system.access.audit WHERE action_name = 'getTable' AND event_date = current_date() LIMIT 20;`,
pit: [`Clusters with instance profiles granting broad bucket access (bypass).`, `Non-UC access modes for governed data.`, `External tables everywhere, missing managed-table optimisations.`],
q: [`How does UC let compute read files without users having S3 permissions?`, `It vends short-lived, path-scoped credentials to the compute after checking the user's grants.`]
}
});
