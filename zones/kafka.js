QUEST.zone("kafka", {
mission:["dev","We're moving payments to real time. Every payment event goes through Kafka. Learn how the log works, how it survives broker crashes and how consumers stay correct, then survive launch day."],
levels:[
{t:"The log", sub:"Topics, partitions, offsets", rounds:[
 ["learn","A topic is a set of logs","A topic is split into **partitions**. Each partition is an append-only, ordered log on disk. Every record gets an increasing **offset**. Consumers read by offset, so reading doesn't delete anything.",["Producer appends","Record gets an offset","Data kept for the retention period","Consumers read at their own pace"]],
 ["pick","Where is ordering guaranteed in Kafka?",["Across the whole topic","Within a single partition","Across a consumer group","Within a broker"],1,"Order holds inside one partition only. Need per-customer order? Use the customer id as the key."],
 ["learn","Keys pick the partition","The default partitioner hashes the key (murmur2) modulo the partition count. Same key → same partition → ordered. No key → records are spread (sticky partitioner batches them)."],
 ["sort","Keep order or not?",{"Order kept":["Same key, same partition","Single partition topic","Idempotent producer with retries"],"Order can break":["Adding partitions to a keyed topic","No key on related events","Two different keys for one entity"]},"Adding partitions changes hash % N, so existing keys move."],
 ["learn","Retention vs compaction","**Delete** retention drops old segments by time or size. **Compaction** keeps at least the latest value per key, and a null value (tombstone) deletes the key. Changelog and CDC topics usually use compaction."],
 ["match","Topic configs",[["retention.ms","How long to keep data"],["cleanup.policy=compact","Keep the latest value per key"],["segment.bytes","Size of each log file on disk"],["min.insync.replicas","Replicas that must ack an acks=all write"]],"Know these four by heart."],
 ["tf","Log facts",[["Consuming a message deletes it.",false,"Retention decides deletion, not reads."],["Offsets are per partition.",true,"Offset 42 in partition 0 and partition 1 are different records."],["A tombstone is a record with a null value.",true,"Compaction later removes the key."],["Kafka 4.0 still requires ZooKeeper.",false,"KRaft replaced ZooKeeper; 4.0 runs KRaft only."]]]
]},
{t:"Replication", sub:"Leaders, ISR, acks", rounds:[
 ["learn","Leaders and followers","Each partition has one **leader** replica that handles writes and reads, and followers that copy it. Followers that are caught up form the **ISR** (in-sync replicas). If the leader dies, a new one is elected from the ISR."],
 ["fill","Durable producer settings",'acks=___\nenable.idempotence=___\n# topic: replication.factor=3, min.insync.replicas=___',["all","true","2"],["1","0","false","3"],"acks=all with min.insync.replicas=2 on RF=3 survives one broker loss without losing acknowledged writes."],
 ["pick","RF=3, min.insync.replicas=2, acks=all. Two brokers die. Producers…",["Keep writing to the last replica","Get NotEnoughReplicas errors","Lose data silently","Switch to acks=1"],1,"Only one replica is in sync, below the minimum, so writes are rejected rather than risked."],
 ["learn","Unclean leader election","If every ISR replica is gone, Kafka can elect an out-of-sync replica (unclean.leader.election.enable=true). The partition comes back, but writes it never received are **lost**. Default is false: availability waits for durability."],
 ["order","What happens when a leader broker crashes",["Controller notices the broker's session is gone","Controller picks a new leader from the ISR","Metadata update goes to all brokers","Producers and consumers refresh metadata and reconnect"],"With KRaft, the controller quorum handles this quickly."],
 ["match","acks setting",[["acks=0","Fire and forget: fastest, can lose data"],["acks=1","Leader wrote it: lost if leader dies before followers copy"],["acks=all","All ISR replicas wrote it: safest"]],"acks=all is the default since Kafka 3.0."]
]},
{t:"Producers", sub:"Batching, idempotence", rounds:[
 ["learn","Batching is throughput","Producers group records per partition into batches. «linger.ms» waits a little to fill a batch, «batch.size» caps it, «compression.type» (lz4/zstd) shrinks it. Bigger batches: more throughput, a bit more latency."],
 ["sort","More throughput or lower latency?",{"More throughput":["linger.ms=20","batch.size=256KB","compression.type=zstd"],"Lower latency":["linger.ms=0","Smaller batches"]},"Tune for the goal."],
 ["learn","Idempotent producer","With «enable.idempotence=true» (default since 3.0) each producer has an id and per-partition sequence numbers. Broker drops duplicates caused by retries, and order is kept with up to 5 in-flight requests."],
 ["pick","A retry after a timeout wrote the same payment twice. What prevents this?",["acks=0","Idempotent producer","More partitions","Compaction"],1,"Sequence numbers let the broker discard the duplicate."],
 ["learn","Transactions","A transactional producer («transactional.id») can write to several partitions and commit consumer offsets **atomically**. Consumers with «isolation.level=read_committed» only see committed data. This is how read-process-write gets exactly-once."],
 ["order","Exactly-once read-process-write",["initTransactions()","beginTransaction()","Produce output records","sendOffsetsToTransaction(consumer offsets)","commitTransaction()"],"Output and offsets commit together or not at all."]
]},
{t:"Consumers", sub:"Groups, lag, rebalances", rounds:[
 ["learn","Consumer groups share partitions","In a group, each partition is read by exactly one consumer. 12 partitions and 4 consumers → 3 each. A 13th consumer in a 12-partition topic sits idle.",["Group coordinator assigns partitions","Each consumer reads its partitions","Commits offsets to __consumer_offsets"]],
 ["pick","Topic has 6 partitions. You run 10 consumers in one group. How many are idle?",["0","4","6","10"],1,"Max useful consumers = partitions. Scale partitions first."],
 ["learn","Commit after processing","Auto-commit can commit offsets before you finish processing: a crash loses records (at-most-once). Commit **after** processing for at-least-once, and make processing idempotent so replays are harmless."],
 ["bug","This consumer can lose payments on a crash. Which line?",["props.put('enable.auto.commit', 'false')","records = consumer.poll(Duration.ofMillis(500))","consumer.commitSync()","for r in records: write_to_db(r)"],2,"Committing before writing means a crash after commit skips those records. Process, then commit."],
 ["learn","Rebalances and lag","Rebalances happen when consumers join, leave or miss «max.poll.interval.ms». The **cooperative-sticky** assignor moves only some partitions instead of stopping everyone. **Lag** = log end offset − committed offset; watch it per partition."],
 ["match","Consumer trouble",[["Lag growing on one partition","Hot key or slow record on that partition"],["Constant rebalances","Processing takes longer than max.poll.interval.ms"],["Duplicates after restart","Offsets committed late; make writes idempotent"],["Missing records after crash","Offsets committed before processing"]],"Diagnose from the symptom."],
 ["tf","Consumer facts",[["Offsets are stored in an internal topic.",true,"__consumer_offsets, a compacted topic."],["Two groups reading one topic split the data between them.",false,"Each group gets every record."],["auto.offset.reset=earliest applies only when no committed offset exists.",true,"Otherwise the committed offset wins."]]]
]},
{t:"Schemas & streams", sub:"Registry, compatibility", rounds:[
 ["learn","Schema Registry","Producers register an Avro/Protobuf/JSON schema and send a small schema id with each record. The registry checks **compatibility** so a new version can't break consumers."],
 ["match","Compatibility modes",[["BACKWARD","New schema can read old data (upgrade consumers first)"],["FORWARD","Old schema can read new data (upgrade producers first)"],["FULL","Both directions"],["NONE","No checks"]],"BACKWARD is the default."],
 ["pick","Under BACKWARD compatibility, which change is allowed?",["Add a field with a default","Add a required field without default","Rename a field","Change int to string"],0,"Readers on the new schema fill the default for old records."],
 ["learn","Event time and watermarks","Stream processors (Flink, Kafka Streams, Spark) window by **event time**. A **watermark** says 'no events older than T expected'; it trails the max seen time by the allowed lateness. Late events after it are dropped or side-output."],
 ["order","A late payment arrives in a 1-minute window job",["Event has event_time 10:00:40","Watermark is already 10:01:30 (max seen − 30 s)","Window 10:00–10:01 already closed","Event goes to the late-data side output"],"Increase allowed lateness if late data matters, at the cost of latency."]
]},
{t:"Boss: Launch day", boss:true, time:30, rounds:[
 ["pick","Customer events arrive out of order across partitions. Fix?",["Use customer_id as the key","Add more partitions","acks=0","Increase linger.ms"],0,"Same key, same partition, ordered."],
 ["pick","A broker died and some acked writes vanished. Settings were acks=1, RF=3. Fix?",["acks=all with min.insync.replicas=2","More consumers","Compaction","Bigger batches"],0,"acks=1 only waits for the leader."],
 ["pick","Duplicate payments appear after producer retries. Fix?",["enable.idempotence=true","auto.offset.reset=latest","Fewer partitions","acks=0"],0,"Idempotence drops retry duplicates."],
 ["pick","Lag climbs, 8 consumers, 8 partitions, CPU maxed. Fastest scale-out?",["Add consumers","Add partitions (and consumers), knowing keyed order shifts","Lower retention","Disable compression"],1,"Consumers are capped by partitions."],
 ["pick","Group keeps rebalancing during big batches. Fix?",["Raise max.poll.interval.ms or process fewer records per poll","Lower session timeout","Use acks=all","Turn off idempotence"],0,"The consumer is being kicked for slow polls."],
 ["pick","A new schema version breaks old consumers. Prevent it how?",["Enforce BACKWARD compatibility in the registry","Use JSON without schemas","More partitions","Compaction"],0,"The registry rejects incompatible versions."]
]}
]});

