QUEST.zone("databricks", {
mission:["dev","The analytics team runs on Databricks. Delta tables, Unity Catalog, streaming ingest. Learn how the lakehouse is put together, then fix a broken medallion pipeline."],
levels:[
{t:"Delta Lake", sub:"The transaction log", rounds:[
 ["learn","Parquet + a transaction log","A Delta table is Parquet files plus «_delta_log/»: ordered JSON commits (add/remove file actions, schema, stats) with a Parquet **checkpoint** every few commits. Readers rebuild the table state from the log.",["Write new Parquet files","Commit JSON N+1 to _delta_log","Checkpoint periodically","Readers replay log to find live files"]],
 ["learn","ACID via optimistic concurrency","Each commit tries to write the next log file; if another writer got there first, Delta checks for conflicts and retries or fails. Readers always see a consistent snapshot."],
 ["match","Delta commands",[["OPTIMIZE","Compact small files"],["ZORDER BY (col)","Co-locate related values for skipping (legacy)"],["VACUUM","Delete files no longer referenced, after retention"],["DESCRIBE HISTORY","Show versions and operations"],["RESTORE TABLE … VERSION AS OF","Roll back to an older version"]],"These five are daily tools."],
 ["pick","Default VACUUM retention?",["0 hours","24 hours","7 days","90 days"],2,"Shorter retention can break time travel and concurrent readers."],
 ["learn","Liquid clustering","«CLUSTER BY (cols)» replaces partitioning + Z-ORDER for most tables: clustering is incremental and keys can be changed later. Use it instead of over-partitioning."],
 ["tf","Delta facts",[["Delta needs to LIST all Parquet files to read a table.",false,"The log lists live files."],["Time travel works until VACUUM removes old files.",true,"Log retention (30 days) also applies."],["Deletion vectors avoid rewriting files on DELETE.",true,"Rows are marked deleted; OPTIMIZE purges later."]]]
]},
{t:"Unity Catalog", sub:"Governance", rounds:[
 ["learn","Three-level namespace","Unity Catalog organises data as «catalog.schema.table» under a **metastore** per region. It governs tables, views, volumes (files), models and functions with one permission model and records **lineage** automatically."],
 ["fill","Grant read access to analysts",'GRANT ___ ON CATALOG finance TO `analysts`;\nGRANT USE SCHEMA ON SCHEMA finance.mart TO `analysts`;\nGRANT ___ ON TABLE finance.mart.daily_gmv TO `analysts`;',["USE CATALOG","SELECT"],["READ","OWNERSHIP","MODIFY"],"You need USE on catalog and schema plus SELECT on the table."],
 ["match","UC objects",[["Managed table","UC controls storage location and lifecycle"],["External table","Data lives at a path you manage"],["Volume","Governed files (non-tabular)"],["Row filter / column mask","Fine-grained access in SQL functions"]],"Prefer managed tables for automatic optimisation."],
 ["tf","Governance facts",[["Table lineage needs manual tagging.",false,"UC captures lineage automatically."],["SELECT on a table is enough without USE SCHEMA.",false,"You need USE CATALOG and USE SCHEMA too."],["Delta Sharing shares live tables across platforms.",true,"An open protocol."]]]
]},
{t:"Ingest & pipelines", sub:"Auto Loader, Lakeflow", rounds:[
 ["learn","Auto Loader","«cloudFiles» incrementally ingests new files from cloud storage with exactly-once tracking in the checkpoint. It uses file notifications or directory listing, infers and **evolves schemas**, and puts unexpected data in «_rescued_data»."],
 ["fill","Auto Loader stream",'(spark.readStream.format("___")\n  .option("cloudFiles.format", "json")\n  .option("cloudFiles.schemaLocation", "/chk/pay_schema")\n  .load("s3://raw/payments/")\n  .writeStream.option("checkpointLocation", "/chk/pay")\n  .trigger(___=True)\n  .toTable("bronze.payments"))',["cloudFiles","availableNow"],["parquet","once_forever","kafka"],"availableNow processes everything new, then stops: batch economics, streaming bookkeeping."],
 ["learn","Medallion layers","**Bronze**: raw as received. **Silver**: cleaned, deduplicated, conformed. **Gold**: business aggregates. **Lakeflow Declarative Pipelines** (formerly DLT) define these as tables with **expectations** (data quality rules)."],
 ["sort","Which layer?",{"Bronze":["Raw JSON from Auto Loader","Kafka payloads as-is"],"Silver":["Deduplicated payments with types fixed","CDC applied as upserts"],"Gold":["Daily GMV by merchant","Finance KPI table"]},"Each layer has one job."],
 ["match","Expectation action",[["EXPECT … (warn)","Keep the row, record the violation"],["ON VIOLATION DROP ROW","Drop bad rows"],["ON VIOLATION FAIL UPDATE","Stop the pipeline"]],"Choose by how bad the bad data is."]
]},
{t:"Compute & cost", sub:"Clusters, Photon, serverless", rounds:[
 ["learn","Pick the right compute","**Job compute**: created per job run, cheaper DBUs, terminates after. **All-purpose**: interactive notebooks, pricier. **SQL warehouses** (serverless) for BI. **Photon**: vectorised C++ engine that speeds up SQL/DataFrame work."],
 ["sort","Job compute or all-purpose?",{"Job compute":["Nightly ETL run","Scheduled pipeline"],"All-purpose":["Data scientist exploring in a notebook","Ad-hoc debugging session"]},"Never schedule production jobs on all-purpose clusters."],
 ["pick","A scheduled job runs on an all-purpose cluster that stays up all day. Biggest saving?",["Move it to job compute (or serverless jobs)","Enable Photon only","More workers","Z-ORDER"],0,"Job compute costs fewer DBUs and terminates."],
 ["tf","Cost facts",[["Autoscaling and auto-termination reduce idle cost.",true,"Set them on every cluster."],["Spot workers are risky for the driver.",true,"Keep the driver on-demand."],["Photon changes your query results.",false,"Same results, faster execution."]]]
]},
{t:"Boss: Broken medallion", boss:true, time:30, rounds:[
 ["pick","Bronze stream fails when a new field appears in JSON. Fix?",["Auto Loader schema evolution (addNewColumns) with rescued data","Hardcode the schema forever","Restart daily","Use CSV"],0,"Let the schema evolve safely."],
 ["pick","Silver table has thousands of tiny files and slow reads. Fix?",["OPTIMIZE / liquid clustering","VACUUM 0 hours","More partitions","RESTORE"],0,"Compact."],
 ["pick","Bad rows (amount < 0) reach gold. Fix?",["Expectations with DROP ROW or FAIL in the pipeline","More workers","Photon","Delta Sharing"],0,"Quality rules at the layer boundary."],
 ["pick","An overwrite wiped yesterday's gold table. Fix?",["RESTORE TABLE … VERSION AS OF previous","Rebuild from scratch","VACUUM","UNDROP SCHEMA"],0,"Delta time travel."],
 ["pick","Storage keeps growing after daily overwrites. Fix?",["VACUUM with default retention on a schedule","Shorter log retention only","Z-ORDER","More catalogs"],0,"Remove unreferenced files."],
 ["pick","Analysts in another company need live access without copies. Use…",["Delta Sharing","Export CSV daily","Clone","Auto Loader"],0,"Open sharing protocol."]
]}
]});

