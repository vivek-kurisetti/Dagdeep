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

/* ===== On-call desk: Redshift incident ===== */
QUEST.cases("redshift", [
{
 title:"The 9 AM dashboard takes 6 minutes", icon:"🧭", sev:3, clock:"09:12", channel:"inc-2350-exec-dashboard-slow", svc:"exec-dashboard · Redshift ra3.4xlarge × 4", need:4,
 terms:[["Slice / node","Redshift splits each node into slices; every table's rows are spread across all slices."],["Distribution style","How rows are spread: KEY (by a column), EVEN (round-robin), ALL (full copy on every node), AUTO."],["DISTKEY","With KEY distribution, rows with the same value land on the same slice, so joins on that column need no data movement."],["DS_BCAST_INNER / DS_DIST_BOTH","EXPLAIN labels for data movement: broadcasting a whole table to every node, or reshuffling both sides of a join."],["SORTKEY","The order rows are stored in, so range filters (e.g. on dates) can skip blocks."],["Disk-based step","A query step whose working memory overflowed, so it spilled to disk. Slow."],["stats_off / ANALYZE","How stale the planner's statistics are; ANALYZE refreshes them."]],
 deep:[{"t": "Distribution styles and join movement", "md": "| EXPLAIN label | Meaning | Cost |\n|---|---|---|\n| «DS_DIST_NONE» | Rows already co-located (same DISTKEY) | Best |\n| «DS_DIST_ALL_NONE» | Inner table is DISTSTYLE ALL | Cheap |\n| «DS_BCAST_INNER» | Inner table copied to every node | Expensive if large |\n| «DS_DIST_INNER» / «DS_DIST_OUTER» | One side redistributed | Medium |\n| «DS_DIST_BOTH» | Both sides redistributed | Expensive |\n\nRule of thumb: DISTKEY the biggest fact table on its most common **join key** to the next-biggest table; ALL for small dimensions; EVEN or AUTO when there's no dominant join."}, {"t": "Sort keys, zone maps and ANALYZE", "md": "- Redshift stores 1 MB blocks with **min/max zone maps** per column. With «SORTKEY(order_date)», a 30-day filter skips almost every block.\n- Without a sort key (or with 100% unsorted rows), it scans everything.\n- «ANALYZE» updates statistics the planner uses for join order, distribution and memory grants. «stats_off» > 10 means stale.\n- «VACUUM SORT» re-sorts after many inserts; automatic vacuum and auto table optimization can help, but don't fix a missing design."}],
 impact:{"label": "Leaders waiting", "ic": "👔", "rate": 0.05, "start": 14},
 pager:`[y]WARN[/y]  exec-dashboard "Daily GMV by city" p95 load time [r]6m 12s[/r] (SLO 30s)
query     orders ⋈ customers, last 30 days, group by city
since     Monday 07:00
cluster   CPU 38%  ·  WLM queue wait 0.4s  ·  concurrency normal`,
 brief:"Leadership opens this dashboard at 9 AM every day. Over the weekend the data team **rebuilt the «orders» table** (2.1B rows) with a CTAS to add new columns. Nothing else changed.",
 slack:[
  {at:0, who:"arjun", t:"The CEO's dashboard is spinning for 6 minutes. Last week it loaded in 15 seconds. 😬"},
  {at:5, who:"priya", t:"Queue wait is tiny, so it's not WLM. The query itself got slower. Get its plan.", cmd:"psql -c \"EXPLAIN select c.city, sum(o.amount) from orders o join customers c on o.customer_id = c.customer_id where o.order_date >= current_date - 30 group by 1\""},
  {at:55, who:"dev", t:"Want me to resize to 8 nodes? Takes about 20 minutes."},
  {on:"bcast", who:"priya", t:"Broadcasting a 2-billion-row table to every node is the smoking gun. What does «orders» look like physically now?", cmd:"psql -c \"select \\\"table\\\", diststyle, sortkey1, skew_rows, unsorted, stats_off, tbl_rows from svv_table_info where \\\"table\\\" in ('orders','customers')\""},
  {on:"evendist", who:"ravi", t:"The old table was DISTKEY(customer_id) SORTKEY(order_date). The CTAS didn't carry those over. Check the migration.", cmd:"cat migrations/2026_11_15_orders_add_columns.sql"}
 ],
 hints:["Queue wait and concurrency are fine, so look at the query's own plan (EXPLAIN).","Look for data movement in the join: DS_BCAST_INNER or DS_DIST_BOTH on a huge table is expensive.","Compare orders' distribution style and sort key now vs before the weekend rebuild (svv_table_info)."],
 term:{host:"analytics-bastion", user:"oncall", suggest:["psql -c \"select query, elapsed, queue_time from stl_wlm_query order by starttime desc limit 3\"","psql -c \"EXPLAIN select c.city, sum(o.amount) from orders o join customers c on o.customer_id = c.customer_id where o.order_date >= current_date - 30 group by 1\""],
  cmds:[
  {m:["psql -c \"select query, elapsed","psql -c \"select * from stl_wlm_query"], out:`  query  | elapsed_s | queue_s
---------+-----------+---------
 9912281 |   371.8   |   [g]0.4[/g]
 9912240 |   368.1   |   [g]0.3[/g]`, note:"Queue time is under a second. WLM isn't the problem; execution is."},
  {m:["psql -c \"explain"], out:`XN HashAggregate  (cost=9182771233.12..)
  ->  XN Hash Join [r]DS_BCAST_INNER[/r]  (cost=..  rows=2100000000)
        Hash Cond: ("outer".customer_id = "inner".customer_id)
        ->  XN Seq Scan on customers c  (rows=48000000)
        ->  XN Hash  (rows=[r]2100000000[/r])
              ->  XN Seq Scan on orders o   Filter: (order_date >= ...)  [y](rows=2100000000, no range-restricted scan)[/y]`, clue:"bcast", unlock:["psql -c \"select \\\"table\\\", diststyle, sortkey1, skew_rows, unsorted, stats_off, tbl_rows from svv_table_info where \\\"table\\\" in ('orders','customers')\"","psql -c \"select query, step, rows, workmem, is_diskbased from svl_query_summary where query = 9912281 and is_diskbased = 't'\""]},
  {m:["psql -c \"select \\\"table\\\", diststyle","psql -c \"select * from svv_table_info"], out:`  table    | diststyle          | sortkey1    | skew_rows | unsorted | stats_off | tbl_rows
-----------+--------------------+-------------+-----------+----------+-----------+------------
 orders    | [r]EVEN[/r]               | [r](none)[/r]      |   1.00    |   [y]100.0[/y]  |   [y]100.0[/y]   | 2100000000
 customers | KEY(customer_id)   | customer_id |   1.02    |    0.0   |     0.0   |   48000000`, clue:"evendist", unlock:["cat migrations/2026_11_15_orders_add_columns.sql"]},
  {m:["psql -c \"select query, step","psql -c \"select * from svl_query_summary"], out:` query   | step | rows       | workmem     | is_diskbased
---------+------+------------+-------------+-------------
 9912281 |   2  | 2100000000 | 2.1 GB      | [r]t[/r]
[d](hash step spilled to disk)[/d]`, clue:"spill"},
  {m:["cat migrations/2026_11_15_orders_add_columns.sql","cat migrations"], out:`-- Add channel + device columns (Sat 15 Nov)
[y]CREATE TABLE orders_new AS[/y]
SELECT o.*, d.channel, d.device_type
FROM orders o LEFT JOIN order_devices d USING (order_id);
[d]-- no DISTSTYLE / DISTKEY / SORTKEY specified → CTAS picked EVEN, no sort key[/d]
ALTER TABLE orders RENAME TO orders_old;
ALTER TABLE orders_new RENAME TO orders;
[d]-- no ANALYZE[/d]`, clue:"ctas"},
  {m:["psql -c \"select * from stv_partitions","psql -c \"select sum(used)"], out:`disk used: 61% of capacity`, note:"Plenty of disk headroom. Storage isn't the issue."},
  {m:["psql -c \"select * from stv_recents","psql -c \"select * from stv_inflight"], out:`2 queries running · both exec-dashboard · no blocking locks`, note:"No lock contention or runaway queries. It's just this query being slow."}
 ]},
 dash:[
  {title:"Dashboard query time (s)", x:["Wed","Thu","Fri","Sat","Sun","Mon","Tue","Wed"], series:[{name:"p95", v:[14,15,14,13,12,372,368,371]}], marks:[{i:3, label:"orders rebuilt (CTAS)"}], clue:"timing"},
  {title:"Network bytes between nodes (GB/query)", unit:"G", x:["Wed","Thu","Fri","Sat","Sun","Mon","Tue","Wed"], series:[{name:"GB", v:[0.3,0.3,0.3,0.2,0.2,96,94,95]}], marks:[{i:3, label:"CTAS"}], clue:"network"},
  {title:"Cluster CPU %", unit:"%", x:["Wed","Thu","Fri","Sat","Sun","Mon","Tue","Wed"], series:[{name:"CPU", v:[36,35,37,22,20,38,39,38]}], note:"CPU looks normal. The query spends its time moving data over the network and spilling, not computing."},
  {title:"WLM queue wait (s)", x:["Wed","Thu","Fri","Sat","Sun","Mon","Tue","Wed"], series:[{name:"wait", v:[0.3,0.4,0.3,0.2,0.2,0.4,0.4,0.4]}], note:"Queue wait is under a second. Concurrency and WLM aren't the problem."}
 ],
 clues:{
  bcast:"EXPLAIN: the join broadcasts all 2.1B rows of orders (DS_BCAST_INNER) and scans with no date range restriction",
  evendist:"orders is now DISTSTYLE EVEN with no sort key, and stats_off = 100",
  ctas:"Saturday's migration rebuilt orders with a CTAS and no DISTKEY/SORTKEY/ANALYZE",
  spill:"The hash step spills to disk (is_diskbased = t)",
  timing:"Query time jumped from ~14 s to ~370 s right after the Saturday rebuild",
  network:"Data moved between nodes per query went from 0.3 GB to ~95 GB"
 },
 cause:{q:"What's the root cause?", o:[
  {t:"Saturday's CTAS rebuilt «orders» with EVEN distribution, no sort key and no statistics. The join on customer_id now broadcasts 2.1B rows across the network, can't skip blocks by date, and spills to disk", ok:true},
  {t:"The cluster is too small for the data", ok:false, why:"Same data size last week ran in 14 s. CPU is 38%.", say:[["ravi","Same cluster, same data size last Friday: 14 seconds. And CPU is at 38%."]]},
  {t:"WLM / concurrency: too many queries at 9 AM", ok:false, why:"Queue wait is 0.4 s and nothing is blocking.", say:[["priya","Queue wait is 0.4 seconds. It's not waiting; it's executing slowly."]]},
  {t:"The new channel/device columns made rows too wide", ok:false, why:"Redshift is columnar: unused columns aren't read. The plan shows data movement, not wide scans.", say:[["priya","Columnar storage: the dashboard doesn't select the new columns, so they cost nothing. Look at the join strategy."]]}
 ]},
 fix:{q:"What do you ship? Pick every action you'd take.", o:[
  {t:"Recreate «orders» with «DISTKEY(customer_id) SORTKEY(order_date)» (deep copy via CREATE TABLE … LIKE / INSERT), then swap", kind:"must", why:"Co-locates orders with customers for the join (no broadcast) and lets date filters skip blocks.", miss:[["arjun","Stats are fresh but it still takes 5 minutes. The plan still broadcasts orders."]]},
  {t:"Run ANALYZE on the new orders table", kind:"must", why:"Fresh statistics let the planner pick the right join and memory sizes.", miss:[["priya","Layout is right now, but stats_off is still 100. The planner is guessing row counts and the hash step still spills. Run ANALYZE."]]},
  {t:"Fix the migration template: CTAS must state DISTKEY/SORTKEY (or use CREATE TABLE … LIKE) and end with ANALYZE", kind:"good", why:"Stops the next table rebuild from silently changing physical design."},
  {t:"Alert on dashboard query p95 and on DS_BCAST_INNER for tables over 100M rows", kind:"good", why:"Catches plan regressions on day one."},
  {t:"Run VACUUM SORT on orders", kind:"meh", why:"There's no sort key to sort by, so it does little until the table is rebuilt."},
  {t:"Resize the cluster to 8 nodes", kind:"bad", why:"Twice the cost, still broadcasting 2.1B rows. Maybe 30% faster, nowhere near 15 s.", say:[["dev","Resized to 8 nodes. Dashboard went from 6m 12s to 4m 40s. And the monthly bill just doubled."],["arjun","Finance is asking why Redshift costs doubled this month. 💸"]]},
  {t:"Turn on concurrency scaling", kind:"bad", why:"Concurrency scaling adds clusters for *more queries*, not a faster single query. Extra cost, no gain.", say:[["dev","Concurrency scaling kicked in. It's billing us for a second cluster, and the one dashboard query is still 6 minutes."]]}
 ]},
 post:{
  summary:"The executive \"Daily GMV by city\" dashboard went from **~14 s to ~6 min** after a weekend table rebuild. Nothing else changed.",
  cause:"Saturday's migration rebuilt «orders» (2.1B rows) with «CREATE TABLE … AS SELECT» and **no distribution or sort key**. Redshift chose **EVEN** distribution and no sort key, and with no ANALYZE the stats were 100% stale. Previously «orders» was «DISTKEY(customer_id)», co-located with «customers», so the join needed no data movement. Now the planner **broadcast** the whole table (~95 GB moved per query), couldn't skip blocks for the 30-day filter without «SORTKEY(order_date)», and the hash step **spilled to disk**.",
  prevent:["Migration templates require explicit DISTKEY/SORTKEY (or LIKE) and ANALYZE","Plan-regression check (EXPLAIN diff) for top dashboard queries after schema changes","Alert on dashboard p95 and on large broadcasts"]
 },
 learned:["Slow query + low queue wait → read the **plan**: look for «DS_BCAST_INNER» / «DS_DIST_BOTH».","Join tables on their **DISTKEY** so matching rows sit on the same slice.","CTAS doesn't copy your distribution and sort keys. Declare them, then **ANALYZE**.","Bigger clusters and concurrency scaling don't fix a bad physical design. They just cost more."]
}
]);

