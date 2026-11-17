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
