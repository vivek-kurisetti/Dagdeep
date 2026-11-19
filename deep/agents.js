QUEST.deep("agents", {
"Two kinds of agentic systems": {
d: `**Workflows**: your code defines the path; LLM calls are steps in it. Patterns: **prompt chaining** (step 1 output feeds step 2, with checks between), **routing** (classify then send to a specialised prompt/model), **parallelisation** (split work or vote), **orchestrator-workers** (an LLM decides subtasks, code runs them), **evaluator-optimizer** (one LLM drafts, another critiques, loop).

**Agents**: the LLM chooses its own next step in a loop, calling tools until it decides it's done. Flexible for open-ended tasks where steps can't be predicted (debugging, research, multi-system operations), but less predictable, slower and costlier.

Rule: start with the simplest thing that works (single call → workflow → agent). Use an agent only when the flexibility pays for the extra cost and risk.`,
life: `A workflow is a recipe card: steps in fixed order. An agent is a chef given a goal ("make dinner from what's in the fridge") who decides what to do next after tasting each step.`,
work: `A KYC document pipeline (classify document → extract fields → validate → flag) was first built as an autonomous agent: 9% of runs looped or skipped validation. Rebuilt as a fixed workflow with a router and validation step, errors dropped to 1.5% and cost by 60%. The agent pattern was kept only for the "investigate mismatch" step where paths vary.`,
ex: `# workflow: routing + chain
kind = llm("Classify: PAN, Aadhaar, GST, OTHER", doc)
fields = llm(EXTRACT_PROMPTS[kind], doc)
errors = validate(kind, fields)          # code, not LLM
if errors: fields = llm(FIX_PROMPT, doc, errors)
# agent: loop until done
while not done: step = llm(goal, history, tools); history += run(step)`,
pit: [`Using an agent for a fixed, well-known process.`, `No step limits or budgets on agent loops.`, `Skipping a single-call baseline.`],
q: [`When is an agent better than a workflow?`, `When the number and order of steps can't be predicted in advance and the task benefits from adapting to tool results.`]
},
"ReAct-style loop": {
d: `**ReAct** = Reason + Act. Each iteration:
1. **Reason**: the model considers the goal and what it knows so far.
2. **Act**: it calls a tool with arguments.
3. **Observe**: the tool result is added to the context.
Repeat until the model returns a final answer (or a stop condition hits).

Why it works: each step is grounded in **real observations** instead of the model's guesses, so errors can be noticed and corrected ("query returned 0 rows; maybe the date filter is wrong"). Modern APIs implement this natively with tool calls; extended thinking can interleave with tool calls.

Production essentials: **max iterations**, **token/time budgets**, detection of repeated identical calls (loops), and a graceful "I couldn't finish" exit with what was learned.`,
life: `A detective: think about a lead, check it (act), read what you found (observe), update the theory, and repeat until the case closes.`,
work: `An on-call assistant investigating "settlement delayed" called «query_logs», saw a timeout error from the bank API, called «get_bank_status», found a reported outage, and drafted the incident note. Without observation steps, an earlier prototype had confidently blamed the database.`,
ex: `for step in range(MAX_STEPS):
    r = llm(messages, tools=TOOLS)
    if r.stop_reason != "tool_use":
        return r.text
    for call in r.tool_calls:
        if seen(call): return "Stopping: repeated action without progress."
        messages.append(tool_result(call, run_tool(call)))
return "Step limit reached. Findings so far: ..."`,
pit: [`No iteration cap (runaway cost).`, `Not feeding tool errors back so the model can recover.`, `Letting the model answer without verifying with tools.`],
q: [`What grounds each ReAct step in reality?`, `The observation: actual tool output appended to the context before the next reasoning step.`]
},
"Tools are the agent's interface": {
d: `For an agent, tools are its entire view of the world, so tool design matters as much as prompts:
- **Names and descriptions**: say what it does, when to use it, when *not* to, and give an example call.
- **Focused purpose**: «search_orders(customer_email, status)» rather than a generic «run_sql(query)».
- **Simple, typed arguments** with enums and formats («date: YYYY-MM-DD»).
- **Useful results**: return relevant fields, human-readable ids, and pagination; not 5,000-line JSON.
- **Actionable errors**: "No order found for that email. Did you mean to search by phone?" helps the model recover; a stack trace doesn't.
- **Safety**: authorization in code, idempotency keys for writes, confirmations for irreversible actions.

Test tools by watching agent transcripts: wrong tool choices and bad arguments usually mean unclear descriptions.`,
life: `Onboarding a new colleague: you give them a few well-labelled buttons with instructions, not root access to every system with no manual.`,
work: `An agent had a single «http_request(url, method, body)» tool and frequently called wrong endpoints and hit 4xx errors. Replacing it with 6 named tools («get_payment», «initiate_refund(payment_id, amount, reason, idempotency_key)», ...) with clear descriptions raised task success from 61% to 88% and removed dangerous free-form calls.`,
ex: `{"name": "initiate_refund",
 "description": "Refund a captured payment. Use only after confirming the payment status is CAPTURED and amount <= remaining refundable. Requires user confirmation for amounts > 10000 INR.",
 "input_schema": {"type": "object", "properties": {
   "payment_id": {"type": "string", "pattern": "^pay_[A-Za-z0-9]{14}$"},
   "amount_inr": {"type": "number", "exclusiveMinimum": 0},
   "reason": {"type": "string", "enum": ["DUPLICATE", "CUSTOMER_REQUEST", "FRAUD"]}},
  "required": ["payment_id", "amount_inr", "reason"]}}`,
pit: [`Generic "do anything" tools.`, `Huge unfiltered tool outputs.`, `Errors without guidance on what to do next.`],
q: [`Why is «run_sql(query)» usually a poor agent tool?`, `It's too broad: hard to authorise, easy to misuse, and the model must know the schema; focused tools are safer and more reliable.`]
},
"Context is a budget": {
d: `Every step adds tool calls and results to the context. Long tasks (debugging, research, data migrations) blow past limits, and quality drops long before the hard limit as context fills with stale details.

Techniques:
- **Compaction**: summarise older steps into a short state ("tried X, failed because Y; current hypothesis Z") and drop raw outputs.
- **Tool result hygiene**: truncate, filter, paginate; clear old tool results once used.
- **External memory / notes**: the agent writes progress and decisions to a file or store and re-reads only what's needed.
- **Just-in-time retrieval**: keep references (file paths, ids) and load content when needed instead of preloading everything.
- **Subagents**: delegate a deep exploration to a fresh context and receive only a condensed result.`,
life: `A detective's whiteboard: you can't pin every receipt from the case on it. You keep a short summary, key photos, and file the rest in cabinets you can open when needed.`,
work: `A log-investigation agent failed on incidents longer than ~40 steps: context overflowed with raw log lines. Adding a rule to keep only the last 3 raw results, summarise the rest into a running «findings.md», and return top-20 log lines per query let it complete 150-step investigations.`,
ex: `if count_tokens(messages) > 0.6 * LIMIT:
    summary = llm("Summarise progress: goal, findings, open questions, next step.", messages)
    messages = [system, {"role": "user", "content": goal},
                {"role": "user", "content": f"<progress>{summary}</progress>"}] + messages[-4:]`,
pit: [`Keeping every raw tool output forever.`, `Summaries that drop key facts (ids, decisions).`, `Preloading entire codebases or tables.`],
q: [`Why can an agent get worse before hitting the context limit?`, `Irrelevant and stale information accumulates and distracts the model ("context rot").`]
},
"Orchestrator and subagents": {
d: `A **lead (orchestrator) agent** plans the task, spawns **subagents** with specific instructions, tools and their **own context windows**, and combines what they return.

Benefits: **parallelism** (several directions explored at once), **context isolation** (each subagent digs deep without polluting the lead's context; it returns a condensed summary), and **specialisation** (different prompts/tools per role).

Costs: many more tokens (multi-agent systems can use several times the tokens of one agent), coordination errors (duplicated work, conflicting assumptions), and harder debugging. Clear task specs for subagents (objective, output format, boundaries, what *not* to do) are crucial.`,
life: `An editor assigns three reporters to cover different angles of a story, each researching on their own, then the editor writes the final piece from their summaries.`,
work: `A "compare our pipeline costs across 12 AWS accounts" task timed out for a single agent. A lead agent spawned one subagent per account (each with read-only Cost Explorer tools), each returned a 300-token summary table, and the lead merged them. Wall time dropped from 40 to 6 minutes; token use rose 3×, acceptable for a monthly report.`,
ex: `plan = lead("Split into independent subtasks with clear outputs", task)
results = parallel_map(lambda t: subagent(
    instructions=f"Objective: {t.goal}\\nReturn: a table of service, cost, change %\\nDon't: modify anything.",
    tools=READ_ONLY_COST_TOOLS), plan.subtasks)
report = lead("Combine into one report with top 5 savings", results)`,
pit: [`Multi-agent for tightly coupled tasks (lots of shared state).`, `Vague subagent instructions (duplicate or off-scope work).`, `Ignoring the token cost multiplier.`],
q: [`What's the main benefit of subagents having their own context?`, `They can explore deeply without filling the lead agent's context; only condensed results come back.`]
},
"Production checklist": {
d: `Before an agent touches real users or systems:
- **Evals**: a set of realistic tasks checked on **end state** (was the refund created with the right amount?) plus trajectory checks; run on every prompt/model/tool change.
- **Least privilege**: scoped credentials per tool, tenant filters in code, read-only where possible.
- **Human approval** for irreversible or high-impact actions (payments, deletions, external emails).
- **Budgets**: max steps, tokens, time, cost per task; kill switches.
- **Tracing**: log every model call, tool call, arguments, results and latency (LangSmith, Phoenix, OpenTelemetry).
- **Guardrails**: input/output filters, PII redaction, prompt-injection defences for untrusted content.
- **Idempotency** for writes so retries don't double-act.
- **Fallback**: hand off to a human with context when stuck.`,
life: `Letting a new driver use the company car: test drive first, a car with speed limiter, permission needed for long trips, a trip log, and a number to call when lost.`,
work: `A refund agent went to a 5% canary with: eval suite of 300 tasks (94% pass), refunds > ₹5,000 needing agent-supervisor approval, idempotency keys, a ₹2 lakh daily cap, and full tracing. In week one tracing revealed it re-tried a timed-out refund; the idempotency key prevented a double refund.`,
ex: `@tool(requires_approval=lambda a: a["amount_inr"] > 5000)
def initiate_refund(payment_id, amount_inr, reason, idempotency_key):
    assert_owner(session.merchant_id, payment_id)        # authz in code
    return payments.refund(payment_id, amount_inr, reason, key=idempotency_key)`,
pit: [`Shipping on demo success without evals.`, `One powerful service account for all tools.`, `No traces when things go wrong.`],
q: [`Why use idempotency keys on agent write tools?`, `Agents and networks retry; the key ensures a repeated call doesn't perform the action twice.`]
},
"Errors compound over steps": {
d: `If each step independently succeeds with probability p, a task needing n steps succeeds with about **pⁿ**:
- 99% per step, 20 steps → 82%.
- 95% per step, 20 steps → 36%.
- 90% per step, 20 steps → 12%.

So long autonomous chains are fragile even with good models. Strategies:
- **Shorten chains**: better tools that do more per call (consolidated actions), fewer steps.
- **Verify and recover**: check results (tests, validators, re-reading state) so errors are caught and fixed instead of compounding.
- **Checkpoints**: save progress; resume rather than restart.
- **Human-in-the-loop** at key points.
- Measure **per-step** error types from traces to fix the weakest steps.`,
life: `A relay race with 20 runners where each drops the baton 5% of the time: most races won't finish cleanly, unless runners can pick it up and continue.`,
work: `A data-migration agent with ~30 steps succeeded on 40% of tables. Traces showed most failures at schema mapping. Adding a validation tool (compare row counts and checksums after each table) and letting the agent retry with the diff raised success to 91%; consolidating "create table + copy + verify" into one tool cut steps to ~12.`,
ex: `for p in (0.99, 0.95, 0.90):
    print(p, [round(p ** n, 2) for n in (5, 10, 20, 50)])
# 0.99 [0.95, 0.9, 0.82, 0.61]
# 0.95 [0.77, 0.6, 0.36, 0.08]`,
pit: [`Judging agents by single-step accuracy.`, `No verification steps.`, `Many tiny tools forcing long chains.`],
q: [`Per-step success 95%, 10 steps. Rough task success?`, `About 0.95¹⁰ ≈ 60%.`]
},
"Tools are an API for a non-human user": {
d: `Humans using an API read docs once, remember the system, and use intuition. Agents re-read tool descriptions every call, have limited context, and only know what the tool returns. Design for that:
- **Consolidate** common multi-step workflows into one tool («schedule_meeting» that checks availability and books) instead of exposing every low-level call.
- **Namespace** related tools («orders_search», «orders_get», «refunds_create») so the model picks the right family.
- **Return meaningful context**: names and readable ids alongside opaque UUIDs; a «response_format» parameter (concise vs detailed).
- **Pagination, filtering, truncation** with defaults that keep results small, plus hints ("showing 20 of 340; refine by date").
- **Prompt-engineer descriptions**: be explicit about formats, units (paise vs rupees), and constraints.
- Evaluate tools with agents running realistic tasks and iterate from transcripts.`,
life: `Signs in a building for visitors (agents) vs staff (humans): visitors need clear labelled signs at every turn, because they don't know the building.`,
work: `An agent kept refunding 100× too much because the API used paise while the description said "amount". Renaming the field to «amount_inr» and converting in code fixed it. Separately, a «list_transactions» tool returning 10k rows was replaced by «search_transactions» with filters and 25-row pages, cutting tokens per task by 80%.`,
ex: `def search_transactions(merchant_id: str, status: str | None = None,
                        from_date: str | None = None, limit: int = 25,
                        response_format: str = "concise"):
    rows = db.query(...)[:limit]
    return {"rows": [compact(r) if response_format == "concise" else r for r in rows],
            "note": f"Showing {len(rows)} of {total}. Narrow with from_date/status."}`,
pit: [`Mirroring internal REST endpoints 1:1 as tools.`, `Ambiguous units.`, `Returning opaque ids only.`],
q: [`Why consolidate several API calls into one agent tool?`, `Fewer steps (less compounding error and context use), and the tool handles sequencing the agent might get wrong.`]
},
"Curate the smallest high-signal context": {
d: `**Context engineering** is deciding exactly which tokens the model sees at each step. More isn't better: attention is a finite budget, and irrelevant tokens dilute it.

Components to curate:
- **System prompt**: at the right altitude; specific guidance and heuristics, not a giant list of if-else rules, not vague either. Organise with sections/tags.
- **Tools**: a minimal, non-overlapping set; if a human can't say which tool to use, the model can't either.
- **Examples**: a few diverse canonical examples beat a long list of edge cases.
- **Message history**: compact; clear stale tool results.
- **Retrieved data**: just-in-time, by reference (ids, paths) rather than preloaded.

Ask at each step: "what is the smallest set of high-signal tokens that maximises the chance of the desired outcome?"`,
life: `Preparing a busy executive for a meeting: a one-page brief with the three decisions needed, not the full email archive.`,
work: `A support agent's system prompt had grown to 14k tokens of rules accumulated over months, and new rules kept conflicting with old ones. Rewriting it to 3k tokens (principles, priorities, 5 examples) and moving product details to retrieval improved eval pass rate from 79% to 87% and cut cost by a third.`,
ex: `<role>You resolve merchant settlement questions.</role>
<principles>
- Check live data with tools before answering; never guess dates or amounts.
- If data is missing or conflicting, say so and offer escalation.
</principles>
<examples>3 short examples</examples>
# product docs: retrieved per question, not pasted here`,
pit: [`Ever-growing prompts of special cases.`, `Overlapping tools with similar descriptions.`, `Preloading everything "just in case".`],
q: [`Why can a longer, more detailed system prompt make an agent worse?`, `It dilutes attention with low-signal or conflicting instructions, making the important guidance less likely to be followed.`]
},
"When multi-agent pays off": {
d: `Multi-agent (orchestrator + workers) helps when the task is **breadth-first**: many independent directions explored in parallel, each needing lots of context that can be compressed into a summary (research across many sources, audits across many services, reviewing many files). Gains come from parallel exploration and spreading the work across more total context.

It hurts when the task is **tightly coupled**: subagents need to share evolving state or make consistent decisions (most coding changes, a single complex reasoning chain). Coordination failures, conflicting edits, and token costs (often several times a single agent) outweigh benefits.

Questions to ask: Are subtasks independent? Is the value high enough to justify the token multiplier? Can results be merged cleanly?`,
life: `Ten people searching ten different libraries for references works great. Ten people writing the same paragraph together in parallel does not.`,
work: `For an architecture review across 40 microservices, one subagent per service produced findings in parallel: 10× faster than a single agent. For a refactor touching shared interfaces, a multi-agent attempt produced incompatible changes; a single agent with good planning did better.`,
ex: `def should_parallelise(subtasks):
    independent = all(not t.depends_on for t in subtasks)
    worth_it = estimated_value() > token_cost_multiplier() * single_agent_cost()
    return independent and len(subtasks) >= 3 and worth_it`,
pit: [`Multi-agent for coupled tasks.`, `Not budgeting the token multiplier.`, `No clear output contract for workers.`],
q: [`Give an example task that suits multi-agent and one that doesn't.`, `Suits: researching 12 vendors independently. Doesn't: a coordinated change across a shared codebase.`]
},
"Evaluate outcomes and trajectories": {
d: `Two complementary views:
- **Outcome evals**: check the **final state** of the environment: was the refund issued with the right amount and reason? Is the ticket closed with the correct tag? Did the SQL produce the expected rows? Most important, and robust to different valid paths.
- **Trajectory evals**: check the **path**: right tools in a reasonable order, no forbidden actions (calling refund without verifying), number of steps, cost, latency, no loops.

Build evals from **real tasks** (anonymised production cases), with graders: code checks for state, LLM judges with rubrics for qualitative parts (calibrated against human labels), and human review samples. Run multiple trials per task (agents are stochastic) and track pass rates (e.g. pass@k and pass^k: succeeding on all k tries) over versions.`,
life: `Judging a delivery driver: did the parcel arrive correctly (outcome), and did they drive safely without breaking rules on the way (trajectory)?`,
work: `A new prompt raised outcome pass rate from 82% to 85%, but trajectory checks showed it skipped the payment-status verification in 7% of refunds (it got lucky). The change was rejected; adding a required verification step to the tool flow fixed both.`,
ex: `def grade(task, env, trace):
    outcome = env.refund_exists(task.payment_id, amount=task.expected_amount)
    verified_first = trace.index_of("get_payment") < trace.index_of("initiate_refund")
    within_budget = trace.steps <= 12 and trace.cost_inr <= 5
    return {"outcome": outcome, "safe_path": verified_first, "budget": within_budget}`,
pit: [`Grading only the final text message.`, `Single trial per task.`, `Uncalibrated LLM judges.`],
q: [`Why isn't outcome-only evaluation enough?`, `An agent can reach the right state through unsafe or wasteful paths (skipping checks, extra cost); trajectory checks catch that.`]
}
});
