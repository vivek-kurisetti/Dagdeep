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
