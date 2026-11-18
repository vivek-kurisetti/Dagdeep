QUEST.zone("starrocks", {
mission:["meera","Merchants want a live dashboard with sub-second queries over billions of payments. We're trying StarRocks. Learn its table models and loading paths, then hit the latency target."],
levels:[
{t:"Architecture", sub:"FE, BE/CN, MPP", rounds:[
 ["learn","Frontends and backends","**FE** nodes hold metadata, parse and plan queries (one leader, followers, observers). **BE** nodes store data and execute. In **shared-data** mode, stateless **CN** (compute nodes) run queries over data in S3 with a local cache.",["Client connects via MySQL protocol","FE plans with the cost-based optimizer","Fragments run in parallel on BE/CN","Results stream back"]],
 ["learn","Why it's fast","A **vectorized** execution engine, a **cost-based optimizer**, columnar storage with indexes, pipeline execution, and **materialized views** with automatic query rewrite."],
 ["match","Components",[["FE","Metadata, planning, coordination"],["BE","Storage + execution (shared-nothing)"],["CN","Stateless compute for shared-data"],["Shared-data mode","Data in object storage, cache on local disk"]],"Shared-data separates storage from compute."],
 ["tf","Basics",[["StarRocks speaks the MySQL wire protocol.",true,"Use any MySQL client or BI connector."],["It can query Iceberg and Hive tables without loading them.",true,"Through external catalogs."],["StarRocks is mainly an OLTP database.",false,"It's an OLAP / real-time analytics engine."]]]
]},
{t:"Table models", sub:"Duplicate, Aggregate, Unique, Primary", rounds:[
 ["learn","Four table types","**Duplicate Key**: keep every row (logs). **Aggregate**: rows with the same key are pre-aggregated (SUM, MAX, REPLACE…). **Unique Key**: latest row per key, merged on read. **Primary Key**: latest row per key with delete+insert on write, fast reads and real-time upserts."],
 ["sort","Pick the table type",{"Duplicate Key":["Raw clickstream events","Audit logs"],"Aggregate":["Pre-summed GMV per merchant per minute"],"Primary Key":["Payment status updated by CDC","Orders with frequent updates and deletes"]},"Primary Key is the go-to for real-time updates."],
 ["learn","Partitioning and bucketing","**Partition** (often by date, or expression partitioning) for pruning and lifecycle. **Bucket** (distribution) by a hash key for parallelism; random bucketing for Duplicate tables. Aim for tablets of roughly 1–10 GB."],
 ["fill","A Primary Key table for payments",'CREATE TABLE payments (\n  payment_id BIGINT, dt DATE, merchant_id BIGINT, status VARCHAR(16), amount DECIMAL(18,2)\n) ___ KEY(payment_id, dt)\nPARTITION BY ___\nDISTRIBUTED BY HASH(payment_id);',["PRIMARY","date_trunc('day', dt)"],["UNIQUE","RANGE(amount)","DUPLICATE"],"The partition column must be part of the primary key."],
 ["pick","Merge-on-read Unique Key tables slow down under many updates. Better choice?",["Primary Key table","Duplicate Key table","Aggregate with SUM","No partitions"],0,"Primary Key tables pay at write time to keep reads fast."]
]},
{t:"Loading data", sub:"Stream, Routine, Broker, Pipe", rounds:[
 ["learn","Ways in","**Stream Load**: HTTP push of a batch (JSON/CSV). **Routine Load**: continuously consumes a **Kafka** topic. **Broker Load** / **INSERT INTO … FILES()**: bulk from S3/HDFS. **Pipe**: continuous file loading. Flink/Spark connectors too."],
 ["match","Pick the loader",[["Kafka topic of payment events","Routine Load"],["App pushes 50 MB batches via HTTP","Stream Load"],["Backfill 2 TB of Parquet from S3","INSERT INTO … FILES() / Broker Load"],["Debezium CDC into Primary Key table","Flink CDC connector or Routine Load with op handling"]],"Each path is transactional per load."],
 ["learn","Avoid tiny loads","Each load creates a new data **version**; too many small loads (many per second per table) cause version build-up and compaction pressure. Batch for a few seconds or more."],
 ["pick","An app does 200 single-row Stream Loads per second. Error: too many versions. Fix?",["Batch rows into larger loads every few seconds","More FE nodes","Duplicate Key table","Disable compaction"],0,"Fewer, larger loads."],
 ["tf","Loading facts",[["Routine Load can consume Kafka exactly-once.",true,"Offsets commit with the load transaction."],["Primary Key tables support partial column updates.",true,"Update only some columns of a row."],["Each Stream Load must be a single row.",false,"It's a batch."]]]
]},
{t:"Speed tricks", sub:"MVs, lake queries, joins", rounds:[
 ["learn","Async materialized views","Async MVs refresh on a schedule or on base-table changes and can span multiple tables, including **external Iceberg/Hive tables**. The optimizer **rewrites** matching queries to use them transparently."],
 ["learn","Query the lake directly","External catalogs (Iceberg, Hive, Hudi, Delta, Paimon) let StarRocks query lake tables in place, with data cache on local disk. Build MVs over lake tables to accelerate hot dashboards."],
 ["match","Join speed-ups",[["Colocate join","Tables bucketed the same way in a colocation group: no shuffle"],["Broadcast join","Small table sent to every node"],["Shuffle join","Both sides redistributed by join key"],["Runtime filter","Build side pushes a filter to the probe side scan"]],"The CBO picks; colocation is the free lunch."],
 ["order","Make a lake dashboard sub-second",["Create an Iceberg external catalog","Query lake tables in place to confirm results","Create an async MV aggregating the hot query","Let query rewrite route dashboard queries to the MV"],"The dashboard SQL doesn't change."],
 ["pick","The same heavy join over Iceberg tables runs 10,000 times a day. Best fix?",["Async MV over the external tables with auto rewrite","Copy all data with INSERT every minute","More FE nodes","Duplicate Key table"],0,"Precompute once, rewrite automatically."]
]},
{t:"Boss: Sub-second dashboard", boss:true, time:30, rounds:[
 ["pick","Payment status must reflect updates within seconds. Table type?",["Primary Key","Duplicate Key","Aggregate","External"],0,"Real-time upserts."],
 ["pick","Kafka events must land continuously. Use…",["Routine Load","Broker Load nightly","Stream Load by hand","Seeds"],0,"Continuous Kafka consumption."],
 ["pick","Version count errors from tiny loads. Fix?",["Batch loads every few seconds","More BEs only","Disable MVs","Use UNIQUE"],0,"Fewer versions."],
 ["pick","Dashboard joins two huge tables on merchant_id every query. Fix?",["Colocate both tables (same bucketing, colocation group)","Broadcast the big one","Random bucketing","More partitions"],0,"No shuffle."],
 ["pick","Lake queries are fine but the top dashboard needs <300 ms. Fix?",["Async MV with query rewrite","Bigger FE","Drop the catalog","Unique Key"],0,"Precompute the hot path."],
 ["pick","Storage costs too high on BE disks for cold history. Fix?",["Shared-data mode with object storage + cache","More replicas","Duplicate tables","Smaller buckets"],0,"Cheap durable storage, hot cache."]
]}
]});

