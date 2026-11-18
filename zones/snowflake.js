QUEST.zone("snowflake", {
mission:["arjun","Finance moved to Snowflake and the credit bill is climbing. Learn how Snowflake stores data and spends credits, then cut the bill without slowing anything down."],
levels:[
{t:"Architecture", sub:"Storage, compute, services", rounds:[
 ["learn","Three layers","**Storage**: compressed columnar micro-partitions in cloud storage. **Compute**: **virtual warehouses** (clusters) that you size and start/stop independently. **Cloud services**: metadata, optimizer, security, result cache.",["Cloud services (metadata, optimizer)","Virtual warehouses (compute)","Storage (micro-partitions)"]],
 ["learn","Warehouses spend credits","Credits per hour double with each size (XS=1, S=2, M=4, L=8…). Billed **per second with a 60-second minimum** each time it resumes. **Auto-suspend** and **auto-resume** stop paying for idle time."],
 ["pick","A Medium warehouse runs 30 minutes. Credits used?",["1","2","4","8"],1,"Medium = 4 credits/hour × 0.5 h = 2 credits."],
 ["sort","Scale up or scale out?",{"Scale up (bigger size)":["One huge query spilling to disk","Complex transformation too slow"],"Scale out (multi-cluster)":["100 analysts queueing at 9 AM","Many small concurrent dashboard queries"]},"Size for query complexity; clusters for concurrency."],
 ["tf","Architecture facts",[["Two warehouses can query the same table at once without contention.",true,"Storage is shared, compute is separate."],["A suspended warehouse still costs credits.",false,"Only storage is billed while suspended."],["Cloud services usage is free up to 10% of daily compute.",true,"Above that it's billed."]]]
]},
{t:"Micro-partitions", sub:"Pruning and clustering", rounds:[
 ["learn","Micro-partitions","Data is stored in immutable **micro-partitions** of 50–500 MB uncompressed, with min/max and distinct counts per column. Queries **prune** micro-partitions whose ranges can't match the filter."],
 ["learn","Clustering","Data is naturally clustered by load order. For huge tables filtered on another column, define a **clustering key**; **Automatic Clustering** reorganises in the background (costs credits). Check with «SYSTEM$CLUSTERING_INFORMATION»."],
 ["pick","A 20 TB table is always filtered by event_date but loaded in random order. Query profile shows 98% of partitions scanned. Fix?",["Clustering key on event_date","Bigger warehouse","Result cache","More clusters"],0,"Clustering restores pruning."],
 ["match","Query profile signal",[["Partitions scanned ≈ total","Poor pruning: filter or clustering"],["Bytes spilled to remote storage","Warehouse too small for the query"],["Queued time high","Need multi-cluster or less load"],["Exploding join","Bad join keys duplicating rows"]],"Read the profile before resizing."],
 ["learn","Caches","**Result cache**: identical query, unchanged data → instant, no warehouse (24 h, extended on reuse). **Warehouse cache**: local SSD of recently read data, lost on suspend. **Metadata**: COUNT(*), MIN/MAX answered from metadata."],
 ["tf","Cache facts",[["The result cache needs a running warehouse.",false,"Cloud services serves it."],["Suspending a warehouse clears its local disk cache.",true,"Very short auto-suspend can slow repeated workloads."],["CURRENT_TIMESTAMP in a query prevents result-cache reuse.",true,"Non-deterministic functions disable it."]]]
]},
{t:"Time Travel & cloning", sub:"Data protection", rounds:[
 ["learn","Time Travel and Fail-safe","Query or restore past data with «AT(OFFSET => -3600)» or «BEFORE(STATEMENT => id)», and «UNDROP TABLE». Retention: 1 day by default, up to **90 days** on Enterprise. After that, **Fail-safe** keeps 7 days, recoverable only by Snowflake support."],
 ["order","Data lifecycle after a DELETE",["Rows deleted (new micro-partitions written)","Old versions kept for Time Travel retention","Moved to Fail-safe for 7 days","Purged permanently"],"Transient tables have no Fail-safe; temporary tables last for the session."],
 ["learn","Zero-copy cloning","«CREATE TABLE dev CLONE prod» (or a whole database) copies only metadata. Clones share micro-partitions until either side changes data. Perfect for dev/test and backfills."],
 ["pick","You need a full copy of a 50 TB production database for testing, today. Best way?",["Unload to S3 and reload","CLONE the database","Replicate to another account","CTAS every table"],1,"Instant, no extra storage until changes."],
 ["fill","Recover a dropped table and query the past",'___ TABLE payments;\nSELECT * FROM payments ___(OFFSET => -60*30);',["UNDROP","AT"],["RESTORE","ROLLBACK","SINCE"],"Time Travel by offset in seconds."]
]},
{t:"Pipelines", sub:"Snowpipe, Streams, Tasks", rounds:[
 ["learn","Loading","«COPY INTO» bulk-loads from a stage. **Snowpipe** loads files automatically when they land (event notifications), billed serverlessly. **Snowpipe Streaming** writes rows directly with seconds of latency (e.g. Kafka connector)."],
 ["learn","Streams and Tasks","A **stream** tracks changes (CDC) on a table since the last consumption. A **task** runs SQL on a schedule or after another task. Together: incremental pipelines. **Dynamic tables** declare the result query and a target lag instead."],
 ["order","Incremental pipeline with streams",["CREATE STREAM pay_s ON TABLE raw_payments","Task runs every 5 min WHEN SYSTEM$STREAM_HAS_DATA('pay_s')","MERGE stream rows into the curated table","Stream offset advances after the transaction commits"],"The WHEN clause skips runs (and credits) when nothing changed."],
 ["match","Pick the feature",[["Files land in S3 continuously","Snowpipe"],["Rows from Kafka in seconds","Snowpipe Streaming"],["'Keep this aggregate within 10 minutes'","Dynamic table"],["Run Python next to the data","Snowpark"]],"Snowflake has a feature for each pipeline shape."],
 ["sort","Cuts credits or not?",{"Cuts credits":["Auto-suspend 60 s","Resource monitor with suspend","Task WHEN SYSTEM$STREAM_HAS_DATA","Right-size warehouses"],"Wastes credits":["X-Large for a tiny ELT","Auto-suspend disabled","Unneeded automatic clustering on a small table"]},"Most savings come from idle and oversized compute."]
]},
{t:"Boss: The credit bill", boss:true, time:30, rounds:[
 ["pick","A Large warehouse runs all night with no queries. Fix?",["Auto-suspend 60 s + resource monitor","Bigger warehouse","Multi-cluster","Clustering key"],0,"Stop paying for idle."],
 ["pick","9 AM: dashboards queue for minutes, each query is small. Fix?",["Multi-cluster warehouse (scale out)","Scale up to 4XL","Disable result cache","Clustering"],0,"Concurrency problem."],
 ["pick","One ELT query spills TBs to remote storage. Fix?",["Scale up the warehouse for that job","Add clusters","Time Travel","Snowpipe"],0,"Spilling means not enough memory per query."],
 ["pick","Queries scan all partitions of a 30 TB table filtered by date. Fix?",["Clustering key on the date","Bigger warehouse","Fail-safe","UNDROP"],0,"Restore pruning."],
 ["pick","Someone ran DELETE without WHERE an hour ago. Fix?",["Time Travel: insert from AT(OFFSET => -3600)","Call support for Fail-safe first","Restore from S3","Clone a dev table"],0,"Time Travel is self-service."],
 ["pick","A task runs every minute even when no data arrived. Fix?",["WHEN SYSTEM$STREAM_HAS_DATA","Bigger warehouse","Snowpark","Result cache"],0,"Skip empty runs."]
]}
]});

