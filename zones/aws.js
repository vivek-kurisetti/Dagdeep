QUEST.zone("aws", {
mission:["ravi","Our lake lives on AWS: S3 for storage, Glue for the catalog and ETL, Athena for ad-hoc SQL, DynamoDB for the payment status API. One bad choice here shows up on the bill. Let's play it right."],
levels:[
{t:"S3", sub:"Objects, prefixes, classes", rounds:[
 ["learn","S3 is a key-value object store","Buckets hold **objects** addressed by keys. 'Folders' are just key **prefixes**. Since Dec 2020, S3 is **strongly consistent** for reads after writes and for lists. Objects are immutable: you replace, you don't edit."],
 ["learn","Request rates are per prefix","S3 scales to at least **3,500 PUT/COPY/POST/DELETE** and **5,500 GET/HEAD** requests per second **per prefix**. Spread hot data across prefixes (e.g. by date and hash) and avoid millions of tiny objects."],
 ["pick","A Spark job reading 2 million tiny objects from one prefix gets 503 Slow Down. Best fix?",["Turn on versioning","Compact into larger files and spread prefixes","Use Glacier","Make the bucket public"],1,"Fewer, larger objects cut request counts; more prefixes raise the ceiling."],
 ["match","Storage classes",[["S3 Standard","Hot data, millisecond access"],["S3 Intelligent-Tiering","Unknown access pattern, auto-moves between tiers"],["S3 Standard-IA","Infrequent access, retrieval fee"],["S3 Glacier Deep Archive","Cheapest, hours to restore"],["S3 Express One Zone","Single-AZ, single-digit ms, for hot compute"]],"Match class to access pattern."],
 ["learn","Lifecycle and multipart","**Lifecycle rules** transition or expire objects by age and prefix, and should abort incomplete multipart uploads. **Multipart upload** splits big objects into parts (recommended above ~100 MB) uploaded in parallel."],
 ["sort","Saves money or not?",{"Saves money":["Lifecycle to Glacier after 180 days","Abort incomplete multipart uploads","Parquet + compression instead of CSV","Delete old noncurrent versions"],"Costs more":["Versioning with no expiry","Millions of tiny objects","Cross-region reads in every query"]},"Storage and requests both cost."],
 ["tf","S3 facts",[["S3 is strongly consistent for read-after-write.",true,"Since December 2020."],["Renaming a prefix is a cheap metadata operation.",false,"It's copy + delete for every object."],["SSE-KMS encryption adds KMS request costs.",true,"Use S3 Bucket Keys to reduce them."]]]
]},
{t:"Glue", sub:"Catalog, crawlers, jobs", rounds:[
 ["learn","Glue Data Catalog","A Hive-compatible metastore: **databases** and **tables** (schema, location, partitions, format). Athena, EMR, Redshift Spectrum and Glue jobs all read it. It's also an Iceberg catalog."],
 ["learn","Crawlers vs explicit tables","**Crawlers** scan S3 and infer schemas and partitions. Handy, but they can guess types wrong or split tables. For production, define tables in code (or use Iceberg) and use partition projection or explicit partition registration."],
 ["match","Glue pieces",[["Data Catalog","Shared table metadata"],["Crawler","Infers schema and partitions from S3"],["Glue ETL job","Serverless Spark (or Python shell)"],["Job bookmark","Remembers what was processed last run"],["Glue Data Quality","Rules like completeness and uniqueness"]],"Glue is several products in one."],
 ["learn","Workers and DPUs","Glue jobs run Spark on workers: **G.1X** = 1 DPU (4 vCPU, 16 GB), **G.2X** = 2 DPUs, bigger types for heavier jobs. You pay per DPU-hour, billed per second with a 1-minute minimum (Glue 2.0+)."],
 ["pick","A Glue job reprocesses all S3 files every run. What should you enable?",["Job bookmarks","More DPUs","Crawlers","Flex execution"],0,"Bookmarks track processed files so incremental runs only read new data."],
 ["sort","Glue job choice",{"Glue Spark job":["Join 200 GB of logs","Rewrite partitions to Parquet"],"Python shell job":["Call an API and write a small file","Run a small SQL against Redshift"]},"Don't spin up Spark for tiny work."]
]},
{t:"Athena", sub:"Serverless SQL on S3", rounds:[
 ["learn","Pay per byte scanned","Athena (Trino-based) queries S3 through the Glue Catalog. Pricing is **$5 per TB scanned** (10 MB minimum per query). Less data scanned = cheaper and faster.",["Parquet/ORC (columnar)","Compression (zstd/snappy)","Partition filters","Select only needed columns"]],
 ["sort","Reduces bytes scanned?",{"Reduces scan":["Convert CSV to Parquet","Filter on partition column","SELECT two columns, not *","Partition projection with a dt filter"],"Doesn't":["ORDER BY at the end","Bigger workgroup","LIMIT on a full-scan aggregate"]},"LIMIT doesn't always stop the scan, especially with aggregations."],
 ["learn","Partition projection","Instead of storing millions of partitions in the catalog, define the pattern («projection.dt.type=date», range, format) in table properties. Athena computes partitions at query time: no MSCK REPAIR, faster planning."],
 ["pick","Queries spend 20 s in planning on a table with 400,000 partitions. Fix?",["MSCK REPAIR TABLE every hour","Partition projection","Bigger result bucket","Use CSV"],1,"Projection skips catalog partition lookups."],
 ["fill","CTAS to Parquet",'CREATE TABLE pay_parquet\nWITH (format = \'___\', write_compression = \'ZSTD\',\n      partitioned_by = ARRAY[\'___\'])\nAS SELECT payment_id, amount, dt FROM pay_csv;',["PARQUET","dt"],["CSV","JSON","amount"],"Partition columns must come last in the SELECT."],
 ["tf","Athena facts",[["Athena charges per query runtime.",false,"Per TB scanned (SQL queries), unless you use provisioned capacity."],["Workgroups can cap bytes scanned per query.",true,"Use them to stop runaway costs."],["Athena can MERGE into Iceberg tables.",true,"Athena engine v3 supports Iceberg DML."]]]
]},
{t:"DynamoDB", sub:"Keys, capacity, indexes", rounds:[
 ["learn","Design for access patterns","Items live under a **partition key** (hashed to a partition) and optional **sort key** (ordered within it). You query by key, not by arbitrary columns. Max item size **400 KB**."],
 ["learn","Capacity units","**RCU**: one strongly consistent read/s of up to 4 KB, or two eventually consistent. **WCU**: one write/s of up to 1 KB. Transactions cost double. **On-demand** charges per request; **provisioned** with auto scaling suits steady load."],
 ["pick","Reading a 9 KB item with a strongly consistent read costs how many RCUs?",["1","2","3","9"],2,"ceil(9 / 4) = 3 RCUs (1.5 if eventually consistent)."],
 ["match","Index types",[["GSI","Different partition key, own capacity, eventually consistent"],["LSI","Same partition key, different sort key, defined at creation"],["Sparse index","Only items with the attribute appear"],["Single-table design","Many entity types share one table and keys"]],"GSIs are the flexible workhorse."],
 ["learn","Hot partitions","A partition handles up to ~3,000 RCU and 1,000 WCU. One very hot key (e.g. 'status=PENDING') throttles even with spare table capacity. Use high-cardinality keys or write sharding (key#0..N)."],
 ["bug","Which key design will throttle?",["PK = payment_id","PK = merchant_id, SK = created_at","PK = 'PENDING', SK = payment_id","PK = customer_id#2026-11"],2,"Every pending payment lands on one partition key."],
 ["tf","DynamoDB facts",[["DynamoDB Streams emit item-level changes.",true,"Use them for CDC into Kafka or Lambda."],["TTL deletes cost WCUs.",false,"TTL deletions are free."],["Scans are a cheap way to answer ad-hoc queries.",false,"Scans read the whole table; export to S3 and query with Athena instead."]]]
]},
{t:"Boss: The AWS bill", boss:true, time:30, rounds:[
 ["pick","Athena bill tripled: analysts run SELECT * on CSV. Fix?",["Parquet + partitions + workgroup byte limits","More S3 buckets","Bigger Glue workers","Turn off encryption"],0,"Scan less, cap the rest."],
 ["pick","Glue crawler keeps splitting one dataset into dozens of tables. Fix?",["Define the table explicitly / set table grouping","Run the crawler more often","Use more DPUs","Delete the catalog"],0,"Crawlers guess; production tables should be explicit."],
 ["pick","DynamoDB throttles on writes while total capacity is 20% used. Cause?",["Hot partition key","Item too small","Wrong region","Too many GSIs disabled"],0,"Capacity is per partition."],
 ["pick","S3 storage keeps growing though data is deleted daily. Cause?",["Versioning keeps noncurrent versions","Lifecycle too aggressive","Multipart disabled","Strong consistency"],0,"Add a rule to expire noncurrent versions."],
 ["pick","A daily Glue job re-reads 3 years of files. Fix?",["Enable job bookmarks / process only new partitions","Switch to Python shell","Use Glacier","Disable the catalog"],0,"Incremental processing."],
 ["pick","Payment status lookups need single-digit ms by payment_id at huge scale. Best store?",["DynamoDB with payment_id as partition key","Athena","S3 Select","Glue Catalog"],0,"Key-value access at scale."]
]}
]});