QUEST.more("starrocks", [
{act:"Expert", t:"Storage engine internals", sub:"Tablets, rowsets, versions, compaction", rounds:[
 ["learn","Tablets, rowsets and versions","A table splits into **partitions**, each into **buckets**; each bucket is a **tablet** replicated across BEs (shared-nothing) or stored in object storage (shared-data). Each load creates a new **rowset** and a new **version** of the tablet.",["Partition","Bucket = tablet","Load → new rowset + version","Compaction merges rowsets","Queries read a consistent version"],null,`### Why versions matter
Queries read all rowsets up to a visible version. Many small loads → many rowsets → slower reads and more metadata. **Cumulative compaction** merges recent small rowsets; **base compaction** merges into the large base rowset. Too many versions trigger errors like "too many versions" and load back-pressure.

### Primary Key table internals
Primary Key tables keep a **primary index** (in memory, or persistent on disk with «enable_persistent_index») mapping each key to its row location. An upsert marks the old row deleted (**delete vector**) and writes the new one — so reads don't need merge-on-read, which is why queries stay fast under heavy updates.

### Column storage
Segment files store columns in pages with **zone maps** (min/max per page), optional **bloom filter indexes**, **bitmap indexes** for low-cardinality columns, and a short-key **prefix index** on the sort key. Choose the **sort key** («ORDER BY» in DDL for PK tables) to match common filters.

### Tablet sizing
Aim for tablets of roughly 1–10 GB. Too many tiny tablets (over-bucketing) waste metadata and scheduling; too few big ones limit parallelism.`],
 ["num","A daily partition holds 120 GB. Targeting ~4 GB tablets, how many buckets?",30,0,"buckets","120 ÷ 4 = 30 buckets for that partition."],
 ["match","Structure",[["Tablet","One bucket of one partition; unit of replication and scheduling"],["Rowset","Data written by one load"],["Primary index","Key → row location for PK upserts"],["Base compaction","Merges into the large base rowset"]],"Small loads create work for compaction."],
 ["pick","Why do Primary Key tables read faster than Unique Key tables under heavy updates?",["PK uses delete-and-insert with a primary index, so reads skip merge-on-read","PK tables have no indexes","They're in memory only","They're unpartitioned"],0,"Work moves to write time."],
 ["tf","Engine truths",[["Every Stream Load creates a new data version.",true,"Batch your loads."],["More buckets always mean faster queries.",false,"Tiny tablets add overhead."],["Bitmap indexes suit low-cardinality filter columns.",true,"E.g. status or country."]]]
]},
{act:"Expert", t:"Query execution & optimizer", sub:"Pipelines, runtime filters, CBO", rounds:[
 ["learn","Pipeline execution and runtime filters","Plans are split into **fragments** executed in parallel across BE/CN; within a node, the **pipeline engine** schedules operators as non-blocking drivers on a fixed thread pool. **Runtime filters** built from the join's build side (min/max, IN lists, bloom filters) are pushed to the probe-side scan.",null,null,`### Runtime filters in action
«fact JOIN dim ON fact.merchant_id = dim.id WHERE dim.city = 'Hyderabad'». The build side (filtered dim) produces 300 ids; a bloom filter on those ids is pushed to the fact scan, which skips rows, pages and even whole tablets/partitions before shipping data to the join. Global runtime filters cross nodes for shuffle joins.

### Cost-based optimizer
Uses table and column statistics (auto-collected, or «ANALYZE TABLE … WITH SYNC MODE»), histograms for skewed columns, and chooses join order, join distribution (broadcast / shuffle / bucket shuffle / colocate) and aggregation strategy. Bad stats → bad distribution choices: refresh after big loads.

### Distribution choices
- **Colocate**: same bucketing columns and count, same colocation group → local join, no exchange.
- **Bucket shuffle**: the right side is shuffled to match the left side's bucketing.
- **Broadcast**: small right side copied to all.
- **Shuffle**: both sides hashed by key.

### Query profile
«EXPLAIN ANALYZE» / the query profile show per-operator time, rows, runtime filter effectiveness and spill. Spill-to-disk can be enabled for big aggregations and joins.`],
 ["sort","Which distribution?",{"Colocate join":["orders and order_items bucketed identically by order_id in one colocation group"],"Bucket shuffle":["Left table bucketed by merchant_id, right side not"],"Broadcast":["Fact × 5,000-row merchant dimension"],"Shuffle":["Two big tables with unrelated bucketing"]},"Cheapest exchange wins."],
 ["pick","A star query scans the whole fact table despite a selective dimension filter. What should prune it?",["Runtime filters from the join build side","Bigger buckets","More FEs","Async MV refresh"],0,"Check runtime filter effectiveness in the profile."],
 ["order","Diagnose a slow StarRocks query",["Run EXPLAIN ANALYZE / open the query profile","Find the operator with the most time and rows","Check join distribution and runtime filter hits","Refresh stats or fix bucketing/colocation","Consider an async MV for the hot path"],"Profile-driven tuning."],
 ["tf","Optimizer truths",[["Stale statistics can make the CBO pick shuffle instead of broadcast.",true,"Refresh stats after big loads."],["Runtime filters only work within one node.",false,"Global runtime filters cross nodes."]]]
]},
{act:"Expert", t:"Real-time ingestion deep", sub:"Routine Load, CDC, partial updates", rounds:[
 ["learn","Routine Load mechanics","A **Routine Load job** is split into **tasks**, each consuming a set of Kafka partitions for a bounded time or size, then committing the data **and the Kafka offsets in one transaction** — exactly-once into StarRocks.",null,null,`### Key properties
- «desired_concurrent_number»: parallel tasks (capped by Kafka partitions and BE count).
- «max_batch_interval»: seconds per task (e.g. 10 s) — the freshness/version trade-off.
- «max_error_number» / «max_filter_ratio»: tolerance for bad rows before the job pauses.
- JSON paths («jsonpaths») map nested JSON to columns.
- Monitor with «SHOW ROUTINE LOAD»: state, lag per partition, error URLs.

### CDC into Primary Key tables
Include an «__op» column (0 = upsert, 1 = delete) to apply Debezium-style changes: the Flink CDC connector or Routine Load with a mapped «__op» field handles inserts, updates and deletes.

### Partial updates
PK tables support updating only some columns: «partial_update = true» with a column list. Modes: **row** mode (good for few rows, many columns) and **column** mode (good for many rows, few columns). Conditional updates («merge_condition = 'version'») only apply if the incoming version is newer — protecting against out-of-order events.`],
 ["fill","Ingest Kafka JSON into a PK table",'CREATE ROUTINE LOAD pay.load_payments ON payments\nCOLUMNS (payment_id, dt, status, amount, __op = IF(op = \'d\', 1, 0))\nPROPERTIES ("format" = "json", "max_batch_interval" = "___",\n            "jsonpaths" = "[\\"$.payment_id\\",\\"$.dt\\",\\"$.status\\",\\"$.amount\\",\\"$.op\\"]")\nFROM ___ ("kafka_broker_list" = "b1:9092", "kafka_topic" = "payments");',["10","KAFKA"],["0","S3","STREAM"],"10-second batches balance freshness and versions."],
 ["pick","CDC events sometimes arrive out of order and overwrite newer rows. Fix?",["Conditional update with merge_condition on a version/LSN column","More buckets","Duplicate Key table","Lower max_batch_interval"],0,"Only newer versions win."],
 ["match","Setting",[["max_batch_interval","How long each load task collects data"],["desired_concurrent_number","Parallel consumer tasks"],["__op column","Marks upsert vs delete for PK tables"],["partial_update","Update only a subset of columns"]],"Real-time knobs."],
 ["tf","Ingestion truths",[["Routine Load commits Kafka offsets with the data transaction.",true,"Exactly-once."],["Partial updates require a Primary Key table.",true,"Row identity is needed."]]]
]},
{act:"Expert", t:"Materialized views & lake acceleration", sub:"Refresh, rewrite, data cache", rounds:[
 ["learn","Async MVs in depth","Async MVs refresh **by partition**: when base partitions change, only matching MV partitions refresh («PARTITION BY» aligned with the base table). **Query rewrite** matches SPJG (select-project-join-group by) queries, including rollups to coarser grouping and partial (union) rewrite.",null,null,`### Refresh options
- «REFRESH ASYNC EVERY (INTERVAL 5 MINUTE)» or on base-table change for internal tables.
- «partition_refresh_number» limits partitions per refresh task.
- For **external (lake) tables**, StarRocks detects partition changes in the catalog and refreshes affected MV partitions.
- «query_rewrite_consistency» controls how stale an MV may be for rewrite («checked», «loose», «force_mv»).

### Rewrite capabilities
- Aggregate rollup: an MV grouped by (merchant, day) can answer a query grouped by (merchant, month).
- Join derivation: a query with fewer joins can use an MV with more joins when foreign/unique key constraints are declared.
- **Union rewrite**: fresh base data unioned with MV data when only some partitions are stale.

### Lake acceleration
- **Data cache** keeps hot lake data (Parquet/ORC blocks) on local disk/memory of BE/CN.
- Metadata caching for Iceberg/Hive catalogs.
- MVs over Iceberg tables materialize hot aggregates inside StarRocks with automatic rewrite, while the lake remains the source of truth.`],
 ["pick","An MV grouped by (merchant_id, day) exists. A query groups by (merchant_id, month). Can rewrite use it?",["No, groupings must match exactly","Yes, via aggregate rollup","Only with force_mv","Only for Duplicate tables"],1,"Coarser grouping can roll up from the MV (for rollup-able aggregates like SUM/COUNT)."],
 ["sort","Helps lake query latency?",{"Helps":["Data cache on BE/CN","Async MV over the Iceberg table","Metadata cache"],"Doesn't help":["More FE observers only","Random bucketing on internal tables"]},"Bring hot data and results closer."],
 ["tf","MV truths",[["Partition-aligned MVs refresh only changed partitions.",true,"Cheap incremental refresh."],["Union rewrite can combine stale MV partitions with fresh base data.",true,"Correct results with partial freshness."]]]
]},
{act:"Expert", t:"Expert boss: Real-time analytics review", boss:true, time:45, rounds:[
 ["pick","Load errors: too many versions on a hot PK table. Fix?",["Batch loads (larger max_batch_interval) and let compaction catch up","More replicas","Unique Key table","Disable compaction"],0,"Fewer versions."],
 ["pick","Star joins scan the full fact despite selective dims. Check…",["Runtime filter effectiveness in the profile","FE memory","Bucket count only","Replication"],0,"Pushdown from build side."],
 ["pick","orders × items joins always shuffle. Fix?",["Colocate both on order_id with same bucket count and group","Broadcast items","Random bucketing","More partitions"],0,"Local joins."],
 ["pick","Late CDC events overwrite newer data. Fix?",["merge_condition on version column","Duplicate Key","Smaller tablets","Bigger FE"],0,"Conditional updates."],
 ["pick","120 GB partitions with 512 buckets each; queries slow, metadata huge. Fix?",["Fewer buckets (~1–10 GB tablets)","More buckets","More FEs","Broadcast all"],0,"Right-size tablets."],
 ["pick","A monthly dashboard should reuse a daily MV. Requirement?",["Rollup-able aggregates (SUM, COUNT) and compatible grouping","Exactly same SQL","force_mv only","Duplicate table"],0,"Aggregate rollup rewrite."],
 ["pick","Iceberg dashboard needs < 300 ms; lake reads are 2 s. Combine…",["Async MV over Iceberg + data cache","More Kafka partitions","Unique Key","Disable CBO"],0,"Materialize and cache."]
]}
]);