QUEST.story("redshift", {title:"9 AM and every query is queued", icon:"⏳", place:"Mon 9 AM · Redshift", setup:"Every Monday at 9, dashboards queue for minutes. CPU isn't maxed. A data scientist's notebook is running something big.",
 meters:[["wait","Dashboard queue wait"," s",180,5,"low",240],["cost","Extra spend","%",0,20,"low",100],["trust","Business trust","%",40,70,"high",100]],
 beats:[["arjun","Monday morning numbers take forever. Again."],["ui","WLM: 1 queue, 5 slots\nrunning: 3 × data-science exports (40 min each), 2 × ETL\nqueued: 37 dashboard queries"],
  ["q","Why are dashboards waiting?",[["Long queries occupy the few WLM slots, so short dashboard queries wait in the same queue",1,"It's a concurrency problem, not a capacity one.","A single supermarket queue where five people have overflowing trolleys."],["The cluster is too small",0.5,"More nodes speed up each query a bit, but the slot contention remains.","A faster cashier, same queue."],["Redshift is down",0,"It's running, just busy.","The shop is open."]]],
  ["q","What do you change?",[["Separate queues (or auto WLM with priorities) for dashboards, ETL and data science, and turn on short query acceleration",1,"Short queries get their own lane and priority; long ones can't block them.","An express lane for baskets."],["Kill the data scientist's queries every Monday",0,"Blames a person, not the design.","Throwing customers out."]]],
  ["q","Peaks still happen at month-end. Then what?",[["Concurrency scaling for the dashboard queue (with a usage limit) and moving heavy exports to off-peak or UNLOAD to S3",1,"Bursts get extra clusters; heavy batch work moves out of the busy hour.","Opening extra tills on the busiest days."],["Permanently double the cluster",0.5,"Works, but you pay for peak all month.","Hiring double staff year-round."]]],
  ["arjun","Monday dashboards in 6 seconds. And the bill went up only 4%."]],
 learned:["Queueing ≠ lack of CPU: look at WLM.","Separate workloads; prioritise short queries.","Concurrency scaling for bursts, with limits."]});
