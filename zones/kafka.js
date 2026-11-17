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
