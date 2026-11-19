{ const f = document.getElementById("fontcss"); if (f) f.media = "all"; }
const KIND_NAMES = {actor:"Client / engine", proc:"Compute layer", mem:"Memory", disk:"Durable storage", log:"Log / stream", meta:"Metadata / catalog"};
const STATE_NAMES = {memory:"memory", disk:"on disk", network:"shipped", catalog:"catalog", client:"client"};

const FLOWS = {
"mysql-write": {
  tab:"MySQL", sub:"write",
  intro:"<b>INSERT then COMMIT in InnoDB.</b> Watch how MySQL makes a change durable through the redo log and binlog, while the data page itself reaches disk much later.",
  nodes:{
    client:{c:0,r:0,label:"Client app",sub:"JDBC / mysql CLI",k:"actor"},
    sql:{c:1,r:0,label:"SQL layer",sub:"parser · optimizer",k:"proc"},
    replica:{c:2,r:0,label:"Replica / CDC",sub:"replica, Debezium",k:"actor"},
    undo:{c:0,r:1,label:"Undo log",sub:"rollback segments",k:"log"},
    innodb:{c:1,r:1,label:"InnoDB engine",sub:"trx, locks, B+tree",k:"proc"},
    binlog:{c:2,r:1,label:"Binary log",sub:"binlog.000042",k:"log"},
    bp:{c:1,r:2,label:"Buffer pool",sub:"16 KB pages, LRU",k:"mem"},
    logbuf:{c:2,r:2,label:"Log buffer",sub:"redo, in memory",k:"mem"},
    dw:{c:0,r:3,label:"Doublewrite",sub:"torn-page guard",k:"disk"},
    ibd:{c:1,r:3,label:"orders.ibd",sub:"tablespace file",k:"disk"},
    redo:{c:2,r:3,label:"Redo log files",sub:"#innodb_redo",k:"disk"}
  },
  steps:[
    {f:"client",t:"sql",title:"INSERT reaches the server",body:"A connection thread receives the statement. The SQL layer parses it, checks privileges, and the optimizer confirms the row goes into the PRIMARY key. The transaction is open.",code:"BEGIN;\nINSERT INTO orders (id, customer_id, amount, status)\nVALUES (1001, 42, 7499.00, 'NEW');",add:[["client","Transaction open, statement parsed"]]},
    {f:"sql",t:"innodb",title:"Executor hands the row to InnoDB",body:"The executor calls the storage engine handler (<code>write_row</code>). InnoDB assigns a transaction ID and takes an insert-intention lock on the gap where id 1001 belongs, so inserts into other gaps still proceed in parallel.",add:[["memory","trx 5507 assigned, insert-intention lock held"]]},
    {f:"ibd",t:"bp",title:"Fetch the target page",body:"InnoDB walks the clustered index B+tree down to the leaf page where 1001 belongs. If that 16 KB page is not in the buffer pool yet, it is read from orders.ibd. Hot pages are usually already cached.",add:[["memory","Leaf page (space 12, page 4) cached"]]},
    {f:"innodb",t:"undo",title:"Write an undo record",body:"Before touching the row, InnoDB records how to reverse the change. ROLLBACK uses it, and so do other transactions whose snapshots must not see row 1001 yet.",add:[["memory","Undo: delete id 1001 (for rollback and MVCC)"]]},
    {f:"innodb",t:"bp",title:"Change the page in memory",body:"The row is inserted into the leaf page inside the buffer pool and the page is marked dirty. The data file on disk has not changed at all.",add:[["memory","Dirty page in buffer pool"]]},
    {f:"bp",t:"logbuf",title:"Describe the change in redo",body:"A small redo record (which page changed and how, tagged with an LSN) goes into the in-memory log buffer. Redo is compact and written sequentially, which is why MySQL can confirm a commit without writing the whole 16 KB page.",add:[["memory","Redo record in log buffer, LSN 88,231,904"]]},
    {f:"client",t:"sql",title:"Client sends COMMIT",body:"With binary logging on, MySQL runs an internal two-phase commit between InnoDB and the binlog, so both agree on whether this transaction happened.",code:"COMMIT;",add:[["client","COMMIT requested"]]},
    {f:"logbuf",t:"redo",title:"Prepare: flush redo to disk",body:"InnoDB writes the transaction's redo to the redo log files and fsyncs them (<code>innodb_flush_log_at_trx_commit = 1</code>). The transaction is now PREPARED.",add:[["disk","Redo durable on disk (PREPARED)"]]},
    {f:"sql",t:"binlog",title:"Write and sync the binlog",body:"The change is written to the binary log as a Write_rows event and fsynced (<code>sync_binlog = 1</code>). Group commit batches many transactions into one fsync. Once this event is on disk, crash recovery will treat the transaction as committed.",add:[["disk","Write_rows event in binlog.000042"]]},
    {f:"logbuf",t:"redo",title:"Commit: mark it done in redo",body:"InnoDB writes a commit mark for the transaction and releases its locks. This write needs no separate fsync because the binlog already settled the outcome.",add:[["memory","Locks released, trx 5507 committed"]]},
    {f:"sql",t:"client",title:"OK goes back to the client",body:"The client gets its OK. The change is durable through redo and binlog, yet the data page is still only in memory. After a crash, recovery would replay redo to rebuild it.",add:[["client","Query OK, 1 row affected"]]},
    {f:"bp",t:"dw",title:"Background flush via doublewrite",body:"Later, page cleaner threads flush dirty pages. Each page is first written to the doublewrite area, so a crash halfway through a page write cannot leave a torn page.",add:[["disk","Page copy in doublewrite file"]]},
    {f:"dw",t:"ibd",title:"Page lands in orders.ibd",body:"The page is written to its real place in the tablespace. The checkpoint LSN moves past 88,231,904, so that part of the redo log can be reused.",add:[["disk","orders.ibd updated, checkpoint advanced"]]},
    {f:"binlog",t:"replica",title:"Replicas and CDC read the binlog",body:"Replica I/O threads and tools like Debezium stream the binlog events. This is where the <b>MySQL → Iceberg CDC</b> flow starts.",add:[["network","Event shipped to replica / Debezium"]]}
  ]
},
"mysql-read": {
  tab:"MySQL", sub:"read",
  intro:"<b>SELECT through a secondary index.</b> See how the optimizer picks an index, how InnoDB finds rows through two B+trees, and how MVCC hides changes your snapshot should not see.",
  nodes:{
    client:{c:0,r:0,label:"Client app",sub:"JDBC / mysql CLI",k:"actor"},
    parser:{c:1,r:0,label:"Parser",sub:"syntax, privileges",k:"proc"},
    optimizer:{c:2,r:0,label:"Optimizer",sub:"cost-based plan",k:"proc"},
    readview:{c:0,r:1,label:"Read view",sub:"MVCC snapshot",k:"mem"},
    innodb:{c:1,r:1,label:"InnoDB",sub:"index cursors",k:"proc"},
    undo:{c:0,r:2,label:"Undo log",sub:"older row versions",k:"log"},
    bp:{c:1,r:2,label:"Buffer pool",sub:"cached index pages",k:"mem"},
    ibd:{c:2,r:2,label:"orders.ibd",sub:"PRIMARY + idx_customer",k:"disk"}
  },
  steps:[
    {f:"client",t:"parser",title:"SELECT arrives",body:"The connection thread parses the statement, resolves table and column names and checks privileges.",code:"SELECT id, amount, status\nFROM orders\nWHERE customer_id = 42;",add:[["client","Statement parsed"]]},
    {f:"parser",t:"optimizer",title:"Optimizer picks a plan",body:"Using index statistics, the optimizer compares a full table scan with the secondary index idx_customer. It expects about 2 rows, so it picks an index lookup. EXPLAIN would show <code>type: ref</code>, <code>key: idx_customer</code>.",add:[["memory","Plan: ref on idx_customer, ~2 rows"]]},
    {f:"optimizer",t:"innodb",title:"Executor opens an index cursor",body:"The executor asks InnoDB for rows where customer_id = 42 through the handler interface, then keeps calling back for the next row.",add:[["memory","Cursor open on idx_customer"]]},
    {f:"innodb",t:"readview",title:"Take a consistent snapshot",body:"Under REPEATABLE READ, the first read creates a read view: the set of transactions still running. Their changes stay invisible to this query even if they commit mid-way. A plain SELECT takes no row locks.",add:[["memory","Read view: trx 5507 still active"]]},
    {f:"innodb",t:"bp",title:"Search the secondary index",body:"InnoDB walks idx_customer from root to leaf. Secondary index entries hold the indexed value plus the primary key, so it finds (42 → 1001) and (42 → 1007).",add:[["memory","Index hits: PK 1001, PK 1007"]]},
    {f:"ibd",t:"bp",title:"Cache miss reads from disk",body:"One leaf page was not cached, so it is read from orders.ibd. New pages enter the old end of the LRU list, so a single large scan cannot push out the hot working set.",add:[["disk","Page read from orders.ibd into pool"]]},
    {f:"bp",t:"innodb",title:"Look up full rows by primary key",body:"The secondary index only gave ids, so InnoDB descends the clustered index (PRIMARY) for each id to get amount and status. A covering index on (customer_id, amount, status) would skip this step.",add:[["memory","Full rows fetched from PRIMARY"]]},
    {f:"innodb",t:"undo",title:"Check visibility with MVCC",body:"Row 1007 was last changed by trx 5507, which the read view lists as active. InnoDB follows the row's undo pointer and rebuilds the version that was committed before the snapshot.",add:[["memory","Row 1007 rebuilt from undo"]]},
    {f:"innodb",t:"client",title:"Rows stream back",body:"The executor applies any remaining filters and sends rows to the client. Nothing was written and no locks were taken.",add:[["client","2 rows returned"]]}
  ]
},
"iceberg-write": {
  tab:"Iceberg", sub:"write", top:40,
  intro:"<b>Appending a batch to an Iceberg table.</b> Data files are written first and stay invisible. A tree of metadata files is built on top, and one atomic pointer swap in the catalog makes everything visible at once.",
  nodes:{
    catalog:{c:0,r:0,label:"Catalog",sub:"Glue / REST / Nessie",k:"meta"},
    metadata:{c:1,r:0,label:"metadata.json",sub:"schema, snapshots",k:"meta"},
    readers:{c:2,r:0,label:"Readers",sub:"Athena · Trino · Spark",k:"actor"},
    writer:{c:0,r:1.5,label:"Spark writer",sub:"driver + executors",k:"proc"},
    mlist:{c:1,r:1,label:"Manifest list",sub:"one per snapshot",k:"meta"},
    manifest:{c:1,r:2,label:"Manifests",sub:"Avro: files + stats",k:"meta"},
    data:{c:1,r:3,label:"Data files",sub:"Parquet on S3",k:"disk"}
  },
  steps:[
    {f:"writer",t:"catalog",title:"Look up the table",body:"The driver asks the catalog for lake.sales.orders. For each table the catalog keeps essentially one thing: a pointer to the current metadata file.",code:"INSERT INTO lake.sales.orders\nSELECT * FROM staging_orders\nWHERE order_date = DATE '2026-11-05';",add:[["catalog","Pointer → 00012-….metadata.json"]]},
    {f:"metadata",t:"writer",title:"Read the current metadata",body:"metadata.json holds the schema, the partition spec (<code>days(order_ts)</code>), sort order, properties and the snapshot history. The writer notes the current snapshot as its starting point.",add:[["memory","Base snapshot 7741, spec days(order_ts)"]]},
    {f:"writer",t:"data",title:"Write Parquet data files",body:"Executors write new files into the right partition and collect per-column stats as they go: row count, null count, min and max. No reader can see these files yet because nothing points to them.",add:[["disk","data/order_ts_day=2026-11-05/….parquet ×4"]]},
    {f:"writer",t:"manifest",title:"Write a manifest",body:"A manifest is an Avro file listing data files with their partition values and column stats. Readers later use these stats to skip files without opening them.",add:[["disk","metadata/9c1e…-m0.avro (lists 4 files)"]]},
    {f:"writer",t:"mlist",title:"Write a manifest list",body:"The manifest list is the snapshot. It points to the new manifest and reuses all existing manifests unchanged, each with a summary of the partitions it covers. An append never rewrites old metadata.",add:[["disk","metadata/snap-8812-….avro"]]},
    {f:"writer",t:"metadata",title:"Write the next metadata.json",body:"A new metadata file is written with snapshot 8812 added to the history and set as current. Files are never edited in place, so version 12 still exists next to it.",add:[["disk","metadata/00013-….metadata.json"]]},
    {f:"writer",t:"catalog",title:"Atomic commit: swap the pointer",body:"The writer asks the catalog to move the pointer from v12 to v13, but only if it still points to v12. If another job committed first, the writer reloads, checks for conflicts and retries with fresh metadata. The data files are reused.",add:[["catalog","Pointer → 00013 (committed)"]]},
    {f:"readers",t:"catalog",bend:120,title:"Readers pick up the new snapshot",body:"The next query that loads the table sees snapshot 8812. Queries already running keep reading snapshot 7741 until they finish. Time travel back to 7741 works until expire_snapshots removes it.",code:"SELECT count(*) FROM lake.sales.orders\nFOR VERSION AS OF 7741;",add:[["network","Snapshot 8812 visible to new queries"]]}
  ]
},
"iceberg-read": {
  tab:"Iceberg", sub:"read",
  intro:"<b>Querying an Iceberg table.</b> The engine never lists S3 folders. It walks down the metadata tree and uses stats at each level to skip whole groups of files before reading any data.",
  nodes:{
    catalog:{c:0,r:0,label:"Catalog",sub:"Glue / REST / Nessie",k:"meta"},
    metadata:{c:1,r:0,label:"metadata.json",sub:"schema, snapshots",k:"meta"},
    engine:{c:0,r:1.5,label:"Query engine",sub:"Trino / Athena / Spark",k:"proc"},
    mlist:{c:1,r:1,label:"Manifest list",sub:"partition summaries",k:"meta"},
    result:{c:2,r:1.5,label:"Result",sub:"rows to the client",k:"actor"},
    manifest:{c:1,r:2,label:"Manifests",sub:"file-level stats",k:"meta"},
    deletes:{c:0,r:3,label:"Delete files",sub:"merge-on-read",k:"disk"},
    data:{c:1,r:3,label:"Data files",sub:"Parquet on S3",k:"disk"}
  },
  steps:[
    {f:"engine",t:"catalog",title:"Resolve the table",body:"The engine asks the catalog where the current metadata file lives. One small lookup replaces slow directory listing on S3.",code:"SELECT customer_id, sum(amount)\nFROM lake.sales.orders\nWHERE order_ts >= TIMESTAMP '2026-11-05 00:00'\n  AND amount > 5000\nGROUP BY customer_id;",add:[["catalog","Pointer → 00013-….metadata.json"]]},
    {f:"metadata",t:"engine",title:"Read table metadata",body:"The engine loads the schema, partition spec and current snapshot. Because the table is partitioned by <code>days(order_ts)</code>, the filter on order_ts becomes a partition filter automatically. Nobody has to write a partition column in the query.",add:[["memory","Snapshot 8812, filter on order_ts_day ≥ 2026-11-05"]]},
    {f:"mlist",t:"engine",title:"Prune manifests",body:"The manifest list stores the partition range each manifest covers. Manifests that only cover older days are skipped without being opened.",add:[["memory","Manifests: 38 → 3"]]},
    {f:"manifest",t:"engine",title:"Prune data files",body:"Each manifest entry carries the file's partition values and column min/max. Files whose maximum amount is below 5000 are dropped as well. Most of the work is avoided here.",add:[["memory","Data files: 1,240 → 17"]]},
    {f:"data",t:"engine",title:"Read only what is needed",body:"Workers open the 17 Parquet files, read only the customer_id, amount and order_ts columns, and skip row groups using Parquet's own stats.",add:[["disk","≈ 410 MB read from a 96 GB table"]]},
    {f:"deletes",t:"engine",title:"Apply delete files",body:"On a format v2 table using merge-on-read, updates and deletes are stored as separate delete files. The engine applies them while reading, so removed or replaced rows never show. Compaction later folds them into the data files.",add:[["memory","312 rows hidden by delete files"]]},
    {f:"engine",t:"result",title:"Aggregate and return",body:"Workers aggregate and return the result. The query read one consistent snapshot, so a commit landing mid-query did not change its answer.",add:[["client","8,904 rows returned"]]}
  ]
},
"cdc": {
  tab:"MySQL → Iceberg", sub:"CDC",
  intro:"<b>Near-real-time CDC from MySQL into the lakehouse.</b> One UPDATE travels through the binlog, Debezium, Kafka and Flink, and becomes an Iceberg commit a few minutes later.",
  nodes:{
    app:{c:0,r:0,label:"Application",sub:"payments service",k:"actor"},
    mysql:{c:1,r:0,label:"MySQL",sub:"binlog_format=ROW",k:"disk"},
    debezium:{c:2,r:0,label:"Debezium",sub:"Kafka Connect source",k:"proc"},
    iceberg:{c:0,r:1,label:"Iceberg table",sub:"format v2 on S3",k:"disk"},
    flink:{c:1,r:1,label:"Flink job",sub:"upsert sink",k:"proc"},
    kafka:{c:2,r:1,label:"Kafka topic",sub:"cdc.payments.orders",k:"log"},
    query:{c:0,r:2,label:"Query engines",sub:"Athena · Trino",k:"actor"},
    maint:{c:1,r:2,label:"Maintenance",sub:"compaction, expiry",k:"proc"},
    ckpt:{c:2,r:2,label:"Checkpoint",sub:"state + offsets, S3",k:"disk"}
  },
  steps:[
    {f:"app",t:"mysql",title:"Row changes in MySQL",body:"The commit follows the MySQL write path. With <code>binlog_format=ROW</code> and <code>binlog_row_image=FULL</code>, the binlog event carries the full row before and after the change.",code:"UPDATE orders SET status = 'PAID'\nWHERE id = 1001;\nCOMMIT;",add:[["disk","binlog.000042 pos 77311: Update_rows"]]},
    {f:"mysql",t:"debezium",title:"Debezium tails the binlog",body:"Debezium connects like a replica with its own server_id and streams events from its last saved GTID set. On first start it takes a consistent snapshot of existing rows, then switches to the binlog.",add:[["network","Event read at GTID …:91822"]]},
    {f:"debezium",t:"kafka",title:"Publish a change event",body:"The event is keyed by primary key, so every change to order 1001 goes to the same partition and stays in order.",code:'{\n  "op": "u",\n  "before": { "id": 1001, "status": "NEW" },\n  "after":  { "id": 1001, "status": "PAID" },\n  "source": { "file": "binlog.000042", "pos": 77311 },\n  "ts_ms": 1793873400000\n}',add:[["network","cdc.payments.orders p3, offset 99102"]]},
    {f:"kafka",t:"flink",title:"Flink turns events into upserts",body:"The job reads the topic, keeps the latest change per key, and maps op c/u/d to insert, upsert or delete. Kafka offsets are kept in Flink state instead of being committed right away.",add:[["memory","Upsert id=1001, status=PAID"]]},
    {f:"flink",t:"iceberg",title:"Write data and delete files",body:"For an upsert the sink writes the new row to a data file plus an equality delete (id = 1001) that hides the old version. These files are pending and belong to no snapshot yet.",add:[["disk","1 data file + 1 equality-delete file (pending)"]]},
    {f:"flink",t:"ckpt",title:"Checkpoint",body:"At each checkpoint Flink saves its Kafka offsets and the list of pending files together. If the job fails, it restarts from here, so nothing is lost or committed twice.",add:[["disk","Checkpoint 4411: offset 99102 + pending files"]]},
    {f:"flink",t:"iceberg",title:"Commit the snapshot",body:"When the checkpoint completes, the committer makes a single Iceberg commit with all pending files. The checkpoint interval, often one to five minutes, decides how fresh the lake is.",add:[["catalog","Snapshot committed (sequence 2214)"]]},
    {f:"iceberg",t:"query",title:"Analysts query fresh data",body:"Queries see order 1001 as PAID a few minutes after the MySQL commit. Merge-on-read applies the equality delete, so only the latest version appears.",add:[["client","Row visible ~1–5 min after MySQL commit"]]},
    {f:"maint",t:"iceberg",title:"Compact and clean up",body:"Streaming commits leave many small files and delete files behind. Scheduled jobs compact them and apply deletes, expire old snapshots, and purge files nothing references any more.",code:"CALL lake.system.rewrite_data_files(table => 'sales.orders');\nCALL lake.system.expire_snapshots(\n  table => 'sales.orders',\n  older_than => TIMESTAMP '2026-11-03 00:00');\nCALL lake.system.remove_orphan_files(table => 'sales.orders');",add:[["disk","Small files compacted, old snapshots expired"]]}
  ]
},
"spark-stages": {
  tab:"Spark", sub:"stages",
  intro:"<b>One Spark job, cut into stages.</b> Follow a <code>groupBy</code> from your code to the driver, across a shuffle, and back out to S3. Every shuffle (Exchange) splits the job into a new stage, and every partition becomes one task.",
  nodes:{
    client:{c:0,r:0,label:"Your code",sub:"notebook / spark-submit",k:"actor"},
    driver:{c:1,r:0,label:"Driver",sub:"SparkSession",k:"proc"},
    ui:{c:2,r:0,label:"Spark UI",sub:"jobs · stages · tasks",k:"actor"},
    catalyst:{c:0,r:1,label:"Catalyst",sub:"logical → physical plan",k:"meta"},
    dag:{c:1,r:1,label:"DAGScheduler",sub:"cuts stages at shuffles",k:"proc"},
    tsched:{c:2,r:1,label:"TaskScheduler",sub:"task sets, locality",k:"proc"},
    input:{c:0,r:2,label:"S3 input",sub:"Parquet, 480 splits",k:"disk"},
    map:{c:1,r:2,label:"Stage 0 tasks",sub:"scan · filter · partial agg",k:"proc"},
    shuffle:{c:2,r:2,label:"Shuffle files",sub:"executor local disk",k:"disk"},
    output:{c:2,r:3,label:"S3 output",sub:"part-*.parquet",k:"disk"},
    reduce:{c:1,r:3,label:"Stage 1 tasks",sub:"fetch · final agg · write",k:"proc"},
    mem:{c:0,r:3,label:"Executor memory",sub:"execution pool, spill",k:"mem"}
  },
  steps:[
    {f:"client",t:"driver",title:"An action starts a job",body:"Transformations only built a plan. <code>write</code> is an action, so the driver now creates a job. One action = one job (sometimes a few extra jobs for sampling or broadcasts).",code:"orders = spark.read.parquet(\"s3://lake/orders/\")\n(orders.filter(\"status = 'PAID'\")\n       .groupBy(\"merchant_id\").sum(\"amount\")\n       .write.parquet(\"s3://lake/gmv/\"))",add:[["client","Job 7 submitted"]]},
    {f:"driver",t:"catalyst",title:"Catalyst builds the physical plan",body:"Catalyst resolves columns, pushes the <code>status</code> filter into the Parquet scan, prunes to 3 columns, and plans the aggregate in two halves around an <b>Exchange</b> (the shuffle).",code:"*(2) HashAggregate(keys=[merchant_id], functions=[sum(amount)])\n+- Exchange hashpartitioning(merchant_id, 200)\n   +- *(1) HashAggregate(keys=[merchant_id], functions=[partial_sum(amount)])\n      +- *(1) Filter (status = PAID)\n         +- *(1) FileScan parquet [merchant_id,amount,status]\n              PushedFilters: [EqualTo(status,PAID)]",add:[["memory","Physical plan with 1 Exchange"]]},
    {f:"catalyst",t:"dag",title:"Cut the plan into stages",body:"The DAGScheduler walks the plan backwards. Narrow steps (scan, filter, partial agg) are pipelined into one stage. The Exchange is a <b>shuffle dependency</b>, so it cuts a boundary: <b>Stage 0</b> (ShuffleMapStage) writes shuffle files, <b>Stage 1</b> (ResultStage) reads them.",add:[["memory","Stage 0 → Stage 1 (1 shuffle)"]]},
    {f:"dag",t:"tsched",title:"Submit Stage 0 as a task set",body:"Stage 0 has no parents, so it runs first. It gets <b>one task per input partition</b>: 480 splits of ~128 MB → 480 tasks. Stage 1 waits until every Stage 0 task has finished.",add:[["memory","TaskSet 0: 480 tasks"]]},
    {f:"tsched",t:"map",title:"Launch tasks on executor cores",body:"Each free core runs one task at a time. With 30 executors × 4 cores = 120 cores, 480 tasks run in about <b>4 waves</b>. Locality wait is skipped for S3 (there is no data locality to wait for).",add:[["network","Tasks running: 120 at a time, 4 waves"]]},
    {f:"input",t:"map",title:"Each task reads its split",body:"A task opens its Parquet split, reads only the 3 needed columns, and skips row groups whose min/max stats can't contain <code>PAID</code>. Scan → filter → partial aggregate run as one whole-stage-codegen function, row by row, with no data movement.",add:[["memory","Task 37: 1.9 M rows read, 1.2 M PAID"]]},
    {f:"map",t:"mem",title:"Partial aggregation in memory",body:"Each task keeps a hash map of <code>merchant_id → partial sum</code>. 1.2 M rows collapse into ~8,000 partial rows. If the map outgrows the task's share of execution memory, it spills sorted runs to local disk.",add:[["memory","Hash map: 8,000 keys (no spill)"]]},
    {f:"map",t:"shuffle",title:"Write shuffle output",body:"The task sorts its partial rows by target partition (<code>hash(merchant_id) % 200</code>) and writes <b>one data file + one index file</b> to the executor's local disk. It reports a MapStatus (block sizes per reducer) to the driver.",add:[["disk","shuffle_0_37.data + .index (2.1 MB)"]]},
    {f:"map",t:"dag",title:"Stage 0 done: AQE re-plans",body:"Every map task reported its MapStatus. When all 480 finish, the driver knows the real size of every shuffle partition. With AQE, 200 planned partitions totalling 1 GB get <b>coalesced</b> into ~16 partitions near the 64 MB advisory size. Skewed partitions would be split here too.",add:[["memory","AQE: 200 → 16 shuffle partitions"]]},
    {f:"tsched",t:"reduce",title:"Launch Stage 1 tasks",body:"Stage 1's task set has one task per (coalesced) shuffle partition: 16 tasks, a single wave. If a needed shuffle file was lost with an executor, Stage 0 tasks are re-run first (FetchFailed → stage retry).",add:[["network","TaskSet 1: 16 tasks"]]},
    {f:"shuffle",t:"reduce",title:"Reducers fetch their blocks",body:"Each reduce task fetches its slice from <b>every</b> map output: local blocks from disk, remote ones over the network (up to <code>spark.reducer.maxSizeInFlight</code> at a time). This is the expensive network part of a shuffle.",add:[["network","Task 3 fetched 480 blocks (64 MB)"]]},
    {f:"reduce",t:"mem",title:"Final aggregation",body:"The reducer merges the partial sums for its merchants into final totals. All rows for one merchant land in the same reducer, so a merchant with huge volume would make one task much slower than the rest (skew).",add:[["memory","Final sums for ~500 merchants"]]},
    {f:"reduce",t:"output",title:"Write results and commit",body:"Each task writes a <code>part-*.parquet</code> file to a staging location; the driver's commit protocol makes the output visible only when all tasks succeed. Tables (Iceberg/Delta) commit through metadata instead of renames.",add:[["disk","16 output files committed"]]},
    {f:"driver",t:"ui",title:"Read it in the Spark UI",body:"<b>Jobs</b> tab: job 7. <b>Stages</b> tab: Stage 0 (480 tasks, shuffle write 1 GB), Stage 1 (16 tasks, shuffle read 1 GB). In a stage, compare <b>median vs max</b> task time: max ≫ median means skew; large <b>Spill</b> means tasks are too big.",add:[["client","Job 7: 2 stages, 496 tasks, 1 shuffle"]]}
  ]
},
"postgres-write": {
  tab:"Postgres", sub:"write",
  intro:"<b>An UPDATE, then COMMIT.</b> Postgres never overwrites a row: it writes a new version next to the old one, logs it in WAL, and makes it durable with one WAL flush. Data pages and cleanup come later.",
  nodes:{
    client:{c:0,r:0,label:"Client app",sub:"psql / JDBC",k:"actor"},
    backend:{c:1,r:0,label:"Backend process",sub:"one per connection",k:"proc"},
    idx:{c:2,r:0,label:"orders_pkey",sub:"B-tree index",k:"disk"},
    xact:{c:0,r:1,label:"pg_xact (CLOG)",sub:"commit status per XID",k:"meta"},
    sb:{c:1,r:1,label:"Shared buffers",sub:"8 KB pages",k:"mem"},
    walbuf:{c:2,r:1,label:"WAL buffers",sub:"in memory",k:"mem"},
    heap:{c:0,r:2,label:"orders heap",sub:"base/16384/24601",k:"disk"},
    ckpt:{c:1,r:2,label:"Checkpointer",sub:"+ background writer",k:"proc"},
    wal:{c:2,r:2,label:"pg_wal",sub:"16 MB segments",k:"log"},
    vacuum:{c:0,r:3,label:"Autovacuum",sub:"removes dead tuples",k:"proc"},
    standby:{c:1,r:3,label:"Standby / CDC",sub:"replica, Debezium",k:"actor"},
    walsender:{c:2,r:3,label:"WAL sender",sub:"streams WAL",k:"proc"}
  },
  steps:[
    {f:"client",t:"backend",title:"UPDATE reaches its backend",body:"Every connection has its own backend process. It parses and plans the statement: an index scan on the primary key to find id 1001.",code:"BEGIN;\nUPDATE orders SET status = 'PAID'\nWHERE id = 1001;",add:[["client","Transaction open"]]},
    {f:"backend",t:"xact",title:"Get a transaction ID",body:"An XID is assigned lazily, on the first write: <b>XID 7841</b>. Its status in pg_xact is 'in progress'. Read-only transactions never use an XID.",add:[["memory","XID 7841 (in progress)"]]},
    {f:"idx",t:"sb",title:"Find the row through the index",body:"The B-tree leads to the tuple's address (ctid <code>(42,7)</code>: page 42, item 7). Index and heap pages are read into shared buffers if they aren't cached.",add:[["memory","Heap page 42 in shared buffers"]]},
    {f:"backend",t:"sb",title:"Write a new row version",body:"MVCC: the old tuple gets <code>xmax = 7841</code> (and a row lock), and a <b>new tuple</b> with <code>xmin = 7841</code> is added. No indexed column changed and page 42 had space, so it's a <b>HOT update</b>: no new index entry. The page is now dirty.",code:"old (42,7): xmin=7790 xmax=7841 status=NEW\nnew (42,9): xmin=7841 xmax=0    status=PAID",add:[["memory","2 versions on page 42 (HOT)"]]},
    {f:"sb",t:"walbuf",title:"Log the change in WAL",body:"A WAL record describing the heap update is added to WAL buffers with an LSN. If this is the page's first change since the last checkpoint, the record carries a <b>full-page image</b> (protects against torn pages).",add:[["memory","WAL record at LSN 3/9A21F0"]]},
    {f:"client",t:"backend",title:"COMMIT",body:"Nothing is durable yet. COMMIT is where Postgres pays for durability, with one sequential WAL flush.",code:"COMMIT;",add:[["client","COMMIT requested"]]},
    {f:"walbuf",t:"wal",title:"Flush WAL to disk",body:"A commit record is written and WAL is <b>fsynced</b> up to its LSN (<code>synchronous_commit = on</code>). Concurrent commits share one flush (group commit). The 8 KB data page is still only in memory.",add:[["disk","WAL durable up to commit LSN"]]},
    {f:"wal",t:"walsender",title:"WAL sender reads the new WAL",body:"Each standby (and each logical slot, e.g. Debezium) has a WAL sender process that streams new WAL as soon as it's flushed.",add:[["network","WAL streamed"]]},
    {f:"walsender",t:"standby",title:"Standby confirms (if synchronous)",body:"With <code>synchronous_standby_names</code> set, the commit waits until a standby confirms it flushed the WAL. Async standbys don't make the commit wait, which is faster but can lose the last commits on failover.",add:[["network","Standby flushed LSN 3/9A2210"]]},
    {f:"backend",t:"xact",title:"Mark the XID committed",body:"pg_xact now says XID 7841 is <b>committed</b>, and locks are released. From this moment, new snapshots see the new version and stop seeing the old one.",add:[["catalog","XID 7841 committed"]]},
    {f:"backend",t:"client",title:"OK to the client",body:"The client gets <code>COMMIT</code>. Durability comes from WAL alone; if the server crashed now, recovery would replay WAL from the last checkpoint and rebuild page 42.",add:[["client","UPDATE 1 · COMMIT"]]},
    {f:"sb",t:"ckpt",title:"Checkpoint collects dirty pages",body:"Every <code>checkpoint_timeout</code> (or when <code>max_wal_size</code> fills), the checkpointer writes all dirty pages, spreading I/O over <code>checkpoint_completion_target</code>. The background writer also cleans pages ahead of need.",add:[["memory","Dirty page 42 queued for write"]]},
    {f:"ckpt",t:"heap",title:"Page reaches the heap file",body:"Page 42 is written to the table's file and fsynced. The checkpoint's redo point moves forward, so older WAL segments can be recycled (unless a replication slot still needs them).",add:[["disk","Heap file updated, checkpoint done"]]},
    {f:"vacuum",t:"heap",title:"Autovacuum cleans up later",body:"The old version (42,7) is now <b>dead</b>, but stays until no snapshot can see it. Autovacuum then removes it, frees the space for reuse, and updates the visibility map. Long-running transactions delay this and cause bloat.",add:[["disk","Dead tuple (42,7) reclaimed"]]}
  ]
},
"postgres-read": {
  tab:"Postgres", sub:"read",
  intro:"<b>A SELECT through an index.</b> See the planner choose a plan from statistics, pages come in through the OS cache into shared buffers, and MVCC decide which row versions this query may see.",
  nodes:{
    client:{c:0,r:0,label:"Client app",sub:"psql / JDBC",k:"actor"},
    backend:{c:1,r:0,label:"Parser + rewriter",sub:"backend process",k:"proc"},
    planner:{c:2,r:0,label:"Planner",sub:"cost-based",k:"proc"},
    snapshot:{c:0,r:1,label:"Snapshot",sub:"xmin · xmax · active XIDs",k:"mem"},
    executor:{c:1,r:1,label:"Executor",sub:"pulls rows node by node",k:"proc"},
    stats:{c:2,r:1,label:"pg_statistic",sub:"MCVs, histograms",k:"meta"},
    xact:{c:0,r:2,label:"Commit status",sub:"hint bits · pg_xact",k:"meta"},
    sb:{c:1,r:2,label:"Shared buffers",sub:"clock-sweep eviction",k:"mem"},
    os:{c:2,r:2,label:"OS page cache",sub:"kernel memory",k:"mem"},
    heap:{c:2,r:3,label:"orders heap",sub:"8 KB pages",k:"disk"},
    idx:{c:1,r:3,label:"Index file",sub:"idx_orders_customer",k:"disk"},
    vm:{c:0,r:3,label:"Visibility map",sub:"all-visible pages",k:"meta"}
  },
  steps:[
    {f:"client",t:"backend",title:"SELECT arrives",body:"The backend parses the query, resolves names against the catalog, and the rewriter expands any views or rules.",code:"SELECT id, amount, status\nFROM orders\nWHERE customer_id = 42\nORDER BY created_at DESC\nLIMIT 20;",add:[["client","Query parsed"]]},
    {f:"backend",t:"planner",title:"Plan candidates",body:"The planner considers a Seq Scan, an Index Scan on <code>idx_orders_customer</code>, a Bitmap Heap Scan, and how to satisfy ORDER BY + LIMIT.",add:[["memory","3 candidate paths"]]},
    {f:"stats",t:"planner",title:"Estimate rows and cost",body:"From <code>pg_stats</code> (n_distinct, most common values) it expects ~35 rows for customer 42. Using <code>random_page_cost</code> and <code>seq_page_cost</code>, the index scan is far cheaper than reading 2 M pages.",code:"Limit  (cost=0.43..86.10 rows=20)\n  ->  Index Scan using idx_orders_customer on orders\n        Index Cond: (customer_id = 42)",add:[["memory","Plan: Index Scan, est. 35 rows"]]},
    {f:"planner",t:"executor",title:"Executor runs the plan tree",body:"Each node pulls rows from the node below it, one at a time (Limit pulls from Index Scan). Execution can stop early once Limit has its 20 rows.",add:[["memory","Executor started"]]},
    {f:"executor",t:"snapshot",title:"Take a snapshot",body:"Under READ COMMITTED each statement gets a fresh snapshot: the lowest running XID, the next XID, and the list of transactions in progress. Plain SELECTs take no row locks.",add:[["memory","Snapshot: xmin 7838, xmax 7850, active {7841}"]]},
    {f:"executor",t:"sb",title:"Ask for the index pages",body:"The backend looks up each needed page in the buffer mapping table. A hit costs a pin and a lock; a miss needs a free buffer, chosen by the clock-sweep algorithm.",add:[["memory","Root + branch pages: buffer hits"]]},
    {f:"idx",t:"os",title:"A miss goes to the kernel",body:"The leaf page isn't in shared buffers, so Postgres issues an 8 KB read. The OS page cache may already have it (that's why <code>effective_cache_size</code> counts OS memory too); otherwise it comes from disk.",add:[["disk","Leaf page read from disk"]]},
    {f:"os",t:"sb",title:"Page enters shared buffers",body:"The page is copied into a shared buffer and becomes visible to every backend. It stays until clock sweep evicts it. EXPLAIN (BUFFERS) counts this as <b>shared read</b>; cached pages are <b>shared hit</b>.",add:[["memory","Leaf page cached"]]},
    {f:"sb",t:"executor",title:"Walk the B-tree leaf",body:"The leaf holds (customer_id, ctid) entries in order. The executor gets TIDs like <code>(42,9)</code> and <code>(118,3)</code>; the index alone doesn't say whether those versions are visible.",add:[["memory","35 TIDs for customer 42"]]},
    {f:"heap",t:"sb",title:"Fetch heap tuples by TID",body:"For each TID the matching heap page is read (often random I/O). This is the cost an Index-Only Scan avoids when all needed columns are in the index.",add:[["disk","Heap pages 42, 118, … read"]]},
    {f:"executor",t:"xact",title:"Check visibility (MVCC)",body:"Each tuple version is checked against the snapshot. Tuple (42,9) has <code>xmin 7841</code>, which is still in the active list, so it's invisible; its older version (42,7) is visible instead. Hint bits on tuples save repeated pg_xact lookups.",add:[["memory","Old version of id 1001 returned"]]},
    {f:"vm",t:"executor",title:"Index-only scans use the visibility map",body:"If the index covered all columns (e.g. <code>INCLUDE (amount, status)</code>), the executor checks the visibility map: for all-visible pages it skips the heap entirely. Vacuum keeps this map fresh, which is why vacuum matters for read speed too.",add:[["catalog","VM: 96% pages all-visible"]]},
    {f:"executor",t:"client",title:"Rows stream back",body:"Rows are sent as they're produced. <code>EXPLAIN (ANALYZE, BUFFERS)</code> shows actual rows, time, and buffers hit vs read for each node: the first place to look when a query is slow.",code:"Index Scan ... (actual rows=20 loops=1)\n  Buffers: shared hit=31 read=6",add:[["client","20 rows returned"]]}
  ]
},
"redshift-write": {
  tab:"Redshift", sub:"write",
  intro:"<b>COPY from S3 into a table.</b> Redshift loads in parallel on every slice, routes each row to the slice that owns its DISTKEY, writes compressed 1 MB column blocks, and commits once for the whole cluster.",
  nodes:{
    client:{c:0,r:0,label:"ETL job",sub:"Airflow / dbt",k:"actor"},
    leader:{c:1,r:0,label:"Leader node",sub:"parse · plan · commit",k:"proc"},
    s3:{c:2,r:0,label:"S3 staging",sub:"64 Parquet files",k:"disk"},
    catalog:{c:0,r:1,label:"Catalog + locks",sub:"table metadata, xid",k:"meta"},
    slices:{c:1,r:1,label:"Compute slices",sub:"32 slices on 8 nodes",k:"proc"},
    net:{c:2,r:1,label:"Redistribution",sub:"hash on DISTKEY",k:"proc"},
    zmap:{c:0,r:3,label:"Zone maps",sub:"min/max per block",k:"meta"},
    local:{c:1,r:2,label:"Column blocks",sub:"1 MB, local SSD",k:"disk"},
    rms:{c:2,r:2,label:"Managed storage",sub:"RMS on S3 (RA3)",k:"disk"},
    vacuum:{c:1,r:3,label:"Auto vacuum",sub:"background",k:"proc"},
    readers:{c:0,r:2,label:"Other queries",sub:"snapshot isolation",k:"actor"}
  },
  steps:[
    {f:"client",t:"leader",title:"COPY is submitted",body:"The usual pattern loads into a staging table, then MERGEs into the target in one transaction. COPY is far faster than INSERTs because every slice works in parallel.",code:"BEGIN;\nCOPY stg_payments\nFROM 's3://lake/exports/payments/2026-11-19/'\nIAM_ROLE 'arn:aws:iam::123456789012:role/rs-copy'\nFORMAT AS PARQUET;\nMERGE INTO payments USING stg_payments s\n  ON payments.payment_id = s.payment_id\nWHEN MATCHED THEN UPDATE SET status = s.status\nWHEN NOT MATCHED THEN INSERT VALUES (...);\nCOMMIT;",add:[["client","COPY started"]]},
    {f:"leader",t:"catalog",title:"Start a transaction, take locks",body:"The leader parses the statement, checks privileges, and takes a write lock on the target table. Readers are not blocked: they keep reading the last committed version.",add:[["catalog","xid 92210, write lock on stg_payments"]]},
    {f:"leader",t:"slices",title:"Plan and hand out files",body:"The leader compiles the load into code and splits the file list across slices. 64 files on 32 slices = 2 files each, so every slice is busy. One big gzip file would be read by a single slice.",add:[["network","2 files per slice"]]},
    {f:"s3",t:"slices",title:"Every slice reads in parallel",body:"Each slice downloads its files and parses rows (Parquet columns map by name with <code>FORMAT AS PARQUET</code>). Errors go to <code>sys_load_error_detail</code>.",add:[["memory","4.1 M rows parsed across 32 slices"]]},
    {f:"slices",t:"net",title:"Route rows by DISTKEY",body:"With <code>DISTKEY(payment_id)</code>, each row's key is hashed to pick its owning slice. With EVEN, rows are spread round-robin; with ALL, every node gets a full copy (why ALL suits only small tables).",add:[["network","Rows hashed to owning slices"]]},
    {f:"net",t:"slices",title:"Rows arrive at their slice",body:"Most rows travel to another node. After this step, all rows for a given payment_id live on one slice, so later joins on payment_id can run with no movement (DS_DIST_NONE).",add:[["memory","Each slice holds its share (~128k rows)"]]},
    {f:"slices",t:"local",title:"Encode into column blocks",body:"Each column is compressed with its encoding (AZ64 for numbers and timestamps, ZSTD for text) and written as new <b>1 MB blocks</b>, appended to the table's <b>unsorted region</b>. Existing blocks are never edited: an UPDATE marks old rows deleted and writes new ones.",add:[["disk","New blocks in unsorted region"]]},
    {f:"local",t:"zmap",title:"Record zone maps",body:"For every new block, Redshift stores the min and max value. Later queries use these to skip blocks. Rows loaded in sort-key order give tight ranges; random order gives wide ones until vacuum sorts them.",add:[["catalog","Zone maps for 1,840 new blocks"]]},
    {f:"slices",t:"leader",title:"Slices report back, leader commits",body:"When every slice finishes (and the MERGE runs), the leader commits. Commits are <b>serialized cluster-wide</b> through a commit queue, which is why many tiny transactions are slow: batch your writes.",add:[["catalog","xid 92210 committed"]]},
    {f:"local",t:"rms",title:"Blocks are made durable",body:"On RA3, committed blocks are persisted to Redshift Managed Storage (S3-backed) and kept in the local SSD cache while hot. (Older DC2 nodes mirror blocks to another node and back up to S3.)",add:[["disk","Blocks persisted to RMS"]]},
    {f:"leader",t:"client",title:"COPY returns",body:"The job sees rows loaded. Check <code>sys_load_history</code> for timing per file and <code>stl_load_errors</code> if counts are off.",add:[["client","4,104,227 rows loaded"]]},
    {f:"catalog",t:"readers",title:"Readers see it after commit",body:"Queries that started before the commit keep their snapshot and don't see the new rows; queries after it do. No reader ever sees a half-loaded table.",add:[["client","New rows visible to new queries"]]},
    {f:"vacuum",t:"local",title:"Auto vacuum sorts and reclaims",body:"In quiet periods, automatic VACUUM merges the unsorted region into sort-key order and reclaims space from deleted rows; auto ANALYZE refreshes stats. Check <code>svv_table_info.unsorted</code> and <code>stats_off</code>.",add:[["disk","Unsorted 12% → 0%, stats fresh"]]}
  ]
},
"redshift-read": {
  tab:"Redshift", sub:"read",
  intro:"<b>A dashboard query on Redshift.</b> The leader plans and compiles it, every slice scans only the blocks it needs, rows move between nodes only when keys aren't collocated, and the leader merges the final result.",
  nodes:{
    client:{c:0,r:0,label:"BI dashboard",sub:"JDBC / Data API",k:"actor"},
    leader:{c:1,r:0,label:"Leader node",sub:"parse · optimize",k:"proc"},
    cache:{c:2,r:0,label:"Result cache",sub:"leader memory",k:"mem"},
    stats:{c:2,r:1,label:"Stats + catalog",sub:"keys · row counts",k:"meta"},
    compile:{c:0,r:1,label:"Compiled code",sub:"segments, cached",k:"proc"},
    wlm:{c:2,r:2,label:"WLM queue",sub:"auto WLM, SQA",k:"proc"},
    zmap:{c:0,r:2,label:"Zone maps",sub:"min/max per block",k:"meta"},
    slices:{c:1,r:2,label:"Compute slices",sub:"scan · join · aggregate",k:"proc"},
    net:{c:2,r:3,label:"Network",sub:"broadcast / redistribute",k:"proc"},
    local:{c:0,r:3,label:"Local SSD cache",sub:"hot column blocks",k:"disk"},
    rms:{c:1,r:3,label:"Managed storage",sub:"RMS on S3",k:"disk"}
  },
  steps:[
    {f:"client",t:"leader",title:"Query arrives at the leader",body:"Clients only talk to the leader. It parses the SQL and checks permissions.",code:"SELECT m.city, sum(p.amount) AS gmv\nFROM payments p\nJOIN merchants m ON m.merchant_id = p.merchant_id\nWHERE p.created_at >= '2026-11-18'\nGROUP BY m.city\nORDER BY gmv DESC;",add:[["client","Query received"]]},
    {f:"leader",t:"cache",title:"Check the result cache",body:"If the same query ran before and the tables haven't changed, the result comes straight from the cache: no compute nodes involved. Here the data changed after the last load, so it's a miss.",add:[["memory","Result cache miss"]]},
    {f:"stats",t:"leader",title:"Optimize with statistics",body:"The planner uses table stats, distribution and sort keys. <code>merchants</code> is DISTSTYLE ALL, so the join needs no data movement; the filter is on the leading sort key, so scans can skip blocks.",code:"XN Hash Join DS_DIST_ALL_NONE\n  ->  XN Seq Scan on payments p\n        Filter: (created_at >= '2026-11-18')\n  ->  XN Hash\n        ->  XN Seq Scan on merchants m",add:[["memory","Plan: DS_DIST_ALL_NONE join"]]},
    {f:"leader",t:"compile",title:"Compile into segments",body:"Plan steps (scan, hash, join, aggregate) are grouped into <b>segments</b> compiled to C++, and segments into <b>streams</b> that run in order. Compiled code is cached, so the first run of a new query shape is slower.",add:[["memory","3 streams, 7 segments (cache hit)"]]},
    {f:"leader",t:"wlm",bend:70,title:"Wait for a WLM slot",body:"Workload management assigns the query to a queue and memory. Short Query Acceleration lets predicted-short queries jump ahead; dashboards can get a higher-priority queue than ETL.",add:[["memory","Queue bi, priority high, 0 s wait"]]},
    {f:"wlm",t:"slices",title:"Segments go to every slice",body:"The same compiled code runs on every slice at once, each over its own share of the data. The query is only as fast as the slowest slice, so skewed distribution hurts.",add:[["network","Running on 32 slices"]]},
    {f:"zmap",t:"slices",title:"Skip blocks with zone maps",body:"For <code>created_at >= '2026-11-18'</code>, each slice checks min/max per block and skips blocks that can't match. Sorted data lets it skip ~97% of blocks (a range-restricted scan).",add:[["memory","Scanning 3% of created_at blocks"]]},
    {f:"rms",t:"local",title:"Missing blocks come from RMS",body:"On RA3, hot blocks sit on local SSD; cold ones are fetched from managed storage on first use, then cached. Only the <b>columns</b> the query uses are read: here 3 of 40.",add:[["disk","Cold blocks fetched into SSD cache"]]},
    {f:"local",t:"slices",title:"Read column blocks",body:"Slices decompress just <code>created_at</code>, <code>merchant_id</code> and <code>amount</code>, filter rows, and build or probe the join hash table.",add:[["memory","2.3 M matching rows across slices"]]},
    {f:"slices",t:"net",title:"Move data only if needed",body:"Here the join is local (merchants is ALL). Had both tables been EVEN, the plan would show <code>DS_DIST_INNER</code> or <code>DS_DIST_BOTH</code>: rows shipped between nodes, often the slowest part of the query.",add:[["network","No redistribution needed"]]},
    {f:"net",t:"slices",title:"Aggregate per slice",body:"Each slice groups its rows by city (partial aggregate). If a step runs out of memory it spills to disk: <code>svl_query_summary.is_diskbased = 't'</code>.",add:[["memory","Partial sums by city on each slice"]]},
    {f:"slices",t:"leader",title:"Leader merges the result",body:"Slices send partial results to the leader, which does the final aggregation and ORDER BY. Huge result sets without LIMIT bottleneck here.",add:[["memory","Final 42 rows sorted"]]},
    {f:"leader",t:"client",title:"Results returned (and cached)",body:"The dashboard gets its rows and the result is cached for identical repeats. For tuning, read <code>svl_query_summary</code>: rows and bytes per step, and which steps went to disk.",add:[["client","42 rows in 0.9 s"]]}
  ]
}

};
const ORDER = ["spark-stages","postgres-write","postgres-read","mysql-write","mysql-read","redshift-write","redshift-read","iceberg-write","iceberg-read","cdc"];