QUEST.more("databricks", [
{act:"Expert", t:"Delta transaction log deep", sub:"Actions, checkpoints, conflicts", rounds:[
 ["learn","What's inside a commit","Each «_delta_log/N.json» is a set of **actions**: «add» (file path, partition values, size, stats), «remove» (tombstone for a file), «metaData» (schema, partition columns, configuration), «protocol» (reader/writer versions + table features), «commitInfo», and «txn» (application transaction ids for idempotent writes).",null,null,`### Checkpoints
Every 100 commits by default («delta.checkpointInterval»), Delta writes a **Parquet checkpoint** with the full table state, plus «_last_checkpoint» pointing to it. Readers load the latest checkpoint, then replay later JSON commits. **V2 checkpoints** and **log compaction** keep this fast for huge logs.

### Data skipping stats
«add» actions carry min/max/null counts for the first 32 columns by default («delta.dataSkippingNumIndexedCols») or the columns listed in «delta.dataSkippingStatsColumns». Put filter columns early or list them explicitly — wide tables with filter columns at position 80 get no skipping.

### Idempotent writes
Streaming writes and «txnAppId»/«txnVersion» options record «txn» actions so a retried batch with the same (appId, version) is skipped — the basis for exactly-once foreachBatch into Delta.

### Conflict detection
Writers use optimistic concurrency. On conflict, Delta checks what the winning commit did: two blind appends succeed; an operation that read files another commit removed, or concurrent changes in the same partition under **WriteSerializable** (default) can fail with «ConcurrentAppendException» / «ConcurrentDeleteReadException». Partition-disjoint predicates or **row-level concurrency** (with deletion vectors and liquid clustering) reduce conflicts.`],
 ["match","Log action",[["add","A data file became part of the table (with stats)"],["remove","A data file was logically deleted"],["metaData","Schema and table configuration changed"],["protocol","Minimum reader/writer versions and features"],["txn","Application id + version for idempotent writes"]],"Every table state is a replay of these."],
 ["pick","A table filters on «event_type», which is column 57 of 120. Data skipping never helps. Fix?",["Set delta.dataSkippingStatsColumns to include event_type (and recompute stats)","VACUUM","More partitions","Photon"],0,"Stats are only collected for the first 32 columns by default."],
 ["num","A table is at version 1,234 with default checkpoint interval 100. Which checkpoint version does a reader load first?",1200,0,"version","The latest multiple of 100 ≤ 1,234 is 1,200; it then replays commits 1,201–1,234."],
 ["tf","Log truths",[["Two concurrent blind appends conflict.",false,"Appends are compatible."],["remove actions delete files from storage immediately.",false,"VACUUM deletes them after retention."],["Table features in the protocol action can block old clients.",true,"Readers must support required features."]]]
]},
{act:"Expert", t:"Layout: liquid clustering, DVs", sub:"Clustering, deletion vectors, predictive optimization", rounds:[
 ["learn","Liquid clustering","«CLUSTER BY (merchant_id, event_date)» clusters data incrementally using a space-filling curve. «OPTIMIZE» only reclusters what's needed, and keys can be changed later with «ALTER TABLE … CLUSTER BY» without rewriting history.",null,null,`### Why it replaces partitioning + Z-ORDER
- Partitioning by high-cardinality columns creates tiny files; partitioning by low-cardinality ones gives poor skipping on other columns.
- Z-ORDER is a **full rewrite** of the chosen partitions each time and has to be re-run.
- Liquid clustering adapts file sizes, handles skewed keys, clusters incrementally on write (for some writes) and on OPTIMIZE, and supports **clustering key changes**.
- «CLUSTER BY AUTO» lets Databricks pick keys from query history.

### Deletion vectors
With «delta.enableDeletionVectors», DELETE/UPDATE/MERGE mark rows deleted in a **deletion vector** (bitmap stored beside the file) instead of rewriting the Parquet file. Writes become much cheaper; reads apply the bitmap. «OPTIMIZE» / «REORG TABLE … APPLY (PURGE)» eventually rewrites files to drop deleted rows. Enables **row-level concurrency**.

### Predictive optimization
For Unity Catalog managed tables, Databricks can automatically run OPTIMIZE, VACUUM and ANALYZE when it predicts benefit — no hand-built maintenance jobs.`],
 ["sort","Liquid clustering or partitioning?",{"Liquid clustering":["Filters on merchant_id and date, merchant_id high cardinality","Access patterns change every quarter","Skewed keys (a few huge merchants)"],"Partitioning still reasonable":["Very large table (100s of TB) where whole partitions are dropped by date for retention"]},"Default to liquid; partition only with a clear reason."],
 ["pick","MERGE of 10,000 updated rows rewrites 400 GB of files each run. Quick fix?",["Enable deletion vectors (and liquid clustering on the merge key)","Z-ORDER daily","VACUUM 0 hours","Bigger cluster"],0,"Mark rows deleted instead of rewriting whole files."],
 ["match","Command",[["OPTIMIZE t","Compacts and (for liquid) clusters incrementally"],["REORG TABLE t APPLY (PURGE)","Rewrite files to physically remove soft-deleted rows"],["ALTER TABLE t CLUSTER BY (a)","Change clustering keys without full rewrite"],["ANALYZE TABLE t COMPUTE STATISTICS","Refresh optimizer stats"]],"Layout maintenance in four commands."],
 ["tf","Layout truths",[["Z-ORDER is incremental like liquid clustering.",false,"It rewrites the selected data each time."],["Deletion vectors make reads slightly more expensive until purged.",true,"Readers apply the bitmaps."],["Predictive optimization needs Unity Catalog managed tables.",true,"It operates on managed tables."]]]
]},
{act:"Expert", t:"Streaming on Databricks", sub:"Structured Streaming + Delta", rounds:[
 ["learn","Delta as a streaming source and sink","Reading a Delta table as a stream processes **new commits** in order; writing with a checkpoint gives exactly-once into Delta via idempotent «txn» actions.",null,null,`### Source options
- «maxFilesPerTrigger» / «maxBytesPerTrigger» cap each micro-batch.
- Upstream UPDATE/DELETE/MERGE breaks append-only streaming reads unless you set «skipChangeCommits» (ignore those commits) or read the **Change Data Feed** instead.

### Change Data Feed
«delta.enableChangeDataFeed = true» records row-level changes. Read with «readChangeFeed» (batch or stream): each row has «_change_type» (insert, update_preimage, update_postimage, delete), «_commit_version», «_commit_timestamp». The clean way to propagate silver → gold incrementally.

### CDC into Delta: AUTO CDC
In Lakeflow Declarative Pipelines, «AUTO CDC INTO» (formerly APPLY CHANGES INTO) handles out-of-order CDC events with «KEYS», «SEQUENCE BY», «APPLY AS DELETE WHEN» and SCD type 1 or 2 — no hand-written MERGE.

### State
Use the **RocksDB state store** for large stateful queries; set watermarks; prefer «availableNow» triggers for cost-efficient scheduled streaming.`],
 ["fill","Read only row-level changes from silver",'(spark.readStream\n  .option("___", "true")\n  .option("startingVersion", 120)\n  .table("silver.payments")\n  .filter("_change_type != \'___\'"))',["readChangeFeed","update_preimage"],["skipChangeCommits","insert","delete"],"Pre-images are usually dropped downstream."],
 ["pick","A stream reading a Delta table fails after someone ran DELETE on it. Options?",["skipChangeCommits or switch to Change Data Feed","Restart forever","Raise maxFilesPerTrigger","VACUUM"],0,"Append-only streaming reads don't accept rewrites."],
 ["order","AUTO CDC for out-of-order events",["Bronze receives Debezium events","Declare KEYS (payment_id)","SEQUENCE BY source LSN","APPLY AS DELETE WHEN op = 'd'","Store as SCD type 1 (or 2 for history)"],"Ordering by sequence fixes late events."],
 ["tf","Streaming truths",[["Change Data Feed exposes update pre- and post-images.",true,"update_preimage / update_postimage."],["Delta streaming sinks are exactly-once with a checkpoint.",true,"Idempotent txn actions."]]]
]},
{act:"Expert", t:"Governance & performance at scale", sub:"Unity Catalog deep, Photon, caching", rounds:[
 ["learn","Unity Catalog under the hood","UC sits between engines and storage: it checks permissions, then hands compute **short-lived, scoped credentials** to read the table's files. Lineage is captured from query plans automatically.",null,null,`### Securables and inheritance
Privileges granted on a catalog or schema **inherit** down to current and future objects. Common pattern: «GRANT USE CATALOG, USE SCHEMA, SELECT ON SCHEMA finance.mart TO analysts».

### Fine-grained controls
- **Row filters** and **column masks**: SQL UDFs attached to tables, evaluated per user/group.
- **ABAC** policies with governed tags apply masks/filters across many tables by tag.
- **Volumes** govern non-tabular files; **external locations** + **storage credentials** govern paths.

### Performance features
- **Photon**: vectorized C++ engine for SQL and DataFrame operations; biggest gains on scans, joins, aggregations; falls back to the JVM for unsupported operations (UDFs).
- **Disk cache** (formerly Delta cache): local SSD copies of remote Parquet for repeated reads on the same cluster.
- **Serverless SQL warehouses** with **Intelligent Workload Management** and result caching.
- **Predictive I/O** speeds up selective reads and updates with deletion vectors.

### Cost model
DBUs depend on compute type (Jobs < All-purpose), Photon, serverless vs classic, plus cloud VM costs for classic compute. Tag clusters and use system tables («system.billing.usage») to attribute spend.`],
 ["match","Need → feature",[["Hide card numbers except for the risk team","Column mask function"],["Merchants see only their rows","Row filter"],["Analysts get access to all future tables in a schema","Grant at schema level (inheritance)"],["Who consumed this table last week?","System tables + lineage"]],"Governance as code."],
 ["sort","Speeds up the workload or not?",{"Speeds up":["Photon on a large aggregation","Disk cache for repeated reads","Liquid clustering on filter columns"],"Little or no gain":["Photon on a Python UDF-heavy job","Disk cache for a one-off full scan"]},"Match the feature to the bottleneck."],
 ["pick","Where do you see DBU spend per job and user?",["system.billing.usage system tables","Spark UI","DESCRIBE HISTORY","Unity lineage only"],0,"System tables are queryable SQL."],
 ["tf","Governance truths",[["Schema-level grants apply to tables created later.",true,"Privileges inherit."],["Photon accelerates Python UDF logic itself.",false,"UDFs run outside Photon."]]]
]},
{act:"Expert", t:"Expert boss: Lakehouse at 3 AM", boss:true, time:45, rounds:[
 ["pick","MERGE jobs conflict with ConcurrentAppendException on the same table. Reduce conflicts?",["Row-level concurrency via deletion vectors + liquid clustering, or partition-disjoint predicates","Run on bigger clusters","VACUUM","Disable stats"],0,"Narrow what each commit touches."],
 ["pick","Filters on column 50 don't skip files. Fix?",["dataSkippingStatsColumns including it","More partitions","Photon","Disk cache"],0,"Collect stats where you filter."],
 ["pick","Gold must update incrementally from silver updates and deletes. Use…",["Change Data Feed","Full overwrite nightly","skipChangeCommits","Clone"],0,"Row-level change propagation."],
 ["pick","Debezium events arrive out of order in bronze. Silver needs correct latest state. Use…",["AUTO CDC with SEQUENCE BY source position","Plain append","OPTIMIZE","Z-ORDER"],0,"Sequence-aware upserts."],
 ["pick","Maintenance jobs for 900 tables are a mess. Simplify?",["Predictive optimization on UC managed tables","One cron per table","Disable OPTIMIZE","More VACUUM"],0,"Let the platform maintain them."],
 ["pick","Streaming read of a Delta table crashes after a GDPR DELETE upstream. Fix?",["skipChangeCommits or CDF","Restart from scratch","Bigger trigger","Photon"],0,"Handle rewrites explicitly."],
 ["pick","Readers on an old runtime can't open a table after enabling new features. Why?",["Protocol/table features require newer readers","Corrupt log","Wrong catalog","Missing checkpoint"],0,"Check the protocol action."]
]}
]);

