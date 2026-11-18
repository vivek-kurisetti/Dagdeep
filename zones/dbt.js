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

/* ===== On-call desk: dbt incident ===== */
QUEST.cases("dbt", [
{
 title:"Revenue doubled overnight", icon:"📈", sev:1, clock:"08:50", channel:"inc-2344-revenue-mismatch", svc:"finance mart · dbt on Snowflake", need:4,
 terms:[["Model","A dbt SELECT statement that builds a table or view. «fct_payments» is the payments fact table."],["Incremental model","A model that only processes new or changed rows on each run instead of rebuilding everything."],["is_incremental()","A dbt macro that's true on incremental runs, so you can filter to just the new rows."],["unique_key","Tells dbt which column identifies a row, so re-processed rows are updated (merged) instead of appended."],["Incremental strategy","How new rows are written: «append» (insert only), «merge» (upsert on unique_key), «delete+insert»."],["Lookback window","Re-reading the last N days on each run to catch late-arriving data."],["dbt test","An assertion run after a build, like «unique» or «not_null» on a column."]],
 deep:[{"t": "Incremental strategies compared", "md": "| Strategy | What dbt does | Use when |\n|---|---|---|\n| «append» | INSERT new rows | Immutable events, no reprocessing |\n| «merge» | MERGE on «unique_key» | Rows can change or be re-read (lookbacks) |\n| «delete+insert» | DELETE matching keys, then INSERT | Adapters without a good MERGE; batch replacements |\n| «insert_overwrite» | Replace whole partitions | Partitioned tables (BigQuery, Spark) |\n| «microbatch» (dbt 1.9+) | One query per time batch by «event_time» | Large time-series with backfills |\n\nA **lookback** only makes sense with a strategy that replaces or merges what it re-reads."}, {"t": "Catching wrong numbers before people do", "md": "- **Generic tests**: «unique», «not_null», «relationships», «accepted_values» on every key.\n- **Reconciliation**: compare totals with a trusted source (ledger) with a tolerance; make it **block** downstream exports.\n- **Anomaly checks**: day-over-day change beyond N% (dbt-expectations, Elementary, or a simple custom test).\n- **CI on PRs**: «dbt build --select state:modified+» against a staging copy, with row-count diffs (e.g. data-diff) on changed models."}],
 pager:`[r]FIRING[/r]  finance_recon: mart revenue vs ledger mismatch [r]+97.4%[/r]
mart      fct_payments  Nov 15-17 GMV = [r]₹1,842 cr[/r]
ledger    source of truth            = ₹933 cr
impact    CFO's daily revenue email goes out at [b]09:30[/b]`,
 brief:"The CFO's daily email is built from «fct_payments». The reconciliation check says the mart shows almost **twice** the ledger's revenue for the last three days. Yesterday a PR was merged to \"handle late-arriving payments\".",
 slack:[
  {at:0, who:"arjun", t:"Is revenue really up 97%?? I'd love that, but the CFO email goes out at 9:30 and I don't believe it. 🙃"},
  {at:5, who:"priya", t:"Mart revenue double the ledger. Before guessing, check if rows are **duplicated**: count rows vs distinct payment IDs.", cmd:"snowsql -q \"select count(*), count(distinct payment_id) from marts.fct_payments where created_date >= '2026-11-15'\""},
  {at:50, who:"meera", t:"Diwali sales were good, but my ops numbers say +8%, not +97%."},
  {on:"dupes", who:"priya", t:"Same payment_id appearing more than once. How does this model write rows? Open it.", cmd:"cat models/marts/fct_payments.sql"},
  {on:"append", who:"ravi", t:"Append with no unique_key… and when did the filter change? Check git.", cmd:"git log -p -1 -- models/marts/fct_payments.sql"},
  {on:"lookback", who:"priya", t:"And why didn't a test catch it? Check the model's tests.", cmd:"cat models/marts/schema.yml"}
 ],
 hints:["Compare row count with distinct payment_id for the affected days.","Look at how the model writes: its materialization, incremental strategy and unique_key.","Yesterday's PR changed the incremental filter. What happens when an append-only model re-reads 3 days on every run?"],
 term:{host:"analytics-ci", user:"oncall", suggest:["snowsql -q \"select count(*), count(distinct payment_id) from marts.fct_payments where created_date >= '2026-11-15'\"","dbt ls -s fct_payments --output json"],
  cmds:[
  {m:["snowsql -q \"select count(*), count(distinct payment_id)"], out:`COUNT(*)    | COUNT(DISTINCT PAYMENT_ID)
[r]18,402,311[/r]  | [g]9,330,104[/g]
[d]→ ~1.97 rows per payment_id since Nov 15[/d]`, clue:"dupes", unlock:["cat models/marts/fct_payments.sql","dbt run-results"]},
  {m:["cat models/marts/fct_payments.sql"], out:`{{ config(materialized='incremental',
          incremental_strategy='[r]append[/r]') }}   [d]-- no unique_key[/d]

select payment_id, merchant_id, amount, status, created_date, updated_at
from {{ ref('stg_payments') }}
{% if is_incremental() %}
where updated_at >= (select dateadd(day, -3, max(updated_at)) from {{ this }})
{% endif %}`, clue:"append", unlock:["git log -p -1 -- models/marts/fct_payments.sql"]},
  {m:["git log -p -1","git log"], out:`commit [y]c81f2e9[/y] (Tue 17 Nov 18:20, rohan)  Handle late-arriving payments with a 3-day lookback
-where updated_at > (select max(updated_at) from {{ this }})
+where updated_at >= (select dateadd(day, -3, max(updated_at)) from {{ this }})`, clue:"lookback", unlock:["cat models/marts/schema.yml"]},
  {m:["cat models/marts/schema.yml"], out:`models:
  - name: fct_payments
    columns:
      - name: payment_id
        tests: [[y]not_null[/y]]        [d]# no unique test[/d]
      - name: amount
        tests: [not_null]`, clue:"notest"},
  {m:["dbt run-results","cat target/run_results.json"], out:`fct_payments   [g]success[/g]   rows_affected: [r]3,104,882[/r]   [d](typical: ~3.1M per day → this run re-inserted ~3 days)[/d]
stg_payments   [g]success[/g]`, clue:"rows"},
  {m:["dbt source freshness"], out:`source payments.raw_payments   [g]PASS[/g]  max_loaded_at 08:41 (9 min ago)`, note:"Sources are fresh. Late or missing source data isn't the issue."},
  {m:["dbt ls"], out:`[{"name":"fct_payments","resource_type":"model","config":{"materialized":"incremental"}}]`, note:"Just lists the model. Open the SQL to see how it writes rows."},
  {m:["snowsql -q \"select warehouse","snowsql -q \"show warehouses"], out:`TRANSFORM_WH   XSMALL→MEDIUM autoscale   credits today: 41 (normal)`, note:"Warehouse usage is normal. Performance isn't the problem; correctness is."}
 ]},
 dash:[
  {title:"Mart GMV vs ledger (₹ cr per day)", x:["Nov 11","Nov 12","Nov 13","Nov 14","Nov 15","Nov 16","Nov 17"], series:[{name:"mart", v:[300,305,298,310,612,618,612]}, {name:"ledger", v:[300,305,298,310,309,312,312]}], marks:[{i:4, label:"after PR"}], clue:"gap"},
  {title:"Daily orders (ops system)", x:["Nov 11","Nov 12","Nov 13","Nov 14","Nov 15","Nov 16","Nov 17"], series:[{name:"orders", v:[3.0e6,3.05e6,2.98e6,3.1e6,3.21e6,3.24e6,3.22e6]}], note:"Real business grew ~8% for Diwali, nowhere near 97%."},
  {title:"dbt job duration (min)", x:["Nov 11","Nov 12","Nov 13","Nov 14","Nov 15","Nov 16","Nov 17"], series:[{name:"minutes", v:[11,12,11,12,16,17,16]}], note:"Runs got a bit longer because they re-read 3 days. That's a side effect, not the cause."}
 ],
 files:[
  {path:"models/marts/fct_payments.sql", meta:"changed in c81f2e9 (Tue)", text:`{{ config(materialized='incremental',
          incremental_strategy='append') }}

select payment_id, merchant_id, amount, status, created_date, updated_at
from {{ ref('stg_payments') }}
{% if is_incremental() %}
where updated_at >= (select dateadd(day, -3, max(updated_at)) from {{ this }})
{% endif %}`, clues:{2:"append", 7:"lookback"}, notes:{4:"The selected columns are fine."}}
 ],
 clues:{
  dupes:"Since Nov 15, fct_payments has 18.4M rows but only 9.3M distinct payment_ids",
  append:"fct_payments is incremental with strategy «append» and no unique_key",
  lookback:"PR c81f2e9 added a 3-day lookback to the incremental filter",
  notest:"payment_id has no «unique» test, only not_null",
  rows:"Last run inserted 3.1M rows, re-inserting payments already in the table",
  gap:"Mart GMV doubled vs the ledger starting the day after the PR"
 },
 cause:{q:"What's the root cause?", o:[
  {t:"The new 3-day lookback re-selects rows that are already in the table, and the «append» strategy with no unique_key inserts them again, creating duplicate payments; no unique test caught it", ok:true},
  {t:"Diwali sales really did nearly double", ok:false, why:"The ledger and ops systems show +8%. Only the mart doubled, with duplicate IDs.", say:[["meera","Ops says +8%. And the same payment_id is in the mart twice. That's not sales, that's duplicates."]]},
  {t:"The source loaded late and then twice", ok:false, why:"Source freshness passes, and duplicates appear only in the mart.", say:[["ravi","Source freshness is green and stg_payments has unique IDs. The duplication happens in fct_payments."]]},
  {t:"Snowflake returned wrong results", ok:false, why:"The SQL did exactly what it says: append everything the filter selects.", say:[["priya","Snowflake did exactly what we asked: append everything from the last 3 days, every run."]]}
 ]},
 fix:{q:"What do you ship? Pick every action you'd take.", o:[
  {t:"Switch to «incremental_strategy='merge'» with «unique_key='payment_id'» (keep the lookback)", kind:"must", why:"Re-processed rows now update in place. The lookback still catches late payments, without duplicates.", miss:[["meera","Rebuilt and correct today… but tomorrow's run still appends 3 days again. Duplicates are back in the morning."]]},
  {t:"Rebuild the affected range (or «dbt run --full-refresh -s fct_payments») to remove existing duplicates", kind:"must", why:"Changing the strategy fixes future runs; the 9M duplicate rows already there still have to go.", miss:[["arjun","Tomorrow's run will be fine, great. But today's table still shows ₹1,842 cr. I can't send that to the CFO."]]},
  {t:"Add a «unique» test on payment_id and a revenue-vs-ledger check that blocks the CFO email on failure", kind:"good", why:"A broken number should stop the email, not reach the CFO."},
  {t:"Tell Finance which days were affected and hold the 09:30 email until the rebuild passes", kind:"good", why:"Being upfront protects trust in the data."},
  {t:"Revert the PR's lookback only", kind:"meh", why:"Stops new duplicates but leaves the existing ones, and late-arriving payments are missed again."},
  {t:"Divide the dashboard's revenue by 2 for Nov 15-17", kind:"bad", why:"Patching numbers by hand hides the bug and is wrong wherever the duplicate ratio isn't exactly 2.", say:[["arjun","Merchant-level numbers don't add up any more: some merchants are halved, but their payments weren't duplicated. Finance can't sign this off."]]},
  {t:"Add «select distinct» to the final dashboard query", kind:"bad", why:"Hides duplicates in one report while every other consumer of fct_payments stays wrong. Also slow.", say:[["meera","The CFO email looks right now, but the merchant payouts model also reads fct_payments, and it still shows double. We nearly overpaid merchants by ₹900 cr."]]}
 ]},
 post:{
  summary:"The finance mart reported **~2× revenue** for Nov 15-17 (₹1,842 cr vs ₹933 cr in the ledger). The reconciliation check caught it before the CFO email went out.",
  cause:"PR «c81f2e9» added a **3-day lookback** to «fct_payments»'s incremental filter to catch late payments. The model used «incremental_strategy='append'» with **no unique_key**, so each run re-inserted the previous 3 days, roughly doubling those dates. «payment_id» had only a «not_null» test, so nothing failed.",
  prevent:["Every incremental model with a lookback must have a unique_key and merge or delete+insert","«unique» tests on every primary key in marts","Reconciliation vs the ledger gates the CFO email","PR template question: \"what happens if this runs twice on the same data?\""]
 },
 learned:["Incremental + **lookback** needs **unique_key** + **merge**. Append-only re-reads mean duplicates.","First check for a too-good number: **count(*) vs count(distinct id)**.","Fix the model **and** clean up the data already written.","Tests on keys («unique», «not_null») plus reconciliation turn silent errors into loud ones."]
}
]);

