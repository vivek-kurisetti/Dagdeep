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
