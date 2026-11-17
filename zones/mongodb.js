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
