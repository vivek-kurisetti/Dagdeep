QUEST.zone("mongodb", {
mission:["dev","The merchant profile service runs on MongoDB. Queries are slow, a shard is hot and someone wants transactions everywhere. Learn document modelling, indexing and scaling, then fix it."],
levels:[
{t:"Documents", sub:"Embed or reference", rounds:[
 ["learn","Model for how data is read","Documents are BSON (max **16 MB**). Data that's read together should be stored together: **embed** one-to-few and owned data; **reference** one-to-many that grows without bound or data shared by many documents."],
 ["sort","Embed or reference?",{"Embed":["Merchant's 3 addresses","Order line items (bounded)","User preferences"],"Reference":["Merchant's millions of payments","Product shared by many orders","Comments that grow forever"]},"Unbounded arrays are the classic anti-pattern."],
 ["learn","Schema patterns","**Bucket**: group time-series readings into hourly documents. **Subset**: embed the 10 latest reviews, reference the rest. **Extended reference**: copy a few fields (name) from the referenced doc to avoid lookups. **Computed**: store precomputed totals."],
 ["match","Pattern → use",[["Bucket","IoT readings grouped per device per hour"],["Subset","Latest 10 reviews embedded, rest elsewhere"],["Extended reference","Order stores customer name + id"],["Outlier","Flag the few huge documents and overflow them"]],"Patterns trade duplication for read speed."],
 ["tf","Document facts",[["A document can grow beyond 16 MB with arrays.",false,"16 MB is the hard limit."],["MongoDB supports schema validation with $jsonSchema.",true,"Flexible, not lawless."],["Every document has an _id.",true,"ObjectId by default, roughly time-ordered."]]]
]},
{t:"Indexes & queries", sub:"ESR rule, explain", rounds:[
 ["learn","The ESR rule","Order compound index fields: **Equality** fields first, then **Sort** fields, then **Range** fields. Query «{merchant: X, status: 'PAID', amount: {$gt: 100}}» sorted by created_at → index «{merchant:1, status:1, created_at:-1, amount:1}»."],
 ["order","Order the fields for: equality on merchant & status, sort by created_at, range on amount",["merchant","status","created_at","amount"],"Equality, Sort, Range."],
 ["learn","explain() tells the truth","«db.pay.find(q).explain('executionStats')»: **IXSCAN** vs **COLLSCAN**, «totalKeysExamined», «totalDocsExamined» vs «nReturned». Ideal: examined ≈ returned. An in-memory **SORT** stage means the index doesn't support the sort."],
 ["pick","explain shows COLLSCAN, docsExamined 40M, nReturned 12. Fix?",["Create an index matching the query","Add RAM","Shard immediately","Use $where"],0,"A missing index; shard only when one node can't cope."],
 ["match","Index types",[["Multikey","Indexes each array element"],["TTL","Expires documents after a time"],["Partial","Indexes only docs matching a filter"],["Wildcard","Indexes unknown/dynamic field paths"]],"Pick for the data shape."],
 ["learn","Aggregation pipeline","Stages run in order: put «$match» (and «$project») **early** so indexes are used and less data flows. «$lookup» joins, «$unwind» flattens arrays, «$group» aggregates. Big «$group»/«$sort» stages may spill (allowDiskUse)."],
 ["bug","Which stage order wastes the most work?",["{ $group: { _id: '$merchant', gmv: { $sum: '$amount' } } }","{ $match: { status: 'PAID', dt: '2026-11-17' } }","{ $sort: { gmv: -1 } }","{ $limit: 10 }"],0,"$group runs over every document before $match filters. Move $match first so it can use an index."]
]},
{t:"Replica sets", sub:"Elections, write concern", rounds:[
 ["learn","Replica sets","One **primary** takes writes; **secondaries** replicate its **oplog**. If the primary fails, members **elect** a new primary (needs a majority of voting members). Use an odd number of voting members."],
 ["match","Write concern / read settings",[["w: 1","Primary acknowledged; can roll back on failover"],["w: 'majority'","Majority acknowledged; survives failover"],["readConcern 'majority'","Read only majority-committed data"],["readPreference secondaryPreferred","Read from secondaries if available (can be stale)"]],"w: majority is the default write concern since 5.0."],
 ["pick","After a failover, some acknowledged writes disappeared. The app used w:1. Why?",["They hadn't replicated and were rolled back","Oplog too big","Index missing","Sharding"],0,"Use w:'majority' for data you can't lose."],
 ["learn","Change streams and transactions","**Change streams** let apps subscribe to inserts/updates/deletes (Debezium uses them). Multi-document **transactions** exist, but good document design (keeping related data in one doc) makes most writes atomic anyway."],
 ["tf","Replica facts",[["A 2-member replica set can elect a primary if one dies.",false,"No majority; add an arbiter or a third member."],["Single-document writes are atomic.",true,"Even across embedded arrays."],["Secondaries can serve stale reads.",true,"Replication is asynchronous."]]]
]},
{t:"Sharding", sub:"Shard keys, chunks", rounds:[
 ["learn","Sharding splits by shard key","A sharded collection is split into **chunks** by **shard key** ranges and spread across shards. **mongos** routers send queries to the right shards; **config servers** hold the metadata. The balancer moves chunks."],
 ["sort","Good or bad shard key?",{"Good":["{ merchant_id: 1, created_at: 1 }","{ customer_id: 'hashed' }"],"Bad":["{ created_at: 1 } (monotonic)","{ status: 1 } (low cardinality)","{ country: 1 }"]},"High cardinality, even writes, matches common queries."],
 ["pick","Shard key is created_at. All inserts hit one shard. Why?",["Monotonic keys send every new doc to the last chunk","mongos bug","Too many indexes","w:majority"],0,"Use hashed keys or a compound key with a high-cardinality prefix."],
 ["learn","Targeted vs scatter-gather","Queries that include the shard key go to one shard (**targeted**). Others ask every shard (**scatter-gather**). Pick a shard key that your hottest queries include. Shard keys can be refined or resharded in newer versions."],
 ["match","Sharding terms",[["mongos","Query router"],["Config servers","Cluster metadata"],["Jumbo chunk","Chunk that can't split: too many docs with one key value"],["Hashed sharding","Even spread, no efficient range queries on the key"]],"Know the moving parts."]
]},
{t:"Boss: Fix the profile service", boss:true, time:30, rounds:[
 ["pick","Merchant documents embed every payment and hit 16 MB. Fix?",["Reference payments in their own collection","Bigger server","GridFS","More indexes"],0,"Unbounded arrays don't belong in a doc."],
 ["pick","A query sorts in memory and fails with a memory limit. Fix?",["Compound index following ESR","allowDiskUse everywhere","More shards","readPreference secondary"],0,"Let the index provide the sort."],
 ["pick","Writes lost after failover. Fix?",["w: 'majority'","w: 0","More secondaries only","Change streams"],0,"Majority acks survive elections."],
 ["pick","One shard takes all inserts. Fix?",["Hashed or compound shard key","Add mongos","Bigger config servers","TTL index"],0,"Avoid monotonic keys."],
 ["pick","A pipeline $groups 100M docs, then $matches today. Fix?",["Move $match to the start","Add $unwind","allowDiskUse","Shard"],0,"Filter first."],
 ["pick","Session docs should vanish after 30 minutes. Use…",["TTL index","Cron delete every second","Capped collection with sharding","Transactions"],0,"Built-in expiry."]
]}
]});

