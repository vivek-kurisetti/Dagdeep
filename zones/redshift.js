QUEST.zone("redshift", {
mission:["meera","My finance dashboards hit Redshift and some queries take 4 minutes. Help me understand how Redshift stores and moves data, then let's make them fly."],
levels:[
{t:"Architecture", sub:"Leader, compute, slices", rounds:[
 ["learn","MPP with a leader","The **leader node** parses SQL, plans and coordinates. **Compute nodes** are split into **slices**; each slice holds part of every table and runs part of every query in parallel. **RA3** nodes keep data in managed storage on S3 with a local SSD cache.",["Client sends SQL to leader","Leader plans, compiles segments","Slices run in parallel","Leader merges results"]],
 ["learn","Columnar + zone maps","Each column is stored in 1 MB blocks with compression. Each block's min/max (**zone map**) lets Redshift skip blocks when you filter on a sorted column."],
 ["match","Redshift building blocks",[["Leader node","Plans queries and returns results"],["Slice","Parallel unit of work and storage"],["RA3 managed storage","Data on S3, hot blocks cached on SSD"],["Redshift Serverless","Capacity in RPUs, pay per use"],["Redshift Spectrum","Query S3 tables via external schema"]],"Know the pieces."],
 ["tf","Architecture facts",[["Redshift stores data row by row.",false,"It's columnar."],["RA3 lets you scale storage separately from compute.",true,"Data lives in managed storage."],["Concurrency scaling adds clusters for bursts of queries.",true,"Charged per second beyond free credits."]]]
]},
{t:"Distribution", sub:"Where rows live", rounds:[
 ["learn","Distribution styles","**KEY**: rows with the same key on the same slice (collocated joins). **ALL**: full copy on every node (small dimensions). **EVEN**: round-robin. **AUTO** (default): Redshift chooses and adapts."],
 ["sort","Which distribution style?",{"KEY (on join key)":["Big fact joined on customer_id","Two big tables always joined on order_id"],"ALL":["Small currency dimension","Country lookup table"],"EVEN":["Staging table with no joins"]},"Collocate the big join; copy the small dims."],
 ["learn","Redistribution is a shuffle","If join keys aren't collocated, Redshift moves rows at query time. EXPLAIN shows «DS_DIST_NONE» (good), «DS_BCAST_INNER» (broadcast inner table) or «DS_DIST_BOTH» (redistribute both: expensive)."],
 ["pick","EXPLAIN shows DS_DIST_BOTH on a fact × fact join. Best fix?",["Distribute both tables by the join key","Make both ALL","Add a sort key only","VACUUM"],0,"Same DISTKEY on both makes the join local."],
 ["pick","DISTKEY on a column where 40% of rows are 'UNKNOWN'. Problem?",["None","Data skew: one slice does most of the work","Better compression","Faster COPY"],1,"Pick high-cardinality, evenly spread keys. Check svv_table_info.skew_rows."]
]},
{t:"Sort keys & tuning", sub:"Skip blocks", rounds:[
 ["learn","Sort keys skip blocks","A **compound sort key** orders by the columns in sequence; filters on the leading column(s) prune blocks via zone maps. **Interleaved** weights columns equally but costs more maintenance. **AUTO** lets Redshift decide."],
 ["pick","Dashboards always filter on created_at, sometimes also merchant_id. Sort key?",["COMPOUND (created_at, merchant_id)","COMPOUND (merchant_id, created_at)","No sort key","INTERLEAVED on 6 columns"],0,"Lead with the column used in every filter."],
 ["learn","Encoding and maintenance","Use **AZ64** for numbers and dates, **ZSTD** for text (ENCODE AUTO picks). **VACUUM** re-sorts and reclaims deleted rows; **ANALYZE** refreshes statistics. Auto vacuum/analyze run in the background, but big loads may need a manual run."],
 ["match","Command → effect",[["VACUUM SORT ONLY","Re-sort unsorted rows"],["VACUUM DELETE ONLY","Reclaim space from deleted rows"],["ANALYZE","Refresh planner statistics"],["ANALYZE COMPRESSION","Suggest column encodings"]],"Keep tables sorted and stats fresh."],
 ["learn","Materialized views","Precompute expensive joins/aggregations; **AUTO REFRESH** keeps them fresh incrementally where possible, and **automatic query rewrite** can use them for matching queries."],
 ["tf","Tuning facts",[["DELETE immediately frees disk space.",false,"Rows are marked deleted until VACUUM."],["Result caching returns repeated queries instantly if data didn't change.",true,"The leader caches results."],["Wrapping a sort-key column in a function can stop block skipping.",true,"Filter on the raw column."]]]
]},
{t:"Loading & WLM", sub:"COPY, queues, Spectrum", rounds:[
 ["learn","COPY loads in parallel","«COPY» reads from S3 in parallel across slices. Split input into files that are a **multiple of the number of slices**, sized roughly 1 MB–1 GB after compression. Single-row INSERTs are very slow."],
 ["fill","Load Parquet from S3",'COPY pay.payments\nFROM \'s3://lake/payments/dt=2026-11-17/\'\nIAM_ROLE \'arn:aws:iam::123:role/rs\'\nFORMAT AS ___;',["PARQUET"],["CSV","INSERT","JSONL"],"Columnar files load fastest."],
 ["pick","A job inserts 2 million rows one INSERT at a time. Fix?",["Stage to S3 and COPY","More WLM slots","VACUUM","Change DISTKEY"],0,"COPY is built for bulk loads."],
 ["learn","Workload management","**Auto WLM** manages memory and concurrency; **query priorities** (highest…lowest) favour dashboards over batch. **Short query acceleration** runs quick queries ahead. **Concurrency scaling** adds capacity for bursts."],
 ["learn","Spectrum and zero-ETL","**Spectrum** queries S3 data (Parquet, Iceberg) through an external schema in the Glue Catalog. **Zero-ETL** integrations replicate Aurora/RDS MySQL/Postgres and DynamoDB into Redshift without pipelines."],
 ["order","Upsert a staging batch (classic pattern)",["COPY new rows into a staging table","BEGIN transaction","DELETE target rows that match staging keys","INSERT all staging rows into target","COMMIT and drop staging"],"Or use MERGE, now supported natively."]
]},
{t:"Boss: The 4-minute dashboard", boss:true, time:30, rounds:[
 ["pick","EXPLAIN: DS_DIST_BOTH joining orders and payments. Fix?",["Same DISTKEY (order_id) on both","ALL on both","More nodes","VACUUM"],0,"Collocate."],
 ["pick","Query filters by date but scans every block. Sort key is (merchant_id). Fix?",["Compound sort key leading with the date","Interleaved on merchant_id","DISTSTYLE ALL","Disable compression"],0,"Lead with the filter column."],
 ["pick","Table has 30% deleted rows and queries slowed. Fix?",["VACUUM DELETE then ANALYZE","More WLM slots","Change DISTKEY","Spectrum"],0,"Reclaim and refresh."],
 ["pick","Dashboards queue behind nightly ETL. Fix?",["WLM query priorities / concurrency scaling","Bigger COPY files","Interleaved keys","Drop indexes"],0,"Isolate and prioritise."],
 ["pick","The same heavy aggregation runs 500 times a day. Fix?",["Materialized view with auto refresh","More nodes","VACUUM","EVEN distribution"],0,"Precompute it once."],
 ["pick","Analysts need 3 years of cold history rarely. Cheapest?",["Keep it in S3 and query with Spectrum","Load all into RA3","Use ALL distribution","Copy to DynamoDB"],0,"Pay for scans only when needed."]
]}
]});

