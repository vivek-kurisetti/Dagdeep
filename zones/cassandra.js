QUEST.zone("cassandra", {
mission:["ravi","The fraud team stores every card swipe in Cassandra: millions of writes a second across three data centres. Learn how it spreads and stores data, then survive a node failure at peak."],
levels:[
{t:"The ring", sub:"Partitions, tokens, replicas", rounds:[
 ["learn","Partition key → token → nodes","The **partition key** is hashed (Murmur3) to a **token**. Each node owns token ranges (with **vnodes**, many small ranges). The replication strategy places **RF** copies on the next nodes in the ring.",["Hash partition key → token","Find owning node","Replicate to RF nodes","Any node can coordinate"]],
 ["learn","Masterless","Every node is equal. The client sends a request to any node, which becomes the **coordinator** for it. **Gossip** shares cluster state; there's no single point of failure."],
 ["pick","Which strategy for a cluster across two data centres?",["SimpleStrategy","NetworkTopologyStrategy","LocalStrategy","EverywhereStrategy"],1,"NetworkTopologyStrategy sets RF per DC and spreads replicas across racks."],
 ["fill","Create a keyspace for two DCs",'CREATE KEYSPACE fraud WITH replication = {\n  \'class\': \'___\', \'dc_mumbai\': ___, \'dc_hyd\': 3 };',["NetworkTopologyStrategy","3"],["SimpleStrategy","1"],"RF 3 per DC is the common production choice."],
 ["tf","Ring facts",[["Cassandra has a primary node per table.",false,"It's masterless."],["Adding a node moves some token ranges to it.",true,"Then run cleanup on the old owners."],["Clients should use a token-aware driver.",true,"Requests go straight to a replica."]]]
]},
{t:"Data modeling", sub:"Query-first tables", rounds:[
 ["learn","Model the queries, not the entities","No joins, no arbitrary WHERE. Design **one table per query**: the partition key is what you look up by, **clustering columns** order rows inside the partition. Duplicating data across tables is normal."],
 ["fill","Swipes per card, newest first",'CREATE TABLE swipes_by_card (\n  card_id text, swipe_ts timestamp, merchant text, amount decimal,\n  PRIMARY KEY ((___), ___)\n) WITH CLUSTERING ORDER BY (swipe_ts ___);',["card_id","swipe_ts","DESC"],["merchant","ASC","amount"],"Partition by card, cluster by time descending."],
 ["learn","Keep partitions bounded","A partition lives on one replica set. Unbounded partitions (all swipes of a merchant forever) grow huge and slow. Add a **time bucket** to the partition key, e.g. «((merchant_id, day), swipe_ts)». Keep partitions well under ~100 MB."],
 ["pick","Query: «SELECT * FROM swipes WHERE merchant = 'X'» on a table partitioned by card_id. What happens?",["Fast lookup","Error unless ALLOW FILTERING, then a full cluster scan","Uses a join","Uses the clustering order"],1,"Create a table partitioned by merchant (with a time bucket) instead."],
 ["sort","Good or bad partition key?",{"Good":["(card_id)","(merchant_id, day)","(device_id, hour)"],"Bad":["(country) for global swipes","(status)","(merchant_id) forever, no bucket"]},"High cardinality and bounded size."]
]},
{t:"Consistency", sub:"Tunable reads and writes", rounds:[
 ["learn","Tunable consistency","Each request picks a level: «ONE», «QUORUM» (majority of RF), «LOCAL_QUORUM» (majority in the local DC), «ALL»… If **R + W > RF**, every read overlaps the latest write: strong consistency."],
 ["pick","RF = 3. Which pair gives strong consistency?",["W=ONE, R=ONE","W=QUORUM, R=QUORUM","W=ONE, R=QUORUM","W=ANY, R=ONE"],1,"2 + 2 > 3."],
 ["match","Level → meaning (RF 3 per DC)",[["ONE","One replica answers: fastest, weakest"],["LOCAL_QUORUM","2 of 3 in the local DC"],["EACH_QUORUM","Quorum in every DC (writes)"],["ALL","Every replica: one node down = failure"]],"LOCAL_QUORUM is the multi-DC default."],
 ["learn","Repairing divergence","**Hinted handoff**: the coordinator stores writes for a down replica and replays them. **Read repair**: mismatched replicas fixed during reads. **Anti-entropy repair** («nodetool repair», or incremental repair) must run regularly, within gc_grace_seconds."],
 ["tf","Consistency facts",[["CL=ALL survives one replica being down.",false,"ALL needs every replica."],["Lightweight transactions (IF NOT EXISTS) use Paxos.",true,"Much slower; use sparingly."],["Last-write-wins uses write timestamps.",true,"Clock skew can lose updates."]]]
]},
{t:"Storage engine", sub:"Writes, compaction, tombstones", rounds:[
 ["learn","The write path","A write appends to the **commit log** (durability) and updates the in-memory **memtable**. Full memtables flush to immutable **SSTables**. No read-before-write: writes are fast.",["Commit log append","Memtable update","Flush to SSTable","Compaction merges SSTables"]],
 ["order","Write path in order",["Append to commit log","Write to memtable","Acknowledge to coordinator","Flush memtable to an SSTable later"],"Durable first, fast second."],
 ["match","Compaction strategy",[["STCS (size-tiered)","Write-heavy, general default"],["LCS (leveled)","Read-heavy, many updates; more I/O"],["TWCS (time-window)","Time-series data with TTL"],["UCS (unified, 5.0)","Tunable strategy replacing the others"]],"TWCS drops whole expired SSTables cheaply."],
 ["learn","Tombstones","A delete writes a **tombstone**. It's kept for «gc_grace_seconds» (default 10 days) so repair can spread it; only then compaction purges it. Many tombstones make reads slow and can hit the failure threshold."],
 ["pick","Queue-like table (insert, read, delete) gets slow reads and TombstoneOverwhelming errors. Why?",["Reads scan thousands of tombstones","Too many replicas","LCS","Commit log full"],0,"Cassandra is a poor queue. Use TTL + TWCS or a real queue."],
 ["tf","Engine facts",[["Updates modify rows in place on disk.",false,"They write new cells; compaction merges."],["If repair doesn't run within gc_grace_seconds, deleted data can come back.",true,"Zombie data."],["TTL data with TWCS can be dropped as whole SSTables.",true,"Very efficient for time series."]]]
]},
{t:"Boss: Peak-hour outage", boss:true, time:30, rounds:[
 ["pick","One node dies; writes at CL=ALL fail. Fix?",["Use LOCAL_QUORUM","Raise RF to 1","Use SimpleStrategy","Disable gossip"],0,"Quorum tolerates one replica down."],
 ["pick","One merchant's partition is 4 GB and its queries time out. Fix?",["Add a time bucket to the partition key","More replicas","ALLOW FILTERING","CL=ONE"],0,"Bound partition size."],
 ["pick","Deleted rows reappeared after a node returned. Cause?",["Repair didn't run within gc_grace_seconds","TWCS","Token-aware driver","LOCAL_QUORUM"],0,"Zombie data."],
 ["pick","Analysts want swipes by merchant; table is by card. Fix?",["New table partitioned by (merchant, day)","ALLOW FILTERING","Secondary index on everything","JOIN"],0,"One table per query."],
 ["pick","Reads read stale data with W=ONE, R=ONE, RF=3. Need strong reads?",["Use QUORUM for both","CL=ANY","More nodes","STCS"],0,"R + W > RF."],
 ["pick","Time-series with 30-day TTL fills disks. Best compaction?",["TWCS","LCS","STCS","None"],0,"Drop expired windows whole."]
]}
]});
