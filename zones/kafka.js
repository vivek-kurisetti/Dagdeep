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

QUEST.cards("kafka", {
partitions:{t:"Partitions, keys and ordering", one:"Kafka keeps order only inside a partition, and the record key decides which partition a record goes to.",
 life:"A railway reservation office with 12 counters. If your booking goes to counter 4 and your cancellation to counter 9, the cancellation can be processed first because counter 9's queue is shorter. Give every passenger a token tied to one counter and their requests are handled in order.",
 how:["A topic is split into **partitions**; each is an append-only log with increasing **offsets**.","The producer picks the partition: «hash(key) % partition_count» (murmur2) when there's a key; the sticky partitioner when there isn't.","**Same key → same partition → ordered.** Different partitions are consumed independently, at different speeds.","Adding partitions changes «hash % N», so existing keys can move to a new partition — ordering across the change isn't guaranteed.","Partition count caps consumer parallelism in a group: one partition is read by at most one consumer of that group."],
 ex:`Without a key (launch day):
| Event | Partition | Offset |
|---|---|---|
| p_77 PAYMENT | 4 | 88,120 |
| p_77 REFUND | 9 | 51,002 |
Partition 9's consumer was ahead, so the refund was processed before the payment existed.

With «key = payment_id»:
~~~
producer.send("payments", key=event["payment_id"].encode(), value=payload)
# hash("p_77") % 12 = 4  → PAYMENT and REFUND both go to partition 4, in order
~~~`,
 traps:["Low-cardinality keys (country, status) create hot partitions.","A single partition gives total order but kills throughput (one consumer).","Increasing partitions on a keyed topic breaks per-key order for in-flight entities — plan partition counts up front."],
 say:"Kafka guarantees ordering only within a partition, so I key records by the entity whose events must stay ordered — payment_id or customer_id. The default partitioner hashes the key modulo the partition count, so I choose partition counts up front because adding partitions remaps keys."},
groups:{t:"Consumer groups and lag", one:"Consumers in a group split the partitions between them; one partition goes to exactly one consumer.",
 life:"A shop has 12 delivery areas and hires 16 delivery boys. Each area is given to one boy, so 4 boys sit in the shop with nothing to deliver. To use more boys you have to create more areas.",
 how:["A **consumer group** shares the work of a topic; Kafka assigns each partition to one member.","Max useful consumers = number of partitions; extras are idle standbys.","Each group tracks its own **committed offsets** in «__consumer_offsets», so two groups each get every record.","**Lag** = latest offset in the partition − the group's committed offset. Watch it per partition.","To scale out: more partitions (and consumers), or faster processing per record (batching, async I/O)."],
 ex:`~~~
Group payments-sink · topic payments (12 partitions) · 16 consumers
consumer-1..12  → one partition each
consumer-13..16 → no assignment (idle)
lag: 120,400 and climbing
~~~
After repartitioning to 48 partitions and running 48 consumers: lag drained to ~5,000 within 10 minutes.

Lag per partition tells you more than total lag: one partition lagging = hot key or a slow/poison record; all lagging = not enough capacity.`,
 traps:["Adding consumers beyond the partition count does nothing.","Two different group ids reading one topic both process every record (double processing!).","auto.offset.reset only applies when the group has no committed offset."],
 say:"Within a consumer group each partition is owned by one consumer, so parallelism is capped by partitions. I monitor lag per partition and scale by adding partitions or making processing faster, not just by adding consumers."},
replication:{t:"Replication, acks and ISR", one:"Each partition has a leader and followers; acks and min.insync.replicas decide when a write is really safe.",
 life:"Registered post. A clerk who gives you a receipt after writing your parcel on a single notepad (acks=1) can lose it if that notepad is lost. A receipt that's only issued after two post offices have logged the parcel (acks=all + min.insync.replicas=2) survives one office burning down.",
 how:["Each partition has **RF** replicas: one **leader** (all reads/writes) and followers that copy it.","Followers that are caught up form the **ISR** (in-sync replicas).","«acks=0» no wait; «acks=1» leader wrote it; «acks=all» every ISR member wrote it.","«min.insync.replicas» = minimum ISR size for acks=all writes to succeed; below it producers get NotEnoughReplicas.","If a leader dies, a new leader is elected from the ISR. With «unclean.leader.election.enable=true», an out-of-sync replica can be elected and acknowledged writes are lost."],
 ex:`Incident: «acks=1», RF=3, min.insync.replicas=1. broker-3 (leader for partition 7) lost its disk 40 ms after acking 214 payments that followers hadn't copied yet → 214 confirmed payments vanished.

Fix:
~~~
# producer
acks=all
enable.idempotence=true
# topic
replication.factor=3
min.insync.replicas=2
unclean.leader.election.enable=false
~~~
Now an ack means ≥ 2 brokers have the record; one broker can die with zero loss. If 2 die, writes are rejected rather than risked. Cost: p99 produce latency 8 ms → 17 ms.`,
 traps:["acks=all with min.insync.replicas=1 is effectively acks=1 when followers fall behind.","RF=3 + min.insync=3 means any single broker outage stops writes.","acks=all has been the producer default since Kafka 3.0 — but check old configs."],
 say:"Durability comes from acks=all plus min.insync.replicas=2 on replication factor 3: an acknowledged write exists on at least two brokers, so one failure loses nothing, and unclean leader election stays disabled so out-of-sync replicas never become leader."},
idempotence:{t:"Idempotent producers and duplicates", one:"Producer ids and sequence numbers let the broker drop duplicates created by retries.",
 life:"You tap 'Pay' twice because the app froze. A good bank sees request #4411 twice and processes it once, because every request carries a unique number.",
 how:["A retry after a timeout can re-send a batch the broker already wrote → duplicate.","With «enable.idempotence=true» (default since Kafka 3.0) each producer gets a **producer id**; each batch carries a per-partition **sequence number**.","The broker rejects batches with sequence numbers it has already written, and out-of-order ones.","Ordering is preserved with up to 5 in-flight requests per connection.","Scope: duplicates from **producer retries** within a producer session. App-level duplicates (your code sending twice, consumer replays) need idempotent processing or transactions."],
 ex:`Incident: 37 customers charged twice. Producer had «retries» on and «enable.idempotence=false». A slow broker answered after request.timeout.ms; the client retried; both copies were written.

~~~
acks=all
enable.idempotence=true
max.in.flight.requests.per.connection=5
delivery.timeout.ms=120000
~~~
Downstream, the payments consumer also upserts on payment_id, so even a replay never double-charges.`,
 traps:["retries=0 avoids retry duplicates but drops records on transient errors.","Idempotence doesn't dedupe across producer restarts with a new id — use transactions (transactional.id) or idempotent consumers.","Exactly-once into an external DB needs idempotent writes there."],
 say:"Retries can duplicate writes, so I enable producer idempotence — the broker deduplicates by producer id and sequence number while keeping order. For end-to-end exactly-once I add transactions for Kafka-to-Kafka flows and idempotent upserts for external sinks."},
rebalance:{t:"Rebalances", one:"When group membership changes, partitions are reassigned — and with the old eager protocol everyone stops while it happens.",
 life:"If one delivery boy is late, the manager stops all deliveries, takes every area back and redraws the whole map. With a smarter manager, only the late boy's area is reassigned, and regular boys keep their areas when they step out for chai.",
 how:["Rebalances happen when a consumer joins, leaves, misses heartbeats («session.timeout.ms», 45 s) or doesn't call poll() within «max.poll.interval.ms» (5 min).","**Eager** protocol: all members revoke all partitions → stop-the-world.","**Cooperative-sticky** assignor: only partitions that must move are revoked, in two rounds.","**Static membership** («group.instance.id») lets a restarting pod rejoin with its old partitions without a rebalance, if back within session.timeout.ms.","The new consumer protocol (KIP-848, Kafka 4.0) moves assignment to the broker and makes rebalances incremental by design."],
 ex:`Settlement consumer: «max.poll.records=500», 0.8 s per record → 400 s per poll loop > 300 s limit → consumer kicked out → rebalance → it rejoins → kicked out again. 40 rebalances/hour, lag 2.4 M.

Fixes:
~~~
max.poll.records=100                     # 80 s per loop
partition.assignment.strategy=org.apache.kafka.clients.consumer.CooperativeStickyAssignor
group.instance.id=<pod-name>           # static membership
~~~
Result: 2 rebalances/hour (deploys only), lag peaks at ~40k.`,
 traps:["Lowering session.timeout.ms makes false 'dead consumer' detections more likely.","Long processing inside the poll loop is the #1 cause of rebalance storms.","Deploying all pods at once avoids one-by-one rebalances but causes a full outage of processing."],
 say:"Rebalances reassign partitions when membership changes. I keep poll loops well under max.poll.interval.ms by tuning max.poll.records, use the cooperative-sticky assignor so only moved partitions pause, and static membership so rolling restarts don't trigger rebalances."},
offsets:{t:"Offsets, commits and delivery guarantees", one:"Where you commit offsets — before or after processing — decides whether you lose data or get duplicates.",
 life:"A bookmark in a long book. If you move the bookmark before reading a chapter and fall asleep, you skip that chapter (at-most-once). If you move it after reading, you might re-read a few pages after waking up (at-least-once).",
 how:["Consumers read from an offset and **commit** the next offset to read to «__consumer_offsets».","Commit **before** processing → crash loses records (**at-most-once**).","Commit **after** processing → crash replays records since the last commit (**at-least-once**).","Make processing **idempotent** (upsert by key, dedupe on an event id) so replays are harmless.","Kafka **transactions** give exactly-once for consume → process → produce **within Kafka** (offsets committed in the same transaction)."],
 ex:`~~~
consumer = KafkaConsumer("settlements", enable_auto_commit=False)
for batch in poll_batches(consumer):
    rows = transform(batch)
    db.execute("""INSERT INTO settlements (...) VALUES (...)
                  ON CONFLICT (settlement_id) DO UPDATE SET ...""", rows)   # idempotent
    consumer.commit()        # after the DB write
~~~
Before the fix a plain INSERT created ~9,000 duplicates per deploy (records between the last commit and the restart were re-delivered). With the upsert: 0.

Alternative: store the Kafka offset in the same DB transaction as the data, and on startup seek to the stored offset.`,
 traps:["Auto-commit can commit before your async processing finishes.","enable.idempotence (producer) does nothing for consumer-side duplicates.","Exactly-once in Kafka does not extend to external databases by itself."],
 say:"I disable auto-commit, commit after processing, and make the sink idempotent with upserts on a business key — that's at-least-once delivery with effectively-once results. For Kafka-to-Kafka pipelines I use transactions with read_committed consumers."}
});