QUEST.more("snowflake", [
{act:"Expert", t:"Query engine internals", sub:"Pruning, spilling, profile", rounds:[
 ["learn","Reading the query profile","Snowflake executes queries as a DAG of **operators** on the warehouse's nodes. The **query profile** shows time per operator, partitions scanned vs total, bytes spilled, and the biggest offenders.",null,null,`### Signals that matter
- **Partitions scanned / total**: pruning effectiveness. 4,980 / 5,000 on a date filter means the data isn't clustered by date.
- **Bytes spilled to local storage**: memory overflow to the warehouse's SSD — slower. **Bytes spilled to remote storage**: overflow to cloud storage — much slower. Remote spilling usually means **scale up** or reduce the data per operator.
- **Exploding joins**: output rows ≫ input rows (missing or non-unique join keys).
- **Inefficient pruning in joins**: Snowflake can prune the probe side at runtime using the build side's values (join filter / bloom), shown as a JoinFilter operator.
- **Percentage of time in remote disk I/O** vs processing: I/O-bound scans benefit from better pruning, CPU-bound ones from a bigger warehouse.

### Micro-partition metadata
For each micro-partition and column: min/max, distinct count, null count. That's what pruning, «COUNT(*)», «MIN/MAX» answers and the optimizer use — no indexes in the traditional sense.

### Search Optimization Service
For highly selective **point lookups** (e.g. «WHERE payment_id = 'p_9'» on a huge table) or substring/semi-structured searches, the **search optimization service** builds a persistent search access path. It costs storage and maintenance credits; enable it per column for lookup-heavy tables.`],
 ["match","Profile symptom → action",[["Bytes spilled to remote storage","Scale up the warehouse or reduce rows per operator"],["Partitions scanned ≈ total on a date filter","Clustering key / load order by date"],["Join output 50× its inputs","Fix join keys / duplicates"],["Point lookups by id on 40 TB","Search optimization service"]],"Profile first, then pay."],
 ["pick","Which is the worse spill?",["Spilled to local storage","Spilled to remote storage","Both are free","Neither affects performance"],1,"Remote spill means even local SSD overflowed."],
 ["learn","Clustering depth","**Clustering depth** is the average number of micro-partitions that overlap for a given value of the clustering key. Depth near 1 = perfectly clustered; high depth = poor pruning.",null,null,`«SYSTEM$CLUSTERING_INFORMATION('payments', '(event_date)')» returns average depth, overlaps and a histogram. «SYSTEM$CLUSTERING_DEPTH» gives just the depth.

### When to define a clustering key
- Tables in the **multi-terabyte** range.
- Queries consistently filter or join on the key.
- The natural load order doesn't match the filter (e.g. loaded by ingestion time, filtered by merchant).

### Choosing the key
- Low to moderate cardinality works best; for a timestamp, cluster on «TO_DATE(ts)» rather than the raw timestamp.
- Up to 3–4 columns, lowest cardinality first.
- Avoid frequently updated columns: changes trigger reclustering credits.

### Costs
Automatic Clustering runs serverless and bills credits for reclustering; heavy DML on a clustered table means continuous reclustering. Monitor with «AUTOMATIC_CLUSTERING_HISTORY».`],
 ["num","A table has 5,000 micro-partitions. A date filter scans 4,800 before clustering and 60 after. By what factor did scanned partitions drop?",80,1,"×","4,800 ÷ 60 = 80× fewer partitions scanned."],
 ["tf","Engine truths",[["Snowflake uses B-tree indexes for pruning.",false,"Micro-partition metadata (min/max) plus optional search optimization."],["Clustering on TO_DATE(ts) usually beats clustering on raw ts.",true,"Lower cardinality, better grouping."],["Automatic clustering is free.",false,"It consumes serverless credits."]]]
]},
{act:"Expert", t:"Warehouses & cost engineering", sub:"Sizing, multi-cluster, Gen2", rounds:[
 ["learn","Sizing is a speed vs cost trade","Each size up **doubles** compute and credits/hour. For queries that parallelize well, a 2× bigger warehouse runs ~2× faster for the **same credits**. When the query can't use the extra nodes, you just pay more.",null,null,`### Multi-cluster warehouses
- Min/max clusters with **Standard** scaling (start clusters quickly to avoid queuing) or **Economy** (start only if there's enough load to keep a new cluster busy for ~6 minutes; tolerates some queuing to save credits).
- Use for concurrency, not for single big queries.

### Query acceleration service
Offloads parts of eligible large scans to serverless compute, with a scale factor cap. Good for occasional outlier queries on a small warehouse.

### Control spend
- **Resource monitors**: credit quotas per warehouse/account with notify, suspend (after running queries finish) or suspend immediately.
- «STATEMENT_TIMEOUT_IN_SECONDS» and «STATEMENT_QUEUED_TIMEOUT_IN_SECONDS» per warehouse.
- Separate warehouses per workload (ELT, BI, data science) so you can size and attribute costs.
- «WAREHOUSE_METERING_HISTORY» and «QUERY_ATTRIBUTION_HISTORY» to see who spends what.

### Auto-suspend trade-off
Suspending clears the **local disk cache**. For BI warehouses with bursts every few minutes, a slightly longer auto-suspend (e.g. 5–10 minutes) can be cheaper overall than cold re-reading from remote storage on every burst.`],
 ["num","A query takes 16 minutes on a Medium (4 credits/h). It parallelizes perfectly. Credits on a Large (8 credits/h)?",1.07,0.02,"credits","Medium: 4 × 16/60 = 1.07 credits. Large runs in 8 minutes: 8 × 8/60 = 1.07 credits. Same cost, half the time."],
 ["sort","Standard or Economy scaling policy?",{"Standard":["Customer-facing dashboards where queuing is unacceptable"],"Economy":["Internal batch reporting that can wait a little","Cost-sensitive analyst sandbox"]},"Economy trades some queuing for fewer cluster-minutes."],
 ["match","Control → effect",[["Resource monitor with SUSPEND","Stop a warehouse at its monthly credit quota"],["STATEMENT_TIMEOUT_IN_SECONDS","Kill runaway queries"],["Separate warehouse per workload","Isolate and attribute cost"],["Query acceleration service","Offload big scans for outlier queries"]],"Governance is part of performance."],
 ["tf","Cost truths",[["A bigger warehouse always costs more per query.",false,"For well-parallelized queries the credits stay similar."],["Multi-cluster helps a single huge query run faster.",false,"It helps concurrency."],["A very short auto-suspend can increase cost for bursty BI.",true,"Cache is lost each time."]]]
]},
{act:"Expert", t:"Data protection & sharing", sub:"Time Travel costs, clones, sharing", rounds:[
 ["learn","What Time Travel really stores","Micro-partitions are **immutable**. An UPDATE writes new micro-partitions; the old ones are kept for the **Time Travel** retention and then **Fail-safe**. You pay storage for all of them.",null,null,`### Storage bill breakdown
«TABLE_STORAGE_METRICS» splits each table into **ACTIVE_BYTES**, **TIME_TRAVEL_BYTES**, **FAILSAFE_BYTES** and **RETAINED_FOR_CLONE_BYTES**. A table rewritten daily with 90-day Time Travel can hold ~90 copies of changed data.

### Table types
| Type | Time Travel | Fail-safe | Use |
|---|---|---|---|
| Permanent | 0–90 days (Enterprise) | 7 days | Production data |
| Transient | 0–1 day | None | Staging, easily rebuilt data |
| Temporary | 0–1 day | None, session-scoped | Session scratch |

Use **transient** tables for staging and intermediate ELT outputs that are rebuilt daily.

### Clones
A clone shares micro-partitions with its source. Storage is only charged when either side changes data. Dropping the source keeps shared partitions alive (as RETAINED_FOR_CLONE_BYTES) while the clone exists.

### Secure data sharing
Providers share databases with consumer accounts — **no data copy**; consumers pay for their own compute. Reader accounts serve consumers without Snowflake accounts. Cross-region/cloud sharing uses replication. Marketplace listings build on the same mechanism.`],
 ["pick","A 2 TB staging table is fully reloaded daily with 30-day Time Travel. Storage is ~60 TB. Best fix?",["Make it a transient table with 0–1 day Time Travel","Cluster it","Bigger warehouse","Use COPY"],0,"Staging doesn't need Time Travel or Fail-safe."],
 ["num","A permanent table changes 100 GB of micro-partitions per day with 14-day Time Travel. Roughly how much Time Travel + Fail-safe storage is held (GB)?",2100,100,"GB","~14 days × 100 GB in Time Travel + 7 days × 100 GB in Fail-safe ≈ 2,100 GB."],
 ["match","Table type",[["Permanent","Time Travel up to 90 days + 7-day Fail-safe"],["Transient","Up to 1 day Time Travel, no Fail-safe"],["Temporary","Session-only, no Fail-safe"],["Clone","Shares micro-partitions with its source"]],"Pick the cheapest type that's safe."],
 ["tf","Protection truths",[["Fail-safe data can be restored with UNDROP.",false,"Only Snowflake support can recover from Fail-safe."],["Shared data is copied into the consumer account.",false,"Live, zero-copy access."]]]
]},
{act:"Expert", t:"Pipelines deep", sub:"Streams, dynamic tables, Snowpark", rounds:[
 ["learn","How streams track changes","A **stream** stores an **offset** (a point in the table's version history), not data. Querying it returns rows changed since the offset with «METADATA$ACTION», «METADATA$ISUPDATE» and «METADATA$ROW_ID». The offset advances only when the stream is consumed in a **DML transaction that commits**.",null,null,`### Stream types
- **Standard**: inserts, updates (as DELETE + INSERT pairs with ISUPDATE = TRUE) and deletes — net changes since the offset.
- **Append-only**: inserts only; cheaper, ideal for raw ingestion tables.
- **Insert-only** for external tables / Iceberg.

### Staleness
A stream becomes **stale** if not consumed within the table's data retention (Time Travel + up to 14 days of extension via «MAX_DATA_EXTENSION_TIME_IN_DAYS»). A stale stream must be recreated, losing unconsumed changes. Monitor «STALE_AFTER» in SHOW STREAMS.

### Dynamic tables
Declare the query and a **TARGET_LAG** («'5 minutes'» or «DOWNSTREAM»). Snowflake schedules refreshes, choosing **incremental** refresh when the query supports it, otherwise full. Chains of dynamic tables form a DAG with consistent snapshots.

### Snowpark and tasks
**Snowpark** runs Python/Java/Scala DataFrame code inside Snowflake; Python UDFs/UDTFs and stored procedures execute in a secure sandbox on the warehouse. **Serverless tasks** let Snowflake size compute per task run; task graphs (DAGs) have a root task, child tasks, finalizer tasks and retry settings.`],
 ["order","A stream-based incremental load",["Raw table receives new rows via Snowpipe","Append-only stream records the change offset","Task runs MERGE from the stream into the curated table","Transaction commits; the stream offset advances","Next run sees only newer rows"],"If the MERGE fails, the offset doesn't move."],
 ["pick","A stream wasn't consumed for 3 weeks on a table with 1-day retention. What happens?",["It still works","It goes stale; recreate it and backfill","Snowflake emails you the data","It converts to append-only"],1,"Watch STALE_AFTER."],
 ["sort","Dynamic table or stream + task?",{"Dynamic table":["Declarative aggregate within 10 minutes","Chain of SQL transformations with lag targets"],"Stream + task":["Custom procedural logic per batch","Calling an external function per change","Precise control over MERGE conditions"]},"Declarative when possible, procedural when needed."],
 ["tf","Pipeline truths",[["Selecting from a stream outside DML advances its offset.",false,"Only a committed DML consuming it does."],["An update appears in a standard stream as DELETE + INSERT with ISUPDATE = TRUE.",true,"Net changes."],["TARGET_LAG = DOWNSTREAM refreshes only when a dependent table needs it.",true,"Lag driven by consumers."]]]
]},
{act:"Expert", t:"Expert boss: Snowflake FinOps review", boss:true, time:45, rounds:[
 ["pick","Large ELT query spills 2 TB to remote storage on a Medium. Fix?",["Scale up for that job (separate warehouse)","Multi-cluster","Longer auto-suspend","Search optimization"],0,"Memory-bound operator."],
 ["pick","Lookup of one payment_id on 40 TB scans thousands of partitions. Fix?",["Search optimization on payment_id","Clustering on amount","Bigger warehouse","Result cache"],0,"Point lookups need a search access path."],
 ["pick","Staging tables dominate storage via TIME_TRAVEL and FAILSAFE bytes. Fix?",["Transient tables with minimal retention","Clone them","Cluster them","Bigger warehouse"],0,"No Fail-safe for rebuildable data."],
 ["pick","A stream went stale over a holiday. Prevent?",["Monitor STALE_AFTER / consume regularly / extend retention","Use a bigger warehouse","Append-only always","Clone the table"],0,"Consume within retention."],
 ["pick","BI warehouse wakes every 2 minutes; auto-suspend 60 s; queries are slow and credits high. Try…",["Longer auto-suspend to keep cache warm","Shorter auto-suspend","Economy scaling","Bigger warehouse"],0,"Cache reuse can save credits."],
 ["pick","A 16-minute Medium job must finish in 8 minutes at similar cost. Do…",["Run it on a Large","Multi-cluster x2","Economy policy","Search optimization"],0,"Parallel queries scale with size."],
 ["pick","Clustering credits are huge on a table updated all day by a frequently changing status column. Fix?",["Cluster on a stable column (e.g. date), not status","Increase reclustering","Bigger warehouse","Remove pruning"],0,"Volatile keys trigger constant reclustering."]
]}
]);