QUEST.more("mongodb", [
{act:"Expert", t:"WiredTiger internals", sub:"Cache, checkpoints, journal", rounds:[
 ["learn","How WiredTiger stores and caches","WiredTiger stores each collection and index as a **B-tree** file, with **document-level concurrency** (optimistic, MVCC snapshots). Its **cache** defaults to the larger of 50% of (RAM − 1 GB) or 256 MB; the rest of RAM serves as OS file cache.",null,null,`### Durability
- **Journal** (write-ahead log): with «j: true» or majority write concern on a journaled replica set, a write is acknowledged after the journal is synced (journal commit interval ~100 ms otherwise).
- **Checkpoints** every 60 seconds write a consistent snapshot of data files. Recovery = last checkpoint + journal replay.

### Cache pressure and eviction
Pages in cache are clean or **dirty**. Eviction threads write out and evict pages when cache use passes targets (e.g. 80% total, 5% dirty). When application threads have to help evict (cache > 95% or dirty > 20%), **latency spikes**. Watch «db.serverStatus().wiredTiger.cache»: bytes in cache, tracked dirty bytes, "application threads page read/evict".

### Compression
Collections use **snappy** by default (zstd and zlib available); indexes use **prefix compression**. On-disk size ≪ in-cache size: data is uncompressed in the WiredTiger cache, compressed in the OS cache and on disk.

### Working set
Performance depends on the **working set** (hot documents + indexes) fitting in cache. If the index alone doesn't fit, every lookup risks disk reads. «db.collection.totalIndexSize()» vs cache size is a first sanity check.`],
 ["num","A server has 64 GB RAM. Default WiredTiger cache size (GB)?",31.5,0.1,"GB","50% of (64 − 1) GB = 31.5 GB."],
 ["pick","p99 latency spikes and serverStatus shows application threads doing eviction. Cause?",["Cache under pressure (working set too big or dirty data too high)","Too few indexes","Sharding","Read preference"],0,"Grow RAM, shrink the working set, or speed up writes to disk."],
 ["match","Mechanism",[["Journal","Write-ahead log for durability between checkpoints"],["Checkpoint","Consistent data file snapshot every ~60 s"],["Eviction","Removing pages from cache, writing dirty ones"],["Prefix compression","Shrinks index keys sharing prefixes"]],"Storage engine basics."],
 ["tf","Engine truths",[["WiredTiger locks whole collections for writes.",false,"Document-level concurrency."],["Data is compressed inside the WiredTiger cache.",false,"Uncompressed in cache, compressed on disk."]]]
]},
{act:"Expert", t:"Query planner & indexes deep", sub:"Plan cache, ESR edge cases", rounds:[
 ["learn","How MongoDB picks a plan","For a new query shape, the planner generates candidate plans (one per usable index or combination), **races** them for a trial period, and caches the winner in the **plan cache** keyed by the query shape.",null,null,`### Plan cache behaviour
- Cached plans are reused for the same shape; if a cached plan performs much worse than expected (works 10× more than during the trial), it's re-planned.
- Plans are evicted on index changes, collection drops or restarts. «planCacheClear» / «$planCacheStats» to inspect.
- Data skew can make a cached plan great for one value and terrible for another.

### ESR edge cases
- **$in** with few values acts like equality for ESR and can produce merged sorts; with many values it behaves more like a range for sorting purposes.
- A sort on «{created_at: -1}» can use an index on «{created_at: 1}» (traversed backwards). For compound sorts, directions must match the index or be all reversed.
- Range before sort in the index means the sort can't use the index → in-memory SORT stage (100 MB limit, spills with allowDiskUse).

### Covered queries
If the filter and projection only use indexed fields (and exclude «_id» unless indexed), the query is **covered**: «totalDocsExamined: 0».

### Monitoring
Profiler («db.setProfilingLevel(1, {slowms: 100})»), slow query logs, and «explain('allPlansExecution')» to see the race.`],
 ["sort","Can the index {merchant: 1, created_at: -1} support it without an in-memory sort?",{"Yes":["find({merchant: 7}).sort({created_at: -1})","find({merchant: 7}).sort({created_at: 1})","find({merchant: 7, created_at: {$gte: d}}).sort({created_at: -1})"],"No (in-memory SORT)":["find({created_at: {$gte: d}}).sort({merchant: 1, amount: 1})","find({merchant: {$gt: 5}}).sort({created_at: -1})"]},"Equality prefix + sort field order matters."],
 ["pick","totalDocsExamined is 0 and nReturned is 500. What happened?",["Covered query answered from the index","Bug","Collection scan","Cache miss"],0,"Projection only used indexed fields."],
 ["order","How a new query shape gets a plan",["Planner enumerates candidate plans","Candidates run a short trial in parallel","Winner by work done and results produced","Winner stored in the plan cache for this shape","Re-planned if it later performs far worse"],"The plan cache is per query shape."],
 ["tf","Planner truths",[["An index on {a: 1} can serve sort({a: -1}).",true,"Traversed backward."],["In-memory sorts have no memory limit.",false,"100 MB per stage before spilling (or failing without disk use)."]]]
]},
{act:"Expert", t:"Replication deep", sub:"Oplog, elections, read/write concerns", rounds:[
 ["learn","The oplog is idempotent","Each write becomes one or more **idempotent** oplog entries (e.g. «$inc» becomes «$set» of the resulting value). Secondaries pull and apply them in batches. The oplog is a capped collection; its size sets the **oplog window**.",null,null,`### Oplog window
Window = how long a secondary can be offline (or lagging) and still catch up. If it falls off the end, it needs a full **initial sync**. Size the oplog for maintenance windows plus peak write bursts; «rs.printReplicationInfo()» shows the window.

### Elections
Raft-like protocol: a secondary calls an election after «electionTimeoutMillis» (10 s) without hearing from the primary. Priorities choose preferred primaries; hidden and delayed members have priority 0. Writes with w:1 not yet replicated at failover are **rolled back** into rollback files.

### Concerns
| Read concern | Returns |
|---|---|
| local | Latest data on that node (may roll back) |
| majority | Data acknowledged by a majority (won't roll back) |
| linearizable | Majority + reflects all prior majority writes (primary only, slow) |
| snapshot | Point-in-time snapshot (transactions, reads at clusterTime) |

Write concern «{w: 'majority', j: true}» = durable on a majority. **Causal consistency** sessions guarantee read-your-writes across secondaries using cluster times.`],
 ["num","Oplog is 50 GB; peak oplog generation is 20 MB/s. Oplog window in minutes (1 GB = 1,024 MB)?",43,1,"min","50 × 1,024 ÷ 20 = 2,560 s ≈ 43 minutes. A secondary down longer needs an initial sync."],
 ["match","Need → setting",[["Never lose acknowledged writes on failover","w: 'majority'"],["Read only data that can't be rolled back","readConcern 'majority'"],["Read-your-writes from secondaries","Causally consistent session"],["Reporting replica that never becomes primary","priority 0, hidden member"]],"Pick per operation."],
 ["pick","After a failover, a 'rollback' directory appears with documents. Meaning?",["Writes acknowledged with w:1 that never replicated were undone","Normal backup","Index rebuild","Shard migration"],0,"Use majority write concern for important data."],
 ["tf","Replication truths",[["An $inc is replicated as $inc.",false,"Converted to an idempotent $set."],["A small oplog window risks expensive initial syncs.",true,"Size it generously."]]]
]},
{act:"Expert", t:"Sharding deep", sub:"Ranges, balancer, zones, resharding", rounds:[
 ["learn","Ranges, the balancer and targeting","A sharded collection's data is divided into **ranges** (formerly "chunks") by shard key. The **balancer** moves ranges between shards to even out **data size** (MongoDB 7.0+ balances by data size rather than chunk count; auto-splitting was removed). mongos routes using the cached routing table.",null,null,`### Operations and targeting
- Queries with the **full shard key** (or a prefix for ranged keys) → targeted to one shard.
- Without it → **scatter-gather** to all shards, merged on mongos.
- Single-document updates/deletes by «_id» in a collection sharded on another key → broadcast or need the shard key (recent versions relax this but targeting is still faster).
- **Unique indexes** must be prefixed by the shard key (except «_id» uniqueness, which is per shard unless the shard key includes it).

### Choosing and changing keys
- Hashed keys spread writes evenly but make range queries scatter.
- Compound keys like «{merchant_id: 1, created_at: 1}» keep a merchant's data together while spreading merchants.
- **refineCollectionShardKey** adds suffix fields; **reshardCollection** (5.0+) changes the key online by copying data.

### Zones
Assign shard key ranges to zones (e.g. «region: 'IN'» → shards in Mumbai) for data residency and locality.

### Jumbo ranges
A range that can't be split because one shard-key value has too many documents ("jumbo") can't move. Low-cardinality keys cause them — pick high-cardinality keys or add a suffix.`],
 ["sort","Targeted or scatter-gather? (shard key {merchant_id: 1, created_at: 1})",{"Targeted":["find({merchant_id: 7})","find({merchant_id: 7, created_at: {$gte: d}})"],"Scatter-gather":["find({created_at: {$gte: d}})","find({status: 'FAILED'})"]},"Include the shard key prefix in hot queries."],
 ["pick","Payments must stay in India-located shards for compliance. Use…",["Zone sharding on a region field in the shard key","Hashed sharding","More mongos","Read preference nearest"],0,"Zones pin ranges to shards."],
 ["match","Command",[["reshardCollection","Change the shard key online"],["refineCollectionShardKey","Add suffix fields to the shard key"],["sh.addShardToZone / updateZoneKeyRange","Pin ranges to locations"],["sh.status()","See distribution and balancer state"]],"Sharding admin toolkit."],
 ["tf","Sharding truths",[["Unique indexes in sharded collections must start with the shard key.",true,"Uniqueness is enforced per shard."],["Hashed shard keys make range queries on the key targeted.",false,"They scatter."]]]
]},
{act:"Expert", t:"Aggregation & transactions deep", sub:"Pipeline optimizer, $merge, limits", rounds:[
 ["learn","Pipeline optimization and limits","The aggregation optimizer reorders and coalesces stages: moves «$match» before «$project»/«$addFields» when possible, merges «$sort» + «$limit» into a top-k sort, pushes «$match» into the index scan. Each blocking stage has a **100 MB memory limit**; with «allowDiskUse» (default true since 6.0 via «allowDiskUseByDefault») it spills.",null,null,`### Useful stages
- «$lookup» with «let» + «pipeline» for correlated subqueries; index the foreign field.
- «$group» with accumulators, «$setWindowFields» for running totals and ranks.
- «$merge» into a collection (insert/replace/merge/keepExisting per match) → **on-demand materialized views** refreshed incrementally.
- «$unionWith» to combine collections.

### Change streams
Built on the oplog: watch a collection/database/cluster with a pipeline filter. Each event has a **resume token**; store it to resume after restarts as long as the oplog still contains that point. «fullDocument: 'updateLookup'» fetches the current document for updates; pre- and post-images can be enabled per collection.

### Transactions
Multi-document ACID across collections, shards (distributed transactions with two-phase commit). Limits and costs:
- Default max lifetime **60 seconds** («transactionLifetimeLimitSeconds»).
- WriteConflict errors → retry (drivers' «withTransaction» does it).
- Across shards, commits need coordination: slower; design documents so most writes are single-document atomic.`],
 ["fill","Incremental materialized view of daily GMV",'db.payments.aggregate([\n  { $match: { dt: "2026-11-18" } },\n  { $group: { _id: { m: "$merchant_id", dt: "$dt" }, gmv: { $sum: "$amount" } } },\n  { ___: { into: "daily_gmv", on: "_id", whenMatched: "___", whenNotMatched: "insert" } }\n])',["$merge","replace"],["$out","append","$lookup"],"$merge updates only today's rows; $out would replace the collection."],
 ["pick","A change stream consumer was down for 3 hours; resuming fails with 'resume point no longer in oplog'. Fix?",["Re-sync from a snapshot, then resume; enlarge the oplog window","Retry forever","Use $out","Lower write concern"],0,"Resume tokens need oplog history."],
 ["order","Optimizer rewrites you can rely on",["$match moved as early as possible","Adjacent $match stages merged","$sort + $limit become a top-k sort","Leading $match/$sort use indexes"],"Still write pipelines in a sensible order."],
 ["tf","Aggregation truths",[["$out can update just some documents of the target.",false,"$out replaces the collection; $merge updates."],["Transactions have a default 60-second lifetime.",true,"Keep them short."]]]
]},
{act:"Expert", t:"Expert boss: Mongo at scale", boss:true, time:45, rounds:[
 ["pick","Latency spikes; application threads evicting pages; indexes 2× cache size. Fix?",["Reduce working set (drop unused indexes) or add RAM","More shards only","w:0","Read from secondaries"],0,"Fit hot data in cache."],
 ["pick","A query is fast for small merchants, slow for the biggest after a restart. Likely?",["Plan cache picked a plan good for small values","Oplog too small","Journal off","Hashed key"],0,"Skew vs cached plan; add a better index or hint."],
 ["pick","A secondary was offline 2 hours and needs initial sync. Prevent?",["Larger oplog window","More indexes","Priority 0","Smaller documents"],0,"Size the oplog."],
 ["pick","Queries by created_at range hit all shards. Shard key is hashed _id. Options?",["Compound shard key starting with a commonly filtered field (via reshard)","More mongos","Zones by _id","Bigger chunks"],0,"Target hot queries."],
 ["pick","Daily GMV collection must update incrementally. Use…",["$merge from an aggregation","$out every minute","Change stream only","Transactions"],0,"On-demand materialized view."],
 ["pick","Rolled-back documents after failover worry finance. Fix?",["w: 'majority' for payments","w: 1","Hidden members","Bigger cache"],0,"Majority acks survive elections."],
 ["pick","Data residency: Indian merchants' data must stay in India. Use…",["Zone sharding","Hashed sharding","Change streams","Capped collections"],0,"Pin ranges to regions."]
]}
]);
