QUEST.deep("mongodb", {
"Model for how data is read": {
d: `MongoDB stores **documents** (BSON, max **16 MB**) in collections. The core modelling rule: **data that is accessed together should be stored together**.
- **Embed** when the relationship is one-to-one or one-to-few, the child data is owned by the parent and read with it, and it doesn't grow without bound (an order's line items, a user's addresses).
- **Reference** (store ids, join with «$lookup» or in the application) when the child set is large or unbounded (a merchant's transactions), shared by many parents (products in many orders), or updated independently and frequently.

Consider read/write ratios: embedding makes reads one fetch but can make updates touch big documents; references make writes simple but reads need multiple queries. Schema validation («$jsonSchema») keeps flexibility from becoming chaos.`,
life: `Keeping a passport and its visa pages in one booklet (embedded, read together) vs keeping a file of every trip receipt in a separate drawer referenced by passport number (unbounded).`,
work: `A merchant document embedded all transactions in an array; big merchants hit the 16 MB limit and every update rewrote huge documents. Moving transactions to their own collection with «merchant_id» references (and embedding only the last 10 in the merchant doc for the dashboard) fixed both.`,
ex: `// order with embedded items (bounded, read together)
{ _id: "ORD-991", merchant_id: 881, status: "PAID",
  items: [{ sku: "A1", qty: 2, price_inr: 499 }], created_at: ISODate("2026-11-18T10:00:00Z") }
// transactions referenced (unbounded)
{ _id: ObjectId(), merchant_id: 881, amount_inr: 1200, ts: ISODate(...) }
db.createCollection("orders", { validator: { $jsonSchema: { required: ["merchant_id", "status"] } } })`,
pit: [`Unbounded arrays in documents.`, `Normalising everything like SQL (many $lookups).`, `No schema validation at all.`],
q: [`When should you reference instead of embed?`, `When the related data is large/unbounded, shared across many parents, or updated independently.`]
},
"Schema patterns": {
d: `Common MongoDB design patterns:
- **Bucket**: group many small time-series points into one document per time window (e.g. per sensor per hour), reducing document count and index size. (MongoDB **time series collections** automate this.)
- **Subset**: embed a small, frequently needed subset (latest 10 reviews), keep the full set in another collection.
- **Extended reference**: copy a few frequently read fields of a referenced document (merchant name, city) into the referencing document to avoid lookups; accept some duplication.
- **Computed**: store precomputed values (totals, counts) updated on write.
- **Polymorphic**: different shapes in one collection with a type field.
- **Outlier**: handle the rare huge case separately (overflow documents) instead of designing everything for it.
- **Schema versioning**: «schema_version» field so code can handle old and new shapes during migrations.`,
life: `Packing for a trip: put daily essentials in your backpack (subset), write important contact numbers on a card in your wallet (extended reference), and pack socks by week in bags (bucket).`,
work: `A payments dashboard joined orders with merchants via $lookup on every request (~300 ms). Adding an extended reference «merchant: {id, name, city}» in each order (updated by a nightly job when names change) made the query a single indexed find at ~10 ms.`,
ex: `// bucket pattern (or use a time series collection)
{ sensor_id: 7, hour: ISODate("2026-11-18T10:00:00Z"), count: 360,
  readings: [{ t: 0, v: 21.5 }, { t: 10, v: 21.6 }] }
db.createCollection("metrics", { timeseries: { timeField: "ts", metaField: "sensor", granularity: "minutes" } })
// extended reference
{ _id: "ORD-991", merchant: { id: 881, name: "Chai Point", city: "Hyderabad" }, amount_inr: 240 }`,
pit: [`Duplicated fields never kept in sync.`, `Designing everything around rare outliers.`, `No version field during schema changes.`],
q: [`What does the extended reference pattern trade?`, `Some duplication (and sync effort) for avoiding joins on frequent reads.`]
},
"The ESR rule": {
d: `For compound indexes, order fields as **Equality → Sort → Range**:
- **Equality** fields first («merchant_id: 881», «status: 'PAID'»): they narrow to a contiguous index range.
- **Sort** fields next («sort({created_at: -1})»): the index order then delivers results already sorted, avoiding an in-memory **SORT** stage (limited memory, can fail or spill).
- **Range** fields last («amount: {$gt: 1000}»): range conditions scan a range of keys; placing them before the sort field would break the index ordering for sorting.

Example: query «{merchant_id: 881, status: "PAID", amount: {$gt: 1000}}» sorted by «created_at: -1» → index «{merchant_id: 1, status: 1, created_at: -1, amount: 1}».

Also: indexes support **prefix** queries (leftmost fields), «$in» on a small list behaves like equality for many cases, and covered queries (projection only on indexed fields, excluding «_id») avoid fetching documents.`,
life: `Finding books in a library sorted by section → shelf → publication date: you go to the exact section and shelf (equality), and books are already in date order (sort); then you pick those within a price range (range) as you walk.`,
work: `A merchant transactions API had index «{merchant_id: 1, amount: 1, created_at: -1}» and sorted by created_at with an amount range: explain showed a blocking SORT stage and 900k keys examined. Re-creating as «{merchant_id: 1, created_at: -1, amount: 1}» removed the SORT; keys examined dropped to ~2k, latency 1.4 s → 25 ms.`,
ex: `db.txns.createIndex({ merchant_id: 1, status: 1, created_at: -1, amount: 1 })
db.txns.find({ merchant_id: 881, status: "PAID", amount: { $gt: 1000 } })
       .sort({ created_at: -1 }).limit(50)
       .explain("executionStats")   // look for IXSCAN, no SORT stage`,
pit: [`Range fields before sort fields.`, `Too many single-field indexes instead of a good compound one.`, `Sorting on non-indexed fields over large results.`],
q: [`Where does the sort field go in an ESR index?`, `After the equality fields and before the range fields.`]
},
"explain() tells the truth": {
d: `«explain("executionStats")» shows the **winning plan** and actual execution numbers:
- Stages: **COLLSCAN** (full collection scan), **IXSCAN** (index scan), **FETCH** (load documents), **SORT** (in-memory sort), **PROJECTION_COVERED**, **SHARD_MERGE** (sharded), etc.
- «nReturned»: documents returned.
- «totalKeysExamined»: index entries scanned.
- «totalDocsExamined»: documents fetched.
- «executionTimeMillis».

Ideal: «nReturned ≈ totalKeysExamined ≈ totalDocsExamined» (or docsExamined = 0 for covered queries). Large ratios mean the index isn't selective for this query, or filters are applied after fetching. Also check «rejectedPlans» and whether a SORT stage is present. The **profiler** («db.setProfilingLevel(1, {slowms: 100})») and **slow query logs** show real-world slow queries; Atlas Performance Advisor suggests indexes.`,
life: `Comparing how many shelves a librarian checked versus how many books they actually brought you: checking 1,000 shelves to bring 5 books means the catalogue isn't helping.`,
work: `A support search returned 20 tickets but examined 1.2 M documents (COLLSCAN): no index on «customer_phone». Adding «{customer_phone: 1, created_at: -1}» made keysExamined = docsExamined = 20 and latency 2.5 s → 4 ms.`,
ex: `db.tickets.find({ customer_phone: "98xxxxxx01" }).sort({ created_at: -1 }).limit(20)
  .explain("executionStats").executionStats
// { nReturned: 20, totalKeysExamined: 20, totalDocsExamined: 20, executionTimeMillis: 3 }
db.setProfilingLevel(1, { slowms: 100 })
db.system.profile.find().sort({ ts: -1 }).limit(5)`,
pit: [`Reading only "is an index used?" and not the ratios.`, `Testing on tiny dev data.`, `Ignoring in-memory SORT stages.`],
q: [`What does totalDocsExamined much larger than nReturned indicate?`, `Many documents were fetched and filtered out: the index isn't selective enough for the query (or isn't used).`]
},
"Aggregation pipeline": {
d: `The aggregation pipeline processes documents through **stages**: «$match», «$project/$addFields/$set», «$group», «$sort», «$limit», «$lookup» (left outer join), «$unwind», «$facet», «$bucket», «$setWindowFields» (window functions), «$merge/$out» (write results), «$unionWith», etc.

Performance rules:
- Put «$match» (and «$sort»+«$limit») **early** so they can use indexes and reduce data for later stages. Only the initial «$match»/«$sort» can use indexes.
- «$project» away unneeded fields early to reduce memory.
- «$lookup» on large collections needs an index on the foreign field; prefer pipelines with «localField/foreignField» + inner pipeline filters.
- Each stage has a **100 MB memory limit**; «allowDiskUse» (default true in recent versions for many stages) lets blocking stages spill to disk.
- Use «$merge» to maintain materialised views incrementally.`,
life: `An assembly line: filter the raw materials first (match), trim parts you don't need (project), then assemble groups (group) and pack the top results (sort/limit).`,
work: `A daily GMV report pipeline started with «$lookup» to merchants for 30 M transactions and then «$match» on date: 4 minutes and huge memory. Moving «$match» on «ts» first (indexed), grouping by merchant, then «$lookup» only for 20k grouped rows took 6 seconds.`,
ex: `db.txns.aggregate([
  { $match: { ts: { $gte: ISODate("2026-11-18"), $lt: ISODate("2026-11-19") }, status: "PAID" } },
  { $group: { _id: "$merchant_id", gmv: { $sum: "$amount_inr" }, n: { $sum: 1 } } },
  { $lookup: { from: "merchants", localField: "_id", foreignField: "_id", as: "m" } },
  { $set: { city: { $first: "$m.city" } } },
  { $project: { m: 0 } },
  { $merge: { into: "daily_gmv", whenMatched: "replace" } }
])`,
pit: [`$lookup before filtering/grouping.`, `Unindexed foreign fields in $lookup.`, `$unwind on large arrays exploding document counts.`],
q: [`Which stages can use indexes in a pipeline?`, `Mainly an initial $match and $sort (and $geoNear) at the start of the pipeline.`]
},
"Replica sets": {
d: `A **replica set** is a group of mongod processes with the same data: one **primary** accepts writes; **secondaries** replicate by tailing the primary's **oplog** and applying operations. Typically 3 members (or 2 data + 1 arbiter, not recommended for production durability).

- **Elections**: if the primary is unreachable (heartbeats every 2 s, «electionTimeoutMillis» 10 s), eligible members elect a new primary using a Raft-like protocol; a **majority of voting members** is required.
- **Write concern**: «w: 1» (primary only), «w: "majority"» (default in 5.0+): acknowledged after a majority has the write, so it survives failover. «j: true» waits for the journal.
- **Read preference**: primary (default), primaryPreferred, secondary, secondaryPreferred, nearest. Secondaries may be **stale**.
- **Read concern**: «local», «majority» (data acknowledged by majority, won't roll back), «linearizable», «snapshot».
- Writes acknowledged with w:1 can be **rolled back** after failover if they hadn't replicated.`,
life: `A head office (primary) and two branch offices that copy every ledger entry. If the head office closes, the branches vote one of themselves as the new head office, needing a majority to agree.`,
work: `After a primary failover, some writes made with «w: 1» disappeared (rolled back) because they hadn't reached secondaries. Switching critical collections to «w: "majority"» (and reads that need certainty to «readConcern: "majority"») made acknowledged payments durable across failovers.`,
ex: `rs.status()
db.payments.insertOne({ _id: "pay_91x", amount_inr: 500 }, { writeConcern: { w: "majority", wtimeout: 5000 } })
db.payments.find({ merchant_id: 881 }).readPref("secondaryPreferred")
db.adminCommand({ getDefaultRWConcern: 1 })`,
pit: [`w:1 for critical writes.`, `Reading from secondaries and expecting fresh data.`, `Even number of voting members / arbiters in production.`],
q: [`Why use w: "majority" for payments?`, `A majority-acknowledged write survives primary failover; w:1 writes can be rolled back.`]
},
"Change streams and transactions": {
d: `**Change streams** («watch()») let applications subscribe to real-time changes (insert, update, replace, delete, DDL events) on a collection, database or deployment. Built on the oplog, with a **resume token** per event: after a crash, resume from the last processed token (as long as it's still in the oplog). Options: «fullDocument: "updateLookup"» or pre/post images («changeStreamPreAndPostImages») for full before/after documents. Used for event-driven apps, cache invalidation, and CDC (Debezium's MongoDB connector, Kafka connector).

**Multi-document ACID transactions** (replica sets 4.0+, sharded 4.2+): snapshot isolation, all-or-nothing across documents/collections. But they add latency and lock contention, have a default 60-second lifetime, and should be **short**. Good schema design (embedding related data in one document) often makes single-document atomic updates enough; single-document operations are always atomic.`,
life: `Change streams: a news feed of every change to your files, with a bookmark so you can pick up where you left off. Transactions: updating several files at once so either all changes happen or none do.`,
work: `A cache of merchant settings was refreshed every 5 minutes, showing stale data after edits. A change stream on «merchant_settings» with resume tokens persisted in Redis invalidated cache entries within ~100 ms. A transfer between two wallets used a short multi-document transaction with retry on «TransientTransactionError».`,
ex: `const cs = db.merchant_settings.watch([], { fullDocument: "updateLookup", resumeAfter: lastToken });
cs.on("change", ev => { cache.del(ev.documentKey._id); saveToken(ev._id); });
// transaction (driver)
await session.withTransaction(async () => {
  await wallets.updateOne({ _id: a, bal: { $gte: 100 } }, { $inc: { bal: -100 } }, { session });
  await wallets.updateOne({ _id: b }, { $inc: { bal: 100 } }, { session });
}, { writeConcern: { w: "majority" } });`,
pit: [`Not persisting resume tokens.`, `Oplog too small for consumer downtime (resume token lost).`, `Long or large transactions.`],
q: [`What lets a change stream continue after a crash without missing events?`, `The resume token from the last processed event (if still within the oplog window).`]
},
"Sharding splits by shard key": {
d: `Sharding distributes a collection across **shards** (each a replica set):
- The **shard key** (one or more fields) determines data placement. Data is divided into contiguous **ranges** (chunks) of shard key values.
- **mongos** routers receive queries and route them using the **config servers**' metadata (which ranges live on which shard).
- **Ranged sharding** keeps nearby keys together (good for range queries, risky for monotonically increasing keys: all inserts hit the last chunk). **Hashed sharding** spreads writes evenly (good for monotonic ids like ObjectId/timestamps) but range queries become scatter-gather.
- Good shard keys have **high cardinality**, **even frequency** (no hot values), and support the most common queries (so they can be **targeted**). Compound keys (e.g. «{merchant_id: 1, ts: 1}») often balance these.
- Since 5.0 you can **reshard** online; since 4.4, refine shard keys by adding suffix fields.`,
life: `Splitting a phone directory into volumes by surname ranges (A–C, D–F...). Choose a split that keeps volumes evenly used; splitting by "city = Mumbai/other" would overload one volume.`,
work: `Sharding «events» on «{created_at: 1}» sent every insert to the last shard (hot shard at 100% CPU, others idle). Resharding to «{device_id: "hashed"}» spread writes evenly; queries by device became targeted, and time-range analytics moved to a separate analytics pipeline.`,
ex: `sh.enableSharding("pay")
sh.shardCollection("pay.txns", { merchant_id: 1, ts: 1 })
sh.shardCollection("pay.events", { device_id: "hashed" })
db.adminCommand({ reshardCollection: "pay.events", key: { device_id: "hashed", ts: 1 } })
sh.status()`,
pit: [`Monotonically increasing ranged shard keys.`, `Low-cardinality shard keys (jumbo chunks).`, `Shard keys queries rarely include (everything scatter-gather).`],
q: [`Why is a timestamp alone a poor ranged shard key?`, `New inserts always go to the highest range, so one shard takes all writes.`]
},
"Targeted vs scatter-gather": {
d: `When a query reaches **mongos**:
- If the filter includes the **shard key** (equality or range on its prefix), mongos sends it only to the shards owning those ranges: a **targeted** query. Latency and load scale well.
- If not, mongos must send it to **all shards** (**scatter-gather**, broadcast), wait for all, and merge results («SHARD_MERGE» in explain). Every shard does work for every such query, so throughput doesn't scale with shard count, and tail latency follows the slowest shard.

Design implications: choose a shard key that appears in your most frequent queries (e.g. «merchant_id» if most queries are per merchant). For secondary access patterns, consider separate collections/views or a search engine, and keep scatter-gather queries rare (analytics on secondaries/Atlas analytics nodes).`,
life: `Asking one specific branch for a customer's file (targeted) vs phoning every branch in the country and waiting for all of them to reply (scatter-gather).`,
work: `With shard key «{customer_id: 1}», the merchant dashboard queried by «merchant_id» and fanned out to all 12 shards; adding shards didn't improve its throughput. A secondary collection keyed and sharded by merchant_id (maintained from change streams) made dashboard queries targeted.`,
ex: `db.txns.find({ merchant_id: 881, ts: { $gte: ISODate("2026-11-18") } }).explain()
// winningPlan.stage: "SINGLE_SHARD"   -> targeted
db.txns.find({ status: "FAILED" }).explain()
// winningPlan.stage: "SHARD_MERGE"    -> scatter-gather across all shards`,
pit: [`Choosing shard keys only for write distribution, ignoring reads.`, `Frequent scatter-gather queries at high QPS.`, `Expecting more shards to speed up broadcast queries.`],
q: [`Why don't more shards help scatter-gather throughput?`, `Every query still hits every shard, so each shard's load grows with total query volume.`]
},
"How WiredTiger stores and caches": {
d: `**WiredTiger** is MongoDB's storage engine:
- Each collection and each index is a separate **B-tree** file (collections keyed by an internal record id; «_id» has its own index). Data is **compressed** (snappy default, zstd/zlib options); indexes use prefix compression.
- **Document-level concurrency**: optimistic concurrency control with MVCC snapshots; writers to different documents don't block each other. Conflicting writes retry (WriteConflict).
- **Cache**: WiredTiger keeps uncompressed pages in its cache (default ~50% of (RAM − 1 GB)); the OS file cache holds compressed pages. Eviction threads write dirty pages; if the cache is too full of dirty data, application threads are forced into eviction ("cache pressure"), causing latency spikes.
- **Durability**: a **journal** (write-ahead log) with frequent syncs, plus **checkpoints** every 60 seconds writing a consistent snapshot of data files.

Keep the **working set** (hot data + indexes) in cache for predictable performance.`,
life: `A library with books stored compressed in the stacks (disk), a reading room where frequently used books sit open on tables (cache), and a clerk who files returned books when the tables get crowded (eviction).`,
work: `Latency spikes every few minutes coincided with "cache dirty %" above 20% and application threads doing eviction. The bulk import was saturating the cache. Throttling the import (smaller batches, w: majority), adding RAM, and dropping two unused indexes (freeing cache) removed the spikes.`,
ex: `db.serverStatus().wiredTiger.cache["bytes currently in the cache"]
db.serverStatus().wiredTiger.cache["tracked dirty bytes in the cache"]
db.txns.stats().indexSizes            // indexes compete for cache
db.txns.aggregate([{ $indexStats: {} }])   // find unused indexes`,
pit: [`Working set bigger than cache.`, `Unused indexes wasting cache and write I/O.`, `Unthrottled bulk writes causing cache pressure.`],
q: [`Why do unused indexes hurt performance?`, `Every write updates them and they consume cache memory, crowding out useful data.`]
},
"How MongoDB picks a plan": {
d: `For a query **shape** (filter fields, sort, projection, ignoring constant values), the query planner:
1. Generates **candidate plans** (one per usable index, plus index intersections and alternatives).
2. Runs them in parallel in a **trial period** ("race") for a limited number of work units / results.
3. Picks the plan that produced the most results with the least work, caches it in the **plan cache** for that shape.
4. Reuses the cached plan for later queries of the same shape; if its performance degrades significantly (works far more than during the trial), the cache entry is **replanned**.

Pitfalls: a plan good for one parameter value (a small merchant) is cached and reused for another (a huge merchant). Tools: «explain("allPlansExecution")», «planCacheClear», «$planCacheStats», **hint()** to force an index, and **query settings** (8.0) to set index hints per shape without code changes.`,
life: `A delivery company tries three routes on the first trip of the day, then uses the fastest one for every similar delivery, until it notices the chosen route has become much slower.`,
work: `A query by «merchant_id» + «status» was fast for most merchants but slow for the largest because a cached plan (picked when a small merchant ran first) used the status index. Reordering the compound index to «{merchant_id: 1, status: 1, created_at: -1}» made one plan best for all; the bad plan disappeared.`,
ex: `db.txns.find({ merchant_id: 881, status: "PAID" }).explain("allPlansExecution")
db.txns.aggregate([{ $planCacheStats: {} }])
db.txns.getPlanCache().clear()
db.txns.find({ merchant_id: 881, status: "PAID" }).hint({ merchant_id: 1, status: 1, created_at: -1 })`,
pit: [`Many overlapping indexes confusing the planner.`, `Hard-coding hints that become wrong as data changes.`, `Ignoring parameter-dependent performance.`],
q: [`What is a query shape?`, `The structure of a query (fields filtered/sorted/projected) independent of the specific values.`]
},
"The oplog is idempotent": {
d: `The **oplog** («local.oplog.rs») is a special capped collection on each replica set member recording every write as operations. Writes are transformed into **idempotent** entries: «{$inc: {count: 1}}» becomes «{$set: {count: 6}}», multi-document updates become one entry per document. That means applying the same entry twice yields the same result, which makes replication and recovery robust (secondaries can safely re-apply after interruptions).

Secondaries pull oplog batches from a sync source and apply them in parallel (by document). The oplog has a **size** (or minimum retention hours, «oplogMinRetentionHours»): its **window** (time between oldest and newest entry) determines how long a secondary can be offline and still catch up, and how far back change streams can resume. If a member falls off the window, it needs a full **initial sync**.`,
life: `A diary that records "balance is now ₹600" rather than "add ₹100", so re-reading an entry twice never double-counts.`,
work: `A secondary was down for 30 hours during maintenance; the oplog window was only 18 hours at peak write load, forcing a 9-hour initial sync of 4 TB. Increasing the oplog size and setting «oplogMinRetentionHours: 72» ensured maintenance windows and change stream consumers had enough history.`,
ex: `rs.printReplicationInfo()          // configured oplog size, log length start to end (window)
rs.printSecondaryReplicationInfo() // replication lag per secondary
db.adminCommand({ replSetResizeOplog: 1, size: 102400, minRetentionHours: 72 })   // size in MB
use local; db.oplog.rs.find().sort({ $natural: -1 }).limit(1)`,
pit: [`Small oplog on write-heavy clusters.`, `Change stream consumers down longer than the oplog window.`, `Huge multi-document updates bloating the oplog.`],
q: [`Why are oplog entries idempotent?`, `So applying an entry more than once (after interruptions/retries) produces the same state, making replication safe.`]
},
"Ranges, the balancer and targeting": {
d: `A sharded collection is split into **ranges** (formerly "chunks") of shard key values, tracked by the **config servers**. The **balancer** (a background process on the config server primary) moves ranges between shards to keep data evenly distributed (since 6.0, based on data size differences rather than chunk counts). Migrations copy documents to the recipient shard, then commit an ownership change; queries continue during migration.

Considerations:
- **Jumbo ranges**: a single shard key value with too much data can't be split (low-cardinality keys) and can't move easily.
- **Balancer windows** to avoid migrations during peak traffic.
- **Zone sharding**: pin ranges to specific shards (e.g. data residency: Indian customers' data on shards in Mumbai; hot vs cold hardware).
- mongos caches routing tables; after migrations it refreshes metadata (stale config errors are retried automatically).`,
life: `A warehouse manager who moves boxes between warehouses when one gets too full, but can't split a single enormous crate, and keeps certain goods in specific locations by law.`,
work: `Data residency rules required Indian merchants' data in ap-south-1. With zone sharding on «{country: 1, merchant_id: 1}», ranges with country "IN" were assigned to shards in Mumbai; the balancer only moved them among those shards. A balancer window 01:00–05:00 avoided peak-hour migrations.`,
ex: `sh.addShardToZone("shard-mumbai-1", "IN")
sh.updateZoneKeyRange("pay.txns", { country: "IN", merchant_id: MinKey }, { country: "IN", merchant_id: MaxKey }, "IN")
use config
db.settings.updateOne({ _id: "balancer" }, { $set: { activeWindow: { start: "01:00", stop: "05:00" } } }, { upsert: true })
sh.balancerCollectionStatus("pay.txns")`,
pit: [`Low-cardinality shard keys causing jumbo ranges.`, `Balancing during peak load.`, `Forgetting zones when residency matters.`],
q: [`What does zone sharding let you do?`, `Assign specific shard key ranges to specific shards (e.g. for data residency or hardware tiers).`]
},
"Pipeline optimization and limits": {
d: `The aggregation framework automatically optimises pipelines:
- Moves «$match» stages earlier (before «$project/$addFields» when the match doesn't depend on computed fields); splits «$match» filters to push parts earlier.
- Coalesces «$sort» + «$limit» into a top-k sort (memory proportional to k).
- Merges consecutive «$match», «$limit», «$skip» stages; combines «$lookup» + «$unwind».
- Uses the **slot-based execution engine (SBE)** for eligible stages (faster for «$group», «$lookup» in recent versions).

Limits to remember:
- **16 MB** per output document (e.g. a «$group» with «$push» into a huge array fails).
- **100 MB** per blocking stage in memory; «allowDiskUse» enables spilling (default on for many cases in 6.0+).
- «$lookup» with large foreign collections needs indexes on the join field.
- On sharded clusters, parts of the pipeline run on shards and a merge part runs on a shard or mongos; «$match» on the shard key keeps it targeted.

Check «explain()» on aggregate to see the optimised pipeline and which stages use indexes.`,
life: `A smart kitchen manager who rearranges your recipe so you chop only the vegetables you'll actually use, and warns you that no single dish can exceed the plate size.`,
work: `A pipeline «$group» by merchant with «$push» of all transaction ids failed for big merchants ("exceeds maximum document size"). Replacing «$push» with counts/sums and a «$topN» of the latest 10 ids, and writing details to a separate collection via «$merge», fixed it.`,
ex: `db.txns.explain("executionStats").aggregate([
  { $addFields: { inr: { $divide: ["$amount_paise", 100] } } },
  { $match: { merchant_id: 881 } },          // optimizer moves this first
  { $sort: { ts: -1 } }, { $limit: 10 }       // coalesced top-k sort
])
{ $group: { _id: "$merchant_id", latest: { $topN: { n: 10, sortBy: { ts: -1 }, output: "$_id" } }, n: { $sum: 1 } } }`,
pit: [`Unbounded $push/$addToSet in $group.`, `Assuming the optimizer can move $match past computed fields it depends on.`, `Huge $lookup fan-outs.`],
q: [`What happens to a $sort followed by $limit: 10?`, `They're coalesced into a top-k sort that only keeps 10 documents in memory.`]
}
});
