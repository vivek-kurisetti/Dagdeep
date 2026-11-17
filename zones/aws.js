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
