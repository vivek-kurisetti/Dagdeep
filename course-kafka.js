// Course: Kafka & Streaming, played.
(function(){
const COURSES = window.COURSES = window.COURSES || {};
const LABS = window.COURSE_LABS, U = window.COURSE_UTIL;

COURSES.kafka = {
id:"kafka", order:3, level:"Intermediate", hue:175, hours:3.5,
title:"Kafka & Streaming, played",
short:"Partitions, ordering, durability, consumer groups, delivery guarantees, watermarks and exactly-once.",
tagline:"Produce, consume, crash brokers, kill consumers and replay history. Build intuition for how streaming systems keep data ordered, durable and correct.",
story:"Paydesk is moving from nightly batches to real time. Payment events must reach fraud checks in seconds and the lakehouse in minutes, without losing or duplicating a single one. You're building it.",
units:[
{title:"The log", hue:175, desc:"Topics, partitions, keys, replication.",
items:[
{id:"1", title:"Topics, partitions and offsets", mins:7, lab:"logPlayground", labTitle:"Log playground",
sum:"A Kafka topic is a set of append-only logs. Consumers track their own position, so they can read at their own pace and replay history.",
mission:"Get a feel for the log: produce payment events, consume them, then rewind and read them again.",
challenge:"Produce at least 12 events, consume all of them, then replay one partition from the start.",
body:`## The log
A **topic** is split into **partitions**. Each partition is an ordered, append-only sequence of records. Every record gets an **offset**: its position in that partition (0, 1, 2…). Records are not deleted when read; they stay until retention removes old segments (after 7 days, say, or when the log exceeds a size).

:::flow Producing and consuming
Producer sends a record :: with an optional key
Partitioner picks a partition :: hash(key) % partitions, or spread if no key
Broker appends it :: next offset in that partition
Consumer polls from its offset :: reads records in order
Consumer commits its position :: so it can resume after a restart
:::

## Why this design is powerful
- **Many readers:** fraud checks, the lakehouse loader and analytics can all read the same topic independently, each at its own offset.
- **Replay:** reset an offset to reprocess history after fixing a bug.
- **Speed:** appends and sequential reads are extremely fast; Kafka leans on the OS page cache.
- **Decoupling:** producers don't know or care who consumes.

| Concept | Meaning |
|---|---|
| Topic | A named stream, e.g. payments |
| Partition | One ordered log; the unit of parallelism |
| Offset | A record's position in its partition |
| Retention | How long records are kept (time or size) |
| Consumer offset | Where a consumer group is in each partition |`,
take:["Topics are made of partitions; each partition is an ordered log.","Offsets are positions; consumers track their own.","Records stay until retention, so replay is just moving an offset."]},

{id:"2", title:"Keys and ordering", mins:7, lab:"orderingGame", labTitle:"Ordering game",
sum:"Kafka only orders records within a partition. Your choice of key decides what stays in order, and how evenly load spreads.",
mission:"Fraud checks receive 'paid' before 'created' for some orders. Choose a key so each order's events arrive in sequence.",
challenge:"Pick a key that keeps every order's events in order and spreads load evenly.",
body:`## Order is per partition
Records in one partition are read in the order they were written. Records in different partitions are read in parallel, by different consumers, at different speeds: **there is no order across partitions**.

:::lanes Choosing the key
# No key
Records spread round-robin or by sticky batches :: good balance
Events for one order land in different partitions :: order is lost
# Key = order_id
Same order → same partition :: its events stay in sequence
Many distinct orders :: load spreads evenly
# Key = event_type
All "paid" events in one partition :: one hot partition
created and paid for the same order are split :: order is lost
:::

## Rules of thumb
- Key by the **entity whose events must stay in order**: order_id, account_id, card_id.
- The key needs **many distinct values** so partitions get similar load.
- Watch for **hot keys** (one giant merchant): one partition can become a bottleneck.
- **Changing the partition count** changes hash(key) % n, so a key's future events can land in a new partition. Plan partition counts up front.

:::note Retries can reorder too
With retries and several in-flight requests, a failed batch could be retried after a later one succeeded. The idempotent producer (on by default in modern clients) prevents both duplicates and reordering within a partition.
:::`,
take:["Kafka orders records only within a partition.","Key by the entity that needs ordering, with many distinct values.","Changing partition counts remaps keys."]},

{id:"3", title:"Replication and acks", mins:8, lab:"durability", labTitle:"Broker crash test",
sum:"Durability comes from replicas plus the right producer acknowledgement settings.",
mission:"A broker will be unplugged mid-traffic. Configure the topic and producer so no acknowledged payment is ever lost, and writes keep flowing.",
challenge:"Survive a leader crash with zero lost payments while still accepting writes when one broker is down.",
body:`## Leaders, followers and the ISR
Each partition has one **leader** broker and some **followers** (replication factor 3 means three copies). Followers copy the leader's log. Followers that are caught up form the **in-sync replicas (ISR)**.

:::flow A write with acks=all
Producer sends to the leader :: the only broker that accepts writes for the partition
Leader appends :: to its log
Followers fetch the record :: they replicate continuously
All in-sync replicas have it :: the high watermark advances
Leader acknowledges :: only now is the write "committed"
:::

## The three settings that decide durability
| Setting | Options | Effect |
|---|---|---|
| replication.factor | 1, 2, 3 | Copies of each partition |
| acks (producer) | 0, 1, all | Wait for nothing, the leader, or all in-sync replicas |
| min.insync.replicas | 1, 2, 3 | Fewest in-sync replicas allowed for an acks=all write |

:::lanes What can go wrong
# acks=1
Leader writes and acknowledges :: followers haven't copied yet
Leader crashes :: a follower becomes leader
The acknowledged record is gone :: silent data loss
# min.insync.replicas = RF
All three replicas must be in sync :: strong
One broker goes down :: writes are rejected
Producers fail :: an outage, not data loss
:::

The standard safe setup is **replication factor 3, acks=all, min.insync.replicas=2**: every acknowledged write is on at least two brokers, and one broker can be down without stopping writes.`,
take:["Replicas give copies; the ISR is the set that's caught up.","acks=all + min.insync.replicas=2 + RF=3 is the safe default.","acks=1 can lose acknowledged data on leader failure."]},

{id:"q1", kind:"quiz", title:"Checkpoint: the log", mins:3,
questions:[
 {q:"Where does Kafka guarantee ordering?", o:["Across the whole topic","Within a partition","Within a broker","Nowhere"], a:1, e:"Records in one partition are consumed in write order; there's no cross-partition order."},
 {q:"Order events must stay in sequence per order. Best key?", o:["No key","order_id","event_type","timestamp"], a:1, e:"Same order → same partition, and many distinct orders spread the load."},
 {q:"What happens to records after they're consumed?", o:["Deleted immediately","Kept until retention expires","Moved to another topic","Compressed"], a:1, e:"Consumption doesn't delete anything; retention does."},
 {q:"acks=1 and the leader crashes right after acknowledging. Risk?", o:["None","The acknowledged record can be lost","Duplicate records","Consumers stop"], a:1, e:"Followers may not have copied it yet, so a new leader won't have it."},
 {q:"RF=3, acks=all. Which min.insync.replicas survives one broker down AND keeps writes durable?", o:["1","2","3","0"], a:1, e:"2 keeps two copies of every write and still allows writes with one broker missing."}
]}
]},

{title:"Consumers", hue:215, desc:"Groups, offsets, delivery guarantees and schemas.",
items:[
{id:"4", title:"Consumer groups and scaling", mins:7, lab:"groupBalancer", labTitle:"Group balancer",
sum:"Consumers in a group share partitions. Partition count caps your parallelism.",
mission:"Payment traffic tripled and the fraud consumer is falling behind. Scale it without leaving consumers idle.",
challenge:"Keep up with 6,000 events/s with no idle consumers.",
body:`## How a group splits the work
All consumers with the same «group.id» share a topic's partitions. **Each partition goes to exactly one consumer in the group**; a consumer can own several partitions.

:::flow What happens when you add a consumer
New consumer joins :: it announces itself to the group coordinator
Rebalance :: partitions are reassigned across members
Each partition has one owner :: owners resume from committed offsets
Extra consumers beyond the partition count :: sit idle
:::

## Parallelism and lag
- Max useful consumers in a group = number of partitions.
- **Lag** = latest offset − committed offset. Growing lag means consumers can't keep up.
- A consumer's throughput is limited by its processing (DB writes, API calls), so you scale by adding partitions *and* consumers.

| Partitions | Consumers | Result |
|---|---|---|
| 6 | 3 | Each consumer handles 2 partitions |
| 6 | 6 | One partition each: maximum parallelism |
| 6 | 8 | 2 consumers idle |

## Rebalances
Every join, leave or missed heartbeat triggers a rebalance. With the older eager protocol, everyone pauses. **Cooperative rebalancing** moves only the partitions that need to move, and **static membership** avoids rebalances when a consumer restarts quickly. If processing a batch takes longer than «max.poll.interval.ms», the consumer is kicked out and its partitions are reprocessed elsewhere.`,
take:["One partition → one consumer per group.","Partition count caps consumer parallelism.","Rising lag means you need faster processing or more partitions and consumers."]},

{id:"5", title:"Offsets and delivery guarantees", mins:9, lab:"crashLab", labTitle:"Crash lab",
sum:"When you commit offsets relative to processing decides whether a crash loses data, duplicates it, or neither.",
mission:"The payments loader crashes during a batch every few days. Some payments vanish from the database; others appear twice. Fix both.",
challenge:"After a crash mid-batch, end with exactly the 10 payments in the database, no missing rows and no duplicates.",
body:`## Three delivery guarantees
:::lanes Where the commit happens
# At most once
Commit the offset :: first
Process the batch :: crash here
After restart :: the batch is skipped, data is lost
# At least once
Process the batch :: write to the database
Commit the offset :: crash before this
After restart :: the batch is processed again, duplicates
# Effectively once
Process with an idempotent write :: upsert by payment_id
Commit the offset :: crash before this
After restart :: reprocessing overwrites the same rows, no duplicates
:::

## How to get "exactly once" in practice
1. **At-least-once + idempotent writes.** The most common pattern: upsert by a unique key (payment_id), or dedupe by event ID. Replays are harmless.
2. **Transactions.** In Kafka-to-Kafka pipelines, a transactional producer writes output records and consumer offsets atomically; downstream reads with «isolation.level=read_committed».
3. **Two-phase commit sinks.** Stream processors like Flink commit output (for example an Iceberg snapshot) together with checkpointed offsets.

:::warn Auto-commit
«enable.auto.commit=true» commits on a timer, independent of whether you finished processing. A crash can lose records committed but not yet processed, or reprocess ones processed but not yet committed. Commit manually after processing for anything important.
:::`,
take:["Commit before processing = may lose data; after = may duplicate.","Make writes idempotent so duplicates are harmless.","Avoid auto-commit for important data."]},

{id:"6", title:"Schemas and evolution", mins:7, lab:"schemaCompat", labTitle:"Compatibility judge",
sum:"Producers and consumers change at different times. Schema rules decide which changes are safe.",
mission:"Six schema changes are queued from the payments team. Approve the safe ones before they break the fraud service.",
challenge:"Judge at least 5 of 6 changes correctly under backward compatibility.",
body:`## Why schemas
Without a schema, a producer renaming «amount» to «amt» silently breaks every consumer. A **schema registry** stores versioned schemas (Avro, Protobuf, JSON Schema) and rejects incompatible changes before they're deployed.

## Compatibility modes
| Mode | Meaning | Who upgrades first |
|---|---|---|
| Backward | New schema can read data written with the old one | Consumers |
| Forward | Old schema can read data written with the new one | Producers |
| Full | Both | Either |

:::flow A backward-compatible rollout
Change the schema :: e.g. add currency with default "INR"
Registry checks compatibility :: against the latest version
Upgrade consumers :: they can read old and new data
Upgrade producers :: start writing the new field
:::

## Safe and unsafe changes (Avro, backward)
| Change | Safe? |
|---|---|
| Add a field with a default | Yes |
| Add a field without a default | No: new readers can't fill it for old data |
| Remove a field | Yes: new readers simply ignore it |
| Rename a field | No (unless you add an alias) |
| Widen int → long | Yes (Avro promotes it) |
| Change string → int | No |`,
take:["A schema registry blocks breaking changes.","Backward compatibility: new readers handle old data.","Add fields with defaults; don't rename or change types."]},

{id:"q2", kind:"quiz", title:"Checkpoint: consumers", mins:3,
questions:[
 {q:"8 partitions, 10 consumers in one group. What happens?", o:["All 10 share evenly","8 work, 2 idle","Error","Partitions are split"], a:1, e:"Each partition has one owner per group; extras are idle."},
 {q:"You commit offsets before writing to the DB, then crash. Result?", o:["Duplicates","Lost records","Nothing","Rebalance only"], a:1, e:"The offset says done, but the write never happened."},
 {q:"Simplest way to make at-least-once safe?", o:["Auto-commit","Idempotent writes (upsert by key)","More partitions","acks=0"], a:1, e:"Reprocessing then overwrites the same rows instead of duplicating."},
 {q:"Backward-compatible change?", o:["Rename amount → amt","Add currency with default INR","Change amount from double to string","Add a required field with no default"], a:1, e:"Old data can be read with the default filled in."},
 {q:"Lag is growing on every partition. First move?", o:["Add consumers up to the partition count","Lower retention","Switch acks to 0","Delete the topic"], a:0, e:"More consumers (and partitions if needed) add processing capacity."}
]}
]},

{title:"Stream processing", hue:265, desc:"Event time, state, checkpoints and exactly-once into the lake.",
items:[
{id:"7", title:"Event time and watermarks", mins:9, lab:"watermarkGame", labTitle:"Watermark tuner",
sum:"Events arrive late and out of order. Watermarks decide when a window is complete enough to emit.",
mission:"The live GMV dashboard shows wrong per-minute totals whenever mobile clients reconnect. Window by event time and tune the watermark.",
challenge:"Count at least 95% of events in the right window with results ready within 3 minutes.",
body:`## Event time vs processing time
**Event time** is when the payment happened. **Processing time** is when your job sees it. Mobile apps going offline, network retries and backlogs after outages create gaps of seconds to hours. Windows based on processing time put late events in the wrong bucket.

## Watermarks
A watermark says: "I believe all events up to time T have arrived." A common strategy is **max event time seen − allowed delay**.

:::flow A 5-minute tumbling window with a 2-minute watermark delay
Events arrive out of order :: 10:01, 10:04, 10:02, 10:06…
Watermark = max event time − 2 min :: e.g. 10:06 − 2 min = 10:04
Window 10:00-10:05 stays open :: until the watermark passes 10:05
Watermark reaches 10:05 :: the window emits its result
Later events for that window :: are "late": dropped, side-output, or used to update
:::

## The trade-off
| Bigger delay | Smaller delay |
|---|---|
| Fewer late events | More late events |
| Results arrive later | Results arrive sooner |
| More state held in memory | Less state |
Pick the delay from the lateness you actually observe (for example the 95th or 99th percentile), and handle the rest with allowed lateness, a side output, or a nightly batch correction.

:::note Idle partitions stall watermarks
An operator's watermark is the minimum across its inputs. If one Kafka partition receives no data, its watermark never advances and windows never close. Configure idleness detection on the source.
:::`,
take:["Window by event time for correct business results.","Watermark delay trades completeness against latency.","Handle stragglers with allowed lateness, side outputs or batch correction."]},

{id:"8", title:"State and checkpoints", mins:8, lab:"checkpointSim", labTitle:"Checkpoint tuner",
sum:"Stateful jobs snapshot their state and Kafka offsets together, so a crash replays only a little data.",
mission:"The fraud job crashed and replayed 40 minutes of payments, flooding alerts. Tune checkpointing so recovery is quick and cheap.",
challenge:"Keep worst-case replay under 2 minutes while checkpoint overhead stays under 5%.",
body:`## Why state needs snapshots
Counting payments per card over the last hour means remembering counts: that's **state**. If the job crashes, the state must come back exactly as it was at some point, together with the Kafka offsets of that same point; otherwise counts drift.

:::flow How a checkpoint works (Flink)
Coordinator injects a barrier :: into every source
Sources record their Kafka offsets :: and pass the barrier on
Each operator snapshots its state :: when the barrier arrives
Snapshots are written to durable storage :: e.g. S3
All acknowledged :: the checkpoint is complete
:::

On failure, the job restores the latest completed checkpoint and re-reads Kafka from the stored offsets. Everything since that checkpoint is processed again.

## Choosing the interval
| Short interval (10 s) | Long interval (10 min) |
|---|---|
| Little to replay after a crash | Lots to replay |
| More overhead and storage writes | Little overhead |
| Fresher results with transactional sinks | Sinks commit rarely |
Incremental checkpoints (RocksDB) upload only changes, making short intervals cheaper for large state.

:::tip Savepoints
A savepoint is a manual, portable checkpoint for upgrades and rescaling. Give operators stable IDs so state maps cleanly to the new version of the job.
:::`,
take:["Checkpoints capture state + offsets at the same point.","Recovery replays everything since the last checkpoint.","Interval trades replay size against overhead."]},

{id:"9", title:"Exactly-once into the lakehouse", mins:9, lab:"eosPipeline", labTitle:"Sink designer",
sum:"End-to-end exactly-once needs a replayable source, consistent checkpoints and a sink that commits in step with them.",
mission:"Analysts found duplicate payments in the Iceberg table after last week's restarts. Redesign the sink.",
challenge:"Zero duplicates after three crashes, with data in the lake within 2 minutes.",
body:`## The three ingredients
:::flow End-to-end exactly-once
Replayable source :: Kafka, from checkpointed offsets
Consistent state :: checkpoints capture state + offsets together
Transactional or idempotent sink :: output becomes visible only with the checkpoint
:::

## Sink options
| Sink mode | After a crash | Freshness |
|---|---|---|
| Plain append | Replayed records are appended again: duplicates | Fast |
| Idempotent upsert by key | Replays overwrite the same rows | Fast, needs a key and upsert support |
| Two-phase commit on checkpoint | Uncommitted output is discarded; committed output isn't repeated | = checkpoint interval |

## The Iceberg sink
Writers produce data files continuously but don't commit them. When a checkpoint completes, a single committer makes one Iceberg commit containing all files for that checkpoint, recording the checkpoint ID so a restart never commits the same files twice. That's why the lake's freshness equals the checkpoint interval.

:::note Duplicates already in the source
Exactly-once inside the pipeline can't remove duplicates the producer already wrote. Dedupe by a unique event ID, or use idempotent producers upstream.
:::`,
take:["Replayable source + consistent checkpoints + transactional/idempotent sink.","Iceberg commits per checkpoint: freshness = checkpoint interval.","Dedupe source duplicates by event ID."]},

{id:"q3", kind:"quiz", title:"Checkpoint: stream processing", mins:3,
questions:[
 {q:"A watermark of 'max event time − 2 min' means…", o:["Events older than 2 min are deleted","Windows close once events 2 min behind the newest have likely arrived","Processing is delayed 2 min","Checkpoints every 2 min"], a:1, e:"It's the engine's estimate of event-time progress, used to close windows."},
 {q:"One Kafka partition stops receiving data and windows stop emitting. Why?", o:["Retention","The job's watermark is the minimum across inputs, and the idle one is stuck","Too many partitions","acks=all"], a:1, e:"Configure idleness so idle partitions don't hold the watermark back."},
 {q:"Checkpoint interval 10 minutes; crash. Roughly how much is replayed in the worst case?", o:["Nothing","Up to 10 minutes of input","The whole topic","One record"], a:1, e:"Everything after the last completed checkpoint is reprocessed."},
 {q:"Plain append sink + crash and replay causes…", o:["Lost records","Duplicate records","Nothing","Schema errors"], a:1, e:"Records written before the crash are written again on replay."},
 {q:"With a two-phase commit Iceberg sink, how fresh is the lake?", o:["Real time","About the checkpoint interval","Daily","Depends on retention"], a:1, e:"Data becomes visible at each checkpoint's commit."}
]},

{id:"boss", kind:"boss", title:"Final project: the real-time payments pipeline", mins:15, lab:"streamBoss", labTitle:"Pipeline launch",
sum:"Configure every layer, then survive a launch-day incident drill.",
mission:"Launch day. The pipeline goes live at 6,000 payments a second. During the drill a broker dies, a consumer crashes, mobile events arrive late and traffic spikes. Six requirements must hold.",
challenge:"Pass all 6 launch requirements.",
body:`## Requirements
1. No acknowledged payment is ever lost, even if a broker dies.
2. Writes keep working with one broker down.
3. Every order's events are processed in order.
4. The pipeline keeps up with 6,000 events/s with no idle consumers.
5. No duplicates in the lake after crashes.
6. Per-minute GMV counts at least 95% of events, ready within 3 minutes.

:::tip Use everything
Each requirement maps to a lesson: replication and acks, keys, consumer groups, delivery guarantees, watermarks and checkpoints, and the sink.
:::`,
take:["Durability, ordering, scale and correctness are separate settings.","Incident drills reveal which guarantees really hold.","You can now design a production streaming pipeline end to end."]}
]}
]};

/* ======================= LABS ======================= */
const KEYS = ["order-21","order-25","order-17","order-63","order-70","order-53"];
const hashP = (k, n) => { let h = 0; for (const c of k) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % n; };

LABS.logPlayground = (el, ctx) => {
  const N = 3, logs = [[], [], []], off = [0, 0, 0]; let produced = 0, replayed = false, consumedAll = false, ev = 0;
  const TYPES = ["created", "paid", "settled"];
  const draw = () => {
    const lag = logs.map((l, i) => l.length - off[i]), total = lag.reduce((a, b) => a + b, 0);
    if (produced >= 12 && total === 0) consumedAll = true;
    el.innerHTML = `<div class="lab-actions"><button class="btn solid" data-a="prod">Produce 3 events</button><button class="btn" data-a="cons">Consume 1 from each partition</button><button class="btn" data-a="all">Consume all</button></div>
      <div class="logs">${logs.map((l, i) => `<div class="plog"><span class="pl-h">Partition ${i}<small>lag ${lag[i]}</small></span><div class="pl-row">${l.map((r, o) => `<span class="rec${o < off[i] ? " read" : ""}${o === off[i] ? " next" : ""}" title="${r.k} ${r.t}"><b>${o}</b><small>${r.k.slice(6)}·${r.t[0]}</small></span>`).join("") || `<span class="muted">empty</span>`}</div><button class="btn ghost sm" data-r="${i}" ${l.length ? "" : "disabled"}>⟲ Replay from 0</button></div>`).join("")}</div>
      <p class="lab-note ${replayed && consumedAll ? "good" : ""}">Produced <b>${produced}</b>, unread <b>${total}</b>. ${replayed && consumedAll && total === 0 ? "<b>Replayed and caught up.</b> Nothing was deleted when you read it; you just moved the offset back." : !consumedAll ? "Faded records have been read. Reading doesn't delete them." : "Now rewind a partition with ⟲ and read it again."}</p>`;
    if (replayed && consumedAll && total === 0) ctx.win();
  };
  el.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.a === "prod") for (let k = 0; k < 3; k++){ const key = KEYS[ev % KEYS.length], t = TYPES[Math.floor(ev / KEYS.length) % 3]; logs[hashP(key, N)].push({k:key, t}); ev++; produced++; }
    if (b.dataset.a === "cons") off.forEach((o, i) => { if (o < logs[i].length) off[i]++; });
    if (b.dataset.a === "all") off.forEach((o, i) => off[i] = logs[i].length);
    if (b.dataset.r != null){ off[+b.dataset.r] = 0; if (consumedAll) replayed = true; }
    draw();
  });
  draw();
};

