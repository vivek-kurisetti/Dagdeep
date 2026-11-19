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

QUEST.more("iceberg", [
{act:"Expert", t:"Scan planning", sub:"Pruning at every level", rounds:[
 ["learn","Three layers of pruning","Iceberg prunes before reading a single data byte: **manifest list** partition summaries skip whole manifests, **manifest entries** with per-column stats skip files, then Parquet **row-group stats** skip chunks inside files.",["Snapshot → manifest list","Partition summaries prune manifests","Column bounds prune data files","Residual filter + row-group stats inside Parquet","Read the remaining rows"],null,`### What's stored where
- **Manifest list** (one per snapshot): for each manifest, the partition spec id, added/existing/deleted file counts, and **partition field summaries** (lower/upper bound, contains-null). A filter «created_at >= '2026-11-18'» on a «days(created_at)» spec drops manifests whose day range doesn't overlap.
- **Manifest** entries: for each data file — path, partition tuple, record count, file size, and per-column **value counts, null counts, NaN counts, lower and upper bounds** (truncated for long strings, «write.metadata.metrics.default» = truncate(16)).
- **Residual filter**: after partition pruning, whatever predicate can't be answered from partitions is evaluated per row by the reader.

### Make pruning effective
- **Sort data** on common filter columns (table sort order or «rewrite_data_files» with sort / z-order). Random order makes every file's min/max span the whole range, so stats prune nothing.
- Keep column metrics for filter columns; for very wide tables, disable metrics on columns nobody filters to keep manifests small («write.metadata.metrics.column.<col>=none»).
- **Split planning**: files are split into tasks of «read.split.target-size» (128 MB) and small files are combined.

### Debug with metadata tables
«SELECT file_path, record_count, lower_bounds, upper_bounds FROM db.t.files» and «db.t.manifests» show exactly why a query read what it read.`],
 ["num","A snapshot has 40 manifests. Partition summaries keep 3 manifests of 500 files each; column bounds prune 90% of those files. Files read?",150,0,"files","3 × 500 = 1,500 candidates × 10% = 150 files."],
 ["pick","Filters on merchant_id read every file even though stats exist. Most likely cause?",["Data isn't sorted/clustered by merchant_id, so every file's min/max spans all merchants","Too many snapshots","Wrong catalog","v1 table"],0,"Stats only prune when values are clustered. Sort or z-order the data."],
 ["match","Metadata table → question it answers",[["db.t.snapshots","Which commits happened and what operation they were"],["db.t.files","Per-file record counts and column bounds"],["db.t.manifests","How many manifests and how many files each tracks"],["db.t.partitions","Rows and files per partition"],["db.t.refs","Branches and tags"]],"SQL on the table's own metadata."],
 ["tf","Planning truths",[["Iceberg planning needs S3 LIST calls on partition folders.",false,"Files come from manifests."],["Long strings are truncated in column bounds.",true,"Default metrics mode truncate(16)."],["A residual filter is applied by readers after partition pruning.",true,"For predicates partitions can't answer."]]]
]},
{act:"Expert", t:"Commits, sequence numbers & conflicts", sub:"Optimistic concurrency in depth", rounds:[
 ["learn","Sequence numbers order everything","In format v2+, every snapshot gets a **sequence number**; each added file gets the **data sequence number** of its commit. Delete files apply only to data files with a **lower** data sequence number.",null,null,`### Why sequence numbers matter
- An **equality delete** written at sequence 12 («id = 5») must not delete a row with id 5 inserted later at sequence 15. Rule: equality deletes apply to data files with data sequence number **strictly less than** the delete's.
- **Position deletes** reference specific files and positions; they apply to data files with data sequence number **≤** the delete's.
- Compaction rewrites files but **keeps** the original data sequence numbers where needed so older deletes still line up.

### The commit protocol
1. Writer reads the current metadata (snapshot N), writes data files and new manifests.
2. It creates metadata for snapshot N+1 and asks the catalog to atomically swap «current → N+1» **only if current is still N**.
3. If another commit won, the writer **re-reads**, re-applies its changes on top of the new snapshot (re-using already-written data files and manifests where valid), **validates** for conflicts, and retries («commit.retry.num-retries», default 4, with backoff).

### Conflict validation
- Appends never conflict with appends.
- An **overwrite / delete / MERGE** checks whether concurrent commits added or deleted files it depends on. With **serializable** isolation (default), new data files matching its filter cause a conflict. **Snapshot** isolation only fails on conflicting deletes — more concurrency, weaker guarantees.
- Compaction vs streaming writer: compaction fails if a concurrent commit removed or position-deleted files it is rewriting. Use «partial-progress.enabled» so committed groups survive.`],
 ["pick","Equality delete «id = 5» was committed at sequence 12. Does it delete an id=5 row inserted at sequence 15?",["Yes","No — equality deletes only apply to lower data sequence numbers","Only after compaction","Only in v1"],1,"Later inserts aren't affected."],
 ["order","A commit that loses the race",["Writer prepares snapshot N+1 based on N","Catalog swap fails: current is now N+1' from another writer","Writer refreshes metadata to N+1'","Validates its changes against the new commits","Retries the swap to N+2"],"Data files are reused; only metadata is rebuilt."],
 ["sort","Conflict under serializable isolation?",{"Conflicts":["MERGE on dt=2026-11-18 while a stream appends to dt=2026-11-18","DELETE WHERE merchant=7 while another job deletes the same rows","Compaction rewriting files another commit just deleted"],"No conflict":["Two streaming jobs appending","MERGE on dt=2026-11-18 while another job appends to dt=2026-11-10","Expire snapshots while appends run"]},"Partition-aligned filters reduce conflicts."],
 ["fill","Make compaction resilient next to a busy writer",'CALL system.rewrite_data_files(\n  table => \'pay.payments\',\n  where => \'dt < current_date\',\n  options => map(\'___\', \'true\', \'partial-progress.max-commits\', \'10\',\n                 \'___\', \'536870912\'))',["partial-progress.enabled","target-file-size-bytes"],["isolation","snapshot.lock","max-file-size"],"Compact closed partitions and commit in groups."],
 ["tf","Commit truths",[["Appends from two writers conflict under serializable isolation.",false,"Appends don't conflict."],["A retried commit rewrites its data files.",false,"It reuses them; only metadata changes."],["Compacting only cold partitions avoids most conflicts with streaming writes.",true,"Writers touch the hot partition."]]]
]},
{act:"Expert", t:"Format versions & Puffin", sub:"v1, v2, v3", rounds:[
 ["learn","What each spec version added","Format versions are table-level («format-version» property). Upgrading is metadata-only, but every engine writing the table must support the new version.",null,null,`| Version | Key additions |
|---|---|
| v1 | Analytic tables: snapshots, manifests, hidden partitioning, schema evolution |
| v2 | **Row-level deletes** (position + equality delete files), sequence numbers, stricter writer rules |
| v3 | **Deletion vectors** (binary bitmaps in Puffin files, at most one per data file), **row lineage** (row ids + last-updated sequence numbers), **variant** type for semi-structured data, geometry/geography types, **default values** for new columns, nanosecond timestamps, multi-argument transforms |

### Deletion vectors vs position delete files
Position delete files can pile up: many small files, each listing (path, pos) pairs, which readers must merge. A **deletion vector** is a compact Roaring bitmap per data file; v3 allows only one per data file, so a new delete **replaces** the previous vector by merging. Reads get much cheaper for frequent-update tables.

### Puffin files
Puffin is a container for **blobs** attached to snapshots: deletion vectors (v3) and statistics such as **Theta sketches** for column NDV (number of distinct values), which cost-based optimizers in Trino/Spark use for join ordering.

### Row lineage
v3 tracks a stable «_row_id» and «_last_updated_sequence_number» per row, so incremental consumers can tell which rows changed — the foundation for efficient change feeds.`],
 ["match","Feature → version",[["Position and equality deletes","v2"],["Deletion vectors","v3"],["Hidden partitioning","v1"],["Variant type for semi-structured data","v3"],["Sequence numbers","v2"]],"Check engine support before upgrading."],
 ["pick","A MOR table updated every minute has 30 position-delete files per data file; reads crawl. Best long-term option on modern engines?",["Upgrade to v3 deletion vectors (and keep compacting)","Switch to v1","Raise split size","Add partitions"],0,"One bitmap per data file instead of many delete files."],
 ["tf","Version truths",[["Upgrading format version rewrites all data files.",false,"It's a metadata change."],["Theta sketches in Puffin help cost-based optimizers.",true,"NDV estimates."],["v3 allows many deletion vectors per data file.",false,"At most one; new deletes merge into it."]]]
]},
{act:"Expert", t:"Streaming & CDC into Iceberg", sub:"Flink upserts, distribution, sort", rounds:[
 ["learn","Upserts from Flink","Flink's Iceberg sink can run in **upsert mode** with **identifier fields** (primary key). Each change writes the new row plus an **equality delete** on the key, so readers see only the latest row.",null,null,`### The cost model
- Writes are cheap: no read-before-write.
- Every Flink **checkpoint** is an Iceberg **commit**: a checkpoint every 30 s gives 2,880 commits/day per job, each with new small data and delete files.
- Equality deletes must be applied at read time by matching keys against older files — expensive until compaction converts them into position deletes / rewrites files.

### Keeping it healthy
- Commit less often (e.g. checkpoints every 1–5 minutes) if freshness allows.
- Schedule «rewrite_data_files» (with delete-file thresholds) and «rewrite_position_delete_files».
- Expire snapshots aggressively on high-frequency tables («history.expire.max-snapshot-age-ms»).
- Many teams instead buffer CDC into a raw append-only table and run a periodic Spark **MERGE** into the curated table: fewer commits, no equality deletes.

### Write distribution and order
«write.distribution-mode»: **none** (each task writes whatever it has — many small files per partition), **hash** (shuffle by partition so each partition is written by few tasks — the usual default for partitioned tables), **range** (range-partition by sort order — best clustering, costs a sample + shuffle). Set a table **sort order** («ALTER TABLE … WRITE ORDERED BY merchant_id, created_at») so files are clustered for pruning.`],
 ["num","A Flink job checkpoints (and commits) every 30 seconds. Commits per day?",2880,0,"commits","86,400 ÷ 30 = 2,880 snapshots/day — plan expiry and compaction accordingly."],
 ["match","Setting → effect",[["write.distribution-mode=hash","Few files per partition per commit"],["write.distribution-mode=range","Globally clustered by sort order"],["WRITE ORDERED BY merchant_id","Tight min/max per file for pruning"],["identifier fields + upsert mode","Equality deletes on the key for each change"]],"Distribution decides file counts; order decides pruning."],
 ["sort","Good or bad for a 1-minute CDC upsert table?",{"Good":["Hourly rewrite_data_files on recent partitions","Expire snapshots older than 1 day","Raw append + periodic MERGE"],"Bad":["Checkpoint every 5 s","Never compacting equality deletes","write.distribution-mode=none on a partitioned table"]},"Streaming freshness costs maintenance."],
 ["tf","Streaming truths",[["Every Flink checkpoint creates an Iceberg snapshot.",true,"Commit on checkpoint."],["Equality deletes are cheap to read.",false,"Readers must match keys across older files."],["Range distribution requires a shuffle.",true,"Plus sampling for ranges."]]]
]},
{act:"Expert", t:"Catalogs & metadata hygiene", sub:"REST spec, metadata growth", rounds:[
 ["learn","The REST catalog spec","An Iceberg **REST catalog** is an HTTP API (OpenAPI spec) for loading and committing tables. Engines talk REST; the server owns storage of metadata pointers and can add features engines don't need to implement.",null,null,`### What REST enables
- **Server-side commits**: clients send requirements + updates («assert-current-snapshot-id», «add-snapshot»…); the server checks and applies atomically — no client needs direct write access to the pointer.
- **Credential vending**: the catalog returns short-lived, table-scoped storage credentials, so engines need no broad S3 permissions.
- **Multi-table transactions** and **views** in implementations that support them.
- One catalog for Spark, Flink, Trino, Snowflake, DuckDB, PyIceberg…

Implementations: Apache Polaris, Lakekeeper, Gravitino, Unity Catalog's Iceberg REST, AWS Glue's Iceberg REST endpoint, S3 Tables, Nessie (with git-like branches across tables).

### Metadata growth
- Each commit writes a new «metadata.json» that contains the snapshot list and history. Old ones pile up: set «write.metadata.delete-after-commit.enabled=true» and «write.metadata.previous-versions-max» (100).
- Manifests accumulate: «rewrite_manifests» regroups them (ideally by partition) — critical after many small streaming commits.
- Snapshots: «expire_snapshots» removes snapshots and the files only they referenced.
- Orphans: «remove_orphan_files» with a safe «older_than» (≥ 3 days) for files from failed writes.`],
 ["order","Healthy maintenance order for a busy table",["rewrite_data_files on cold partitions","rewrite_position_delete_files","expire_snapshots older than the retention window","rewrite_manifests","remove_orphan_files older than 3 days"],"Compact first, then expire so old files can be deleted, then tidy metadata."],
 ["pick","metadata/ folder holds 90,000 metadata.json files. Fix?",["write.metadata.delete-after-commit.enabled + previous-versions-max","rewrite_data_files","More partitions","Bigger split size"],0,"Old metadata versions are kept by default."],
 ["match","Catalog capability",[["Credential vending","Engine gets short-lived, table-scoped storage creds"],["assert-current-snapshot-id","Server-side optimistic concurrency check"],["Nessie branches","Git-like commits across many tables"],["S3 Tables","Managed tables with automatic maintenance"]],"The catalog is becoming the control plane."],
 ["tf","Catalog truths",[["Any engine with REST support can share one Iceberg catalog.",true,"That's the point of the spec."],["remove_orphan_files is safe with older_than = now().",false,"In-flight writes look like orphans."]]]
]},
{act:"Expert", t:"Expert boss: Lakehouse incident", boss:true, time:45, rounds:[
 ["pick","Queries filter by merchant_id but read all files; table is partitioned by day only. Fix?",["Sort/z-order data by merchant_id via rewrite_data_files and set a write order","Partition by merchant_id","More manifests","Expire snapshots"],0,"Cluster for stats-based pruning."],
 ["pick","Nightly MERGE fails repeatedly with conflicts against a streaming append to the same day. Fix?",["MERGE filter aligned to closed partitions / schedule after the day closes","Disable isolation","Run more retries forever","Drop the stream"],0,"Avoid overlapping writes."],
 ["pick","Flink upsert table reads got 10× slower in a week. Fix?",["Compact equality deletes (rewrite_data_files) and lengthen checkpoint interval","Add partitions","Upgrade Flink only","Remove identifier fields"],0,"Delete files pile up."],
 ["pick","Compaction keeps failing because a streaming writer commits every minute. Fix?",["partial-progress.enabled and compact cold partitions","Stop the stream daily","Isolation=none","Bigger target size"],0,"Commit groups independently."],
 ["pick","Planning takes 50 s; 120,000 manifests from streaming commits. Fix?",["rewrite_manifests","rewrite_data_files only","More executors","Format v1"],0,"Regroup manifests."],
 ["pick","Engines need different S3 permissions per table without broad bucket access. Use…",["REST catalog with credential vending","IAM user per analyst","Public bucket","Hive metastore"],0,"Scoped, short-lived credentials."],
 ["pick","An equality delete at seq 20 seems not to remove a row inserted at seq 25. Bug?",["No — by design it applies only to older data","Yes, file a bug","Compaction broke it","v3 only"],0,"Sequence-number semantics."]
]}
]);

