// Roadmap content. Node: t=title, d=one-line summary, k=what you need to know, p=practice task, f=link to an animated flow, c=children.
window.ROADMAPS = {
"de": {
  name:"Data Engineer", short:"Data Engineer",
  intro:"From SQL and storage internals to streaming, the lakehouse and pipeline system design. Roughly ordered: work top to bottom, but go deep where your job needs it.",
  c:[
  {t:"Foundations", d:"The skills every other topic leans on.", k:["SQL is the language you use most. Get fluent before you learn the tools around it.","Python is the glue for pipelines, tests and automation.","Data modeling decides whether your tables are a pleasure or a trap for years."], c:[
    {t:"SQL mastery", d:"Write correct, fast queries without guessing.", k:["Logical order of execution: FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT.","NULL semantics: NULL = NULL is unknown, COUNT(col) skips NULLs, NOT IN with a NULL returns nothing.","CTEs for readability; know when the engine inlines them vs materializes them."], c:[
      {t:"Joins and set operations", k:["Inner, left, full outer, semi (EXISTS) and anti (NOT EXISTS) joins.","Join fan-out: a one-to-many join silently multiplies rows and inflates SUMs.","UNION vs UNION ALL: UNION deduplicates and costs a sort or hash."], p:"Find customers with orders in October but none in November, using an anti-join."},
      {t:"Window functions", k:["ROW_NUMBER, RANK, DENSE_RANK and how ties differ.","LAG/LEAD for change detection; running totals with SUM() OVER (ORDER BY …).","Frame clauses: ROWS vs RANGE BETWEEN, and why the default frame surprises people."], p:"Dedupe a CDC table to the latest row per id with ROW_NUMBER()."},
      {t:"Query plans and indexes", k:["Read EXPLAIN / EXPLAIN ANALYZE: scan types, join algorithms, row estimates.","Composite index column order and the leftmost-prefix rule.","Covering indexes, selectivity, and why functions on columns block index use."], f:"mysql-read", p:"Take a slow query at work, read its plan and fix it with one index."}
    ]},
    {t:"Python for data", d:"Production-quality Python, not notebook scripts.", k:["Generators and iterators for streaming through large files without loading them.","Type hints, dataclasses or pydantic for configs and records.","Packaging, virtual environments, logging, and pytest with fixtures.","Know pandas for small data and when to switch to PySpark or Polars."], p:"Turn one of your scripts into a package with tests and a CLI."},
    {t:"Linux, Git and shell", k:["Pipes, grep, awk, jq, xargs for quick inspection of logs and files.","Processes, memory and disk tools: top, df, du, lsof.","Git branching, rebase vs merge, resolving conflicts, writing good commit messages."]},
    {t:"Data modeling", d:"Shape data for how it is written and how it is read.", k:["OLTP models optimise for writes and integrity; analytics models optimise for reads.","Grain is the first decision: what does one row mean?","Model for the questions people ask, not for the source system's layout."], c:[
      {t:"Normalization for OLTP", k:["1NF–3NF in practice: remove repeating groups and update anomalies.","Primary keys, foreign keys, surrogate vs natural keys.","When to denormalize on purpose for read-heavy paths."]},
      {t:"Dimensional modeling", k:["Facts (events, measures) and dimensions (context) in a star schema.","Slowly changing dimensions: Type 1 overwrite, Type 2 history with valid_from/valid_to.","Conformed dimensions so metrics agree across teams."], p:"Model payments as a fact table with merchant, date and payment-method dimensions."},
      {t:"Lakehouse table design", k:["Partition on a low-cardinality column that queries filter on, often a day.","Sort or cluster on high-cardinality filter columns so file stats can prune.","Target file sizes of roughly 128–512 MB; avoid thousands of tiny files."]}
    ]}
  ]},
  {t:"Databases and storage internals", d:"Know what happens under the SQL.", k:["Internals explain performance problems that tools cannot.","Row stores suit transactions; column stores suit analytics.","Every storage choice trades read speed, write speed and cost."], c:[
    {t:"OLTP internals (MySQL, Postgres)", d:"How a transactional database keeps data safe and fast.", f:"mysql-write", k:["B+tree clustered and secondary indexes.","Write-ahead logging: redo in InnoDB, WAL in Postgres; durability before data pages hit disk.","MVCC: readers see a snapshot, writers do not block readers.","Isolation levels and the anomalies each one allows."], c:[
      {t:"Transactions and locking", k:["Row locks, gap locks and next-key locks in InnoDB.","Deadlocks: how they happen, how the engine picks a victim, how to avoid them by consistent ordering.","Long transactions block purge and bloat undo or dead tuples."]},
      {t:"Replication and binlog", f:"cdc", k:["Binlog formats: STATEMENT, ROW, MIXED. CDC needs ROW.","GTIDs make failover and resuming consumers safe.","Replica lag: causes and how to measure it."]},
      {t:"Operations", k:["Online schema changes (gh-ost, pt-osc, instant ALTER).","Purging and archiving large tables in batches without locking.","Backups and point-in-time recovery from binlog or WAL."]}
    ]},
    {t:"Columnar formats", k:["Parquet: row groups, column chunks, pages, and min/max stats per chunk.","Encodings (dictionary, RLE) and compression (Snappy, ZSTD).","Avro for row-oriented messages and schema evolution; ORC as a Parquet alternative.","Projection and predicate pushdown are why columnar is fast."], p:"Inspect a Parquet file's metadata with pyarrow and explain its row groups."},
    {t:"NoSQL stores", k:["Cassandra: partition key decides placement; design tables per query.","DynamoDB: partition and sort keys, GSIs, hot partitions, capacity modes.","MongoDB: document modeling, embedding vs referencing.","CAP and tunable consistency in practice."]},
    {t:"Object storage (S3)", k:["Strong read-after-write consistency; no real directories, only key prefixes.","Request costs and LIST cost at scale; why table formats avoid listing.","Storage classes and lifecycle rules for retention and cost."]}
  ]},
  {t:"Batch processing", d:"Process large data reliably on a schedule.", k:["Spark is the default engine for large batch work.","Warehouses handle SQL transformation at scale.","Idempotent jobs make reruns and backfills safe."], c:[
    {t:"Apache Spark", d:"The engine you will tune most.", k:["Lazy evaluation: transformations build a plan, actions run it.","DataFrame API over RDDs; the Catalyst optimizer and Tungsten.","Most performance problems are shuffles, skew or spills."], c:[
      {t:"Execution model", k:["Driver, executors, cores and memory.","Job → stages (split at shuffles) → tasks (one per partition).","Read the Spark UI: stage timeline, task skew, shuffle read/write, spill."], p:"Open the Spark UI for a slow job and find the stage that takes the longest."},
      {t:"Joins and shuffles", k:["Broadcast hash join when one side is small; sort-merge join otherwise.","Skew: one key holds most rows. Fix with AQE skew join, salting or splitting hot keys.","Repartition vs coalesce, and choosing spark.sql.shuffle.partitions."]},
      {t:"Tuning and AQE", k:["Adaptive Query Execution coalesces partitions and switches join strategies at runtime.","Executor sizing: about 4–5 cores per executor and memory overhead.","Cache only when data is reused, and unpersist it after."]},
      {t:"Writing output", k:["Avoid tiny files: repartition by partition columns before writing.","Dynamic partition overwrite for idempotent daily loads.","Write to table formats (Iceberg) instead of raw paths for atomic commits."]}
    ]},
    {t:"Cloud warehouses", k:["Redshift: distribution styles (KEY, ALL, EVEN, AUTO), sort keys, VACUUM and ANALYZE.","COPY from S3 in parallel files; UNLOAD for exports.","Workload management, concurrency scaling and Spectrum for lake queries.","Snowflake and BigQuery: separate storage and compute, pay per query or per warehouse."]},
    {t:"ELT and dbt", k:["Transform inside the warehouse with version-controlled SQL.","Models, refs, sources, incremental models and snapshots.","Tests (unique, not_null, relationships) and docs generated from code."]}
  ]},
  {t:"Streaming and CDC", d:"Move data within seconds or minutes.", k:["Kafka is the backbone; CDC feeds it from databases.","Event time, state and exactly-once are the hard parts.","Streams need monitoring of lag, not just job status."], c:[
    {t:"Kafka", d:"A durable, partitioned log.", k:["Order is guaranteed only within a partition.","Retention is by time or size; consumers can replay.","Throughput scales with partitions; changing partition count changes key placement."], c:[
      {t:"Producers", k:["acks=all with min.insync.replicas for durability.","Idempotent producer and transactions for exactly-once writes.","Batching (linger.ms, batch.size) and compression."]},
      {t:"Consumers and groups", k:["Each partition goes to one consumer in a group.","Offsets: auto commit vs manual commit after processing.","Rebalances, cooperative rebalancing, and consumer lag monitoring."]},
      {t:"Schemas", k:["Schema registry with Avro or Protobuf.","Compatibility modes: backward, forward, full.","Handle schema changes without breaking downstream jobs."]}
    ]},
    {t:"CDC with Debezium", f:"cdc", k:["Initial snapshot, then binlog streaming from a saved GTID or position.","Event envelope: before, after, op, source, ts_ms.","Keyed by primary key so per-row order holds.","Plan for DDL changes, deletes (tombstones) and connector restarts."], p:"Run Debezium + Kafka locally with Docker and watch an UPDATE arrive."},
    {t:"Stream processing", d:"Flink or Spark Structured Streaming.", k:["Stateless maps vs stateful aggregations and joins.","Micro-batch (Spark) vs true streaming (Flink).","Back-pressure and how to spot it."], c:[
      {t:"Event time and watermarks", k:["Event time vs processing time.","Watermarks tell the engine how late data may arrive.","Tumbling, sliding and session windows; handling late events."]},
      {t:"State and checkpoints", k:["Keyed state in RocksDB; state TTL to stop unbounded growth.","Checkpoints snapshot state plus source offsets together.","Savepoints for upgrades and rescaling."]},
      {t:"Exactly-once sinks", k:["Two-phase commit sinks tie output commits to checkpoints.","Iceberg sink commits a snapshot per checkpoint.","Idempotent upserts as a simpler alternative."], f:"cdc"}
    ]}
  ]},
  {t:"Lakehouse", d:"Warehouse features on open files in object storage.", k:["Table formats add ACID, schema evolution and time travel to files on S3.","Any engine can read the same table.","Maintenance is part of the job, not an afterthought."], c:[
    {t:"Apache Iceberg", d:"The format you use daily.", f:"iceberg-write", k:["Catalog pointer → metadata.json → manifest list → manifests → data files.","Commits are atomic pointer swaps with optimistic concurrency.","Snapshots give isolation and time travel."], c:[
      {t:"Hidden partitioning", k:["Partition transforms: days(ts), bucket(16, id), truncate.","Queries filter on the source column; Iceberg prunes partitions automatically.","Partition evolution changes the spec without rewriting old data."], f:"iceberg-read"},
      {t:"Copy-on-write vs merge-on-read", k:["CoW rewrites files on update: slow writes, fast reads.","MoR writes position or equality delete files: fast writes, reads apply deletes.","Pick per workload; CDC tables usually use MoR plus compaction."]},
      {t:"Table maintenance", k:["rewrite_data_files to compact small files and apply deletes.","expire_snapshots to drop old snapshots and their files.","remove_orphan_files and rewrite_manifests.","Schedule these, and watch file counts and snapshot counts."], p:"Write an Airflow DAG that compacts and expires snapshots nightly."}
    ]},
    {t:"Delta Lake and Hudi", k:["Delta: transaction log of JSON commits plus Parquet checkpoints.","Hudi: record-level indexes, built for upserts.","Know the trade-offs well enough to argue for one in a design interview."]},
    {t:"Catalogs and governance", k:["Glue, Hive Metastore, REST catalog, Nessie, Unity Catalog.","Fine-grained access with Lake Formation or Ranger.","Lineage and data discovery (DataHub, OpenMetadata)."]},
    {t:"Query engines", k:["Trino and Athena for interactive SQL on the lake.","Pruning via partitions and file stats is most of the speed.","Cost model: Athena bills per TB scanned."]}
  ]},
  {t:"Orchestration and data quality", d:"Run pipelines on time and trust the output.", k:["Pipelines fail; design for retry and rerun.","Quality checks belong inside the pipeline.","Freshness and correctness are both SLAs."], c:[
    {t:"Airflow", k:["DAGs, tasks, operators, sensors, XComs.","Idempotent tasks keyed by logical date; backfills and catchup.","Retries, SLAs, pools and avoiding top-level code in DAG files.","Deferrable operators for long waits."], p:"Rebuild one cron job as an idempotent Airflow DAG with a backfill."},
    {t:"Data quality", k:["Checks for row counts, nulls, uniqueness, referential integrity and ranges.","Data contracts with producers: schema and semantics agreed up front.","Tools: dbt tests, Great Expectations, Soda, Deequ.","Quarantine bad records instead of failing the whole load."]},
    {t:"Observability", k:["Track freshness, volume, schema changes and distribution drift.","Alert on symptoms users feel, not every task failure.","Runbooks for the common failures."]}
  ]},
  {t:"Cloud, infra and cost", d:"Run it reliably and cheaply.", k:["You own the bill as much as the pipeline.","Infrastructure as code keeps environments repeatable.","Security is part of the design."], c:[
    {t:"AWS data services", k:["EMR (on EC2, Serverless, EKS), Glue jobs and Glue catalog.","IAM roles and least privilege; VPC endpoints for S3.","Lambda, Step Functions, MSK, Kinesis, DMS."]},
    {t:"IaC and CI/CD", k:["Terraform modules and state for data infrastructure.","Docker images for jobs; deploying Spark and Flink apps.","CI that runs unit tests and SQL linting on every PR."]},
    {t:"Cost optimisation", k:["Spot instances and autoscaling for batch clusters.","Right-size files and partitions to cut scan cost.","Retention and purge policies; S3 lifecycle to cheaper tiers.","Measure cost per pipeline and per TB processed."]}
  ]},
  {t:"Pipeline system design", d:"Put it all together in a design.", k:["Start from requirements: latency, volume, correctness, consumers.","Draw the data flow end to end before choosing tools.","Explain trade-offs and failure handling out loud."], c:[
    {t:"Design method", k:["Clarify: sources, volume per day, freshness needed, who reads it.","Choose batch, micro-batch or streaming from the latency need.","Cover backfill, late data, schema change, reprocessing and monitoring."]},
    {t:"Common design questions", k:["CDC from MySQL to a lakehouse with under 5 minute freshness.","Clickstream ingestion and sessionization.","A metrics platform with consistent definitions across teams.","Deduplication at scale with exactly-once semantics."], f:"cdc"},
    {t:"Security and compliance", k:["Classify PII; mask, tokenize or encrypt sensitive columns.","Encryption at rest (KMS) and in transit.","Audit logs and access reviews; PCI DSS rules for card data in payments."]}
  ]}
  ]
},

"ai": {
  name:"AI Engineer", short:"AI Engineer",
  intro:"Build reliable products on top of LLMs: from model basics to RAG, agents, evals and production. A data engineering background gives you a head start on retrieval and pipelines.",
  c:[
  {t:"Foundations", d:"Enough math and ML to reason about models.", k:["You do not need to train frontier models, but you need to know how they behave.","Strong Python and API skills matter more than heavy math.","Know how to measure whether a model is any good."], c:[
    {t:"Python and APIs", k:["async/await for concurrent model calls.","FastAPI for serving; pydantic for validated, typed I/O.","HTTP basics: streaming responses, retries with backoff, rate limits."]},
    {t:"Math intuition", k:["Vectors, dot products and cosine similarity (the core of embeddings).","Probability, softmax and sampling.","Gradient descent: loss, learning rate, why training can diverge."]},
    {t:"Machine learning basics", k:["Supervised vs unsupervised learning; train, validation and test splits.","Overfitting, regularization and data leakage.","Metrics: precision, recall, F1, ROC-AUC, and when accuracy lies."], p:"Train a scikit-learn classifier on a public dataset and report precision and recall."}
  ]},
  {t:"How LLMs work", d:"The mental model behind every design choice.", k:["An LLM predicts the next token given previous tokens.","Behaviour comes from pretraining data plus post-training.","Context window, tokens and sampling settings shape every output."], c:[
    {t:"Neural networks", k:["Layers, activations, backpropagation.","Embeddings as learned vector representations.","Why scale (data, parameters, compute) improved capabilities."]},
    {t:"Transformers", d:"The architecture behind modern LLMs.", k:["Self-attention lets every token look at every other token.","Cost grows with context length.","Decoder-only models generate one token at a time."], c:[
      {t:"Tokenization", k:["Subword tokens (BPE); about 4 characters per English token.","Numbers, code and non-English text tokenize differently and cost more.","Token counts drive price and latency."]},
      {t:"Attention", k:["Query, key and value vectors; scaled dot-product attention.","Multi-head attention captures different relationships.","KV cache makes generation faster by reusing past keys and values."]},
      {t:"Decoding and sampling", k:["Temperature, top-p and top-k.","Greedy vs sampled outputs; why the same prompt can give different answers.","Stop sequences and max tokens."]}
    ]},
    {t:"Training pipeline", k:["Pretraining on large text corpora.","Supervised fine-tuning on instruction examples.","Preference training (RLHF and similar) for helpfulness and safety.","Reasoning models trained to think before answering."]}
  ]},
  {t:"Building with LLM APIs", d:"Get reliable output from hosted models.", k:["Most AI engineering is clear instructions, good context and validation.","Treat the model as a component with an interface and tests.","Track tokens, latency and cost from day one."], c:[
    {t:"Prompting", k:["Be explicit about the task, audience, format and constraints.","Give examples of good and bad outputs.","Separate instructions from data, for example with XML tags."], c:[
      {t:"System prompts", k:["Set role, rules and output contract once.","Keep stable content first so it can be cached.","Version prompts like code."]},
      {t:"Structured output", k:["Ask for JSON that matches a schema; validate with pydantic.","Retry or repair on invalid output.","Use native structured output or tool schemas when available."], p:"Extract fields from 50 invoices into JSON and measure how many validate."}
    ]},
    {t:"Tool use", k:["The model chooses a tool and arguments; your code runs it and returns the result.","Write clear tool names, descriptions and parameter schemas.","Validate arguments; never trust them blindly for writes."]},
    {t:"Context, cost and latency", k:["Prompt caching for repeated long prefixes.","Streaming to cut perceived latency.","Choose model size per task; route easy tasks to smaller models.","Batch APIs for offline jobs at lower cost."]}
  ]},
  {t:"Retrieval-augmented generation (RAG)", d:"Ground answers in your own data.", k:["Retrieval quality limits answer quality.","Most RAG failures are chunking and retrieval, not the LLM.","Always measure retrieval separately from generation."], c:[
    {t:"Embeddings and vector search", d:"Find relevant text by meaning.", k:["Text becomes a vector; similar meaning gives nearby vectors.","Index type and distance metric affect speed and recall.","Store metadata with each chunk for filtering."], c:[
      {t:"Chunking", k:["Chunk by structure (headings, paragraphs) rather than fixed characters when possible.","Overlap a little so ideas are not cut in half.","Add context to each chunk: document title and section."]},
      {t:"Vector databases", k:["pgvector, OpenSearch, Pinecone, Qdrant, Weaviate.","HNSW and IVF indexes; recall vs latency trade-off.","Re-embed when you change embedding models."]},
      {t:"Hybrid search", k:["Combine keyword (BM25) and vector search.","Keyword search wins on IDs, codes and exact names.","Merge results with reciprocal rank fusion."]}
    ]},
    {t:"Retrieval quality", k:["Rerank the top results with a cross-encoder or LLM.","Query rewriting and decomposition for vague questions.","Metadata filters for time, tenant and access control."]},
    {t:"Grounding and citations", k:["Tell the model to answer only from the provided context.","Return citations to source chunks so users can check.","Let the model say it does not know."], p:"Build a RAG bot over your own docs that cites its sources and refuses off-topic questions."}
  ]},
  {t:"Agents", d:"Models that take actions in a loop.", k:["An agent is a model calling tools in a loop until a goal is met.","Start with the simplest workflow that works; add autonomy only when needed.","Reliability falls as steps increase, so design for recovery."], c:[
    {t:"Agent patterns", k:["Prompt chaining, routing, parallel calls, orchestrator-workers, evaluator-optimizer.","ReAct style: reason, act, observe.","Planning, then executing with checks."]},
    {t:"Tools and MCP", k:["Model Context Protocol standardises connecting tools and data to models.","Design tools for the model: few, clear and with useful errors.","Sandbox code execution and file access."]},
    {t:"Memory and state", k:["Short-term: the conversation and scratchpad in context.","Long-term: stored facts retrieved when relevant.","Summarise or compact context in long tasks."]},
    {t:"Guardrails", k:["Human approval for irreversible actions.","Limits on steps, spend and time.","Input and output filters; allowlists for tools and domains."]}
  ]},
  {t:"Evaluation", d:"Know if a change made things better.", k:["Without evals you are guessing.","Build the eval set before tuning prompts.","Combine automated scores with human review."], c:[
    {t:"Offline evals", k:["Golden datasets of real inputs with expected outputs or rubrics.","Code-based checks for format and exact facts.","LLM-as-judge with a clear rubric; check it against human labels."], p:"Make a 50-case eval set for your RAG bot and track the score across prompt versions."},
    {t:"Online monitoring", k:["Trace every call: inputs, outputs, tools, latency, cost.","Collect user feedback and failure examples.","Feed production failures back into the eval set."]},
    {t:"Red teaming", k:["Test prompt injection, jailbreaks and data leakage.","Try adversarial and out-of-scope inputs.","Record findings as regression tests."]}
  ]},
  {t:"Fine-tuning and open models", d:"When prompting is not enough.", k:["Try prompting and RAG first; fine-tune for style, format or narrow tasks.","Fine-tuning teaches behaviour better than facts.","Data quality matters more than quantity."], c:[
    {t:"Fine-tuning methods", k:["Full fine-tuning vs parameter-efficient LoRA and QLoRA.","Prepare clean instruction-response pairs.","Hold out an eval set; watch for overfitting."]},
    {t:"Serving open models", k:["vLLM or TGI for high-throughput serving.","Quantization (8-bit, 4-bit) to fit on smaller GPUs.","Continuous batching and KV cache memory limits."]}
  ]},
  {t:"Production", d:"Ship it, run it, keep it safe.", k:["AI features need the same rigour as any service, plus evals.","Plan for model updates and deprecations.","Security risks are new: prompts are an attack surface."], c:[
    {t:"LLMOps", k:["Version prompts, models and retrieval configs together.","Feature flags and A/B tests for prompt changes.","Dashboards for cost, latency, error rate and eval scores."]},
    {t:"Security", k:["Prompt injection from retrieved documents and tool output.","Least-privilege tools; never let model output run unchecked.","Keep PII out of logs and prompts where possible."]},
    {t:"Product sense", k:["Design UX for uncertainty: show sources and allow edits.","Pick tasks where a wrong answer is cheap or easy to check.","Measure business outcomes, not only model scores."]}
  ]},
  {t:"Portfolio projects", d:"Proof you can build.", k:["Two or three finished, well-documented projects beat ten demos.","Show evals and trade-offs in each README.","Projects that use your data engineering skills stand out."], c:[
    {t:"Text-to-SQL assistant", k:["Natural language questions over a warehouse schema.","Schema retrieval, SQL validation and safe read-only execution.","Eval set of questions with correct results."]},
    {t:"RAG over technical docs", k:["Ingestion pipeline with incremental updates.","Hybrid search, reranking and citations.","Eval harness with retrieval and answer metrics."]},
    {t:"Pipeline ops agent", k:["Agent that reads Airflow logs and suggests fixes.","Tools for log search, DAG status and docs lookup.","Human approval before any rerun."]}
  ]}
  ]
},

"fde": {
  name:"Forward Deployed Engineer", short:"FDE",
  intro:"A forward deployed engineer works directly with customers to turn messy, real problems into working software, often built on the company's platform or AI models. The role mixes engineering depth with discovery, communication and ownership.",
  c:[
  {t:"Understand the role", d:"What FDEs actually do.", k:["Embed with a customer, find the highest-value problem, and ship a working solution fast.","Bring what you learn back to the product team.","Success is measured by customer outcomes, not lines of code."], c:[
    {t:"Day to day", k:["Discovery calls and workshops with users and stakeholders.","Building integrations, data pipelines, apps and AI workflows.","Demos, status updates and unblocking deployments."]},
    {t:"FDE vs other roles", k:["Software engineer: builds the core product for many customers.","Solutions or sales engineer: pre-sales demos and technical fit.","Consultant: advises and often hands off; an FDE builds and ships.","FDE: writes production code for a specific customer, then generalises it."]}
  ]},
  {t:"Engineering core", d:"Build anything the customer needs.", k:["Breadth matters: backend, data, a bit of frontend, and deployment.","You work in unfamiliar codebases and environments.","Speed and correctness both count."], c:[
    {t:"Backend and APIs", k:["REST and webhooks; auth with OAuth and API keys.","Python or TypeScript services; background jobs and queues.","Error handling and idempotent retries for external systems."]},
    {t:"Frontend basics", k:["React fundamentals for internal tools and demos.","Forms, tables and states for loading and errors.","Good enough UI that users can actually adopt."]},
    {t:"Data integration", d:"Where data engineers have an edge.", k:["Customer data is messy, siloed and undocumented.","Connect to their warehouses, databases, SaaS APIs and files.","Mapping and cleaning data is often most of the project."], c:[
      {t:"Connectors and ingestion", k:["JDBC, CDC, SFTP drops, REST APIs with pagination and rate limits.","Incremental loads with watermarks.","Data validation at the boundary."], f:"cdc"},
      {t:"Schema mapping", k:["Map customer fields to a canonical model.","Handle duplicates, missing keys and inconsistent codes.","Document every assumption and confirm it with the customer."]}
    ]},
    {t:"Debugging in the field", k:["Read logs and traces in systems you did not build.","Reproduce issues with minimal cases.","Network, DNS, TLS and permission problems are common in customer environments."]}
  ]},
  {t:"AI solution delivery", d:"Deploy LLM-powered workflows for customers.", k:["Many FDE roles today center on deploying AI models into customer workflows.","Pick use cases where the value is clear and errors are checkable.","Evals are how you earn trust."], c:[
    {t:"Use case patterns", k:["Document processing and extraction.","Search and question answering over internal knowledge (RAG).","Agents that automate multi-step back-office work.","Copilots inside existing tools."]},
    {t:"Customer-specific evals", k:["Build an eval set from real customer examples with their experts.","Agree on what good looks like before building.","Report accuracy in their terms, such as hours saved or error rate."], p:"Write an eval plan for an invoice-extraction rollout with a finance team."},
    {t:"Deployment constraints", k:["Data residency, VPC or on-prem requirements.","SSO, RBAC and audit logs.","Latency and cost budgets per workflow."]}
  ]},
  {t:"Customer discovery", d:"Find the real problem before building.", k:["The first request is rarely the real problem.","Talk to the people who do the work, not only managers.","Write down the success metric and get agreement."], c:[
    {t:"Problem framing", k:["Ask what happens today, step by step, and where time or money is lost.","Five whys to get from symptom to cause.","Turn the problem into a measurable outcome."]},
    {t:"Scoping", k:["Define the smallest version that proves value in weeks, not months.","List what is explicitly out of scope.","Identify data access and security blockers early."]},
    {t:"Stakeholder mapping", k:["Champion: wants it to work and fights for it.","Executive sponsor: owns the budget and the goal.","IT and security: can block deployment; involve them early.","End users: decide whether it is actually adopted."]}
  ]},
  {t:"Communication", d:"Half the job.", k:["Explain technical trade-offs to non-technical people.","Write clearly and often.","Manage expectations before they become problems."], c:[
    {t:"Demos", k:["Use the customer's own data where possible.","Tell a story: today's pain, the new workflow, the result.","Have a fallback if the live demo breaks."]},
    {t:"Writing", k:["Short design docs with the problem, options and decision.","Weekly status: progress, risks, asks.","Handover documentation someone else can run with."]},
    {t:"Handling pushback", k:["Listen fully, restate the concern, then respond with evidence.","Say no to scope creep with a trade-off, not a refusal.","Escalate early when a blocker is outside your control."]}
  ]},
  {t:"Enterprise realities", d:"Why deployments stall, and how to avoid it.", k:["Security and procurement often take longer than building.","Adoption needs training and change management.","Plan for these from week one."], c:[
    {t:"Security reviews", k:["SOC 2, ISO 27001 and vendor questionnaires.","Data flow diagrams showing where data goes and who can access it.","Encryption, retention and deletion policies."]},
    {t:"Adoption", k:["Train users and find power users to champion the tool.","Measure usage weekly; talk to people who stopped using it.","Iterate on the workflow, not only the model."]}
  ]},
  {t:"Ownership and delivery", d:"From prototype to production.", k:["Own the outcome end to end.","Prototype fast, then harden what works.","Leave things better documented than you found them."], c:[
    {t:"Prototype to production", k:["Prototype in days to validate value.","Then add tests, monitoring, access control and runbooks.","Agree on who supports it after launch."]},
    {t:"Product feedback loop", k:["Spot patterns across customers.","Turn one-off code into reusable product features.","Write feedback with evidence: customer, impact, frequency."]}
  ]},
  {t:"Interview preparation", d:"What FDE interviews usually test.", k:["Coding plus practical problem solving.","Decomposing an ambiguous customer problem.","Behavioural questions on ownership and customer focus."], c:[
    {t:"Decomposition case", k:["You get a vague business problem and must structure it.","Clarify goals, users, data and constraints first.","Propose an MVP, the data needed, risks and how you would measure success."], p:"Practise: a hospital wants to cut no-shows. Structure the solution in 20 minutes."},
    {t:"Coding rounds", k:["Practical tasks: parse data, call an API, build a small service.","Clean, working code over clever algorithms.","Talk through trade-offs as you go."]},
    {t:"Behavioural", k:["Stories about owning ambiguous problems end to end.","Times you handled a difficult stakeholder.","Use STAR with concrete numbers, such as cost cut or latency reduced."]}
  ]}
  ]
}
};
