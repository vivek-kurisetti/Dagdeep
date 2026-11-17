window.RM_DEEP = Object.assign(window.RM_DEEP || {}, {

"de-5-1": {dd:`## The problem Iceberg solves
Hive-style tables are just directories of files. Readers list directories to find data, there is no atomic commit (a reader can see half a write), schema changes can break old files, and listing millions of S3 objects is slow. Iceberg replaces "the table is a directory" with "the table is a tree of metadata files that lists exactly which data files belong to each version".

## The metadata tree
1. **Catalog:** stores one pointer per table to the current metadata file (Glue, Hive Metastore, a REST catalog, Nessie, JDBC).
2. **metadata.json:** schema history, partition specs, sort orders, properties, the list of snapshots and the current snapshot ID.
3. **Manifest list:** one per snapshot; lists the manifests in that snapshot with partition value ranges, so whole manifests can be skipped.
4. **Manifests:** Avro files listing data and delete files with their partition values, record counts and per-column statistics (min, max, null counts).
5. **Data files** (Parquet, ORC or Avro) and **delete files**.

## Commits and concurrency
A writer builds new data files and new metadata, then asks the catalog to swap the pointer from the version it started with to the new one: a compare-and-swap. If another writer committed first, the swap fails; the writer refreshes, checks whether the other commit conflicts (for example, both rewrote the same files), and retries by writing new metadata only. This **optimistic concurrency** gives serializable isolation for commits without locks during writing.

## Snapshots
Each commit creates an immutable snapshot. Readers pin the snapshot they started with, so long queries are never affected by concurrent writes. Old snapshots enable **time travel** («FOR VERSION AS OF», «FOR TIMESTAMP AS OF»), auditing, and **rollback** («CALL system.rollback_to_snapshot»). Branches and tags let you write to an isolated branch (write-audit-publish) and fast-forward main after validation.

## Schema evolution
Columns are tracked by unique IDs, not by name or position. Adding, dropping, renaming and reordering columns, and widening types (int to long, float to double), are metadata-only changes and never rewrite data. Old files simply lack the new column and read it as NULL.

## Format versions
- **v1:** analytic tables, append and overwrite.
- **v2:** row-level deletes with position and equality delete files, enabling merge-on-read updates and CDC.
- **v3:** adds features such as deletion vectors, row lineage and new types; engine support is still rolling out.`,
iq:[
 ["B","What problems does Iceberg solve compared to Hive tables?","Atomic commits (readers never see partial writes), no directory listing (files are tracked in metadata), safe schema evolution by column ID, hidden partitioning and partition evolution, snapshot isolation, time travel and rollback, and concurrent writers through optimistic concurrency."],
 ["I","Walk through what happens when Spark appends to an Iceberg table.","Spark reads the current metadata from the catalog, writes new Parquet files with column stats, writes a manifest listing them, writes a new manifest list that references the new manifest plus the existing ones, writes a new metadata.json with the new snapshot, and then atomically swaps the catalog pointer. Only after the swap do readers see the data."],
 ["I","How does Iceberg handle two writers committing at the same time?","Optimistic concurrency. Both write their files and metadata independently, then attempt a compare-and-swap of the catalog pointer. The second one fails, refreshes to the new current metadata, validates there is no logical conflict (for example both deleting the same rows), and retries with new metadata, reusing its data files. If there is a real conflict, the commit fails."],
 ["S","How would you implement write-audit-publish with Iceberg?","Write the new batch to a branch (or with stage-only commits), run data quality checks against that branch, and if they pass, fast-forward main to the branch snapshot (or cherry-pick the staged snapshot). Consumers reading main never see unvalidated data, and failed batches are simply discarded."]
]},

"de-5-1-2": {dd:`## Two ways to change rows in immutable files
Data files are never edited in place. To update or delete rows, a table format can either rewrite files or record the change separately.

## Copy-on-write (CoW)
An UPDATE or DELETE finds the data files containing affected rows, rewrites each of them without the old rows (and with new versions), and commits the replacement. Readers just read data files.
- **Good:** reads are as fast as possible.
- **Bad:** changing one row rewrites a whole file (hundreds of MB). Frequent small updates cause huge write amplification.
- **Use for:** tables updated rarely and in bulk, read heavily.

## Merge-on-read (MoR)
The change is recorded in small **delete files**, and new row versions go into new data files.
- **Position deletes:** "file X, row 1,042 is deleted". Precise and cheap to apply; requires the writer to know where the row is (Spark MERGE does).
- **Equality deletes:** "delete rows where id = 1001". The writer does not need to look up the row, which is why streaming CDC writers (Flink) use them, but readers must compare against every matching equality delete, which gets expensive.
- **Deletion vectors (v3):** compact bitmaps per data file, replacing position delete files.
- **Good:** fast, cheap writes.
- **Bad:** reads must merge deletes; performance degrades as delete files pile up.
- **Use for:** CDC and frequent upserts, followed by regular compaction.

## Configuring it
Each operation can use a different mode via table properties: «write.delete.mode», «write.update.mode», «write.merge.mode» set to copy-on-write or merge-on-read.

## Compaction closes the loop
«rewrite_data_files» rewrites data files with their deletes applied, producing clean files. «rewrite_position_delete_files» compacts delete files. For a CDC table, a typical pattern is merge-on-read writes every minute plus compaction of recent partitions every hour or day.`,
iq:[
 ["B","What is the difference between copy-on-write and merge-on-read?","CoW rewrites whole data files on update or delete, making writes expensive and reads cheap. MoR writes small delete files and new rows, making writes cheap and reads more expensive because they must apply deletes. Compaction periodically folds deletes into data files."],
 ["I","Why do streaming CDC writers use equality deletes?","An equality delete says 'delete rows where key = X' without needing to know which file holds the row. A streaming writer can't afford to look up row positions for every upsert, so it writes equality deletes plus the new row. The cost moves to readers and compaction."],
 ["S","Reads on a CDC Iceberg table got 10x slower over a month. Diagnose and fix.","Likely accumulated equality delete files and small data files: every scan must apply many deletes. Check the files and delete_files metadata tables for counts per partition. Run rewrite_data_files (with delete-file thresholds) on affected partitions and schedule it regularly, compact position deletes, rewrite manifests and expire snapshots. Consider partitioning so updates concentrate in recent partitions."]
]},

"de-5-1-3": {dd:`## Why maintenance is not optional
Every commit adds files and metadata; nothing is removed automatically. Without maintenance, tables accumulate small files, delete files, snapshots and orphaned objects, and both query speed and storage cost get worse every day.

## The four jobs
1. **rewrite_data_files (compaction):** combines small files into target-sized ones, applies delete files, and can re-sort data (binpack, sort or z-order strategies). Restrict it with a «where» filter to recent partitions so each run is cheap.
2. **expire_snapshots:** removes old snapshots and deletes the data and metadata files only they referenced. This is what actually frees storage after deletes and compaction. Choose retention to match how far back you need time travel and rollback.
3. **remove_orphan_files:** deletes files in the table location that no snapshot references, left behind by failed writes. Use a safe «older_than» (days, not minutes) so you never delete files from a commit still in progress.
4. **rewrite_manifests:** regroups manifests so they align with partitions, which speeds up planning after many small commits.
Also set «write.metadata.delete-after-commit.enabled» and «write.metadata.previous-versions-max» so old metadata.json files are cleaned up.

## Purging and retention
To enforce data retention (for example, keep 13 months of payments), run «DELETE FROM table WHERE created_at < cutoff». If the cutoff aligns with partition boundaries, this is a metadata-only operation that drops whole files. The bytes are only removed from S3 after the snapshots referencing them expire. For compliance deletes of specific customers, delete rows, then compact and expire snapshots so the data is physically gone.

## Scheduling
A typical setup in Airflow:
- Hourly: compact the last few hours or day of streaming tables.
- Daily: expire snapshots older than 7 days (keep at least some recent ones), rewrite manifests.
- Weekly: remove orphan files older than 3 days.
Track file counts, average file size, delete-file counts and snapshot counts per table, and alert on outliers.`,
iq:[
 ["B","Why do Iceberg tables need maintenance?","Each commit adds data files, delete files, manifests and a snapshot, and nothing is cleaned automatically. Over time you get small files, slow planning, slow merge-on-read scans and growing storage. Compaction, snapshot expiry, orphan cleanup and manifest rewrites keep tables fast and cheap."],
 ["I","You deleted 2 TB of old data from an Iceberg table, but the S3 bill did not drop. Why?","Delete creates a new snapshot without those files, but older snapshots still reference them, so the files stay in S3 for time travel. Storage is only freed after expire_snapshots removes the old snapshots, which deletes files no remaining snapshot needs."],
 ["S","Design a maintenance strategy for 200 Iceberg tables written by streaming and batch jobs.","Drive it from metadata: query each table's files, snapshots and delete_files tables to compute small-file counts, delete ratios and snapshot age, and compact only tables and partitions above thresholds. Schedule expire_snapshots daily with per-table retention, remove_orphan_files weekly with a multi-day safety window, and rewrite_manifests when manifest counts grow. Run it as a parameterized Airflow DAG with concurrency limits, avoid conflicting with active writers by compacting closed partitions, and record metrics for dashboards and alerts."]
]},

"de-6-1": {dd:`## Core ideas
Airflow schedules **DAGs** (directed acyclic graphs) of **tasks**. Each scheduled run has a **logical date** (also called the data interval): the run for 2026-11-12 processes the data of 2026-11-12, and starts after that interval ends. Templates such as «{{ ds }}», «{{ data_interval_start }}» and «{{ data_interval_end }}» pass the interval to tasks.

## Idempotency is the main design rule
A task run for a given interval must produce the same result however many times it runs. Then retries, manual reruns and backfills are safe. Practical rules:
- Read only the data of the run's interval, never "everything since the last run" based on wall-clock time.
- Overwrite the output partition for that interval, or MERGE on a key; don't append blindly.
- Never use «datetime.now()» for business logic inside tasks.

## Backfills and catchup
With «catchup=True», the scheduler creates runs for every missed interval since start_date. «airflow dags backfill» (or the backfill feature in Airflow 3) runs a historical range on demand. Use pools and «max_active_runs» so a backfill does not overload the warehouse.

## Making DAGs robust
- **Retries** with exponential backoff for transient failures.
- **Timeouts** («execution_timeout») so a hung task fails instead of blocking forever.
- **Sensors** in deferrable mode (or «mode="reschedule"») so waiting doesn't hold a worker slot.
- **Pools** to cap concurrent load on a shared resource.
- **SLAs or deadline alerts** and on-failure callbacks to Slack or PagerDuty.
- Keep DAG files light: no database calls or heavy imports at the top level, because the scheduler parses them constantly.
- Airflow orchestrates; heavy work runs elsewhere (Spark on EMR, SQL in the warehouse) via operators.

## Passing data
XComs are for small values (file paths, row counts), not datasets. Pass data through storage (S3, tables) and pass references between tasks.

## Data-aware scheduling
Datasets (assets in Airflow 3) let a DAG run when an upstream task updates a dataset, instead of guessing timings with sensors. This links producers and consumers explicitly.`,
iq:[
 ["B","What is a DAG in Airflow?","A directed acyclic graph of tasks with dependencies and a schedule. Each run processes one data interval, tasks execute in dependency order, and no cycles are allowed."],
 ["I","What does idempotent mean for an Airflow task and how do you achieve it?","Running the task multiple times for the same logical date gives the same result. Achieve it by processing only that interval's data (using templated dates), writing with partition overwrite or MERGE on keys, and avoiding side effects like appends or emails without dedup."],
 ["I","What is the difference between catchup and backfill?","Catchup is the scheduler automatically creating runs for all missed intervals between start_date (or the last run) and now. Backfill is explicitly running a chosen historical date range, usually after fixing logic or onboarding a new table."],
 ["S","Your daily DAG depends on an upstream team's table that lands at unpredictable times. How do you design the dependency?","Prefer data-aware scheduling: if the upstream is in Airflow, trigger on its dataset update. Otherwise use a deferrable sensor checking a completion signal (a success marker, a partition in the catalog, or a row in a control table) with a timeout and alerting. Agree on a data contract with an SLA, and make the DAG idempotent so late reruns are safe."]
]},

"de-6-2": {dd:`## Dimensions of data quality
- **Completeness:** expected rows and fields are present (row counts, null rates).
- **Validity:** values follow rules (amount >= 0, status in a known set, valid dates).
- **Uniqueness:** keys are not duplicated.
- **Consistency:** related data agrees (every payment's merchant exists; totals match the source).
- **Timeliness:** data arrives within its freshness SLA.
- **Accuracy:** values reflect reality, usually checked by reconciliation against a source of truth.

## Where to check
- **At ingestion:** schema validation and quarantining malformed records, so one bad row doesn't fail a whole load.
- **Before publishing:** checks on the staging output; publish only if they pass (write-audit-publish).
- **After publishing:** monitoring for drift and anomalies over time.

## Kinds of checks
- **Rule-based tests:** not null, unique, accepted values, referential integrity, ranges. dbt tests, Great Expectations, Soda and Deequ cover these.
- **Reconciliation:** compare counts and sums with the source per day or per key range. Essential for CDC pipelines.
- **Anomaly detection:** compare today's volume or metric distribution with recent history (for example, outside 3 standard deviations or below 50% of the 7-day median).

## Data contracts
A data contract is an agreement with the producing team on schema, semantics, freshness and quality, enforced in CI and at runtime. Breaking changes (renaming a column, changing units) must go through a versioned process instead of surprising consumers.

## Responding to failures
Decide per check whether it should **block** publishing (duplicate primary keys) or only **warn** (a slight volume dip). Route alerts to an owner, include context (which check, sample bad rows, a runbook link), and keep yesterday's good data visible rather than publishing broken data.`,
iq:[
 ["B","Name some common data quality checks.","Row count thresholds, null checks on required columns, uniqueness of primary keys, accepted values for categorical columns, range checks such as non-negative amounts, referential integrity between facts and dimensions, and freshness checks on load time."],
 ["I","How would you validate a CDC pipeline from MySQL to a lake table?","Reconcile per day: row counts and sums of key numeric columns between MySQL (from a replica) and the lake, plus counts by status. Sample primary keys and compare full rows. Track end-to-end latency from source commit timestamp to lake commit. Alert on mismatches beyond a small tolerance and investigate by key range."],
 ["S","How would you roll out data quality across a large platform without blocking every pipeline?","Start with a small set of blocking checks on critical tables (primary key uniqueness, freshness, row-count drops), and non-blocking monitoring everywhere else. Define ownership per table, standardize checks as code in the pipeline framework, add data contracts with key producers, and publish a quality dashboard. Tighten checks gradually based on incidents."]
]},

"de-8-1": {dd:`## A repeatable structure for design interviews
**1. Clarify requirements (5 minutes).** Ask about sources, consumers and their questions, freshness (seconds, minutes, daily), correctness needs (can we drop or duplicate events?), volume and growth, retention, and compliance (PII, PCI).

**2. Estimate.** Turn requirements into numbers: events per day, bytes per event, peak rate, storage per year. For example, 50 million events a day at 1 KB is about 50 GB per day, roughly 600 events per second on average and several thousand at peak. Numbers justify choices.

**3. Draw the high-level flow.** Sources, ingestion, storage layers (raw, cleaned, curated), processing, serving and consumers. Name a technology for each box and say why.

**4. Deep dive into two or three parts.** Pick what is hardest for this problem: CDC ordering, deduplication, late data, the table layout, the serving model, or backfills.

**5. Cover failure modes.** What happens when a job fails mid-run, a source sends a bad schema, Kafka is down for an hour, or you need to reprocess last month. Idempotency, replay and backfill paths are what senior interviewers listen for.

**6. Operations.** Monitoring (lag, freshness, quality), alerting, cost controls, access control and data governance.

**7. Trade-offs.** State what you would change for 10x volume, stricter latency or a smaller budget.

## Batch, micro-batch or streaming?
- **Batch (hourly or daily):** simplest and cheapest; use when consumers accept that delay.
- **Micro-batch (every few minutes):** Spark Structured Streaming or frequent batch; good balance for most near-real-time analytics.
- **Streaming (seconds):** Flink or Kafka Streams; for fraud detection, alerting and operational use cases. More complex to operate.
Many designs use a Kappa-like approach (one streaming path that can also replay history) or combine a streaming path with a daily batch correction.

## Phrases that show seniority
"This step is idempotent, so retries are safe." "We can replay from Kafka for 7 days and from the raw layer beyond that." "We reconcile daily against the source." "Here is what breaks first at 10x."`,
iq:[
 ["I","How do you decide between batch and streaming for a new pipeline?","Start from the freshness the consumers actually need and what decisions they make with it. If hourly or daily is fine, batch is simpler, cheaper and easier to backfill. If decisions need data within minutes, use micro-batch; within seconds, streaming. Also consider source capabilities, team experience and operational cost."],
 ["S","Design a pipeline to compute daily active merchants and GMV from 50M transactions/day, available by 6 AM.","Clarify definitions (active = at least one successful payment). Ingest via CDC or daily extract into a raw Iceberg table partitioned by date. A daily Spark job (Airflow, logical date) deduplicates by payment_id, filters successes, aggregates by merchant and date into a gold table with partition overwrite. Data quality checks gate publishing. Discuss late-arriving payments (reprocess the last 3 days), backfill, reconciliation with the source, and cost (pruning, compaction)."]
]},

"de-8-2": {dd:`## Worked design: MySQL to lakehouse CDC with under 5 minutes freshness
**Requirements.** Mirror 40 payment tables from MySQL into the lake for analytics and ML. Freshness under 5 minutes, no lost or duplicated changes, deletes respected, history queryable, cost reasonable.

**Ingestion.** Debezium MySQL connectors on Kafka Connect read the binlog (ROW format, GTIDs, binlog retention of 7 days). One topic per table, keyed by primary key, Avro with a schema registry. Initial load through incremental snapshots.

**Transport.** Kafka with replication factor 3, min ISR 2, acks=all, partitions sized for peak throughput, retention of 7 days so any downstream job can replay.

**Processing.** A Flink job per group of tables (or one job with dynamic routing) consumes the topics, converts change events into upserts and deletes on the primary key, and writes to Iceberg v2 tables in merge-on-read mode, committing on each checkpoint (every 1 to 2 minutes). Checkpoints store Kafka offsets with the pending files, giving exactly-once commits.

**Storage layout.** Mirror tables partitioned by a date column where queries filter on it, bucketed by primary key for large tables. A raw append-only change log table can be kept as well for audit and point-in-time reconstruction.

**Maintenance.** Hourly compaction of recent partitions to apply equality deletes, daily snapshot expiry, weekly orphan cleanup.

**Correctness.** Daily reconciliation of counts and sums per table and partition against a MySQL replica; alerts on drift. Track end-to-end latency (source ts_ms to commit time).

**Schema changes.** Additive changes evolve the Iceberg schema automatically; breaking changes go through a contract process with the source team.

**Failure scenarios.**
- Flink fails: restores from the last checkpoint and replays from Kafka; commits are idempotent through the checkpoint ID.
- Debezium down longer than binlog retention: re-snapshot incrementally; idempotent upserts absorb overlaps.
- Bad data from source: quarantine and alert; downstream readers see the last good snapshot.

**Trade-offs.** Equality deletes make writes cheap but reads costly until compaction; for a smaller scale, a micro-batch Spark MERGE every 5 minutes is simpler. Cost is dominated by Flink compute and compaction; tune commit frequency against freshness.`,
iq:[
 ["S","Design a CDC pipeline from MySQL into an Iceberg lakehouse.","Debezium on the binlog (ROW, GTID) into Kafka topics keyed by primary key, a Flink job applying upserts and deletes to Iceberg v2 merge-on-read tables with commits per checkpoint, scheduled compaction and snapshot expiry, daily reconciliation, schema registry for evolution, and clear recovery paths: replay from Kafka, incremental re-snapshot, idempotent upserts. Mention freshness trade-offs and monitoring of lag and commit age."],
 ["S","How do you guarantee no duplicates in the lake when Flink restarts?","Iceberg commits are tied to completed checkpoints. Pending files from an interrupted interval are never committed or are discarded on restore, and the committer stores the checkpoint ID in snapshot metadata so it can skip committing a checkpoint twice. Kafka offsets are restored from the same checkpoint, so replayed records produce the same upserts keyed by primary key."]
]},

/* Interview questions only (no deep dive) */
"de-1-2": {iq:[
 ["B","What is a generator in Python and why use it in data pipelines?","A function that yields values one at a time, keeping its state between calls. It lets you stream through large files or API pages with constant memory instead of loading everything at once."],
 ["I","How would you structure a Python ETL project for production?","A package with modules for extract, transform and load, configuration via environment or typed config (pydantic), logging instead of prints, unit tests with pytest and fixtures, dependency pinning, a CLI entry point, and a Dockerfile. Business logic in pure functions so it's easy to test."]
]},
"de-2-4": {iq:[
 ["I","Why do table formats avoid listing S3 prefixes?","LIST returns 1,000 keys per request and is slow for millions of objects, and it gives no atomic view of a table. Table formats keep the exact file list in metadata, so planning needs a few metadata reads and readers always see a consistent snapshot."]
]},
"de-3-3": {iq:[
 ["I","What is an incremental model in dbt and what can go wrong?","A model that only processes new or changed rows on each run (filtered with is_incremental()) and merges them into the existing table by unique_key. Problems: late-arriving rows outside the filter window are missed (use a lookback), schema changes need on_schema_change settings, and logic changes need a full refresh."]
]},
"de-5-2": {iq:[
 ["S","Iceberg, Delta Lake or Hudi: how would you choose?","All three provide ACID tables on object storage. Iceberg has the broadest engine support (Spark, Flink, Trino, Athena, Snowflake, Redshift), hidden partitioning and a REST catalog standard. Delta is tightly integrated with Databricks and Spark. Hudi is strongest at record-level upserts and incremental pulls. Choose by engines you must support, upsert patterns, existing platform and team skills."]
]},
"de-6-3": {iq:[
 ["I","What would you monitor for a critical daily pipeline?","Freshness (did the table update by its SLA), volume (row counts vs history), schema changes, data quality check results, job duration trends and cost. Alert on user-visible symptoms with an owner and a runbook, not on every retry."]
]},
"de-7-3": {iq:[
 ["I","How have you, or would you, reduce the cost of a data platform?","Measure cost per pipeline first. Then reduce bytes scanned (partition pruning, sorting, compaction), right-size and autoscale clusters, use spot or Graviton instances, remove unused tables and jobs, set retention and lifecycle policies, and move cold data to cheaper storage tiers. Report savings with before and after numbers."]
]},
"de-8-3": {iq:[
 ["I","How do you handle PII in a data lake?","Classify columns at ingestion, encrypt everything at rest with KMS and in transit with TLS, restrict raw PII to a few roles, expose masked or tokenized views to analysts, keep audit logs of access, and implement deletion workflows for retention and right-to-erasure requests. For card data, never store full card numbers outside PCI-scoped systems."]
]}

});