/* ===== Work simulator: dbt ===== */
QUEST.work("dbt", [
{
 type:"pr", title:"\"Add merchant LTV model\"", three:"find all 3 problems with no false alarms",
 brief:"The growth team wants **merchant lifetime value (LTV)** on the sales dashboard: total payment amount per merchant over the last 12 months, plus refund count. An analyst opened the PR. It runs and the numbers \"look big, which is good news\".\n\nThe model's grain must be **one row per merchant**.",
 repo:"payu/analytics-dbt", pr:"#317 Add fct_merchant_ltv for the sales dashboard", author:"kavya",
 desc:"New model «fct_merchant_ltv»: 12-month GMV and refund count per merchant.\n\nRan «dbt build -s fct_merchant_ltv» in prod schema ✅ (dev was missing some tables)",
 reasons:["Hard-codes a table instead of using ref() / source()","Join fans out: amounts get multiplied","Nothing tests the model's grain (one row per merchant)","Time zone bug in the date filter","Materialization is wrong for this size"],
 files:[
  {path:"models/marts/fct_merchant_ltv.sql", diff:`@@ -0,0 +1,17 @@
+{{ config(materialized='table') }}
+
+select
+    p.merchant_id,
+    m.merchant_name,
+    sum(p.amount)            as gmv_12m,
+    count(r.refund_id)       as refunds_12m
+from analytics_prod.staging.stg_payments p
+join {{ ref('dim_merchants') }} m
+    on p.merchant_id = m.merchant_id
+left join {{ ref('stg_refunds') }} r
+    on p.merchant_id = r.merchant_id
+where p.created_at >= dateadd(month, -12, current_date)
+  and p.status = 'captured'
+group by 1, 2`},
  {path:"models/marts/schema.yml", diff:`@@ -40,3 +40,9 @@
   - name: fct_payments
     columns:
       - name: payment_id
+  - name: fct_merchant_ltv
+    columns:
+      - name: merchant_id
+        tests: [not_null]          # grain: one row per merchant
+      - name: gmv_12m
+        tests: [not_null]`}],
 bugs:[
  {f:0, at:"from analytics_prod.staging.stg_payments p", a:0, why:"Hard-coding «analytics_prod.staging…» bypasses dbt: the model **always reads prod** (even in dev and CI), dbt can't build it in the right order, and lineage/docs miss the dependency. It's also why \"dev was missing tables\". Use «{{ ref('stg_payments') }}»."},
  {f:0, at:"on p.merchant_id = r.merchant_id", a:1, why:"Joining payments to refunds **on merchant_id alone** pairs every payment with every refund of that merchant. A merchant with 1,000 payments and 20 refunds becomes 20,000 rows, so «sum(p.amount)» is **×20** and «count(r.refund_id)» is ×1,000. Aggregate each side to the merchant grain first (two CTEs), then join."},
  {f:1, at:"# grain: one row per merchant", a:2, why:"Nothing tests the model's **grain**. Today «group by» keeps one row per merchant, but if «dim_merchants» ever holds two rows for a merchant (a renamed merchant, a history table), every LTV silently doubles. A «unique» test on «merchant_id» catches that, and a **reconciliation** test (total GMV vs the source) would have caught *this* PR's fan-out before merge."}
 ],
 notes:[{f:0, at:"where p.created_at >= dateadd(month, -12, current_date)", note:"A rolling 12-month window on «created_at» is what was asked for. Fine for a daily-rebuilt table."},{f:0, at:"{{ config(materialized='table') }}", note:"A table is right: it's aggregated, read by a dashboard, and rebuilt daily."},{f:0, at:"join {{ ref('dim_merchants') }} m", note:"Merchants is one row per merchant: this join doesn't fan out."},{f:0, at:"and p.status = 'captured'", note:"Only counting captured payments is correct for GMV."},{f:1, at:"- name: gmv_12m", note:"Testing gmv for not_null is fine. What's missing is a test on the grain."}],
 shipped:"The sales dashboard showed top merchants with **₹40 crore LTV** (real: ₹2 crore). Sales used it to prioritise accounts for a week before finance noticed.",
 deep:[
  {t:"Fan-out: the most common SQL bug in analytics", md:"A join multiplies rows whenever the join key isn't unique on **at least one side**.\n\n- payments (many per merchant) ⋈ refunds (many per merchant) on merchant_id = **many × many** rows per merchant.\n- Any «sum()» over the left side is then multiplied by the number of matches on the right.\n\n**Fix: aggregate before you join.**\n~~~\nwith pay as (select merchant_id, sum(amount) gmv_12m from {{ ref('stg_payments') }} where … group by 1),\n     ref as (select merchant_id, count(*) refunds_12m from {{ ref('stg_refunds') }} where … group by 1)\nselect m.merchant_id, m.merchant_name, coalesce(pay.gmv_12m, 0), coalesce(ref.refunds_12m, 0)\nfrom {{ ref('dim_merchants') }} m\nleft join pay using (merchant_id)\nleft join ref using (merchant_id)\n~~~\nQuick check: «count(*)» before and after each join should only go **down or stay equal** at the target grain."},
  {t:"ref() and source(): why dbt needs them", md:"- «ref('model')» resolves to the right **database.schema** for the current target (dev, CI, prod), so dev builds read dev tables.\n- It builds the **DAG**: dbt knows to build «stg_payments» before «fct_merchant_ltv», and «dbt build -s +fct_merchant_ltv» includes upstream models.\n- It powers **lineage, docs and state-based CI** («--select state:modified+»).\n- Raw tables loaded by other tools go through «source('payments', 'raw_payments')», declared in a sources YAML, which also enables **freshness** checks."},
  {t:"Test the grain, every time", md:"Every model has a **grain**: what one row represents. State it and test it:\n~~~\n- name: fct_merchant_ltv\n  columns:\n    - name: merchant_id\n      tests: [not_null, unique]\n~~~\nFor composite grains use «dbt_utils.unique_combination_of_columns». Add a **relationships** test to the parent («merchant_id» exists in dim_merchants) and, for money, a **reconciliation** test that compares totals with the source (e.g. total GMV within 0.5% of the ledger)."}
 ],
 say:"In analytics PRs I check three things first: every table goes through ref() or source(), joins can't fan out (aggregate each side to the target grain before joining), and the model's grain is tested with unique and not_null on its key."
}
]);