QUEST.story("databricks", {title:"The cluster that never sleeps", icon:"🔥", place:"Tue 10 AM · cost review", setup:"Databricks spend doubled. Most of it comes from all-purpose clusters running jobs, and a MERGE job that rewrites a whole table every hour.",
 meters:[["dbu","Monthly DBUs"," k",180,80,"low",200],["merge","MERGE runtime"," min",48,8,"low",60],["trust","Finance trust","%",40,70,"high",100]],
 beats:[["arjun","Databricks bill doubled. Why?"],["ui","Cluster 'shared-analytics' (all-purpose, 20 workers): up 24×7, runs 14 scheduled jobs\nJob 'orders_merge': MERGE INTO orders (2.1B rows) USING updates ON id — rewrites 1,940 files every hour"],
  ["q","Why are scheduled jobs on an all-purpose cluster a problem?",[["All-purpose compute costs more DBUs than job compute, and the cluster stays up between jobs",1,"Job clusters spin up for the run and terminate, at a lower DBU rate.","Taking a taxi everywhere and keeping it waiting all day."],["All-purpose clusters can't run jobs",0,"They can; it's just costly.","The taxi works, it's just expensive."]]],
  ["q","Why does the MERGE rewrite 1,940 files every hour?",[["Updates touch ids scattered across every file, so copy-on-write rewrites them all; Z-order/liquid clustering by id and deletion vectors limit what's rewritten",1,"Clustering co-locates ids so a MERGE touches few files; deletion vectors mark deleted rows without rewriting files.","Updating one line in every book means reprinting every book."],["MERGE is always slow",0.5,"It's slow when it can't skip files.","Some updates are cheap if pages are organised."]]],
  ["q","What else cuts cost safely?",[["Auto-termination on interactive clusters, cluster policies, and Photon/serverless for SQL workloads",1,"Guardrails stop idle spend; policies cap sizes.","Taxis that leave after 10 idle minutes."],["Turn off all clusters at night, including streaming",0,"Breaks production streaming.","Switching off the fridge at night."]]],
  ["arjun","DBUs down 55%, MERGE in 7 minutes."]],
 learned:["Jobs on job compute; interactive gets auto-termination.","MERGE cost = files touched; cluster and use deletion vectors.","Policies keep spend in check."]});