QUEST.more("kafka", [
{act:"Expert", t:"Log storage internals", sub:"Segments, indexes, compaction", rounds:[
 ["learn","A partition is a directory of segments","Each partition is a folder of **segments**. Each segment has a «.log» (records in batches), a sparse offset «.index», a «.timeindex», and more. Only the last, **active** segment is written to.",["Producer batch arrives","Appended to active segment .log","Index entry every ~4 KB","Segment rolls at segment.bytes or segment.ms","Old segments deleted or compacted"],null,`### Segment files
- «00000000000004520000.log»: the file name is the **base offset** of the first record in the segment.
- «.index»: sparse map from relative offset → byte position. One entry roughly every «index.interval.bytes» (4 KB). To find offset N, Kafka binary-searches the index, then scans forward a few KB.
- «.timeindex»: timestamp → offset, used by «offsetsForTimes» and time-based retention.
- Segments roll when they reach «segment.bytes» (1 GB default) or age «segment.ms» (7 days).

### Retention works per segment
Retention deletes **whole closed segments**. The active segment is never deleted, so a low-traffic topic with «retention.ms=1h» can keep data for up to «segment.ms» if the segment never rolls. Lower «segment.ms» on such topics.

### Why Kafka is fast
- **Sequential writes** to the end of a file.
- The **OS page cache** holds hot data; Kafka relies on it rather than a JVM cache, so give brokers lots of free RAM, not a huge heap (6–8 GB heap is common).
- **Zero-copy** («sendfile») sends bytes from page cache to the socket without copying through the JVM — unless TLS is on, which needs encryption in user space.
- **Batching + compression**: producers compress whole batches; brokers store them compressed (if codecs match) and consumers decompress.`],
 ["pick","A topic has retention.ms = 1 hour but data from 5 days ago is still readable. Most likely?",["Broker bug","Low traffic: the active segment never rolled (segment.ms 7 days)","Compaction","Replication lag"],1,"Retention only deletes closed segments. Lower segment.ms for low-volume topics."],
 ["learn","How compaction actually runs","Log cleaner threads compact partitions whose **dirty ratio** (uncompacted bytes ÷ total) exceeds «min.cleanable.dirty.ratio» (0.5). They build a key → latest offset map over the dirty section and rewrite older segments keeping only the latest record per key.",null,null,`### Key settings
- «min.cleanable.dirty.ratio» (0.5): how much dirty data before cleaning. Lower = more frequent cleaning, more I/O.
- «min.compaction.lag.ms» (0): a record is guaranteed uncompacted for at least this long — consumers can see every update within the window.
- «max.compaction.lag.ms»: force cleaning after this time even if the ratio is low (important for GDPR-style deletes).
- «delete.retention.ms» (24 h): how long **tombstones** stay after compaction, so slow consumers still see the delete.

### Guarantees
- Order of records is preserved; offsets never change (compacted logs have gaps).
- A consumer reading from the start eventually sees the **latest value for every key**.
- The head of the log (active segment) is never compacted.

### Common use
Changelog topics for Kafka Streams state, Debezium CDC topics, «__consumer_offsets», config/state topics in Kafka Connect («cleanup.policy=compact»). «cleanup.policy=compact,delete» combines both: compaction plus time-based deletion.`],
 ["match","Compaction setting",[["min.cleanable.dirty.ratio","When a partition becomes eligible for cleaning"],["min.compaction.lag.ms","Minimum time a record stays uncompacted"],["max.compaction.lag.ms","Maximum time before cleaning is forced"],["delete.retention.ms","How long tombstones survive after compaction"]],"Tune together for CDC and GDPR deletes."],
 ["num","50 MB/s into a topic, 7-day retention, replication factor 3. Disk needed across the cluster (TB, ignore compression)?",91,1,"TB","50 MB/s × 86,400 s × 7 ≈ 30.2 TB per copy × 3 replicas ≈ 90.7 TB. Plan headroom on top."],
 ["tf","Storage facts",[["Compaction changes the offsets of kept records.",false,"Offsets never change; gaps appear."],["TLS disables zero-copy transfer.",true,"Data must be encrypted in user space."],["Kafka brokers should have a very large JVM heap for caching.",false,"The OS page cache does the caching."]]]
]},
{act:"Expert", t:"Replication protocol", sub:"HW, LEO, leader epochs, KRaft", rounds:[
 ["learn","LEO and the high watermark","Every replica has a **log end offset** (LEO): the next offset it would write. The leader's **high watermark** (HW) is the highest offset replicated to all ISR members. Consumers only read up to the HW.",["Leader appends at LEO","Followers fetch and append","Followers report their LEO in the next fetch","Leader advances HW = min(ISR LEOs)","Consumers can read up to HW"],null,`### The fetch loop
Followers are just consumers of the leader: they send Fetch requests with their current offset. The leader learns each follower's LEO from those requests and advances the HW to the minimum LEO across the ISR. The HW piggybacks back to followers on the next fetch response.

### ISR membership
A follower is removed from the ISR if it hasn't caught up to the leader's LEO within «replica.lag.time.max.ms» (30 s). It rejoins once it catches up. With «acks=all», the leader waits until all **current ISR** members have the batch — and refuses writes if the ISR is smaller than «min.insync.replicas».

### Leader epochs (why HW-based truncation was replaced)
After a leader change, followers must truncate any records the new leader doesn't have. Early Kafka truncated to the HW, which could lose acknowledged data or create divergent logs in double-failure scenarios. **Leader epochs** (KIP-101) record which epoch started at which offset; a follower asks the new leader for the end offset of its last epoch and truncates exactly there.

### KRaft
Since Kafka 4.0, metadata lives in a Raft-replicated **__cluster_metadata** log managed by a controller quorum (usually 3 or 5 controllers). Brokers follow the metadata log, which makes failover and partition counts in the millions much faster than ZooKeeper.`],
 ["pick","ISR = {1, 2, 3}. LEOs: leader 1 = 500, broker 2 = 480, broker 3 = 492. High watermark?",["500","492","480","1,472"],2,"HW = min LEO across the ISR = 480. Consumers can read offsets < 480."],
 ["order","Follower recovery after a leader change (with leader epochs)",["New leader elected with epoch 7","Old follower restarts with records from epoch 6","Follower sends OffsetsForLeaderEpoch(epoch 6)","Leader replies with the end offset of epoch 6","Follower truncates to that offset and resumes fetching"],"Exact truncation, no data divergence."],
 ["match","Term",[["LEO","Next offset a replica will write"],["High watermark","Offsets fully replicated to the ISR; visible to consumers"],["replica.lag.time.max.ms","How long a follower may lag before leaving the ISR"],["Preferred leader","First replica in the assignment; rebalanced back automatically"],["Controller quorum","Raft group that owns cluster metadata in KRaft"]],"These terms explain every durability incident."],
 ["num","RF = 5, min.insync.replicas = 3, acks = all. How many brokers holding this partition can fail while producers still succeed?",2,0,"brokers","Writes need ≥ 3 in-sync replicas; 5 − 3 = 2 failures tolerated."],
 ["tf","Replication truths",[["Consumers can read records above the high watermark.",false,"Only below it, to avoid reading data that might be truncated."],["A slow follower is dropped from the ISR rather than blocking acks=all writes forever.",true,"After replica.lag.time.max.ms."],["Kafka 4.0 can run with ZooKeeper.",false,"ZooKeeper mode was removed."]]]
]},
{act:"Expert", t:"Producer internals", sub:"Accumulator, timeouts, ordering", rounds:[
 ["learn","Inside the producer","«send()» serializes, picks a partition, and appends to a per-partition batch in the **RecordAccumulator**. A background **sender thread** drains ready batches into requests per broker.",["Serialize key/value","Partitioner chooses partition","Append to batch in RecordAccumulator","Sender thread builds produce requests","Broker acks; callback fires"],null,`### Memory and blocking
- «buffer.memory» (32 MB): total bytes for unsent batches. When full, «send()» **blocks** up to «max.block.ms» (60 s), then throws.
- «batch.size» (16 KB): max bytes per partition batch. «linger.ms» (5 ms default since Kafka 4.0, 0 before): how long to wait to fill a batch.

### Timeouts that decide "failed"
- «request.timeout.ms» (30 s): one request's wait for a broker response.
- «delivery.timeout.ms» (120 s): total time from «send()» to success or failure, **including retries**. Must be ≥ linger.ms + request.timeout.ms.
- «retries» defaults to effectively infinite; the delivery timeout is what actually bounds it.

### Ordering with retries
With idempotence on, up to «max.in.flight.requests.per.connection» = 5 requests can be in flight and ordering is still guaranteed, because the broker checks per-partition **sequence numbers** and rejects out-of-order batches. Without idempotence, in-flight > 1 + retries can reorder.

### Partitioner
Records **with keys** use murmur2(key) % partitions. Records **without keys** use the **sticky partitioner**: fill a batch for one partition, then switch — far better batching than round-robin. Since 3.3 it's also adaptive to slow brokers.`],
 ["order","Lifecycle of producer.send()",["Serializer turns key and value into bytes","Partitioner picks the partition","Record appended to that partition's batch","Sender thread ships the batch when full or linger expires","Broker writes and acks; callback/future completes"],"send() is asynchronous; the callback reports success or failure."],
 ["pick","send() calls start blocking for 60 s and then throw TimeoutException. Brokers are slow. What filled up?",["buffer.memory","batch.size","__consumer_offsets","The page cache"],0,"Unsent batches exhausted buffer.memory; send blocks for max.block.ms."],
 ["bug","Which producer config breaks with an error at startup?",["enable.idempotence=true","acks=all","linger.ms=20","delivery.timeout.ms=10000 with request.timeout.ms=30000"],3,"delivery.timeout.ms must be ≥ linger.ms + request.timeout.ms; the client rejects this config."],
 ["num","linger.ms=20, a producer sends 1 KB records at 5,000 records/s to one partition, batch.size=64 KB. Records per batch (approx)?",64,6,"records","In 20 ms you get ~100 records (100 KB), but the batch closes at 64 KB ≈ 64 records first."],
 ["tf","Producer truths",[["Keyless records are spread record-by-record round-robin in modern clients.",false,"The sticky partitioner fills a batch per partition."],["With idempotence, max.in.flight up to 5 keeps ordering.",true,"Sequence numbers enforce it."],["delivery.timeout.ms bounds total retry time.",true,"Retries alone are effectively unlimited."]]]
]},
{act:"Expert", t:"Transactions & EOS", sub:"Coordinator, markers, LSO", rounds:[
 ["learn","How transactions work inside","A **transaction coordinator** (a broker owning a partition of «__transaction_state») tracks each «transactional.id». Writes go to partitions normally; on commit, the coordinator writes **control markers** (COMMIT or ABORT) into every partition touched.",["initTransactions: get producer id + bump epoch (fences zombies)","beginTransaction (local)","AddPartitionsToTxn as new partitions are written","sendOffsetsToTransaction for consumed offsets","EndTxn: coordinator writes PREPARE, then markers, then COMPLETE"],null,`### Zombie fencing
«initTransactions()» increments the **producer epoch** for that «transactional.id». If an old instance of the same app (a "zombie" after a network partition) tries to write, brokers reject it with ProducerFencedException. That's why each logical producer needs a **stable, unique transactional.id**.

### What consumers see
- «isolation.level=read_uncommitted»: reads up to the high watermark, including records of open and aborted transactions.
- «read_committed»: reads only up to the **last stable offset (LSO)** — the first offset of the oldest still-open transaction — and filters out aborted records using the aborted-transaction index.

So **one long-running open transaction blocks read_committed consumers** on that partition, even for other producers' committed data after it. «transaction.timeout.ms» (60 s default) aborts transactions that hang.

### Exactly-once in practice
Kafka Streams with «processing.guarantee=exactly_once_v2» wraps consume → process → produce + offset commit in transactions. Exactly-once covers **Kafka-to-Kafka**; writing to an external DB needs idempotent upserts or a DB transaction that stores the offsets.`],
 ["pick","read_committed consumers on partition 3 stopped advancing, but producers keep writing committed data. Cause?",["An old transaction is still open, pinning the LSO","Consumer lag","Compaction","acks=1"],0,"The LSO can't move past the oldest open transaction. Check transaction.timeout.ms and stuck producers."],
 ["sort","Exactly-once or not?",{"Exactly-once (with the right setup)":["Kafka Streams with exactly_once_v2","Transactional producer + sendOffsetsToTransaction + read_committed downstream"],"At-least-once":["Consumer writes to Postgres then commits offsets","Idempotent producer alone across app restarts","Kafka sink connector with plain inserts"]},"EOS needs atomic output + offsets; external systems need idempotency."],
 ["match","Piece",[["__transaction_state","Coordinator's log of transaction status"],["Control marker","COMMIT/ABORT record written into each partition"],["Last stable offset","Highest offset read_committed consumers may read"],["Producer epoch","Fences zombie instances of a transactional.id"]],"Each part solves one failure mode."],
 ["tf","EOS truths",[["Exactly-once covers writes to an external MySQL automatically.",false,"Only Kafka-to-Kafka; external sinks need idempotency."],["Two app instances sharing one transactional.id fence each other.",true,"Only the newest epoch can write."],["Control markers take offsets in the partition.",true,"That's why transactional topics show offset gaps."]]]
]},
{act:"Expert", t:"Consumer group protocol", sub:"Rebalances, static members, KIP-848", rounds:[
 ["learn","Classic rebalance protocol","Members send **JoinGroup** to the group coordinator; one member (the leader) computes the assignment; everyone gets it via **SyncGroup**. With the **eager** protocol, all members revoke all partitions first: a stop-the-world pause.",null,null,`### Timers
- «heartbeat.interval.ms» (3 s): background heartbeats.
- «session.timeout.ms» (45 s since Kafka 3.0): no heartbeat for this long → member considered dead → rebalance.
- «max.poll.interval.ms» (5 min): time allowed between «poll()» calls. Processing too long → the client leaves the group itself → rebalance.

### Cooperative (incremental) rebalancing
With «CooperativeStickyAssignor», a rebalance only revokes partitions that actually need to move, in two rounds. Members keep processing everything else. Kafka Streams uses cooperative rebalancing by default.

### Static membership
Set «group.instance.id» per instance (e.g. pod name). A restarting member with the same id gets its old partitions back **without a rebalance**, as long as it returns within session.timeout.ms. Great for rolling deploys.

### The new protocol (KIP-848)
The next-generation consumer protocol (GA in Kafka 4.0, «group.protocol=consumer») moves assignment logic to the **broker**, makes rebalances incremental by design, and removes the global synchronization barrier. Members heartbeat and receive their target assignment directly.

### Fetch tuning
«fetch.min.bytes» and «fetch.max.wait.ms» (500 ms) trade latency for bigger fetches; «max.partition.fetch.bytes» (1 MB) and «fetch.max.bytes» (50 MB) cap response sizes; «max.poll.records» (500) caps records per poll.`],
 ["sort","Triggers a rebalance or not? (classic protocol)",{"Triggers a rebalance":["A consumer takes 7 minutes between polls","A new consumer joins the group","Partitions are added to a subscribed topic"],"No rebalance":["Static member restarts within session.timeout.ms","A consumer commits offsets","A broker that isn't the coordinator restarts"]},"Know what wakes the coordinator."],
 ["pick","Rolling deploy of 30 pods causes 30 rebalances and big lag spikes. Best fix?",["Static membership (group.instance.id) + cooperative-sticky assignor","Lower session.timeout.ms","More partitions","acks=all"],0,"Restarted members keep their partitions; moves are incremental."],
 ["num","max.poll.records=500, each record takes 800 ms to process. Default max.poll.interval.ms is 5 minutes. How many seconds does one poll's batch take?",400,0,"s","500 × 0.8 s = 400 s > 300 s: the consumer gets kicked out. Lower max.poll.records or speed up processing."],
 ["match","Setting → symptom it fixes",[["max.poll.records lower","Kicked out for slow processing"],["fetch.min.bytes higher","Too many tiny fetch requests"],["group.instance.id","Rebalance storms on deploys"],["group.protocol=consumer","Global stop-the-world rebalances"]],"Each knob maps to a real incident."],
 ["tf","Group truths",[["Committing offsets causes a rebalance.",false,"Commits are just writes to __consumer_offsets."],["Eager rebalancing revokes every partition from every member.",true,"Hence the pause."],["With KIP-848, the broker computes assignments.",true,"Server-side assignment."]]]
]},
{act:"Expert", t:"Expert boss: Kafka on fire", boss:true, time:45, rounds:[
 ["pick","read_committed consumers frozen; one producer crashed mid-transaction an hour ago with transaction.timeout.ms=3600000. Fix?",["Abort it (restart producer with same transactional.id to fence) and lower transaction.timeout.ms","Add partitions","Switch to acks=1","Compact the topic"],0,"The open transaction pins the LSO."],
 ["pick","Low-traffic audit topic keeps data far beyond retention.ms. Fix?",["Lower segment.ms so segments roll","Raise retention.ms","More replicas","Compaction"],0,"Retention deletes closed segments only."],
 ["pick","After a double broker failure, followers had divergent logs on old Kafka. Which feature prevents this?",["Leader epochs","Sticky partitioner","Static membership","Compression"],0,"Exact truncation via epoch end offsets."],
 ["pick","Producers throw TimeoutException after blocking 60 s during a broker slowdown. First knob to understand?",["buffer.memory / max.block.ms","fetch.min.bytes","session.timeout.ms","segment.bytes"],0,"The accumulator is full."],
 ["pick","Consumers keep rebalancing; logs show 'poll timeout exceeded'. Each batch takes 6 min. Fix?",["Fewer records per poll or faster processing; tune max.poll.interval.ms","Lower heartbeat.interval.ms","More brokers","acks=all"],0,"The consumer leaves the group itself."],
 ["pick","GDPR deletes on a compacted topic must disappear within 7 days even at low write rates. Setting?",["max.compaction.lag.ms","min.cleanable.dirty.ratio=0.9","delete.retention.ms=0 only","segment.bytes larger"],0,"Forces compaction on time."],
 ["pick","ISR shrinks repeatedly on one broker during peak. Most useful first check?",["That broker's disk/network saturation and replica fetcher lag","Consumer group lag","Schema registry","Producer linger.ms"],0,"Followers fall out of sync when they can't keep up."]
]}
]);
