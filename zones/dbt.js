QUEST.zone("dbt", {
mission:["meera","Our SQL is 400 files of copy-pasted CTEs with no tests. dbt turns it into a tested, documented DAG. Learn the moves, then refactor the finance mart."],
levels:[
{t:"Models & the DAG", sub:"ref, source, run", rounds:[
 ["learn","A model is a SELECT","Each «.sql» file in «models/» is a SELECT. dbt wraps it in DDL (view/table) and runs it in dependency order. «{{ ref('stg_payments') }}» links models; «{{ source('raw', 'payments') }}» points at raw tables.",["Write SELECT models","ref() and source() build the DAG","dbt compiles Jinja to SQL","Runs in dependency order"]],
 ["pick","Why use «{{ ref('stg_orders') }}» instead of «analytics.stg_orders»?",["It's shorter","dbt builds the DAG and resolves the right schema per environment","It caches results","It's required by Postgres"],1,"ref gives ordering, lineage and environment-aware names."],
 ["order","A typical project layering",["sources: raw tables declared in YAML","staging: one model per source table, light cleaning","intermediate: joins and business logic","marts: facts and dimensions for BI"],"Each layer only refs the layer below."],
 ["match","dbt commands",[["dbt run","Build models"],["dbt test","Run data tests"],["dbt build","Run, test, snapshot and seed in DAG order"],["dbt compile","Render Jinja to SQL without running"],["dbt docs generate","Build the docs site with lineage"]],"dbt build is the CI favourite."],
 ["tf","Basics",[["A model can be a Python file.",true,"Python models run on Snowflake, Databricks and BigQuery."],["Models should hardcode schema names.",false,"Use ref/source so environments work."],["Seeds load small CSVs from the project.",true,"Good for lookup tables, not big data."]]]
]},
{t:"Materializations", sub:"View, table, incremental", rounds:[
 ["learn","Four main materializations","**view**: no storage, computed at query time. **table**: rebuilt fully each run. **incremental**: only process new/changed rows. **ephemeral**: inlined as a CTE, never built. Some adapters add **materialized_view**."],
 ["sort","Which materialization?",{"view":["Light staging model over a raw table"],"table":["Small mart rebuilt nightly in seconds"],"incremental":["2 billion event rows, 5 million new per day"],"ephemeral":["Reusable logic used by one model only"]},"Start with views, move up when needed."],
 ["learn","Incremental models","«is_incremental()» is true when the table exists and you're not doing «--full-refresh». Filter new rows there. Set «unique_key» to merge updates. Strategies: append, merge, delete+insert, insert_overwrite, microbatch."],
 ["fill","An incremental model",'{{ config(materialized=\'___\', unique_key=\'payment_id\') }}\nselect * from {{ ref(\'stg_payments\') }}\n{% if ___() %}\n  where updated_at > (select max(updated_at) from {{ ___ }})\n{% endif %}',["incremental","is_incremental","this"],["table","is_full","self"],"{{ this }} is the existing target table."],
 ["bug","This incremental model duplicates updated payments. Which line?",["{{ config(materialized='incremental') }}","select * from {{ ref('stg_payments') }}","{% if is_incremental() %}","  where updated_at > (select max(updated_at) from {{ this }})"],0,"Without unique_key it appends; updated rows become duplicates. Add unique_key='payment_id'."],
 ["tf","Incremental facts",[["--full-refresh rebuilds an incremental model from scratch.",true,"Needed after logic changes."],["Late-arriving rows older than max(updated_at) are always caught.",false,"Use a lookback window."],["microbatch processes data in time batches you can backfill.",true,"Set event_time and batch_size."]]]
]},
{t:"Tests & contracts", sub:"Trust the data", rounds:[
 ["learn","Data tests","Generic tests in YAML: «unique», «not_null», «accepted_values», «relationships». Singular tests are SELECTs that should return zero rows. Packages like dbt_utils and dbt_expectations add more."],
 ["match","Which test catches it?",[["Two rows with the same payment_id","unique"],["NULL merchant_id","not_null"],["status = 'SUCESS' typo","accepted_values"],["Payment pointing to a missing merchant","relationships"]],"Four tests cover most bugs."],
 ["fill","Test the primary key",'models:\n  - name: fct_payments\n    columns:\n      - name: payment_id\n        data_tests:\n          - ___\n          - ___',["unique","not_null"],["primary","distinct","required"],"unique + not_null = a real primary key."],
 ["learn","Contracts, unit tests, severity","**Model contracts** enforce column names and types at build time. **Unit tests** check logic on mock input rows before data exists. Set test **severity: warn** or thresholds («error_if: '>100'») to avoid blocking on noise."],
 ["sort","Data test or unit test?",{"Data test":["No duplicate payment_id in prod","Every merchant exists"],"Unit test":["Refund logic with three mock rows","Currency conversion edge case"]},"Data tests check data; unit tests check code."]
]},
{t:"Snapshots, Jinja & CI", sub:"SCD2, macros, slim CI", rounds:[
 ["learn","Snapshots = SCD Type 2","A snapshot records how mutable rows change over time, adding «dbt_valid_from» and «dbt_valid_to». Strategy **timestamp** uses an updated_at column; **check** compares chosen columns."],
 ["pick","Merchants' commission rate changes in place. Finance needs the rate at payment time. Use…",["A snapshot (SCD2) of merchants","A view","An ephemeral model","A seed"],0,"Join payments to the snapshot row valid at payment time."],
 ["learn","Jinja and macros","Macros are reusable Jinja functions: «{% macro cents_to_inr(col) %}({{ col }} / 100.0){% endmacro %}». Loops and «var()» generate SQL. Keep logic readable: macros for repetition, not cleverness."],
 ["learn","Slim CI","In CI, compare against production's «manifest.json» and build only what changed plus downstream: «dbt build --select state:modified+ --defer --state prod_artifacts». Fast PR checks without rebuilding everything."],
 ["match","Selectors",[["+fct_payments","fct_payments and everything upstream"],["fct_payments+","fct_payments and everything downstream"],["tag:finance","Models tagged finance"],["state:modified+","Changed models and their children"]],"The plus sign points to the direction."]
]},
{t:"Boss: Refactor the mart", boss:true, time:30, rounds:[
 ["pick","Models break when run in dev because of hardcoded prod schemas. Fix?",["Use ref() and source()","Use views","Add tests","Seeds"],0,"Environment-aware references."],
 ["pick","A 3-billion-row fact is rebuilt nightly in 2 hours. Fix?",["Incremental with unique_key and a lookback","Ephemeral","View","More tests"],0,"Process only what changed."],
 ["pick","Duplicates slipped into the payments fact. Prevent it?",["unique + not_null tests on payment_id in dbt build","Docs","Seeds","Macros"],0,"Tests fail the build."],
 ["pick","Finance needs historical merchant tiers. Use…",["Snapshot (SCD2)","Incremental append","Contract","Python model"],0,"Track changes over time."],
 ["pick","PR CI takes 90 minutes building everything. Fix?",["Slim CI: state:modified+ with --defer","Disable tests","Bigger warehouse only","Run nightly"],0,"Build only what changed."],
 ["pick","A model's column type changed and broke the BI tool. Prevent with…",["Model contract","Ephemeral","Seed","Exposure"],0,"Contracts enforce the schema at build time."]
]}
]});