LABS.orderingGame = (el, ctx) => {
  const OPTS = [["none", "No key"], ["order", "order_id"], ["customer", "customer_id"], ["type", "event_type"]];
  let key = null;
  el.innerHTML = `<p class="lab-q">18 events: 6 orders × (created → paid → settled). 3 partitions, consumed in parallel at different speeds.</p><div class="seg seg4">${OPTS.map(([k, l]) => `<button data-k="${k}" role="radio">${l}</button>`).join("")}</div><div id="ogOut"></div>`;
  const run = () => {
    const evs = []; const T = ["created", "paid", "settled"];
    T.forEach((t, ti) => KEYS.forEach((o, oi) => evs.push({o, t, ti, cust:"cust-" + (oi % 2 === 0 ? "A" : ["B","C","D"][oi % 3]), seq:evs.length})));
    const part = e => key === "order" ? hashP(e.o, 3) : key === "customer" ? hashP(e.cust, 3) : key === "type" ? e.ti : (e.seq + e.ti) % 3;
    const parts = [[], [], []]; evs.forEach(e => parts[part(e)].push(e));
    const speed = [1, 2.6, 1.7], out = [];
    parts.forEach((p, i) => p.forEach((e, k) => out.push({...e, at:(k + 1) * speed[i] + i * .1})));
    out.sort((a, b) => a.at - b.at);
    const seen = {}; let viol = 0;
    out.forEach(e => { const last = seen[e.o] ?? -1; if (e.ti < last) viol++; seen[e.o] = Math.max(last, e.ti); });
    const load = parts.map(p => p.length), imb = Math.max(...load) / (18 / 3);
    const win = viol === 0 && imb <= 1.35;
    el.querySelectorAll("[data-k]").forEach(b => b.setAttribute("aria-checked", b.dataset.k === key));
    el.querySelector("#ogOut").innerHTML = `<div class="logs">${parts.map((p, i) => `<div class="plog"><span class="pl-h">Partition ${i}<small>${p.length} events</small></span><div class="pl-row">${p.map(e => `<span class="rec ev-${e.ti}" title="${e.o} ${e.t}"><small>${e.o.slice(6)}</small><b>${e.t[0].toUpperCase()}</b></span>`).join("")}</div></div>`).join("")}</div>
      <div class="lat-grid"><div class="${viol ? "bad" : "good"}"><small>Out-of-order events</small><b>${viol}</b></div><div class="${imb <= 1.35 ? "good" : "bad"}"><small>Busiest partition</small><b>${Math.max(...load)} / 6 ideal</b></div><div><small>Key</small><b>${OPTS.find(o => o[0] === key)[1]}</b></div></div>
      <p class="lab-note ${win ? "good" : ""}">${win ? "<b>In order and balanced.</b> Each order lives in one partition, and many distinct orders spread the load." : key === "none" ? "Without a key, one order's events scatter across partitions and race each other." : key === "type" ? "All 'paid' events share a partition, so created/paid/settled for the same order are split up." : key === "customer" ? "Ordering holds because each customer's orders stay together, but customer A's orders overload one partition." : ""}</p>`;
    if (win) ctx.win();
  };
  el.addEventListener("click", e => { const b = e.target.closest("[data-k]"); if (b){ key = b.dataset.k; run(); } });
};