const PAD=24, COLW=210, ROWH=118, NW=186, NH=72;
const $ = id => document.getElementById(id);
const svg = $("svg");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let flowId = null, flow = null, cur = 0, playing = false, timer = null, raf = null, compact = null, centers = {};

function esc(s){return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}

function buildTabs(){
  $("tabs").innerHTML = ORDER.map(id => `<a href="#${id}" data-id="${id}">${FLOWS[id].tab}<small>${FLOWS[id].sub}</small></a>`).join("");
}

function geometry(){
  centers = {};
  const top = flow.top || 0;
  let maxR = 0;
  for (const [id,n] of Object.entries(flow.nodes)){
    centers[id] = {x: PAD + n.c*COLW + COLW/2, y: PAD + top + n.r*ROWH + NH/2};
    maxR = Math.max(maxR, n.r);
  }
  return {w: PAD*2 + 3*COLW, h: PAD*2 + top + maxR*ROWH + NH};
}

function clip(p, toward){
  const dx = toward.x - p.x, dy = toward.y - p.y;
  const s = Math.min((NW/2+5)/Math.max(Math.abs(dx),1e-6), (NH/2+5)/Math.max(Math.abs(dy),1e-6));
  return {x: p.x + dx*s, y: p.y + dy*s};
}

function edgePath(st){
  const A = centers[st.f], B = centers[st.t];
  const dx = B.x-A.x, dy = B.y-A.y, len = Math.hypot(dx,dy) || 1;
  const n = {x: -dy/len, y: dx/len};
  const off = 5, bend = st.bend || 0;
  const a = {x:A.x+n.x*off, y:A.y+n.y*off}, b = {x:B.x+n.x*off, y:B.y+n.y*off};
  const ctrl = {x:(a.x+b.x)/2 + n.x*bend, y:(a.y+b.y)/2 + n.y*bend};
  const s = clip(a, ctrl), e = clip(b, ctrl);
  return `M${s.x.toFixed(1)} ${s.y.toFixed(1)} Q${ctrl.x.toFixed(1)} ${ctrl.y.toFixed(1)} ${e.x.toFixed(1)} ${e.y.toFixed(1)}`;
}