QUEST.missions("kafka", [
{title:"Ghost refunds", icon:"👻", place:"Mon 10:02 AM · real-time payments launch", setup:"Payments now flow through Kafka in real time. Ten minutes after launch, the ops dashboard shows refunds for payments that don't exist yet.",
 meters:{order:{label:"Out-of-order events/min", value:340, unit:"", goal:5, better:"low", max:400}, lag:{label:"Consumer lag", value:120000, unit:" msgs", goal:5000, better:"low", max:200000}, trust:{label:"Ops trust", value:50, unit:"%", goal:70, better:"high", max:100, cap:100}},
 steps:[
  {say:[["dev","We're live! 12 partitions, 12 consumers, everything green… mostly."],["meera","Not green for me. The ledger shows a REFUND for p_77, but p_77's PAYMENT isn't there yet. 340 of these per minute."],["ui","Topic payments · 12 partitions · producer key = null\np_77 PAYMENT → partition 4, offset 88,120\np_77 REFUND  → partition 9, offset 51,002\nconsumer(p9) is 3 min ahead of consumer(p4)"]]},
  {choose:"How can a refund overtake the payment it refunds?", options:[
   {t:"Kafka only orders within a partition, and with no key the two events landed on different partitions", ok:true, why:"Each partition is consumed independently. Partition 9's consumer was ahead of partition 4's, so the refund was processed first.", life:"Railway reservation: your booking went to counter 4 and your cancellation to counter 9, which had a shorter queue."},
   {t:"Kafka doesn't guarantee any ordering", ok:false, why:"It does — strictly within a partition. Offsets in one partition are always read in order.", life:"Each counter serves its own queue strictly in order; the problem is using two counters."},
   {t:"The consumer code has a bug", ok:false, why:"The consumer processed each partition correctly; the events were split across partitions by the producer.", life:"The clerks did their job; the tokens sent you to two different counters."}]},
  {card:"partitions"},
  {choose:"How do you fix the ordering?", options:[
   {t:"Use payment_id as the record key so all events of a payment go to the same partition", ok:true, fx:{order:-335, trust:10}, say:[["meera","Ghost refunds dropped from 340/min to almost zero."]], why:"hash(payment_id) % 12 sends PAYMENT and REFUND of p_77 to the same partition, where they're read in order. Different payments still spread across all 12 partitions.", life:"Every passenger gets a token for one counter; booking, changes and cancellation all go to that counter, in order."},
   {t:"Use a topic with 1 partition", ok:"partial", fx:{order:-340, lag:80000}, why:"Total order, but one partition = one consumer. Throughput collapses and lag explodes.", life:"One counter for the whole station: orderly, and a 3-hour queue."},
   {t:"Sort events by timestamp in the consumer", ok:false, why:"Clocks differ across services, and you'd have to buffer forever waiting for late events.", life:"Asking every counter clerk to wait in case an older request arrives at another counter."}]},
  {say:[["ui","Group payments-sink · 16 consumers · 12 partitions\nconsumer-13…16: no partitions assigned\nlag: 120,400 and climbing"],["dev","Ops scaled to 16 consumers an hour ago. Lag still grows. Quick check:"]]},
  {task:["num","12 partitions and 16 consumers in one group. How many consumers are idle?",4,0,"consumers","Each partition goes to one consumer: 12 busy, 4 idle."], label:"Count idle consumers", life:"12 delivery areas, 16 delivery boys: 4 boys sit in the shop.", ok:{trust:5}},
  {card:"groups"},
  {choose:"Each active consumer is CPU-bound. How do you get more throughput?", options:[
   {t:"Increase partitions (e.g. to 48) and run up to 48 consumers", ok:true, fx:{lag:-115000, trust:5}, why:"More partitions = more units of parallelism. Note: keys remap when partitions change, so do it in a quiet window or drain in-flight payments first.", life:"Split the city into more delivery areas so more boys can work at once."},
   {t:"Add 20 more consumers", ok:false, why:"Still 12 partitions → still 12 working consumers; 24 more idle.", life:"Hiring more delivery boys without creating more areas."},
   {t:"Increase topic retention", ok:false, why:"Retention decides how long data is kept, not how fast it's processed.", life:"A bigger warehouse doesn't deliver parcels faster."}]},
  {task:["pick","Partitions went 12 → 48. What happens to payment p_77, which started before the change?",["Its new events may hash to a different partition than its old ones","Kafka moves its old events to the new partition","Nothing changes for existing keys","The topic must be recreated"],0,"hash % 48 differs from hash % 12, so new events for an old key can land elsewhere. Plan partition counts up front, or drain in-flight entities before resizing."], label:"Resize safely", ok:{trust:0}},
  {say:[["meera","No ghost refunds, lag under a minute. You saved launch day."],["dev","Next time I'm choosing partition counts before launch."]]}
 ],
 learned:["Order is per partition: key by the entity that must stay ordered.","Consumers in a group ≤ partitions; extras sit idle.","Adding partitions remaps keys — size topics up front."]},
{title:"The broker that ate payments", icon:"💥", place:"Tue 02:14 AM · broker-3 down", setup:"broker-3 lost its disk. The API had confirmed 214 payments to customers, but they're nowhere in Kafka.",
 meters:{durability:{label:"Durability score", value:30, unit:"%", goal:90, better:"high", max:100, cap:100}, dupes:{label:"Duplicate charges/day", value:37, unit:"", goal:0, better:"low", max:40}, latency:{label:"p99 produce latency", value:8, unit:" ms", goal:25, better:"low", max:40}},
 steps:[
  {say:[["ravi","📟 broker-3's disk died at 02:14. Payments API had returned 'success' for 214 payments that are not in the topic."],["ui","Producer: acks=1 · enable.idempotence=false · retries=2147483647\nTopic payments: replication.factor=3 · min.insync.replicas=1\nunclean.leader.election.enable=true"]]},
  {choose:"How could confirmed payments vanish?", options:[
   {t:"acks=1: the leader acknowledged before followers copied the data, then the leader died", ok:true, why:"With acks=1 the producer gets success as soon as the leader writes. Followers were a few ms behind; the leader's disk died; a follower without those records became leader.", life:"The shop gave you a receipt after writing your order on one notepad — and that notepad was lost before anyone copied it to the main register."},
   {t:"Retention deleted them", ok:false, why:"Retention removes data after hours or days, not milliseconds.", life:"The record room doesn't shred today's files at night."},
   {t:"A consumer deleted them", ok:false, why:"Consumers can't delete records from a topic; they only read and commit offsets.", life:"Reading a register doesn't erase it."}]},
  {card:"replication"},
  {choose:"Make acknowledged writes survive a broker loss.", options:[
   {t:"acks=all + min.insync.replicas=2 (with RF=3), and disable unclean leader election", ok:true, fx:{durability:60, latency:9}, why:"An ack now means at least two brokers have the record. Out-of-sync replicas can never become leader. Latency rises a little because the leader waits for followers.", life:"Registered post: the receipt is issued only after two post offices have logged your parcel."},
   {t:"Raise replication.factor to 5 but keep acks=1", ok:"partial", fx:{durability:10}, why:"More copies eventually, but the ack still happens after one write — the same 40 ms window of loss exists.", life:"Five notepads, but you still get your receipt after writing on the first one."},
   {t:"Keep unclean.leader.election.enable=true for availability", ok:false, fx:{durability:-20}, why:"Unclean election picks replicas that missed writes, deliberately trading data loss for availability. Wrong trade for payments.", life:"Promoting the clerk who missed half the day's entries to be the official record keeper."}]},
  {task:["num","RF=3, min.insync.replicas=2, acks=all. How many brokers holding a partition can fail while producers still succeed?",1,0,"brokers","Writes need ≥ 2 in-sync replicas; 3 − 2 = 1 broker can fail. Lose 2 and writes are rejected (no silent loss)."], label:"Failure budget", life:"Two of three branch offices must log the parcel: one office can be closed, not two."},
  {say:[["meera","Different problem: yesterday 37 customers were charged twice. Logs show producer retries after timeouts on a slow broker."]]},
  {choose:"How do you stop duplicates from retries?", options:[
   {t:"enable.idempotence=true: producer id + sequence numbers let the broker drop repeats", ok:true, fx:{dupes:-37}, why:"Each batch carries a sequence number per partition. When a retried batch arrives that was already written, the broker discards it, keeping order with up to 5 in-flight requests.", life:"The bank sees request #4411 twice and processes it once, because every request has a unique number."},
   {t:"Set retries=0", ok:"partial", fx:{dupes:-30, durability:-10}, why:"No retry duplicates — but every transient error now drops a payment.", life:"Never re-sending a letter that might have been lost, so some letters just disappear."},
   {t:"Use acks=0 to make it faster", ok:false, fx:{durability:-40}, why:"No acknowledgement at all: no idea whether anything was written.", life:"Throwing letters over the post office wall."}]},
  {card:"idempotence"},
  {task:["fill","Final producer config for payments",`acks=___\nenable.idempotence=___\nmax.in.flight.requests.per.connection=___`,["all","true","5"],["1","false","50"],"acks=all for durability, idempotence for retry safety, ≤ 5 in flight keeps ordering."], intro:[["ravi","Write the producer config; I'll roll it out before the morning peak."]], label:"Ship the config", ok:{durability:20}, bad:{durability:-5}},
  {say:[["ravi","Chaos test: killed a broker during peak load. Zero lost, zero duplicates. p99 latency 17 ms."],["meera","That's a sentence I can put in the audit report."]]}
 ],
 learned:["acks=all + min.insync.replicas=2 on RF=3: one broker can die with zero loss.","Unclean leader election trades data for availability.","Idempotent producers stop duplicates from retries."]},
{title:"The lag monster", icon:"🐉", place:"Thu 04:00 PM · weekly deploy", setup:"Every deploy of the settlement consumer turns into a disaster: lag shoots to millions, logs fill with 'Rebalancing…', and finance finds duplicate settlement rows.",
 meters:{lag:{label:"Peak lag", value:2400000, unit:" msgs", goal:50000, better:"low", max:2600000}, rebal:{label:"Rebalances/hour", value:40, unit:"", goal:2, better:"low", max:45}, dupes:{label:"Duplicates per deploy", value:9000, unit:"", goal:0, better:"low", max:10000}},
 steps:[
  {say:[["dev","Deploy started 20 minutes ago. Lag is 2.4 million and climbing."],["ui","Group settlement · 30 pods · rolling deploy\nRebalances last hour: 40 (eager protocol)\nmax.poll.records=500 · avg processing 0.8 s/record\nWARN consumer poll timeout has expired (max.poll.interval.ms=300000)"]]},
  {task:["num","500 records per poll × 0.8 s each. How many seconds per poll loop?",400,0,"s","400 s > 300 s max.poll.interval.ms → the consumer is considered stuck and kicked from the group."], intro:[["priya","Do the maths before guessing."]], label:"Poll-loop maths", life:"The manager calls every 5 minutes to check you're alive; you take 7 minutes per batch, so he assumes you quit."},
  {choose:"Consumers get kicked out for slow polls. Fix?", options:[
   {t:"Lower max.poll.records (e.g. 100) so each loop finishes well under the limit", ok:true, fx:{rebal:-20, lag:-800000}, why:"100 × 0.8 s = 80 s per loop: consumers stay in the group. You could also raise max.poll.interval.ms or process faster, but smaller batches are the safest first fix.", life:"Take smaller batches of parcels so you're back to answer the manager's call on time."},
   {t:"Lower session.timeout.ms so dead consumers are detected faster", ok:false, fx:{rebal:10}, why:"It makes false 'dead consumer' detection more likely: more rebalances, not fewer.", life:"A manager who panics sooner."},
   {t:"Add partitions", ok:false, why:"Each consumer would still take 400 s per poll.", life:"More delivery areas don't help if each boy is too slow to call back."}]},
  {card:"rebalance"},
  {choose:"Rolling deploys still trigger a rebalance per pod (30 per deploy). Fix?", options:[
   {t:"Static membership (group.instance.id per pod) + cooperative-sticky assignor", ok:true, fx:{rebal:-18, lag:-1500000}, why:"A pod restarting with the same instance id gets its partitions back without a rebalance; when one is needed, cooperative rebalancing moves only the affected partitions.", life:"Regular delivery boys keep their areas when they step out for chai; the manager doesn't redraw the whole map."},
   {t:"Deploy all 30 pods at once", ok:"partial", fx:{rebal:-10, lag:200000}, why:"One rebalance instead of 30, but nothing is processed while every pod restarts.", life:"Sending every delivery boy home at the same time."},
   {t:"Disable heartbeats", ok:false, why:"Heartbeats can't be disabled; the coordinator needs them to know members are alive.", life:"Telling the manager to stop checking — he'd just fire everyone."}]},
  {say:[["meera","Lag is fine now. But after every deploy, ~9,000 duplicate settlement rows appear."]]},
  {task:["bug","Why do restarts create duplicate settlement rows? Tap the faulty line.",["consumer = KafkaConsumer('settlements', enable_auto_commit=False)","for batch in poll_batches(consumer):","    rows = transform(batch)","    db.execute('INSERT INTO settlements VALUES ...', rows)   # plain insert","    consumer.commit()"],3,"Records after the last commit are re-delivered after a restart (at-least-once). A plain INSERT writes them again. Use an upsert keyed on settlement_id."], label:"Find the duplicate source", ok:{dupes:-9000}},
  {card:"offsets"},
  {choose:"Finance asks: can Kafka transactions give us exactly-once into Postgres?", options:[
   {t:"Kafka transactions cover Kafka-to-Kafka; for Postgres, use idempotent upserts (or store offsets in the same DB transaction)", ok:true, fx:{lag:-50000}, why:"Transactions make Kafka writes and offset commits atomic inside Kafka. An external database isn't part of that transaction, so the sink must be idempotent.", life:"A bank's internal transfers are atomic, but a cheque you deposit in another bank needs that bank's own checks."},
   {t:"Yes — enable.idempotence makes it exactly-once end to end", ok:false, why:"Producer idempotence only dedupes producer retries into Kafka.", life:"A unique request number at one bank doesn't stop another bank from processing your cheque twice."},
   {t:"Use acks=all on the consumer", ok:false, why:"acks is a producer setting about writes, not consumer delivery.", life:"Registered post doesn't control how the receiver files letters."}]},
  {say:[["dev","Deploys are boring now: lag peaks at 40k, two rebalances, zero duplicates."],["priya","Boring deploys are the best deploys."]]}
 ],
 learned:["Keep poll loops under max.poll.interval.ms (max.poll.records × time per record).","Static membership + cooperative-sticky = calm rolling deploys.","Commit after processing and make sinks idempotent."]}
]);