LABS.durability = (el, ctx) => {
  const s = {rf:1, acks:"1", isr:1};
  el.innerHTML = `<p class="lab-lbl">replication.factor</p><div class="seg">${[1,2,3].map(v => `<button data-rf="${v}" role="radio">${v}</button>`).join("")}</div>
    <p class="lab-lbl">acks (producer)</p><div class="seg">${["0","1","all"].map(v => `<button data-ac="${v}" role="radio">${v}</button>`).join("")}</div>
    <p class="lab-lbl">min.insync.replicas</p><div class="seg">${[1,2,3].map(v => `<button data-is="${v}" role="radio">${v}</button>`).join("")}</div>
    <div class="lab-actions"><button class="btn solid" data-a="crash">Run the crash test</button></div><div id="duOut"></div>`;
  const sync = () => { el.querySelectorAll("[data-rf]").forEach(b => b.setAttribute("aria-checked", +b.dataset.rf === s.rf)); el.querySelectorAll("[data-ac]").forEach(b => b.setAttribute("aria-checked", b.dataset.ac === s.acks)); el.querySelectorAll("[data-is]").forEach(b => b.setAttribute("aria-checked", +b.dataset.is === s.isr)); };
  const run = () => {
    const invalid = s.isr > s.rf;
    const lost = invalid ? 0 : (s.acks === "0" ? 37 : s.acks === "1" ? (s.rf === 1 ? 1000 : 23) : (s.rf === 1 || s.isr === 1 ? (s.rf === 1 ? 1000 : 4) : 0));
    const writesWithOneDown = !invalid && s.rf - 1 >= (s.acks === "all" ? s.isr : 1);
    const win = lost === 0 && writesWithOneDown && s.acks === "all";
    const brokers = [0, 1, 2].map(i => ({leader:i === 0, replica:i < s.rf}));
    el.querySelector("#duOut").innerHTML = invalid ? `<p class="lab-note">min.insync.replicas can't exceed the replication factor: every acks=all write would fail.</p>` : `
      <div class="brokers">${brokers.map((b, i) => `<div class="brk${i === 0 ? " dead" : ""}${b.replica ? "" : " empty"}"><b>Broker ${i+1}</b><small>${i === 0 ? "leader · crashed ✕" : b.replica ? (i === 1 ? "follower → new leader" : "follower") : "no replica"}</small></div>`).join("")}</div>
      <div class="lat-grid"><div class="${lost ? "bad" : "good"}"><small>Acknowledged payments lost</small><b>${lost}</b></div><div class="${writesWithOneDown ? "good" : "bad"}"><small>Writes with 1 broker down</small><b>${writesWithOneDown ? "accepted" : "rejected"}</b></div><div><small>Copies per write</small><b>${s.acks === "all" ? Math.max(s.isr, 1) + "+" : s.acks === "1" ? "1 at ack" : "0 at ack"}</b></div></div>
      <p class="lab-note ${win ? "good" : ""}">${win ? "<b>Durable and available.</b> Every acknowledged write was on at least two brokers, and one broker can be down without stopping writes." : s.rf === 1 ? "With one copy, losing the broker loses the partition." : s.acks !== "all" ? "The producer got its acknowledgement before followers copied the data, so the crash lost it." : s.isr === 1 ? "acks=all with min ISR 1 lets a write succeed on the leader alone when followers lag." : "Durable, but requiring all 3 in sync means one broker down stops writes."}</p>`;
    if (win) ctx.win();
  };
  el.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.rf) s.rf = +b.dataset.rf; if (b.dataset.ac) s.acks = b.dataset.ac; if (b.dataset.is) s.isr = +b.dataset.is;
    sync(); if (b.dataset.a === "crash") run();
  });
  sync();
};

