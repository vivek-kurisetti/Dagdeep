QUEST.deep("kafka", {
"A topic is a set of logs": {
d: `A **topic** is a name; the real storage unit is the **partition**. Each partition is an ordered, append-only log stored on a broker's disk. Producers only ever append to the end; every record gets the next **offset** (0, 1, 2...). Offsets are per partition, so "offset 500" means nothing without the partition number.

Reading never removes data. Each consumer just remembers "I'm at offset N" and asks for records from N onwards. That's why ten different services can read the same topic at their own pace, and why you can **replay** history by resetting an offset. Data leaves only when **retention** deletes old segments.

Ordering is guaranteed **within** a partition, never across partitions. More partitions = more parallelism, but no global order.`,
life: `A bank passbook per account. New entries are only added at the bottom, each line has a number, and reading your passbook doesn't erase lines. The branch keeps many passbooks (partitions) so many tellers can write at once.`,
work: `PayU-style payment events go into «payments» with 24 partitions. The fraud service, ledger service and the lake loader all read the same topic independently. When the lake loader had a bug, the team fixed it and **reset its consumer group offsets to yesterday 00:00**; it re-read 30 M events without the other services noticing.`,
ex: `kafka-topics.sh --create --topic payments --partitions 24 \\
  --replication-factor 3 --bootstrap-server b1:9092
kafka-console-consumer.sh --topic payments --partition 3 \\
  --offset 1000 --bootstrap-server b1:9092     # replay from offset 1000`,
pit: [`Expecting global order across a topic with many partitions.`, `Treating Kafka like a queue where reading deletes messages.`, `Comparing offsets across partitions as if they were timestamps.`],
q: [`Two services read the same topic. Does one slow consumer delay the other?`, `No. Each tracks its own offsets; they read independently from the same log.`]
},
"Keys pick the partition": {
d: `The default partitioner computes «murmur2(keyBytes) % numPartitions». So every record with key «order-42» goes to the same partition and stays **in order** relative to other records for that key. That's how you get per-entity ordering (per user, per order, per account) while still scaling across partitions.

With a **null key**, the **sticky partitioner** fills a batch for one partition, then switches to another, spreading load without tiny batches.

Two big consequences: (1) **adding partitions remaps keys** (the modulo changes), so old and new events for one key can land in different partitions and lose ordering; (2) a hot key (one huge merchant) makes one partition hot (skew).`,
life: `Courier sorting by the last digits of a PIN code: every parcel for the same address always goes to the same delivery van, so they arrive in the order shipped. Add more vans and the mapping changes for many addresses.`,
work: `Order status events (CREATED → PAID → SHIPPED) were sent with no key. Consumers sometimes saw SHIPPED before PAID because they landed in different partitions. Setting the key to «order_id» fixed ordering. Later, someone raised partitions from 12 to 36 during a sale; for a few minutes some orders had events in two partitions and the downstream state machine flagged invalid transitions.`,
ex: `producer.send(new ProducerRecord<>("orders", order.getId(), json));
# Python
producer.produce("orders", key=str(order_id), value=payload)
# partition = murmur2(key) % 12`,
pit: [`Using null keys when order matters.`, `Increasing partitions on a keyed topic without planning a migration.`, `Using a low-cardinality key (e.g. country) and creating hot partitions.`],
q: [`Why may ordering per key break after adding partitions?`, `The partition is hash % count; changing the count sends new records for a key to a different partition than its older records.`]
},
"Retention vs compaction": {
d: `**cleanup.policy=delete** (default): whole **segments** older than «retention.ms» (default 7 days) or beyond «retention.bytes» per partition are deleted. Good for event streams: clicks, logs, payments history.

**cleanup.policy=compact**: Kafka keeps at least the **latest record per key**; older values for the same key are eventually removed. A record with a **null value** (tombstone) marks a key as deleted; the tombstone itself is removed after «delete.retention.ms». Good for "current state" topics: CDC changelogs, user profiles, config, Kafka Streams state.

You can combine «compact,delete» to keep latest per key but also drop very old keys.`,
life: `Delete retention is a CCTV recorder that overwrites footage older than 7 days. Compaction is a phone's contact list: you keep only the latest number per person, and deleting a contact removes them.`,
work: `A «customer_profile» CDC topic used delete retention of 7 days. A new service started 10 days later and couldn't rebuild profiles for customers who hadn't changed recently. Switching to «cleanup.policy=compact» meant any new consumer could read from the beginning and get the latest state for every customer.`,
ex: `kafka-configs.sh --alter --entity-type topics --entity-name customer_profile \\
  --add-config cleanup.policy=compact,min.cleanable.dirty.ratio=0.3,delete.retention.ms=86400000 \\
  --bootstrap-server b1:9092`,
pit: [`Compacted topic without keys (compaction needs keys).`, `Expecting compaction to be immediate: the active segment is never compacted.`, `Sending tombstones and consumers that read slower than delete.retention.ms missing the delete.`],
q: [`What does a record with key K and a null value do on a compacted topic?`, `It's a tombstone: it deletes key K; after compaction and delete.retention.ms both the old values and the tombstone disappear.`]
},
"Leaders and followers": {
d: `Each partition has **replication.factor** copies on different brokers. One is the **leader**: producers write to it and (by default) consumers read from it. **Followers** continuously fetch from the leader. Followers that are caught up within «replica.lag.time.max.ms» (30 s) are in the **ISR** (in-sync replica set).

With «acks=all», the leader acknowledges a write only once all ISR members have it. «min.insync.replicas» (commonly 2 with RF=3) says how many must be in the ISR for writes to be accepted; if the ISR shrinks below that, producers get «NotEnoughReplicas» rather than risk losing data.

If the leader's broker dies, the controller elects a new leader **from the ISR**, so no acknowledged write is lost.`,
life: `A head clerk writes in the master ledger and two assistants copy each entry. A payment is confirmed only when both assistants have copied it. If the head clerk falls sick, an assistant who's fully up to date takes over.`,
work: `Topic «payments»: RF=3, min.insync.replicas=2, acks=all. During a broker patch, one replica was offline; writes continued (ISR=2). When a second broker had a disk failure, ISR dropped to 1 and producers got «NotEnoughReplicasException», pausing payments rather than accepting writes that could be lost. The alert on «UnderMinIsrPartitionCount» paged on-call.`,
ex: `kafka-topics.sh --describe --topic payments --bootstrap-server b1:9092
# Partition: 0 Leader: 2 Replicas: 2,3,1 Isr: 2,3
kafka-configs.sh --alter --entity-type topics --entity-name payments \\
  --add-config min.insync.replicas=2`,
pit: [`acks=all with min.insync.replicas=1 (one replica can still be the only copy).`, `RF=2 with min ISR 2: any broker restart blocks writes.`, `Ignoring under-replicated partition metrics.`],
q: [`RF=3, min.insync.replicas=2, acks=all. How many broker failures can you survive without losing acknowledged data and still write?`, `One. With two down, ISR=1 < 2, so writes are rejected (but no acked data is lost).`]
},
"Unclean leader election": {
d: `If the leader dies and **no ISR replica** is alive, the partition has a choice:
- «unclean.leader.election.enable=false» (default): stay **offline** until an ISR replica returns. No data loss, but no availability.
- «true»: elect an **out-of-sync** follower. The partition comes back immediately, but any records it hadn't copied are **gone**, and when the old leader returns it truncates to match the new one.

This is the classic CAP trade-off for one partition. For payments, ledgers or CDC, keep it false. For metrics or logs where a few lost records are fine and uptime matters more, true can be acceptable.`,
life: `The only accountant who knows today's entries is unreachable. Either the office closes until she's back (safe), or someone with last week's copy takes over now and today's entries are simply lost.`,
work: `After a rack power failure, 4 partitions of a «clickstream» topic were offline because both ISR replicas were in the failed rack. Since clicks are analytics-only, on-call temporarily enabled unclean election for that topic, accepting ~2 minutes of lost clicks to restore ingestion. For «payments» it stayed disabled, and the team instead fixed rack-aware replica placement («broker.rack»).`,
ex: `# topic-level override (emergency, analytics topic only)
kafka-configs.sh --alter --entity-type topics --entity-name clickstream \\
  --add-config unclean.leader.election.enable=true
# rack awareness so replicas spread across racks/AZs
broker.rack=ap-south-1a`,
pit: [`Enabling it cluster-wide "for availability".`, `All replicas of a partition in one AZ/rack.`, `Forgetting to turn the override off after an incident.`],
q: [`What exactly is lost with an unclean election?`, `Records the old leader had (even acknowledged ones with weaker acks) that the newly elected out-of-sync replica never copied.`]
},
"Batching is throughput": {
d: `Producers don't send records one by one. They append to a **per-partition batch**. A batch is sent when it reaches «batch.size» (16 KB default) or when «linger.ms» has passed (5 ms default in Kafka 3.x clients; 0 in older ones). Compression («compression.type»: lz4, zstd, snappy, gzip) is applied **per batch**, so bigger batches compress much better.

Trade-off: larger batches and longer linger raise throughput and cut broker CPU and network, at the cost of a few ms of latency. «buffer.memory» (32 MB) caps total memory for unsent batches; when full, «send()» blocks up to «max.block.ms».

Typical high-throughput settings: «linger.ms=10–50», «batch.size=64–256 KB», «compression.type=zstd» or «lz4».`,
life: `A delivery van waits a few minutes to fill up before leaving instead of driving off with one parcel each time. Packing parcels tightly (compression) fits even more in.`,
work: `A log shipper sent 200k msgs/s with linger 0 and no compression: brokers at 85% CPU handling ~40k tiny requests/s, network 900 Mbps. With «linger.ms=20», «batch.size=256KB», «compression.type=zstd», requests dropped 30×, network to 180 Mbps (5× compression on JSON) and p99 latency rose from 4 ms to 25 ms, acceptable for logs.`,
ex: `props.put("linger.ms", "20");
props.put("batch.size", 262144);
props.put("compression.type", "zstd");
props.put("buffer.memory", 67108864);
props.put("acks", "all");`,
pit: [`Tiny batches on high-volume topics (broker CPU melts).`, `Large linger on latency-critical flows (e.g. OTP events).`, `Compressing with gzip on CPU-bound producers; prefer lz4/zstd.`],
q: [`Why does compression ratio improve with bigger batches?`, `Compression works per batch; more similar records together give the compressor more repeated patterns to exploit.`]
},
"Idempotent producer": {
d: `Retries can create duplicates: the broker writes a batch, the ack is lost, the producer retries, and the batch is written twice. With «enable.idempotence=true» (default since Kafka 3.0 clients), the broker gives the producer a **Producer ID (PID)** and the producer tags each batch with a **sequence number** per partition. The broker remembers the last sequence numbers per PID-partition and **drops duplicates**; out-of-order sequences are rejected.

Requirements: «acks=all», «retries > 0», «max.in.flight.requests.per.connection ≤ 5». Order is preserved even with 5 in flight.

Limit: it only dedupes **within one producer session** and one partition. If your app restarts and re-sends the same business event, that's a new PID and a new record. For cross-session safety use transactions, or idempotent consumers.`,
life: `Every cheque has a serial number. If the bank receives cheque #105 twice because the courier wasn't sure it arrived, it cashes it once and ignores the duplicate.`,
work: `During a network blip, a producer without idempotence retried and wrote ~3,000 duplicate payment events; the ledger consumer double-counted ₹4.2 L until reconciliation caught it. After enabling idempotence (and making the ledger dedupe on «payment_id»), retries no longer produced duplicates in the log.`,
ex: `props.put("enable.idempotence", "true");
props.put("acks", "all");
props.put("max.in.flight.requests.per.connection", "5");
props.put("retries", Integer.MAX_VALUE);
props.put("delivery.timeout.ms", 120000);`,
pit: [`Assuming idempotence makes the whole pipeline exactly-once.`, `Overriding acks=1, which silently disables idempotence in some clients.`, `App-level resends after a crash still duplicate; dedupe by business id downstream.`],
q: [`Does the idempotent producer stop duplicates if the application restarts and re-sends the same event?`, `No. The new session has a new PID; the broker can't recognise it as a duplicate. You need transactions or downstream dedupe.`]
},
"Transactions": {
d: `A **transactional producer** («transactional.id» set) can write to many partitions and **commit consumer offsets** in one atomic unit: either all of it becomes visible or none of it does. This enables **exactly-once** for read-process-write pipelines within Kafka: consume from A, write to B, commit A's offsets inside the same transaction.

Consumers must use «isolation.level=read_committed» to skip records from aborted transactions and wait for open ones (they read up to the **LSO**, last stable offset). The «transactional.id» also **fences** zombie producers: if an old instance comes back, its epoch is older and its writes are rejected.

Exactly-once stops at Kafka's edge: writing to Postgres or S3 needs its own idempotent/transactional mechanism.`,
life: `A bank transfer: debit from one account and credit to another must both happen or neither. Nobody sees money "in flight". And if an old teller session wakes up late, its stamp is no longer valid.`,
work: `A Kafka Streams app converting «payments» to «ledger_entries» used at-least-once; after a rebalance, some entries appeared twice. Switching to «processing.guarantee=exactly_once_v2» removed duplicates; consumer lag added ~100 ms latency because read_committed consumers wait for commits.`,
ex: `producer.initTransactions();
producer.beginTransaction();
producer.send(new ProducerRecord<>("ledger", k, v));
producer.sendOffsetsToTransaction(offsets, consumer.groupMetadata());
producer.commitTransaction();     // or abortTransaction()
// consumers: isolation.level=read_committed`,
pit: [`Consumers left at read_uncommitted see aborted data.`, `Reusing one transactional.id for many parallel instances (they fence each other).`, `Expecting exactly-once into an external DB without idempotent writes.`],
q: [`What prevents a "zombie" old producer instance from writing after a new one starts?`, `Fencing: the new instance bumps the epoch for the transactional.id; the coordinator rejects writes from the older epoch.`]
},
"Consumer groups share partitions": {
d: `Consumers with the same «group.id» form a **group**. Kafka assigns each partition to **exactly one** member, so the group processes the topic in parallel without duplicates. Different groups each get **all** the data.

The maximum useful parallelism is the **partition count**. 12 partitions, 4 consumers → 3 each; 12 consumers → 1 each; a 13th consumer gets nothing and sits idle (useful only as a hot standby).

So partition count is a capacity decision: plan for peak consumer parallelism (and remember changing it remaps keys). Within a consumer you can add threads, but you must keep per-partition order yourself.`,
life: `12 checkout counters (partitions) and a team of cashiers (group). Each counter has exactly one cashier. With 13 cashiers, one waits in the back room. A second shop (another group) gets its own copy of every customer.`,
work: `During Big Billion Day, lag on «order_events» grew to 2 M. The team scaled the consumer deployment from 12 to 24 pods, but lag didn't move: the topic had 12 partitions, so 12 pods were idle. They pre-created a new topic with 48 partitions for the next sale and migrated producers.`,
ex: `kafka-consumer-groups.sh --describe --group lake-loader --bootstrap-server b1:9092
# TOPIC  PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG  CONSUMER-ID
# orders 0          1203344         1203990         646  consumer-1-...`,
pit: [`Scaling consumers beyond partition count.`, `Using the same group.id for two different applications (they split the data).`, `Too few partitions chosen at creation for future peak.`],
q: [`Topic has 8 partitions; you run 3 consumers in a group. How are partitions split?`, `3, 3 and 2 (depending on the assignor); all 8 are covered by exactly one consumer each.`]
},
"Commit after processing": {
d: `A committed offset says "everything before this is done". **When** you commit decides your delivery guarantee:
- Commit **before** processing (or auto-commit that fires during processing): a crash loses the uncommitted work → **at-most-once**.
- Commit **after** processing: a crash replays some records → **at-least-once**.
- Atomic commit with output (Kafka transactions, or storing offsets in the same DB transaction as results) → **exactly-once** effect.

At-least-once is the common choice; make processing **idempotent** (upsert by key, dedupe table, unique constraint) so replays are harmless. Remember: you commit the offset of the **next** record to read (last processed + 1).`,
life: `Ticking an item on your to-do list before doing it vs after. Tick first and get interrupted → it's never done. Tick after → you might redo a task after an interruption, so make tasks safe to redo.`,
work: `A consumer with «enable.auto.commit=true» wrote to Postgres in batches of 500. A pod OOM-killed mid-batch after the 5-second auto-commit had fired: ~400 transactions never reached the DB. Fix: disable auto-commit, commit after the DB transaction succeeds, and use «INSERT ... ON CONFLICT (txn_id) DO NOTHING» for replays.`,
ex: `consumer = Consumer({"group.id": "ledger", "enable.auto.commit": False})
while True:
    msgs = consumer.consume(500, timeout=1.0)
    with db.transaction():
        for m in msgs:
            upsert(m)               # idempotent by txn_id
    consumer.commit(asynchronous=False)`,
pit: [`Auto-commit with async processing in other threads.`, `Committing per message synchronously (very slow).`, `Non-idempotent side effects (emails, payments) on replay.`],
q: [`You commit after processing and the consumer crashes before commit. What happens?`, `The records since the last commit are re-delivered and reprocessed; idempotent processing makes this safe.`]
},
"Rebalances and lag": {
d: `A **rebalance** redistributes partitions when group membership changes: a consumer joins, leaves, crashes, or **fails to call poll() within «max.poll.interval.ms»** (5 min default), which makes the coordinator think it's dead. Missing heartbeats within «session.timeout.ms» (45 s) also triggers it.

With the old **eager** protocol, every member stops and gives up all partitions during a rebalance: the whole group pauses. **Cooperative-sticky** only moves the partitions that need to move. **Static membership** («group.instance.id») lets a restarting pod rejoin without a rebalance.

**Lag** = log end offset − committed offset per partition. Growing lag means you consume slower than producers write. Watch it per partition: one lagging partition usually means a hot key or a stuck consumer.`,
life: `A team reassigning work every time someone takes a coffee break, with everyone stopping their work until the new plan is out. The sticky approach only reassigns the absent person's tasks.`,
work: `A consumer called an external API per record; slow responses made a batch of 500 take 7 minutes > max.poll.interval.ms. The member was kicked, a rebalance started, another pod got the partition and hit the same slow batch: a **rebalance storm** with lag climbing to 5 M. Fix: «max.poll.records=50», async API calls with timeouts, cooperative-sticky assignor, and static membership for rolling deploys.`,
ex: `max.poll.records=100
max.poll.interval.ms=300000
session.timeout.ms=45000
partition.assignment.strategy=org.apache.kafka.clients.consumer.CooperativeStickyAssignor
group.instance.id=lake-loader-pod-3`,
pit: [`Huge batches with slow processing exceeding max.poll.interval.ms.`, `Alerting on total lag only, missing a single stuck partition.`, `Rolling deploys without static membership causing repeated rebalances.`],
q: [`Logs show the consumer "left the group" every few minutes without crashing. Likely cause?`, `Processing a poll's batch takes longer than max.poll.interval.ms; reduce max.poll.records or speed up processing.`]
},
"Schema Registry": {
d: `Kafka stores bytes; it doesn't know your fields. **Schema Registry** stores versions of **Avro / Protobuf / JSON Schema** per **subject** (usually «<topic>-value»). The producer serializer registers or looks up the schema and writes a **5-byte header** (magic byte + 4-byte schema id) before the payload. Consumers fetch the schema by id and deserialize.

On each new version, the registry checks **compatibility**:
- **BACKWARD** (default): new consumers can read old data. You can delete fields or add fields **with defaults**.
- **FORWARD**: old consumers can read new data. You can add fields or delete fields that had defaults.
- **FULL**: both. **_TRANSITIVE** variants check against all past versions.

This blocks breaking changes at **produce time** instead of discovering them in a 3 AM consumer crash.`,
life: `A standard form at a government office. You can add an optional box (with "leave blank if not applicable"), but you can't suddenly rename "Date of birth" to "DOB year" and expect every clerk's process to still work.`,
work: `A team renamed «amount» to «amount_paise» in a JSON event without a registry: the lake loader wrote nulls for 6 hours. After moving to Avro with BACKWARD compatibility, the same change was rejected at deploy («409 incompatible»); they added «amount_paise» with a default instead and deprecated «amount» later.`,
ex: `{"type":"record","name":"Payment","fields":[
  {"name":"payment_id","type":"string"},
  {"name":"amount","type":"long"},
  {"name":"currency","type":"string","default":"INR"}   // new field with default
]}
curl -X PUT -H "Content-Type: application/json" \\
  -d '{"compatibility":"BACKWARD"}' http://registry:8081/config/payments-value`,
pit: [`Adding a field without a default under BACKWARD.`, `Renaming fields (that's delete + add).`, `Using NONE compatibility "temporarily".`],
q: [`Under BACKWARD compatibility, can you add a new required field with no default?`, `No. New readers couldn't fill that field when reading old records, so the registry rejects it.`]
},
"Event time and watermarks": {
d: `**Processing time** is when your job sees an event; **event time** is when it actually happened (a timestamp inside the event). Mobile apps, retries and network delays mean events arrive **late and out of order**, so correct windows ("payments per minute") must use event time.

A **watermark** is the processor's claim: "I don't expect events older than T anymore". It's typically «max event time seen − allowed lateness». When the watermark passes a window's end, the window is **finalized** and emitted, and its state can be dropped. Events that arrive after that are **late**: dropped, sent to a side output, or used to update results (depending on the engine).

Bigger lateness = more correct results but more state and more delay.`,
life: `A teacher collects exam papers. The exam ended at 1 PM (event time) but some students post papers by courier. She says "I'll wait until 3 PM for stragglers" (watermark); after that, papers are marked late.`,
work: `UPI success-rate per minute was computed on processing time; a 4-minute Kafka consumer lag made one minute show 0 transactions and the next 5×, triggering a false outage alert. Switching to event-time windows with a 2-minute watermark made the dashboard accurate; a side output counted late events (0.3%) for audit.`,
ex: `# Spark
(df.withWatermark("event_ts", "2 minutes")
   .groupBy(window("event_ts", "1 minute"), "bank")
   .agg(avg("success")))
-- Flink SQL
WATERMARK FOR event_ts AS event_ts - INTERVAL '2' MINUTE`,
pit: [`Using processing time for business metrics.`, `Huge allowed lateness causing unbounded state.`, `One idle partition holding back the watermark (configure idleness).`],
q: [`Why can an idle Kafka partition stall windows in Flink?`, `The watermark is the minimum across partitions; an idle partition's watermark never advances, so the combined watermark stays behind.`]
},
"A partition is a directory of segments": {
d: `On disk a partition is a folder like «payments-7/». It holds **segments**, each named by its base offset: «00000000000004500000.log» plus its **.index** (sparse offset → byte position), **.timeindex** (timestamp → offset), and sometimes «.txnindex» and «.snapshot». Only the last segment is **active** (being written).

A segment rolls when it hits «segment.bytes» (1 GB) or «segment.ms» (7 days). Retention and compaction work on **whole closed segments**, which is why a topic with low traffic may keep data longer than retention.ms: the active segment can't be deleted until it rolls.

Reads find the right segment by base offset, binary-search the sparse index, then scan forward a little. Recent data is usually served from the OS **page cache**, not disk.`,
life: `A diary split into notebooks: each notebook starts at a page number, has a small table of contents (index) for quick jumps, and only the current notebook is open for writing. Old notebooks are thrown away whole, never page by page.`,
work: `A low-traffic «audit» topic had retention.ms = 1 day but still held 6 days of data, worrying the compliance team. The reason: the active segment hadn't rolled (default segment.ms = 7 days). Setting «segment.ms=3600000» (1 hour) let retention delete data on time.`,
ex: `ls /var/kafka/data/payments-7/
00000000000000000000.index  00000000000000000000.log  00000000000000000000.timeindex
00000000000004500000.index  00000000000004500000.log  ...   leader-epoch-checkpoint
kafka-dump-log.sh --files 00000000000004500000.log --print-data-log | head`,
pit: [`Expecting retention to delete data inside the active segment.`, `Tiny segment.bytes creating huge numbers of files and open handles.`, `Deleting segment files by hand.`],
q: [`retention.ms is 1 hour but data from yesterday is still there. Why?`, `Data sits in the active segment, which only becomes deletable after it rolls (segment.ms / segment.bytes).`]
},
"How compaction actually runs": {
d: `The **log cleaner** threads pick the partition with the highest **dirty ratio** (bytes not yet compacted ÷ total) above «min.cleanable.dirty.ratio» (0.5). For the dirty section they build an in-memory **offset map**: key hash → latest offset (sized by «log.cleaner.dedupe.buffer.size»). Then they recopy the log segment by segment, keeping a record only if it is the latest for its key (or newer than the map's range), and swap in the cleaned segments.

Details that matter:
- The active segment is never cleaned.
- «min.compaction.lag.ms» guarantees records stay uncompacted for a minimum time (so consumers can see every change for a while).
- **Tombstones** are kept for «delete.retention.ms» after cleaning so slow consumers can see deletes.
- Offsets are preserved, so compacted logs have gaps.`,
life: `Spring-cleaning an old address book: you go through the pages with a list of each person's most recent entry and copy only those into a fresh book, leaving strike-through notes ("deleted") for a while so others learn about removals.`,
work: `A compacted CDC topic grew to 3 TB though only 200 GB of live keys existed. Cleaner logs showed the dedupe buffer was too small and one cleaner thread had died on an error ("uncleanable partition"). Raising «log.cleaner.dedupe.buffer.size» to 512 MB, adding threads, and restarting fixed it; the topic shrank to 260 GB.`,
ex: `log.cleaner.threads=2
log.cleaner.dedupe.buffer.size=536870912
min.cleanable.dirty.ratio=0.3
min.compaction.lag.ms=3600000
delete.retention.ms=86400000
# monitor: kafka.log:type=LogCleanerManager,name=max-dirty-percent`,
pit: [`Assuming compacted topics never grow: the cleaner can fall behind or die.`, `Not monitoring max-dirty-percent / cleaner thread health.`, `Consumers relying on contiguous offsets.`],
q: [`Why are offsets in a compacted topic not contiguous?`, `Compaction removes older records but keeps original offsets of survivors, leaving gaps.`]
},
"LEO and the high watermark": {
d: `Each replica has a **log end offset (LEO)**: the offset of the next record it would append. The leader tracks every follower's LEO from their fetch requests. The **high watermark (HW)** is the minimum LEO among ISR members: the highest point that's safely replicated.

Consumers can only read **below the HW**. Records above it exist on the leader but aren't "committed" yet; if the leader died now, they might not survive. With «acks=all», the producer's ack also waits until the HW passes its records.

After a leader change, followers truncate to the **leader epoch** boundary (not just the HW, a fix from KIP-101) so all replicas agree on history.`,
life: `A group project document where the "final" line only moves down once every co-author has synced their copy. Anyone reading the official version sees only up to that line.`,
work: `Consumers on a topic suddenly saw zero new data while producers kept succeeding with «acks=1». Investigation: a follower in the ISR was stuck (slow disk), so the HW didn't advance; consumers couldn't read past it. Once the follower dropped out of the ISR after replica.lag.time.max.ms, the HW moved and consumers caught up. Lesson: watch for slow followers and use acks=all to make the trade-off explicit.`,
ex: `# per-partition: leader LEO vs HW (via JMX)
kafka.log:type=Log,name=LogEndOffset,topic=payments,partition=0
kafka.cluster:type=Partition,name=UnderReplicated,...
# consumer side: highWatermark returned in fetch responses`,
pit: [`Thinking consumers see everything the leader has written.`, `Ignoring slow followers; they can delay consumers too.`, `Mixing up HW (replication) with the consumer's committed offset.`],
q: [`Can a consumer read a record that only the leader has?`, `No. Consumers read only up to the high watermark, which requires the record to be on all ISR members.`]
},
"Inside the producer": {
d: `«send()» is asynchronous. On the calling thread it: (1) fetches metadata if needed, (2) **serializes** key and value, (3) picks the **partition**, (4) appends the record to that partition's current batch in the **RecordAccumulator** (blocking if «buffer.memory» is full). Then it returns a Future.

A background **Sender** thread drains batches that are full or past «linger.ms», groups them by **destination broker**, and sends one ProduceRequest per broker containing batches for many partitions. At most «max.in.flight.requests.per.connection» requests are outstanding per broker. Responses complete Futures and fire callbacks; retriable errors (leader moved, timeouts) re-enqueue batches until «delivery.timeout.ms» (2 min) expires.`,
life: `A mailroom: clerks drop letters into per-destination trays (accumulator); a courier (sender thread) periodically takes full trays, bundles all trays going to the same city into one bag, and ships it.`,
work: `An API calling «producer.send(...).get()» per request had p99 of 40 ms and only 800 msg/s per pod, because each call waited for a round trip. Switching to async «send» with a callback and a periodic «flush()» on shutdown raised throughput to 25k msg/s per pod with the same latency for users.`,
ex: `producer.send(record, (meta, ex) -> {
    if (ex != null) log.error("send failed", ex);
});
// never: producer.send(record).get() in a hot loop
// on shutdown:
producer.flush(); producer.close(Duration.ofSeconds(10));`,
pit: [`Calling «.get()» on every send.`, `Ignoring callback errors (silent data loss).`, `Not calling flush/close on shutdown, losing buffered records.`],
q: [`What happens when buffer.memory is full?`, `send() blocks up to max.block.ms waiting for space; then it throws a TimeoutException.`]
},
"How transactions work inside": {
d: `Each «transactional.id» maps to a **transaction coordinator**: the broker leading the matching partition of the internal topic «__transaction_state». The flow:
1. «initTransactions»: get PID + **epoch** (bumped, fencing older instances).
2. Before writing to a new partition: «AddPartitionsToTxn» so the coordinator knows which partitions are involved.
3. Records are written normally to those partitions (marked transactional).
4. «sendOffsetsToTransaction»: consumer offsets added via the group coordinator.
5. «commitTransaction»: coordinator writes PREPARE_COMMIT to its log, then writes **COMMIT control markers** into every involved partition, then COMPLETE_COMMIT.

read_committed consumers stop at the **LSO** (first offset of an open transaction) and filter aborted records using the **.txnindex** of aborted ranges.`,
life: `A wedding planner coordinating caterer, decorator and venue. She first notes "these vendors are involved", lets them prepare, then sends everyone the "go" signal together. Guests only see the event once every vendor got the go signal.`,
work: `A Kafka Streams app with exactly-once showed read_committed consumers lagging by minutes. One instance had a long-running transaction (stuck in a slow state store restore) holding the **LSO** back for all partitions it wrote to. Lowering «transaction.timeout.ms» and fixing the restore made the coordinator abort stuck transactions quickly.`,
ex: `kafka-transactions.sh --bootstrap-server b1:9092 list
kafka-transactions.sh describe --transactional-id payments-app-0
# hanging transaction abort (KIP-664 tooling)
kafka-transactions.sh abort --topic ledger --partition 3 --start-offset 98213`,
pit: [`Long transactions blocking read_committed consumers (LSO stuck).`, `transaction.timeout.ms larger than broker's transaction.max.timeout.ms.`, `Thinking control markers are invisible: they take offsets too.`],
q: [`Why can one slow transaction delay unrelated consumers of a partition?`, `read_committed consumers can't read past the LSO, which is the start of the oldest open transaction in that partition.`]
},
"Classic rebalance protocol": {
d: `In the classic group protocol:
1. Members send **JoinGroup** to the **group coordinator** (the broker owning the group's partition of «__consumer_offsets»).
2. The coordinator waits for members, then picks one as **group leader** and sends it the member list and their subscriptions.
3. The leader runs the **assignor** client-side (range, round-robin, sticky, cooperative-sticky).
4. Everyone sends **SyncGroup**; the leader's includes the assignment, which the coordinator hands out.

**Eager**: all members revoke all partitions before rejoining, stop-the-world. **Cooperative (incremental)**: members keep partitions that stay theirs; a second rebalance round moves the rest. The newer **KIP-848** protocol («group.protocol=consumer», Kafka 4.0) moves assignment to the broker and removes the global sync barrier.`,
life: `Old way: every time a new waiter joins, all waiters hand back their tables and the head waiter reassigns everything. New way: only a few tables change hands while everyone else keeps serving.`,
work: `A 60-consumer group took 90 s to rebalance on every deploy with eager range assignment, and lag spiked by 3 M each time. Moving to cooperative-sticky (two-step rolling upgrade of the assignor config) and static membership cut pauses to a few seconds and avoided rebalances on pod restarts.`,
ex: `# migrate eager -> cooperative in two rolling restarts
partition.assignment.strategy=CooperativeStickyAssignor,RangeAssignor   # step 1
partition.assignment.strategy=CooperativeStickyAssignor                 # step 2
# Kafka 4.x new protocol
group.protocol=consumer`,
pit: [`Switching directly from eager to cooperative in one deploy (mixed protocols break).`, `Huge groups with eager rebalancing.`, `Thinking the broker computes assignments in the classic protocol.`],
q: [`Who computes the partition assignment in the classic protocol?`, `The group leader, one of the consumers, using the configured client-side assignor.`]
}
});