// ---- Story extras: under-the-hood explanations + mock interview ----
(function(){
  const M = QUEST.data.kafka.missions;
  const D = {
"0.1":`### What a partition really is
A partition is a directory of **segment files** on a broker. Records are appended to the active segment and get monotonically increasing **offsets**. A consumer reads a partition sequentially by offset, so order inside a partition is physical, not logical — it's the order of appends.

### Why there's no cross-partition order
Each partition is consumed by a different consumer (or thread), at its own speed, possibly on another machine. There's no global clock or sequence across partitions. Event timestamps from different producers can't be trusted for ordering either (clock skew, retries).`,
"0.3":`### How the default partitioner works
- **Key present**: «murmur2(keyBytes) % numPartitions» (positive-masked). Deterministic: same key, same partition, as long as the partition count doesn't change.
- **No key**: the **sticky partitioner** fills a batch for one partition, then switches — good batching, no ordering.

### Choosing the key
Key by the entity whose events must stay ordered relative to each other: payment_id for payment lifecycle events, customer_id if you need per-customer order across payments. High cardinality spreads load; a key like "status" or "country" creates hot partitions.

### Producer-side ordering
With retries and multiple in-flight requests, ordering within a partition is safe only with «enable.idempotence=true» (sequence numbers) — the default in modern clients.`,
"0.7":`### Partition count = parallelism ceiling
A consumer group can have at most one active consumer per partition. Throughput per partition is bounded by what one consumer thread can process.

### Sizing formula
partitions ≥ max(target throughput ÷ per-partition producer throughput, target throughput ÷ per-consumer throughput). Example: 600 MB/s target, one consumer handles 25 MB/s → at least 24 partitions; add headroom (×2) for growth because **re-partitioning keyed topics remaps keys**.

### Costs of too many partitions
More open files and replication fetchers per broker, longer leader elections (mitigated by KRaft), more memory in producers (one batch per partition) and longer rebalances.`,
"1.1":`### The timeline of the loss
1. Producer sends batch to leader (broker-3) with «acks=1».
2. Leader appends to its log (page cache) and acks → API tells customer "success".
3. Followers fetch every few ms; they hadn't fetched those records yet.
4. broker-3's disk dies. Controller elects a new leader from the ISR (or worse, any replica with unclean election).
5. The new leader never had the records → they're gone, and followers truncate to match the new leader.

Note: Kafka acks after writing to the **page cache**, not fsync; durability comes from **replication**, not disk flushes.`,
"1.3":`### How acks=all + min.insync.replicas work together
- «acks=all»: the leader responds only after **every replica currently in the ISR** has the record.
- The ISR can shrink when followers lag (> «replica.lag.time.max.ms», 30 s). Without a floor, acks=all could degrade to "only the leader".
- «min.insync.replicas=2» is that floor: if the ISR has fewer than 2 members, writes fail with NotEnoughReplicas instead of silently becoming unsafe.

### The high watermark
Consumers only read up to the **high watermark** — the highest offset replicated to all ISR members — so they never see records that could be lost in a leader change.

### Trade-off
Latency rises (one extra replication round trip) — typically a few ms within a region.`,
"1.6":`### Idempotence mechanics
- On start, the producer gets a **producer id (PID)** and **epoch** from the broker.
- Each batch carries the PID and a **base sequence number** per partition.
- The broker keeps the last 5 batch sequences per producer per partition. A batch with a sequence it has already written is acknowledged but **not re-appended**; an out-of-order sequence is rejected.
- This is why up to 5 in-flight requests keep ordering with retries.

### Limits
A new producer instance gets a new PID, so restarts can still duplicate unless you use **transactions** («transactional.id» keeps identity across restarts and fences zombies).`,
"2.2":`### The two liveness timers
- **Heartbeats** (background thread, every «heartbeat.interval.ms») prove the process is alive; missing them for «session.timeout.ms» (45 s) gets you removed.
- **poll() calls** prove the processing loop is alive; if the gap between polls exceeds «max.poll.interval.ms» (5 min), the client proactively leaves the group.

### Why big batches kill you
«max.poll.records» × processing time per record must stay well under «max.poll.interval.ms». 500 × 0.8 s = 400 s → kicked out every loop → rebalance → re-delivery of uncommitted records → more lag. Options: fewer records per poll, faster processing (batch DB writes, async I/O), or a larger interval if processing is legitimately slow.`,
"2.4":`### Eager vs cooperative
- **Eager**: every member revokes all partitions, the leader computes a new assignment, everyone gets new partitions. Total stop of consumption during each rebalance.
- **Cooperative-sticky**: members keep partitions that don't need to move; only moved partitions are revoked, in a second round. Consumption continues for most partitions.

### Static membership
With «group.instance.id», the coordinator recognises a restarted pod as the **same member**. If it returns within «session.timeout.ms», no rebalance happens and it gets its partitions back. Set session.timeout a bit above your pod restart time.

### KIP-848 (Kafka 4.0)
The new consumer group protocol («group.protocol=consumer») moves assignment to the broker and makes rebalances incremental by design.`,
"2.8":`### What Kafka transactions guarantee
A transactional producer writes to several partitions **and** commits consumer offsets atomically. Consumers with «isolation.level=read_committed» only see committed data (up to the **last stable offset**). That gives exactly-once for **consume → process → produce within Kafka** (Kafka Streams uses it with «exactly_once_v2»).

### Why Postgres is outside it
The database isn't a participant in Kafka's transaction protocol. Options:
- **Idempotent upsert** keyed by a business id (simplest, most common).
- Store the consumed **offset in the same DB transaction** as the data; on startup, seek to the stored offset (exactly-once by design).
- Transactional outbox / Kafka Connect sink with upsert mode.`,
"0.5":`Idle consumers aren't wasted entirely: they're hot standbys that take over partitions when an active consumer fails. But for throughput, consumers beyond the partition count add nothing.`,
"1.4":`Generalised: with replication factor R and «min.insync.replicas» = m, you can lose **R − m** replicas and keep writing with acks=all, and lose up to **R − 1** without losing acknowledged data (as long as unclean election is off). RF=3, m=2 is the common balance of safety and availability.`,
"2.1":`Rule of thumb: keep the worst-case loop under half of «max.poll.interval.ms». If one record can occasionally take minutes (e.g. a slow external API), move that work off the poll thread (bounded queue + worker pool) and pause/resume partitions to apply back-pressure.`,
"2.6":`### Making sinks idempotent
~~~
INSERT INTO settlements (settlement_id, amount, status, kafka_offset)
VALUES (%s, %s, %s, %s)
ON CONFLICT (settlement_id) DO UPDATE
SET amount = EXCLUDED.amount, status = EXCLUDED.status, kafka_offset = EXCLUDED.kafka_offset
WHERE settlements.kafka_offset < EXCLUDED.kafka_offset;   -- ignore older replays
~~~
The «WHERE» guard keeps an older replayed event from overwriting newer state.`
  };
  for (const k in D){ const [mi, si] = k.split(".").map(Number), S = M[mi].steps[si]; const tgt = S.options ? S.options.find(o => o.ok === true) : S; tgt.more = D[k]; }
})();

