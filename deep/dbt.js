QUEST.deep("dbt", {
"A model is a SELECT": {
d: `In dbt you write each transformation as a **SELECT** in «models/*.sql». dbt handles the DDL/DML: «CREATE VIEW AS», «CREATE TABLE AS», MERGE for incremental models, in the right **order**.

Order comes from «{{ ref('model_name') }}»: each ref is an edge in a **DAG**. dbt resolves it to the correct schema/table name for the current environment (dev schema vs prod), and runs parents before children. «{{ source('raw', 'payments') }}» declares raw inputs (with freshness checks and lineage).

A typical layered project: **staging** (one model per source table: rename, cast, light cleaning) → **intermediate** (joins, business logic) → **marts** (facts and dimensions for consumers). Everything is code: version-controlled, reviewed, tested, documented («dbt docs»).`,
life: `Writing recipes for each dish and noting which dishes need others first (the gravy needs the stock). The kitchen manager (dbt) figures out the cooking order and does the actual pots and pans.`,
work: `A team's 80 hand-scheduled SQL scripts in Airflow had hidden dependencies; one reorder broke settlement reports for a day. Moving them into dbt with refs gave an explicit DAG, «dbt build» ran in correct order, and lineage showed exactly which marts a raw table change would affect.`,
ex: `-- models/staging/stg_payments.sql
select
  id            as payment_id,
  merchant_id,
  amount / 100.0 as amount_inr,
  status,
  created_at
from {{ source('raw', 'payments') }}

-- models/marts/fct_daily_gmv.sql
select merchant_id, date_trunc('day', created_at) as day, sum(amount_inr) as gmv
from {{ ref('stg_payments') }}
where status = 'SUCCESS'
group by 1, 2`,
pit: [`Hard-coding schema.table names instead of ref/source.`, `Business logic in staging models.`, `Giant models doing everything at once.`],
q: [`What does ref() give you besides a table name?`, `A dependency edge in the DAG (run order and lineage) and environment-aware naming.`]
},
"Four main materializations": {
d: `- **view**: «CREATE VIEW»; no storage, always fresh, computed on every query. Good for light staging logic; bad if heavy and queried often.
- **table**: «CREATE TABLE AS SELECT» rebuilt on every run. Simple and fast to query; cost = full recompute each run.
- **incremental**: first run builds the table; later runs insert/merge only new or changed rows. For large, append-heavy or slowly changing facts.
- **ephemeral**: not built in the warehouse; inlined as a CTE into models that ref it. Keeps code modular without creating objects; can't be queried directly.
- Also **materialized_view** on supporting adapters, and **snapshots** (separate resource).

Choose per model with «{{ config(materialized='table') }}» or in «dbt_project.yml» per folder. A common default: staging = view, marts = table, big facts = incremental.`,
life: `View = a recipe you cook fresh every time someone orders. Table = cooking a full batch every morning. Incremental = only cooking extra portions for new orders. Ephemeral = a prep step that never goes on the menu.`,
work: `A mart with 12 views stacked on views took 4 minutes per dashboard query in Redshift. Materialising the two heaviest intermediate models as tables (rebuilt hourly) cut dashboard queries to 6 seconds, at the cost of a 3-minute hourly build.`,
ex: `# dbt_project.yml
models:
  payments:
    staging:      {+materialized: view}
    intermediate: {+materialized: ephemeral}
    marts:        {+materialized: table}
-- models/marts/fct_transactions.sql
{{ config(materialized='incremental', unique_key='payment_id') }}`,
pit: [`Deep stacks of views on heavy logic.`, `Rebuilding huge tables fully every run.`, `Ephemeral models referenced by many models (inlined repeatedly).`],
q: [`When is a view materialization a poor choice?`, `When the logic is heavy and queried frequently; each query recomputes it.`]
},
"Incremental models": {
d: `An incremental model processes only new/changed data after the first build:
- «is_incremental()» is true when the target exists, the model is incremental, and you're not running «--full-refresh». Inside that block, filter the source: «where updated_at > (select max(updated_at) from {{ this }})».
- «unique_key»: with it, dbt **merges/updates** existing rows with the same key; without it, rows are just appended (duplicates if data is re-processed).
- **Late-arriving data**: filter with a lookback window («> max(updated_at) - interval '3 days'») plus unique_key so late rows are caught and re-processed rows overwrite.
- «on_schema_change»: «ignore», «append_new_columns», «sync_all_columns», «fail».
- Run «--full-refresh» to rebuild when logic changes affect history.`,
life: `Updating a ledger daily: you only enter today's transactions (incremental), but you re-check the last three days in case a late receipt turned up, and you correct existing entries rather than duplicating them (unique key).`,
work: `A fact table built with «where created_at > max(created_at)» silently missed refunds updated days later (status changes). Switching the filter to «updated_at» with a 3-day lookback and «unique_key='payment_id'» fixed the counts; finance reconciliation mismatches dropped from ~0.4% to 0.`,
ex: `{{ config(materialized='incremental', unique_key='payment_id',
          incremental_strategy='merge', on_schema_change='append_new_columns') }}
select payment_id, merchant_id, amount_inr, status, updated_at
from {{ ref('stg_payments') }}
{% if is_incremental() %}
where updated_at > (select dateadd(day, -3, max(updated_at)) from {{ this }})
{% endif %}`,
pit: [`Filtering on created_at when rows get updated.`, `No unique_key → duplicates on reprocessing.`, `Forgetting full-refresh after logic changes.`],
q: [`Why add a lookback window to the incremental filter?`, `To catch late-arriving or late-updated rows; with a unique_key, re-processed rows overwrite instead of duplicating.`]
},
"Data tests": {
d: `dbt tests are SQL queries that **return failing rows**; zero rows = pass.
- **Generic tests** in YAML on columns/models: «unique», «not_null», «accepted_values», «relationships» (foreign key to another model).
- **Singular tests**: «tests/*.sql» files with any SELECT returning bad rows (e.g. negative settlement amounts).
- **Packages**: «dbt_utils» (unique_combination_of_columns, expression_is_true, recency), «dbt_expectations» (ranges, row counts, regex).
- **Source freshness**: «loaded_at_field» + warn/error thresholds; «dbt source freshness».
- Config: «severity: warn|error», «where» filters, «store_failures» to persist failing rows, «error_if/warn_if» thresholds.

«dbt build» runs models and their tests in DAG order, so downstream models don't build on top of failed tests (with error severity).`,
life: `Quality checks on an assembly line: every batch is checked for missing parts (not_null), duplicates (unique) and wrong sizes (accepted_values) before it moves to the next station.`,
work: `A duplicate «payment_id» from a source bug doubled GMV on a dashboard for two days before anyone noticed. Adding «unique» and «not_null» tests on «payment_id» in staging, plus «dbt build» in the pipeline, stopped the next occurrence at staging; downstream marts weren't built and on-call got the failure.`,
ex: `# models/staging/_stg_payments.yml
models:
  - name: stg_payments
    columns:
      - name: payment_id
        tests: [unique, not_null]
      - name: status
        tests:
          - accepted_values: {values: ['SUCCESS','FAILED','PENDING','REFUNDED']}
      - name: merchant_id
        tests:
          - relationships: {to: ref('dim_merchants'), field: merchant_id, config: {severity: warn}}
-- tests/assert_no_negative_settlements.sql
select * from {{ ref('fct_settlements') }} where net_amount_inr < 0`,
pit: [`Tests only on marts (problems found too late).`, `Running models and tests separately (dbt run then test) so bad data propagates.`, `Hundreds of warn-only tests nobody reads.`],
q: [`What does a dbt test query return when it passes?`, `Zero rows.`]
},
"Contracts, unit tests, severity": {
d: `- **Model contracts** («contract: {enforced: true}» with column names and data types, optionally constraints): dbt checks at build time that the model's output matches the declared shape; on supporting platforms it creates the table with those types/constraints. Protects downstream consumers from accidental column renames or type changes.
- **Unit tests** (dbt 1.8+): define mock input rows for refs/sources and expected output rows; dbt runs the model's SQL on the mocks without needing real data. Ideal for complex logic (window functions, edge cases like nulls, timezones, holidays).
- **Severity and thresholds**: tests can «warn» or «error», with «error_if: ">100"» / «warn_if: ">10"», so minor data issues don't block pipelines while serious ones do.`,
life: `A contract is the agreed shape of a delivered part; a unit test checks a machine with sample materials before production; severity decides whether a defect stops the line or just gets logged.`,
work: `A refactor renamed «amount_inr» to «amount» in «fct_settlements»; three dashboards broke. After adding a contract, the same change failed in CI with a clear message. Unit tests on the fee calculation caught a GST rounding bug on mock data before it ever ran on production rows.`,
ex: `models:
  - name: fct_settlements
    config: {contract: {enforced: true}}
    columns:
      - {name: settlement_id, data_type: varchar, constraints: [{type: not_null}]}
      - {name: net_amount_inr, data_type: numeric(18,2)}
unit_tests:
  - name: gst_on_fee
    model: fct_settlements
    given:
      - input: ref('stg_settlements')
        rows: [{settlement_id: 's1', gross_inr: 1000, fee_inr: 20}]
    expect:
      rows: [{settlement_id: 's1', net_amount_inr: 976.40}]`,
pit: [`Contracts on every internal model (friction without benefit).`, `Unit tests duplicating simple column tests.`, `All tests as errors (pipelines blocked by trivial issues).`],
q: [`What's the difference between a unit test and a data test in dbt?`, `Unit tests check logic on mocked input before building; data tests check the real built data.`]
},
"Snapshots = SCD Type 2": {
d: `Source tables often overwrite rows (a merchant's plan changes from "basic" to "pro"), losing history. A **snapshot** captures changes over time as **SCD Type 2**: each version of a row gets «dbt_valid_from», «dbt_valid_to» (null = current), «dbt_scd_id», «dbt_updated_at».

Strategies:
- **timestamp**: uses an «updated_at» column to detect changes (reliable if the source maintains it).
- **check**: compares listed columns («check_cols») between runs (use when no reliable updated_at).

Options: «hard_deletes» ('ignore', 'invalidate', 'new_record') to handle deleted source rows. Snapshots must run **regularly** (e.g. hourly/daily): changes that happen and revert between runs are missed. Since dbt 1.9, snapshots can be configured in YAML.`,
life: `A photo album of a house taken every day: you can see when the walls were repainted and what colour they were before, as long as you keep taking photos.`,
work: `Finance needed "merchant's fee plan at the time of each transaction". The source only kept the current plan. A daily snapshot of «merchants» (strategy: timestamp on «updated_at») let the fact join on «created_at between dbt_valid_from and coalesce(dbt_valid_to, '9999-12-31')», giving historically correct fees.`,
ex: `# snapshots/merchants_snapshot.yml
snapshots:
  - name: merchants_snapshot
    relation: source('raw', 'merchants')
    config:
      unique_key: merchant_id
      strategy: timestamp
      updated_at: updated_at
      hard_deletes: invalidate
-- usage
select t.*, m.fee_plan
from {{ ref('fct_transactions') }} t
join {{ ref('merchants_snapshot') }} m
  on m.merchant_id = t.merchant_id
 and t.created_at >= m.dbt_valid_from
 and t.created_at <  coalesce(m.dbt_valid_to, '9999-12-31')`,
pit: [`Running snapshots rarely and missing changes.`, `Using timestamp strategy with an unreliable updated_at.`, `Joining on the current snapshot row only (losing history).`],
q: [`What does dbt_valid_to = null mean?`, `That row version is the current one.`]
},
"Jinja and macros": {
d: `dbt SQL is rendered with **Jinja**: «{{ }}» outputs expressions, «{% %}» runs logic (if, for, set), «{# #}» comments. **Macros** are reusable Jinja functions in «macros/»: «{% macro cents_to_inr(col) %}({{ col }} / 100.0){% endmacro %}» → «{{ cents_to_inr('amount') }}».

Useful features: «var()» for project variables, «target» (current environment: «target.name», «target.schema»), «env_var()», «run_query()» for introspection, «adapter» methods, and **dispatch** to write cross-database macros. Packages (dbt_utils, dbt_date) ship many macros.

Rule: keep models readable. Generate repetitive SQL (pivot 40 payment methods) with loops, but don't hide core business logic in deep macro chains; check the compiled SQL in «target/compiled/».`,
life: `Mail-merge for SQL: a template letter with placeholders and small rules ("if customer is VIP, add this paragraph"), producing a final letter you can read.`,
work: `A pivot of 35 payment methods into columns was hand-written and missed new methods. A Jinja loop over a «var('payment_methods')» list (later over «dbt_utils.get_column_values») generated the columns automatically; new methods appeared without code changes.`,
ex: `{% set methods = dbt_utils.get_column_values(ref('stg_payments'), 'method') %}
select merchant_id,
  {% for m in methods %}
  sum(case when method = '{{ m }}' then amount_inr else 0 end) as {{ m | lower }}_inr{% if not loop.last %},{% endif %}
  {% endfor %}
from {{ ref('stg_payments') }}
group by 1
{# check target/compiled/... for the generated SQL #}`,
pit: [`Unreadable macro-heavy models.`, `run_query in models slowing parse/compile.`, `Not inspecting compiled SQL when debugging.`],
q: [`Where can you see the SQL dbt actually runs?`, `In target/compiled (and target/run) after compile/run.`]
},
"Slim CI": {
d: `Building the whole project on every PR is slow and costly. **Slim CI** builds only what changed:
- dbt writes a **manifest.json** describing every node. Keep production's manifest as a reference («--state path/to/prod_artifacts»).
- «--select state:modified+»: models whose code/config changed **plus everything downstream** (+).
- «--defer»: for unchanged upstream models, use production relations instead of building them in the CI schema.
- Often combined with «--empty» (schema-only builds) or sampled data, and with «result:error+» style selectors for retries.

Run «dbt build» (models + tests + snapshots + seeds) for the selected set in an isolated CI schema; drop it after. dbt Cloud does this natively; with dbt Core you store prod artifacts in S3/GCS.`,
life: `After repairing one room of a building, you inspect that room and everything that depends on it (the floor above), not the whole city block.`,
work: `Full CI builds took 75 minutes and ran up warehouse cost. Storing prod «manifest.json» in S3 after each deploy and running «dbt build -s state:modified+ --defer --state prod/» cut typical PR checks to 6 minutes; a nightly full build still ran on main.`,
ex: `aws s3 cp s3://dbt-artifacts/prod/manifest.json prod_state/manifest.json
dbt build --select state:modified+ --defer --state prod_state --target ci
# cleanup: drop schema ci_pr_1234`,
pit: [`Missing or stale prod manifest (everything looks modified).`, `Forgetting the + (downstream breakage not tested).`, `CI writing into prod schemas.`],
q: [`What does --defer do in Slim CI?`, `For unselected upstream models, it reads the production versions instead of building them in the CI environment.`]
},
"Parse → compile → execute": {
d: `What happens on «dbt build»:
1. **Parse**: read all project files (SQL, YAML, macros), resolve configs, build the DAG of nodes; write «target/manifest.json» (and partial parsing caches for speed).
2. **Select**: apply «--select/--exclude» graph selectors to choose nodes.
3. **Compile**: render Jinja per node into pure SQL (resolving ref/source to real relation names for the target).
4. **Execute**: run nodes in DAG order with «--threads» concurrency, using the adapter's materialization macros (CREATE TABLE AS, MERGE...). Tests run after their models.
5. **Artifacts**: «run_results.json» (status, timing per node), «manifest.json», «catalog.json» (from docs generate), «sources.json» (freshness).

Artifacts power Slim CI, docs, lineage tools and observability (timing regressions per model).`,
life: `Preparing a wedding: list every task and dependency (parse), pick today's tasks (select), write exact instructions (compile), then crews work in parallel in the right order (execute), with a report at the end (artifacts).`,
work: `«dbt build» took 50 minutes and nobody knew why. Parsing «run_results.json» into a table showed 3 models accounting for 30 minutes and «threads: 4» leaving the warehouse underused. Raising threads to 12 and making one model incremental cut runtime to 17 minutes.`,
ex: `dbt parse && ls target/            # manifest.json, partial_parse.msgpack
dbt compile -s fct_settlements && cat target/compiled/payments/models/marts/fct_settlements.sql
dbt build --threads 12
python - <<'PY'
import json; r = json.load(open("target/run_results.json"))
for n in sorted(r["results"], key=lambda x: -x["execution_time"])[:5]:
    print(round(n["execution_time"]), n["unique_id"])
PY`,
pit: [`Ignoring run_results timings.`, `Too few threads for the warehouse.`, `Slow parse from heavy run_query macros.`],
q: [`Which artifact lists per-node status and timing after a run?`, `run_results.json.`]
},
"Strategies by platform": {
d: `«incremental_strategy» controls the SQL used to apply new data; availability depends on the adapter:
- **append**: insert new rows only (no dedupe). Fast; for immutable events.
- **merge**: «MERGE» on «unique_key»: update matches, insert new (Snowflake, BigQuery, Databricks, Postgres 15+, Redshift via merge or delete+insert depending on version).
- **delete+insert**: delete target rows with matching keys, then insert (Postgres, Redshift, Snowflake). Often faster than merge for large batches.
- **insert_overwrite**: replace whole **partitions** (BigQuery, Spark/Databricks, Hive/Athena): ideal for partitioned facts where you reprocess the last N days.
- **microbatch** (dbt 1.9+): process data in time batches («event_time», «batch_size», «lookback», «begin»); supports backfills of specific periods and retries per batch.
- **replace_where** (Databricks Delta).

Pick based on data mutability, size, partitioning and the platform's strengths.`,
life: `Updating a register: just add new pages (append), find and correct specific entries (merge), tear out and rewrite specific entries (delete+insert), or replace whole monthly sections (insert_overwrite).`,
work: `On Databricks, a daily fact used merge with a unique_key on 4 B rows: 40-minute runs. Since each run reprocessed the last 3 days of partitions, switching to «insert_overwrite» by «event_date» made runs 7 minutes. Later, microbatch with a 3-day lookback made backfills of single days simple.`,
ex: `{{ config(materialized='incremental', incremental_strategy='insert_overwrite',
          partition_by={'field': 'event_date', 'data_type': 'date'}) }}
-- dbt 1.9 microbatch
{{ config(materialized='incremental', incremental_strategy='microbatch',
          event_time='created_at', batch_size='day', lookback=3, begin='2025-01-01') }}`,
pit: [`append for data that can be re-processed (duplicates).`, `merge on huge tables without partition pruning predicates.`, `Assuming a strategy exists on every adapter.`],
q: [`When is insert_overwrite a good fit?`, `Partitioned fact tables where each run rebuilds a known set of recent partitions.`]
},
"Layers of tests": {
d: `A healthy dbt project tests at several layers:
- **Unit tests**: transformation logic on mocked rows (edge cases) before building. Fast, run in CI.
- **Contracts**: output shape/types of public models enforced at build.
- **Data tests**: built data quality: keys unique/not null, relationships, accepted values, business rules (singular tests), row-count and recency checks.
- **Source freshness**: raw data arriving on time.
- **Reconciliation tests**: totals vs source systems (GMV in mart = GMV in OLTP for the day, within tolerance).
- **Downstream/observability**: anomaly detection on volumes and distributions (Elementary, Monte Carlo, re_data).

Put cheap, high-signal tests early (staging keys), critical business checks on marts, and decide severity per test.`,
life: `Quality control at a bakery: test the recipe on a small batch (unit), check loaves are the right size (contract), inspect each batch (data tests), confirm flour delivery arrived (freshness), and match sales to the till (reconciliation).`,
work: `All tests passed but a mart's revenue was 2% low: a source filter dropped a new payment method. A reconciliation test comparing daily mart totals with the OLTP ledger (tolerance 0.1%) caught the next such issue within one run.`,
ex: `-- tests/reconcile_daily_gmv.sql
with mart as (select day, sum(gmv) g from {{ ref('fct_daily_gmv') }} group by 1),
src  as (select date_trunc('day', created_at) day, sum(amount)/100.0 g
         from {{ source('raw','payments') }} where status='SUCCESS' group by 1)
select * from mart join src using (day)
where abs(mart.g - src.g) > 0.001 * src.g`,
pit: [`Only generic column tests.`, `No reconciliation against sources.`, `Tests that always warn and are ignored.`],
q: [`What kind of bug do reconciliation tests catch that column tests miss?`, `Missing or extra data (e.g. a dropped category) where every row is valid but totals are wrong.`]
},
"Scaling dbt across teams": {
d: `As projects grow to thousands of models and many teams:
- **Groups and owners**: assign models to groups with an owner (email/Slack) for accountability.
- **Model access**: «private» (only within its group), «protected» (within the project, default), «public» (can be referenced from other projects).
- **Contracts + versions** on public models: change interfaces safely with «versions» (v1, v2), deprecation dates, and consumers migrating gradually («ref('dim_merchant', v=2)»).
- **Multi-project ("dbt Mesh")**: split into domain projects (payments, risk, marketing) referencing each other's public models via cross-project refs.
- **Conventions**: naming, folder structure, style guides enforced by linters (SQLFluff), CODEOWNERS, pre-commit hooks.
- **Performance**: Slim CI, state-aware orchestration, separate jobs per domain.`,
life: `A city with neighbourhoods: each has its own council (team) and internal roads (private models), but main roads between neighbourhoods (public models) follow published rules and are changed with notice.`,
work: `A 2,500-model monolith had frequent breakages from teams changing each other's models. Introducing groups with owners, marking 60 models as public with contracts, and versioning «dim_merchant» when its grain changed let marketing migrate on their schedule; cross-team incidents fell sharply.`,
ex: `groups:
  - name: payments
    owner: {name: Payments Data, email: payments-data@company.in}
models:
  - name: dim_merchant
    group: payments
    access: public
    config: {contract: {enforced: true}}
    latest_version: 2
    versions:
      - v: 1
        deprecation_date: 2026-12-31
      - v: 2`,
pit: [`Everything public by default.`, `Breaking public models without versions.`, `No owners for alerts.`],
q: [`What does access: private mean for a model?`, `It can only be referenced by models in the same group.`]
}
});
