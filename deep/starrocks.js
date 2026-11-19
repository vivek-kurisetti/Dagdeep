QUEST.deep("starrocks", {
"Frontends and backends": {
d: `StarRocks has two node types:
- **FE (Frontend)**: stores metadata (catalog, tablets, load jobs), accepts MySQL-protocol connections, parses, optimises and schedules queries. FEs are a replicated group: one **leader** (writes metadata), **followers** (vote, can become leader), **observers** (read scale-out, no vote).
- **BE (Backend)**: in **shared-nothing** mode, stores data (tablets replicated, usually 3 copies) and executes query fragments.

In **shared-data** mode (3.x), data lives in object storage (S3/HDFS) and stateless **CN (Compute Nodes)** execute queries with a local **data cache**. Compute scales independently of storage, and you can run multiple warehouses (compute groups) over the same data. Shared-nothing gives the lowest latency for hot data; shared-data gives elasticity and cheaper storage.`,
life: `FEs are the restaurant's managers and order desk; BEs/CNs are the kitchens. In shared-data mode the pantry is a central warehouse (S3) and kitchens can be opened or closed as demand changes.`,
work: `A real-time merchant dashboard needed sub-second queries on 30 days of data and historical queries on 3 years. They ran shared-data StarRocks: hot partitions stayed in CN cache for fast dashboards, older data was read from S3 when needed, and CNs scaled out during month-end reporting.`,
ex: `SHOW FRONTENDS;        -- role, IsMaster/Alive
SHOW BACKENDS;         -- shared-nothing
SHOW COMPUTE NODES;    -- shared-data
-- connect with any MySQL client
mysql -h fe-host -P 9030 -u analyst -p`,
pit: [`Single FE in production (metadata SPOF).`, `Expecting shared-data cold reads to match local-disk latency.`, `Undersized data cache for hot data in shared-data mode.`],
q: [`What do observer FEs add?`, `Read/query scale-out for metadata and planning without participating in leader election votes.`]
},
"Why it's fast": {
d: `StarRocks targets sub-second analytics on large data:
- **Vectorized execution**: operators process columns in batches (e.g. 4,096 values) using SIMD instructions, instead of row-at-a-time.
- **Cost-based optimizer** (Cascades-style) with statistics: join reordering, join strategy selection (broadcast/shuffle/colocate/bucket shuffle), predicate pushdown, CTE reuse.
- **Columnar storage** with encodings and indexes: prefix/short-key index, zone maps (min/max per page), bitmap and bloom filter indexes, inverted indexes.
- **Pipeline execution engine**: morsel-driven parallelism using all cores without thread oversubscription.
- **Runtime filters**: build-side join keys pushed to the probe-side scan to skip data early.
- **Materialized views** with automatic **query rewrite** for pre-aggregation.`,
life: `Instead of one cashier scanning items one by one, a conveyor belt that scans whole trays at once (vectorized), with a smart manager choosing which counters to open (optimizer).`,
work: `A Redshift dashboard on 2 B rows with high concurrency (300 merchants refreshing) had p95 of 8 s. The same model in StarRocks with a colocated join and a rollup MV gave p95 of 400 ms at that concurrency, which made the merchant-facing dashboard possible.`,
ex: `EXPLAIN COSTS
SELECT m.city, sum(p.amount) FROM payments p JOIN merchants m ON p.merchant_id = m.id
WHERE p.dt >= '2026-11-01' GROUP BY m.city;
-- look for: BROADCAST/COLOCATE join, runtime filters, partitions pruned
ANALYZE TABLE payments;   -- statistics for the CBO`,
pit: [`No statistics (poor plans).`, `Assuming every query is fast without partitioning/bucketing design.`, `Ignoring join distribution in plans.`],
q: [`What does vectorized execution mean?`, `Operators process batches of column values at a time (with SIMD), instead of one row at a time.`]
},
"Four table types": {
d: `Choose the table model by how data should behave on load:
- **Duplicate Key**: keeps every row exactly as loaded; the key only defines sort order. For logs, events, immutable facts.
- **Aggregate Key**: rows with the same key are **pre-aggregated** on load and compaction using per-column functions (SUM, MAX, MIN, REPLACE, HLL_UNION, BITMAP_UNION). Great for metrics rollups where you never need raw rows.
- **Unique Key**: keeps the **latest** row per key (merge-on-read; older model).
- **Primary Key**: latest row per key with **delete-and-insert** at write time and an in-memory/persistent primary index: fast real-time **upserts and deletes** with fast reads. The preferred choice for CDC and mutable data (supports partial column updates and conditional updates).`,
life: `Duplicate: a diary that keeps every entry. Aggregate: a scoreboard that only keeps running totals. Primary Key: a contact list where each person has one current entry that gets replaced when details change.`,
work: `CDC from MySQL orders (frequent status updates) was first loaded into a Duplicate table, needing «row_number()» dedupe in every query (slow). Switching to a **Primary Key** table with Routine Load upserts made queries simple and 10× faster; deletes from CDC were applied with the «__op» column.`,
ex: `CREATE TABLE orders (
  order_id BIGINT NOT NULL, merchant_id BIGINT, status VARCHAR(20),
  amount DECIMAL(18,2), updated_at DATETIME)
PRIMARY KEY (order_id)
DISTRIBUTED BY HASH(order_id) BUCKETS 32;

CREATE TABLE daily_metrics (
  dt DATE, merchant_id BIGINT, txns BIGINT SUM, gmv DECIMAL(20,2) SUM, last_seen DATETIME MAX)
AGGREGATE KEY (dt, merchant_id)
DISTRIBUTED BY HASH(merchant_id);`,
pit: [`Duplicate tables for mutable data (dedupe at query time).`, `Aggregate tables when raw rows are later needed.`, `Primary Key tables with huge keys exhausting index memory (use persistent index).`],
q: [`Which table type fits CDC with frequent updates and deletes?`, `The Primary Key table.`]
},
"Partitioning and bucketing": {
d: `Two levels of data organisation:
- **Partitioning** (usually by date): «PARTITION BY RANGE(dt)», **expression partitioning** («PARTITION BY date_trunc('day', ts)») or list partitions. Enables **partition pruning** for time filters, and lifecycle management (TTL, drop old partitions, hot/cold storage). Dynamic partitioning creates future partitions automatically.
- **Bucketing** (distribution): «DISTRIBUTED BY HASH(col) BUCKETS n» splits each partition into tablets; spreads data across nodes for parallelism. Hash on a high-cardinality column used in joins/group-bys; or **random bucketing** for Duplicate tables without a good key. Bucket count can be automatic in recent versions.

Sizing guidance: tablets of roughly 1–10 GB; avoid thousands of tiny tablets. **Colocation groups** (same bucket key and count across tables) enable **colocate joins** without network shuffle.`,
life: `A filing cabinet by month (partitions), and within each month, folders split by customer surname letter (buckets), so many clerks can work in parallel and you only open the months you need.`,
work: `«payments» used 512 buckets per daily partition; most partitions held 2 GB, giving 4 MB tablets and millions of tablets cluster-wide. FE memory and scheduling overhead soared. Cutting to 16 buckets per partition (≈128 MB tablets) and later enabling automatic bucket sizing fixed the metadata load and sped up queries.`,
ex: `CREATE TABLE payments (
  ts DATETIME NOT NULL, payment_id BIGINT, merchant_id BIGINT, amount DECIMAL(18,2))
DUPLICATE KEY (ts, payment_id)
PARTITION BY date_trunc('day', ts)
DISTRIBUTED BY HASH(merchant_id) BUCKETS 16
PROPERTIES ("partition_live_number" = "400", "colocate_with" = "merchant_group");`,
pit: [`Too many buckets for small partitions.`, `Bucketing on a skewed column.`, `No time partitioning on time-series data.`],
q: [`What do two tables need for a colocate join?`, `The same colocation group: same bucketing columns/types and bucket count (and replica settings).`]
},
"Ways in": {
d: `Ingestion options:
- **Stream Load**: HTTP PUT a batch (CSV/JSON) to an FE/BE; synchronous, returns success/failure; good for micro-batches from apps or Flink/Spark connectors.
- **Routine Load**: a long-running job that continuously consumes **Kafka** (CSV/JSON/Avro), committing data and offsets together (exactly-once into StarRocks).
- **Broker Load** / «INSERT INTO ... SELECT FROM FILES('s3://...')»: bulk loads from S3/HDFS (Parquet, ORC, CSV) asynchronously.
- **INSERT INTO ... SELECT**: from internal or external (Iceberg/Hive) tables; ETL inside StarRocks.
- **Connectors**: Flink connector (exactly-once with Stream Load transactions), Spark connector, Kafka Connect sink, CDC via Flink CDC.
- **Pipe** (3.2+): continuous loading of new files from object storage.`,
life: `Different doors into a warehouse: a counter for walk-in deliveries (Stream Load), a conveyor belt from the supplier (Routine Load), and the loading dock for trucks (Broker Load / FILES).`,
work: `Payment events reached Kafka; a Routine Load job loaded them into a Primary Key table every few seconds. Historical backfill of 2 years from Parquet in S3 used «INSERT INTO ... SELECT * FROM FILES(...)» partition by partition at night.`,
ex: `CREATE ROUTINE LOAD pay.payments_rl ON payments
COLUMNS(payment_id, merchant_id, amount, status, ts)
PROPERTIES ("format" = "json", "desired_concurrent_number" = "3", "max_batch_interval" = "10")
FROM KAFKA ("kafka_broker_list" = "b1:9092", "kafka_topic" = "payments",
            "property.kafka_default_offsets" = "OFFSET_BEGINNING");
curl --location-trusted -u user:pw -H "format: json" -T batch.json \\
  http://fe:8030/api/pay/payments/_stream_load`,
pit: [`Choosing Stream Load per single row.`, `Routine Load without monitoring paused jobs.`, `Bulk loading during peak query hours.`],
q: [`Which method continuously consumes Kafka inside StarRocks?`, `Routine Load.`]
},
"Avoid tiny loads": {
d: `Every successful load creates a new **version** (rowset) in each affected tablet. Queries must merge across versions until **compaction** combines them. Many tiny loads (hundreds per second, or one per event):
- increase versions per tablet → slower queries and more metadata,
- overload compaction (CPU/IO),
- can hit «too many versions» errors that reject new loads (version limit per tablet).

Practices: batch to roughly **one load per table every few seconds** or larger (Flink sink buffer by size/time; Routine Load «max_batch_interval»), combine small tables' data, avoid single-row INSERT VALUES loops, and monitor compaction score and version counts.`,
life: `Sending a separate parcel for every pen you buy: the post office drowns in parcels. Batch them into one box every few minutes.`,
work: `A microservice did INSERT per payment event (2k/s). Loads started failing with "too many versions" and queries slowed 5×. Routing events through Kafka with Routine Load every 10 s (or Flink with 5 s buffers) reduced loads from 2,000/s to 0.1/s with the same freshness for dashboards.`,
ex: `-- monitor
SHOW PROC '/compactions';
SELECT * FROM information_schema.be_tablets ORDER BY NUM_VERSION DESC LIMIT 10;
-- Flink connector sink options
'sink.buffer-flush.interval-ms' = '5000',
'sink.buffer-flush.max-bytes' = '94371840'`,
pit: [`Row-by-row inserts from apps.`, `Very short Routine Load intervals with many concurrent tasks.`, `Ignoring compaction metrics.`],
q: [`Why do many small loads hurt query speed?`, `Each creates a new version; queries must merge many versions until compaction catches up.`]
},
"Async materialized views": {
d: `**Asynchronous materialized views** store precomputed results of queries that can involve **multiple tables** (joins, aggregations), including **external catalog tables** (Iceberg, Hive, Hudi, Delta, Paimon).

- **Refresh**: «ASYNC» on a schedule («EVERY (INTERVAL 5 MINUTE)»), on base table changes, or «MANUAL». Partitioned MVs refresh only changed partitions.
- **Query rewrite**: the optimizer can automatically rewrite queries on base tables to use a matching MV (SPJG queries: select-project-join-group by), even partially. Controlled by staleness tolerance («mv_rewrite_staleness_second»).
- Uses: pre-aggregated dashboards, denormalised wide tables, accelerating lake queries, building a lightweight ELT layer inside StarRocks.`,
life: `A newspaper's pre-printed summary tables (cricket scores by team) updated every few minutes, so readers don't recount every ball themselves, and the newsroom automatically points readers to the summary when it fits.`,
work: `A merchant dashboard joined payments (Iceberg, 4 TB) with merchants and computed hourly GMV. A partitioned async MV by day, refreshed every 5 minutes, served the dashboard in 150 ms; analysts writing similar ad-hoc queries also got rewritten to the MV automatically.`,
ex: `CREATE MATERIALIZED VIEW mv_hourly_gmv
PARTITION BY date_trunc('day', hr)
REFRESH ASYNC EVERY (INTERVAL 5 MINUTE)
AS SELECT date_trunc('hour', p.ts) AS hr, m.city, p.merchant_id, sum(p.amount) gmv, count(*) txns
FROM iceberg_cat.lake.payments p JOIN merchants m ON p.merchant_id = m.id
GROUP BY 1, 2, 3;
SELECT * FROM information_schema.materialized_views WHERE TABLE_NAME = 'mv_hourly_gmv';`,
pit: [`Non-partitioned MVs over huge bases (full refresh each time).`, `Expecting rewrite with incompatible query shapes.`, `Refresh intervals tighter than refresh duration.`],
q: [`What does automatic query rewrite do?`, `The optimizer transparently answers a query against base tables using a matching materialized view.`]
},
"Query the lake directly": {
d: `**External catalogs** let StarRocks query lake tables **in place**, without loading: Iceberg (Hive metastore, Glue, REST catalogs), Hive, Hudi, Delta Lake, Paimon, plus JDBC sources. «CREATE EXTERNAL CATALOG ...», then «SELECT * FROM iceberg_cat.db.table».

Performance features: vectorized Parquet/ORC readers, partition and file pruning from lake metadata, predicate pushdown, a **data cache** on local disks/memory of BE/CN nodes for hot remote data, metadata caching, and async MVs over external tables for frequently used aggregations.

Typical architecture: Iceberg as the single source of truth (written by Spark/Flink), StarRocks as the fast, high-concurrency query engine (lakehouse analytics) without copying all data.`,
life: `Reading books directly in the city library instead of photocopying the whole library into your house, while keeping your favourite books on your desk (cache).`,
work: `Instead of duplicating 40 TB from Iceberg into a warehouse, the team created an Iceberg catalog (Glue) in StarRocks. Ad-hoc queries ran on the lake directly; the top 10 dashboard queries were served by MVs. Storage costs dropped and there was one copy of truth.`,
ex: `CREATE EXTERNAL CATALOG iceberg_cat PROPERTIES (
  "type" = "iceberg", "iceberg.catalog.type" = "glue",
  "aws.glue.region" = "ap-south-1", "aws.s3.region" = "ap-south-1",
  "aws.glue.use_instance_profile" = "true", "aws.s3.use_instance_profile" = "true");
SET CATALOG iceberg_cat;
SELECT merchant_id, sum(amount) FROM lake.payments WHERE dt = '2026-11-18' GROUP BY 1;`,
pit: [`Unpartitioned/un-compacted lake tables (slow scans).`, `No data cache for repeated remote reads.`, `Static credentials instead of instance profiles/roles.`],
q: [`Why use async MVs on top of external lake tables?`, `To precompute frequent heavy queries for sub-second, high-concurrency serving while the lake stays the source of truth.`]
},
"Tablets, rowsets and versions": {
d: `Storage hierarchy (shared-nothing):
- **Table → partitions → buckets**; each bucket in a partition is a **tablet**, the unit of replication, balancing and scanning (typically 3 replicas on different BEs).
- A tablet's data consists of **rowsets**, one per successful load (a version), each with **segment files** (columnar, with indexes).
- **Compaction** merges rowsets: **cumulative** (recent small ones) and **base** (into the big base rowset), and for Primary Key tables applies deletes.
- Queries read a consistent **version** across all tablets (MVCC), so loads are atomic and readers never see partial loads.

In shared-data mode, tablets' data lives in object storage, metadata/versions are managed similarly, and compaction runs on compute nodes.`,
life: `A filing box (tablet) where each delivery adds a new folder (rowset). Every so often a clerk merges folders into one tidy file (compaction). Readers always look at a consistent set of folders.`,
work: `Queries on one table slowed suddenly. «SHOW TABLET» showed a few tablets with 900+ versions because compaction threads were busy with a large backfill. Throttling the backfill and temporarily raising compaction threads brought versions down and query latency back.`,
ex: `SHOW TABLET FROM payments PARTITION (p20261118);
SHOW TABLET 12345;                  -- replicas, versions, data size
ADMIN SHOW REPLICA DISTRIBUTION FROM payments;
-- BE config (example knobs): cumulative/base compaction threads`,
pit: [`Ignoring version counts.`, `Uneven replica distribution after node changes.`, `Bulk backfills starving compaction for hot tables.`],
q: [`What is a tablet?`, `One bucket of one partition: the unit of storage, replication and scanning.`]
},
"Pipeline execution and runtime filters": {
d: `Query execution:
- The FE splits a plan into **fragments** connected by exchanges; fragment instances run in parallel across BEs/CNs.
- Within a node, the **pipeline engine** breaks fragments into pipelines of operators driven by a fixed thread pool (morsel-driven), avoiding thread explosion and making blocking operators (hash build, sort) cooperate efficiently.
- **Runtime filters**: when a hash join builds its table from the (smaller) build side, it creates filters (IN-lists, min/max, bloom filters) of join keys and pushes them to the probe side's **scan**, even across nodes (global runtime filters). The big table then skips rows/pages/partitions that can't match, before they're read and shuffled.

Check them in «EXPLAIN ANALYZE»/query profiles: filters generated, rows filtered, wait times.`,
life: `Before searching a huge warehouse for parcels for 50 customers, you first make a list of those 50 customer ids and hand it to every picker, so they skip shelves that can't contain them.`,
work: `A join of 5 B payments with a filtered set of 2,000 merchants scanned all payments. The profile showed the runtime filter arrived too late (build side slow). Increasing «runtime_filter_wait_timeout_ms» and ensuring the merchants side was small and broadcast let the filter prune 99% of payment rows at scan: 9 s → 0.6 s.`,
ex: `SET enable_profile = true;
SELECT p.merchant_id, sum(p.amount)
FROM payments p JOIN (SELECT id FROM merchants WHERE city = 'Hyderabad') m ON p.merchant_id = m.id
GROUP BY 1;
-- Then inspect the query profile: RuntimeFilter, RowsFiltered (via UI or SHOW PROFILELIST / ANALYZE PROFILE)`,
pit: [`Large build sides making filters useless.`, `Filters arriving after scans finish.`, `Not using profiles to debug slow joins.`],
q: [`What do runtime filters do?`, `They push the join keys from the build side into the probe side's scan so non-matching data is skipped early.`]
},
"Routine Load mechanics": {
d: `A **Routine Load job** runs continuously:
- The FE splits the job into **tasks**; each task is assigned some Kafka partitions and consumes for up to «max_batch_interval» seconds or «max_batch_rows»/size, then commits the loaded data **and the consumed offsets atomically** (exactly-once into StarRocks).
- Concurrency: «desired_concurrent_number», limited by partitions, BE count and «max_routine_load_task_concurrent_num».
- Error tolerance: «max_error_number» / «max_filter_ratio» decide when malformed rows pause the job.
- States: NEED_SCHEDULE, RUNNING, **PAUSED** (errors, Kafka issues), STOPPED (permanent). Paused jobs need investigation and «RESUME ROUTINE LOAD».
- Supports column mapping, JSON paths, filters («WHERE»), and Primary Key upserts/deletes via an op column.`,
life: `A team of clerks, each assigned some mail slots, who every 10 seconds files whatever arrived and records "done up to letter #N" in the same stroke, so nothing is filed twice.`,
work: `A Routine Load job paused overnight after a producer sent malformed JSON; dashboards were stale by morning. Fix: «max_error_number» tuned to tolerate a few bad rows, alerts on job state != RUNNING and on lag (offset diff), and a schema check on the producer.`,
ex: `SHOW ROUTINE LOAD FOR pay.payments_rl\\G     -- State, Progress (offsets), ErrorLogUrls
RESUME ROUTINE LOAD FOR pay.payments_rl;
ALTER ROUTINE LOAD FOR pay.payments_rl PROPERTIES ("max_error_number" = "1000");
-- Primary Key upsert/delete from CDC
COLUMNS(order_id, status, amount, op, __op = if(op = 'd', 1, 0))`,
pit: [`No alerting on PAUSED jobs.`, `Zero error tolerance on noisy sources.`, `More desired concurrency than Kafka partitions.`],
q: [`How does Routine Load achieve exactly-once into StarRocks?`, `Each task commits the loaded rows and the Kafka offsets it consumed in one transaction.`]
},
"Async MVs in depth": {
d: `Making async MVs efficient:
- **Partition alignment**: «PARTITION BY» the MV on a column derived from the base table's partition column (e.g. «date_trunc('day', ts)»). When base partitions change, only the matching MV partitions refresh. For external tables (Iceberg/Hive), partition-level change detection works too.
- **Refresh controls**: «partition_refresh_number» (partitions per refresh batch), «auto_refresh_partitions_limit», «partition_ttl», excluded trigger tables («excluded_trigger_tables») for dimension tables that change often but don't need to trigger refreshes.
- **Rewrite**: works for SPJG queries, including joins with fewer tables (with key constraints like unique/foreign keys declared), aggregation rollup (MV at hour level answers day queries), union rewrite (MV + base for fresh partitions).
- **Resource isolation**: run refreshes in a dedicated resource group so they don't slow serving queries.`,
life: `Updating a cricket stats book: when a new match is played, you only update that season's page (partition refresh), not rewrite the whole book.`,
work: `An MV over 2 years of payments did full refreshes taking 40 minutes, every 10 minutes. Re-creating it partitioned by day with «partition_refresh_number = 3» made refreshes touch only today's and yesterday's partitions (90 s). Declaring a foreign key from payments to merchants enabled rewrite for queries that didn't join merchants.`,
ex: `CREATE MATERIALIZED VIEW mv_daily
PARTITION BY dt
REFRESH ASYNC EVERY (INTERVAL 10 MINUTE)
PROPERTIES ("partition_refresh_number" = "3", "partition_ttl" = "400 DAY",
            "resource_group" = "rg_mv_refresh")
AS SELECT date_trunc('day', ts) dt, merchant_id, sum(amount) gmv FROM payments GROUP BY 1, 2;
SELECT * FROM information_schema.task_runs WHERE task_name LIKE '%mv_daily%' ORDER BY create_time DESC LIMIT 5;`,
pit: [`MV partitioning not aligned with base table.`, `Refreshes competing with dashboards for CPU.`, `Dimension table changes triggering huge refreshes.`],
q: [`Why align MV partitions with base table partitions?`, `So a change in one base partition refreshes only the matching MV partition instead of the whole MV.`]
}
});