QUEST.mock("redshift", {title:"Redshift round", who:"rohit", intro:"Rohit here. Let's go through Redshift design and tuning.", setup:"Rohit owns the analytics warehouse.",
 qs:[["How do you choose distribution and sort keys?","**DISTKEY** on the column most used to join the two largest tables (co-location, no redistribution); **ALL** for small dimensions; **EVEN/AUTO** when no dominant join. **SORTKEY** on the most common range filter (often a date) so zone maps skip blocks. Check skew with «svv_table_info».",[["DISTKEY on the main join key, ALL for small dims, SORTKEY on the common range filter; watch skew",1,"Design by query patterns."],["DISTKEY on the primary key always",0.5,"Even spread, but joins on other keys redistribute."],["Sort keys don't matter in columnar storage",0,"They drive block skipping."]]],
  ["Redshift Serverless vs provisioned RA3?","**Provisioned RA3**: fixed nodes, predictable cost for steady load, managed storage separate from compute. **Serverless**: pay per RPU-second, auto-scales, great for spiky or unpredictable workloads; set max RPU and usage limits. Many teams combine with **data sharing**.",[["RA3 for steady, predictable load; Serverless for spiky load with usage limits; data sharing between them",1,"Practical trade-off."],["Serverless is always cheaper",0,"Not for constant heavy load."],["They have different SQL",0,"Same engine and SQL."]]],
  ["How do you load data efficiently?","«COPY» from S3 in **parallel**: many files (a multiple of slices), similar size (~100 MB-1 GB compressed), columnar (Parquet). Avoid single-row INSERTs. Stage then MERGE for upserts. ANALYZE after big loads.",[["COPY from S3 with many similar-sized files, stage + MERGE, then ANALYZE",1,"Correct pattern."],["INSERT rows one by one from the app",0,"Extremely slow."],["One giant gzip file",0.5,"Can't be split, so loads on one slice."]]],
  ["A query spills to disk. What does that mean and what do you do?","«is_diskbased='t'» in «svl_query_summary»: a hash or sort step ran out of its memory grant. Fix the plan (avoid big broadcasts/redistribution, filter earlier), fix stats (ANALYZE), or give the queue more memory per slot.",[["A step exceeded its memory grant; fix plan/stats first, then queue memory",1,"Cause-first."],["Add more disk",0,"Spilling isn't about capacity."],["Ignore it",0,"Spills are slow."]]]],
 learned:["Dist/sort keys from query patterns.","WLM for workload isolation.","COPY in parallel from S3."]});