QUEST.interviews("kafka", [
{title:"Kafka round: streaming systems", icon:"🎤", place:"45-minute system design + internals round", setup:"Farah, a Principal Engineer, is hiring for the real-time payments platform. Expect follow-ups on every answer.",
 meters:{signal:{label:"Hire signal", value:40, unit:"%", goal:80, better:"high", max:100, cap:100}, depth:{label:"Depth", value:30, unit:"%", goal:75, better:"high", max:100, cap:100}, flags:{label:"Red flags", value:0, unit:"", goal:0, better:"low", max:5}},
 steps:[
  {say:[["farah","Let's talk about Kafka in production. I care about how you reason, not memorised configs."]]},
  {choose:"“How does Kafka guarantee ordering, and how would you design keys for payment events?”", model:`Kafka orders records **within a partition** only; consumers read a partition sequentially by offset. Across partitions there's no order.
So I key by the entity whose events must stay ordered — «payment_id» for a payment's lifecycle (created → captured → refunded), or «customer_id» if per-customer order matters. The default partitioner hashes the key, so the same key always lands on the same partition **as long as the partition count doesn't change**. I'd check key cardinality to avoid hot partitions, keep idempotence on so retries don't reorder, and size partitions up front because adding partitions remaps keys.`, options:[
   {t:"Order is per partition only. I'd key by payment_id (or customer_id if needed) so related events share a partition, watch for hot keys, keep idempotence on for retries, and size partitions up front since adding them remaps keys.", ok:true, fx:{signal:6, depth:7}, why:"Scope of the guarantee, key design, and the two classic gotchas (hot keys, repartitioning)."},
   {t:"Kafka keeps all messages in order by timestamp.", ok:false, fx:{signal:-8, flags:1}, why:"Wrong scope: order is per partition, by offset, not by timestamp."},
   {t:"Use a single partition to keep everything ordered.", ok:"partial", fx:{signal:-2}, why:"Correct for ordering, but kills throughput and consumer parallelism. Interviewers expect the keyed design."}]},
  {choose:"“How do you make sure an acknowledged payment is never lost?”", model:`Producer: «acks=all», «enable.idempotence=true», retries with a sensible «delivery.timeout.ms». Topic: «replication.factor=3», «min.insync.replicas=2», «unclean.leader.election.enable=false». Then an ack means at least two brokers have it; one broker can fail with zero loss; two failures stop writes instead of losing data. Consumers only read below the high watermark. Durability comes from **replication**, not fsync. Spread replicas across racks/AZs («broker.rack»). Test it: kill a broker under load.`, options:[
   {t:"acks=all with min.insync.replicas=2 on RF=3, idempotent producer, unclean leader election off, replicas spread across AZs — and I'd chaos-test by killing a broker under load.", ok:true, fx:{signal:6, depth:7}, why:"Complete durability chain plus verification. Mentioning rack awareness and testing is a senior signal."},
   {t:"Set acks=all.", ok:"partial", fx:{signal:-2}, why:"Necessary but not sufficient: without min.insync.replicas, acks=all can degrade to one replica."},
   {t:"Kafka stores everything on disk, so nothing is lost.", ok:false, fx:{signal:-8, flags:1}, why:"Acks happen after the page cache write; a single disk failure with acks=1 loses data."}]},
  {task:["num","Farah: “Target is 600 MB/s. One consumer instance processes about 25 MB/s. Minimum partitions for consumer parallelism?”",24,0,"partitions","600 ÷ 25 = 24. In practice add headroom (e.g. 48) because increasing later remaps keys."], label:"Partition sizing", ok:{signal:4, depth:4}, bad:{signal:-4}},
  {choose:"“What does exactly-once mean in Kafka — and where does it stop?”", model:`Two pieces: the **idempotent producer** removes duplicates from retries within a producer session; **transactions** («transactional.id») make writes to multiple partitions plus **consumer offset commits** atomic, and «read_committed» consumers only see committed data. Together: exactly-once for **read → process → write within Kafka** (Kafka Streams «exactly_once_v2»).
It **stops at external systems**: a database or API isn't in the transaction. There I use idempotent upserts keyed by a business id, or store offsets in the same DB transaction.`, options:[
   {t:"Idempotent producer + transactions + read_committed give exactly-once for consume-process-produce inside Kafka. For external sinks I rely on idempotent upserts or storing offsets in the same DB transaction.", ok:true, fx:{signal:6, depth:7}, why:"You defined the guarantee precisely and stated its boundary — the most common follow-up trap."},
   {t:"Turn on exactly-once and every system downstream gets each message once.", ok:false, fx:{signal:-8, flags:1}, why:"Over-claiming the guarantee is a classic red flag."},
   {t:"It means the consumer commits offsets after processing.", ok:"partial", fx:{signal:-2}, why:"That's at-least-once with commit-after-processing, not exactly-once."}]},
  {choose:"“Consumer lag is growing fast. How do you investigate?”", model:`1. Look at lag **per partition**: one partition → hot key or a poison/slow record; all partitions → capacity problem.
2. Check consumer metrics: records/sec, processing time per record, poll interval, **rebalance rate** (rebalance storms stall consumption), errors/retries.
3. Check downstream: DB/API latency, connection pool saturation.
4. Fix: scale consumers up to the partition count, increase partitions (with key remapping caveats), batch downstream writes, move slow work off the poll thread, fix hot keys, tune max.poll.records.`, options:[
   {t:"Add more consumers.", ok:false, fx:{signal:-6, flags:1}, why:"Doesn't help beyond the partition count, and ignores whether it's one hot partition or downstream latency."},
   {t:"Check lag per partition (hot key vs capacity), processing time, rebalance rate and downstream latency; then scale up to the partition count, add partitions, batch sink writes, or fix hot keys.", ok:true, fx:{signal:6, depth:7}, why:"Systematic diagnosis that distinguishes skew, capacity, rebalances and downstream bottlenecks."},
   {t:"Increase retention so we don't lose data while catching up.", ok:"partial", fx:{signal:-1}, why:"A sensible safety step, but it doesn't diagnose or fix the lag."}]},
  {choose:"“What triggers rebalances, and how do you reduce their impact?”", model:`Triggers: a member joins/leaves, misses heartbeats for «session.timeout.ms», exceeds «max.poll.interval.ms» between polls, or subscription/partition changes.
Reduce impact: keep poll loops short (tune «max.poll.records», move slow work off-thread), **cooperative-sticky** assignor (only moved partitions pause), **static membership** («group.instance.id») so rolling restarts don't rebalance, and the new **KIP-848** protocol (broker-side, incremental).`, options:[
   {t:"Rebalances happen randomly; you can't control them.", ok:false, fx:{signal:-8, flags:1}, why:"They have specific, controllable triggers."},
   {t:"Members joining/leaving, missed heartbeats, or slow polls past max.poll.interval.ms. I keep poll loops short, use cooperative-sticky assignment and static membership, and consider the new KIP-848 protocol.", ok:true, fx:{signal:6, depth:7}, why:"Triggers and three concrete mitigations."},
   {t:"Lower session.timeout.ms so failures are detected sooner.", ok:"partial", fx:{signal:-2}, why:"That usually increases false detections and rebalances."}]},
  {choose:"“When would you use a compacted topic instead of time-based retention?”", model:`Use **compaction** when consumers need the **latest value per key** rather than full history: changelogs (Kafka Streams state), CDC topics feeding a materialized view, config/state topics, «__consumer_offsets». A null value (**tombstone**) deletes a key after «delete.retention.ms». Use **time/size retention** for event streams where every event matters for a window (clickstream, logs). «cleanup.policy=compact,delete» combines both. Mention «min.compaction.lag.ms» / «max.compaction.lag.ms» for guarantees and GDPR-style deletes.`, options:[
   {t:"When consumers need the latest state per key — changelogs, CDC, config — with tombstones for deletes; retention for event streams where every event matters. compact,delete combines both.", ok:true, fx:{signal:6, depth:7}, why:"Use cases, tombstones and the combined policy — complete."},
   {t:"Compaction compresses messages to save disk.", ok:false, fx:{signal:-8, flags:1}, why:"That's compression («compression.type»), a different feature."},
   {t:"When the topic is very large.", ok:"partial", fx:{signal:-2}, why:"Size isn't the criterion; semantics (latest value per key) is."}]},
  {say:[["farah","Good conversation. You knew where each guarantee stops — that's what separates people who've run Kafka in production."]]}
 ],
 learned:["State the **scope** of every guarantee (ordering per partition, exactly-once inside Kafka).","Durability = acks=all + min.insync.replicas + RF + no unclean election + testing.","Diagnose lag per partition before scaling.","Know rebalance triggers and the modern mitigations."]}
]);

