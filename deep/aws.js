QUEST.deep("aws", {
"S3 is a key-value object store": {
d: `S3 stores **objects** (bytes + metadata, up to 5 TB each) in **buckets**, addressed by a **key** string. There are no real directories: «lake/payments/dt=2026-11-18/part-0.parquet» is one key; consoles show "folders" by splitting on «/» (prefixes). Listing is by prefix and returns keys in lexicographic order, 1,000 per page.

Objects are **immutable**: you replace whole objects; there's no append or in-place edit (except S3 Express One Zone append). Since December 2020, S3 is **strongly consistent** for PUTs, overwrites, DELETEs and LIST: after a successful write, reads and lists see it.

There is no atomic **rename**: "renaming a folder" means copying every object and deleting the originals, which is slow and not atomic. That's why table formats (Iceberg, Delta) commit via metadata instead of renaming directories.`,
life: `A giant coat-check: you hand over a coat and get a ticket number (key). The ticket may look like "floor3/rack7/42", but there are no floors or racks; it's just a label.`,
work: `A Spark job wrote to «_temporary/» then "renamed" to the final prefix (old Hadoop committer). On S3 the rename copied 300 GB object by object, taking 40 minutes and leaving partial output when it failed midway. Switching to the S3A magic committer (or writing Iceberg tables) removed the rename step.`,
ex: `aws s3api list-objects-v2 --bucket lake --prefix payments/dt=2026-11-18/ --max-keys 5
aws s3api head-object --bucket lake --key payments/dt=2026-11-18/part-0.parquet
# "rename" = copy + delete (not atomic)
aws s3 mv s3://lake/tmp/run1/ s3://lake/payments/dt=2026-11-18/ --recursive`,
pit: [`Relying on directory renames for commits.`, `Treating S3 like a file system (appends, small random writes).`, `Huge LIST operations on every job run.`],
q: [`Why is renaming a "folder" in S3 slow and risky?`, `There are no folders: every object under the prefix must be copied and deleted individually, and it's not atomic.`]
},
"Request rates are per prefix": {
d: `S3 supports at least **3,500 PUT/COPY/POST/DELETE** and **5,500 GET/HEAD** requests per second **per partitioned prefix**, and there's no limit on the number of prefixes. A prefix is any leading part of the key that S3 decides to partition on.

So throughput scales by **spreading requests over prefixes**. If a job hammers one prefix beyond its current capacity, S3 returns **503 Slow Down** while it scales (it splits partitions automatically under sustained load, which takes time).

Practical patterns: partition data by date/hour and other keys so parallel readers/writers touch different prefixes; avoid millions of tiny objects; use retries with exponential backoff and jitter (SDKs do this); use larger objects and fewer requests (Parquet files of 128 MB–1 GB).`,
life: `A bank with many counters (prefixes). If everyone queues at counter 1, there's a wait even though other counters are free; the bank opens more counters for busy queues, but not instantly.`,
work: `A backfill with 2,000 Spark tasks wrote small files all under «events/2026-11-18/» and hit thousands of 503 Slow Down errors; retries made it 3× slower. Writing larger files (fewer requests) and partitioning by «hour» spread load across 24 prefixes; errors disappeared.`,
ex: `# Spark S3A retry tuning
spark.hadoop.fs.s3a.retry.limit=10
spark.hadoop.fs.s3a.retry.interval=500ms
spark.hadoop.fs.s3a.attempts.maximum=20
# CloudWatch request metrics on the bucket to watch 5xx / request rates`,
pit: [`One hot prefix for all parallel writes.`, `Millions of tiny objects (request-bound).`, `No backoff on 503s.`],
q: [`What does a 503 Slow Down from S3 mean?`, `Requests to that prefix exceed its current capacity; back off and spread requests across prefixes while S3 scales.`]
},
"Lifecycle and multipart": {
d: `**Lifecycle rules** (per bucket, filtered by prefix/tags/size) automate:
- **Transitions** to cheaper storage classes by age: S3 Standard → Standard-IA (30+ days) → Glacier Instant/Flexible Retrieval → Deep Archive; or **Intelligent-Tiering** that moves objects automatically based on access.
- **Expiration**: delete objects (or old **noncurrent versions** in versioned buckets) after N days.
- **AbortIncompleteMultipartUpload**: clean up parts from uploads that never completed (they're billed but invisible in normal listings).

**Multipart upload** splits large objects into parts (5 MB–5 GB each, up to 10,000 parts), uploaded in parallel and retried individually; required above 5 GB, recommended above ~100 MB. Parallel **byte-range GETs** speed up large reads.`,
life: `A storage unit company that automatically moves your boxes to cheaper basement storage after a month and throws away what you said to discard, plus a rule to clear half-delivered shipments left at the gate.`,
work: `Storage costs crept up 20%. S3 Storage Lens showed 14 TB of incomplete multipart uploads from failed Spark jobs and 60 TB of noncurrent versions. Two lifecycle rules (abort incomplete after 7 days; expire noncurrent after 30 days) plus transitioning raw logs to Glacier after 90 days cut the bill by 35%.`,
ex: `{"Rules": [
  {"ID": "abort-mpu", "Status": "Enabled", "Filter": {},
   "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 7}},
  {"ID": "raw-logs-tiering", "Status": "Enabled", "Filter": {"Prefix": "raw/logs/"},
   "Transitions": [{"Days": 30, "StorageClass": "STANDARD_IA"}, {"Days": 90, "StorageClass": "GLACIER"}],
   "Expiration": {"Days": 730}},
  {"ID": "old-versions", "Status": "Enabled", "Filter": {},
   "NoncurrentVersionExpiration": {"NoncurrentDays": 30}}]}`,
pit: [`No rule for incomplete multipart uploads.`, `Transitioning tiny objects to IA/Glacier (minimum size/duration charges).`, `Lifecycle-expiring files that a table format still references.`],
q: [`Why add an AbortIncompleteMultipartUpload rule?`, `Failed uploads leave invisible parts that you keep paying for until they're aborted.`]
},
"Glue Data Catalog": {
d: `The **AWS Glue Data Catalog** is a managed, Hive-compatible metastore per account and region:
- **Databases** contain **tables**; each table has a schema, storage **location** (S3 path), format/SerDe, table properties and **partitions** (each with its own location).
- It's shared by Athena, EMR (Spark/Hive/Trino), Redshift Spectrum, Glue ETL, Lake Formation and many third-party tools, so one definition serves all engines.
- It can also act as an **Iceberg catalog** (Glue holds the pointer to the current metadata file) and exposes an Iceberg REST endpoint.
- Supports schema versions, column statistics, and resource policies; access is controlled by IAM and/or **Lake Formation** permissions.

Partition metadata at large scale (millions of partitions) slows planning; use partition projection or Iceberg tables.`,
life: `A shared library catalogue used by every branch: whichever branch (engine) you visit, the same card tells you where the book is and what's inside.`,
work: `Athena, EMR Spark and Redshift Spectrum each had their own table definitions for the same data, which drifted (a column added in one but not others). Consolidating into Glue tables (managed by Terraform) gave one schema everywhere; later the team moved those tables to Iceberg in Glue.`,
ex: `aws glue get-table --database-name lake --name payments \\
  --query 'Table.{loc:StorageDescriptor.Location,cols:StorageDescriptor.Columns[].Name}'
# Spark on EMR uses Glue as metastore
spark.sql.catalogImplementation=hive
spark.hadoop.hive.metastore.client.factory.class=com.amazonaws.glue.catalog.metastore.AWSGlueDataCatalogHiveClientFactory`,
pit: [`Separate per-engine metastores that drift.`, `Millions of Hive-style partitions in Glue.`, `Manual console edits instead of IaC.`],
q: [`Why is a shared catalog valuable?`, `All engines read the same table definitions (schema, location, partitions), avoiding drift.`]
},
"Crawlers vs explicit tables": {
d: `**Glue crawlers** scan S3 paths, infer schemas (sampling files) and create/update tables and partitions. Useful for discovery and quick exploration.

Problems in production:
- **Wrong types**: a column that's numeric in early files and has a string later becomes string; dates as strings.
- **Table splitting**: slightly different schemas across folders → multiple tables instead of one.
- **Schema drift surprises**: crawlers silently change schemas consumers rely on.
- **Cost and time** scanning large prefixes; delays before new partitions appear.

Production approach: define tables explicitly (Terraform/CloudFormation/DDL), add partitions via the pipeline («ALTER TABLE ADD PARTITION», Glue API, «MSCK REPAIR» sparingly) or use **partition projection**, or use **Iceberg** where the table format manages files. If you keep crawlers, use incremental crawls, exclusions and schema-change policies (log, don't update).`,
life: `Letting a new intern guess the categories of every document by glancing at a few pages vs giving them a filing standard to follow.`,
work: `A crawler re-inferred «amount» as string after one partner file had "NA" values; Athena queries with SUM broke for every dashboard. Replacing the crawler with an explicit Terraform-defined table and validating partner files before landing fixed it permanently.`,
ex: `CREATE EXTERNAL TABLE lake.payments (
  payment_id string, merchant_id bigint, amount decimal(18,2), status string, created_at timestamp)
PARTITIONED BY (dt string)
STORED AS PARQUET
LOCATION 's3://lake/payments/';
ALTER TABLE lake.payments ADD IF NOT EXISTS PARTITION (dt='2026-11-18') LOCATION 's3://lake/payments/dt=2026-11-18/';`,
pit: [`Crawlers updating production schemas automatically.`, `MSCK REPAIR on huge tables every run.`, `No validation of incoming files.`],
q: [`Why prefer explicit table definitions in production?`, `They give stable, reviewed schemas instead of inferred ones that can change or be wrong.`]
},
"Workers and DPUs": {
d: `Glue Spark jobs run on **workers** sized in **DPUs** (Data Processing Units; 1 DPU = 4 vCPU + 16 GB):
- **G.1X** = 1 DPU per worker, **G.2X** = 2 DPU, **G.4X**/**G.8X** for heavy memory/shuffle; **G.025X** for small streaming jobs.
- Cost = DPU-hours × price, billed per second with a 1-minute minimum (Glue 2.0+).
- **Auto Scaling** (Glue 3.0+) adds/removes workers up to the max based on stages' needs.
- **Flex execution** runs non-urgent jobs on spare capacity at a lower price (may start later/be slower).

Sizing: too few or small workers → spill and long runtimes; too many → idle cost. Look at the Spark UI / Glue metrics (executor utilisation, shuffle spill) and right-size; for very large or long-running workloads, compare with EMR (Serverless or on EC2) which can be cheaper.`,
life: `Renting cooks by the hour, each with a fixed-size station. More or bigger stations finish faster, but you pay for idle cooks too.`,
work: `A nightly Glue job with 50 G.2X workers ran 2 hours with workers idle 60% of the time (skewed final stage). Enabling auto scaling (max 50), fixing skew with salting, and moving it to Flex cut cost from ~200 to ~70 DPU-hours per night.`,
ex: `aws glue start-job-run --job-name settle_daily \\
  --worker-type G.2X --number-of-workers 20 \\
  --execution-class FLEX \\
  --arguments '{"--enable-auto-scaling":"true","--enable-metrics":"true","--conf":"spark.sql.adaptive.enabled=true"}'`,
pit: [`Max workers fixed high with no auto scaling.`, `Using Glue for very long steady workloads without comparing to EMR.`, `Not checking spill/skew before adding workers.`],
q: [`How much compute is in a G.2X worker?`, `2 DPUs: 8 vCPU and 32 GB memory.`]
},
"Pay per byte scanned": {
d: `**Athena** (Trino-based) is serverless SQL over S3 using the Glue Catalog. Pricing is about **$5 per TB scanned** (with a 10 MB minimum per query), so the main levers are reducing bytes read:
- **Columnar formats** (Parquet/ORC): read only queried columns.
- **Compression** (Snappy/ZSTD): fewer bytes.
- **Partitioning** + filters on partition columns: skip whole folders.
- **File sizes** of ~128 MB–1 GB: fewer requests, efficient scans.
- **Sorting/clustering** within files for min/max stats pruning.
- **Iceberg** tables: metadata-based pruning, compaction.
- Avoid «SELECT *»; use LIMIT for exploration (helps only for some queries).

**Workgroups** set per-query and per-workgroup data scan limits, result locations and cost tracking. **Provisioned capacity** is an alternative for steady heavy usage.`,
life: `A library that charges by the number of pages you read: keep the books well indexed and ask for specific chapters, not the whole shelf.`,
work: `An analyst queried raw JSON logs (12 TB per month) with «SELECT *», costing ~$60 per query. Converting to partitioned, ZSTD Parquet (1.1 TB) and adding a workgroup limit of 200 GB per query brought typical queries under $0.50.`,
ex: `CREATE TABLE lake.clicks_parquet
WITH (format = 'PARQUET', write_compression = 'ZSTD', partitioned_by = ARRAY['dt'],
      external_location = 's3://lake/clicks_parquet/')
AS SELECT user_id, page, ts, dt FROM lake.clicks_json;
-- Query stats show "Data scanned"; workgroup setting: BytesScannedCutoffPerQuery`,
pit: [`Querying raw JSON/CSV directly at scale.`, `Forgetting partition filters.`, `No workgroup limits for ad-hoc users.`],
q: [`Three ways to reduce Athena cost?`, `Use columnar compressed formats, partition and filter on partitions, and select only needed columns (plus right file sizes).`]
},
"Partition projection": {
d: `With classic Hive partitions, every partition is a catalog entry. Tables with millions of partitions (e.g. «dt/hour/merchant») make Athena slow at **planning** (fetching partition metadata from Glue) and require pipelines to keep registering partitions.

**Partition projection** puts the partition scheme in **table properties**: types («date», «integer», «enum», «injected»), ranges, formats and a «storage.location.template». Athena **computes** the partition locations from your query filters instead of looking them up in Glue. No «ADD PARTITION» or «MSCK REPAIR» needed; new data is queryable as soon as it lands.

Caveats: it's Athena-only (other engines still use catalog partitions), queries without filters on projected columns may enumerate the whole range, and «injected» type requires an equality filter.`,
life: `Instead of a directory listing every house in a city, you use the address rule "street number 1–500 on each road": you compute where a house is from the address itself.`,
work: `A table partitioned by «dt» and «hour» over 5 years had 43k partitions plus a per-merchant level (millions). Athena planning took 40 s and an hourly job ran MSCK REPAIR. Partition projection on «dt» (date range) and «hour» (0–23) made planning ~1 s and removed the repair job.`,
ex: `ALTER TABLE lake.events SET TBLPROPERTIES (
  'projection.enabled' = 'true',
  'projection.dt.type' = 'date', 'projection.dt.range' = '2021-01-01,NOW',
  'projection.dt.format' = 'yyyy-MM-dd', 'projection.dt.interval' = '1', 'projection.dt.interval.unit' = 'DAYS',
  'projection.hour.type' = 'integer', 'projection.hour.range' = '0,23', 'projection.hour.digits' = '2',
  'storage.location.template' = 's3://lake/events/dt=\${dt}/hour=\${hour}/');`,
pit: [`Expecting Spark/EMR to use projection.`, `Queries without partition filters (huge enumerations).`, `Templates that don't match actual S3 layout.`],
q: [`What problem does partition projection remove?`, `Storing and looking up huge numbers of partitions in the catalog (slow planning, repair jobs).`]
},
"Design for access patterns": {
d: `DynamoDB is a key-value / wide-column store optimised for predictable, low-latency access **by key**:
- **Partition key** (PK): hashed to choose a physical partition. **Sort key** (SK): orders items within a PK (an "item collection").
- Efficient operations: «GetItem» (PK + SK), «Query» (one PK, optional SK conditions like begins_with/between, sorted), «BatchGetItem». **Scan** reads the whole table: avoid in hot paths.
- **GSIs** (global secondary indexes) provide alternative PK/SK for other access patterns (eventually consistent, own capacity); **LSIs** share the PK with a different sort key (must be defined at creation, 10 GB per PK limit).

So you design by **listing access patterns first** ("get order by id", "list a merchant's orders by date", "pending refunds by created time"), then choose keys and indexes to serve each with a Query or GetItem. Joins and ad-hoc queries are not its strength; export to S3/Athena for analytics.`,
life: `A building's mailbox wall: you can instantly open the box for flat 12B (key), and inside letters are sorted by date (sort key). Asking "all letters mentioning cricket in the building" means opening every box (scan).`,
work: `A team modelled orders like a relational table and used Scan with filters to list a merchant's recent orders: 2 s latency and huge read costs. Redesigning with PK = «MERCHANT#id», SK = «ORDER#<timestamp>#<id>» turned it into a Query returning 20 items in ~10 ms.`,
ex: `aws dynamodb query --table-name app \\
  --key-condition-expression "PK = :pk AND begins_with(SK, :sk)" \\
  --expression-attribute-values '{":pk":{"S":"MERCHANT#881"},":sk":{"S":"ORDER#2026-11"}}' \\
  --scan-index-forward false --limit 20`,
pit: [`Using Scan for application queries.`, `Designing tables before access patterns.`, `Low-cardinality partition keys.`],
q: [`What's the difference between Query and Scan?`, `Query reads items for one partition key (optionally by sort-key range); Scan reads the whole table.`]
},
"Capacity units": {
d: `Provisioned mode measures throughput in:
- **RCU**: one **strongly consistent** read per second of an item up to **4 KB**, or **two eventually consistent** reads/s. Larger items consume more (rounded up per 4 KB). Transactional reads cost 2×.
- **WCU**: one write per second of an item up to **1 KB** (rounded up). Transactional writes cost 2×.
- GSIs consume their own write capacity for every base-table write that affects them.

**On-demand mode**: pay per request (RRU/WRU) with automatic scaling; good for spiky/unknown traffic. **Provisioned + auto scaling**: cheaper for steady traffic. Throttling (ProvisionedThroughputExceeded) happens when consumption exceeds capacity at table, index or partition level; SDKs retry with backoff.`,
life: `Paying for highway lanes: each lane carries a fixed number of small cars per second; a truck (large item) takes several lanes' worth. On-demand is a toll per car with no reserved lanes.`,
work: `Items were 9 KB (an embedded JSON history), so each strongly consistent read cost 3 RCU and each write 9 WCU. Moving history to separate items and keeping the main item at 0.8 KB cut capacity costs by ~70%; switching reads that tolerated staleness to eventually consistent halved read costs again.`,
ex: `# capacity math
item_kb = 9
rcu_strong = -(-item_kb // 4)          # ceil(9/4) = 3
rcu_eventual = rcu_strong / 2          # 1.5
wcu = -(-item_kb // 1)                 # 9
aws dynamodb update-table --table-name app --billing-mode PAY_PER_REQUEST`,
pit: [`Large items inflating every read/write.`, `Ignoring GSI write costs.`, `Strong consistency where eventual is fine.`],
q: [`How many WCU does writing a 2.5 KB item use?`, `3 WCU (rounded up per 1 KB).`]
},
"Hot partitions": {
d: `Each physical partition supports up to about **3,000 RCU** and **1,000 WCU** (and ~10 GB). A table's capacity is spread across its partitions, so a single very popular **partition key** can be throttled even when the table has lots of unused capacity.

DynamoDB mitigates with **adaptive capacity** (boosting hot partitions, isolating frequently accessed items) and **split for heat**, but a single key can't exceed per-partition limits. Avoid hot keys by design:
- High-cardinality PKs (user id, order id), not «status=PENDING» or «date=today».
- **Write sharding**: add a suffix («PENDING#0..9») and query all shards in parallel.
- Cache hot reads (DAX, application cache).
- Use separate GSIs carefully: GSI keys can also be hot (and GSI throttling back-pressures base table writes).`,
life: `A food court where everyone wants the same stall; other stalls are empty but that one counter can only serve so many people per minute. Opening several identical counters (sharding) spreads the queue.`,
work: `A GSI with PK = «status» let workers query «PENDING» payments. During a sale, writes for status changes all hit the «PENDING» GSI partition, throttling the GSI and then the base table writes. Sharding the GSI key to «PENDING#<0-15>» and querying 16 shards in parallel removed throttling.`,
ex: `shard = hash(payment_id) % 16
item["GSI1PK"] = f"STATUS#PENDING#{shard}"
# read side: query all shards in parallel
results = parallel([query(GSI1PK=f"STATUS#PENDING#{s}") for s in range(16)])
# CloudWatch Contributor Insights shows most-accessed keys`,
pit: [`Low-cardinality GSI keys.`, `Date-only partition keys for time series.`, `Assuming on-demand mode removes per-partition limits.`],
q: [`Why can a table throttle when total consumed capacity is low?`, `One partition key is hot and exceeds that partition's per-partition limits.`]
},
"How S3 scales request rates": {
d: `Internally, S3 indexes keys in a sorted, partitioned structure. A new or quiet prefix starts with baseline capacity (~3,500 writes/s and ~5,500 reads/s). Under **sustained** high request rates, S3 automatically **splits** the index partition (by key ranges), increasing capacity. Splitting takes time (minutes), and during sudden spikes clients get **503 Slow Down**.

Implications:
- Gradual ramps are handled well; sudden massive spikes to one prefix are not.
- Spread keys so parallel workloads hit different key ranges (e.g. date + hour + a shard component). Old advice to add random hash prefixes is mostly unnecessary now, but distributing load still matters for extreme rates.
- For pre-planned extreme events, AWS support can pre-partition.
- **S3 Express One Zone** (directory buckets) offers much higher request rates and single-digit-ms latency for hot data in one AZ.`,
life: `A new road with two lanes that the city widens when traffic stays heavy for a while. A sudden festival crowd still jams it until the widening is done.`,
work: `A daily job launched 5,000 parallel readers at 00:00 on a single new prefix and saw 503s for the first 10 minutes. Ramping concurrency over 5 minutes and laying out data as «dt=/hour=/» let S3 scale smoothly; total job time dropped despite the slower start.`,
ex: `# good layout for parallelism
s3://lake/events/dt=2026-11-18/hour=00/part-000.parquet
s3://lake/events/dt=2026-11-18/hour=01/part-000.parquet
# watch: CloudWatch 5xxErrors, AllRequests on the bucket (request metrics)`,
pit: [`Instant huge spikes on one fresh prefix.`, `No retry/backoff.`, `Assuming capacity is unlimited instantly.`],
q: [`Why might a brand-new prefix throttle under a sudden spike?`, `S3 needs sustained load to split partitions and increase capacity; spikes exceed the baseline before splitting completes.`]
},
"Conditional writes changed lakehouse design": {
d: `S3 now supports **conditional writes**:
- «If-None-Match: *» on PUT/CompleteMultipartUpload: write only if the key **doesn't exist** (put-if-absent). Concurrent writers to the same key: one wins, others get 412 Precondition Failed.
- «If-Match: <ETag>»: write only if the object still has the expected ETag (compare-and-swap), so you can safely update a pointer file.

Why it matters: table formats need an **atomic commit**. Delta Lake's protocol requires put-if-absent for log files («_delta_log/N.json»); before this, multi-writer Delta on S3 needed a DynamoDB-based LogStore. Iceberg needs an atomic pointer swap; catalogs (Glue, REST) provide it, and conditional writes enable simpler catalog implementations and file-based coordination. It also helps idempotent pipelines ("write marker only if absent").`,
life: `A sign-up sheet where you can only write your name in an empty slot (put-if-absent), or replace a note only if it's still the version you last saw (compare-and-swap).`,
work: `Two Spark clusters writing to the same Delta table on S3 occasionally corrupted history (both wrote the same log version). Enabling S3 conditional-write support in the Delta S3 log store (instead of the unsafe default single-writer mode) made concurrent commits safe without running DynamoDB.`,
ex: `aws s3api put-object --bucket lake --key tables/orders/_delta_log/00000000000000000101.json \\
  --body commit.json --if-none-match "*"
# 412 PreconditionFailed if another writer created version 101 first
aws s3api put-object --bucket lake --key pointers/current.json --body new.json --if-match '"9b2cf535f27731c974343645a3985328"'`,
pit: [`Multiple Delta writers on S3 without a safe log store.`, `Assuming S3 renames are atomic for commits.`, `Ignoring 412 responses (lost commits).`],
q: [`What does If-None-Match: * guarantee?`, `The object is created only if no object with that key exists; concurrent attempts fail with 412.`]
},
"Glue jobs are managed Spark": {
d: `A Glue Spark job is Apache Spark run serverlessly: you provide a script (PySpark/Scala), choose Glue version (e.g. 4.0/5.0 → Spark 3.3/3.5), worker type and count; AWS provisions, runs and tears down. Extras on top of Spark:
- **DynamicFrames** (schema-flexible structures with choice types), **GlueContext** connectors (JDBC, S3, Kafka, Iceberg/Delta/Hudi via «--datalake-formats»).
- **Job bookmarks** for incremental processing.
- Built-in Spark UI logs, CloudWatch metrics, continuous logging, observability metrics.
- **Glue Studio** visual ETL, **Glue Streaming** (Spark Structured Streaming), **Glue for Ray** and Python shell jobs.

Cost: per DPU-hour, billed per second (1-minute min). Startup is usually tens of seconds. Many teams use plain Spark DataFrames in Glue (portable) and use DynamicFrames only for specific connectors.`,
life: `Ordering a catered meal rather than running your own kitchen: you give the recipe, they bring the cooks and equipment for exactly as long as needed.`,
work: `A team ran small hourly EMR clusters for 10-minute jobs, paying for cluster spin-up and idle time. Moving them to Glue jobs (G.1X, auto scaling, Flex for non-urgent ones) simplified operations and cut cost ~40%. Long-running heavy nightly jobs stayed on EMR Serverless where they were cheaper per vCPU-hour.`,
ex: `import sys
from awsglue.utils import getResolvedOptions
from awsglue.context import GlueContext
from pyspark.context import SparkContext
args = getResolvedOptions(sys.argv, ["JOB_NAME", "dt"])
glue = GlueContext(SparkContext.getOrCreate()); spark = glue.spark_session
df = spark.read.parquet(f"s3://lake/payments/dt={args['dt']}/")
(df.groupBy("merchant_id").sum("amount")
   .write.mode("overwrite").parquet(f"s3://lake/agg/dt={args['dt']}/"))`,
pit: [`Assuming Glue is always cheaper than EMR.`, `Locking all code into DynamicFrame APIs.`, `Ignoring Glue version Spark differences.`],
q: [`What is 1 DPU?`, `4 vCPU and 16 GB of memory.`]
},
"Bookmarks and pushdown": {
d: `**Job bookmarks** let a Glue job remember what it already processed for each source (by «transformation_ctx»):
- For S3 sources: tracks files by modification time/path, so the next run reads only new files.
- For JDBC sources: tracks a monotonically increasing key column («jobBookmarkKeys»).
- Enabled with «--job-bookmark-option job-bookmark-enable»; committed with «job.commit()» at the end of a successful run. Reset or rewind to reprocess.

**Pushdown** avoids reading unnecessary data:
- «push_down_predicate» on catalog sources filters **partitions before listing** S3 («dt >= '2026-11-01'»).
- «catalogPartitionPredicate» uses Glue partition indexes for server-side partition filtering.
- JDBC pushdown via query/«sampleQuery» or filtering columns.

Caveat: bookmarks track files, not rows; late changes to already-processed files or data updated in place aren't detected.`,
life: `A bookmark in a long book so you continue where you stopped, and a table of contents that lets you skip straight to the chapters you need.`,
work: `A Glue job reprocessed all 3 years of files every night (6 hours) because bookmarks weren't committed (missing «job.commit()») and it had no partition predicate. Adding both made nightly runs process only new files in 12 minutes.`,
ex: `dyf = glue.create_dynamic_frame.from_catalog(
    database="lake", table_name="raw_events",
    transformation_ctx="raw_events_src",
    push_down_predicate="dt >= '2026-11-18'",
    additional_options={"catalogPartitionPredicate": "dt >= '2026-11-18'"})
# ... transform & write ...
job.commit()      # persists bookmark state`,
pit: [`Forgetting job.commit().`, `Expecting bookmarks to detect updates inside old files.`, `Filtering after reading instead of pushing down.`],
q: [`What makes a bookmark state persist after a run?`, `Calling job.commit() at the end of a successful job (with bookmarks enabled and transformation_ctx set).`]
},
"How an Athena query runs": {
d: `Athena engine v3 is based on **Trino**:
1. The **coordinator** parses and plans the query, reading table metadata from the Glue Catalog (or Iceberg metadata), pruning partitions/files.
2. The plan is split into **stages**; each stage runs as tasks on many **workers** in AWS's shared pool.
3. **Source stages** read S3 **splits** (file chunks) in parallel, applying projection, predicate pushdown into Parquet/ORC (row group/stripe skipping).
4. Data is **exchanged** between stages for joins/aggregations (hash partitioning), mostly in memory.
5. Results are written to the workgroup's **S3 output location**.

Implications: queries are limited by memory per query (large joins/aggregations can fail with "Query exhausted resources"), so put the larger table on the left of joins (Trino builds the hash table from the right side), filter early, and avoid giant ORDER BYs without LIMIT. «EXPLAIN ANALYZE» shows per-stage stats.`,
life: `A head chef (coordinator) splits a banquet order into stations (stages); many cooks (workers) prepare ingredients in parallel, pass trays between stations, and the final plates are placed on the pickup counter (S3 results).`,
work: `A join of a 2 TB fact with a 300 GB table failed with "Query exhausted resources at this scale factor". The large table was on the right (build side). Swapping join order, pre-filtering the dimension, and converting both to Parquet with partitions made it finish in 90 s.`,
ex: `EXPLAIN ANALYZE
SELECT f.merchant_id, count(*)
FROM lake.payments f                 -- big table on the left (probe)
JOIN lake.merchants m                -- smaller table on the right (build)
  ON f.merchant_id = m.id
WHERE f.dt = '2026-11-18' AND m.city = 'Hyderabad'
GROUP BY 1;`,
pit: [`Large tables on the build (right) side of joins.`, `ORDER BY on huge results without LIMIT.`, `Expecting unlimited memory per query.`],
q: [`In Athena/Trino joins, which side should be the smaller table?`, `The right side, which is used to build the in-memory hash table.`]
},
"Athena + Iceberg": {
d: `Athena supports **Apache Iceberg** tables registered in Glue:
- DDL: «CREATE TABLE ... TBLPROPERTIES ('table_type'='ICEBERG')» with hidden partitioning («PARTITIONED BY (day(ts), bucket(16, id))»).
- DML: «INSERT INTO», «UPDATE», «DELETE», «MERGE INTO» (writes position delete files, merge-on-read).
- **Time travel**: «FOR TIMESTAMP AS OF», «FOR VERSION AS OF»; metadata tables («"t$snapshots"», «"t$files"», «"t$history"»).
- Maintenance: «OPTIMIZE t REWRITE DATA USING BIN_PACK» (compaction, applies deletes), «VACUUM t» (expires snapshots, removes orphan files per table properties).
- Schema and partition evolution with «ALTER TABLE».

Combined with Glue/Lake Formation permissions and S3 Tables (managed Iceberg with automatic maintenance), Athena becomes a serverless lakehouse engine without clusters.`,
life: `Upgrading a self-service library from "books on shelves, figure it out" to a managed catalogue that supports corrections, history and tidying, still without hiring permanent staff (serverless).`,
work: `A GDPR deletion process rewrote whole Hive partitions with CTAS (hours, error-prone). Converting the table to Iceberg let a simple «DELETE FROM users_events WHERE user_id IN (...)» run in minutes, followed by weekly «OPTIMIZE» and «VACUUM» to physically remove data.`,
ex: `CREATE TABLE lake.user_events (user_id bigint, event string, ts timestamp)
PARTITIONED BY (day(ts))
LOCATION 's3://lake/user_events/'
TBLPROPERTIES ('table_type' = 'ICEBERG', 'format' = 'parquet');
DELETE FROM lake.user_events WHERE user_id IN (SELECT user_id FROM ops.erasure_requests);
OPTIMIZE lake.user_events REWRITE DATA USING BIN_PACK WHERE ts >= TIMESTAMP '2026-11-01 00:00:00';
VACUUM lake.user_events;`,
pit: [`Never running OPTIMIZE/VACUUM (slow reads, storage growth).`, `Assuming DELETE physically removes data immediately.`, `Mixing writers that don't support the table's Iceberg version.`],
q: [`Why run VACUUM after DELETEs for compliance?`, `DELETE writes delete files and new snapshots; old data files remain until snapshots expire and files are removed.`]
},
"Physical partitions": {
d: `DynamoDB stores data in **partitions** (physical storage units on SSDs, replicated across 3 AZs). Each partition holds up to **10 GB** and serves up to **3,000 RCU / 1,000 WCU**. DynamoDB hashes the **partition key** to pick the partition; items with the same partition key live together, ordered by sort key.

Partitions **split** automatically when they exceed size or sustained throughput (and for heat on hot items). Capacity is distributed across partitions; **adaptive capacity** shifts unused capacity to busy partitions instantly, but a single key can't exceed a partition's limits.

LSIs share the base table's partition, so an **item collection** (all items with one PK including LSI entries) is limited to **10 GB**. GSIs are partitioned separately by their own keys.`,
life: `Lockers in a station, each with a maximum size and a limit on how many people can open it per minute. When a locker gets too full or busy, the station splits its contents into two lockers.`,
work: `A table used PK = «tenant_id» with an LSI; one large tenant's item collection hit the 10 GB limit and writes failed («ItemCollectionSizeLimitExceededException»). Redesigning to PK = «tenant_id#month» and replacing the LSI with a GSI removed the limit.`,
ex: `# partitions needed (rough sizing)
by_size = table_gb / 10
by_throughput = rcu / 3000 + wcu / 1000
partitions ≈ ceil(max(by_size, by_throughput))
# e.g. 250 GB, 12k RCU, 6k WCU -> max(25, 4 + 6) = 25 partitions`,
pit: [`LSIs on tables with large item collections.`, `Assuming capacity per key scales with table capacity.`, `Ignoring 10 GB per partition key with LSIs.`],
q: [`What's the size limit of an item collection on a table with an LSI?`, `10 GB per partition key value.`]
},
"Single-table design and safe writes": {
d: `**Single-table design**: store multiple entity types in one table with generic keys «PK», «SK» (and «GSI1PK»/«GSI1SK»), so related items share a partition and one **Query** fetches them together (e.g. a merchant profile + its recent orders + settings: PK = «MERCHANT#881», SK = «PROFILE», «ORDER#...», «SETTING#...»). It replaces joins with pre-joined item collections.

**Safe writes**:
- **Condition expressions**: «attribute_not_exists(PK)» (no overwrite), «version = :v» (optimistic locking), state checks («status = 'PENDING'»).
- **Atomic counters** with «UpdateItem ... ADD».
- **TransactWriteItems**: up to 100 actions all-or-nothing across items/tables (2× capacity cost), with idempotency via «ClientRequestToken».
- **Streams** for change events (CDC) to Lambda/Kinesis.

Single-table design is powerful but harder to evolve and query ad hoc; use it when access patterns are well known.`,
life: `A single folder per customer containing their profile sheet, orders and preferences in a known order, so one pull of the folder gives you everything for that customer.`,
work: `A refund service double-processed refunds when two workers picked the same request. A conditional update «SET status = 'PROCESSING' ... ConditionExpression status = 'PENDING'» meant only one worker could claim it; the other got ConditionalCheckFailed and skipped. A TransactWriteItems wrote the refund and the ledger entry atomically.`,
ex: `aws dynamodb update-item --table-name app \\
  --key '{"PK":{"S":"REFUND#991"},"SK":{"S":"META"}}' \\
  --update-expression "SET #s = :p" \\
  --condition-expression "#s = :pending" \\
  --expression-attribute-names '{"#s":"status"}' \\
  --expression-attribute-values '{":p":{"S":"PROCESSING"},":pending":{"S":"PENDING"}}'`,
pit: [`Blind PutItem overwrites.`, `Single-table design without documented access patterns.`, `Transactions everywhere (2× cost, limits).`],
q: [`How do you prevent two workers from processing the same item?`, `Use a conditional update that changes status only if it is still in the expected state (e.g. PENDING).`]
},
"Governance with Lake Formation": {
d: `**AWS Lake Formation** adds centralised, fine-grained permissions on top of the Glue Data Catalog:
- Grants on databases, tables, **columns** (include/exclude), **row filters** and **cell-level** security (data filters).
- **LF-Tags** (attribute-based access control): tag resources («domain=payments», «pii=true») and grant by tag expressions, scaling to thousands of tables.
- Integrated engines (Athena, Redshift Spectrum, EMR, Glue) obtain **temporary credentials** from Lake Formation (credential vending) to read only permitted data; users don't need direct S3 access.
- **Cross-account sharing** of tables via RAM, **audit** through CloudTrail.
- Hybrid access mode for gradual migration from IAM-only permissions.

It's AWS's answer to catalog-level governance (comparable to Unity Catalog), and works with Iceberg/Hudi/Delta tables registered in Glue.`,
life: `A building with a central security desk that issues visitor badges allowing only certain floors and rooms, labelled by colour codes (tags), instead of handing out master keys to the whole building.`,
work: `Analysts needed payments data without card details. With LF-Tags «pii=true» on sensitive columns and a grant to analysts of «domain=payments AND pii=false», Athena queries returned only allowed columns; S3 bucket policies were tightened so nobody could bypass Lake Formation by reading files directly.`,
ex: `aws lakeformation create-lf-tag --tag-key pii --tag-values true false
aws lakeformation add-lf-tags-to-resource \\
  --resource '{"TableWithColumns":{"DatabaseName":"lake","Name":"payments","ColumnNames":["card_bin","pan_last4"]}}' \\
  --lf-tags '[{"TagKey":"pii","TagValues":["true"]}]'
aws lakeformation grant-permissions --principal DataLakePrincipalIdentifier=arn:aws:iam::123456789012:role/analysts \\
  --permissions SELECT --resource '{"LFTagPolicy":{"ResourceType":"TABLE","Expression":[{"TagKey":"pii","TagValues":["false"]}]}}'`,
pit: [`Leaving direct S3 access that bypasses LF.`, `Per-table grants that don't scale (use LF-Tags).`, `Mixing IAM and LF permissions without a migration plan.`],
q: [`What do LF-Tags enable?`, `Attribute-based access control: grant permissions by tag expressions across many tables and columns.`]
}
});