QUEST.more("redshift", [
{act:"Expert", t:"Query execution internals", sub:"Streams, segments, steps", rounds:[
 ["learn","From SQL to compiled segments","The leader node turns a plan into **streams** (groups of segments that run in parallel), **segments** (compiled units each slice executes) and **steps** (scan, hash, join, aggregate, redistribute). Segments are compiled to machine code and **cached**.",["Parse + optimize on leader","Plan → streams → segments → steps","Compile segments (or reuse cache)","Each slice runs segments in parallel","Leader assembles results"],null,`### Compilation
The first run of a new query shape can spend seconds compiling; later runs reuse the **compile cache** (also shared across clusters via a serverless compilation cache). Parameterised dashboard queries benefit; constantly changing SQL text doesn't.

### Reading EXPLAIN
- «XN Seq Scan» with a «Filter»: is the filter on the leading sort key so zone maps can skip blocks?
- «Hash» + «Hash Join»: the inner (hashed) side should be the smaller one.
- «Merge Join»: only when both tables are distributed **and sorted** on the join key — the fastest join.
- Redistribution labels: «DS_DIST_NONE» / «DS_DIST_ALL_NONE» (no movement), «DS_BCAST_INNER» (inner table copied to all nodes), «DS_DIST_INNER» / «DS_DIST_OUTER» (one side redistributed), «DS_DIST_ALL_INNER», «DS_DIST_BOTH» (both sides moved — worst).

### After the run
System views («SYS_QUERY_DETAIL», «SVL_QUERY_SUMMARY») show per-step rows, bytes and whether a step was **disk-based** («is_diskbased = 't'»): a hash or sort that spilled because the query's memory slot was too small.`],
 ["match","EXPLAIN label",[["DS_DIST_NONE","Join is collocated, no data moved"],["DS_BCAST_INNER","Inner table broadcast to every node"],["DS_DIST_BOTH","Both tables redistributed: expensive"],["Merge Join","Both sides distributed and sorted on the join key"]],"Read the plan before changing keys."],
 ["pick","A hash join step shows is_diskbased = 't'. Meaning?",["The hash table spilled to disk: not enough memory for the query","Data was read from S3","The cache was used","Join was collocated"],0,"Give the query more memory (WLM/priority), reduce rows before joining, or fix the join keys."],
 ["learn","Minimum table size","Redshift allocates at least one **1 MB block per column per slice** for tables that use EVEN or KEY distribution — and every table has **3 hidden columns** (row id, transaction ids).",null,null,`### The maths
Minimum size ≈ 1 MB × (user columns + 3) × number of slices (per sort-key region). A 20-column table on 32 slices: (20 + 3) × 32 = **736 MB** even with one row.

### Consequences
- Hundreds of tiny staging tables on a big cluster waste a lot of disk.
- **DISTSTYLE ALL** tables are stored on the first slice of each node (copy per node), not per slice.
- **AUTO** distribution starts small tables as ALL and switches to EVEN as they grow.

### Unsorted region and VACUUM
New rows land in an **unsorted region** at the end. Zone maps there overlap, so scans can't skip them. Automatic vacuum sort runs in the background; «VACUUM … TO 99 PERCENT» forces it. For massive changes, a **deep copy** («CREATE TABLE new (LIKE old); INSERT INTO new SELECT * FROM old;») is often faster than VACUUM.`],
 ["num","A 20-column EVEN-distributed table on a cluster with 32 slices. Minimum disk footprint?",736,0,"MB","(20 + 3 hidden columns) × 32 slices × 1 MB = 736 MB."],
 ["tf","Execution truths",[["Repeated query shapes skip compilation by using the compile cache.",true,"First run pays."],["Merge join needs both tables sorted and distributed on the join key.",true,"Otherwise hash join."],["DISTSTYLE ALL tables are stored once per slice.",false,"Once per node."]]]
]},
{act:"Expert", t:"Workload management deep", sub:"Auto WLM, QMR, scaling", rounds:[
 ["learn","Auto WLM and query monitoring rules","**Automatic WLM** decides concurrency and memory per query using predicted resource needs. You define **queues** with **priorities** and attach **query monitoring rules** (QMR) that act on runaway queries.",null,null,`### Query monitoring rules
Predicates on metrics such as «query_execution_time», «query_temp_blocks_to_disk», «scan_row_count», «nested_loop_join_row_count», «return_row_count», «query_cpu_time». Actions:
- **log**: record in «STL_WLM_RULE_ACTION».
- **hop**: move the query to the next matching queue (manual WLM).
- **change priority** (auto WLM).
- **abort**: kill it.
Classic rule: abort queries with a nested loop join producing > 1 billion rows (usually a missing join condition).

### Short query acceleration (SQA)
Predicts short queries and runs them in a dedicated space so dashboards don't wait behind ETL.

### Concurrency scaling
When queued, eligible queries run on transient **concurrency-scaling clusters**. Each cluster accrues **one hour of free credits per 24 hours** of main-cluster use; beyond that it's billed per second. Supports reads and many writes (COPY, INSERT, CTAS…).

### Redshift Serverless
Capacity in **RPUs** with a configurable **base capacity** (minimum) and **max capacity**, billed per RPU-hour while queries run. Use **usage limits** to cap spend; AI-driven scaling can adjust capacity by price-performance target.`],
 ["fill","Kill runaway cross joins with a QMR (JSON, manual WLM)",'"rules": [{\n  "rule_name": "kill_cartesian",\n  "predicate": [{"metric_name": "___", "operator": ">", "value": 1000000000}],\n  "action": "___"\n}]',["nested_loop_join_row_count","abort"],["scan_row_count","hop","log_only"],"Nested loops with a billion rows are almost always a missing join condition."],
 ["sort","Which tool?",{"Query priority / separate queue":["Finance dashboards must beat nightly ETL"],"Concurrency scaling":["Monday 9 AM burst of 200 reports"],"QMR abort":["Analyst's accidental cartesian join"],"SQA":["Many 2-second lookups stuck behind long queries"]},"Each solves a different contention problem."],
 ["num","Main cluster runs 24 h; concurrency scaling used for 3 hours that day. Free credit covers 1 hour. Billed concurrency-scaling hours?",2,0,"hours","3 used − 1 hour of free credit earned per 24 h = 2 billed hours (per scaling cluster)."],
 ["tf","WLM truths",[["Auto WLM sets memory per query based on predicted needs.",true,"No fixed slots."],["QMR can only log, never abort.",false,"Abort is an action."],["Serverless base capacity is the minimum RPUs used for queries.",true,"Raise it for faster queries, at higher cost."]]]
]},
{act:"Expert", t:"Data movement features", sub:"Streaming, MVs, data sharing", rounds:[
 ["learn","Streaming ingestion and incremental MVs","Redshift can ingest **Kinesis Data Streams or MSK** directly into a **materialized view** — no S3 staging. Refreshing the view pulls new records from the stream.",null,null,`### Streaming ingestion
~~~
CREATE EXTERNAL SCHEMA kafka FROM MSK IAM_ROLE '...' AUTHENTICATION iam CLUSTER_ARN '...';
CREATE MATERIALIZED VIEW payments_stream AUTO REFRESH YES AS
SELECT kafka_partition, kafka_offset, kafka_timestamp,
       JSON_PARSE(kafka_value) AS payload
FROM kafka."payments";
~~~
Latency of seconds to low minutes; then transform with SQL or incremental MVs downstream.

### Incremental refresh
Materialized views refresh **incrementally** when the definition uses supported constructs (joins, filters, GROUP BY with SUM/COUNT/MIN/MAX/AVG…). Unsupported ones (e.g. some window functions, LIMIT, certain DISTINCT forms) force a **full recompute** on each refresh. «SVV_MV_INFO» shows state; check whether refresh is incremental.

### Automatic query rewrite
With «mv_enable_aqmv_for_session» (on by default), queries against base tables can be rewritten to use a matching MV transparently.

### Data sharing
Producers share live data (databases, schemas, tables, views) with other Redshift clusters or Serverless workgroups, even across accounts/regions, with **no copies**. Consumers query with their own compute — perfect for isolating heavy teams from ETL.`],
 ["sort","Incremental refresh likely or full recompute?",{"Incremental":["SUM(amount) GROUP BY merchant_id, dt over a join with a dimension","COUNT(*) per status"],"Full recompute":["MV with a window function like ROW_NUMBER()","MV with ORDER BY … LIMIT 10"]},"Keep MV definitions simple to keep refreshes cheap."],
 ["match","Need → feature",[["Kafka into Redshift in seconds","Streaming ingestion into an MV"],["Marketing team needs live tables without slowing ETL","Data sharing to their own workgroup"],["Dashboards query base tables but should hit the MV","Automatic query rewrite"],["Aurora MySQL replicated without pipelines","Zero-ETL integration"]],"Fewer pipelines, fewer copies."],
 ["pick","An MV with ROW_NUMBER() takes 40 minutes to refresh every 15 minutes. Fix?",["Rewrite the logic so the MV uses incremental-friendly aggregates; do ranking at query time","Refresh more often","Add DISTKEY to MV only","Disable auto refresh"],0,"Window functions force full recomputes."],
 ["tf","Data movement truths",[["Data sharing copies tables to the consumer.",false,"Live access, no copies."],["Streaming ingestion needs S3 staging.",false,"Reads Kinesis/MSK directly."]]]
]},
{act:"Expert", t:"Physical design playbook", sub:"Choosing keys with evidence", rounds:[
 ["learn","Choose keys from the workload","Redshift's **Automatic Table Optimization** recommends and applies DISTKEY/SORTKEY changes based on query history, but you should understand why.",null,null,`### Distribution
- Choose the **join column of your largest, most frequent join** between big tables, if it's high-cardinality and evenly spread.
- Check skew: «SELECT "table", skew_rows FROM svv_table_info ORDER BY skew_rows DESC». A skew_rows of 5 means the fullest slice has 5× the rows of the emptiest — that slice sets query time.
- Dimension under a few million rows → ALL. Everything else with no dominant join → EVEN (or AUTO).

### Sort keys
- Lead with the column used in **range filters** of most queries (usually a timestamp).
- Add a second column used in equality filters if most queries filter on both.
- Avoid putting high-cardinality, randomly-distributed columns first — zone maps won't help.

### Compression
ENCODE AUTO: AZ64 for numeric/date/time, LZO/ZSTD for strings. Keep the **first sort key column uncompressed (RAW)** only in rare edge cases; modern ATO handles it.

### Checking effectiveness
«SVV_TABLE_INFO» (unsorted %, stats_off, skew), «SYS_QUERY_DETAIL» (blocks read vs skipped), «STL_ALERT_EVENT_LOG» (missing stats, nested loops, very selective filters).`],
 ["num","svv_table_info shows skew_rows = 4 for a fact table. The busiest slice takes 120 s on a query. Roughly how long would the slowest slice take if data were perfectly even?",30,2,"s","With 4× more rows on the busiest slice than the emptiest, evening it out could cut the slowest slice to roughly a quarter: ~30 s. Parallelism is only as fast as the slowest slice."],
 ["order","Diagnose a slow join",["EXPLAIN: find DS_DIST_BOTH / DS_BCAST on a big table","Check svv_table_info skew and DISTKEYs","Align DISTKEY on the join column (or ALL for small dims)","Check sort keys for the filters","Re-run and confirm DS_DIST_NONE + fewer blocks scanned"],"Evidence first, then change."],
 ["tf","Design truths",[["A DISTKEY with heavy skew can be worse than EVEN.",true,"One slice does most of the work."],["STL_ALERT_EVENT_LOG flags missing statistics and nested loops.",true,"A free tuning to-do list."]]]
]},
{act:"Expert", t:"Expert boss: Redshift deep audit", boss:true, time:45, rounds:[
 ["pick","Dashboards are slow on first load each morning, then fast. Likely?",["Segment compilation after query text changes; parameterise SQL","Disk full","Skew","VACUUM"],0,"Compile cache reuse needs stable query shapes."],
 ["pick","200 tiny staging tables use 150 GB on a 64-slice cluster. Why?",["Minimum 1 MB per column per slice","Compression off","Spectrum","Concurrency scaling"],0,"Small tables still allocate blocks per slice."],
 ["pick","Hash join steps are disk-based during ETL. Fix?",["Give the ETL queue more memory/priority or reduce join inputs","More nodes only","Interleaved sort keys","Turn on SQA"],0,"Spills mean not enough memory per query."],
 ["pick","An analyst's query ran 4 hours with a nested loop. Prevent?",["QMR abort on nested_loop_join_row_count","More slices","Result cache","Data sharing"],0,"Guardrails for runaway queries."],
 ["pick","MSK events must be queryable in Redshift within a minute without S3. Use…",["Streaming ingestion MV with auto refresh","COPY every minute","Spectrum","Zero-ETL from Aurora"],0,"Direct stream ingestion."],
 ["pick","An MV refresh is a full recompute every time. Check first…",["Whether the definition uses incremental-incompatible constructs","Distribution style","WLM","Compile cache"],0,"Keep MVs incremental."],
 ["pick","Data science queries slow down ETL on the main cluster. Fix without copying data?",["Data sharing to a separate workgroup","CTAS copies","More queues only","Spectrum"],0,"Separate compute, same data."]
]}
]);