QUEST.more("dbt", [
{act:"Expert", t:"How dbt compiles and runs", sub:"Parsing, manifest, DAG", rounds:[
 ["learn","Parse → compile → execute","dbt **parses** every file into a graph of nodes, writes «manifest.json», **compiles** Jinja into SQL per node, then **executes** nodes in DAG order with «threads» running in parallel.",["Parse project → manifest.json","Resolve ref/source into the DAG","Compile Jinja per node","Run nodes in topological order, N threads","Write run_results.json"],null,`### Artifacts
- «target/manifest.json»: every node, its config, dependencies, compiled path — used by docs, slim CI («--state»), orchestration tools and lineage.
- «target/run_results.json»: status and timing per node of the last invocation.
- «target/compiled/» and «target/run/»: the SQL that was compiled and the DDL/DML actually executed. **Debug here**, not in the Jinja.
- «partial_parse.msgpack»: lets dbt re-parse only changed files.

### Parse-time vs run-time Jinja
Jinja runs at **parse** time too (to discover refs/configs). A macro that queries the warehouse («run_query») must be guarded with «{% if execute %}» or it will run (or fail) during parsing.

### Threads
«threads: 8» lets 8 independent models run at once. The DAG still limits parallelism: a long chain of dependencies runs one by one no matter how many threads.`],
 ["bug","This macro breaks «dbt parse». Which line?",["{% macro latest_dt() %}","{% set result = run_query('select max(dt) from ' ~ ref('stg_payments')) %}","{{ return(result.columns[0].values()[0]) }}","{% endmacro %}"],1,"run_query runs at parse time too. Wrap it in {% if execute %} … {% endif %}."],
 ["match","Artifact",[["manifest.json","The full project graph and configs"],["run_results.json","Status and timings of the last run"],["target/run/","SQL actually executed against the warehouse"],["catalog.json","Columns and stats from the warehouse for docs"]],"Artifacts power CI, docs and observability."],
 ["num","A DAG has a chain of 6 dependent models (each 5 min) plus 20 independent models (each 3 min). With 8 threads, minimum total runtime (min)?",30,0,"min","The 6-model chain is sequential: 6 × 5 = 30 min. The independent models fit alongside in the other threads (20 × 3 = 60 thread-minutes over 7 threads ≈ 9 min)."],
 ["tf","Compile truths",[["Jinja is evaluated only at run time.",false,"Also at parse time; guard warehouse calls with execute."],["More threads always shorten runs.",false,"The critical path of dependencies sets the floor."],["Compiled SQL lives under target/compiled.",true,"Read it when debugging."]]]
]},
{act:"Expert", t:"Incremental strategies deep", sub:"merge, insert_overwrite, microbatch", rounds:[
 ["learn","Strategies by platform","The «incremental_strategy» decides the SQL dbt generates to apply new rows. Support varies by adapter.",null,null,`| Strategy | What dbt runs | Good for |
|---|---|---|
| append | INSERT new rows | Immutable event logs (duplicates possible on reruns) |
| merge | MERGE on unique_key | Upserts (Snowflake, BigQuery, Databricks, Postgres 15+) |
| delete+insert | DELETE matching keys, then INSERT | Adapters without efficient MERGE; batch reloads |
| insert_overwrite | Replace whole partitions | BigQuery/Spark partitioned tables, late-arriving data per day |
| microbatch | Run per time batch using event_time | Large time-series with backfills and retries per batch |

### Late-arriving data
«where updated_at > (select max(updated_at) from {{ this }})» misses rows that arrive late with older timestamps. Use a **lookback**: «> (select max(updated_at) - interval '3 days' from {{ this }})» with «unique_key» so re-processed rows upsert rather than duplicate.

### Microbatch
Configure «event_time», «batch_size» ('day'/'hour'), «begin» and «lookback». dbt runs one query per batch, can **retry only failed batches** («dbt retry»), and backfills with «--event-time-start / --event-time-end». Upstream models with «event_time» are auto-filtered to the batch window.

### on_schema_change
«ignore» (default), «fail», «append_new_columns», «sync_all_columns» — what to do when the model's columns change on an incremental table.`],
 ["sort","Best strategy?",{"merge":["Payments table with status updates by payment_id"],"insert_overwrite":["Daily partitioned events where any day may be recomputed"],"microbatch":["3 years of clickstream that must be backfilled per day with retries"],"append":["Immutable audit log with idempotent ingestion upstream"]},"Strategy follows data semantics."],
 ["fill","A microbatch model",'{{ config(\n    materialized=\'incremental\',\n    incremental_strategy=\'___\',\n    event_time=\'created_at\',\n    batch_size=\'___\',\n    begin=\'2024-01-01\',\n    lookback=2) }}\nselect * from {{ ref(\'stg_events\') }}',["microbatch","day"],["merge","weekly","partition"],"Each batch is its own query; failed batches can be retried alone."],
 ["pick","An incremental model filters updated_at > max(updated_at) and misses mobile events that sync 2 days late. Fix?",["Add a lookback window and a unique_key","Use append","Full-refresh nightly only","More threads"],0,"Reprocess a window, upsert by key."],
 ["tf","Incremental truths",[["append is safe to re-run without duplicates.",false,"Re-runs insert again."],["insert_overwrite replaces whole partitions.",true,"Great for recomputing days."],["on_schema_change defaults to ignore.",true,"New columns aren't added unless configured."]]]
]},
{act:"Expert", t:"Testing & quality at scale", sub:"Unit tests, contracts, freshness", rounds:[
 ["learn","Layers of tests","**Unit tests** check transformation logic on mocked rows before building. **Data tests** check built data. **Contracts** enforce shape at build time. **Source freshness** checks raw data arrives on time.",null,null,`### Unit tests (YAML)
~~~
unit_tests:
  - name: refund_reduces_net_amount
    model: fct_payments
    given:
      - input: ref('stg_payments')
        rows:
          - {payment_id: 1, amount: 1000, refunded: 200}
    expect:
      rows:
        - {payment_id: 1, net_amount: 800}
~~~
Runs as part of «dbt build» (or «dbt test --select test_type:unit»), typically in CI only.

### Contracts and constraints
«contract: {enforced: true}» requires the model's columns and data types to match the YAML exactly; the build fails otherwise. Constraints («not_null», «primary_key», «unique», «check») are created in the warehouse where supported, otherwise documented only.

### Data test tuning
«severity: warn», «warn_if: '>10'», «error_if: '>100'», «where:» filters, and «store_failures: true» to keep failing rows in a table for triage.

### Source freshness
«loaded_at_field: _loaded_at» with «warn_after: {count: 2, period: hour}» and «error_after: {count: 6, period: hour}»; run «dbt source freshness» before builds so stale inputs stop the pipeline.`],
 ["match","Test type → catches",[["Unit test","Wrong refund arithmetic in SQL logic"],["Data test unique","Duplicate keys in built data"],["Contract","Column type changed from int to string"],["Source freshness","Upstream load stopped 6 hours ago"]],"Use all four."],
 ["order","Quality gates in a production run",["dbt source freshness (stop if stale)","dbt build: unit tests on changed models (CI)","Models build with contracts enforced","Data tests run right after each model","Failures stored for triage; downstream models skipped"],"dbt build skips children of failed nodes."],
 ["tf","Test truths",[["Unit tests need the built tables to exist.",false,"They use mocked inputs."],["dbt build skips downstream models when a test fails.",true,"Failures stop propagation."],["store_failures saves failing rows to a table.",true,"Easier triage."]]]
]},
{act:"Expert", t:"Large projects", sub:"Mesh, packages, orchestration", rounds:[
 ["learn","Scaling dbt across teams","Big projects split by domain. **Model access** («public», «protected», «private»), **groups** with owners, **model versions** and **contracts** let teams publish stable interfaces; cross-project «ref('finance', 'fct_payments')» (dbt Mesh) consumes them.",null,null,`### Versions
«versions: [{v: 1}, {v: 2}]» with «latest_version» lets you ship a breaking change as v2 while consumers migrate off v1 by a deprecation date.

### Packages and macros
«packages.yml» brings dbt_utils (generic tests, «generate_surrogate_key», «star»), dbt_expectations, audit helpers («compare_relations» to diff old vs new model output before switching). Pin versions.

### Selection and state
- «--select state:modified+ --defer --state prod/»: build changed models, read unchanged parents from production.
- «result:error+ --state»: rerun failures and children (or «dbt retry»).
- «--exclude tag:hourly» / YAML selectors for named selections.

### Orchestration
In Airflow, run dbt with per-model tasks (e.g. Cosmos) for visibility and retries, or one «dbt build» per domain for simplicity. Always pass «--target prod» and keep artifacts for the next run's state comparison.`],
 ["match","Feature",[["access: private","Only models in the same group can ref it"],["Model versions","Ship breaking changes without breaking consumers"],["audit_helper.compare_relations","Diff a refactored model against the old one"],["dbt retry","Re-run only what failed last time"]],"Tools for teams, not just models."],
 ["pick","You refactored fct_payments and want proof the output didn't change. Use…",["audit_helper compare_relations on old vs new","Just run tests","Look at row counts only","Docs"],0,"Row-level diff before switching."],
 ["sort","Selector does what?",{"Build changed + children":["state:modified+ --defer"],"Rerun failures":["dbt retry","result:error+"],"Upstream of a model":["+fct_payments"]},"Selectors keep runs small."],
 ["tf","Scale truths",[["A private model can be referenced from any project.",false,"Only within its group."],["--defer reads unchanged parents from another environment's relations.",true,"Saves rebuilding them."]]]
]},
{act:"Expert", t:"Expert boss: The dbt platform review", boss:true, time:45, rounds:[
 ["pick","dbt parse fails in CI with a warehouse connection error from a macro. Fix?",["Guard run_query with {% if execute %}","Add threads","Use seeds","Disable partial parse"],0,"Parse-time Jinja."],
 ["pick","Late events from mobile are missing in an incremental model. Fix?",["Lookback window + unique_key merge","append strategy","More tests","Ephemeral"],0,"Reprocess a window."],
 ["pick","A 3-year backfill must be restartable per day. Strategy?",["microbatch with event_time and batch_size day","merge only","full refresh","view"],0,"Retry failed batches alone."],
 ["pick","Refund arithmetic bug shipped despite data tests passing. Add…",["Unit tests with mocked rows","More unique tests","Freshness","Docs"],0,"Test logic, not just data."],
 ["pick","Finance team changed a column type and broke marketing's model. Prevent?",["Contracts + model versions for shared models","Seeds","More threads","Ephemeral"],0,"Stable interfaces."],
 ["pick","Daily run takes 3 h though most models are fast. First look at?",["The critical path of dependencies in run timings","Thread count only","Seeds","Docs"],0,"Long chains set runtime."],
 ["pick","Pipelines run on stale source data silently. Add…",["dbt source freshness before build","Contracts","Unit tests","Snapshots"],0,"Stop early on stale inputs."]
]}
]);