function renderDiagram(){
  const {w,h} = geometry();
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  let out = `<defs>${["future","past","active"].map(c =>
    `<marker id="mk-${c}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="${c==="active"?5:6}" markerHeight="${c==="active"?5:6}" orient="auto-start-reverse"><path class="mk-${c}" d="M0 0 L10 5 L0 10 z"/></marker>`).join("")}</defs>`;
  out += `<g id="edges">` + flow.steps.map((st,i) => `<path id="e${i}" class="edge future" d="${edgePath(st)}" marker-end="url(#mk-future)"/>`).join("") + `</g>`;
  out += `<g id="nodes">`;
  for (const [id,n] of Object.entries(flow.nodes)){
    const c = centers[id], x = c.x-NW/2, y = c.y-NH/2;
    out += `<g class="node k-${n.k}" id="n-${id}"><rect class="box" x="${x}" y="${y}" width="${NW}" height="${NH}" rx="10"/>`+
      `<rect class="stripe" x="${x+8}" y="${y+14}" width="5" height="${NH-28}" rx="2.5"/>`;
    if (compact){
      out += `<text class="lbl" x="${c.x+5}" y="${c.y+8}" text-anchor="middle" style="font-size:22px">${esc(n.label)}</text>`;
    } else {
      out += `<text class="lbl" x="${c.x+5}" y="${c.y-3}" text-anchor="middle">${esc(n.label)}</text>`+
        `<text class="sub" x="${c.x+5}" y="${c.y+18}" text-anchor="middle">${esc(n.sub)}</text>`;
    }
    out += `</g>`;
  }
  out += `</g><circle id="halo" class="packet-halo" r="13" cx="-50" cy="-50"/><circle id="packet" class="packet" r="6.5" cx="-50" cy="-50"/>`;
  svg.innerHTML = out;
  const kinds = [...new Set(Object.values(flow.nodes).map(n => n.k))];
  $("legend").innerHTML = kinds.map(k => `<span><i style="background:var(--k-${k})"></i>${KIND_NAMES[k]}</span>`).join("");
}

