// Deep dives (dd, mini-markdown: ## heading, - bullet, 1. list, ~~~ code fence, **bold**, «code»)
// and interview questions (iq: [level, question, model answer]; B = fundamentals, I = intermediate, S = senior).
window.RM_DEEP = Object.assign(window.RM_DEEP || {}, {

"de-1-1-1": {dd:`## What a join means
Logically, a join is the Cartesian product of two tables filtered by the ON condition. An inner join keeps only the pairs that satisfy it. A left outer join keeps every left row, and where nothing matches, the right-hand columns are NULL. A full outer join does that on both sides. Engines never build the full product, but whatever algorithm they use must return exactly this result.

## Cardinality causes most join bugs
Before writing a join, say the relationship out loud: one-to-one, one-to-many or many-to-many. Joining orders (one) to payments (many) returns one row per payment, so order-level columns repeat and SUM(order.amount) overcounts. Two fixes:
- Aggregate the many side to the join grain first, then join.
- Use EXISTS when you only need to know that a match exists.
A quick guard in any pipeline: compare COUNT(*) of the driving table before and after the join.

## Semi and anti joins
«EXISTS» is a semi join: each left row is returned at most once, however many matches exist. «NOT EXISTS» is an anti join. Prefer it to «NOT IN»: if the subquery returns a single NULL, «x NOT IN (...)» is unknown for every row and the query returns nothing.

## ON vs WHERE in outer joins
In a LEFT JOIN, conditions in ON decide which right rows match, and unmatched left rows still survive. Conditions in WHERE run after the join and remove rows, including the NULL-extended ones. So «LEFT JOIN payments p ON p.order_id = o.id WHERE p.status = 'SUCCESS'» behaves like an inner join. Move the status filter into ON to keep orders that have no successful payment.

## How engines execute joins
- **Nested loop:** for each outer row, look up matches in the inner side. Fast when the outer side is small and the inner side has an index on the join key.
- **Hash join:** build a hash table on the smaller input, then probe it with the larger one. Best for large equi-joins without useful indexes; needs memory and spills to disk otherwise. MySQL has it since 8.0.18.
- **Sort-merge join:** sort both inputs on the key and walk them together. Good for very large inputs, or when inputs are already sorted. Spark's default for big-to-big joins.

## Set operations
«UNION» removes duplicates with a sort or hash; «UNION ALL» just appends and is cheaper. «INTERSECT» and «EXCEPT» compare whole rows and treat two NULLs as equal, unlike join conditions.`,
iq:[
 ["B","What is the difference between INNER, LEFT and FULL OUTER JOIN?","INNER returns only matching pairs. LEFT returns every left row plus matches, with NULLs on the right when there is no match. FULL OUTER returns every row from both sides, NULL-filling whichever side has no match. Mention that the result can have more rows than either input when keys repeat."],
 ["I","A revenue report doubled after someone added a join. How do you find and fix the problem?","Check the cardinality of the new join. Compare COUNT(*) before and after, then find keys that repeat on the joined side: «SELECT key, COUNT(*) FROM t GROUP BY key HAVING COUNT(*) > 1». The fix is to aggregate that side to the report's grain before joining, deduplicate it, or use EXISTS if it was only used as a filter. Add a row-count test so it cannot happen silently again."],
 ["I","Why is NOT EXISTS safer than NOT IN?","NOT IN compares against every value in the list. If any value is NULL, the comparison x <> NULL is unknown, so the whole predicate is never true and the query returns zero rows. NOT EXISTS checks for the existence of a matching row and is not affected by NULLs. Optimizers also turn NOT EXISTS into an efficient anti join."],
 ["S","When does an engine choose a hash join over a nested loop join, and what can make it the wrong choice?","Nested loop wins when the outer input is small and the inner side has an index on the join key, because each probe is a few page reads. Hash join wins for large equi-joins without useful indexes. It goes wrong when row estimates are off: a nested loop over an outer input estimated at 100 rows that is really 10 million becomes very slow. Stale statistics are the usual cause, so check estimated vs actual rows in EXPLAIN ANALYZE."]
]},

"de-1-1-2": {dd:`## What a window function does
A window function computes a value for each row from a set of related rows, the window, without collapsing rows the way GROUP BY does. The form is «function() OVER (PARTITION BY ... ORDER BY ... frame)». Windows are evaluated after WHERE, GROUP BY and HAVING and before ORDER BY and LIMIT. That is why you cannot filter on them in WHERE. Wrap the query, or use QUALIFY where it exists (Snowflake, BigQuery, Databricks).

## Three families
- **Ranking:** ROW_NUMBER, RANK, DENSE_RANK, NTILE, PERCENT_RANK.
- **Offset:** LAG, LEAD, FIRST_VALUE, LAST_VALUE, NTH_VALUE.
- **Aggregates over a window:** SUM, AVG, COUNT, MIN, MAX.

## Frames, and the default that surprises people
With ORDER BY and no frame, the default is «RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW». RANGE treats rows with equal ORDER BY values as peers, so all ties get the same running total. ROWS counts physical rows instead.

For a 7-day moving average over daily rows, «ROWS BETWEEN 6 PRECEDING AND CURRENT ROW» works only if there is exactly one row per day. If days can be missing, use a range frame on dates where supported, or fill missing dates from a calendar table first.

LAST_VALUE with the default frame returns the current row, not the last one in the partition. Use «ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING».

## Patterns worth memorising
- **Latest row per key:** ROW_NUMBER() ordered by updated_at DESC, keep rn = 1. Add a tiebreaker column so the result is deterministic.
- **Top N per group:** rank in a subquery, filter rank <= N.
- **Change detection:** «LAG(status) OVER (PARTITION BY id ORDER BY ts) <> status».
- **Gaps and islands:** consecutive dates minus ROW_NUMBER give the same value inside a streak.

~~~
-- Longest login streak per user
SELECT user_id, MIN(d) AS streak_start, MAX(d) AS streak_end, COUNT(*) AS days
FROM (
  SELECT user_id, d,
         DATE_SUB(d, INTERVAL ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY d) DAY) AS grp
  FROM daily_logins
) t
GROUP BY user_id, grp;
~~~

## Cost
Each distinct PARTITION BY plus ORDER BY combination needs a sort, and in Spark a shuffle first. Reuse the same window specification where you can. In Spark, a window with no PARTITION BY moves every row to a single task, which is slow or fails on large data.`,
iq:[
 ["B","Explain ROW_NUMBER, RANK and DENSE_RANK with an example.","For values 90, 90, 80: ROW_NUMBER gives 1, 2, 3 (arbitrary order between ties), RANK gives 1, 1, 3 (skips after ties), DENSE_RANK gives 1, 1, 2 (no gaps). Use ROW_NUMBER for deduplication, DENSE_RANK for 'Nth highest value' questions."],
 ["I","Find the top 3 merchants by GMV in each city.","Aggregate GMV per city and merchant, rank with «DENSE_RANK() OVER (PARTITION BY city ORDER BY gmv DESC)» in a subquery or CTE, then filter rank <= 3. Say whether ties should all be included (DENSE_RANK or RANK) or exactly 3 rows (ROW_NUMBER with a tiebreaker)."],
 ["I","Find each user's longest streak of consecutive login days.","Deduplicate to one row per user per day. Subtract ROW_NUMBER (ordered by date, partitioned by user) days from the date: inside a streak this value is constant. Group by user and that value, count days, then take the max per user."],
 ["S","Why can a window function be slow in Spark, and how do you fix it?","Spark must shuffle by the PARTITION BY keys and sort within each partition. Without PARTITION BY, all rows go to one task. With a skewed key, one task gets most rows. Fixes: always partition, pre-filter or pre-aggregate, handle hot keys separately, and reuse the same window spec so Spark sorts once."]
]},

"de-1-1-3": {dd:`## B+tree indexes
Most relational indexes are B+trees: a shallow, balanced tree whose leaf pages hold keys in sorted order and are linked to each other. A lookup costs a few page reads, because three or four levels cover billions of rows. Sorted, linked leaves let a B+tree serve equality, ranges and ORDER BY on its key prefix.

## Composite indexes and the leftmost prefix
An index on (a, b, c) is sorted by a, then b, then c. It can seek on a; on a and b; or on a, b and c. A range condition on b stops c from being used for seeking. Put equality columns first and the range column last. An index on (merchant_id, created_at) serves "merchant 42 in November" well. One on (created_at, merchant_id) cannot seek on the merchant.

## Clustered and secondary indexes in InnoDB
InnoDB stores the rows themselves inside the primary key B+tree, the clustered index. Secondary indexes store their columns plus the primary key. So a query that needs other columns does a second walk through the clustered index for each match. A **covering index** contains every column the query needs and avoids that second walk; EXPLAIN shows "Using index".

This is also why random primary keys such as UUIDv4 hurt: inserts land on random pages (page splits, poor cache use), and every secondary index carries the wide key.

## Reading EXPLAIN
In MySQL look at:
- «type»: const and eq_ref are best, then ref, range, index (full index scan), ALL (full table scan).
- «key» and «rows»: which index, and how many rows it expects to examine.
- «Extra»: "Using index" (covering), "Using filesort" (extra sort), "Using temporary".
«EXPLAIN ANALYZE» runs the query and shows actual rows and time per step. A big gap between estimated and actual rows means stale or missing statistics, which leads to bad join orders.

## Why an index gets ignored
- A function or cast on the column: «DATE(created_at) = ...», or comparing a string column to a number.
- A leading wildcard: «LIKE '%abc'».
- Low selectivity: reading 30% of the table through an index is slower than scanning it.
- OR across different columns.
- Stale statistics.

## What indexes cost
Every index is updated on insert, delete and updates of its columns. Each takes buffer pool memory and slows bulk loads. Find and drop unused ones, for example with «sys.schema_unused_indexes» in MySQL.`,
iq:[
 ["B","What is a covering index?","An index that contains every column a query needs, so the engine answers from the index alone without reading the table rows. In InnoDB it avoids the second lookup into the clustered index. EXPLAIN shows 'Using index'."],
 ["I","You have an index on (a, b, c). Which of these can use it to seek: WHERE a=1; WHERE b=2; WHERE a=1 AND c=3; WHERE a=1 AND b>5 AND c=3?","a=1: yes. b=2: no, a is missing (at best a full index scan). a=1 AND c=3: seeks on a only, then filters c. a=1 AND b>5 AND c=3: seeks on a and the range on b; c is filtered, not seeked, because it comes after a range column."],
 ["I","A query that ran in 50 ms now takes 20 s after the table grew. How do you investigate?","Run EXPLAIN ANALYZE and compare estimated vs actual rows. Check whether the access path changed (index to full scan), whether statistics are stale (ANALYZE TABLE), whether the filter is still selective, and whether the working set no longer fits in the buffer pool. Then fix with a better composite index, a rewritten predicate (remove functions on columns), fresh statistics, or archiving old data."],
 ["S","Why are UUIDv4 primary keys a problem in InnoDB and what would you use instead?","InnoDB clusters rows by primary key. Random UUIDs insert into random leaf pages, causing page splits, fragmentation and poor buffer pool hit rates, and every secondary index stores the 16-byte or 36-character key. Use an auto-increment BIGINT, or a time-ordered ID such as UUIDv7 or a snowflake ID stored as BINARY(16) or BIGINT, so inserts append at the right edge."]
]},

"de-1-4-2": {dd:`## Kimball's four steps
1. Choose the business process, for example card payments.
2. Declare the grain: one row per payment attempt.
3. Identify the dimensions: date, merchant, customer, payment method.
4. Identify the facts: amount, fee, success flag.
Never mix grains in one fact table. If you need both payment-level and daily-level numbers, build two tables.

## Types of fact table
- **Transaction:** one row per event. The most common type.
- **Periodic snapshot:** one row per entity per period, such as the daily balance per wallet.
- **Accumulating snapshot:** one row per process instance, updated as it reaches milestones (placed, paid, shipped, delivered), with a date column per milestone.

Measures are **additive** (amount: sums across every dimension), **semi-additive** (balance: sums across wallets but not across days; use the closing value or an average over time), or **non-additive** (ratios such as success rate). For ratios, store the numerator and denominator and divide at query time.

## Dimensions
Dimensions are wide, descriptive and denormalized. Give them **surrogate keys** (integers you generate) rather than source IDs. Surrogate keys let you keep history, and handle unknown or late members with a reserved row such as key -1, "Unknown". A rich date dimension (fiscal periods, holidays, weekday flags) removes a lot of repeated date logic.

## Slowly changing dimensions
- **Type 0:** never changes.
- **Type 1:** overwrite; history is lost.
- **Type 2:** a new row per change with valid_from, valid_to and is_current. Facts link to the version valid at the event time.
- **Type 3:** keep the previous value in an extra column.

A Type 2 load compares incoming rows with current rows using a hash of the tracked columns, closes changed rows and inserts new versions:

~~~
MERGE INTO dim_merchant d
USING (
  SELECT s.*, md5(concat_ws('|', name, city, category)) AS h FROM stg_merchant s
) s
ON d.merchant_id = s.merchant_id AND d.is_current
WHEN MATCHED AND d.row_hash <> s.h THEN
  UPDATE SET valid_to = current_date - 1, is_current = false;
-- then insert a new current row for every merchant without a current row
INSERT INTO dim_merchant (merchant_key, merchant_id, name, city, category, row_hash,
                          valid_from, valid_to, is_current)
SELECT next_key(), s.merchant_id, s.name, s.city, s.category,
       md5(concat_ws('|', s.name, s.city, s.category)),
       current_date, DATE '9999-12-31', true
FROM stg_merchant s
LEFT JOIN dim_merchant d ON d.merchant_id = s.merchant_id AND d.is_current
WHERE d.merchant_id IS NULL;
~~~

## Late-arriving data
A fact may arrive before its dimension row (a payment for a merchant onboarded seconds ago). Insert an "inferred" dimension row with only the natural key, point the fact at it, and fill in its attributes when the real record arrives.

## Star, snowflake, one big table
A star keeps dimensions flat: fewer joins and easier for BI tools. A snowflake normalizes dimensions, which saves little space today. Many lakehouse teams keep a star as the core and add wide, denormalized tables for specific dashboards.`,
iq:[
 ["B","What is the difference between a fact table and a dimension table?","A fact table records measurable events at a declared grain, with foreign keys to dimensions plus numeric measures. It is long and narrow. A dimension table describes the who, what, where and when with descriptive attributes. It is shorter and wide. Facts are aggregated; dimensions are used to filter and group."],
 ["I","Design a schema for a payments analytics platform.","Grain: one row per payment attempt in fact_payment_attempt, with date_key, time_key, merchant_key, customer_key, method_key, gateway_key and status, plus amount, fee, latency_ms and is_success. Dimensions: date, merchant (SCD2 for city and category), customer, payment method, gateway. Add a daily snapshot fact for merchant settlements. Discuss partitioning by date and how refunds become a separate fact linked by payment_id."],
 ["I","How do you implement SCD Type 2?","Detect changes by comparing a hash of the tracked columns between staging and the current dimension rows. For changed keys, set valid_to and is_current = false on the current row, then insert a new row with a new surrogate key, valid_from = change date and is_current = true. New keys get a first version. Facts look up the surrogate key whose validity range contains the event time."],
 ["S","How do you handle a semi-additive measure like account balance in reporting?","Store it in a periodic snapshot (one row per account per day). Summing across accounts on one day is valid; summing across days is not. For a month, report the closing balance (last day), or the average daily balance. In BI, set the aggregation to last-non-empty or average across the time dimension."]
]},

"de-1-4-3": {dd:`## Two levels of pruning
Query engines on a lakehouse skip data at two levels:
1. **Partitions:** whole directories (or Iceberg partition values) excluded by the filter.
2. **File and row-group statistics:** min and max per column, used to skip files inside the remaining partitions.
Partitioning gives coarse pruning; sorting gives fine pruning, because sorted data produces narrow, non-overlapping min/max ranges.

## Choosing a partition column
Pick a column that almost every query filters on, with low enough cardinality that each partition still holds hundreds of MB or more. For event data that is usually the event date. Avoid:
- High-cardinality columns such as merchant_id or user_id: millions of tiny partitions.
- Very fine time grains (hour or minute) on modest volumes: too many small files.
- Columns that queries rarely filter on.
A rough check: total daily volume divided by partitions per day should be at least a few hundred MB. Iceberg's bucket(N, col) transform helps when you need to spread a high-cardinality join key over a fixed number of buckets.

## Sorting and clustering
Within each partition, sort by the next most common filter, such as merchant_id. Then a query for one merchant reads a handful of files instead of all of them. Iceberg supports a declared sort order («WRITE ORDERED BY»); compaction can apply it. Z-ordering mixes several columns when queries filter on different ones.

## File sizes
Aim for roughly 128 MB to 1 GB per data file. Too small and planning, S3 requests and per-file overhead dominate. Too large and you lose parallelism and pruning precision. Streaming writers create small files by nature, so schedule compaction.

## Schema design
- Use proper types: DECIMAL for money, TIMESTAMP with a clear time zone convention (store UTC), not strings.
- Keep raw (bronze), cleaned (silver) and business-ready (gold) layers separate so you can rebuild downstream tables from raw.
- Add ingestion metadata columns such as ingested_at and source_offset for debugging and deduplication.`,
iq:[
 ["B","Why is partitioning by user_id usually a bad idea?","It creates a partition per user: millions of tiny partitions and files. Planning becomes slow, S3 requests multiply, and each file is too small to read efficiently. Partition by a low-cardinality column queries filter on (often date) and sort or bucket by user_id inside it."],
 ["I","Queries filter by date and merchant_id. How would you lay out the table?","Partition by day of the event timestamp, and sort data within each partition by merchant_id (or bucket by merchant_id if joins on it dominate). Partition pruning removes other days and file statistics on merchant_id skip most files within the day. Keep file sizes around 256-512 MB with compaction."],
 ["S","Your lake table has 2 million files and queries spend most of their time planning. What do you do?","Compact data files to a sensible target size (rewrite_data_files), rewrite manifests so they group files by partition, expire old snapshots, and remove orphan files. Then fix the cause: writers producing tiny files (repartition before writing, longer commit intervals for streaming, fewer partitions). Revisit the partition spec if it is too fine."]
]},

"de-2-1": {dd:`## The two promises
A transactional database promises **durability** (a committed change survives a crash) and **isolation** (concurrent transactions do not see each other's half-finished work). Almost every internal mechanism exists to keep these promises while staying fast.

## Pages and the buffer pool
Data lives in fixed-size pages (16 KB in InnoDB, 8 KB in Postgres). Reads and writes happen on pages in memory, in the buffer pool (InnoDB) or shared buffers (Postgres). A hit avoids disk I/O; the hit rate is one of the first health metrics to watch. Changed pages are "dirty" and are written back later by background threads.

## Write-ahead logging
Writing a whole 16 KB page on every commit would be slow and random. Instead, the database first writes a small, sequential log record describing the change (redo log in InnoDB, WAL in Postgres) and fsyncs it at commit. After a crash, recovery replays the log from the last checkpoint to rebuild any page that had not been written. A **checkpoint** marks how far the data files are known to be up to date, so older log can be reused.

## MVCC: readers do not block writers
Both MySQL and Postgres keep multiple versions of a row so a reader can see a consistent snapshot while writers change data.
- **InnoDB** updates the row in place and keeps the old version in the **undo log**. A reader whose snapshot is older follows the undo chain to rebuild the version it should see. Long-running transactions keep undo alive and slow the purge thread, which grows the history list length.
- **Postgres** writes a new row version (tuple) and marks the old one dead. **VACUUM** later reclaims dead tuples. Long transactions and disabled autovacuum cause table bloat.

## Isolation levels
- **Read uncommitted:** can see uncommitted changes (dirty reads).
- **Read committed:** each statement sees data committed before it started. Postgres default.
- **Repeatable read:** the whole transaction sees one snapshot. InnoDB default; InnoDB also uses next-key locks to block phantoms for locking reads.
- **Serializable:** behaves as if transactions ran one at a time.

## Where it connects to data engineering
CDC reads the binlog or WAL. Long ETL reads on a primary can hold back purge or vacuum. Bulk deletes generate huge log volumes and replica lag. Knowing these internals explains most production incidents around OLTP sources.`,
iq:[
 ["B","What does ACID stand for?","Atomicity (all or nothing), Consistency (constraints hold before and after), Isolation (concurrent transactions do not interfere beyond the isolation level), Durability (committed data survives crashes). Give one mechanism each: undo for atomicity, constraints for consistency, MVCC and locks for isolation, write-ahead logging for durability."],
 ["I","How does MVCC work in InnoDB vs Postgres?","InnoDB updates rows in place and stores previous versions in the undo log; readers rebuild older versions from undo according to their read view, and purge removes undo no longer needed. Postgres writes a new tuple per update and marks the old one dead using xmin and xmax; VACUUM reclaims dead tuples. Both let readers avoid blocking writers. InnoDB's risk is a growing history list; Postgres's risk is bloat."],
 ["I","Why can a long-running analytics query on the primary hurt the OLTP workload?","It holds an old snapshot. InnoDB cannot purge undo newer than that snapshot, so undo grows and every read of hot rows follows longer version chains. In Postgres, VACUUM cannot remove dead tuples the snapshot might need, causing bloat. Run analytics on a replica or in the lake instead."],
 ["S","Walk through what happens on a crash right after a COMMIT returned OK in MySQL.","With innodb_flush_log_at_trx_commit=1 and sync_binlog=1, the redo and the binlog event were fsynced before OK. On restart, InnoDB replays redo from the last checkpoint to rebuild dirty pages. For transactions left in the prepared state, recovery checks the binlog: if the transaction is there it commits, otherwise it rolls back. So the committed change is present in both data and binlog, keeping replicas and CDC consistent."]
]},

"de-2-1-1": {dd:`## Why locks still exist with MVCC
MVCC lets plain reads avoid locks, but writes still conflict. Two transactions updating the same row must be serialized, and "SELECT ... FOR UPDATE" deliberately locks rows it reads.

## InnoDB lock types
- **Record lock:** locks one index record.
- **Gap lock:** locks the space between index records so nothing can be inserted there.
- **Next-key lock:** a record lock plus the gap before it. Used under REPEATABLE READ for locking reads and updates, to prevent phantoms.
- **Insert intention lock:** a gap lock taken by inserts; different inserts into the same gap do not block each other unless they hit the same position.
Locks are taken on index records. An UPDATE whose WHERE clause cannot use an index scans and locks far more rows than you expect.

## Anomalies by isolation level
- **Dirty read:** reading uncommitted data. Prevented from READ COMMITTED up.
- **Non-repeatable read:** the same row read twice returns different values. Prevented from REPEATABLE READ up.
- **Phantom:** a repeated range query returns new rows. Prevented by SERIALIZABLE, and by next-key locks in InnoDB for locking reads.
- **Lost update:** two read-modify-write transactions overwrite each other. Prevent with «SELECT ... FOR UPDATE», an atomic «UPDATE ... SET x = x + 1», or optimistic version checks.

## Deadlocks
A deadlock is a cycle: A waits for B while B waits for A. InnoDB detects it and rolls back the smaller transaction, returning error 1213 to the application, which should retry. Reduce them by:
- Touching rows in a consistent order (for example by primary key).
- Keeping transactions short, with no network calls inside.
- Using indexes so fewer rows are locked.
- Inspecting «SHOW ENGINE INNODB STATUS» for the latest deadlock.

## Long transactions
A long open transaction holds its locks and its snapshot. Other writers queue behind it (lock wait timeouts), and purge cannot clean undo. Monitor «information_schema.innodb_trx» for old transactions and kill or fix the offender.`,
iq:[
 ["B","What is a deadlock and how does the database handle it?","Two or more transactions each hold a lock the other needs, forming a cycle. InnoDB detects the cycle and rolls back one transaction (usually the one that changed fewer rows), returning a deadlock error. The application should catch it and retry the transaction."],
 ["I","What is a lost update and how do you prevent it?","Two transactions read the same value, each modifies it in application code and writes it back; one change is lost. Prevent it with an atomic UPDATE (balance = balance - 100), a locking read (SELECT ... FOR UPDATE) before the change, or optimistic concurrency with a version column checked in the WHERE clause."],
 ["S","Why might an UPDATE in InnoDB lock far more rows than it changes?","Locks are placed on index records the statement scans. If the WHERE clause has no usable index, InnoDB scans the clustered index and, under REPEATABLE READ, takes next-key locks on everything it scans, effectively locking the table range. Add an index matching the predicate, or use READ COMMITTED, which releases locks on non-matching rows and disables most gap locking."]
]},

"de-2-1-2": {dd:`## What the binlog is
The binary log is MySQL's logical record of committed changes, written by the server layer after storage-engine commit preparation. It serves two purposes: replication, and point-in-time recovery. CDC tools such as Debezium read it the same way a replica does.

## Formats
- **STATEMENT:** logs the SQL text. Compact, but non-deterministic statements (NOW(), UUID(), LIMIT without ORDER BY) can diverge on replicas.
- **ROW:** logs the before and after image of each changed row. Larger, but exact. **Required for CDC.**
- **MIXED:** statement by default, row when unsafe.
With ROW format, «binlog_row_image=FULL» logs all columns; MINIMAL logs only changed columns and the key, which saves space but gives CDC consumers incomplete rows.

## How replication works
1. The primary commits and writes binlog events.
2. The replica's I/O thread pulls events and writes them to its relay log.
3. The replica's SQL (applier) threads apply them, in parallel when configured.
Asynchronous replication is the default: the primary does not wait for replicas. Semi-synchronous replication waits until at least one replica has received the event, trading latency for less data loss on failover.

## GTIDs
A Global Transaction Identifier (server_uuid:sequence) names every transaction. Replicas and CDC connectors track the set of GTIDs they have applied, so after a failover they can resume from the new primary without guessing file names and positions.

## Replica lag
Lag comes from a single-threaded applier on a write-heavy primary, very large transactions (a 10-million-row DELETE becomes one huge event group), missing primary keys (row events must scan to find rows), or an undersized replica. Measure it with Seconds_Behind_Source, or better, by writing heartbeat timestamps on the primary and reading them on the replica.

## Retention
«binlog_expire_logs_seconds» controls how long binlogs are kept. If a CDC connector is down longer than this, the binlog it needs is gone and it must re-snapshot. Size retention for your worst realistic outage.`,
iq:[
 ["B","What are the binlog formats and which one does CDC need?","STATEMENT logs SQL text, ROW logs before and after row images, MIXED switches between them. CDC needs ROW (ideally with binlog_row_image=FULL) so the consumer receives exact row values for every change."],
 ["I","A replica is lagging by 30 minutes. What could cause it and how do you fix it?","Causes: a large transaction (bulk update or delete), tables without primary keys forcing scans per row event, a single-threaded applier, an undersized replica, or long-running queries on the replica blocking the applier. Fixes: break bulk changes into batches, add primary keys, enable parallel replication (replica_parallel_workers with LOGICAL_CLOCK), size the replica like the primary, and move heavy reads elsewhere."],
 ["S","How do GTIDs help CDC and failover?","Each transaction gets a globally unique ID. A consumer stores the set of GTIDs it has processed rather than a file and offset specific to one server. After a failover, it connects to the new primary and asks for everything not in its set, so it resumes without gaps or duplicates, as long as the new primary has the binlogs."]
]},

"de-2-2": {dd:`## Row vs column storage
A row store keeps all columns of a row together, which suits fetching or updating whole records (OLTP). A column store keeps each column's values together, which suits analytics that read a few columns over many rows. Column storage also compresses far better, because values in one column are similar.

## Parquet layout
- A file is split into **row groups**, often around 128 MB of uncompressed data each.
- Each row group holds one **column chunk** per column.
- Each column chunk is divided into **pages** (around 1 MB), the unit of encoding and compression.
- The **footer** stores the schema, row group locations and statistics (min, max, null count) per column chunk. Readers read the footer first.

## Encodings and compression
- **Dictionary encoding:** replaces repeated values with small integer IDs. Great for columns like status or city.
- **Run-length encoding (RLE) and bit-packing:** compress runs of the same value and small integers.
- **Delta encoding:** stores differences between sorted numbers or timestamps.
Then a general codec compresses pages: Snappy (fast), ZSTD (better ratio, still fast), GZIP (slow). ZSTD is a good default today.

## Why it makes queries fast
- **Projection pushdown:** only the requested columns are read.
- **Predicate pushdown:** row groups (and pages, with page indexes) whose min and max cannot match the filter are skipped.
- **Vectorised reads:** engines process batches of column values at a time.
Sorting data on a filter column before writing makes min and max ranges narrow, so pushdown skips much more.

## Parquet, ORC and Avro
- **ORC:** columnar like Parquet, with built-in indexes; common in Hive ecosystems.
- **Avro:** row-oriented with an embedded schema and strong schema evolution rules. Used for Kafka messages and Iceberg manifests, not for analytic scans.

## Nested data
Parquet stores nested and repeated fields using definition and repetition levels (from Google's Dremel paper), so arrays and structs stay columnar.`,
iq:[
 ["B","Why are columnar formats faster for analytics?","Queries usually read a few columns across many rows. Columnar formats read only those columns, compress them well because similar values sit together, and keep min/max statistics so whole row groups can be skipped. Less I/O means faster and cheaper queries."],
 ["I","Explain predicate pushdown in Parquet.","The reader checks the filter against each row group's column statistics in the footer. If the min/max range cannot contain matching values (for example max(amount) < 5000 for amount > 5000), the row group is skipped without being read. It works best when data is sorted or clustered on the filter column."],
 ["S","When would you choose Avro over Parquet?","For row-at-a-time workloads where whole records are written and read: Kafka messages, write-heavy landing zones, and metadata files. Avro has a compact binary row format with an embedded schema and well-defined schema evolution. Parquet is for analytic scans over many rows and few columns."]
]},

"de-2-3": {dd:`## Why NoSQL exists
Relational databases scale writes vertically and make cross-node joins hard. NoSQL stores trade joins and sometimes consistency for horizontal scale, predictable latency and flexible schemas. The rule that replaces normalization: **model tables around your queries**.

## Wide-column: Cassandra
- Data is distributed by the **partition key** using consistent hashing; each partition lives on N replicas.
- Inside a partition, rows are sorted by **clustering columns**, so range reads within one partition are fast.
- Writes go to a commit log and an in-memory memtable, then are flushed to immutable SSTables that are compacted later (an LSM tree). Writes are very fast; reads may merge several SSTables.
- Consistency is tunable per query: with replication factor 3, QUORUM writes plus QUORUM reads always overlap on at least one replica.
- Deletes write tombstones; many tombstones slow reads until compaction removes them.

## Key-value and document: DynamoDB
- Items are addressed by a **partition key** and an optional **sort key**.
- **Global secondary indexes** give other access patterns, are eventually consistent and cost extra writes.
- Hot partitions (one key receiving most traffic) throttle. Spread load with better keys or write sharding.
- On-demand vs provisioned capacity is a cost decision.
- Single-table design stores several entity types in one table with overloaded keys to serve all access patterns with one query each.

## Document: MongoDB
Stores JSON-like documents. **Embed** data that is read together and bounded in size (order with its line items). **Reference** data that is shared or grows without bound (customer referenced from many orders). Sharding needs a well-chosen shard key for the same reasons as partition keys.

## CAP and PACELC
During a network partition, a distributed store chooses consistency or availability (CAP). PACELC adds: even without a partition, there is a trade-off between latency and consistency. Cassandra and DynamoDB lean towards availability and low latency by default, with stronger options available per request.`,
iq:[
 ["B","What is a partition key and why does it matter?","It decides which node stores a row, by hashing. A good partition key has many distinct values and spreads traffic evenly. A bad one creates hot partitions that throttle or overload one node, and very large partitions that are slow to read."],
 ["I","Design a Cassandra table to fetch the last 50 transactions for a card.","PRIMARY KEY ((card_id), txn_time, txn_id) with CLUSTERING ORDER BY (txn_time DESC). The query «WHERE card_id = ? LIMIT 50» reads one partition, already sorted newest first. For very active cards, add a time bucket (month) to the partition key to bound partition size."],
 ["S","Explain quorum consistency with replication factor 3.","A quorum is 2 of 3 replicas. If writes and reads both use QUORUM, any read set and write set overlap in at least one replica (2 + 2 > 3), so the read sees the latest acknowledged write. ONE is faster but may return stale data. The trade-off is latency and availability versus consistency."]
]}

});