LABS.groupBalancer = (el, ctx) => {
  const RATE = 6000, CAP = 1200; const s = {parts:6, cons:2};
  el.innerHTML = `<div class="slider-row"><label for="gbP">Partitions <b id="gbPV"></b></label><input id="gbP" type="range" min="1" max="12" step="1" value="6"></div>
    <div class="slider-row"><label for="gbC">Consumers in the group <b id="gbCV"></b></label><input id="gbC" type="range" min="1" max="14" step="1" value="2"></div><div id="gbOut"></div>`;
  const draw = () => {
    el.querySelector("#gbPV").textContent = s.parts; el.querySelector("#gbCV").textContent = s.cons;
    const assign = Array.from({length:s.cons}, () => []); for (let p = 0; p < s.parts; p++) assign[p % s.cons].push(p);
    const perPart = RATE / s.parts, idle = assign.filter(a => !a.length).length;
    const loads = assign.map(a => a.length * perPart), over = loads.filter(l => l > CAP).length, win = !over && !idle;
    el.querySelector("#gbOut").innerHTML = `<div class="consumers">${assign.map((a, i) => `<div class="cns${!a.length ? " idle" : loads[i] > CAP ? " hot" : ""}"><b>C${i+1}</b><div class="cns-p">${a.map(p => `<span>P${p}</span>`).join("") || "<small>idle</small>"}</div><div class="cns-bar"><span style="width:${Math.min(100, loads[i] / CAP * 100)}%"></span></div><small>${Math.round(loads[i]).toLocaleString()}/s of ${CAP.toLocaleString()}</small></div>`).join("")}</div>
      <div class="lat-grid"><div class="${over ? "bad" : "good"}"><small>Lag</small><b>${over ? "growing" : "stable"}</b></div><div class="${idle ? "bad" : "good"}"><small>Idle consumers</small><b>${idle}</b></div><div><small>Per partition</small><b>${Math.round(perPart).toLocaleString()}/s</b></div></div>
      <p class="lab-note ${win ? "good" : ""}">${win ? "<b>Keeping up, nobody idle.</b>" : idle ? "Consumers beyond the partition count have nothing to do. Add partitions or remove consumers." : "Some consumers get more than 1,200 events/s, so lag grows. More consumers, and enough partitions to give them work."} Each consumer can process ${CAP.toLocaleString()} events/s.</p>`;
    if (win) ctx.win();
  };
  el.addEventListener("input", e => { if (e.target.id === "gbP") s.parts = +e.target.value; if (e.target.id === "gbC") s.cons = +e.target.value; draw(); });
  draw();
};

