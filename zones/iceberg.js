QUEST.zone("iceberg", {
mission:["priya","Our lake tables are Iceberg. Spark, Flink, Trino and Athena all write and read them safely at once. Learn the metadata tree, then keep a busy table healthy."],
levels:[
{t:"The metadata tree", sub:"Catalog to data files", rounds:[
 ["learn","Iceberg is metadata","A table is a tree: the **catalog** points to the current **metadata.json**, which lists **snapshots**. Each snapshot has a **manifest list**, which points to **manifests**, which list **data files** with per-column stats.",["Catalog pointer","metadata.json","Manifest list (one per snapshot)","Manifests","Data files (Parquet)"]],
 ["order","Order the tree from top to bottom",["Catalog","metadata.json","Manifest list","Manifest file","Data file"],"Readers walk down this tree to plan scans."],
 ["learn","Commits are an atomic swap","A writer writes new data files and metadata, then asks the catalog to swap the pointer from the old metadata.json to the new one **only if it's still current**. If another writer won, it retries on top (optimistic concurrency)."],
 ["pick","Two Spark jobs append to the same table at once. What happens?",["One corrupts the table","Both succeed; the loser retries its commit on the new snapshot","Both fail","The second blocks for an hour"],1,"Appends don't conflict, so the retry succeeds."],
 ["match","Which file holds what?",[["metadata.json","Schema, partition spec, snapshot list, properties"],["Manifest list","Manifests of one snapshot + partition summaries"],["Manifest","Data/delete file paths with column min/max stats"],["Data file","The rows, in Parquet/ORC/Avro"]],"Stats at every level let readers skip work."],
 ["tf","Metadata facts",[["Iceberg needs to LIST S3 directories to plan a query.",false,"Files are tracked in manifests; no listing needed."],["Manifests store min/max per column.",true,"Used to skip files."],["Every commit creates a new snapshot.",true,"That's what enables time travel."]]]
]},
{t:"Partitioning", sub:"Hidden, evolvable", rounds:[
 ["learn","Hidden partitioning","Partition by **transforms** of columns: «days(ts)», «hours(ts)», «bucket(16, id)», «truncate(4, code)». Users filter on «ts» and Iceberg prunes automatically; no separate dt column to keep in sync."],
 ["match","Pick the transform",[["Filter by time ranges on created_at","days(created_at)"],["Spread a high-cardinality join key","bucket(32, merchant_id)"],["Group by string prefix","truncate(3, sku)"],["Low-cardinality category","identity(country)"]],"Transforms make partitions automatic."],
 ["learn","Partition evolution","Change the spec («ALTER TABLE … ADD PARTITION FIELD hours(ts)») without rewriting data. Old files keep the old spec, new files use the new one; planning handles both."],
 ["pick","Traffic grew 50×. You want hourly instead of daily partitions. What must you rewrite?",["The whole table","Nothing: evolve the spec; new data uses hours","Only the last month","All manifests by hand"],1,"Partition evolution is metadata-only."],
 ["fill","Create a table with hidden partitions",'CREATE TABLE lake.pay.payments (id bigint, merchant_id bigint, amount decimal(18,2), created_at timestamp)\nUSING iceberg\nPARTITIONED BY (___(created_at), ___(16, merchant_id));',["days","bucket"],["month_of","hash","partition"],"Readers just filter on created_at."],
 ["tf","Partition facts",[["Users must filter on a derived dt column to prune.",false,"Filtering on the source column is enough."],["Too-fine partitions create small files.",true,"Hourly partitions on a small table are a trap."],["Schema evolution uses column IDs, not names.",true,"So renames and reorders are safe."]]]
]},
{t:"Snapshots & time travel", sub:"History, branches", rounds:[
 ["learn","Time travel and rollback","Query an old snapshot: «SELECT … FOR VERSION AS OF 123» or «FOR TIMESTAMP AS OF '…'». Roll back with «CALL system.rollback_to_snapshot('t', id)». Data isn't copied; old snapshots still reference their files."],
 ["learn","Branches and tags","A **tag** names a snapshot (e.g. 'eom-2026-10') and can have its own retention. A **branch** is an independent line of snapshots: write to an audit branch, validate, then fast-forward main (write-audit-publish)."],
 ["order","Write-audit-publish with a branch",["Create branch 'audit'","Write the new batch to the audit branch","Run data quality checks on the branch","Fast-forward main to the audit branch"],"Readers of main never see bad data."],
 ["pick","A bad job overwrote yesterday's partition. Fastest recovery?",["Restore from backup","Rollback to the previous snapshot","Re-run the last month","Delete the table"],1,"Rollback is a metadata operation."],
 ["tf","Snapshot facts",[["Time travel only works while old snapshots aren't expired.",true,"expire_snapshots deletes their unreferenced files."],["Tags can keep a snapshot past normal expiry.",true,"Set max-ref-age on the tag."],["Each snapshot copies all data files.",false,"Snapshots share files."]]]
]},
{t:"Row-level changes", sub:"COW, MOR, deletes", rounds:[
 ["learn","Copy-on-write vs merge-on-read","**COW**: an update rewrites every affected data file. Fast reads, slow writes. **MOR**: writes small **delete files** (position or equality deletes; **deletion vectors** in v3) and merges at read time. Fast writes, reads pay until compaction."],
 ["sort","COW or MOR?",{"Copy-on-write":["Rare large batch updates","Read-heavy dashboards"],"Merge-on-read":["Streaming CDC upserts every minute","Frequent small deletes (GDPR)"]},"Set write.update.mode / write.delete.mode / write.merge.mode per table."],
 ["match","Delete file types",[["Position delete","File path + row position to skip"],["Equality delete","Rows matching these column values are deleted"],["Deletion vector (v3)","Compact bitmap of deleted positions per data file"]],"Equality deletes are cheap to write (Flink CDC) but expensive to read."],
 ["fill","Upsert CDC changes",'MERGE INTO lake.pay.payments t\nUSING changes s ON t.id = s.id\nWHEN MATCHED AND s.op = \'d\' THEN ___\nWHEN MATCHED THEN UPDATE SET *\nWHEN NOT MATCHED THEN ___ *',["DELETE","INSERT"],["UPSERT","REPLACE","TRUNCATE"],"One MERGE handles inserts, updates and deletes."],
 ["pick","Reads on a MOR table got 5× slower over a week of CDC. Why?",["Too many delete files to merge at read time","Snapshots expired","Wrong partition spec","Catalog down"],0,"Compact with rewrite_data_files (and rewrite_position_delete_files)."]
]},
{t:"Maintenance", sub:"Keep tables healthy", rounds:[
 ["learn","The four chores","**rewrite_data_files**: compact small files (and apply deletes). **expire_snapshots**: drop old snapshots and their unreferenced files. **rewrite_manifests**: regroup manifests for faster planning. **remove_orphan_files**: delete files no snapshot references (e.g. from failed writes)."],
 ["match","Symptom → procedure",[["Thousands of 2 MB files","rewrite_data_files"],["Storage grows forever","expire_snapshots"],["Query planning slow, many manifests","rewrite_manifests"],["Junk files from crashed jobs","remove_orphan_files"]],"Schedule all four."],
 ["bug","Which maintenance call is dangerous?",["CALL system.rewrite_data_files(table => 'pay.payments')","CALL system.expire_snapshots(table => 'pay.payments', older_than => TIMESTAMP '2026-11-10')","CALL system.remove_orphan_files(table => 'pay.payments', older_than => now())","CALL system.rewrite_manifests('pay.payments')"],2,"With older_than = now(), files from in-flight writes look like orphans and get deleted. Keep the default 3-day safety window."],
 ["learn","Catalog choices","Glue, Hive Metastore, JDBC, **REST catalogs** (Polaris, Unity, Nessie, S3 Tables, Lakekeeper). The REST spec lets any engine use any catalog and enables server-side features like credential vending."],
 ["tf","Maintenance facts",[["Compaction creates a new snapshot.",true,"A 'replace' snapshot with the same data."],["Expiring snapshots limits time travel.",true,"You can't go back past the oldest kept snapshot."],["Compaction can conflict with concurrent writers.",true,"Use partial progress and target partitions to reduce conflicts."]]]
]},
{t:"Boss: The 3 AM table", boss:true, time:30, rounds:[
 ["pick","A streaming job writes 40,000 small files a day. Fix?",["Schedule rewrite_data_files + tune target file size","Expire snapshots","Drop partitions","Switch to CSV"],0,"Compaction."],
 ["pick","S3 storage for the table is 10× the live data. Fix?",["expire_snapshots + remove_orphan_files","rewrite_manifests","More partitions","Disable MOR"],0,"Old snapshots keep old files alive."],
 ["pick","A bad deploy wrote wrong amounts an hour ago. Fix?",["rollback_to_snapshot","Re-ingest a month","Truncate table","Change partition spec"],0,"Metadata-only rollback."],
 ["pick","Analysts must never see unvalidated data. Use…",["Write-audit-publish with a branch","Time travel","Hidden partitioning","Equality deletes"],0,"Validate on a branch, then publish."],
 ["pick","Planning takes 40 s; the table has 60,000 manifests. Fix?",["rewrite_manifests","rewrite_data_files only","More executors","Bucket partitioning"],0,"Fewer, well-clustered manifests."],
 ["pick","Need hourly partitions from today on, without a rewrite. Use…",["Partition evolution","CTAS a new table","Rename columns","Branches"],0,"Spec changes are metadata-only."]
]}
]});
