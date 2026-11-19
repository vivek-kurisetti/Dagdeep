QUEST.deep("redshift", {
"MPP with a leader": {
d: `Redshift is **massively parallel**. The **leader node** receives SQL, parses and optimises it, compiles code, and sends work to **compute nodes**. Each compute node is split into **slices** (each with a share of CPU, memory and disk). Every table's rows are spread across all slices, and every query step runs on all slices at once.

So total speed ≈ slowest slice. If data is evenly spread and joins don't need data movement, adding nodes scales nearly linearly. Some work stays on the leader: final ORDER BY/LIMIT merging, leader-only functions, and queries on catalog tables. **RA3** nodes separate compute from **Redshift Managed Storage** (S3-backed with local SSD cache); **Serverless** sizes compute in RPUs.`,
life: `A head chef (leader) reads the order, writes a plan and splits it among 16 cooks (slices), each with their own share of ingredients. Dinner is ready when the slowest cook finishes.`,
work: `A 4-node ra3.4xlarge cluster (16 slices) ran a nightly report in 40 minutes; one slice consistently finished 10 minutes after the rest because the distribution key «country» put 60% of rows on one slice. Switching to «DISTKEY(order_id)» evened the slices and the report took 18 minutes.`,
ex: `SELECT node, slice FROM stv_slices ORDER BY 1, 2;
SELECT slice, count(*) FROM stv_blocklist b JOIN svv_table_info t ON b.tbl = t.table_id
WHERE t."table" = 'orders' GROUP BY slice ORDER BY slice;   -- blocks per slice`,
pit: [`Assuming more nodes fix skewed distribution.`, `Running big ORDER BY + no LIMIT result sets through the leader.`, `Heavy catalog queries in hot paths (leader-only).`],
q: [`Why does one skewed slice slow the whole query?`, `Each step finishes only when all slices finish; the overloaded slice sets the pace.`]
},
"Columnar + zone maps": {
d: `Redshift stores each **column** separately in **1 MB blocks**, compressed with a per-column encoding. Queries read only the columns they reference, and compressed similar values read far less I/O than rows.

For every block Redshift keeps a **zone map**: the min and max value in that block. A filter like «WHERE created_at >= '2026-11-01'» checks zone maps and skips blocks that can't contain matches, without reading them. Zone maps are only effective if the column's values are **clustered** in block order, which is what a **sort key** gives you. On unsorted data, every block's min/max covers almost the whole range.`,
life: `A warehouse where each shelf has a sticker "invoices from 3 Nov to 9 Nov". If invoices were shelved in date order, you skip most shelves; if shelved randomly, every sticker says "Jan–Dec" and you must check all of them.`,
work: `A 6 TB «events» table filtered by «event_date» scanned 100% of blocks because it had no sort key and data arrived out of order from backfills. After adding «SORTKEY(event_date)» and a VACUUM SORT, the same query scanned 3% of blocks: 3 min → 6 s.`,
ex: `SELECT query, segment, step, rows, bytes, is_rrscan
FROM svl_query_summary WHERE query = pg_last_query_id() ORDER BY segment, step;
-- is_rrscan = 't' means range-restricted scan (zone maps used)`,
pit: [`SELECT * on wide tables (reads all columns).`, `Filtering on non-sort-key columns and expecting skipping.`, `Large unsorted regions after loads without vacuum.`],
q: [`Why does a sort key make zone maps useful?`, `Sorted data gives each block a narrow min–max range, so filters can exclude most blocks.`]
},
"Distribution styles": {
d: `Distribution decides which slice stores each row:
- **KEY**: hash of the DISTKEY column. Rows with the same key land on the same slice, so joins on that key are **collocated** (no movement). Choose a high-cardinality column used in big joins; avoid skewed ones.
- **ALL**: a full copy on every node. Great for small, slowly changing dimensions (≤ a few million rows); costly to load/update.
- **EVEN**: round-robin. Balanced storage, but joins need redistribution.
- **AUTO** (default): Redshift starts with ALL for small tables, then switches to EVEN or KEY as tables grow and from query patterns.

Check «svv_table_info.skew_rows» (ratio of largest to smallest slice) and «diststyle».`,
life: `Distributing exam papers to graders: by roll number (KEY) so each student's papers are with one grader; a copy of the answer key to every grader (ALL); or just deal papers around (EVEN).`,
work: `«orders» (2 B rows) and «order_items» (8 B rows) were both EVEN; every join redistributed ~400 GB. Setting both to «DISTKEY(order_id)» made the join collocated; the main dashboard query went from 95 s to 11 s. «merchants» (90k rows) became DISTSTYLE ALL.`,
ex: `ALTER TABLE orders ALTER DISTSTYLE KEY DISTKEY order_id;
ALTER TABLE order_items ALTER DISTSTYLE KEY DISTKEY order_id;
ALTER TABLE merchants ALTER DISTSTYLE ALL;
SELECT "table", diststyle, skew_rows FROM svv_table_info ORDER BY skew_rows DESC;`,
pit: [`DISTKEY on a low-cardinality or skewed column (status, country).`, `ALL on big, frequently updated tables.`, `Different distkeys on two tables that are always joined.`],
q: [`What makes a good DISTKEY?`, `A high-cardinality, evenly distributed column that's used to join the biggest tables together.`]
},
"Redistribution is a shuffle": {
d: `When join keys aren't on the same slice, Redshift moves data at query time. EXPLAIN labels each join:
- «DS_DIST_NONE»: collocated, no movement (best).
- «DS_DIST_ALL_NONE»: inner table is ALL, no movement.
- «DS_BCAST_INNER»: broadcast the inner table to all nodes (fine if small).
- «DS_DIST_INNER» / «DS_DIST_OUTER»: redistribute one side by the join key.
- «DS_DIST_BOTH»: redistribute both sides (most expensive).
- «DS_DIST_ALL_INNER»: send inner table to a single slice (outer is ALL).

Also watch for **nested loop joins** (missing join condition) in «stl_alert_event_log».`,
life: `Two lists of students in different classrooms: if both lists are already sorted into the same rooms by roll number, you match them in place. Otherwise someone has to walk papers between rooms.`,
work: `A join between «payments» (DISTKEY payment_id) and «refunds» (DISTKEY refund_id) on «payment_id» showed «DS_DIST_INNER» moving 300 GB of refunds every run. Changing refunds' DISTKEY to «payment_id» turned it into DS_DIST_NONE.`,
ex: `EXPLAIN
SELECT p.merchant_id, sum(r.amount)
FROM payments p JOIN refunds r ON r.payment_id = p.payment_id
GROUP BY 1;
-- XN Hash Join DS_DIST_INNER  (cost=...)  <- redistributes refunds`,
pit: [`Ignoring DS_DIST_BOTH in hot queries.`, `Joining on expressions (cast/coalesce) that prevent collocation.`, `Broadcasting large "small" tables.`],
q: [`Best and worst join distribution labels?`, `Best: DS_DIST_NONE (or ALL_NONE). Worst: DS_DIST_BOTH.`]
},
"Sort keys skip blocks": {
d: `**Compound sort key** («SORTKEY(a, b, c)»): rows sorted by a, then b, then c. Filters on the leading column prune extremely well; on «b» alone much less. Best for most workloads (time-first filters, merge joins on the leading column).

**Interleaved sort key**: gives equal weight to each column via z-ordering, so filters on any one column prune somewhat. But it's expensive to maintain (VACUUM REINDEX), degrades with appended monotonically increasing data, and AWS recommends compound or AUTO in most cases.

**SORTKEY AUTO**: Redshift chooses from query patterns. New rows land in an **unsorted region** until VACUUM (or automatic sort) merges them; check «svv_table_info.unsorted».`,
life: `A phone directory sorted by city then surname: perfect for "Hyderabad + Reddy", poor for "all Reddys in India". An interleaved one is like a grid map: OK for any single lookup, harder to keep updated.`,
work: `«transactions» had «SORTKEY(merchant_id, created_at)» but 90% of queries filtered only by date ranges. Changing to «SORTKEY(created_at, merchant_id)» made those queries skip 95% of blocks; merchant-specific queries still benefited from secondary ordering within each day.`,
ex: `ALTER TABLE transactions ALTER COMPOUND SORTKEY (created_at, merchant_id);
SELECT "table", sortkey1, unsorted, stats_off FROM svv_table_info WHERE "table" = 'transactions';
VACUUM SORT ONLY transactions TO 99 PERCENT;`,
pit: [`Leading sort column that queries rarely filter on.`, `Interleaved keys on append-heavy timestamp tables.`, `Ignoring a growing unsorted region.`],
q: [`A compound sort key (merchant_id, created_at). Does «WHERE created_at > X» prune well?`, `Poorly: it's not the leading column, so blocks within each merchant range still span many dates.`]
},
"Encoding and maintenance": {
d: `**Compression encodings** per column: **AZ64** (AWS's codec for numeric, date, timestamp: good ratio, fast), **ZSTD** (strong for text/varchar), **LZO**, **BYTEDICT** (few distinct values), **RUNLENGTH** (long runs), **RAW** (none). «ENCODE AUTO» (default) picks and can change encodings over time. AWS used to advise leaving the leading sort key column RAW; today, letting AUTO decide is the safe default.

Maintenance:
- **VACUUM**: re-sorts unsorted rows and reclaims space from deleted/updated rows (updates are delete + insert). «DELETE ONLY», «SORT ONLY», «FULL», «REINDEX». Automatic vacuum delete/sort runs in the background at low load.
- **ANALYZE**: refreshes statistics for the planner; auto analyze runs too, but run it after big loads.
- «svv_table_info»: «unsorted», «stats_off», «tbl_rows» vs «estimated_visible_rows».`,
life: `Vacuum-packing clothes by type (encoding) saves space. Periodically you also refold and throw out clothes you've given away (vacuum) and update the inventory list (analyze).`,
work: `After a daily «DELETE + INSERT» upsert pattern, «customers» grew from 80 GB to 410 GB of mostly deleted rows; scans slowed 4×. A scheduled «VACUUM DELETE ONLY customers» after the load plus switching to «MERGE» kept it under 100 GB.`,
ex: `ANALYZE COMPRESSION orders;           -- suggests encodings
ALTER TABLE orders ALTER COLUMN note ENCODE zstd;
VACUUM DELETE ONLY customers;
ANALYZE customers PREDICATE COLUMNS;
SELECT "table", unsorted, stats_off, tbl_rows FROM svv_table_info ORDER BY stats_off DESC;`,
pit: [`Forgetting that updates leave deleted rows behind.`, `Never analyzing after bulk loads.`, `Manual VACUUM FULL during peak hours.`],
q: [`Why does a table grow after many UPDATEs even though row count is stable?`, `Each update writes a new row and marks the old one deleted; space returns only after VACUUM.`]
},
"Materialized views": {
d: `A **materialized view** stores the result of a query (joins, aggregations) as a table-like object. Queries on it are fast because the heavy work is done once.

Refresh:
- «REFRESH MATERIALIZED VIEW mv» updates it. For supported queries, refresh is **incremental** (processes only changes in base tables); others need full recompute.
- «AUTO REFRESH YES» refreshes in the background when base tables change, at low priority.
- **Automatic query rewrite**: Redshift can rewrite a query against base tables to use a matching MV automatically.
- MVs can be built on external (Spectrum) tables, streaming sources, and other MVs (nested, Redshift supports cascade refresh).

Check staleness with «stv_mv_info.is_stale».`,
life: `A restaurant prepping gravy in the morning instead of making it from scratch for every order. Top it up as ingredients come in (incremental refresh).`,
work: `A merchant dashboard computed daily GMV from a 5 B-row table on every page load (8–20 s). An MV «daily_gmv_by_merchant» with AUTO REFRESH made the dashboard load in 300 ms; incremental refresh after each hourly load took ~40 s.`,
ex: `CREATE MATERIALIZED VIEW mv_daily_gmv
AUTO REFRESH YES AS
SELECT merchant_id, trunc(created_at) AS d, sum(amount) AS gmv, count(*) AS txns
FROM payments WHERE status = 'SUCCESS'
GROUP BY 1, 2;
SELECT name, is_stale, state FROM stv_mv_info;`,
pit: [`Using constructs that block incremental refresh (e.g. some window functions, DISTINCT in certain forms).`, `Assuming AUTO REFRESH is instant (it's best-effort).`, `Too many MVs refreshing during peak loads.`],
q: [`What does incremental refresh avoid?`, `Recomputing the whole MV: it applies only the base-table changes since the last refresh.`]
},
"COPY loads in parallel": {
d: `«COPY» is the fast path for loading: each slice reads files from S3 in parallel. To use all slices, the input should be **multiple files**, ideally a **multiple of the slice count**, each roughly **1 MB–1 GB compressed** (similar sizes). A single 50 GB gzip file is read by **one slice**.

Good practices: columnar formats (Parquet/ORC) or compressed CSV; a **manifest** file listing exact files (avoids prefix surprises); «STATUPDATE» / «COMPUPDATE» controls; load into a **staging table** then MERGE into the target. Single-row INSERTs are very slow (each is a commit and small block); batch them or use COPY. Errors go to «sys_load_error_detail» / «stl_load_errors».`,
life: `Unloading a truck with 16 workers: if goods come in 16 equal boxes, everyone works; if it's one giant crate, only one person can unpack it.`,
work: `A nightly load of a single 40 GB gzip CSV took 2 hours on a 32-slice cluster. Splitting it into 64 files of ~600 MB (Parquet) dropped the COPY to 7 minutes.`,
ex: `COPY staging_payments
FROM 's3://lake/exports/payments/2026-11-19/'
IAM_ROLE 'arn:aws:iam::123456789012:role/redshift-copy'
FORMAT AS PARQUET;
MERGE INTO payments USING staging_payments s ON payments.payment_id = s.payment_id
WHEN MATCHED THEN UPDATE SET status = s.status, amount = s.amount
WHEN NOT MATCHED THEN INSERT VALUES (s.payment_id, s.merchant_id, s.amount, s.status, s.created_at);`,
pit: [`One huge unsplittable file.`, `Row-by-row INSERTs from an app.`, `Loading directly into the main table without staging (partial loads visible, bad merges).`],
q: [`32 slices. How should you split a 20 GB load?`, `Into a multiple of 32 similarly-sized files, e.g. 64 files of ~300 MB compressed.`]
},
"Workload management": {
d: `**WLM** decides how many queries run at once and how much memory each gets. **Auto WLM** (recommended) estimates each query's needs and adjusts concurrency dynamically. You still define **queues** (by user group or query group) with **priorities** (HIGHEST to LOWEST), so dashboards beat batch ETL when resources are tight.

Other levers:
- **Short Query Acceleration (SQA)**: predicted-short queries run in a dedicated space, skipping the queue.
- **Concurrency scaling**: extra transient clusters absorb read bursts (with free credits per day).
- **Query monitoring rules (QMR)**: log, hop, or abort queries crossing limits (e.g. rows scanned, CPU time, nested loop joins).`,
life: `A hospital triage desk: emergencies (dashboards) are seen first, quick check-ups go to a fast lane (SQA), and when the waiting room overflows, a temporary clinic opens next door (concurrency scaling).`,
work: `Morning dashboards slowed to 40 s when the 9 AM ETL started. Creating a "bi" queue at HIGH priority, an "etl" queue at LOW, enabling SQA, and a QMR aborting ad-hoc queries scanning > 5 B rows brought dashboard p95 back to 3 s.`,
ex: `-- route a session to a queue
SET query_group TO 'etl';
-- check queueing
SELECT service_class, queue_start_time, total_queue_time/1e6 AS q_s, total_exec_time/1e6 AS exec_s
FROM stl_wlm_query ORDER BY queue_start_time DESC LIMIT 20;`,
pit: [`Manual WLM with fixed slots that waste memory.`, `Everything in one default queue.`, `No guardrails on ad-hoc queries.`],
q: [`What does SQA do?`, `Runs queries predicted to be short in a separate lane so they don't wait behind long-running ones.`]
},
"Spectrum and zero-ETL": {
d: `**Redshift Spectrum** queries data in S3 without loading: you create an **external schema** pointing to the Glue Data Catalog, then query external tables (Parquet, ORC, JSON, CSV; Iceberg and Delta via manifests or native support). Spectrum fleets do the scanning and filtering; you pay per TB scanned. Partitioned, columnar, compressed data with filters on partition columns keeps cost and time down. You can join external tables with local tables.

**Zero-ETL integrations** replicate data from Aurora MySQL/Postgres, RDS MySQL, DynamoDB and some SaaS sources into Redshift continuously (seconds of latency), with no pipelines to run. Good for near-real-time analytics on OLTP data; you still model it downstream.`,
life: `Spectrum is reading books in a partner library without bringing them home. Zero-ETL is a subscription that automatically delivers copies of new pages from another office.`,
work: `Clickstream (200 TB) lived in S3 as Parquet partitioned by day. Instead of loading it, analysts queried it via Spectrum and joined with local dimension tables; a filter on «dt» kept typical scans under 50 GB. Order data from Aurora MySQL came via zero-ETL with ~10 s lag, replacing a fragile DMS job.`,
ex: `CREATE EXTERNAL SCHEMA lake FROM DATA CATALOG
DATABASE 'lake_db' IAM_ROLE 'arn:aws:iam::123456789012:role/spectrum';
SELECT m.name, count(*) FROM lake.clicks c JOIN merchants m ON m.id = c.merchant_id
WHERE c.dt = '2026-11-18' GROUP BY 1;`,
pit: [`Spectrum on CSV or unpartitioned data (expensive scans).`, `Forgetting the partition filter.`, `Treating zero-ETL tables as modeled data.`],
q: [`What drives Spectrum cost?`, `Bytes scanned in S3; columnar formats, compression and partition pruning reduce it.`]
},
"From SQL to compiled segments": {
d: `The leader node turns a plan into an execution hierarchy:
- **Steps**: individual operations (scan, hash, aggregate, join, sort, network send/receive).
- **Segments**: groups of steps compiled into one piece of **C++ code** that each slice runs.
- **Streams**: sets of segments that can run concurrently; a stream must finish before the next starts (e.g. building a hash table before probing it).

Compiled segments are **cached**; a new query shape needs compilation (seconds), which is why the first run can be slower. Redshift also has a serverless compilation cache. System views «svl_query_summary» / «svl_query_report» show per-step rows, bytes, time and whether steps went to disk («is_diskbased»).`,
life: `A play rehearsal: individual moves (steps) are grouped into scenes (segments), scenes are grouped into acts (streams). Each act must end before the next begins.`,
work: `A report was "slow sometimes": the first run each morning took 14 s, later runs 2 s. «svl_compile» showed 12 s of compilation for new segments after the nightly patch cleared the cache. Warming the dashboard queries after maintenance fixed the user-visible delay.`,
ex: `SELECT segment, step, label, rows, bytes, is_diskbased, workmem
FROM svl_query_summary WHERE query = 12345 ORDER BY stm, seg, step;
SELECT query, segment, compile FROM svl_compile WHERE query = 12345;`,
pit: [`Benchmarking only the first run (compilation).`, `Missing «is_diskbased = t» steps (memory spill).`, `Generating unique SQL text every time (fewer cache hits).`],
q: [`Why might the first run of a query be slower than the second?`, `Its segments must be compiled the first time; later runs reuse cached compiled code.`]
},
"Minimum table size": {
d: `Redshift allocates storage in **1 MB blocks per column per slice**. For an EVEN or KEY table, every column gets at least one block on **every slice** that has rows, plus 3 hidden system columns (row id, insert/delete transaction ids). Sorted tables can need two segments (sorted + unsorted).

So minimum size ≈ «(user columns + 3) × slices × 1 MB» (× 2 for sorted regions). A 100-column table with 10 rows on a 64-slice cluster can take ~6.5 GB. This surprises people with many tiny tables or very wide staging tables. Use **DISTSTYLE ALL** (stored once per node) or AUTO for small tables, and avoid hundreds of near-empty wide tables.`,
life: `A storage company that rents in 1-shelf minimums per item type per room. Storing one spoon, one fork and one plate across 64 rooms rents 192 shelves.`,
work: `A team created 300 per-merchant staging tables of 120 columns each on a 128-slice cluster, each holding a few thousand rows. They used 45 TB of storage. Replacing them with a single table with a «merchant_id» column used 300 GB.`,
ex: `SELECT "table", diststyle, size AS mb, tbl_rows FROM svv_table_info ORDER BY size DESC;
-- minimum for EVEN/KEY ≈ (cols + 3) * slices * 1 MB`,
pit: [`Many tiny wide tables.`, `Per-entity tables instead of one table with a key column.`, `Surprise at "empty" table size.`],
q: [`Why can a 10-row table use gigabytes?`, `Each column (plus hidden ones) gets at least one 1 MB block per slice.`]
},
"Auto WLM and query monitoring rules": {
d: `With **Automatic WLM**, Redshift predicts each query's memory and runtime and decides how many to run concurrently. You define up to 8 **queues**, route queries by **user group** or **query group** labels, and give each queue a **priority**. When the cluster is busy, higher-priority queries get resources first; lower ones wait.

**Query Monitoring Rules (QMR)** add guardrails per queue: predicates on metrics such as «query_execution_time», «scan_row_count», «query_cpu_time», «spectrum_scan_size_mb», «nested_loop_join_row_count», «query_temp_blocks_to_disk». Actions: **log**, **hop** (move to another queue, manual WLM), **change priority**, or **abort**. Logged hits go to «stl_wlm_rule_action».`,
life: `A traffic system with lanes for ambulances, buses and cars, plus speed cameras that fine (log), divert (hop) or stop (abort) vehicles breaking rules.`,
work: `An analyst's accidental cross join ran for 3 hours and filled temp disk, slowing everyone. A QMR "nested_loop_join_row_count > 1e9 → abort" on the ad-hoc queue and "query_temp_blocks_to_disk > 100000 → log" caught similar queries; abort events fell to ~2 per week with notifications to the user.`,
ex: `[{"query_group":["etl"],"priority":"low","queue_type":"auto",
  "rules":[{"rule_name":"abort_big_nl","predicate":[
    {"metric_name":"nested_loop_join_row_count","operator":">","value":1000000000}],
    "action":"abort"}]}]
SELECT * FROM stl_wlm_rule_action ORDER BY recordtime DESC LIMIT 20;`,
pit: [`No guardrails on ad-hoc queues.`, `Aborting ETL queries without retry logic.`, `All users in one queue.`],
q: [`Name three QMR actions.`, `Log, change priority (or hop), and abort.`]
},
"Streaming ingestion and incremental MVs": {
d: `Redshift **streaming ingestion** reads directly from **Kinesis Data Streams** or **Amazon MSK** (Kafka) into a **materialized view**, without staging in S3 or Firehose. You create an external schema for the stream, then an MV over it. Each «REFRESH» (or AUTO REFRESH) pulls new records since the last refresh; latency is typically seconds.

The payload arrives as «kafka_value» / «kinesis_data» (VARBYTE); you parse JSON with «JSON_PARSE» into SUPER and extract fields. Then build downstream **incremental MVs** for aggregates. Retention matters: if the MV isn't refreshed before the stream's retention expires, records are lost.`,
life: `Instead of collecting letters in a mailbox and carrying the box to the office daily, a pipe drops each letter straight onto your desk; you just glance at it every few seconds.`,
work: `Payment success-rate dashboards were 15 minutes behind using Firehose → S3 → COPY. Streaming ingestion from MSK into an MV with AUTO REFRESH plus an incremental MV per minute and bank brought latency to ~10 s with no extra infrastructure.`,
ex: `CREATE EXTERNAL SCHEMA msk FROM MSK
IAM_ROLE 'arn:aws:iam::123456789012:role/rs-msk' AUTHENTICATION iam
CLUSTER_ARN 'arn:aws:kafka:ap-south-1:123456789012:cluster/pay/...';
CREATE MATERIALIZED VIEW mv_payments AUTO REFRESH YES AS
SELECT kafka_partition, kafka_offset, JSON_PARSE(kafka_value) AS ev
FROM msk."payments";`,
pit: [`Stream retention shorter than possible refresh gaps.`, `Parsing heavy JSON in every downstream query instead of once.`, `Huge MVs on raw streams without aggregation.`],
q: [`What happens if the streaming MV isn't refreshed for longer than the stream's retention?`, `Records older than retention are gone from the stream and never reach Redshift.`]
},
"Choose keys from the workload": {
d: `Choosing DISTKEY and SORTKEY is about **queries**, not tables. A method:
1. Find the most expensive queries («sys_query_history», «stl_query» + «svl_query_summary») and the biggest tables they touch.
2. **DISTKEY**: the column used to join the two largest tables (high cardinality, low skew). Small dimensions → ALL.
3. **SORTKEY**: the column most often used in range filters (usually a date/timestamp), first in a compound key; add a second column used in equality filters.
4. Validate with EXPLAIN (DS_DIST_NONE, range-restricted scans) and before/after timings.

**Automatic Table Optimization (ATO)** observes the workload and applies AUTO distribution/sort changes in the background; «svv_alter_table_recommendations» shows its recommendations. Use it, but understand why it chose them.`,
life: `Designing a kitchen layout by watching how cooks actually move during service, not by guessing from the menu.`,
work: `ATO recommended «SORTKEY(event_ts)» on «events» but not a DISTKEY change. Query history showed the top 20 queries joined «events» to «sessions» on «session_id». Setting both to «DISTKEY(session_id)» removed DS_DIST_BOTH, cutting cluster CPU by 30%.`,
ex: `SELECT type, database, table_id, ddl, auto_eligible FROM svv_alter_table_recommendations;
SELECT query_text, elapsed_time/1e6 AS s FROM sys_query_history
ORDER BY elapsed_time DESC LIMIT 20;`,
pit: [`Choosing keys from the schema alone.`, `Optimising for one rare query.`, `Changing keys without measuring.`],
q: [`Two biggest tables are always joined on «order_id». What DISTKEY?`, `«order_id» on both, so the join is collocated (assuming it's not skewed).`]
}
});