function movePacket(i, animate){
  cancelAnimationFrame(raf);
  const path = $("e"+i), p = $("packet"), h = $("halo");
  if (!path) return;
  const len = path.getTotalLength();
  const place = t => { const pt = path.getPointAtLength(len*t); for (const el of [p,h]){ el.setAttribute("cx",pt.x); el.setAttribute("cy",pt.y);} };
  if (!animate || reduceMotion){ place(1); return; }
  const start = performance.now(), dur = 950;
  const tick = now => {
    const t = Math.min(1,(now-start)/dur), e = t<.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2;
    place(e);
    if (t<1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

function go(i, animate=true){
  const N = flow.steps.length;
  cur = Math.max(0, Math.min(N-1, i));
  const st = flow.steps[cur];
  flow.steps.forEach((_,j) => {
    const e = $("e"+j), cls = j===cur ? "active" : j<cur ? "past" : "future";
    e.setAttribute("class", "edge "+cls);
    e.setAttribute("marker-end", `url(#mk-${cls})`);
  });
  $("e"+cur).parentNode.appendChild($("e"+cur));
  for (const id of Object.keys(flow.nodes)){
    const g = $("n-"+id);
    g.classList.toggle("on", id===st.f || id===st.t);
  }
  movePacket(cur, animate);

  const fl = flow.nodes[st.f].label, tl = flow.nodes[st.t].label;
  $("card").innerHTML = `<p class="kicker">Step ${cur+1} · ${esc(fl)} <em>→</em> ${esc(tl)}</p><h2>${st.title}</h2><p>${st.body}</p>` +
    (st.code ? `<pre><code>${esc(st.code)}</code></pre>` : "");
  $("counter").textContent = `Step ${cur+1} of ${N}`;
  $("bar").style.width = ((cur+1)/N*100)+"%";
  $("prev").disabled = cur===0;
  $("next").disabled = cur===N-1;

  const items = [];
  flow.steps.slice(0,cur+1).forEach((s,j) => (s.add||[]).forEach(a => items.push({j, kind:a[0], text:a[1]})));
  $("state").innerHTML = items.map(it =>
    `<li class="${it.j===cur?"new":""}"><span class="num">${String(it.j+1).padStart(2,"0")}</span><span class="chip c-${it.kind}">${STATE_NAMES[it.kind]}</span><span class="txt">${esc(it.text)}</span></li>`).join("");

  [...$("steps").querySelectorAll("button")].forEach((b,j) => {
    b.className = j===cur ? "on" : j<cur ? "done" : "";
    b.setAttribute("aria-current", j===cur ? "step" : "false");
  });
}

function stop(){ playing=false; clearTimeout(timer); $("play").textContent = "Play"; }
function play(){
  if (cur >= flow.steps.length-1) go(0);
  playing = true; $("play").textContent = "Pause";
  const tick = () => {
    timer = setTimeout(() => {
      if (!playing) return;
      if (cur < flow.steps.length-1){ go(cur+1); tick(); } else stop();
    }, 2800);
  };
  tick();
}

function showMode(m){
  if (m !== "flows" && typeof stop === "function") stop();
  $("flowsView").hidden = m!=="flows";
  $("courseView").hidden = m!=="courses";
  [["modeFlows","flows"],["modeCourses","courses"]].forEach(([id, k]) => {
    if (m === k) $(id).setAttribute("aria-current","page"); else $(id).removeAttribute("aria-current");
  });
  if (m === "flows") document.title = "Data flows · Dagdeep";
}

function loadFlow(id){
  if (!FLOWS[id]) id = ORDER[0];
  stop();
  flowId = id; flow = FLOWS[id];
  [...$("tabs").querySelectorAll("a")].forEach(a => { if (a.dataset.id===id) a.setAttribute("aria-current","page"); else a.removeAttribute("aria-current"); });
  showMode("flows");
  $("modeFlows").href = "#"+id;
  compact = $("diagramWrap").clientWidth < 560;
  $("intro").innerHTML = flow.intro;
  $("steps").innerHTML = flow.steps.map((s,j) => `<li><button data-j="${j}">${s.title}</button></li>`).join("");
  renderDiagram();
  go(0, false);
}

function route(){
  const h = location.hash.slice(1);
  if (FLOWS[h]) loadFlow(h);
  else loadQuest(h);
}

function checkCompact(){
  if ($("flowsView").hidden) return;
  const c = $("diagramWrap").clientWidth < 560;
  if (c !== compact){ compact = c; if (flow){ const k = cur; renderDiagram(); go(k,false); } }
}

/* ---------- Shared text helpers (used by courses) ---------- */
/* ----- text helpers ----- */
const LVL = {B:"Fundamentals", I:"Intermediate", S:"Senior"};
function inl(t){ return esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/«(.+?)»/g, "<code>$1</code>"); }
function md(src){
  const out = []; let para = [], list = null, code = null, block = null, table = null, sec = 0;
  const flushP = () => { if (para.length){ out.push(`<p>${inl(para.join(" "))}</p>`); para = []; } };
  const flushL = () => { if (list){ out.push(`<${list.t}>${list.items.map(i => `<li>${inl(i)}</li>`).join("")}</${list.t}>`); list = null; } };
  const flushT = () => { if (table){ const [h, ...rows] = table; out.push(`<div class="tbl"><table><thead><tr>${h.map(c => `<th>${inl(c)}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inl(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`); table = null; } };
  const flushAll = () => { flushP(); flushL(); flushT(); };
  const stepOf = l => { const [a, b] = l.split(" :: "); return b ? [a.trim(), b.trim()] : a.trim(); };
  const endBlock = () => {
    const {kind, title, lines} = block;
    if (kind === "flow") out.push(`<figure class="dflow">${title ? `<figcaption>${inl(title)}</figcaption>` : ""}${flowHTML(lines.filter(l => l.trim()).map(stepOf))}</figure>`);
    else if (kind === "lanes"){
      const lanes = []; lines.forEach(l => { if (l.startsWith("# ")) lanes.push({label:l.slice(2), steps:[]}); else if (l.trim() && lanes.length) lanes[lanes.length-1].steps.push(stepOf(l)); });
      out.push(`<figure class="dflow">${title ? `<figcaption>${inl(title)}</figcaption>` : ""}${flowHTML(lanes)}</figure>`);
    } else out.push(`<aside class="callout c-${kind}"><p class="c-h">${inl(title || {note:"Note", tip:"Tip", warn:"Watch out"}[kind])}</p>${lines.filter(l => l.trim()).map(l => `<p>${inl(l)}</p>`).join("")}</aside>`);
    block = null;
  };
  for (const line of src.split("\n")){
    if (code !== null){ if (line.startsWith("~~~")){ out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`); code = null; } else code.push(line); continue; }
    if (block){ if (line.trim() === ":::") endBlock(); else block.lines.push(line); continue; }
    let m;
    if (line.startsWith("~~~")){ flushAll(); code = []; continue; }
    if ((m = line.match(/^:::(flow|lanes|note|tip|warn)\s*(.*)$/))){ flushAll(); block = {kind:m[1], title:m[2].trim(), lines:[]}; continue; }
    if (line.startsWith("|")){
      flushP(); flushL();
      if (/^\|[\s:|-]+\|?\s*$/.test(line)) continue;
      (table = table || []).push(line.replace(/^\||\|\s*$/g, "").split("|").map(c => c.trim()));
      continue;
    }
    flushT();
    if (line.startsWith("## ")){ flushP(); flushL(); out.push(`<h5 data-sec="${sec++}">${inl(line.slice(3))}</h5>`); }
    else if (line.startsWith("### ")){ flushP(); flushL(); out.push(`<h6>${inl(line.slice(4))}</h6>`); }
    else if ((m = line.match(/^- (.*)/))){ flushP(); if (!list || list.t !== "ul"){ flushL(); list = {t:"ul", items:[]}; } list.items.push(m[1]); }
    else if ((m = line.match(/^\d+\. (.*)/))){ flushP(); if (!list || list.t !== "ol"){ flushL(); list = {t:"ol", items:[]}; } list.items.push(m[1]); }
    else if (!line.trim()){ flushP(); flushL(); }
    else { flushL(); para.push(line.trim()); }
  }
  if (block) endBlock();
  flushAll();
  return out.join("");
}
function tocOf(src){ return src.split("\n").filter(l => l.startsWith("## ")).map(l => l.slice(3)); }
function iqHTML(q, open){
  return `<details class="iq"${open ? " open" : ""}><summary><span class="lvl lvl-${q[0]}">${LVL[q[0]]}</span>${inl(q[1])}</summary><div class="ans">${inl(q[2])}</div></details>`;
}
function flowHTML(fl){
  const step = (s, i) => { const [a, b] = Array.isArray(s) ? s : [s, ""]; return `<li data-n="${i+1}" style="--i:${i}"><div class="fs"><b>${esc(a)}</b>${b ? `<span>${esc(b)}</span>` : ""}</div></li>`; };
  const lane = steps => `<ol class="flane">${steps.map(step).join("")}</ol>`;
  if (fl[0] && fl[0].steps) return `<div class="flow lanes">${fl.map(l => `<div class="lane"><p class="lane-label">${esc(l.label)}</p>${lane(l.steps)}</div>`).join("")}</div>`;
  return `<div class="flow">${lane(fl)}</div>`;
}

$("prev").onclick = () => { stop(); go(cur-1); };
$("next").onclick = () => { stop(); go(cur+1); };
$("restart").onclick = () => { stop(); go(0); };
$("play").onclick = () => playing ? stop() : play();
$("steps").addEventListener("click", e => { const b = e.target.closest("button"); if (b){ stop(); go(+b.dataset.j); } });
document.addEventListener("keydown", e => {
  if (e.target.closest("input,textarea") || $("flowsView").hidden) return;
  if (e.key==="ArrowRight"){ stop(); go(cur+1); }
  if (e.key==="ArrowLeft"){ stop(); go(cur-1); }
});
window.addEventListener("hashchange", route);
let rz; window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(checkCompact, 150); });

buildTabs();
route();
