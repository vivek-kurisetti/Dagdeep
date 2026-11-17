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