LABS.crashLab = (el, ctx) => {
  const MODES = [["before", "Commit, then process"], ["auto", "Auto-commit every 5 s"], ["after", "Process, then commit"], ["afterIdem", "Process (upsert by payment_id), then commit"]];
  let mode = null;
  el.innerHTML = `<p class="lab-q">A batch of 10 payments (P1-P10). The consumer crashes after writing P6, then restarts.</p><div class="seg seg4">${MODES.map(([k, l]) => `<button data-m="${k}" role="radio">${l}</button>`).join("")}</div><div id="clOut"></div>`;
  const run = () => {
    let rows = [];
    const ids = Array.from({length:10}, (_, i) => "P" + (i + 1));
    if (mode === "before"){ rows = ids.slice(0, 6); }
    else if (mode === "auto"){ rows = ids.slice(0, 6).concat(ids.slice(4)); }
    else if (mode === "after"){ rows = ids.slice(0, 6).concat(ids); }
    else { rows = [...new Set(ids.slice(0, 6).concat(ids))]; }
    const counts = {}; rows.forEach(r => counts[r] = (counts[r] || 0) + 1);
    const missing = ids.filter(i => !counts[i]).length, dup = rows.length - Object.keys(counts).length, win = !missing && !dup;
    el.querySelectorAll("[data-m]").forEach(b => b.setAttribute("aria-checked", b.dataset.m === mode));
    el.querySelector("#clOut").innerHTML = `<p class="lab-lbl">Database after restart</p><div class="db-rows">${ids.map(i => `<span class="dbr ${!counts[i] ? "miss" : counts[i] > 1 ? "dup" : "ok"}">${i}${counts[i] > 1 ? `<sub>×${counts[i]}</sub>` : !counts[i] ? "<sub>missing</sub>" : ""}</span>`).join("")}</div>
      <div class="lat-grid"><div class="${missing ? "bad" : "good"}"><small>Missing</small><b>${missing}</b></div><div class="${dup ? "bad" : "good"}"><small>Duplicate rows</small><b>${dup}</b></div><div><small>Guarantee</small><b>${mode === "before" ? "at most once" : mode === "auto" ? "neither" : mode === "after" ? "at least once" : "effectively once"}</b></div></div>
      <p class="lab-note ${win ? "good" : ""}">${win ? "<b>Exactly the right rows.</b> The restart reprocessed the batch, but upserts by payment_id overwrote the same rows." : mode === "before" ? "The offsets were committed first, so on restart the consumer skipped P7-P10." : mode === "auto" ? "The timer committed offsets mid-batch: some records were reprocessed and none were lost this time, but you can't predict which way it goes." : "Nothing was lost, but replaying the batch inserted P1-P6 a second time."}</p>`;
    if (win) ctx.win();
  };
  el.addEventListener("click", e => { const b = e.target.closest("[data-m]"); if (b){ mode = b.dataset.m; run(); } });
};