QUEST.more("aws", [
{act:"Expert", t:"S3 deep dive", sub:"Partitions, multipart, conditional writes", rounds:[
 ["learn","How S3 scales request rates","S3 partitions its key index by **prefix** automatically. A prefix starts with ~3,500 writes and ~5,500 reads per second; when sustained load exceeds that, S3 splits the partition. While it splits, you can see **503 Slow Down**.",null,null,`### Practical consequences
- Ramp traffic gradually and use **exponential backoff with jitter** (SDKs do this) — a sudden 50× spike on one prefix will throttle until S3 repartitions.
- Spread load over prefixes: «s3://lake/payments/dt=2026-11-18/part-0001…» puts a whole day under one prefix; with high request rates, more distinct prefixes help (e.g. hash or bucket subfolders).
- Fewer, larger objects beat millions of tiny ones: a 128 MB object costs one GET, 1,000 × 128 KB objects cost 1,000 GETs (and 1,000 × latency).

### Throughput for big objects
- **Byte-range GETs**: read a big object in parallel ranges (Spark/Trino readers do this; Parquet readers fetch just the footer and needed column chunks).
- **Multipart upload**: parts of 5 MB–5 GB, up to **10,000 parts** per upload, uploaded in parallel and retried individually. Incomplete uploads are **billed** until aborted — add a lifecycle rule «AbortIncompleteMultipartUpload».

### Costs that surprise
Requests: PUT/COPY/POST/LIST ≈ $0.005 per 1,000, GET ≈ $0.0004 per 1,000 (S3 Standard, us-east-1). Minimum billable object size of **128 KB** and **minimum storage durations** (Standard-IA/One Zone-IA 30 days, Glacier Instant/Flexible 90 days, Deep Archive 180 days) make lifecycle rules on tiny or short-lived objects counterproductive.`],
 ["num","Upload a 600 GB object with 64 MB parts (use 1 GB = 1,024 MB). How many parts? (Max allowed is 10,000.)",9600,0,"parts","600 × 1,024 MB ÷ 64 MB = 9,600 parts: just under the 10,000-part limit. A bigger object would need larger parts."],
 ["learn","Conditional writes changed lakehouse design","S3 now supports **conditional writes**: «If-None-Match: *» (only create if the key doesn't exist) and «If-Match: <ETag>» (only overwrite if unchanged). Atomic compare-and-swap on S3 itself.",null,null,`### Why it matters
Table formats need an **atomic commit**: exactly one writer wins when two try to publish the next version. Historically S3 had no CAS, so Delta Lake needed DynamoDB for multi-cluster writes, and Iceberg relied on a catalog (Glue, Hive, REST) to swap the metadata pointer.

With conditional writes:
- Two writers both try «PUT _delta_log/00000000000000000042.json» with If-None-Match; one gets **412 Precondition Failed** and retries on top of the new version.
- Lock-free leases, idempotent job markers and "write once" manifests become simple.

### S3 Tables
**S3 Tables** (table buckets) store Apache Iceberg tables as a managed service: S3 runs **compaction, snapshot expiry and orphan-file cleanup** automatically and exposes an Iceberg REST catalog endpoint. Engines (Athena, EMR, Glue, Spark, Firehose) read and write them as normal Iceberg tables.

### Express One Zone
Directory buckets in a single AZ with single-digit-ms latency and higher request rates, priced higher per GB but lower per request. Good for hot scratch data, shuffle, ML training data near compute — not for durable lake storage needing multi-AZ resilience.`],
 ["match","Feature → use",[["If-None-Match: * on PUT","Exactly one writer creates the next commit file"],["Byte-range GET","Read only a Parquet footer and needed column chunks"],["S3 Tables","Managed Iceberg with automatic maintenance"],["AbortIncompleteMultipartUpload rule","Stop paying for orphaned upload parts"],["S3 Inventory","Daily list of objects for audits and cleanup"]],"S3 is more than a blob store now."],
 ["pick","Lifecycle moves objects to Standard-IA after 1 day, but most are 20 KB and deleted after 10 days. Effect?",["Big savings","Higher cost: 128 KB minimum billable size and 30-day minimum duration","No change","Faster reads"],1,"Small, short-lived objects should stay in Standard (or use Intelligent-Tiering, which skips objects < 128 KB)."],
 ["tf","S3 truths",[["Incomplete multipart uploads are free.",false,"Their parts are stored and billed."],["S3 can now reject a PUT if the key already exists.",true,"Conditional writes with If-None-Match."],["A sudden 50× traffic spike on one prefix can see 503s until S3 scales.",true,"Back off and spread prefixes."]]]
]},
{act:"Expert", t:"Glue ETL internals", sub:"DPUs, bookmarks, pushdown", rounds:[
 ["learn","Glue jobs are managed Spark","A Glue Spark job runs on **workers** measured in DPUs (1 DPU = 4 vCPU + 16 GB). You pay per **DPU-hour** (billed per second, 1-minute minimum) — so worker type × count × runtime is the bill.",null,null,`| Worker | DPUs | vCPU / memory | Typical use |
|---|---|---|---|
| G.025X | 0.25 | 2 / 4 GB | Low-volume streaming jobs |
| G.1X | 1 | 4 / 16 GB | General ETL |
| G.2X | 2 | 8 / 32 GB | Heavier joins, ML transforms |
| G.4X / G.8X | 4 / 8 | 16–32 vCPU / 64–128 GB | Large shuffles, memory-hungry stages |

- **Auto Scaling** (Glue 3.0+): set a max number of workers; Glue adds and removes executors based on stage parallelism.
- **Flex execution**: runs on spare capacity at a lower DPU price for non-urgent jobs; can start later.
- Glue versions map to Spark versions (Glue 5.0 → Spark 3.5). Pick the newest that your libraries support.

### DynamicFrame vs DataFrame
A **DynamicFrame** tolerates inconsistent schemas: a field can be a «choice» type (e.g. int in some records, string in others) until you call «resolveChoice». It's useful for messy JSON from crawlers; for typed, high-performance work, convert with «.toDF()» and use plain Spark.`],
 ["num","A job uses 10 G.2X workers for 30 minutes at $0.44 per DPU-hour. Cost?",4.4,0.05,"USD","10 workers × 2 DPU × 0.5 h = 10 DPU-hours × $0.44 = $4.40."],
 ["learn","Bookmarks and pushdown","**Job bookmarks** store state per source between runs so each run processes only new data. **Partition pushdown** avoids even listing partitions you don't need.",null,null,`### How bookmarks track progress
- **S3 sources**: Glue remembers which objects it processed (by path and last-modified timestamp). New files in old partitions are picked up; rewritten files with the same name may not be.
- **JDBC sources**: you define **bookmark keys** (a monotonically increasing column like an id or updated_at); Glue stores the max value seen.
- Bookmarks only advance when the job calls «job.commit()» at the end. A run that fails before commit reprocesses the same data next time.
- Each transform needs a «transformation_ctx» name — that's the key the bookmark state is stored under.

### Partition pruning in Glue
- «push_down_predicate="dt >= '2026-11-01'"»: Glue lists only matching catalog partitions before reading S3.
- «catalogPartitionPredicate»: evaluated **server-side** in the Data Catalog using **partition indexes** — much faster when a table has hundreds of thousands of partitions.

### Small files
For reading many small files, set «groupFiles: 'inPartition'» and «groupSize» (e.g. 128 MB) so one task reads a group of files instead of one file each.`],
 ["bug","This Glue job reprocesses everything every night. Which line is the problem?",["job.init(args['JOB_NAME'], args)","dyf = glueContext.create_dynamic_frame.from_catalog(database='raw', table_name='events')","out = ApplyMapping.apply(frame=dyf, mappings=m, transformation_ctx='map')","glueContext.write_dynamic_frame.from_options(out, 's3', {'path': dst}, 'parquet')"],1,"The source read has no transformation_ctx, so there's nowhere to store bookmark state for it (and the job must call job.commit())."],
 ["match","Problem → Glue feature",[["Catalog table with 400k partitions, slow planning","Partition indexes + catalogPartitionPredicate"],["Millions of 20 KB JSON files","groupFiles / groupSize"],["Field is int in some records, string in others","DynamicFrame resolveChoice"],["Nightly job isn't urgent, budget is tight","Flex execution"]],"Glue has a feature for most ETL pains."],
 ["tf","Glue truths",[["Bookmarks advance even if the job fails midway.",false,"Only on job.commit()."],["1 DPU = 4 vCPU and 16 GB.",true,"G.1X is one DPU."],["DynamicFrames are always faster than DataFrames.",false,"Use DataFrames for typed, performance-critical work."]]]
]},
{act:"Expert", t:"Athena at scale", sub:"Trino internals, joins, Iceberg", rounds:[
 ["learn","How an Athena query runs","Athena engine v3 is based on **Trino**. A coordinator plans the query; workers scan S3 splits in parallel, exchange data between **stages** for joins and aggregations, and stream results back.",null,null,`### Joins
- Default is a **distributed hash join**: the right-hand side is the **build side**, loaded into memory across workers. Put the **smaller table on the right** when the optimizer can't reorder (no stats).
- For a tiny right side, a **broadcast join** copies it to every worker.
- Joining two huge tables can fail with **"Query exhausted resources at this scale factor"** — filter earlier, pre-aggregate, or use CTAS to materialize intermediate results.

### Other expensive patterns
- «ORDER BY» over a huge result without «LIMIT»: one final sort.
- «COUNT(DISTINCT x)» on very high cardinality: use «approx_distinct(x)» when exact isn't needed.
- Large «GROUP BY» with many keys: ensure partition and column pruning first.
- Many small files: each S3 object is at least one split; compact them.

### Partition projection types
«integer», «date» (with format and interval), «enum», and «injected» (value must be supplied in the WHERE clause). Projection replaces catalog partition lookups entirely.

### Cost controls
Workgroup «bytes scanned cutoff per query», result reuse (cache identical queries for a configurable age), and **provisioned capacity** (DPUs billed per hour) for predictable heavy workloads instead of per-TB pricing.`],
 ["pick","Athena join of «events» (4 TB) and «countries» (200 rows) fails with 'exhausted resources'. Query lists countries first, events second. Fix?",["Put the small table on the right (build side) / filter events first","Add ORDER BY","Use CSV","Remove partition projection"],0,"The right side is built in memory."],
 ["num","An Athena query scans 0.6 TB at $5 per TB. Cost in USD?",3,0.05,"USD","0.6 × $5 = $3.00 per run. Converted to partitioned Parquet scanning 15 GB, it'd cost about 7 cents."],
 ["learn","Athena + Iceberg","Athena can create, query and modify **Iceberg** tables: «INSERT», «UPDATE», «DELETE», «MERGE INTO», time travel («FOR TIMESTAMP AS OF»), «OPTIMIZE … REWRITE DATA USING BIN_PACK» for compaction and «VACUUM» for snapshot expiry + orphan cleanup.",null,null,`### Why it's the default for new tables
- Hidden partitioning: no «dt» string columns to maintain; Athena prunes from the timestamp filter.
- Row-level changes without rewriting whole partitions (merge-on-read).
- No «MSCK REPAIR»: files are tracked in metadata.
- The same table works in Spark on EMR/Glue, Redshift Spectrum and Trino.

### Maintenance from SQL
~~~
OPTIMIZE lake.payments REWRITE DATA USING BIN_PACK WHERE dt >= DATE '2026-11-01';
VACUUM lake.payments;   -- expires old snapshots, removes orphan files
ALTER TABLE lake.payments SET TBLPROPERTIES ('vacuum_max_snapshot_age_seconds'='432000');
~~~

### Limits to know
Athena's DML runs within query timeouts and DPU limits; very large MERGEs are often better on Spark (EMR/Glue), with Athena for ad-hoc reads and light maintenance.`],
 ["sort","Better in Athena or in Spark (EMR/Glue)?",{"Athena":["Ad-hoc SQL by analysts","Small MERGE fixing 1,000 rows","OPTIMIZE one day of a table"],"Spark":["Nightly 3 TB MERGE from CDC","Complex Python transformations","Backfilling 2 years with custom logic"]},"Pick by data size and complexity."],
 ["tf","Athena truths",[["approx_distinct is much cheaper than COUNT(DISTINCT) at scale.",true,"HyperLogLog sketch with ~2% error."],["Partition projection needs MSCK REPAIR after new data lands.",false,"Partitions are computed at query time."],["Athena can time-travel Iceberg tables.",true,"FOR TIMESTAMP / VERSION AS OF."]]]
]},
{act:"Expert", t:"DynamoDB internals", sub:"Partitions, GSIs, transactions", rounds:[
 ["learn","Physical partitions","A table's data lives in partitions of up to **10 GB**, each serving up to **3,000 RCU and 1,000 WCU**. DynamoDB hashes the partition key to choose a partition and splits partitions as data or traffic grows.",null,null,`### Hot keys
A single partition key value can't exceed one partition's throughput (~1,000 writes/s of 1 KB). **Adaptive capacity** instantly lends unused table capacity to hot partitions and can **split for heat** (isolating hot items), but one key at 5,000 writes/s still throttles. Fix with **write sharding**: «PK = 'PENDING#' + random(0..9)», then query all 10 shards in parallel.

### Item collections and LSIs
With a **local secondary index**, all items sharing a partition key (the item collection) are limited to **10 GB**. GSIs have no such limit.

### GSIs are asynchronous copies
- Updated asynchronously; **reads are always eventually consistent**.
- Each GSI has its own capacity; writing an item can cost WCUs on the base table **and** every GSI that projects the changed attributes.
- An under-provisioned GSI **throttles writes to the base table** (back-pressure).
- **Sparse indexes**: only items that have the GSI key attribute appear — great for "open orders" style queues.

### Reading
«Query» reads one partition key (optionally a sort-key range); «Scan» reads everything. Both return at most **1 MB per page**; use «LastEvaluatedKey» to paginate. Filters apply **after** reading, so they don't reduce RCUs.`],
 ["num","Write a 3.5 KB item with a standard write. WCUs consumed?",4,0,"WCU","1 WCU per 1 KB, rounded up: ceil(3.5) = 4. Transactional writes would cost 8."],
 ["pick","A Query uses FilterExpression status = 'FAILED' and returns 5 items out of 2,000 read. RCUs are charged for…",["5 items","2,000 items read","Nothing","The filter only"],1,"Filters run after the read. Model a key or sparse GSI for the access pattern."],
 ["learn","Single-table design and safe writes","Model access patterns first, then overload generic keys («PK», «SK») so related items live in one partition and come back in one Query.",null,null,`### Example: merchants and payments
| PK | SK | Item |
|---|---|---|
| MERCHANT#42 | PROFILE | Merchant profile |
| MERCHANT#42 | PAY#2026-11-18T10:21#p_9 | Payment |
| MERCHANT#42 | PAY#2026-11-18T10:25#p_10 | Payment |
| PAY#p_9 | PAY#p_9 | Payment by id (or via a GSI) |

«Query PK = MERCHANT#42 AND begins_with(SK, 'PAY#2026-11-18')» returns a merchant's payments for a day, sorted by time. A GSI with «GSI1PK = status» (sparse) serves "all FAILED payments".

### Conditional writes
- **Idempotency**: «PutItem … ConditionExpression attribute_not_exists(PK)» makes retries safe.
- **Optimistic locking**: store a «version» attribute; update with «ConditionExpression version = :expected» and increment.
- **Transactions**: «TransactWriteItems» up to 100 items, all-or-nothing, at **2× the WCU cost**; can include condition checks on other items.

### Streams, TTL, export
Streams keep item-level changes for **24 hours**, ordered per item key. TTL deletes expired items for free, typically within a few days of expiry (filter expired items in reads). **Export to S3** uses point-in-time recovery data and consumes no table capacity — the right way to feed analytics.`],
 ["match","Need → DynamoDB tool",[["Retry-safe create","attribute_not_exists condition"],["Prevent lost updates","version attribute + condition"],["Debit wallet and credit merchant atomically","TransactWriteItems"],["Feed the data lake without hurting the table","Export to S3 (PITR)"],["Queue of open items only","Sparse GSI"]],"Correctness lives in conditions."],
 ["tf","DynamoDB truths",[["You can do strongly consistent reads on a GSI.",false,"GSIs are eventually consistent only."],["An item collection with an LSI is limited to 10 GB.",true,"GSIs don't have this limit."],["Scan with a filter only charges for matching items.",false,"It charges for everything read."]]]
]},
{act:"Expert", t:"The AWS lakehouse", sub:"Lake Formation, choosing engines", rounds:[
 ["learn","Governance with Lake Formation","**Lake Formation** adds fine-grained permissions on top of the Glue Catalog: database/table/**column**, **row filters** and **cell-level** security, enforced by integrated engines (Athena, EMR, Redshift Spectrum, Glue).",null,null,`### How it works
- Register S3 locations with Lake Formation; engines get **temporary credentials** scoped to what the caller may read (credential vending), instead of broad IAM S3 access.
- Grant with SQL-like permissions or **LF-Tags** (tag-based access control): tag columns «pii=true», «domain=payments», then grant "SELECT on all tables where domain=payments and pii=false" to analysts. New tables inherit access through tags.
- **Data filters** define row and cell rules («merchant_region = 'south'»).
- Cross-account sharing uses RAM; consumers query shared tables without copies.

### Common pitfall
If IAM policies still grant direct «s3:GetObject» on the lake bucket, users can bypass Lake Formation by reading files directly. Lock S3 access down to the Lake Formation service role and admin roles.`],
 ["sort","Which engine for the job?",{"Athena":["Analyst ad-hoc SQL on Iceberg","Cheap occasional queries"],"Glue / EMR Spark":["Nightly heavy transformations","CDC MERGE of billions of rows"],"Redshift":["Sub-second BI dashboards with high concurrency","Complex star-schema reporting"],"DynamoDB":["Payment status API at single-digit ms"]},"Engines share the same Iceberg tables and catalog."],
 ["order","A sound AWS CDC lakehouse flow",["Debezium/MSK streams DB changes","Spark (EMR/Glue) MERGEs into Iceberg tables on S3","Glue Catalog / S3 Tables registers metadata","Lake Formation grants column and row access","Athena and Redshift query the same tables"],"One copy of data, many engines."],
 ["pick","Analysts can read PII columns despite Lake Formation column grants. Most likely?",["IAM allows direct S3 reads of the data files","Athena bug","Wrong file format","Partition projection"],0,"Remove direct S3 access; let Lake Formation vend credentials."],
 ["tf","Lakehouse truths",[["LF-Tags let new tables inherit permissions automatically.",true,"Tag-based access control."],["Lake Formation row filters are enforced when reading files with any S3 client.",false,"Only through integrated engines."]]]
]},
{act:"Expert", t:"Expert boss: The AWS architecture review", boss:true, time:45, rounds:[
 ["pick","Two Spark clusters write the same Delta/Iceberg table on plain S3 and occasionally corrupt commits on an old setup. Modern fix?",["Use a catalog (Glue/REST/S3 Tables) or S3 conditional writes for atomic commits","More executors","Bigger parts","Versioning"],0,"Atomic compare-and-swap commits."],
 ["pick","A Glue job's bill is high: 50 G.2X workers, most idle after the first stage. Fix?",["Enable auto scaling with a max, right-size workers","Use G.8X","Disable bookmarks","Flex for everything"],0,"Pay only for needed parallelism."],
 ["pick","Athena query over 400k catalog partitions spends 30 s planning. Fix?",["Partition projection or partition indexes","Bigger workgroup","CSV","ORDER BY"],0,"Skip partition lookups."],
 ["pick","DynamoDB 'FAILED payments' query scans 50M items with a filter. Fix?",["Sparse GSI keyed on failure status","Parallel scan","Bigger RCU","Strongly consistent reads"],0,"Index the access pattern."],
 ["pick","Base table writes throttle though table capacity is plentiful. GSI on-demand? No, provisioned low. Cause?",["GSI back-pressure","Hot LSI","Streams","TTL"],0,"Under-provisioned GSIs throttle base writes."],
 ["pick","Monthly S3 bill shows huge 'TimedStorage' from multipart uploads nobody finished. Fix?",["AbortIncompleteMultipartUpload lifecycle rule","Versioning","Express One Zone","Bigger parts"],0,"Clean orphaned parts."],
 ["pick","Analytics team scans DynamoDB nightly and throttles production. Fix?",["Export to S3 (PITR) and query with Athena","Parallel scan at night","Raise RCUs only","Use a GSI"],0,"Zero capacity impact."]
]}
]);