/* ===== On-call desk: Kafka incident ===== */
QUEST.cases("kafka", [
{
 title:"One partition is 3 million behind", icon:"☠️", sev:1, clock:"10:47", channel:"inc-2315-ledger-lag", svc:"payments-ledger consumer · Kafka", need:4,
 terms:[["Partition", "An ordered, append-only log. A topic is split into partitions; each is read by exactly one consumer in a group."], ["Offset", "A record's position in a partition. The consumer group commits the offset it has finished up to."], ["Consumer lag", "Log-end offset minus committed offset: how many records are waiting to be processed."], ["Consumer group", "A set of consumers sharing a topic's partitions between them."], ["CrashLoopBackOff", "Kubernetes keeps restarting a container that keeps crashing, waiting longer each time."], ["Poison message", "A record the consumer can't process. Without error handling it crashes on it forever."], ["DLQ", "Dead-letter queue: a topic where unprocessable records are parked (with error details) so the main flow keeps moving."]],
 deep:[{"t": "Reading lag correctly", "md": "- **Lag** = log-end offset − committed offset, per partition.\n- Lag **flat** = consumer keeping up (some lag is normal). Lag **growing linearly** at the produce rate = consumer stopped. Lag **growing slower** = consumer too slow.\n- **One partition** behind: that partition's consumer or data (poison message, hot key). **All partitions** behind: downstream slowness, too few consumers, or broker trouble.\n- The committed offset **not moving at all** is the key signal of a crash loop."}, {"t": "Error handling patterns for consumers", "md": "| Error type | Example | Handling |\n|---|---|---|\n| Transient | DB timeout, 503 | Retry with backoff in place (bounded), then pause the partition |\n| Permanent / bad data | Parse error, schema mismatch | **DLQ** with headers (error, topic, partition, offset), commit, continue |\n| Fatal | Auth failure, config error | Crash and alert |\n\nAlso: validate at the **producer** with a schema registry (Avro/Protobuf/JSON Schema) so bad data can't be written in the first place."}],
 impact:{"label": "Stale merchant balances", "ic": "🧾", "rate": 1100, "start": 3042118, "unit": " msgs"},
 pager:`[r]FIRING[/r]  consumer lag > 500k  group=ledger-writer  topic=payments.v2
partition 7   lag [r]3,042,118[/r]  (growing ~1.1k/s)
partitions 0-6, 8-11   lag < 200
impact   merchant balances for ~1/12 of merchants are [b]stale[/b]`,
 brief:"Merchants on one partition see balances frozen since ~09:15, and support tickets are piling up. The ledger-writer consumer runs on Kubernetes (6 pods, 12 partitions). The payments producer team did a release this morning.",
 slack:[
  {at:0, who:"ravi", t:"Only partition 7 is behind, everything else is near zero. Weird. Brokers look fine to me."},
  {at:5, who:"priya", t:"One partition stuck while the rest are fine is a very specific shape. Get the per-partition view first.", cmd:"kafka-consumer-groups --bootstrap-server kafka:9092 --describe --group ledger-writer"},
  {at:50, who:"meera", t:"Support says ~4,000 merchants can't see today's settlements in the dashboard. Is this related?"},
  {on:"stuckoffset", who:"priya", t:"Committed offset isn't moving at all, and one consumer owns p7. Is that pod healthy?", cmd:"kubectl get pods -l app=ledger-writer"},
  {on:"restarts", who:"ravi", t:"CrashLoopBackOff with 41 restarts. The logs of the *previous* container will tell you why it died.", cmd:"kubectl logs ledger-writer-6d9f7-x2k4p --previous --tail=30"},
  {on:"jsonerr", who:"priya", t:"It dies on the **same offset** every time. Let's see what's actually in that message.", cmd:"kafka-console-consumer --bootstrap-server kafka:9092 --topic payments.v2 --partition 7 --offset 1882301 --max-messages 1"},
  {on:"badmsg", who:"dev", t:"Producer team here. We shipped a locale formatting change at 09:10… checking our repo.", cmd:"git -C ~/repos/payments-producer log --oneline -3"}
 ],
 hints:["When one partition is stuck and the rest are fine, the problem is usually the *data* in that partition or the consumer that owns it, not the brokers.","Check the consumer pod's restarts and its «--previous» logs. Does it crash on the same offset every time?","Read the message at that offset. The consumer crashes, restarts from the last commit, reads the same record and crashes again. That's a poison message."],
 term:{host:"ops-bastion", user:"oncall", suggest:["kafka-consumer-groups --bootstrap-server kafka:9092 --describe --group ledger-writer","kafka-topics --bootstrap-server kafka:9092 --describe --topic payments.v2"],
  cmds:[
  {m:["kafka-consumer-groups"], out:`GROUP          TOPIC        PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG       CONSUMER-ID                              HOST
ledger-writer  payments.v2  6          9120332         9120380         48        consumer-ledger-writer-3-9a1f...         /10.8.2.14
ledger-writer  payments.v2  7          [r]1882301[/r]         4924419         [r]3042118[/r]   consumer-ledger-writer-4-[y]c0de...[/y]         /10.8.2.31
ledger-writer  payments.v2  8          8873112         8873140         28        consumer-ledger-writer-4-c0de...         /10.8.2.31
[d]… partitions 0-5, 9-11 lag < 200[/d]`, clue:"stuckoffset", unlock:["kubectl get pods -l app=ledger-writer"]},
  {m:["kafka-topics"], out:`Topic: payments.v2  PartitionCount: 12  ReplicationFactor: 3  Configs: min.insync.replicas=2,retention.ms=604800000
  Partition: 7  Leader: 3  Replicas: 3,1,2  [g]Isr: 3,1,2[/g]
  [d]… all 12 partitions have full ISR[/d]`, note:"Replicas are fully in sync and the leader is healthy. The broker side of p7 is fine."},
  {m:["kubectl top pods","kubectl top"], out:`NAME                          CPU(cores)   MEMORY(bytes)
ledger-writer-6d9f7-a81kd     310m         612Mi
ledger-writer-6d9f7-x2k4p     [d]0m[/d]           [d]0Mi[/d]      [d](not running)[/d]
ledger-writer-6d9f7-q7w2m     298m         598Mi`, note:"Resource usage is normal for the healthy pods. One pod isn't even running long enough to use anything."},
  {m:["kubectl get pods"], out:`NAME                          READY   STATUS             RESTARTS        AGE
ledger-writer-6d9f7-a81kd     1/1     Running            0               3d
ledger-writer-6d9f7-x2k4p     0/1     [r]CrashLoopBackOff[/r]   [r]41 (2m ago)[/r]    3d
ledger-writer-6d9f7-q7w2m     1/1     Running            0               3d
[d]… 3 more Running, 0 restarts[/d]`, clue:"restarts", unlock:["kubectl logs ledger-writer-6d9f7-x2k4p --previous --tail=30"]},
  {m:["kubectl logs ledger-writer-6d9f7-x2k4p --previous","kubectl logs ledger-writer-6d9f7-x2k4p -p","kubectl logs --previous"], out:`09:58:12 INFO  Assigned partitions: [payments.v2-7, payments.v2-8]
09:58:12 INFO  Seeking payments.v2-7 to committed offset 1882301
09:58:13 [r]ERROR Failed to process record payments.v2-7@1882301[/r]
Traceback (most recent call last):
  File "/app/ledger/consumer.py", line 58, in handle
    amount = Decimal(evt["amount"])
decimal.InvalidOperation: [r][<class 'decimal.ConversionSyntax'>][/r]
09:58:13 ERROR Unhandled exception in poll loop, exiting (offset not committed)
[d]… same trace on all 41 previous restarts, always offset 1882301[/d]`, clue:"jsonerr", unlock:["kafka-console-consumer --bootstrap-server kafka:9092 --topic payments.v2 --partition 7 --offset 1882301 --max-messages 1"]},
  {m:["kubectl logs ledger-writer-6d9f7-x2k4p"], out:`09:58:12 INFO  Assigned partitions: [payments.v2-7, payments.v2-8]
09:58:12 INFO  Seeking payments.v2-7 to committed offset 1882301
[d](container restarting — use --previous to see the crashed container's logs)[/d]`, note:"The live container has only just started. Use «--previous» to see why the last one died."},
  {m:["kafka-console-consumer"], out:`{"txn_id":"T-88412093","merchant_id":"M-20391","currency":"INR",
 "amount":[r]"1,24,500.00"[/r],"status":"CAPTURED","ts":"2026-11-18T09:14:58+05:30"}
[d]Processed a total of 1 messages[/d]`, clue:"badmsg", unlock:["git -C ~/repos/payments-producer log --oneline -3"]},
  {m:["git -C ~/repos/payments-producer log","git log"], out:`[y]b71c0de[/y] (Wed 18 Nov 09:10, aarav) Format amounts with en_IN locale for the receipts service
[y]2290a1f[/y] (Mon 16 Nov, dev)          Retry on NOT_ENOUGH_REPLICAS`, clue:"producer"},
  {m:["kafka-log-dirs","kafka-broker-api-versions"], out:`[d]broker 1: ok   broker 2: ok   broker 3: ok   (no offline log dirs)[/d]`, note:"All brokers are healthy."}
 ]},
 dash:[
  {title:"Consumer lag by partition (records)", x:["09:00","09:15","09:30","09:45","10:00","10:15","10:30","10:45"], series:[{name:"p7", v:[40,120,620000,1150000,1650000,2150000,2600000,3042118]}, {name:"other partitions (max)", v:[60,80,110,90,140,100,120,180]}], marks:[{i:1, label:"09:15"}], clue:"onlyp7"},
  {title:"Broker CPU %", unit:"%", x:["09:00","09:15","09:30","09:45","10:00","10:15","10:30","10:45"], series:[{name:"broker 1", v:[34,36,35,33,35,34,36,35]}, {name:"broker 3 (p7 leader)", v:[35,37,34,35,36,35,34,35]}], note:"Brokers are at a calm ~35% CPU, including p7's leader. The cluster isn't the bottleneck."},
  {title:"Produce rate payments.v2 (msg/s)", x:["09:00","09:15","09:30","09:45","10:00","10:15","10:30","10:45"], series:[{name:"msg/s", v:[12800,13100,13300,12900,13400,13200,13000,13300]}], note:"Inbound traffic is normal. Nobody flooded the topic."},
  {title:"ledger-writer pod restarts", x:["09:00","09:15","09:30","09:45","10:00","10:15","10:30","10:45"], series:[{name:"restarts", v:[0,1,6,12,19,26,33,41]}], marks:[{i:1, label:"09:15"}], clue:"restarts"}
 ],
 files:[
  {path:"ledger-writer/ledger/consumer.py", text:`from decimal import Decimal

def handle(record):
    evt = json.loads(record.value)
    if evt["status"] != "CAPTURED":
        return
    amount = Decimal(evt["amount"])          # line 58 in prod build
    ledger.credit(evt["merchant_id"], amount, txn_id=evt["txn_id"])

def run():
    consumer.subscribe(["payments.v2"])
    while True:
        for record in consumer.poll(timeout=1.0):
            handle(record)                   # any exception kills the loop
        consumer.commit()`, clues:{7:"nohandling", 14:"nohandling"}, notes:{8:"The ledger credit call is idempotent on txn_id. That's fine."}},
  {path:"payments-producer/src/serialize.py", meta:"changed in b71c0de (09:10)", text:`import locale
locale.setlocale(locale.LC_ALL, "en_IN.UTF-8")

def to_event(txn):
    return {
        "txn_id": txn.id,
        "merchant_id": txn.merchant_id,
        "currency": txn.currency,
        "amount": locale.format_string("%.2f", txn.amount, grouping=True),
        "status": txn.status,
        "ts": txn.ts.isoformat(),
    }`, clues:{9:"producer"}}
 ],
 clues:{
  stuckoffset:"p7's committed offset is frozen at 1,882,301 while its log end keeps growing",
  onlyp7:"Only partition 7 lags; every other partition is near zero",
  restarts:"The pod that owns p7 is in CrashLoopBackOff (41 restarts since 09:15)",
  jsonerr:"It crashes on the same record every time: Decimal(\"amount\") fails at offset 1882301",
  badmsg:"The message at offset 1882301 has amount \"1,24,500.00\" (Indian digit grouping)",
  producer:"Producer release b71c0de at 09:10 formats amounts with the en_IN locale",
  nohandling:"consumer.py: one bad record raises, kills the poll loop and never commits, so it retries forever"
 },
 cause:{q:"What's the root cause?", o:[
  {t:"A poison message: the 09:10 producer release writes locale-formatted amounts (\"1,24,500.00\"). The consumer can't parse it, crashes before committing, restarts on the same offset and loops forever on p7", ok:true},
  {t:"Partition 7's broker is overloaded", ok:false, why:"p7's leader is at 35% CPU with full ISR. Lag is on the consumer side.", say:[["ravi","Broker 3 is at 35% CPU with a healthy ISR. And if the broker were slow, the *log end* wouldn't keep growing."]]},
  {t:"Not enough consumers: the group needs more pods", ok:false, why:"The other 11 partitions keep up fine. p7's consumer isn't slow, it's crashing.", say:[["priya","The other 11 partitions are at near-zero lag with the same pods. p7's consumer isn't slow, it's dead."]]},
  {t:"A hot key: one huge merchant floods p7", ok:false, why:"Produce rate is flat and p7's consumer processes nothing. It's not overloaded.", say:[["priya","If it were a hot key, the consumer would be busy and *slowly* catching up. Its offset hasn't moved by a single record in 90 minutes."]]}
 ]},
 fix:{q:"What do you ship? Pick every action you'd take now.", o:[
  {t:"Make the consumer send unparseable records to a dead-letter topic (with the error and offset), commit, and keep going", kind:"must", why:"One bad record can no longer block a whole partition. The DLQ keeps it so nothing is lost.", miss:[["ravi","Producer's rolled back, nice. But p7 is still crash-looping on offset 1882301. That record is already in the log, and every bad record since 09:10 is still there."]]},
  {t:"Roll back the producer release (b71c0de) and emit amounts as plain decimal strings or integer paise", kind:"must", why:"Stops new poison at the source. Amounts in events should be machine formats; formatting for humans belongs in the receipt UI.", miss:[["meera","p7 is draining, but the DLQ topic is growing ~200 msg/s. The producer is still sending formatted amounts, so those merchants' balances are wrong."]]},
  {t:"Replay the DLQ through a fixed parser once the consumer is healthy, then reconcile balances", kind:"good", why:"Nothing is dropped. Every DLQ'd payment still reaches the ledger, idempotently on txn_id."},
  {t:"Add a schema registry contract (amount as decimal/bytes) with compatibility checks in the producer's CI", kind:"good", why:"The next format change fails a build instead of paging you."},
  {t:"Alert on consumer restarts and a committed offset that hasn't moved, not just on lag size", kind:"good", why:"Catches a stuck partition in minutes, even while traffic is low."},
  {t:"Restart all consumer pods", kind:"meh", why:"The crashing pod restarts on the same offset and crashes again."},
  {t:"Reset partition 7's offset to latest so lag goes to zero", kind:"bad", why:"Skipping 3M records means skipping 3M real payments. Lag is a symptom; data loss is a much bigger incident.", say:[["meera","Lag is zero but 4,000 merchants just lost every payment since 09:15 from their balance?! Finance is on the phone. 😱"],["priya","We skipped 3M real payments. Reprocessing from the offset we noted… please don't reset offsets to hide lag."]]},
  {t:"Add partitions to payments.v2 to spread the load", kind:"bad", why:"New partitions don't move existing data, and they change key → partition mapping, which breaks per-merchant ordering.", say:[["dev","Partition count went 12 → 24… and now merchants' events are landing on different partitions than before. Per-merchant ordering just broke for new events. And p7 is *still* stuck."]]}
 ]},
 post:{
  summary:"Partition 7 of «payments.v2» stopped being consumed at 09:15 and reached **3.04M records of lag**. Balances for ~4,000 merchants were stale for ~2 hours. No data was lost.",
  cause:"Producer release «b71c0de» (09:10) formatted «amount» with the **en_IN locale**, giving «\"1,24,500.00\"». The first such record on p7 (offset 1882301) made «Decimal()» raise. The consumer had **no per-record error handling**: the exception killed the poll loop *before commit*. Kubernetes restarted the pod, it re-read the same offset and crashed again: **41 times**. Other partitions kept moving only because their bad records hadn't come up yet, or their consumers hadn't yet been rebalanced onto one.",
  prevent:["Every consumer: per-record try/except → DLQ with error metadata, then commit and continue","Schema registry contracts for money fields (decimal or integer minor units), with compatibility checks in CI","Alert on \"committed offset unchanged for N minutes\" and on pod restart loops","Producer changes to shared topics need a consumer owner's review"]
 },
 learned:["**One** stuck partition = look at that partition's **data** and **consumer**, not the cluster.","A crash before commit = the **same record forever**. That's a poison message.","Never reset offsets to \"fix\" lag in a money pipeline. Lag is a symptom; skipping is **data loss**.","Fix it twice: **DLQ** in the consumer (resilience) **and** a schema contract at the producer (prevention)."],
 cards:["offsets","groups",{k:"dlq", t:"Poison messages and dead-letter queues", one:"One record your consumer can't process can block a whole partition forever, unless you park it and move on.",
  life:"A cashier hits a crumpled ₹500 note the machine won't accept. A bad cashier stops the whole queue arguing with the machine. A good one puts it aside in an envelope with a note (\"check later\"), serves the next customer, and sorts the envelope out at the end of the shift.",
  how:["Kafka consumers read a partition **in order** and track progress with a **committed offset**.","If processing a record throws and you don't commit, the consumer restarts **at the same offset**, reads the same record, throws again: a crash loop.","A **dead-letter queue (DLQ)** is another topic where you send records you can't process, with error, source topic, partition and offset in headers.","After sending to the DLQ, you **commit and continue**, so the partition moves again.","Fix the bug, then **replay** the DLQ through the fixed code. Make processing **idempotent** (e.g. on txn_id) so replays are safe.","Separate **retryable** errors (DB timeout: retry with backoff) from **non-retryable** ones (bad format: DLQ straight away)."],
  ex:"~~~\nfor rec in consumer.poll(1.0):\n    try:\n        handle(rec)\n    except (ValueError, InvalidOperation) as e:      # bad data: don't retry\n        dlq.send(\"payments.v2.dlq\", rec.value, headers={\n            \"err\": str(e), \"src\": f\"{rec.topic}-{rec.partition}@{rec.offset}\"})\n    except DBTimeout:\n        raise                                       # retryable: let it retry\nconsumer.commit()\n~~~",
  traps:["Catching *every* exception and DLQ'ing it hides real outages (a DB down for 5 minutes ends up in the DLQ instead of being retried).","A DLQ nobody watches is a black hole. Alert on its size and assign an owner.","Resetting offsets to latest \"fixes\" lag by **dropping data**.","Kafka Connect has this built in: «errors.tolerance=all» plus «errors.deadletterqueue.topic.name»."],
  say:"A poison message is a record the consumer can't process; without per-record handling it crashes before committing and loops on the same offset forever, blocking that partition. I handle it by classifying errors: retryable ones get backoff, non-retryable ones go to a dead-letter topic with metadata, then I commit and continue. Processing is idempotent so I can replay the DLQ once the bug is fixed, and I alert on the DLQ size and on offsets that stop moving."}]
}
]);