LABS.schemaCompat = (el, ctx) => {
  const CH = [
    {c:'Add field "currency": string, default "INR"', ok:true, e:"New readers fill the default for old records."},
    {c:'Add field "merchant_city": string, no default', ok:false, e:"New readers have no value to use for old records."},
    {c:'Remove field "legacy_flag"', ok:true, e:"Under backward compatibility, new readers simply ignore a field old data still has."},
    {c:'Rename "amount" to "amt"', ok:false, e:"Readers looking for amt can't find it in old data (unless you add an alias)."},
    {c:'Change "attempts" from int to long', ok:true, e:"Avro promotes int to long when reading old data."},
    {c:'Change "amount" from double to string', ok:false, e:"No promotion from double to string: old data can't be read."}
  ];
  const ans = {};
  const draw = () => {
    const done = Object.keys(ans).length === CH.length, score = CH.filter((c, i) => ans[i] === c.ok).length;
    el.innerHTML = `<pre><code>record Payment { long id; double amount; int attempts; boolean legacy_flag; }</code></pre><p class="lab-q">Backward compatible (safe to deploy consumers first)?</p>
      <div class="sc-list">${CH.map((c, i) => `<div class="sc-row ${ans[i] == null ? "" : ans[i] === c.ok ? "ok" : "no"}"><span class="sc-c">${esc(c.c)}</span><span class="sc-b"><button class="btn sm${ans[i] === true ? " solid" : ""}" data-i="${i}" data-v="1" ${ans[i] != null ? "disabled" : ""}>Safe</button><button class="btn sm${ans[i] === false ? " solid" : ""}" data-i="${i}" data-v="0" ${ans[i] != null ? "disabled" : ""}>Breaking</button></span>${ans[i] != null ? `<small>${ans[i] === c.ok ? "✓" : "✗"} ${esc(c.e)}</small>` : ""}</div>`).join("")}</div>
      ${done ? `<p class="lab-note ${score >= 5 ? "good" : ""}"><b>${score} / 6.</b> ${score >= 5 ? "The registry would agree with you." : "Rule of thumb: add with defaults, don't rename, only widen types."}</p><div class="lab-actions"><button class="btn" data-a="again">Try again</button></div>` : ""}`;
    if (done && score >= 5) ctx.win();
  };
  el.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.a === "again"){ Object.keys(ans).forEach(k => delete ans[k]); draw(); return; }
    if (b.dataset.i != null){ ans[+b.dataset.i] = b.dataset.v === "1"; draw(); }
  });
  draw();
};