QUEST.mock("databricks", {title:"Databricks & Delta round", who:"ana", intro:"Ana here. Let's talk Databricks and Delta Lake.", setup:"Ana's team runs a Databricks lakehouse.",
 qs:[["What is the medallion architecture?","**Bronze**: raw data as ingested (append, replayable). **Silver**: cleaned, deduplicated, conformed, joined. **Gold**: business-level aggregates and marts. Each layer is a set of Delta tables; quality checks between layers.",[["Bronze raw, silver cleaned/conformed, gold business-ready; quality checks between",1,"Correct."],["Three copies for backup",0,"Not backups."],["Bronze/silver/gold are cluster sizes",0,"No."]]],
  ["How does Delta Lake provide ACID?","A **transaction log** («_delta_log») of JSON commits plus Parquet checkpoints. Writers commit by creating the next log file atomically (optimistic concurrency); readers read a consistent version. Enables time travel, schema enforcement and MERGE.",[["An ordered transaction log of commits with optimistic concurrency; readers see a consistent version",1,"Mechanism."],["Delta locks the table",0,"Optimistic, not locking."],["It uses a database underneath",0,"Files + log on object storage."]]],
  ["What does Unity Catalog give you?","Central **governance** across workspaces: three-level namespace (catalog.schema.table), fine-grained access (row/column), lineage, audit, and managing external locations and credentials in one place.",[["Central governance: namespaces, fine-grained access, lineage, audit, external locations",1,"Complete."],["A faster query engine",0,"That's Photon."],["A BI tool",0,"No."]]],
  ["Streaming in Databricks: Auto Loader vs Structured Streaming from Kafka?","**Auto Loader** («cloudFiles») incrementally ingests **new files** from cloud storage, with scalable file discovery and schema inference/evolution. **Structured Streaming from Kafka** reads events directly. Both checkpoint progress; Delta Live Tables can declare either with expectations.",[["Auto Loader for files landing in storage, Kafka source for event streams; both checkpointed",1,"Right tool per source."],["Auto Loader reads Kafka",0,"It reads files."],["Streaming doesn't checkpoint",0,"It must."]]]],
 learned:["Medallion layers.","Delta log = ACID on object storage.","Unity Catalog for governance."]});
