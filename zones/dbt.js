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