/* ===== On-call desk: Iceberg incident ===== */
QUEST.cases("iceberg", [
{
 title:"Queries spend 3 minutes just planning", icon:"🧊", sev:2, clock:"09:40", channel:"inc-2336-lake-payments-slow", svc:"lake.payments · Iceberg on S3 + Trino", need:4, uiName:"Trino UI",
 terms:[["Snapshot","A version of an Iceberg table. Every commit (each streaming micro-batch, too) creates one."],["metadata.json","The table's root file: schema, partition spec and the list of snapshots. Rewritten on every commit."],["Manifest list / manifest","Files that index the data files: a snapshot points to a manifest list, which points to manifests, which point to data files."],["Query planning","Before reading data, the engine reads metadata to decide which files to scan."],["expire_snapshots","Maintenance that removes old snapshots (and files only they reference)."],["rewrite_manifests / rewrite_data_files","Maintenance that compacts many small manifests or data files into fewer big ones."],["IAM role","The AWS identity a job runs as. It decides which S3 paths and actions the job may use."]],
 deep:[{"t": "How Iceberg plans a query", "md": "1. Read the current **metadata.json** (schema, specs, snapshot list).\n2. Read the current snapshot's **manifest list**: one entry per manifest, with partition value ranges.\n3. Prune manifests by partition range, then read the remaining **manifests**: one entry per data file, with column min/max stats.\n4. Prune data files by stats → produce splits.\n\nEvery step scales with metadata size: more snapshots = bigger metadata.json; more manifests = more files to read. Streaming without maintenance grows both forever."}, {"t": "Iceberg maintenance checklist", "md": "| Procedure | Why | Typical schedule |\n|---|---|---|\n| «expire_snapshots» | Shrinks metadata.json, frees data files only old snapshots used | Daily, keep N days for time travel |\n| «rewrite_data_files» | Compacts small files, applies sort order | Hourly-daily on streaming tables |\n| «rewrite_manifests» | Clusters manifests by partition for faster planning | Daily-weekly |\n| «remove_orphan_files» | Deletes files no snapshot references (failed writes) | Weekly, with a safety window |\n\nAlso set «write.metadata.delete-after-commit.enabled=true» and «write.metadata.previous-versions-max» so old metadata.json files don't pile up."}],
 impact:{"label": "Dashboards timed out", "ic": "📉", "rate": 0.2, "start": 86},
 pager:`[y]WARN[/y]  trino  p95 query time on lake.payments [r]3m 41s[/r] (was 9s)
planning  [r]3m 22s[/r] of that is "planning" before any split is scheduled
since     creeping up for months; dashboards started timing out this week
impact    analyst dashboards time out`,
 brief:"«lake.payments» is an Iceberg table fed by a Flink streaming job that commits every **30 seconds**. A nightly Airflow job (iceberg_maintenance) is supposed to keep it tidy. Back in March the platform team rotated IAM roles for all batch jobs.",
 slack:[
  {at:0, who:"meera", t:"Every dashboard on lake.payments is timing out since this morning. Honestly it's been getting slower for months; we just lived with it."},
  {at:5, who:"priya", t:"Planning time, not execution time, is the interesting bit. Planning reads **metadata**. How big is this table's metadata?", cmd:"aws s3 ls s3://payu-lake/payments/metadata/ --summarize --human-readable"},
  {at:50, who:"dev", t:"Want me to add Trino workers? We have budget."},
  {on:"metabig", who:"priya", t:"A 480 MB metadata.json is a lot. How many snapshots are we keeping? Query the metadata tables.", cmd:"trino -e \"select count(*), min(committed_at) from lake.\\\"payments$snapshots\\\"\""},
  {on:"snaps", who:"ravi", t:"Snapshots since March?! Isn't iceberg_maintenance supposed to expire those every night? Check the Airflow task logs.", cmd:"airflow tasks logs iceberg_maintenance expire_snapshots --latest"},
  {on:"denied", who:"dev", t:"Ah. That role was rotated in the March security hardening. Let me check what the new policy allows…", cmd:"aws iam get-role-policy --role-name lake-maintenance --policy-name s3-access"}
 ],
 hints:["Planning time comes from reading metadata: metadata.json, manifest lists and manifests. Check how big they are.","Count the table's snapshots and manifests using Iceberg metadata tables («payments$snapshots», «payments$manifests»).","Snapshots should be expired nightly. Why isn't the maintenance job doing it? Read its logs."],
 term:{host:"lake-ops", user:"oncall", suggest:["aws s3 ls s3://payu-lake/payments/metadata/ --summarize --human-readable","airflow dags list-runs -d iceberg_maintenance"],
  cmds:[
  {m:["aws s3 ls s3://payu-lake/payments/metadata"], out:`2026-11-18 09:39:41  [r]481.2 MiB[/r] 01274812-7f1e...-metadata.json
2026-11-18 09:39:41   [y]1.9 MiB[/y]  snap-88120419...-manifest-list.avro
[d]... 412,551 more objects ...[/d]
Total Objects: [r]412553[/r]
   Total Size: 1.1 TiB`, clue:"metabig", unlock:["trino -e \"select count(*), min(committed_at) from lake.\\\"payments$snapshots\\\"\""]},
  {m:["trino -e \"select count(*), min(committed_at)","trino -e \"select count(*) from lake.\\\"payments$snapshots"], out:` _col0  |        _col1
--------+-------------------------
 [r]742180[/r] | [r]2026-03-02 00:00:31 UTC[/r]
[d](1 row)  -- expected: ~2 days × 2,880 commits/day ≈ 5,760[/d]`, clue:"snaps", unlock:["trino -e \"select count(*) from lake.\\\"payments$manifests\\\"\"","airflow tasks logs iceberg_maintenance expire_snapshots --latest"]},
  {m:["trino -e \"select count(*) from lake.\\\"payments$manifests"], out:` _col0
--------
 [r]96214[/r]   [d]-- manifests in the current snapshot (healthy tables: tens to hundreds)[/d]`, clue:"manifests"},
  {m:["airflow dags list-runs"], out:`dag_id              run_id                       state
iceberg_maintenance scheduled__2026-11-17T20:30  [g]success[/g]
iceberg_maintenance scheduled__2026-11-16T20:30  [g]success[/g]
iceberg_maintenance scheduled__2026-11-10T20:30  [g]success[/g]
[d](all green for 30 days)[/d]`, note:"All green… but green only means the DAG didn't raise. Read the task logs to see what it actually did.", unlock:["airflow tasks logs iceberg_maintenance expire_snapshots --latest"]},
  {m:["airflow tasks logs iceberg_maintenance"], out:`[2026-11-17 20:31:02] INFO  Running CALL lake.system.expire_snapshots('payments', TIMESTAMP '2026-11-15 20:31:00')
[2026-11-17 20:31:09] [r]WARN  S3Exception: Access Denied (Service: S3, Status Code: 403) on DeleteObject s3://payu-lake/payments/metadata/...[/r]
[2026-11-17 20:31:09] [y]WARN  expire_snapshots failed; continuing (fail_on_error=False)[/y]
[2026-11-17 20:31:10] INFO  Running CALL lake.system.rewrite_manifests('payments')
[2026-11-17 20:31:15] [r]WARN  S3Exception: Access Denied … PutObject[/r]
[2026-11-17 20:31:15] INFO  Task exited with return code 0`, clue:"denied", unlock:["aws iam get-role-policy --role-name lake-maintenance --policy-name s3-access"]},
  {m:["aws iam get-role-policy"], out:`{
  "PolicyName": "s3-access",
  "Statement": [{ "Effect": "Allow",
     "Action": [[y]"s3:GetObject", "s3:ListBucket"[/y]],
     "Resource": ["arn:aws:s3:::payu-lake/*"] }]
}
[d]-- rotated 2 Mar 2026 by platform-iam; previous version also allowed s3:PutObject, s3:DeleteObject[/d]`, clue:"readonly"},
  {m:["trino -e \"show stats","trino -e \"select count(*) from lake.payments"], out:` _col0
------------
 3812091233
[d]Query 2026... planning: 3m 18s, execution: 6.2s[/d]`, note:"Row count and data size are as expected. Execution is only 6 s; the time goes on planning."}
 ]},
 dash:[
  {title:"Trino query time on lake.payments (s)", x:["Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov"], series:[{name:"planning", v:[2,9,20,38,61,92,128,170,202]}, {name:"execution", v:[6,6,7,6,6,7,6,6,6]}], marks:[{i:0, label:"IAM rotation"}], clue:"planning"},
  {title:"Snapshots retained", x:["Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov"], series:[{name:"snapshots", v:[5800,92000,180000,268000,355000,440000,530000,620000,742180]}], marks:[{i:0, label:"IAM rotation"}], clue:"snapgrowth"},
  {title:"Trino cluster CPU %", unit:"%", x:["Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov"], series:[{name:"CPU", v:[41,40,39,42,40,41,43,42,42]}], note:"Workers are at ~40%. More workers won't speed up coordinator-side planning."},
  {title:"Flink commit interval (s)", x:["Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov"], series:[{name:"interval", v:[30,30,30,30,30,30,30,30,30]}], note:"Unchanged at 30 s. Frequent commits are fine *if* maintenance runs. Nothing changed here."}
 ],
 ui:[
  {title:"Query 20261118_093912 · stats", md:`| Phase | Time |
|---|---|
| Queued | 0.1 s |
| **Planning** | **3 min 18 s** |
| Scheduling splits | 4.1 s |
| Execution | 6.2 s |
| Splits | 2,941 |`, clue:"planning"},
  {title:"Coordinator JVM", md:`| Heap used | GC pauses (last 10 min) | Notes |
|---|---|---|
| 21 / 32 GB | 14 s total | Large metadata.json parsed per query |`, note:"The coordinator is working hard *because* of the giant metadata. That's a symptom."}
 ],
 clues:{
  metabig:"metadata.json is 481 MB and the metadata folder has 412k objects",
  snaps:"The table keeps 742,180 snapshots going back to March",
  manifests:"The current snapshot has 96k manifests (healthy: tens to hundreds)",
  snapgrowth:"Snapshots have grown steadily (≈2,880/day) ever since the March IAM rotation; nothing is expiring them",
  planning:"Query time is almost all planning (3 min 18 s) vs 6 s of execution",
  denied:"Maintenance logs: expire_snapshots and rewrite_manifests get S3 Access Denied, yet the task exits 0",
  readonly:"The rotated IAM role only allows Get/List, not Put/Delete"
 },
 cause:{q:"What's the root cause?", o:[
  {t:"Table maintenance has silently failed (S3 Access Denied since the IAM rotation, swallowed by fail_on_error=False), so snapshots and manifests pile up from 30-second commits and planning has to read huge metadata", ok:true},
  {t:"The Trino cluster is too small", ok:false, why:"Workers sit at 40% CPU; time is spent in planning on the coordinator.", say:[["ravi","Workers are idle-ish at 40%. Execution takes 6 seconds. It's the 3-minute planning phase that's slow."]]},
  {t:"Flink commits too often, so we should stop streaming", ok:false, why:"The 30 s interval didn't change. Frequent commits are normal when maintenance works.", say:[["priya","Flink has committed every 30 s for a year. What changed is that the cleanup stopped working."]]},
  {t:"The data volume grew", ok:false, why:"Execution time and row counts are steady; only planning grew.", say:[["meera","Row counts are normal for November. And execution is 6 seconds — the data itself isn't the problem."]]}
 ]},
 fix:{q:"What do you ship? Pick every action you'd take.", o:[
  {t:"Restore s3:PutObject/DeleteObject on the maintenance role (scoped to the lake prefix)", kind:"must", why:"Maintenance can't fix anything until it can write and delete metadata.", miss:[["dev","Ran the maintenance calls, they failed instantly: Access Denied. The role still can't write."]]},
  {t:"Run expire_snapshots (keep ~2 days), rewrite_manifests, then remove_orphan_files", kind:"must", why:"Shrinks metadata from 742k snapshots and 96k manifests to something planning can read in seconds.", miss:[["meera","Permissions fixed, nice, but queries are still 3 minutes. Nothing has actually cleaned up the 742k snapshots yet."]]},
  {t:"Make maintenance fail loudly (fail_on_error=True) and alert on snapshot/manifest counts per table", kind:"good", why:"A green DAG that did nothing is worse than a red one."},
  {t:"Add an IAM change check: dry-run every scheduled job's permissions after a rotation", kind:"good", why:"Catches this class of change on day one."},
  {t:"Add 10 Trino workers", kind:"meh", why:"Planning happens on the coordinator. More workers cost money and change nothing."},
  {t:"Delete old files under metadata/ directly in S3", kind:"bad", why:"You can't tell which files live snapshots still reference. Deleting by hand can corrupt the table for every reader.", say:[["meera","Every query on lake.payments now fails: «NotFoundException: Failed to open input stream for file … manifest». Did someone delete metadata files?!"],["priya","Restoring from S3 versioning. Never delete Iceberg files by hand. Let expire_snapshots and remove_orphan_files decide."]]},
  {t:"Drop and recreate the table from the latest data files", kind:"bad", why:"You lose all history and time travel, break every running reader and writer, and risk missing in-flight commits.", say:[["dev","Flink is now failing: «Cannot commit: table was replaced». And finance's time-travel audit query for October is gone. 😬"]]}
 ]},
 post:{
  summary:"Trino queries on «lake.payments» crept from **9 s to 3m 41s** over eight months. Almost all of that was planning. Analyst dashboards timed out.",
  cause:"After the March IAM rotation, the maintenance role lost «s3:PutObject» and «s3:DeleteObject». The nightly «expire_snapshots» and «rewrite_manifests» calls hit **403 Access Denied**, but the job used «fail_on_error=False» and exited 0, so it stayed **green**. Meanwhile Flink kept committing every 30 s (2,880 snapshots a day), and nothing expired them. The table reached **742k snapshots**, a **481 MB metadata.json** and **96k manifests**. Every query had to read and filter that metadata before scheduling a single split.",
  prevent:["Maintenance jobs fail loudly; alert on snapshot count, manifest count and metadata.json size","Permission dry-run for scheduled jobs after IAM changes","Streaming tables get compaction + snapshot expiry in their definition of done","Dashboards for planning vs execution time"]
 },
 learned:["Slow **planning** with fast **execution** = a metadata problem, not a compute problem.","Every Iceberg commit is a snapshot. Streaming without **expire_snapshots** and **rewrite_manifests** grows metadata forever.","A **green** job isn't a working job. Swallowed errors hide outages.","Never delete Iceberg files by hand. Use the maintenance procedures."]
}
]);