/* ===== Work simulator: Kafka ===== */
QUEST.work("kafka", [
{
 type:"pr", title:"\"New payments consumer\"", three:"find all 3 problems with no false alarms",
 brief:"The ledger team is replacing the old consumer with a simpler one. It reads «payments.v2» and writes every captured payment into the ledger database. Money flows through this code: **a lost or doubled message is a wrong merchant balance.**",
 repo:"payu/ledger-writer", pr:"#91 Rewrite consumer with confluent-kafka (simpler, 120 lines → 25)", author:"neha",
 desc:"Replaces our old consumer framework with plain «confluent-kafka».\n\n- New consumer group «ledger-writer-v2» so we can run it side by side\n- Auto-commit on, so we don't have to manage offsets\n- Notifies the merchant-app after each payment",
 reasons:["Commits offsets before the work is done: a crash loses payments","Starts from the newest offset: skips messages that already exist","Not idempotent: a redelivered message is written twice","Blocks the poll loop too long: causes rebalances","Swallows errors that should crash or alert"],
 files:[{path:"ledger/consumer.py", diff:`@@ -0,0 +1,25 @@
+from confluent_kafka import Consumer
+import json, requests
+
+conf = {
+    "bootstrap.servers": BROKERS,
+    "group.id": "ledger-writer-v2",
+    "enable.auto.commit": True,
+    "auto.offset.reset": "latest",
+    "max.poll.interval.ms": 300000,
+}
+consumer = Consumer(conf)
+consumer.subscribe(["payments.v2"])
+
+while True:
+    msg = consumer.poll(1.0)
+    if msg is None:
+        continue
+    if msg.error():
+        continue
+    evt = json.loads(msg.value())
+    db.execute("INSERT INTO ledger (txn_id, merchant_id, amount) VALUES (%s, %s, %s)",
+               (evt["txn_id"], evt["merchant_id"], evt["amount"]))
+    db.commit()
+    requests.post(NOTIFY_URL, json=evt, timeout=5)`}],
 bugs:[
  {f:0, at:"\"enable.auto.commit\": True", a:0, why:"Auto-commit commits offsets on a **timer** (every 5 s) for messages already *handed to you*, whether or not your DB insert finished. If the pod dies after a commit but before the insert, that payment is **never processed**. Commit **after** the work: «enable.auto.commit=False» and «consumer.commit(msg)» after «db.commit()» (at-least-once)."},
  {f:0, at:"\"auto.offset.reset\": \"latest\"", a:1, why:"«ledger-writer-v2» is a **new group** with no committed offsets, so «auto.offset.reset» decides where it starts. «latest» = only messages produced after it joins, so everything between the old consumer stopping and this one starting is **silently skipped**. Use «earliest» (with idempotent writes) or explicitly seed the new group's offsets from the old group."},
  {f:0, at:"VALUES (%s, %s, %s)\",", a:2, why:"Kafka consumers are **at-least-once**: after a crash or rebalance, messages since the last commit are delivered **again**. A plain INSERT writes the same payment twice. Make it idempotent: a unique key on «txn_id» with «ON CONFLICT (txn_id) DO NOTHING» (or an upsert)."}
 ],
 notes:[{f:0, at:"\"max.poll.interval.ms\": 300000", note:"5 minutes is the default and plenty for one insert plus a 5 s HTTP call."},{f:0, at:"if msg.error():", note:"«msg.error()» mostly carries informational events like partition EOF; skipping them is the documented pattern. Fatal errors are raised separately."},{f:0, at:"requests.post(NOTIFY_URL", note:"A 5 s timeout keeps this well under the 5-minute poll interval. Not ideal (an outbox pattern is better), but not a bug here."},{f:0, at:"db.commit()", note:"Committing the DB transaction per message is correct. The problem is what happens to Kafka offsets."}],
 shipped:"On cutover day the new group started at **latest** and skipped **41,000 payments** produced during the switch. Two days later a pod crash after an auto-commit lost **312 more**, and a rebalance doubled **1,900** ledger rows. Finance spent a week reconciling.",
 deep:[
  {t:"Delivery semantics: at-most-once, at-least-once, exactly-once", md:"| Commit offset… | If the consumer crashes… | You get |\n|---|---|---|\n| **before** processing (or auto-commit) | committed-but-unprocessed messages are skipped | **at-most-once**: loss |\n| **after** processing | processed-but-uncommitted messages are re-delivered | **at-least-once**: duplicates |\n| atomically with the output | neither | **exactly-once** |\n\nFor payments, choose **at-least-once + idempotent writes**. Kafka's exactly-once (transactions, «isolation.level=read_committed») only covers Kafka → Kafka. Writing to an external DB needs idempotency or storing offsets in the same DB transaction."},
  {t:"auto.offset.reset only applies when there's no valid offset", md:"It's consulted when a group has **no committed offset** for a partition (a brand-new group) or its offset is **out of range** (expired by retention or «offsets.retention.minutes», 7 days by default).\n\n- «earliest»: start from the oldest retained message. Safe with idempotent processing; may reprocess a lot.\n- «latest»: start from the end. Fine for metrics or UIs, dangerous for money.\n- Migrating to a new group? Seed offsets: «kafka-consumer-groups --reset-offsets --to-datetime …» or copy the old group's offsets, then start."},
  {t:"Making consumers idempotent", md:"- **Natural key + unique constraint**: «INSERT … ON CONFLICT (txn_id) DO NOTHING».\n- **Upserts** keyed by entity id when the latest state wins.\n- **Store the offset with the data**: write «(topic, partition, offset)» in the same DB transaction and resume from it on startup. Then Kafka's committed offset becomes a hint.\n- Side effects (emails, HTTP calls) need their own dedup key, or an **outbox table** written in the same transaction and sent by a separate worker."}
 ],
 say:"For a consumer that moves money I want at-least-once delivery with idempotent writes: auto-commit off, commit after the DB transaction, a unique key on the business id so redeliveries are no-ops, and auto.offset.reset chosen deliberately, with offsets seeded when migrating to a new group."
},
{
 type:"tune", title:"Stop the rebalance storm", three:"hit every goal in 2 runs or fewer",
 brief:"The «ledger-writer» group (12 pods) keeps **rebalancing**, around 18 times an hour. Every rebalance pauses consumption and lag spikes.\n\nWhat you know:\n- At month-end the ledger DB slows down; one record can take up to **0.75 s** at p99.\n- Kubernetes CPU throttling sometimes **freezes a pod for ~15 s**.\n- The autoscaler adds or removes a pod about **twice an hour** (each is a planned rebalance).",
 knobs:[
  {k:"r", label:"max.poll.records", opts:[500,100,20], def:500, help:"The most records one «poll()» returns. Your code must process the whole batch and call «poll()» again within **max.poll.interval.ms**.\n\nWorst batch here ≈ records × 0.75 s: 500 → **375 s**, 100 → 75 s, 20 → 15 s."},
  {k:"i", label:"max.poll.interval.ms", opts:[300000,900000], def:300000, fmt:v => v / 60000 + " min", help:"Maximum gap between two «poll()» calls. Exceed it and the consumer is considered **stuck**: it leaves the group and its partitions are reassigned (a rebalance).\n\nRaising it hides slow batches, but a **genuinely hung** consumer also keeps its partitions that long before anyone notices."},
  {k:"s", label:"session.timeout.ms", opts:[10000,45000], def:10000, fmt:v => v / 1000 + " s", help:"How long the broker waits without **heartbeats** before declaring a consumer dead. Heartbeats come from a background thread, so this catches a **dead or frozen process**, not slow processing.\n\nToo low and short freezes (GC, CPU throttling) kick healthy consumers out. Default in modern clients: 45 s."},
  {k:"a", label:"partition.assignment.strategy", opts:["range","cooperative-sticky"], def:"range", help:"**Eager** strategies (range, round-robin) are stop-the-world: on every rebalance **all** consumers drop **all** partitions, then get new ones. ~40 s pause here.\n\n**Cooperative-sticky** (incremental rebalancing) only moves the partitions that need to move; everyone else keeps consuming. ~3 s pause."}
 ],
 metrics:[
  {k:"un", label:"Unplanned rebalances/hour", gl:"= 0", goal:v => v === 0},
  {k:"pause", label:"Paused per hour", unit:" s", gl:"≤ 60 s", goal:v => v <= 60},
  {k:"det", label:"Hung consumer detected in", unit:" min", gl:"≤ 5 min", goal:v => v <= 5}
 ],
 sim:v => {
  const worst = v.r * 0.75, log = [], over = worst > v.i / 1000, kick = v.s < 15000;
  log.push(`Worst batch: ${v.r} records × 0.75 s = **${worst} s** vs max.poll.interval **${v.i / 1000} s** → ${over ? "**exceeded**: the consumer is evicted as stuck" : "OK"}.`);
  log.push(`Pods freeze for ~15 s; session timeout is **${v.s / 1000} s** → ${kick ? "**heartbeats missed**: healthy pods get kicked out" : "OK, the freeze is tolerated"}.`);
  const un = (over ? 12 : 0) + (kick ? 6 : 0), all = un + 2, per = v.a === "range" ? 40 : 3;
  log.push(`Rebalances: ${un} unplanned + 2 from autoscaling = **${all}/hour**, each pausing ${v.a === "range" ? "**every** consumer ~40 s (eager)" : "only moved partitions ~3 s (cooperative)"}.`);
  if (v.i > 300000) log.push(`A truly hung consumer now keeps its partitions for **${v.i / 60000} minutes** before anyone takes over.`);
  return {m:{un, pause:all * per, det:v.i / 60000}, log};
 },
 best:"**max.poll.records 100** (or 20), **max.poll.interval 5 min**, **session.timeout 45 s**, **cooperative-sticky**: no unplanned rebalances, the two planned ones cost ~6 s, and a hung consumer is still detected within 5 minutes.",
 deep:[
  {t:"Two different timeouts, two different failures", md:"| Setting | Detects | Mechanism |\n|---|---|---|\n| «session.timeout.ms» | A **dead/frozen process** | Background heartbeat thread stops |\n| «max.poll.interval.ms» | A **stuck/slow processing loop** | Time between «poll()» calls |\n\nSince KIP-62 (Kafka 0.10.1) heartbeats run on a separate thread, so slow processing no longer causes session timeouts; it causes **poll interval** violations instead. Fix slow batches with smaller «max.poll.records» or faster processing, not by inflating the interval."},
  {t:"Eager vs cooperative rebalancing", md:"- **Eager** (range, roundrobin, sticky): every member revokes **all** partitions, the leader computes a new assignment, everyone resumes. Stop-the-world for the whole group.\n- **Cooperative** (cooperative-sticky, KIP-429): members keep their partitions; only the ones that must move are revoked, in a second round. Others never stop.\n- Switching strategy on a live group needs a **rolling bounce in two steps** (add cooperative-sticky alongside the old one, then remove the old).\n- Kafka 4.0's new **consumer group protocol** (KIP-848) moves assignment to the broker and removes the global sync barrier entirely."},
  {t:"Static membership: no rebalance for a restart", md:"Set «group.instance.id» to a stable value per pod (e.g. the StatefulSet pod name). A restarting member that comes back **within session.timeout** gets its old partitions back with **no rebalance at all**. Great for rolling deploys, combined with a session timeout longer than a pod restart."}
 ],
 say:"Rebalance storms usually come from two places: batches that exceed max.poll.interval, which I fix with fewer records per poll, and short session timeouts that kick out pods during GC or CPU throttling. Then I switch to cooperative-sticky so planned rebalances don't stop the whole group, and use static membership for restarts."
},
{
 type:"triage", title:"Monday 9 AM queue", three:"no more than 1 wrong call across all items",
 brief:"You're the **Kafka platform on-call** this week. You open your laptop to six things waiting for you. Decide how urgent each one is and what you'd do first.\n\n- 🔴 **Drop everything**: customers or money affected now, or about to be\n- 🟠 **Today**: real risk, but there's time to plan\n- 🟡 **Backlog**: worth doing, not this week's emergency\n- ⚪ **Noise**: nothing to do",
 items:[
  {src:"PagerDuty", from:"alert · 08:52", t:"Consumer lag ledger-writer / payments.v2 p7: 412,000 and rising 1,100/s", body:"Other 11 partitions: lag < 200. Merchant balances on p7 are stale.", sev:"now", why:"Money-moving pipeline, customer-visible (stale balances), and **getting worse every second**. That's drop-everything.",
   act:{o:["Check the consumer pod for p7: restarts and «--previous» logs","Reset p7's offset to latest so lag goes to zero","Add 12 more partitions to spread the load"], a:0, why:"One stuck partition = look at its consumer and its data first (a crash loop on a poison message is the classic cause). Resetting skips real payments; adding partitions doesn't move existing data and breaks key ordering."}},
  {src:"Alert", from:"kafka-prod · 08:40", t:"UnderReplicatedPartitions = 18 (broker 3) for 12 minutes", body:"Topics: payments.v2, audit-log. RF=3, min.insync.replicas=2. Broker 3 CPU 98%.", sev:"now", why:"18 partitions are down to 2 in-sync replicas. With «min.insync.replicas=2», **one more broker problem and producers using acks=all start failing**. Sustained URPs on payment topics are urgent.",
   act:{o:["Look at broker 3: disk, network, GC and what's eating CPU","Restart all brokers to clear it","Lower min.insync.replicas to 1 so producers never fail"], a:0, why:"Find why broker 3's replicas can't keep up (a full disk, a bad NIC, a runaway client, long GC). A blind rolling restart of everything risks more URPs; lowering min ISR trades the outage for possible **data loss**."}},
  {src:"Email", from:"cert-bot · Sun 23:00", t:"TLS certificate for kafka.payu.internal expires in 9 days", body:"Clients connecting over SSL will fail after expiry.", sev:"today", why:"Not broken yet, but a hard deadline with total outage if missed. Get it **planned today** while there's slack.",
   act:{o:["Open a change ticket and schedule the rotation this week, including client truststores","Ignore it: cert-bot always nags","Rotate it right now in production without a change window"], a:0, why:"Plan it: check which clients pin the cert or CA, roll the new cert to brokers one at a time, and verify. No need for a cowboy change on a Monday morning."}},
  {src:"Alert", from:"kafka-prod · 07:15", t:"Broker 2 disk usage 71% (warning at 70%)", body:"Growth: ~1% per day over the last 30 days. Retention: 7 days on most topics.", sev:"later", why:"At 1%/day you have **weeks**, not hours. Worth a capacity ticket, not an interruption.",
   act:{o:["Create a capacity ticket: review retention and the growth trend, plan storage","Delete old log segments by hand to get under 70%","Silence the alert permanently"], a:0, why:"Plan capacity calmly: which topics grew, whether retention fits the need, tiered storage, or more disk. Never delete segment files by hand, and don't silence a capacity alert."}},
  {src:"Jira", from:"PAY-2291 · growth team", t:"Increase merchant-events partitions from 6 to 24 before the sale on the 28th", body:"\"Consumers can't keep up during peaks.\"", sev:"later", why:"A planned change for a date two weeks out. Important, but it needs design, not urgency.",
   act:{o:["Ask whether consumers rely on per-key ordering, then plan the change","Do it now: it's a one-line command","Reject it: partitions can never be changed"], a:0, why:"Adding partitions changes which partition each key hashes to, so **per-key ordering breaks** for in-flight keys during the switch. Check the consumers, plan a quiet window, or create a new topic and migrate."}},
  {src:"Slack", from:"#data-help · analyst", t:"\"Kafka UI shows clickstream-dev has had 0 messages since Friday. Is Kafka broken?\"", body:"«clickstream-dev» is a dev topic; the dev app is switched off at weekends.", sev:"noise", why:"A dev topic with no producer at the weekend is **expected**. Reply kindly and move on.",
   act:{o:["Reply: it's a dev topic and the dev app is off at weekends","Open an incident for Kafka being broken","Restart the dev cluster just in case"], a:0, why:"A quick, kind explanation closes it. Maybe point them to the prod topic they actually wanted."}}
 ],
 deep:[
  {t:"Severity = impact × urgency", md:"| | Getting worse fast | Stable / has a deadline |\n|---|---|---|\n| **Customers or money affected** | 🔴 Now | 🟠 Today |\n| **Risk, not yet impact** | 🟠 Today (or 🔴 if one more failure = outage) | 🟡 Backlog |\n| **No real impact** | 🟡 / ⚪ | ⚪ |\n\nAsk three questions: **who is affected**, **how badly**, and **is it getting worse**. Lag that's growing on a payment topic beats a disk at 71% growing 1% a day, even though both are \"warnings\"."},
  {t:"Under-replicated partitions and min.insync.replicas", md:"- Each partition has a leader and followers; the **ISR** (in-sync replicas) is the set that's caught up.\n- A partition is **under-replicated** when ISR < replication factor.\n- With «acks=all», a write succeeds only if at least **min.insync.replicas** replicas have it. RF=3, min ISR=2 survives **one** broker loss without failing writes or losing data.\n- Persistent URPs mean you've already used that one-failure buffer. Common causes: a slow disk, network saturation, a broker overloaded by a client, or long GC pauses."},
  {t:"Alert hygiene", md:"- Every page should be **actionable** and **urgent**. If the right response is \"look at it this week\", it's a ticket, not a page.\n- Alert on **symptoms users feel** (lag growing, error rates, freshness) more than causes (CPU).\n- Capacity alerts should predict time-to-full, not fire at a fixed percentage.\n- Every noisy alert you ignore trains you to ignore the next real one."}
 ],
 say:"I triage by impact times urgency: who is affected, how badly, and whether it's getting worse. A growing lag on a payments topic or sustained under-replicated partitions are page-worthy; a cert expiring in nine days is today's planned work; slow disk growth is a capacity ticket."
}
]);
