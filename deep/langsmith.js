QUEST.deep("langsmith", {
"A trace is a tree of runs": {
d: `LangSmith records each request as a **trace**: a tree of **runs**. The root run is your request (e.g. "answer_question"); children are the steps it performed: retriever call, prompt formatting, LLM call, tool calls, nested chains. Each run stores inputs, outputs, start/end time, latency, token usage and **cost**, errors, tags and metadata.

Why it matters: LLM apps fail in non-obvious places. A wrong answer may come from an empty retrieval, a truncated prompt, a tool error swallowed by the agent, or a model ignoring context. The trace tree shows exactly what the model saw and did at each step, so you debug with evidence instead of guessing. Traces are grouped into **projects**; threads group multi-turn conversations.`,
life: `An itemised bill for a hospital visit: not just the total, but each test, who did it, how long it took and what it cost, nested under the visit.`,
work: `Users reported "the bot ignores my order number". Traces showed the retriever returned nothing for queries with order ids, so the model answered generically. The fix was in retrieval (hybrid search), not the prompt; without traces the team had been rewriting prompts for a week.`,
ex: `export LANGSMITH_TRACING=true
export LANGSMITH_API_KEY=...            # from a secret store
export LANGSMITH_PROJECT=merchant-support-prod
# LangChain/LangGraph runs are traced automatically
# root run: merchant_qa (2.1s, 3,412 tokens, ₹0.42)
#  ├─ retriever (180ms, 6 docs)
#  ├─ ChatPromptTemplate
#  └─ ChatAnthropic (1.8s, in 3,050 / out 362)`,
pit: [`Tracing only in dev, not production.`, `Sending PII to traces without masking.`, `One giant project for every environment.`],
q: [`What does a child run in a trace represent?`, `A step executed within the parent: e.g. a retriever, LLM, tool or sub-chain call, with its own inputs, outputs and timing.`]
},
"Trace any code": {
d: `LangChain/LangGraph code is traced automatically when tracing is enabled. For everything else (raw SDK calls, your own functions, other frameworks):
- Python: «@traceable(run_type="chain" | "llm" | "tool" | "retriever", name=...)» on functions; nested decorated calls become child runs.
- «wrap_openai(client)» / «wrap_anthropic(client)» wrappers trace provider SDK calls with tokens.
- JS/TS: «traceable()» wrapper.
- **OpenTelemetry**: send OTel spans to LangSmith.

Add **metadata** and **tags** (user tier, feature flag, model version, tenant) at call time to filter traces later; set «run_name»s that read well in the UI. Use **masking** options («hide_inputs», «hide_outputs», or custom anonymizers) for sensitive data.`,
life: `Putting tracking stickers on parcels that don't come from the main courier, so the tracking dashboard still shows the full journey.`,
work: `A pipeline used the Anthropic SDK directly plus custom ranking code. Adding «@traceable» to «rank_candidates» and «wrap_anthropic» to the client made those steps visible; traces revealed ranking took 1.2 s of a 2 s request due to an unindexed DB lookup.`,
ex: `from langsmith import traceable
from langsmith.wrappers import wrap_anthropic
import anthropic
client = wrap_anthropic(anthropic.Anthropic())
@traceable(run_type="retriever", name="fetch_policy_chunks")
def fetch(q): return search(q)
@traceable(name="answer", metadata={"feature": "policy-qa"})
def answer(q, merchant_id):
    docs = fetch(q)
    return client.messages.create(model="claude-sonnet-4-5", max_tokens=500,
        messages=[{"role": "user", "content": build_prompt(q, docs)}])`,
pit: [`Untraced custom steps hiding latency.`, `No metadata to slice traces.`, `Raw PII in inputs/outputs.`],
q: [`How do you make a plain Python function appear as a run in LangSmith?`, `Decorate it with @traceable (choosing a run_type and name).`]
},
"Datasets of examples": {
d: `A **dataset** is a versioned collection of **examples**: «inputs», optional **reference outputs** (expected answer, expected tool calls, relevant doc ids), and metadata (category, difficulty, source). Datasets power offline evaluation and regression testing.

Sources:
- Hand-written cases from domain experts (cover core flows and edge cases).
- **Production traces**: add real failures and interesting cases from traces with one click or via automation rules (anonymise first).
- Synthetic generation to expand coverage (review before trusting).

Good datasets are **representative** (match real traffic mix), include **hard and adversarial** cases, are **split** (e.g. dev vs held-out), and are **versioned** so experiments are comparable over time. Start small (30–100 examples) and grow from production failures.`,
life: `A driving test route: a fixed set of tricky junctions every new driver (model version) must pass, updated whenever a new kind of accident happens.`,
work: `The team started with 40 handwritten Q&A pairs. Every week they added 10–20 failed production traces (thumbs-down, escalations) after review. After 3 months the 600-example dataset caught two regressions from a prompt change that the original 40 would have missed.`,
ex: `from langsmith import Client
c = Client()
ds = c.create_dataset("merchant-support-golden", description="Real merchant questions with expected answers")
c.create_examples(dataset_id=ds.id, examples=[
  {"inputs": {"q": "Why was my settlement on 18 Nov delayed?"},
   "outputs": {"must_mention": ["bank holiday", "T+1"]},
   "metadata": {"category": "settlement"}}])`,
pit: [`Only synthetic examples.`, `Never adding production failures.`, `Changing the dataset without versioning, making comparisons meaningless.`],
q: [`Why add failed production traces to the dataset?`, `They represent real weaknesses; once fixed, they become regression tests so the bug can't silently return.`]
},
"Evaluators score runs": {
d: `An **evaluator** looks at a run's outputs (and the example's inputs/reference) and returns a score with a key («correctness: 1», «faithfulness: 0.8»).
- **Code evaluators**: deterministic checks: exact match, regex, JSON schema validity, required fields, numeric tolerance, "contains citation", latency/cost thresholds, correct tool called.
- **LLM-as-judge**: a model grades with a rubric (correctness vs reference, groundedness in retrieved docs, helpfulness, tone). Use clear criteria, ask for reasoning before the score, prefer binary or small scales, and **calibrate** against human labels.
- **Pairwise** evaluators compare two outputs (A vs B) for preference.
- **Human** review via annotation queues.

Combine: cheap code checks for hard constraints, LLM judges for nuanced quality, humans for calibration and edge cases.`,
life: `Grading exams: some questions are auto-marked (multiple choice), essays are graded by a teacher with a rubric, and the head teacher spot-checks grading consistency.`,
work: `An LLM judge rated 92% of answers "correct" but humans agreed only 74% of the time. The rubric was vague. Rewriting it with explicit criteria ("must give the date and reason; any invented policy = 0") and few-shot judged examples raised human agreement to 91%.`,
ex: `def json_valid(outputs: dict) -> dict:
    try: json.loads(outputs["answer"]); return {"key": "json_valid", "score": 1}
    except Exception: return {"key": "json_valid", "score": 0}
JUDGE = """You grade a support answer.
Reference facts: {reference}
Answer: {answer}
Score 1 only if every reference fact is present and nothing contradicts it. Think first, then output SCORE: 0 or 1."""`,
pit: [`Uncalibrated LLM judges.`, `Only one fuzzy "quality" score.`, `Judges seeing the expected answer in a biased way (position, length bias).`],
q: [`Why calibrate an LLM judge against human labels?`, `To confirm the judge's scores agree with human judgment before trusting it for decisions.`]
},
"Experiments": {
d: `An **experiment** = running a specific version of your app (prompt, model, retriever settings, code) over a **dataset version** and scoring with evaluators. Results are stored per example, so you can:
- Compare experiments **side by side**: aggregate scores, latency, cost.
- Drill into **regressions**: examples that passed in the baseline and fail now (and vice versa).
- Run **repetitions** to account for nondeterminism.
- Use **pairwise** comparison when absolute scores are hard.

Treat every change as an experiment with a clear hypothesis ("reranker improves correctness without +300 ms latency"). Decisions should consider all metrics: a +3% correctness gain with 2× cost may not be worth it.`,
life: `A cooking competition where every new recipe version is tasted on the same set of plates by the same judges, so you can tell exactly which dishes got better or worse.`,
work: `Switching to a cheaper model: experiment showed correctness −1.5% overall but −12% on the "refund policy" category, visible only in per-example comparison. They kept the larger model for that category via routing and used the cheaper one elsewhere, saving 40% cost.`,
ex: `from langsmith import evaluate
res = evaluate(
    lambda inputs: app.invoke(inputs),
    data="merchant-support-golden",
    evaluators=[json_valid, correctness_judge],
    experiment_prefix="reranker-bge-v2",
    num_repetitions=2,
    max_concurrency=4)
# compare in UI against "baseline-2026-11-10"`,
pit: [`Comparing experiments on different dataset versions.`, `Only looking at averages.`, `Single runs of nondeterministic apps.`],
q: [`Why look at per-example comparisons, not just averages?`, `Averages can hide regressions in specific categories or cases that matter.`]
},
"Close the loop in production": {
d: `Offline evals don't cover everything users do. In production:
- **User feedback**: thumbs up/down, corrections, escalations attached to runs («create_feedback» with the run id).
- **Online evaluators**: run evaluators (LLM judges, code checks) automatically on a **sample** of live traces: hallucination, toxicity, PII leakage, format errors.
- **Monitoring dashboards**: latency (p50/p95), error rate, token cost, feedback scores over time, sliced by metadata (model version, tenant, feature).
- **Alerts** on spikes (error rate, cost per request, negative feedback).
- **Automation rules**: route bad traces to annotation queues and datasets.

The loop: production signal → human review → add to dataset → fix → experiment → deploy → monitor.`,
life: `A restaurant reading customer reviews, spot-checking dishes leaving the kitchen, and adding problem dishes to the next staff training session.`,
work: `After a prompt change, online evaluation showed groundedness dropping from 0.93 to 0.81 within hours on 10% sampled traffic, before many users complained. An alert fired, the change was rolled back via feature flag, and the failing traces were added to the dataset.`,
ex: `from langsmith import Client
Client().create_feedback(run_id=run_id, key="user_thumb", score=0,
                         comment="Wrong settlement date")
# online evaluator rule (UI): project=merchant-support-prod, sample=10%,
#   filter: has tag "answer", evaluator: groundedness_judge`,
pit: [`No link between user feedback and trace ids.`, `Online judges on 100% of traffic (cost).`, `Collecting feedback but never reviewing it.`],
q: [`What's the benefit of online evaluators on sampled traffic?`, `They detect quality regressions on real usage quickly, without labelling every request.`]
},
"Runs, traces and ordering": {
d: `Data model details:
- **Run**: id (UUID), «run_type» (chain, llm, tool, retriever, embedding, prompt, parser), name, «parent_run_id», «trace_id», start/end time, inputs, outputs, error, tags, metadata, token usage, and a **dotted_order** string.
- **Trace**: all runs sharing a «trace_id» (root run's id).
- **dotted_order**: a sortable string built from timestamps and run ids along the path from root, so runs order correctly in the tree even when ingested out of order.
- **Threads**: multiple traces of one conversation linked via metadata («session_id», «thread_id» or «conversation_id»).
- **Distributed tracing**: pass trace headers («langsmith-trace», baggage) between services so runs from different processes join one trace.`,
life: `A family tree with dates of birth: each person (run) knows their parent; a sortable "lineage code" keeps the tree in order even if records arrive mixed up.`,
work: `An API gateway called a Python RAG service and a Node tools service; each produced separate traces, making debugging painful. Propagating LangSmith trace headers between services stitched them into one trace with the full request path.`,
ex: `from langsmith.run_helpers import get_current_run_tree
from langsmith import traceable
@traceable
def call_tools_service(payload):
    headers = get_current_run_tree().to_headers()    # propagate trace context
    return requests.post(TOOLS_URL, json=payload, headers=headers).json()
# receiving service: with tracing_context(parent=request.headers): ...`,
pit: [`Not linking multi-turn traces into threads.`, `Separate traces per microservice.`, `Relying on arrival order instead of dotted_order.`],
q: [`How do you group traces of one conversation?`, `Attach a shared thread/session identifier in metadata (e.g. thread_id or session_id).`]
},
"Evaluators you can trust": {
d: `Signature: an evaluator receives the run (outputs) and the example (inputs, reference outputs) and returns «{"key": ..., "score": ..., "comment": ...}». **Summary evaluators** compute experiment-level metrics across all runs (precision/recall/F1 for classification, aggregate pass rates).

Making them trustworthy:
- **Validate the evaluator itself**: build a small labelled set of outputs (good/bad) and check the evaluator's agreement (accuracy, Cohen's kappa) before using it to make decisions.
- Prefer **specific, binary criteria** ("mentions the settlement date", "no invented policies") over vague 1–10 scales.
- For LLM judges: separate judge model from app model where possible, fix temperature 0, include reasoning before the verdict, watch for **position and length bias** in pairwise judgments (swap order).
- Version evaluators like code; changing an evaluator changes historical comparability.`,
life: `Before trusting a new examiner, give them papers that experienced examiners have already marked and see whether they agree.`,
work: `A "helpfulness 1–10" judge produced scores between 7 and 9 for everything; it couldn't separate good from bad. Replacing it with three binary checks (answers the question, cites a source, no unsupported claims) gave clear signal and 0.82 kappa with human reviewers.`,
ex: `def f1_summary(runs, examples):
    tp = sum(r.outputs["label"] == e.outputs["label"] == "fraud" for r, e in zip(runs, examples))
    fp = sum(r.outputs["label"] == "fraud" != e.outputs["label"] for r, e in zip(runs, examples))
    fn = sum(e.outputs["label"] == "fraud" != r.outputs["label"] for r, e in zip(runs, examples))
    p = tp / (tp + fp or 1); r_ = tp / (tp + fn or 1)
    return {"key": "fraud_f1", "score": 2 * p * r_ / (p + r_ or 1)}`,
pit: [`Vague numeric scales.`, `Using the app's own model as an unchecked judge.`, `Changing evaluators mid-comparison.`],
q: [`What is a summary evaluator for?`, `Computing metrics over the whole experiment (e.g. F1) that can't be computed per example.`]
},
"Gate releases on evals": {
d: `Treat LLM changes like code changes with tests:
1. Fix a **dataset version** and an evaluator set (with thresholds per metric and per critical category).
2. On every PR that changes prompts, models, retrieval, tools or code: run an experiment in CI (with «pytest» integration or «evaluate» script).
3. Compare with the **baseline experiment** (current production). Fail the build on: aggregate drops beyond tolerance, any regression on **critical examples** (safety, money), latency/cost above budget.
4. Store results and link them in the PR.
5. After deploy, watch online evals to confirm.

Keep CI evals fast (subset of hundreds of examples, concurrency) and run the full suite nightly.`,
life: `A pharmacy releasing a new batch of medicine only after it passes the same lab tests as the previous approved batch.`,
work: `A PR shortened the system prompt to cut cost. CI eval showed correctness unchanged overall but 3 "must refuse" safety examples now failed. The build was blocked; the author restored the refusal guidance, CI passed, and the change shipped with 18% lower cost.`,
ex: `# tests/test_evals.py (pytest + LangSmith)
import pytest
from langsmith import testing as t
@pytest.mark.langsmith
@pytest.mark.parametrize("case", load_cases("critical"))
def test_critical(case):
    out = app.invoke(case["inputs"])
    t.log_outputs(out)
    assert judge_correct(out, case["reference"]) == 1`,
pit: [`Evals run manually and inconsistently.`, `Thresholds only on averages.`, `CI suites so slow people skip them.`],
q: [`Why gate on critical examples separately from averages?`, `A small number of high-risk failures (safety, money) can hide inside a stable average.`]
},
"Automations close the loop": {
d: `**Automation rules** in LangSmith run on traces that match a **filter** (project, tags, metadata, feedback score, errors, latency) with a **sampling rate**. Actions:
- Add matching runs to a **dataset** (e.g. all thumbs-down traces).
- Send them to an **annotation queue** for human review with a rubric.
- Run an **online evaluator** and record feedback.
- Trigger a **webhook** (e.g. create a Jira ticket, Slack alert).
- Extend data retention for interesting traces.

**Annotation queues** let reviewers label outputs consistently (correct/incorrect, category, corrected answer); labelled items flow back into datasets and calibrate LLM judges. This turns production into a steady source of evaluation data.`,
life: `A hospital that automatically flags unusual cases for a weekly review meeting, and turns the lessons into training cases for new doctors.`,
work: `Rule: «feedback.user_thumb = 0» or «error = true» → annotation queue (100%), and 2% random sample → queue for baseline quality. Two reviewers spent 30 minutes a day; corrected answers were added to the dataset. Over two months, thumbs-down rate fell from 9% to 4% as fixes were validated against those cases.`,
ex: `# rule (configured in UI or API)
filter:   and(eq(feedback_key, "user_thumb"), eq(feedback_score, 0))
sampling: 1.0
actions:  [add_to_annotation_queue("support-review"), add_to_dataset("prod-failures")]
# second rule
filter:   has(tags, "answer"); sampling: 0.02; actions: [run_online_evaluator("groundedness")]`,
pit: [`Queues nobody reviews.`, `Adding unreviewed traces straight into golden datasets.`, `Sampling rates too high (cost) or too low (no signal).`],
q: [`What does an annotation queue add that online LLM evaluators don't?`, `Human judgment: reviewed labels and corrections that calibrate judges and become trustworthy dataset examples.`]
}
});
