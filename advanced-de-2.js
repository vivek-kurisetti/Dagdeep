// Advanced Data Engineer topics, part 2: Iceberg internals and a new distributed-systems stage.
(function(){
const R = window.ROADMAPS.de.c;

/* ---------- de-5-1-4 Iceberg commit protocol ---------- */
R[4].c[0].c.push({t:"Commit protocol, sequence numbers and conflicts", hard:true, d:"Why compaction fights with streaming writers, and how to stop it.",
k:["Every commit is an optimistic compare-and-swap on the catalog pointer.","On conflict the writer refreshes, validates and re-applies its changes.","Sequence numbers decide which delete files apply to which data files.","Metadata tables (files, snapshots, partitions, entries) answer most debugging questions."],
w:"At scale, failed commits and compaction conflicts are the most common Iceberg production problems. They follow directly from how commits work.",
dd:`## The commit, step by step
:::flow Optimistic commit with retry
Load base metadata :: the writer remembers version N as its base
Write data and delete files :: invisible until committed
Build new metadata :: new manifests, manifest list and metadata.json for N+1
Compare-and-swap in the catalog :: succeeds only if the pointer still says N
If the swap fails :: someone else committed version M first
Refresh and validate :: check M's changes against this operation's rules
Re-apply and retry :: rebuild metadata on top of M; data files are reused
:::
The catalog provides the atomic swap: Glue uses a version check on the table, the Hive metastore uses a lock, a REST catalog does it server-side. S3 itself has no atomic rename, which is exactly why a catalog is needed. Retries are controlled by «commit.retry.num-retries» (4 by default) and backoff settings.

## What counts as a conflict
Validation depends on the operation, not just on timing:
| Operation | Example | Conflicts when concurrent commits... |
|---|---|---|
| AppendFiles | INSERT INTO | almost never; appends are retried freely |
| OverwriteFiles / ReplacePartitions | INSERT OVERWRITE | added data to the same partitions (serializable isolation) |
| RowDelta | MERGE, UPDATE, DELETE in merge-on-read | deleted or rewrote the data files this commit references |
| RewriteFiles | rewrite_data_files (compaction) | removed or added deletes to the files being rewritten |
For Spark row-level commands, «write.delete.isolation-level», «write.update.isolation-level» and «write.merge.isolation-level» choose between serializable (stricter, more conflicts) and snapshot isolation.

## Sequence numbers
Format v2 gives every commit a **sequence number**, and every data and delete file records the sequence number at which it was added.
- A **position delete** applies to data files with a sequence number less than or equal to its own.
- An **equality delete** applies only to data files with a strictly lower sequence number.
That second rule is what makes CDC upserts work: the new row and the equality delete for the old row are committed together, and the delete does not hide the new row because they share a sequence number.

:::lanes Compaction meets a streaming writer
# Without care
Compaction starts at snapshot 100 :: reads files A and B
Streaming commit 101 adds equality deletes :: some target rows in A
Compaction writes a new file C :: and tries to replace A and B
Validation fails :: deletes were added to files being rewritten
Compaction retries and fails again :: hours of work wasted
# With the right settings
Rewrite keeps the starting sequence number :: use-starting-sequence-number=true
New file C gets sequence number 100 :: older than commit 101
Equality deletes from 101 still apply to C :: no rows resurrected
Partial progress commits groups :: partial-progress.enabled=true
Target older partitions :: where streaming no longer writes
:::

## Practical rules for busy tables
- Compact partitions that writers have finished with (for example, yesterday and older), and recent partitions only with partial progress enabled.
- Keep commit frequency sensible. Hundreds of commits per minute from many writers to one table guarantees conflicts; route writes through fewer writers or longer checkpoint intervals.
- Never run two compaction jobs on the same partitions at once.
- Prefer metadata-only deletes (whole partitions) for retention.

## Metadata tables: the debugging toolkit
Every Iceberg table exposes system tables you can query with SQL:
~~~
-- Small-file report per partition
SELECT partition, count(*) AS files,
       round(avg(file_size_in_bytes) / 1048576, 1) AS avg_mb
FROM lake.pay.payments.files
GROUP BY partition ORDER BY files DESC LIMIT 20;

-- Delete-file build-up (merge-on-read health)
SELECT content, count(*) AS n, sum(record_count) AS rows
FROM lake.pay.payments.all_delete_files GROUP BY content;
-- content: 1 = position deletes, 2 = equality deletes

-- What did each recent commit do?
SELECT committed_at, snapshot_id, operation,
       summary['added-data-files']   AS added_files,
       summary['added-records']      AS added_rows,
       summary['total-delete-files'] AS delete_files
FROM lake.pay.payments.snapshots
ORDER BY committed_at DESC LIMIT 10;
~~~
Other useful tables: «history» (snapshot lineage, including rollbacks), «partitions» (row and file counts per partition), «manifests», «entries» (file-level adds and deletes per snapshot) and «refs» (branches and tags).

:::tip Reading a failed commit
CommitFailedException with "Cannot commit, found new delete for replaced data file" is the compaction-versus-merge-on-read conflict above. ValidationException on overwrite means another writer added data to a partition you were replacing. CommitStateUnknownException means the catalog call timed out: do not blindly retry the job; check the snapshots table first to see whether the commit landed.
:::`,
iq:[
 ["I","What happens when two Iceberg writers commit at the same time?","Both attempt a compare-and-swap of the catalog pointer from the same base version. One wins. The other gets a commit failure, reloads the new metadata, validates its operation against the winner's changes, and if there is no logical conflict re-creates its metadata on top and retries, reusing its data files."],
 ["S","Why does compaction often fail on CDC tables, and how do you fix it?","Streaming writers keep adding equality or position deletes that target the same data files compaction is rewriting. Validation detects new deletes on replaced files and rejects the rewrite. Fix by compacting partitions writers have finished with, enabling partial progress, keeping use-starting-sequence-number so new deletes still apply to rewritten files, and lowering conflicting commit frequency."],
 ["S","How do sequence numbers decide which deletes apply?","Each commit has a sequence number stored on its files. Position deletes apply to data files with sequence number less than or equal to theirs; equality deletes apply only to data files with strictly lower sequence numbers. So an upsert's equality delete hides older versions but not the new row committed alongside it."],
 ["S","A job failed with CommitStateUnknownException. What do you do?","The catalog update may or may not have succeeded. Before retrying, query the snapshots table for a snapshot from that job (by time, summary or application ID). If it is there, the data is committed and a retry would duplicate it; if not, it is safe to retry. Orphaned files can be cleaned later by remove_orphan_files."]
]});

/* ---------- New stage: distributed systems ---------- */
R.push({t:"Distributed systems foundations", hard:true, d:"The theory underneath Kafka, Cassandra, Iceberg and every data platform.",
k:["Replication, partitioning, consensus and time are the four building blocks.","Most design-interview depth questions come from here.","These ideas explain failure behaviour you see in production."],
w:"Senior data engineers are expected to reason about consistency, failure and ordering, not just use the tools. This stage gives you the vocabulary and the mechanisms.",
fl:["Replication","Consistency models","Partitioning","Consensus","Transactions across systems","Time and ordering"],
c:[
{t:"Replication and consistency models", hard:true, d:"Copies of data, and what readers are allowed to see.",
k:["Single-leader, multi-leader and leaderless replication behave very differently under failure.","Asynchronous replication creates lag anomalies such as stale and out-of-order reads.","Quorums (W + R > N) give overlapping reads and writes.","Consistency models range from linearizable to eventual."],
dd:`## Why replicate
Copies on several machines give availability (survive a node failure), durability (survive disk loss), and read scaling. The hard part is keeping copies in agreement while machines and networks fail.

## Three replication designs
:::lanes How writes flow
# Single leader
Client writes to the leader :: one node accepts writes
Leader logs the change :: binlog / WAL / Kafka log
Followers apply in order :: sync or async
Reads from followers may lag :: replication lag
# Multi-leader
Each region has a leader :: writes accepted everywhere
Leaders exchange changes :: asynchronously
Conflicts are possible :: same row changed in two places
Resolve conflicts :: last-write-wins, merge, or custom logic
# Leaderless
Client writes to N replicas :: Cassandra, DynamoDB-style
Waits for W acknowledgements :: write quorum
Reads ask R replicas :: newest version wins
Repair in the background :: read repair, hinted handoff, anti-entropy
:::
MySQL replication, Postgres streaming replication and Kafka partitions are single-leader. Multi-leader appears in multi-region active-active setups. Cassandra is leaderless.

## Replication lag anomalies
With asynchronous followers, users can see strange things:
- **Read-your-writes violation:** you update your profile, refresh, and see the old value from a lagging replica. Fix: read your own recent writes from the leader, or wait until the replica has caught up to your write's position (GTID or LSN).
- **Monotonic reads violation:** two refreshes hit different replicas and data goes back in time. Fix: pin a user to one replica.
- **Consistent prefix violation:** you see an answer before its question because they live on different partitions. Fix: keep causally related writes on the same partition.

## Quorums
With N replicas, writes wait for W acknowledgements and reads query R replicas. If **W + R > N**, every read set overlaps every write set in at least one replica, so a read sees the latest acknowledged write. With N = 3, W = 2 and R = 2 is the classic choice. W = 1 and R = 1 is fast but can return stale data.

:::warn Quorums are not linearizability
Even with W + R > N, concurrent writes, sloppy quorums (writing to substitute nodes during failures) and clock-based last-write-wins can still produce anomalies. Quorums give a strong probability of freshness, not a strict guarantee.
:::

## The consistency ladder
| Model | Guarantee | Example |
|---|---|---|
| Linearizable | Acts like one copy; once a write is visible, everyone sees it | etcd, ZooKeeper, single-leader reads from the leader |
| Sequential | All nodes see operations in the same order | Total order broadcast |
| Causal | Cause is seen before effect | Some geo-replicated stores |
| Read-your-writes / monotonic | Per-session guarantees | Session-pinned replicas |
| Eventual | Replicas converge if writes stop | DNS, async replicas, Cassandra at ONE |
Stronger models need more coordination, so they cost latency and availability. CAP says that during a network partition you must choose consistency or availability; PACELC adds that without a partition you still trade latency against consistency.`,
iq:[
 ["I","What is replication lag and what problems can it cause?","The delay before a follower applies changes made on the leader. Reads from followers can be stale, can break read-your-writes (a user doesn't see their own update), monotonic reads (data appears to go back in time), and consistent prefix (effects before causes)."],
 ["I","What does W + R > N guarantee?","With N replicas, if writes wait for W acknowledgements and reads query R replicas with W + R > N, every read overlaps at least one replica holding the latest acknowledged write, so reads normally return the latest value. It is not full linearizability under concurrency or sloppy quorums."],
 ["S","How would you give users read-your-writes consistency with async MySQL replicas?","After a write, record the transaction's GTID (or the time) in the user's session. Route that user's reads to the primary for a short window, or to a replica only once it has executed that GTID (WAIT_FOR_EXECUTED_GTID_SET). Other users keep reading from replicas."]
]},
{t:"Consensus with Raft", hard:true, d:"How a cluster agrees on one leader and one log.",
k:["Raft elects one leader per term and replicates a log; an entry is committed once a majority stores it.","A majority quorum means a cluster of 2f+1 nodes survives f failures.","Election rules ensure a new leader has every committed entry.","KRaft (Kafka), etcd and many databases use Raft."],
dd:`## The problem
Several machines must agree on a sequence of decisions (who the leader is, which configuration is current, the order of log entries) even when some crash or messages are delayed. Consensus algorithms solve this; Raft was designed to be understandable and is now the most widely used.

## Roles and terms
Each node is a **follower**, **candidate** or **leader**. Time is divided into numbered **terms**; each term has at most one leader. Every message carries the sender's term, and a node that sees a higher term immediately becomes a follower.

:::flow Leader election
Follower hears nothing :: election timeout expires (randomised, e.g. 150-300 ms)
Becomes a candidate :: increments the term and votes for itself
Requests votes :: RequestVote messages to all other nodes
Nodes grant at most one vote per term :: only to candidates whose log is at least as up to date
Majority of votes received :: the candidate becomes leader
Leader sends heartbeats :: empty AppendEntries messages stop new elections
:::
Randomised timeouts make split votes rare; if one happens, the term ends with no leader and a new election starts.

## Log replication
:::flow Replicating one entry
Client sends a command to the leader :: followers redirect clients to the leader
Leader appends to its log :: entry tagged with the current term and index
AppendEntries to followers :: includes the previous entry's index and term
Followers check consistency :: reject if their log does not match at that point
Majority stored the entry :: leader advances its commit index
Apply to the state machine :: leader replies; followers apply on the next heartbeat
:::
If a follower's log diverges, the leader walks back until the logs match, then overwrites the follower's conflicting entries. Only the leader's log is ever the source of truth.

## Why it is safe
- **Election restriction:** a node only votes for a candidate whose log is at least as up to date as its own, so any elected leader already holds every committed entry.
- **Majorities overlap:** any two majorities share at least one node, so two leaders cannot both commit conflicting entries for the same index.
- **Commit rule:** a leader only counts replicas for entries from its own term when advancing the commit index; older entries become committed indirectly.

## Sizing a cluster
| Nodes | Majority | Failures tolerated |
|---|---|---|
| 3 | 2 | 1 |
| 5 | 3 | 2 |
| 7 | 4 | 3 |
Even numbers add cost without extra tolerance: 4 nodes still tolerate only 1 failure. Larger clusters also make every write slower, so 3 or 5 is typical.

:::note Split brain and fencing
In a network partition, the minority side cannot elect a leader, so it stops accepting writes. An old leader that was paused (GC, VM freeze) may still think it leads; its stale term causes followers to reject its messages. Systems that act on external resources also use **fencing tokens**: the term or epoch is attached to every action, and storage rejects tokens older than the newest it has seen. Kafka's leader epochs and producer epochs are this idea.
:::

## Where you see Raft
KRaft stores Kafka's cluster metadata in a Raft log, replacing ZooKeeper. etcd (Kubernetes' brain), Consul, CockroachDB, TiDB and YugabyteDB use Raft. ZooKeeper uses a similar protocol called ZAB.`,
iq:[
 ["I","How does Raft elect a leader?","A follower that stops hearing heartbeats waits a random timeout, becomes a candidate, increments the term, votes for itself and asks others for votes. Each node votes at most once per term and only for candidates with an up-to-date log. A candidate with a majority becomes leader and starts sending heartbeats."],
 ["I","Why do consensus clusters use an odd number of nodes?","Progress needs a majority. A cluster of 2f+1 nodes tolerates f failures; adding one node to make it even raises the majority size without tolerating more failures, so it adds cost and latency without benefit."],
 ["S","How does Raft guarantee that a committed entry is never lost?","An entry is committed only when stored on a majority. Elections require a majority of votes, and voters refuse candidates with less up-to-date logs. Because any two majorities intersect, every possible winner has the committed entry, so later leaders never overwrite it."]
]},
{t:"Partitioning and consistent hashing", hard:true, d:"Splitting data across machines without hot spots.",
k:["Range partitioning keeps order but risks hot spots; hash partitioning spreads load but loses ordering.","Consistent hashing moves only a small share of keys when nodes join or leave.","Virtual nodes even out load across machines.","Secondary indexes are either local (scatter-gather reads) or global (slower writes)."],
dd:`## Why partition
One machine eventually runs out of disk, memory or throughput. Partitioning (also called sharding) splits data so each node owns a subset. Every distributed data system you use partitions: Kafka topics, Cassandra and DynamoDB tables, Spark DataFrames, Iceberg partitions, Redshift slices.

## Two basic schemes
:::lanes Range vs hash partitioning
# Range
Keys sorted into ranges :: A-F on node 1, G-M on node 2
Range scans stay on few nodes :: great for time ranges
Risk: hot spots :: all of today's writes hit one range
Used by :: HBase, Bigtable, TiDB, Spanner, Iceberg date partitions
# Hash
hash(key) picks the partition :: spreads keys evenly
Range scans hit every partition :: order is lost
Risk: one hot key still hurts :: a celebrity user or a huge merchant
Used by :: Kafka keys, Cassandra, DynamoDB, Spark shuffles
:::

## The rebalancing problem with modulo
With «partition = hash(key) mod N», changing N from 10 to 11 moves almost every key to a different node. That is acceptable for Spark (each shuffle recomputes placement) and is why Kafka warns you about adding partitions, but it is terrible for a database that must physically move data.

## Consistent hashing
:::flow Consistent hashing
Hash nodes onto a ring :: positions 0 .. 2^64
Hash each key onto the same ring :: same hash function
Walk clockwise to the first node :: that node owns the key
Add a node :: it takes keys only from its clockwise neighbour
Remove a node :: its keys move only to the next node
Use virtual nodes :: each server owns many small ring segments
:::
When a node joins or leaves, only about 1/N of the keys move. **Virtual nodes** (vnodes) give each physical server many points on the ring, which evens out load and spreads the work of rebuilding a failed node across all others. Cassandra and DynamoDB's original design use this idea. Another approach, used by Kafka and Elasticsearch, is a fixed number of partitions assigned to nodes: rebalancing moves whole partitions, never re-hashes keys.

## Hot keys
Hashing does not save you from one key receiving most of the traffic. Mitigations:
- Add a random or time-based suffix to the hot key (write sharding) and merge on read.
- Cache reads for hot keys.
- Handle hot keys in a separate path (the salting trick from Spark joins).

## Secondary indexes
| Type | How | Reads | Writes |
|---|---|---|---|
| Local (document-partitioned) | Each partition indexes its own rows | Must query every partition (scatter-gather) | Cheap, one partition |
| Global (term-partitioned) | The index is itself partitioned by the indexed value | One partition | Touch several partitions, often async |
DynamoDB's global secondary indexes are global and eventually consistent; Cassandra's built-in secondary indexes are local, which is why they are discouraged for high-cardinality queries.`,
iq:[
 ["I","Compare range and hash partitioning.","Range partitioning keeps keys in sorted ranges, so range scans are efficient, but sequential keys like timestamps create hot spots. Hash partitioning spreads keys evenly and avoids those hot spots, but range queries must hit all partitions. Many systems combine them, for example hash on the partition key and sort within it."],
 ["I","What problem does consistent hashing solve?","With hash mod N, changing N remaps almost every key. Consistent hashing places nodes and keys on a ring so that adding or removing a node moves only the keys in its segment, about 1/N of the data. Virtual nodes keep the load balanced."],
 ["S","One DynamoDB partition key receives 40% of writes and is being throttled. What do you do?","Spread that key's writes with write sharding (append a suffix 0..N-1 and query all suffixes on read, or aggregate them asynchronously), cache hot reads, and review the access pattern: the key may be too coarse. Adaptive capacity helps briefly but does not fix a single key above per-partition limits."]
]},
{t:"Distributed transactions, outbox and sagas", hard:true, d:"Keeping a database and Kafka in agreement.",
k:["Writing to a database and then to Kafka (dual write) can leave them inconsistent.","Two-phase commit is atomic but blocks if the coordinator fails.","The transactional outbox pattern with CDC is the standard fix.","Sagas replace one big transaction with steps and compensations; idempotency keys make retries safe."],
dd:`## The dual-write problem
A payment service saves a payment row and publishes a "payment created" event to Kafka. Two separate writes, no shared transaction:
:::lanes Two ways a dual write breaks
# DB first, then Kafka
Commit payment row :: succeeds
Publish to Kafka :: the process crashes before sending
Result :: payment exists, nobody downstream knows
# Kafka first, then DB
Publish event :: succeeds
Commit payment row :: fails a constraint
Result :: downstream acts on a payment that never existed
:::
Retries don't fix it, and the two systems can also see the writes in different orders under concurrency.

## Two-phase commit (2PC)
:::flow Two-phase commit
Coordinator sends PREPARE :: to every participant
Participants make the change durable :: and hold locks
Participants vote YES or NO :: a YES is a promise to commit if asked
All YES: coordinator logs COMMIT :: any NO means ABORT
Coordinator sends the decision :: participants commit or roll back and release locks
:::
2PC gives atomicity across systems, but if the coordinator dies after participants vote YES, they are stuck holding locks until it recovers ("in doubt"). It also needs every participant to support it (XA). Most modern architectures avoid 2PC across services.

## Transactional outbox
:::flow Transactional outbox with CDC
Begin one database transaction :: in the service's own database
Insert the business row :: payments
Insert the event row :: into an outbox table, same transaction
Commit :: both rows or neither
Debezium reads the outbox from the binlog :: the outbox event router routes by aggregate type
Event lands in Kafka :: keyed by aggregate ID for ordering
:::
The database transaction is the only atomic step, and CDC turns it into an event reliably. Delivery is at least once, so consumers must be idempotent. Old outbox rows can be deleted right after insert in the same transaction or cleaned on a schedule, because CDC reads the log, not the table.

## Sagas
For a business process spanning services (reserve inventory, charge the card, create the shipment), a **saga** runs a series of local transactions. If a step fails, earlier steps are undone by **compensating** actions (release inventory, refund the card).
- **Choreography:** each service reacts to events from the previous one. Simple, but the flow is hard to see.
- **Orchestration:** a coordinator (Temporal, Step Functions, a custom service) tells each service what to do next. Easier to monitor and change.
Sagas give eventual consistency, not isolation: other processes can see intermediate states.

## Idempotency keys
Networks fail after a request is processed but before the response arrives, so clients retry. Payment APIs accept an **idempotency key** per logical operation, store the key with the result, and return the stored result on a retry instead of charging twice. Downstream consumers apply the same idea: dedupe by event ID, or make writes upserts keyed by business ID.

:::tip Interview framing
When asked how to keep a database and Kafka in sync, say: avoid dual writes; use a transactional outbox (or CDC on the business tables), with at-least-once delivery and idempotent consumers. Mention 2PC only to explain why you are not using it.
:::`,
iq:[
 ["I","What is the dual-write problem?","Writing the same change to two systems (for example a database and Kafka) in separate operations. A crash or failure between them, or concurrent writes in different orders, leaves the systems inconsistent, and retries alone cannot fix it."],
 ["I","Explain the transactional outbox pattern.","The service writes its business change and an event row into an outbox table in the same local database transaction. A CDC tool such as Debezium reads committed outbox rows from the log and publishes them to Kafka. The database transaction guarantees the event exists if and only if the change committed; consumers handle at-least-once delivery idempotently."],
 ["S","Why is two-phase commit rarely used between microservices?","It requires all participants to support a prepare phase, holds locks across network round trips, and blocks participants in an in-doubt state if the coordinator fails after they vote yes. It couples availability of all services together. Outbox plus sagas give looser coupling with eventual consistency."],
 ["S","Design idempotent payment processing for client retries.","Clients send a unique idempotency key per payment attempt. The API stores the key with the request hash and result in a table with a unique constraint. A retry with the same key returns the stored result; a concurrent duplicate hits the constraint and waits or returns the in-progress status. Downstream, events carry the payment ID and consumers upsert by it."]
]},
{t:"Time, clocks and ordering", hard:true, d:"Why timestamps lie and how systems order events anyway.",
k:["Physical clocks drift and jump; NTP keeps them only roughly in sync.","Last-write-wins by timestamp can silently drop writes.","Lamport and vector clocks capture order without trusting wall clocks.","Kafka gives order per partition; event time is a separate concept."],
dd:`## Physical clocks are unreliable
Every machine's quartz clock drifts. NTP corrects it, but typical skew between servers is milliseconds and can be much worse on a bad network or a paused VM. Clocks can also jump backwards when NTP steps them. Two consequences:
- A timestamp from machine A and one from machine B cannot be compared precisely.
- Measuring durations with the wall clock is wrong; use a monotonic clock.

## Last-write-wins can lose data
:::flow How last-write-wins drops an update
Node A's clock is 50 ms fast :: nobody notices
Client 1 writes balance = 100 via node A :: stamped 12:00:00.150
Client 2 writes balance = 80 via node B 30 ms later :: stamped 12:00:00.130
Replicas compare timestamps :: 0.150 is "newer"
The later write (80) is discarded :: silently
:::
Cassandra and other systems that resolve conflicts by timestamp are exposed to this. Avoid concurrent updates to the same key, or use conditional writes (compare-and-set), or design data as append-only events.

## Logical clocks
**Lamport clocks** give a total order consistent with causality without trusting wall time:
:::flow Lamport clock rules
Each process keeps a counter :: starts at 0
Increment before each event :: local step or send
Attach the counter to messages :: as a timestamp
On receive, take max(local, received) + 1 :: so effects come after causes
Break ties by process ID :: total order
:::
If A happened before B, then L(A) < L(B). The reverse is not true: a smaller Lamport timestamp does not prove causality.
**Vector clocks** keep one counter per node. Comparing two vectors tells you whether one event happened before the other or whether they were **concurrent**, which is what you need to detect conflicts. Their size grows with the number of writers.
**Hybrid logical clocks (HLC)** combine physical time with a logical counter, staying close to wall time while preserving causality. CockroachDB and YugabyteDB use them. Google Spanner instead uses TrueTime, with GPS and atomic clocks giving bounded uncertainty, and waits out that uncertainty before committing.

## Ordering in data pipelines
- **Kafka** orders records within a partition by offset. Keying by entity ID gives a per-entity order; there is no global order.
- **CDC** follows commit order in the binlog for one database, but events from different databases or tables have no shared order.
- **Event time** is when something happened at the source; it is for business logic (windows, reports), not for deciding which copy of a row is newest.
- To decide which version of a row wins, prefer a source-provided version: the binlog position or GTID, a row version column, or a monotonically increasing sequence, rather than comparing timestamps from different machines.

:::note Fencing tokens again
A lock service hands out locks with an increasing token. If a client pauses for a long GC, its lock expires and another client gets a higher token. When the paused client wakes up and writes, storage rejects its older token. This protects against the "I thought I still held the lock" bug that timeouts alone cannot prevent.
:::`,
iq:[
 ["I","Why is last-write-wins based on timestamps dangerous?","Clocks on different nodes are skewed, so a write that happened later in real time can carry an earlier timestamp and be discarded silently. Concurrent writes also lose one value without detection. Use version numbers, conditional writes, or append-only designs instead."],
 ["S","What is the difference between Lamport clocks and vector clocks?","A Lamport clock is a single counter that orders events consistently with causality, but cannot tell whether two events are concurrent. A vector clock keeps a counter per node; comparing vectors shows whether one event happened before another or whether they were concurrent, which allows conflict detection at the cost of larger metadata."],
 ["S","In a CDC pipeline, how do you decide which version of a row is the latest?","Use ordering from the source log rather than wall clocks: within one MySQL database, the binlog position or GTID sequence, and Kafka partition order when keyed by primary key. When merging from several sources, use an explicit row version column maintained by the application. Event timestamps are for business time, not version ordering."]
]}
]});

/* ---------- Diagrams added to existing deep dives ---------- */
const D = window.RM_DEEP || {};
const extend = (id, text) => { if (D[id] && D[id].dd) D[id].dd += "\n\n" + text; };
extend("de-2-1", `## The write path, end to end
:::flow An UPDATE in InnoDB
Find the row :: walk the clustered index B+tree; read the page into the buffer pool if needed
Lock the record :: an exclusive row lock
Write undo :: the old version, for rollback and MVCC readers
Change the page in memory :: the page becomes dirty
Write redo :: a small record into the log buffer
COMMIT :: redo fsync, binlog fsync, commit mark
Flush later :: page cleaner writes the page through the doublewrite buffer
:::
## A consistent read
:::flow SELECT under REPEATABLE READ
First read creates a read view :: list of active transaction IDs
Find the row :: through the index
Is its trx_id visible? :: committed before the view and not in the active list
If not, follow the undo pointer :: rebuild the previous version
Repeat until a visible version :: or the row did not exist yet
:::`);
extend("de-3-1-1", `## Life of a Spark job
:::flow What happens after you call .write()
Action called :: on the driver
Catalyst builds the physical plan :: see the Catalyst topic
DAG scheduler splits stages :: at every Exchange (shuffle)
Task scheduler launches tasks :: one per partition, onto free executor cores
Stage 1 tasks write shuffle files :: to local disk
Stage 2 tasks fetch and process :: then write output files
Job commits :: the table format commit makes output visible
:::`);
extend("de-4-1", `## A record's journey
:::flow From producer to consumer
Producer serialises and partitions :: key hash picks the partition
Batch fills :: linger.ms and batch.size
Leader appends to the active segment :: page cache, then disk
Followers replicate :: high watermark advances
Consumer polls from its offset :: up to the high watermark
Consumer commits its offset :: to __consumer_offsets
:::`);
extend("de-4-2", `## Snapshot to streaming, in detail
:::flow Debezium first start
Connect as a replica :: read server ID, GTID mode, binlog format
Record the current binlog position :: the snapshot's consistency point
Read each table in chunks :: emit op = r events
Switch to the binlog :: from the recorded position
Emit change events :: c / u / d, keyed by primary key
Commit offsets periodically :: to Kafka Connect's offset topic
:::`);
extend("de-5-1", `## The read path
:::flow How a query reads an Iceberg table
Ask the catalog :: get the current metadata.json location
Read metadata.json :: schema, partition specs, current snapshot
Read the manifest list :: skip manifests by partition ranges
Read the remaining manifests :: skip data files by column min/max
Plan splits :: group files and row groups into tasks
Read data files and apply deletes :: position deletes, equality deletes
:::`);
extend("de-6-1", `## Task lifecycle
:::flow States a task instance moves through
scheduled :: dependencies met, waiting for a slot
queued :: sent to the executor
running :: on a worker
success / failed :: failure may become up_for_retry
up_for_retry :: waits retry_delay, then runs again
upstream_failed / skipped :: downstream effects of failures and branching
:::`);
})();