QUEST.story("iceberg", {title:"The partition that changed shape", icon:"🧊", place:"Mon 9 AM · lake.events", setup:"lake.events is partitioned by day. Traffic grew 20×, and each day's partition now has 900,000 files. Queries that filter by merchant are slow too.",
 meters:[["plan","Query planning"," s",95,5,"low",120],["scan","Data scanned per query"," GB",800,40,"low",1000],["trust","Analyst trust","%",40,70,"high",100]],
 beats:[["meera","My merchant report scans 800 GB to show one merchant's day. Can we repartition?"],["ui","PARTITIONED BY (days(event_ts))\nfiles per day: 912,004   avg file: 1.1 MB\nmost queries: WHERE event_ts in a day AND merchant_id = ?"],
  ["q","How do you change partitioning in Iceberg?",[["Partition evolution: ALTER TABLE … ADD PARTITION FIELD bucket(16, merchant_id); new data uses the new spec, old data keeps the old one",1,"Iceberg stores the partition spec in metadata, so changing it is a metadata operation. No rewrite needed, and queries keep working across both specs.","Changing how new folders are labelled without relabelling the old ones."],["Create a new table and copy 3 years of data",0.5,"Works, but costs a huge rewrite and a migration of every reader.","Moving house to change the labels."],["Iceberg partitions can never change",0,"That's Hive; Iceberg supports evolution.","Confusing Iceberg with older tables."]]],
  ["q","What about the 900,000 tiny files per day?",[["Run rewrite_data_files with a target size and a sort order on merchant_id",1,"Compaction makes ~512 MB files, and sorting by merchant tightens min/max stats so whole files can be skipped.","Merging loose pages into sorted binders."],["Increase the query engine's memory",0,"Doesn't reduce files or bytes scanned.","A bigger desk for the same pile of pages."]]],
  ["q","Readers use WHERE event_ts … — do they need to know the partition columns?",[["No: hidden partitioning; Iceberg derives partition values from event_ts, so filters on the source column prune automatically",1,"No «dt» column for users to forget; the table knows how its partitions are derived.","The librarian knows which shelf a date is on; you just ask for the date."],["Yes, they must add a dt = filter",0,"That's Hive-style partitioning.","Making every visitor learn the shelf numbers."]]],
  ["meera","Planning 4 s, merchant report scans 30 GB. And nobody had to change their queries."]],
 learned:["Partition evolution is a metadata change.","Compaction with sort order shrinks files and scan size.","Hidden partitioning: users filter on real columns."]});