const WM_EV = (() => { const rnd = U.mulberry32(11); return Array.from({length:200}, () => { const t = rnd() * 30; const r = rnd(); const delay = r < .8 ? rnd() * 40 : r < .95 ? 40 + rnd() * 80 : 120 + rnd() * 600; return {t, delay}; }); })();
const wmPct = wm => WM_EV.filter(e => e.delay <= wm).length / WM_EV.length * 100;
LABS.watermarkGame = (el, ctx) => {
  const EV = WM_EV;
  let wm = 30;
  el.innerHTML = `<p class="lab-q">200 payments over 30 minutes, 5-minute windows. Most arrive within seconds; some phones reconnect minutes later.</p>
    <div class="slider-row"><label for="wmD">Watermark delay <b id="wmDV"></b></label><input id="wmD" type="range" min="0" max="600" step="10" value="30"></div><div id="wmOut"></div>`;
  const draw = () => {
    el.querySelector("#wmDV").textContent = wm >= 60 ? (wm / 60).toFixed(1).replace(".0", "") + " min" : wm + " s";
    const counted = EV.filter(e => e.delay <= wm).length, pct = counted / EV.length * 100, ready = 0.5 + wm / 60;
    const win = pct >= 95 && ready <= 3;
    el.querySelector("#wmOut").innerHTML = `<div class="tl">${EV.slice(0, 120).map(e => `<i class="${e.delay <= wm ? "in" : "late"}" style="left:${e.t / 30 * 100}%; bottom:${Math.min(100, e.delay / 720 * 100)}%"></i>`).join("")}<span class="tl-wm" style="bottom:${Math.min(100, wm / 720 * 100)}%">watermark delay</span></div>
      <p class="muted tl-cap">Each dot is an event: left-right is event time, height is how late it arrived. Dots above the line miss their window.</p>
      <div class="lat-grid"><div class="${pct >= 95 ? "good" : "bad"}"><small>Events counted</small><b>${pct.toFixed(1)}%</b></div><div class="${ready <= 3 ? "good" : "bad"}"><small>Result ready after window end</small><b>${ready.toFixed(1)} min</b></div><div><small>Late events</small><b>${EV.length - counted}</b></div></div>
      <p class="lab-note ${win ? "good" : ""}">${win ? "<b>Balanced.</b> Nearly every event lands in its window and the dashboard stays fresh. Send the stragglers to a side output for correction." : pct < 95 ? "Too many events arrive after their window closed. Wait a bit longer." : "Results take too long. Accept a few late events and correct them later."}</p>`;
    if (win) ctx.win();
  };
  el.addEventListener("input", e => { if (e.target.id === "wmD"){ wm = +e.target.value; draw(); } });
  draw();
};

LABS.checkpointSim = (el, ctx) => {
  let iv = 600; const COST = 3; // seconds of work per checkpoint
  el.innerHTML = `<div class="slider-row"><label for="ckI">Checkpoint interval <b id="ckIV"></b></label><input id="ckI" type="range" min="5" max="900" step="5" value="600"></div>
    <div class="toggles"><label><input type="checkbox" id="ckInc"> Incremental checkpoints <small>(upload only changed RocksDB files)</small></label></div><div id="ckOut"></div>`;
  let inc = false;
  const draw = () => {
    const cost = inc ? COST / 3 : COST, overhead = cost / iv * 100, replay = iv, win = replay <= 120 && overhead < 5;
    el.querySelector("#ckIV").textContent = iv >= 60 ? (iv / 60).toFixed(1).replace(".0", "") + " min" : iv + " s";
    const marks = Math.min(40, Math.floor(1800 / iv));
    el.querySelector("#ckOut").innerHTML = `<div class="ck-tl">${Array.from({length:marks}, (_, k) => `<i style="left:${(k + 1) * iv / 1800 * 100}%"></i>`).join("")}<span class="ck-crash" style="left:${Math.min(99, (Math.floor(1700 / iv) * iv + iv * .97) / 1800 * 100)}%">crash</span></div>
      <p class="muted tl-cap">30 minutes of running. Each tick is a completed checkpoint; worst case, the crash happens just before the next one.</p>
      <div class="lat-grid"><div class="${replay <= 120 ? "good" : "bad"}"><small>Worst-case replay</small><b>${replay >= 60 ? (replay / 60).toFixed(1) + " min" : replay + " s"}</b></div><div class="${overhead < 5 ? "good" : "bad"}"><small>Checkpoint overhead</small><b>${overhead.toFixed(1)}%</b></div><div><small>Sink freshness</small><b>≈ ${iv >= 60 ? (iv / 60).toFixed(1) + " min" : iv + " s"}</b></div></div>
      <p class="lab-note ${win ? "good" : ""}">${win ? "<b>Quick recovery, low overhead.</b>" : replay > 120 ? "A crash now replays a lot of history. Checkpoint more often." : "Checkpoints are eating too much time. Space them out, or make each one cheaper."}</p>`;
    if (win) ctx.win();
  };
  el.addEventListener("input", e => { if (e.target.id === "ckI") iv = +e.target.value; if (e.target.id === "ckInc") inc = e.target.checked; draw(); });
  draw();
};

