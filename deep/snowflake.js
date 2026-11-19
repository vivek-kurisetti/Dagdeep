QUEST.deep("snowflake", {
"Three layers": {
d: `Snowflake separates three layers:
- **Storage**: tables are stored as compressed, columnar, immutable **micro-partitions** in the cloud provider's object storage (S3, Azure Blob, GCS), managed entirely by Snowflake. You pay per TB stored.
- **Compute**: **virtual warehouses**: independent clusters you create, size (XS → 6XL), start, stop and scale. Each warehouse reads the shared storage; warehouses don't compete for CPU with each other.
- **Cloud services**: the "brain": authentication, metadata, query parsing and optimisation, transactions, access control, result cache. Mostly free unless it exceeds 10% of daily compute.

Benefits: isolate workloads (ETL warehouse vs BI warehouse vs data science), scale compute without moving data, pause compute when idle, and share data across accounts without copying.`,
life: `A shared library building (storage) with many independent reading rooms (warehouses) you can open, close or enlarge, and a front desk (services) that manages the catalogue and memberships.`,
work: `Nightly dbt runs on the same warehouse as dashboards made morning reports slow. Creating «WH_ETL» (L) and «WH_BI» (M, multi-cluster) on the same data isolated them: dashboards stayed fast during loads, and each team's credit usage became visible separately.`,
ex: `CREATE WAREHOUSE wh_etl WAREHOUSE_SIZE = 'LARGE' AUTO_SUSPEND = 60 AUTO_RESUME = TRUE;
CREATE WAREHOUSE wh_bi  WAREHOUSE_SIZE = 'MEDIUM' MIN_CLUSTER_COUNT = 1 MAX_CLUSTER_COUNT = 4
  SCALING_POLICY = 'STANDARD' AUTO_SUSPEND = 120;
USE WAREHOUSE wh_bi;`,
pit: [`One warehouse for every workload.`, `Ignoring cloud services credits from heavy metadata ops.`, `Thinking bigger storage needs bigger warehouses (they're independent).`],
q: [`Why don't ETL jobs slow BI queries if they use different warehouses?`, `Each warehouse has its own compute; they only share the storage layer.`]
},
"Warehouses spend credits": {
d: `Warehouse cost = credits/hour × running time. Credits per hour **double** per size: XS = 1, S = 2, M = 4, L = 8, XL = 16, 2XL = 32... Billing is **per second**, with a **60-second minimum** each time a warehouse resumes.

Cost controls:
- **AUTO_SUSPEND** (e.g. 60 s for ETL/BI) and **AUTO_RESUME**.
- Right-size: a bigger size often finishes proportionally faster for large scans (similar cost, less wait); tiny queries don't benefit.
- **Multi-cluster** warehouses for **concurrency** (more clusters when queries queue), not single-query speed.
- **Resource monitors**: credit quotas per warehouse/account with notify/suspend actions.
- Watch for frequent suspend/resume cycles (each resume costs ≥ 60 s) and warehouses kept alive by monitoring queries.`,
life: `Renting a taxi by the second with a 1-minute minimum fare. A bigger car costs double per minute but if it carries everyone in one trip, the total can be the same.`,
work: `A BI warehouse (M, 4 credits/h) had AUTO_SUSPEND = 3600 s and a dashboard that refreshed every 10 minutes, so it never suspended: ~96 credits/day. Setting AUTO_SUSPEND = 120 s and caching dashboard queries cut it to ~30 credits/day.`,
ex: `ALTER WAREHOUSE wh_bi SET AUTO_SUSPEND = 120;
CREATE RESOURCE MONITOR rm_bi WITH CREDIT_QUOTA = 500 FREQUENCY = MONTHLY START_TIMESTAMP = IMMEDIATELY
  TRIGGERS ON 80 PERCENT DO NOTIFY ON 100 PERCENT DO SUSPEND;
ALTER WAREHOUSE wh_bi SET RESOURCE_MONITOR = rm_bi;
SELECT warehouse_name, sum(credits_used) FROM snowflake.account_usage.warehouse_metering_history
WHERE start_time > dateadd(day, -7, current_timestamp()) GROUP BY 1 ORDER BY 2 DESC;`,
pit: [`Long auto-suspend times.`, `Using multi-cluster to speed up one slow query.`, `No resource monitors.`],
q: [`A query takes 8 minutes on M. Roughly what on L, and the cost?`, `About 4 minutes if it parallelises well; credits are similar (double rate × half time).`]
},
"Micro-partitions": {
d: `Snowflake automatically divides table data into **micro-partitions**: 50–500 MB of uncompressed data each (much smaller compressed), stored column by column. They're **immutable** and created in load/insert order.

For each micro-partition and column, Snowflake keeps metadata: **min/max values**, distinct count, null count. A query's WHERE filters are checked against this metadata to **prune** micro-partitions that can't contain matching rows, before reading any data. The query profile shows "Partitions scanned" vs "Partitions total".

Pruning works well when filter columns are **correlated with load order** (e.g. event dates for time-series loaded daily) or explicitly clustered. Filters on randomly distributed columns prune poorly.`,
life: `Boxes in a warehouse, each labelled with the date range of invoices inside. Ask for "November 18" and the staff only open boxes whose label covers that date.`,
work: `A query «WHERE merchant_id = 881 AND created_at >= '2026-11-01'» scanned 2,100 of 2,300 partitions: data was loaded in time order, but merchant ids were spread everywhere and the date filter covered a wide range. Narrowing dashboards to the needed date range and adding clustering on (created_at, merchant_id) brought it to 60 partitions.`,
ex: `SELECT ... FROM payments WHERE created_at >= '2026-11-18' AND created_at < '2026-11-19';
-- Query profile: Partitions scanned 24 / Partitions total 2,304
SELECT SYSTEM$CLUSTERING_INFORMATION('payments', '(created_at)');`,
pit: [`Functions on filter columns that hide them from pruning (sometimes).`, `Expecting pruning on randomly distributed columns.`, `Ignoring "partitions scanned" in profiles.`],
q: [`What metadata enables pruning?`, `Per-micro-partition column statistics like min/max values (plus counts).`]
},
"Clustering": {
d: `Data is naturally clustered by **load order**. If large tables are mostly filtered by a different column (merchant_id, region) or loads arrive out of order, pruning degrades.

A **clustering key** («ALTER TABLE t CLUSTER BY (col1, col2)») tells Snowflake to co-locate similar values in the same micro-partitions. **Automatic Clustering** (a serverless service, billed in credits) reorganises data in the background as DML changes it.

When to use: multi-TB tables, queries filtering/joining on the key are frequent and slow, and the table isn't updated so heavily that reclustering costs explode. Choose low-to-moderate cardinality expressions (e.g. «to_date(created_at)», not the raw timestamp), 1–3 columns, most selective-in-queries first. Alternatives: **Search Optimization Service** for point lookups on high-cardinality columns; materialized views.`,
life: `Re-shelving a library by subject when most readers search by subject, not by the date books arrived. A librarian keeps re-shelving as new books come in (automatic clustering), which costs staff time.`,
work: `A 30 TB «events» table queried by «tenant_id» and date scanned ~70% of partitions per query. «CLUSTER BY (to_date(event_ts), tenant_id)» cost ~400 credits for the initial recluster and ~15 credits/day ongoing, but cut average dashboard scan by 90% and saved far more warehouse credits.`,
ex: `ALTER TABLE events CLUSTER BY (to_date(event_ts), tenant_id);
SELECT SYSTEM$CLUSTERING_INFORMATION('events');
SELECT * FROM snowflake.account_usage.automatic_clustering_history
WHERE table_name = 'EVENTS' ORDER BY start_time DESC LIMIT 10;
ALTER TABLE events ADD SEARCH OPTIMIZATION ON EQUALITY(order_id);`,
pit: [`Clustering small tables (no benefit).`, `High-cardinality raw timestamps as keys.`, `Clustering heavily-updated tables (reclustering cost).`],
q: [`What's the cost of automatic clustering?`, `Serverless compute credits for reclustering, ongoing as data changes.`]
},
"Caches": {
d: `Three caches:
- **Result cache** (cloud services layer): if the exact same query text runs again, the underlying data hasn't changed, and the query is deterministic, Snowflake returns the stored result instantly **without a warehouse**. Kept 24 hours, extended each reuse (up to 31 days). Role must have access.
- **Warehouse (local disk) cache**: the warehouse's SSD/memory caches table data it recently read. Subsequent queries reading the same micro-partitions are faster. **Lost when the warehouse suspends** (or resizes).
- **Metadata cache**: counts, min/max etc. answer some queries («COUNT(*)», «MIN(col)») from metadata alone.

Trade-off: aggressive auto-suspend saves credits but loses warehouse cache; BI warehouses often use a slightly longer auto-suspend for warm caches.`,
life: `Result cache: you ask the librarian the same question again and she repeats yesterday's answer from her notebook. Warehouse cache: the books you used are still on your desk until you leave the reading room.`,
work: `A dashboard with 20 tiles ran 20 queries on every page load. Most were identical across users and data refreshed hourly, so the result cache served them instantly between loads, using no warehouse time. One tile used «current_timestamp()» in SQL, which disabled result reuse; replacing it with a date parameter fixed that.`,
ex: `ALTER SESSION SET USE_CACHED_RESULT = TRUE;
SELECT * FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()));    -- reuse previous result
-- profile shows "QUERY RESULT REUSE" when served from result cache
-- percentage scanned from cache: query profile "Percentage scanned from cache"`,
pit: [`Non-deterministic functions (current_timestamp, random) disabling result cache.`, `Benchmarking with warm caches only.`, `Very short auto-suspend on BI warehouses losing local cache.`],
q: [`Does a result cache hit use warehouse credits?`, `No, it's served by the cloud services layer without running the warehouse.`]
},
"Time Travel and Fail-safe": {
d: `**Time Travel** lets you access data as it was in the past:
- Query: «SELECT ... FROM t AT(TIMESTAMP => '...')», «AT(OFFSET => -3600)», «BEFORE(STATEMENT => '<query_id>')».
- Restore: «CREATE TABLE t_restored CLONE t AT(...)», «UNDROP TABLE/SCHEMA/DATABASE».
- Retention: «DATA_RETENTION_TIME_IN_DAYS»: 1 day default; up to **90 days** on Enterprise edition and above (per table/schema/database).

After Time Travel ends, permanent tables enter **Fail-safe** for **7 days**: not user-accessible; only Snowflake support can recover data for disasters. Transient and temporary tables have no Fail-safe (and max 1 day Time Travel), saving storage for staging data.

Both cost storage for changed/deleted micro-partitions kept during those windows.`,
life: `A "recently deleted" folder you can restore from yourself for a set number of days, followed by a week where only the IT department can get it back from backups.`,
work: `A faulty MERGE overwrote merchant fee rates at 10:05. The analyst found the bad statement's query id, ran «CREATE TABLE fee_rates_fix CLONE fee_rates BEFORE(STATEMENT => '01b2...')», validated it, and swapped tables. Total recovery: 15 minutes, no backups needed.`,
ex: `SELECT * FROM fee_rates AT(OFFSET => -60*60) WHERE merchant_id = 881;
CREATE OR REPLACE TABLE fee_rates_restored CLONE fee_rates BEFORE(STATEMENT => '01b2c3d4-...');
ALTER TABLE fee_rates SWAP WITH fee_rates_restored;
UNDROP TABLE settlements_tmp;
ALTER TABLE raw_events SET DATA_RETENTION_TIME_IN_DAYS = 7;
CREATE TRANSIENT TABLE stg_events (...);    -- no fail-safe`,
pit: [`Long retention on huge, frequently rewritten tables (storage cost).`, `Permanent tables for throwaway staging data.`, `Assuming Fail-safe is self-service.`],
q: [`What's the difference between Time Travel and Fail-safe?`, `Time Travel is user-accessible history for the retention period; Fail-safe is a further 7 days recoverable only by Snowflake support.`]
},
"Zero-copy cloning": {
d: `«CREATE TABLE / SCHEMA / DATABASE x CLONE y» creates a new object that **references the same micro-partitions**: only metadata is copied, so it's near-instant and costs no extra storage initially. When either the clone or the source changes data, new micro-partitions are written for the changed parts only (copy-on-write); storage grows with divergence.

Clones can be taken **at a point in time** (combined with Time Travel: «CLONE prod AT(TIMESTAMP => ...)»). Uses: dev/test environments with production-scale data, safe experiments before risky changes, point-in-time snapshots for audits, blue-green deployments of tables (build in a clone, then «SWAP WITH»).

Note: privileges on the source aren't automatically granted on cloned child objects for databases/schemas in all cases; review grants. Some objects (e.g. external tables, internal stages) have special rules.`,
life: `Making a "copy" of a book by printing a new cover that points to the same pages; only pages you edit get reprinted for your copy.`,
work: `Before a risky backfill on a 15 TB fact table, the team cloned the database («CREATE DATABASE pay_backup CLONE pay») in seconds at zero storage cost. The backfill had a bug; they swapped the affected tables back from the clone in minutes. The clone was dropped after a week.`,
ex: `CREATE DATABASE analytics_dev CLONE analytics;              -- full dev env in seconds
CREATE TABLE payments_before_fix CLONE payments AT(TIMESTAMP => '2026-11-19 09:00:00'::timestamp_ltz);
-- blue-green
CREATE TABLE dim_merchant_new CLONE dim_merchant;
-- ... rebuild/modify dim_merchant_new ...
ALTER TABLE dim_merchant SWAP WITH dim_merchant_new;`,
pit: [`Assuming clones stay free forever (divergence costs storage).`, `Forgetting grants on cloned objects.`, `Leaving many old clones around.`],
q: [`Why is cloning a 10 TB table nearly instant?`, `Only metadata is copied; the clone references the same immutable micro-partitions until data changes.`]
},
"Loading": {
d: `Ways to load:
- **COPY INTO <table> FROM @stage**: bulk loads files (CSV, JSON, Parquet, Avro, ORC) from an internal or external **stage** (S3/GCS/Azure via storage integration). Runs on a warehouse; tracks loaded files for 64 days to avoid reloading. Best file sizes ≈ 100–250 MB compressed for parallelism.
- **Snowpipe**: serverless, event-driven («AUTO_INGEST» via S3 event notifications/SQS): loads new files within about a minute of arrival; billed per compute used plus a per-file overhead.
- **Snowpipe Streaming**: low-latency row ingestion via SDK or the Kafka connector (seconds), no files, no warehouse.
- **Dynamic Tables** / Streams + Tasks then transform loaded data.
- Openflow / connectors and partner tools (Fivetran, Airbyte).

Use «VALIDATION_MODE», «ON_ERROR» options, and «COPY_HISTORY» / «PIPE_USAGE_HISTORY» to monitor.`,
life: `Bulk deliveries by truck at scheduled times (COPY), a courier that automatically brings each parcel as it's posted (Snowpipe), or a pipeline that drips items continuously (Streaming).`,
work: `Clickstream files landed in S3 every minute; a scheduled COPY every hour meant stale dashboards and a warehouse waking 24×/day. Snowpipe auto-ingest made data available within ~1 minute; cost dropped too because tiny files were the issue, so they also batched files to ~100 MB in Firehose.`,
ex: `CREATE STAGE raw_stage URL = 's3://lake-raw/clicks/' STORAGE_INTEGRATION = s3_int FILE_FORMAT = (TYPE = PARQUET);
COPY INTO raw.clicks FROM @raw_stage MATCH_BY_COLUMN_NAME = CASE_INSENSITIVE ON_ERROR = 'CONTINUE';
CREATE PIPE raw.clicks_pipe AUTO_INGEST = TRUE AS
  COPY INTO raw.clicks FROM @raw_stage MATCH_BY_COLUMN_NAME = CASE_INSENSITIVE;
SELECT * FROM TABLE(information_schema.copy_history(table_name => 'CLICKS', start_time => dateadd(hour, -1, current_timestamp())));`,
pit: [`Millions of tiny files (per-file overhead).`, `Long-lived access keys in stages instead of storage integrations.`, `ON_ERROR='CONTINUE' without checking rejected rows.`],
q: [`When choose Snowpipe Streaming over Snowpipe?`, `When you need second-level latency from row/event streams (e.g. Kafka) without writing files.`]
},
"Streams and Tasks": {
d: `- A **stream** on a table records **what changed** since the stream was last consumed: inserted, updated and deleted rows, with metadata columns «METADATA$ACTION», «METADATA$ISUPDATE», «METADATA$ROW_ID». Types: standard (all DML), **append-only** (inserts only, cheaper), insert-only for external tables.
- A **task** runs a SQL statement or procedure on a **schedule** (CRON / interval) or after a parent task (task graphs/DAGs). Can run on a warehouse or **serverless**. «WHEN SYSTEM$STREAM_HAS_DATA('s')» skips runs with no changes.

Together: **incremental ELT inside Snowflake**: stream captures changes on raw table → task MERGEs them into curated table every few minutes. Consuming a stream in a DML statement **advances its offset** when the transaction commits.

Alternative: **Dynamic Tables** declare the target as a query with a «TARGET_LAG», and Snowflake manages incremental refresh automatically.`,
life: `A stream is a sticky note listing "what changed since you last looked". A task is an alarm that every 5 minutes makes someone read the note and update the master records.`,
work: `A nightly full rebuild of «dim_customer» took 40 minutes. Replacing it with a stream on «raw.customers» and a 5-minute task doing MERGE kept the dimension fresh within minutes and used ~80% fewer credits. Later they migrated it to a Dynamic Table with TARGET_LAG = '5 minutes'.`,
ex: `CREATE STREAM raw.customers_s ON TABLE raw.customers;
CREATE TASK curated.merge_customers WAREHOUSE = wh_etl SCHEDULE = '5 MINUTE'
WHEN SYSTEM$STREAM_HAS_DATA('raw.customers_s') AS
MERGE INTO curated.dim_customer d USING raw.customers_s s ON d.id = s.id
WHEN MATCHED AND s.METADATA$ACTION = 'DELETE' AND NOT s.METADATA$ISUPDATE THEN DELETE
WHEN MATCHED AND s.METADATA$ACTION = 'INSERT' THEN UPDATE SET d.name = s.name, d.city = s.city
WHEN NOT MATCHED AND s.METADATA$ACTION = 'INSERT' THEN INSERT (id, name, city) VALUES (s.id, s.name, s.city);
ALTER TASK curated.merge_customers RESUME;`,
pit: [`Tasks created but never resumed (they start suspended).`, `Streams going stale when not consumed within the retention period.`, `Reading a stream in a SELECT and expecting the offset to advance (only DML consumption does).`],
q: [`When does a stream's offset advance?`, `When the stream is consumed in a DML statement whose transaction commits.`]
},
"Reading the query profile": {
d: `The **Query Profile** (Snowsight) shows the execution DAG of **operators** (TableScan, Filter, Join, Aggregate, Sort, WindowFunction, Result) with time spent per operator and statistics. Key things to read:
- **Most expensive nodes**: where time goes.
- **Partitions scanned vs total**: pruning effectiveness.
- **Bytes spilled to local / remote storage**: memory pressure. Remote spilling is very slow; use a larger warehouse or reduce data per query.
- **Join explosions**: output rows far greater than input rows (missing or wrong join keys).
- **Percentage scanned from cache**.
- **Queued time** (in query history): warehouse overloaded → multi-cluster or separate warehouse.
- Compilation time for very complex SQL.

Also: «GET_QUERY_OPERATOR_STATS(query_id)» for programmatic access, and «QUERY_HISTORY» views for trends.`,
life: `An X-ray of the query: you see which bone is broken (expensive operator) instead of guessing from the symptom "it's slow".`,
work: `A report took 25 minutes on an L warehouse. The profile showed a join producing 4.2 B rows from 30 M + 2 M inputs (a duplicate key in a dimension) and 300 GB remote spill. Deduplicating the dimension fixed the explosion; runtime dropped to 50 s on an M warehouse.`,
ex: `SELECT operator_type, operator_statistics:output_rows, operator_statistics:spilling
FROM TABLE(GET_QUERY_OPERATOR_STATS('01b2c3d4-...'))
ORDER BY execution_time_breakdown:overall_percentage DESC;
SELECT query_id, total_elapsed_time, bytes_spilled_to_remote_storage, partitions_scanned, partitions_total
FROM snowflake.account_usage.query_history WHERE warehouse_name = 'WH_BI' ORDER BY start_time DESC LIMIT 20;`,
pit: [`Upsizing warehouses before reading the profile.`, `Ignoring remote spill.`, `Missing join explosions caused by duplicate keys.`],
q: [`What does "bytes spilled to remote storage" indicate?`, `The warehouse ran out of memory and local disk for intermediate data; the query will be very slow; consider a larger warehouse or less data per query.`]
},
"Clustering depth": {
d: `**Clustering depth** measures how much micro-partitions overlap for the clustering key: for a given value, how many micro-partitions might contain it. Average depth near **1** = well clustered (each value in very few partitions); large depth = values smeared across many partitions = poor pruning.

«SYSTEM$CLUSTERING_INFORMATION('t', '(cols)')» returns «average_overlaps», «average_depth», and a histogram of depths. «SYSTEM$CLUSTERING_DEPTH» returns the average depth.

Use it to: decide whether a clustering key is worth it (check depth on candidate columns), monitor Automatic Clustering effectiveness, and compare against actual query pruning in profiles. Depth isn't everything: what matters is whether real queries prune well.`,
life: `Looking for all students born in March: if every classroom has some March students (high overlap), you must visit every classroom; if they're grouped in one or two classrooms (depth ≈ 1), you visit just those.`,
work: `For a 12 TB table, «average_depth» on «to_date(created_at)» was 2.1 (fine) but on «merchant_id» 1,800. Since most queries filtered by merchant and date range, they added «merchant_id» as a second clustering column; depth on the composite dropped to ~6 after reclustering and partitions scanned fell by 85%.`,
ex: `SELECT SYSTEM$CLUSTERING_INFORMATION('payments', '(to_date(created_at), merchant_id)');
-- {"cluster_by_keys":"...", "total_partition_count":24000, "average_overlaps":5.2,
--  "average_depth":6.1, "partition_depth_histogram":{...}}
SELECT SYSTEM$CLUSTERING_DEPTH('payments', '(merchant_id)');`,
pit: [`Optimising depth on columns queries don't filter by.`, `Expecting depth 1 on high-cardinality keys.`, `Not checking real pruning in profiles.`],
q: [`Average depth of 1 means what?`, `Micro-partitions barely overlap on that key; each value is in very few partitions, so pruning is excellent.`]
},
"Sizing is a speed vs cost trade": {
d: `Each warehouse size up doubles nodes and credits/hour. For queries that parallelise well (large scans, aggregations, joins on big data), doubling size roughly **halves runtime**: same credits, faster results, and less spilling. For small queries, bigger warehouses don't help (and the 60-second minimum makes them cost more).

Separate concepts:
- **Scale up** (bigger size): faster complex queries, less spill.
- **Scale out** (multi-cluster): more concurrent queries without queuing; each query still runs on one cluster.
- **Query Acceleration Service**: offloads parts of eligible large scans to serverless compute.
- **Snowpark-optimized** warehouses for memory-heavy ML/UDF workloads.

Approach: test representative queries on two sizes, compare runtime × credits and spill; pick the smallest size meeting the SLA; use separate warehouses per workload type.`,
life: `Hiring twice as many movers for twice the hourly rate: a big house move finishes in half the time for the same bill, but moving one chair with ten people just wastes money.`,
work: `Nightly transformations on M took 3 h 10 min with heavy remote spill. On L they took 1 h 20 min: credits 12.7 (M) vs 10.7 (L): faster and cheaper because spilling disappeared. The interactive BI warehouse stayed S with multi-cluster up to 3 for concurrency.`,
ex: `ALTER WAREHOUSE wh_etl SET WAREHOUSE_SIZE = 'LARGE';
-- compare
SELECT warehouse_size, avg(total_elapsed_time)/1000 AS sec, avg(bytes_spilled_to_remote_storage) AS spill
FROM snowflake.account_usage.query_history WHERE query_tag = 'nightly_build' GROUP BY 1;
ALTER WAREHOUSE wh_etl SET ENABLE_QUERY_ACCELERATION = TRUE QUERY_ACCELERATION_MAX_SCALE_FACTOR = 4;`,
pit: [`Upsizing for concurrency problems (use multi-cluster).`, `Huge warehouses for small queries.`, `Not measuring cost × time across sizes.`],
q: [`Queries are queuing on a BI warehouse but each is fast. Scale up or out?`, `Scale out (multi-cluster) to add concurrency.`]
},
"What Time Travel really stores": {
d: `Because micro-partitions are **immutable**, every UPDATE, DELETE or MERGE writes **new** micro-partitions containing the changed rows (and unchanged rows from the same partitions), while the old micro-partitions are kept:
1. for the **Time Travel** retention period (accessible via AT/BEFORE, clones, UNDROP),
2. then for **Fail-safe** (7 days, permanent tables only),
3. then purged.

So storage cost includes active data + Time Travel bytes + Fail-safe bytes. A table rewritten heavily every day (e.g. full reload via CREATE OR REPLACE, or MERGE touching most partitions) can accumulate **many times its active size** in Time Travel/Fail-safe. «TABLE_STORAGE_METRICS» shows «ACTIVE_BYTES», «TIME_TRAVEL_BYTES», «FAILSAFE_BYTES».

Tune: shorter retention for churny tables, transient tables for staging, avoid needless full rewrites (use incremental logic).`,
life: `Every time you edit a page, the old page is kept in a drawer for the retention period. Rewrite the whole notebook daily and the drawer fills with old notebooks.`,
work: `A 2 TB staging table was fully recreated hourly with 30-day Time Travel: storage showed 2 TB active but 140 TB in Time Travel + Fail-safe. Making it transient with 0-day retention removed ~138 TB of storage cost.`,
ex: `SELECT table_name, active_bytes/1e12 AS active_tb, time_travel_bytes/1e12 AS tt_tb, failsafe_bytes/1e12 AS fs_tb
FROM snowflake.account_usage.table_storage_metrics
ORDER BY time_travel_bytes + failsafe_bytes DESC LIMIT 10;
ALTER TABLE stg_events SET DATA_RETENTION_TIME_IN_DAYS = 0;`,
pit: [`Long retention on full-rewrite tables.`, `Permanent tables for staging.`, `Only looking at active bytes.`],
q: [`Why can a table's storage be much larger than its active data?`, `Old micro-partitions from updates/rewrites are retained for Time Travel and Fail-safe.`]
},
"How streams track changes": {
d: `A stream doesn't copy data. It stores an **offset**: a point in the source table's version history. Querying the stream compares the table's current version with the version at the offset and returns the **net changes** in between, using the table's change tracking metadata (hidden columns added when the first stream is created or «CHANGE_TRACKING = TRUE»).

Details:
- Net changes: a row inserted then deleted between consumptions doesn't appear; an update appears as a DELETE + INSERT pair with «METADATA$ISUPDATE = TRUE».
- The offset advances only when the stream is used in a **committed DML** statement (INSERT/MERGE/... SELECT FROM stream). Within one transaction, multiple reads see the same changes (repeatable read).
- **Staleness**: if the offset falls outside the table's data retention (Time Travel; Snowflake can extend up to 14 days for streams via «MAX_DATA_EXTENSION_TIME_IN_DAYS»), the stream becomes **stale** and must be recreated.
- Multiple streams on one table each have independent offsets.`,
life: `A bookmark in a constantly edited document: when you check, you see the net difference between the bookmarked version and now; you move the bookmark only when you've actually applied those changes.`,
work: `A stream feeding a task went stale after the task was suspended during a 3-week migration; the table's retention was 1 day (extended to 14 for streams). Recreating the stream lost the changes, so they did a one-time full MERGE from the source, then added monitoring on «STALE_AFTER» from «SHOW STREAMS».`,
ex: `SHOW STREAMS LIKE 'customers_s';      -- stale, stale_after
SELECT METADATA$ACTION, METADATA$ISUPDATE, * FROM raw.customers_s LIMIT 10;
BEGIN;
INSERT INTO audit.customer_changes SELECT *, current_timestamp() FROM raw.customers_s;
COMMIT;                                  -- offset advances here`,
pit: [`Letting streams go stale during pauses.`, `Expecting every intermediate change (streams return net changes).`, `Reading streams outside DML and expecting progress.`],
q: [`A row is inserted and then deleted before the stream is consumed. What does the stream show?`, `Nothing for that row: streams return net changes.`]
}
});