QUEST.mock("iceberg", {title:"Lakehouse & Iceberg round", who:"ana", intro:"Ana here. Let's talk table formats, Iceberg especially.", setup:"Ana designs the lakehouse platform.",
 qs:[["What problem do table formats like Iceberg solve over plain Parquet folders?","Plain folders have no **atomic commits** (readers see half-written data), no reliable **schema evolution**, expensive **listing**, no **time travel**, and unsafe concurrent writes. Iceberg tracks files in **metadata** (snapshots → manifest lists → manifests): atomic snapshot swaps, ACID with optimistic concurrency, schema and partition evolution, hidden partitioning, time travel and rich file stats for pruning.",[["Atomic snapshots, ACID via metadata, schema/partition evolution, time travel, no listing, file-level stats",1,"Complete."],["Better compression",0,"Compression comes from Parquet/ORC."],["It's faster because it's a database",0,"It's a table format, not an engine."]]],
  ["Copy-on-write vs merge-on-read?","**COW**: updates/deletes rewrite affected data files: slow writes, fast reads. **MOR**: write small **delete files** (position or equality) and merge at read time: fast writes, slower reads until **compaction**. CDC-heavy tables usually use MOR + regular compaction.",[["COW rewrites files (fast reads), MOR writes delete files (fast writes) and needs compaction",1,"The trade-off."],["They're the same",0,"Different write paths."],["MOR is always better",0.5,"Not for read-heavy tables."]]],
  ["How do two writers commit to the same table safely?","**Optimistic concurrency**: each writer prepares new metadata and does an atomic swap of the current-metadata pointer in the **catalog** (Glue, Nessie, REST, Hive). If someone committed first, it **retries** against the new state, if its changes don't conflict.",[["Optimistic concurrency with an atomic pointer swap in the catalog, retrying on conflict",1,"Correct mechanism."],["Iceberg takes a table lock",0,"No long locks."],["The last writer silently wins",0,"Conflicts are detected."]]],
  ["What maintenance does an Iceberg table need?","«expire_snapshots», «rewrite_data_files» (compaction), «rewrite_manifests», «remove_orphan_files», plus delete-file compaction for MOR. Without them, metadata and small files grow and planning slows down.",[["Expire snapshots, compact data files and manifests, remove orphans",1,"The checklist."],["None, it's self-managing",0,"A common and costly myth."],["Only VACUUM",0.5,"That's Delta's name; Iceberg has several procedures."]]]],
 learned:["Metadata tree = atomic snapshots.","COW vs MOR.","Maintenance is part of running Iceberg."]});