LABS.eosPipeline = (el, ctx) => {
  const MODES = [["append", "Plain append"], ["upsert", "Upsert by payment_id"], ["tpc", "Two-phase commit per checkpoint"]];
  let mode = null, iv = 300;
  el.innerHTML = `<div class="seg">${MODES.map(([k, l]) => `<button data-m="${k}" role="radio">${l}</button>`).join("")}</div>
    <div class="slider-row"><label for="eoI">Checkpoint interval <b id="eoIV"></b></label><input id="eoI" type="range" min="30" max="600" step="30" value="300"></div>
    <div class="lab-actions"><button class="btn solid" data-a="run">Run with 3 crashes</button></div><div id="eoOut"></div>`;
  const sync = () => { el.querySelectorAll("[data-m]").forEach(b => b.setAttribute("aria-checked", b.dataset.m === mode)); el.querySelector("#eoIV").textContent = iv >= 60 ? iv / 60 + " min" : iv + " s"; };
  const run = () => {
    if (!mode) return;
    const dups = mode === "append" ? Math.round(iv * 6000 * 0.5 * 3 / 1000) * 1000 : 0, fresh = mode === "tpc" ? iv : 15;
    const win = !dups && fresh <= 120;
    el.querySelector("#eoOut").innerHTML = `<div class="lat-grid"><div class="${dups ? "bad" : "good"}"><small>Duplicate rows in the lake</small><b>${dups.toLocaleString()}</b></div><div class="${fresh <= 120 ? "good" : "bad"}"><small>Freshness</small><b>${fresh >= 60 ? (fresh / 60).toFixed(1) + " min" : fresh + " s"}</b></div><div><small>Mode</small><b>${MODES.find(m => m[0] === mode)[1]}</b></div></div>
      <p class="lab-note ${win ? "good" : ""}">${win ? `<b>Exactly-once, and fresh.</b> ${mode === "tpc" ? "Each checkpoint becomes one atomic Iceberg commit." : "Replays overwrite the same keys. (Your table and engine must support upserts, e.g. Iceberg v2 MERGE.)"}` : dups ? "Each crash replayed records written since the last checkpoint, and append wrote them again." : "No duplicates, but data only becomes visible at each checkpoint. Shorten the interval."}</p>`;
    if (win) ctx.win();
  };
  el.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; if (b.dataset.m){ mode = b.dataset.m; sync(); } if (b.dataset.a === "run") run(); });
  el.addEventListener("input", e => { if (e.target.id === "eoI"){ iv = +e.target.value; sync(); } });
  sync();
};

LABS.streamBoss = (el, ctx) => {
  const s = {rf:3, acks:"1", isr:1, key:"none", parts:6, cons:4, commit:"auto", wm:20, ck:600, sink:"append"};
  const seg = (name, label, opts) => `<p class="lab-lbl">${label}</p><div class="seg${opts.length === 4 ? " seg4" : ""}">${opts.map(([v, l]) => `<button data-${name}="${v}" role="radio">${l}</button>`).join("")}</div>`;
  el.innerHTML = `<div class="boss-grid"><div>${seg("rf", "Replication factor", [[1,"1"],[2,"2"],[3,"3"]])}${seg("acks", "Producer acks", [["0","0"],["1","1"],["all","all"]])}${seg("isr", "min.insync.replicas", [[1,"1"],[2,"2"],[3,"3"]])}${seg("key", "Message key", [["none","none"],["order","order_id"],["type","event_type"]])}</div>
    <div>${seg("parts", "Partitions", [[3,"3"],[6,"6"],[12,"12"]])}${seg("cons", "Consumers", [[4,"4"],[6,"6"],[8,"8"]])}${seg("commit", "Offset commits", [["auto","auto"],["before","before"],["after","after + upsert"]])}${seg("sink", "Lake sink", [["append","append"],["tpc","2-phase commit"]])}</div></div>
    <div class="slider-row"><label for="bsW">Watermark delay <b id="bsWV"></b></label><input id="bsW" type="range" min="0" max="600" step="10" value="20"></div>
    <div class="slider-row"><label for="bsC">Checkpoint interval <b id="bsCV"></b></label><input id="bsC" type="range" min="10" max="600" step="10" value="600"></div>
    <div class="lab-actions"><button class="btn solid" data-a="drill">Run the launch drill</button></div><div id="bsOut"></div>`;
  const sync = () => {
    ["rf","acks","isr","key","parts","cons","commit","sink"].forEach(k => el.querySelectorAll(`[data-${k}]`).forEach(b => b.setAttribute("aria-checked", String(b.dataset[k]) === String(s[k]))));
    el.querySelector("#bsWV").textContent = s.wm >= 60 ? (s.wm / 60).toFixed(1) + " min" : s.wm + " s"; el.querySelector("#bsCV").textContent = s.ck >= 60 ? (s.ck / 60).toFixed(1) + " min" : s.ck + " s";
  };
  const drill = () => {
    const R = [
      ["No acknowledged payment lost when a broker dies", s.rf >= 2 && s.acks === "all" && s.isr >= 2],
      ["Writes continue with one broker down", s.isr <= s.rf - 1 && s.rf >= 2],
      ["Each order's events processed in order", s.key === "order"],
      ["Keeps up at 6,000/s with no idle consumers", s.cons <= s.parts && (6000 / s.parts) * Math.ceil(s.parts / s.cons) <= 1200],
      ["No duplicates in the lake after crashes", s.sink === "tpc" && s.commit !== "before" && s.ck <= 120],
      ["≥ 95% of events counted, ready within 3 min", wmPct(s.wm) >= 95 && 0.5 + s.wm / 60 <= 3]
    ];
    const n = R.filter(r => r[1]).length;
    el.querySelector("#bsOut").innerHTML = `<div class="score-tbl">${R.map(([t, ok]) => `<div class="sr-row ${ok ? "ok" : "no"}"><span class="sr-ic">${ok ? "✓" : "✗"}</span><span>${t}</span><span class="sr-pred">${ok ? "holds" : "fails"}</span></div>`).join("")}</div>
      <div class="score-big"><span class="ring lg" style="--p:${n / 6 * 100}; --rc:${n === 6 ? "var(--k-disk)" : "var(--accent)"}"><b>${n}/6</b></span><p>${n === 6 ? "<b>Launched.</b> Your pipeline survived the drill." : "Fix the failing requirements and run the drill again. Each one maps to a lesson in this course."}</p></div>`;
    if (n === 6) ctx.win();
  };
  el.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    for (const k of ["rf","isr","parts","cons"]) if (b.dataset[k] != null) s[k] = +b.dataset[k];
    for (const k of ["acks","key","commit","sink"]) if (b.dataset[k] != null) s[k] = b.dataset[k];
    sync(); if (b.dataset.a === "drill") drill();
  });
  el.addEventListener("input", e => { if (e.target.id === "bsW") s.wm = +e.target.value; if (e.target.id === "bsC") s.ck = +e.target.value; sync(); });
  sync();
};
})();
