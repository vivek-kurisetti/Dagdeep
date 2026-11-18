QUEST.zone("agents", {
mission:["kai","Leadership wants 'an agent that handles merchant disputes end to end'. Most of that should be a workflow; some of it needs a real agent. Learn when and how, then design it."],
levels:[
{t:"Workflows vs agents", sub:"Pick the simplest thing", rounds:[
 ["learn","Two kinds of agentic systems","**Workflows**: LLMs and tools orchestrated through predefined code paths. **Agents**: the LLM decides its own steps and tool use in a loop. Start with the simplest thing that works; add autonomy only when the task needs flexibility.",["Single LLM call","Workflow (fixed steps)","Agent (model-directed loop)"]],
 ["sort","Workflow or agent?",{"Workflow":["Classify ticket, then route to template reply","Translate, then check tone","Extract invoice fields, validate, store"],"Agent":["Investigate an unknown dispute across logs, payments and emails","Fix a failing test in an unfamiliar codebase"]},"Predictable steps → workflow. Open-ended problems → agent."],
 ["match","Workflow pattern",[["Prompt chaining","Fixed sequence of LLM steps with checks between"],["Routing","Classify input, send to a specialised path"],["Parallelization","Run subtasks at once or vote on answers"],["Orchestrator-workers","LLM splits the task and delegates subtasks"],["Evaluator-optimizer","One LLM drafts, another critiques, loop"]],"Five patterns cover most systems."],
 ["pick","Tickets come in 6 known types with different handling. Pattern?",["Routing","Evaluator-optimizer","Fully autonomous agent","Parallel voting"],0,"Classify, then a specialised prompt/tools per type."],
 ["tf","Design facts",[["More autonomy always means better results.",false,"It adds cost, latency and compounding errors."],["Agents suit tasks where steps can't be predicted.",true,"That's when the flexibility pays."]]]
]},
{t:"The agent loop", sub:"Think, act, observe", rounds:[
 ["learn","ReAct-style loop","The model **reasons**, picks a **tool**, gets an **observation**, and repeats until it can answer. Ground truth from tools at each step keeps it on track. Always set **stop conditions**: max steps, budget, timeouts.",["Reason about the goal","Call a tool","Observe the result","Repeat or answer"]],
 ["order","One dispute investigation",["Read the dispute and plan","Call get_payment(payment_id)","Call search_logs(order_id)","Compare evidence with the chargeback rules","Draft the response and stop"],"Each step is grounded in a tool result."],
 ["learn","Tools are the agent's interface","Design tools like an API for a new colleague: clear names, focused purpose, good descriptions with examples, simple arguments, helpful error messages, and outputs that are concise and relevant (paginate, filter)."],
 ["bug","Which tool design will cause the most agent errors?",["get_payment(payment_id: str) -> status, amount, merchant","search_logs(order_id: str, limit: int = 20)","do_stuff(json_blob: str) — 'does many things'","refund(payment_id: str, amount_paise: int)"],2,"A vague multi-purpose tool with an untyped blob makes the model guess."],
 ["pick","The agent loops forever calling the same search. Best guardrail?",["Max iterations + detect repeated calls + clearer tool output","Higher temperature","More tools","Bigger context"],0,"Bound the loop and improve feedback."]
]},
{t:"Memory & context", sub:"What the agent remembers", rounds:[
 ["learn","Context is a budget","Long tasks overflow the context. Techniques: **summarise/compact** old steps, keep **notes** in a file or store, **retrieve** only relevant memories, and give subagents fresh, focused contexts."],
 ["match","Memory type",[["Working memory","Current messages and tool results in context"],["Episodic","Past interactions and outcomes"],["Semantic","Facts about users and the domain"],["Procedural","How-to knowledge: prompts, skills, playbooks"]],"Different stores, different retrieval."],
 ["sort","Keep in context or store outside?",{"Keep in context":["The current goal","Latest tool result being used"],"Store outside, retrieve when needed":["Full logs from step 3","All past conversations with this merchant","Long reference manuals"]},"Context engineering: the right tokens at the right time."],
 ["tf","Memory facts",[["Stuffing everything into context improves accuracy.",false,"Irrelevant tokens distract and cost money."],["Compaction summarises history to free context.",true,"Keep decisions and open issues."]]]
]},
{t:"Multi-agent", sub:"When many beat one", rounds:[
 ["learn","Orchestrator and subagents","A lead agent breaks the task down and delegates to **subagents** with their own context and tools, then combines results. Great for broad, parallel research; costly in tokens; weak when subtasks are tightly coupled."],
 ["sort","Multi-agent helps or hurts?",{"Helps":["Research 10 independent competitors in parallel","Separate reviewer checks the coder's work"],"Hurts":["Tightly coupled edits to one small file","Simple FAQ answers"]},"Parallel, separable work benefits most."],
 ["match","Pattern",[["Supervisor","Central agent routes work to specialist agents"],["Handoff","An agent transfers the conversation to another"],["Evaluator","A separate agent grades or critiques output"],["Swarm / peer","Agents coordinate without a central boss"]],"Supervisor is the easiest to debug."],
 ["pick","Main risk of multi-agent systems?",["Too cheap","Token cost and coordination errors compound","They can't use tools","They never stop"],1,"Measure whether the gain is worth it."]
]},
{t:"Shipping agents", sub:"Evals, safety, ops", rounds:[
 ["learn","Production checklist","**Evals** on real tasks (end state, not just final text). **Least-privilege tools** and approval for risky actions. **Tracing** of every step. **Budgets**: steps, tokens, time. **Fallbacks** to a human. Start narrow, expand scope as evals allow."],
 ["order","Roll out the dispute agent",["Define success on 50 real past disputes","Build tools with least privilege (read-only first)","Run offline evals and read traces","Shadow mode: agent drafts, humans send","Gradually allow auto-send for low-risk cases"],"Trust is earned with evidence."],
 ["sort","Needs human approval?",{"Human approval":["Issue a refund","Email a merchant","Delete records"],"Safe to automate":["Read payment status","Search logs","Draft a reply for review"]},"Gate irreversible or external actions."],
 ["tf","Ops facts",[["Evaluate the final state (e.g. refund issued correctly), not only the text.",true,"Agents act; check the outcome."],["Agents should hold admin credentials for flexibility.",false,"Least privilege, always."]]]
]},
{t:"Boss: The dispute agent", boss:true, time:30, rounds:[
 ["pick","80% of disputes follow one of 4 fixed paths. Architecture?",["Routing workflow, agent only for the rest","One big autonomous agent","Multi-agent swarm","Fine-tune"],0,"Simplest thing that works."],
 ["pick","Agent picks the wrong tool half the time. Fix?",["Clearer tool names, descriptions and examples","Higher temperature","More tools","Longer system prompt only"],0,"Tools are the interface."],
 ["pick","Agent issued a wrong refund. Prevent with…",["Human approval for refunds + least-privilege tools","Bigger model","More memory","Faster loop"],0,"Gate irreversible actions."],
 ["pick","Long investigations hit the context limit. Fix?",["Compaction + notes + retrieve what's needed","Bigger max_tokens","Fewer tools","Restart the agent"],0,"Context engineering."],
 ["pick","How do you know v2 is better?",["Evals on real past disputes measuring end state","Gut feel","Fewer steps","Shorter answers"],0,"Measure outcomes."],
 ["pick","Agent repeats the same tool call 30 times. Fix?",["Max steps + repeated-call detection","Lower temperature only","More tokens","Parallel agents"],0,"Bound the loop."]
]}
]});

QUEST.more("agents", [
{act:"Expert", t:"Reliability maths & planning", sub:"Compounding errors, plans", rounds:[
 ["learn","Errors compound over steps","If each step of an agent succeeds independently with probability p, an n-step task succeeds with roughly pⁿ. 95% per step over 20 steps ≈ 36%. Long autonomous runs need **checkpoints, verification and recovery**, not just better prompts.",null,null,`### Ways to beat compounding
- **Ground every step** in tool results (observe, don't assume).
- **Verify** intermediate outputs (tests for code, schema checks, re-reading data).
- **Plan, then execute**: draft a plan, validate it, execute steps, re-plan on surprises.
- **Reflection**: after a failure, the agent critiques its attempt and stores the lesson (Reflexion-style) for the retry.
- **Shorter paths**: better tools that do more per call reduce n.

### Reasoning models and budgets
Models with extended thinking plan better on hard steps; set a **thinking budget** proportional to difficulty. Interleaved thinking between tool calls helps the agent reason about each observation.

### Measuring reliability
- pass@k: at least one success in k tries (good for "can it ever do this?").
- **pass^k**: all k tries succeed (consistency). With p = 0.8 per try, pass^3 = 0.51. Customer-facing agents need high pass^k, not high pass@k.`],
 ["num","Each step succeeds 95% of the time, independently. Success probability of a 20-step task (%)?",35.8,0.3,"%","0.95²⁰ ≈ 0.358 → about 36%."],
 ["num","An agent solves a task 80% of the time per attempt. pass^3 (all 3 attempts succeed), in %?",51.2,0.1,"%","0.8³ = 0.512. Consistency is harder than occasional success."],
 ["sort","Reduces compounding failure?",{"Helps":["Verifying outputs after each risky step","Fewer, more capable tools","Re-planning on unexpected results"],"Doesn't":["Longer system prompt","Letting the agent run 100 steps unchecked","Ignoring tool errors"]},"Shorten and verify."],
 ["tf","Reliability truths",[["pass@k measures consistency across attempts.",false,"pass^k does; pass@k is 'at least once'."],["Verification steps can raise end-to-end success.",true,"Catch errors before they compound."]]]
]},
{act:"Expert", t:"Designing tools for agents", sub:"Consolidate, namespace, shape output", rounds:[
 ["learn","Tools are an API for a non-human user","Agents have limited context and no intuition about your system. Good tools: **consolidate** common workflows («schedule_event» instead of list_users + list_events + create_event), are **namespaced** clearly («payments_search», «payments_refund»), return **meaningful context** (names, not just UUIDs), and support **concise vs detailed** responses.",null,null,`### Token efficiency
- Paginate and filter by default; truncate long outputs with a clear note ("showing 20 of 3,410 — refine your query").
- Let the agent ask for «response_format: concise | detailed».
- Return human-readable identifiers alongside technical ids.

### Errors that teach
Instead of «Error 400», return "amount_paise must be ≤ captured amount (₹1,200.00 = 120000 paise); you sent 1200000". The agent fixes its next call.

### Descriptions
Write tool descriptions like onboarding docs: what it does, when to use it (and when not), argument formats with examples, side effects, limits.

### Evaluate tools, not just prompts
Build realistic multi-step tasks, run the agent, read transcripts, and look for: wrong tool chosen, redundant calls, confusion between similar tools, huge outputs. Agents can even propose improvements to their own tool descriptions from failed transcripts.`],
 ["bug","Which tool response wastes the most agent context?",["{\"status\": \"FAILED\", \"reason\": \"card expired\", \"merchant\": \"MegaMart\"}","{\"results\": [ ...3,410 full payment records... ]}","{\"count\": 3410, \"top\": [...20 summarized...], \"next_cursor\": \"c2\"}","{\"refund_id\": \"rf_9\", \"state\": \"PENDING\"}"],1,"Dumping thousands of records floods context. Paginate and summarize."],
 ["match","Principle → example",[["Consolidate","find_and_refund_duplicate_charge instead of 4 tools"],["Namespace","payments_search vs crm_search"],["Meaningful context","Return merchant name with merchant_id"],["Actionable errors","Explain the valid range and what was sent"],["Response format option","concise vs detailed outputs"]],"Design for the model's constraints."],
 ["pick","The agent keeps confusing search_tickets and search_tickets_v2. Fix?",["Merge or clearly differentiate names and descriptions","Add a third tool","Raise temperature","Longer context"],0,"Ambiguity breaks tool choice."],
 ["tf","Tool design truths",[["Returning only UUIDs helps agents reason.",false,"Names and context help more."],["Tool outputs consume context window.",true,"Keep them focused."]]]
]},
{act:"Expert", t:"Context engineering", sub:"Just-in-time context, compaction, notes", rounds:[
 ["learn","Curate the smallest high-signal context","**Context engineering** = choosing which tokens the model sees at each step. Models degrade as context fills with irrelevant material ('context rot'). Aim for the **smallest set of high-signal tokens** that lets the agent act well.",null,null,`### Techniques
- **System prompt at the right altitude**: specific enough to guide, general enough to avoid brittle if-else rules. Use sections (background, instructions, tool guidance, output format).
- **Just-in-time retrieval**: keep lightweight references (file paths, ids, queries) and load data with tools when needed, instead of pre-loading everything.
- **Compaction**: when nearing limits, summarize the conversation (decisions, open bugs, next steps) and restart with the summary; clear old raw tool results first — the cheapest compaction.
- **Structured note-taking**: the agent writes progress notes (e.g. NOTES.md, a todo list) outside the context window and re-reads them.
- **Sub-agents**: delegate deep exploration to sub-agents with clean contexts that return condensed results (1–2k tokens) to the lead agent.

### Caching
Keep the stable prefix (system prompt, tool definitions) unchanged across turns so prompt caching applies; append new content at the end.`],
 ["order","Compaction for a long-running agent",["Detect context nearing its limit","Clear stale raw tool outputs first","Summarize decisions, open issues and next steps","Start a fresh context with the summary + key notes","Continue, re-reading notes as needed"],"Preserve what matters, drop the rest."],
 ["sort","Pre-load or fetch just-in-time?",{"Pre-load into context":["The task goal","Key constraints and rules"],"Fetch just-in-time":["Full transaction histories","Large source files","Past tickets"]},"References first, data when needed."],
 ["pick","A coding agent's quality drops after 3 hours in one session. Most effective fix?",["Compaction + persistent notes (and sub-agents for exploration)","Bigger max_tokens","Higher temperature","More tools"],0,"Context rot."],
 ["tf","Context truths",[["Clearing old tool results is a light form of compaction.",true,"Cheap and safe."],["More context always improves agent performance.",false,"Irrelevant tokens degrade it."]]]
]},
{act:"Expert", t:"Multi-agent systems deep", sub:"Orchestrator-worker economics", rounds:[
 ["learn","When multi-agent pays off","Orchestrator-worker systems shine on **breadth-first** tasks: many independent directions explored in parallel (research, audits across many systems). They use **many more tokens** than a single agent — published research systems report roughly an order of magnitude more than chat — so the task's value must justify it.",null,null,`### Design lessons
- Teach the orchestrator to **delegate well**: each subagent gets an objective, output format, tools/sources to use and clear boundaries — vague tasks cause duplicated work.
- **Scale effort to complexity**: simple queries → 1 agent, few calls; complex → several subagents.
- **Parallel tool calls** in subagents cut latency dramatically.
- Subagents write large outputs to storage and return **references + summaries**, not everything.
- Prefer **end-state evaluation** with LLM judges plus human review; multi-agent paths vary run to run.

### Failure modes
- Coordination: agents duplicating or contradicting work.
- Error propagation: a wrong early finding steers others.
- Cost blowups: runaway spawning.
- Debugging difficulty: need full tracing of every agent's decisions.

### When not to use it
Tightly coupled tasks (most coding changes in one module), tasks needing shared context everywhere, or real-time low-latency needs.`],
 ["sort","Single agent or multi-agent?",{"Multi-agent":["Compare 15 payment gateways' pricing and terms","Audit 40 microservices for a deprecated API"],"Single agent":["Fix a failing unit test","Answer a merchant's question about one payment","Refactor one module"]},"Breadth and independence favour multi-agent."],
 ["fill","A good delegation message to a subagent",'Objective: ___\nOutput: table of fee, settlement time, source URL per gateway\nScope: only official pricing pages, published in 2026\nBoundaries: ___',["Collect UPI and card pricing for Razorpay, Cashfree and PayU","Do not compare beyond these three; stop after 10 searches"],["Research payments","Do whatever is needed"],"Objective, format, sources, limits."],
 ["pick","A research agent spawns 50 subagents for 'what is UPI?'. Fix?",["Effort-scaling rules in the orchestrator prompt","More tokens","Fewer tools","A bigger model"],0,"Match effort to complexity."],
 ["tf","Multi-agent truths",[["Multi-agent systems usually use more tokens than single agents.",true,"Often many times more."],["Vague delegation leads to duplicated work.",true,"Specify objectives and boundaries."]]]
]},
{act:"Expert", t:"Evaluating & operating agents", sub:"Trajectories, environments, guardrails", rounds:[
 ["learn","Evaluate outcomes and trajectories","**Outcome evals** check the final state (refund issued with the right amount? ticket closed correctly?). **Trajectory evals** check the path (right tools, no forbidden actions, reasonable number of steps). Both matter: a correct outcome via a forbidden action is a failure.",null,null,`### Environments
Run agents against **sandboxes** with realistic data and tool mocks/replicas (staging payments API, seeded DB). Benchmarks like τ-bench simulate users + tools + policies and measure pass^k for consistency.

### Operating in production
- **Budgets**: max steps, tokens, wall-clock time and money per task.
- **Guardrails**: allowlisted tools per task type, approval for irreversible actions, policy checks in tool code.
- **Observability**: trace every model call and tool call; alert on loops, cost spikes, policy violations.
- **Graceful handoff**: when confidence is low or a budget is hit, escalate to a human with a summary.
- **Gradual autonomy**: shadow mode → human-approved → auto for low-risk segments, expanding as evals and incident data allow.

### Regression discipline
Every production incident becomes an eval scenario. Track per-scenario pass rates across versions, not just averages.`],
 ["match","Eval type",[["Outcome eval","Was the refund correct in the final DB state?"],["Trajectory eval","Did it avoid calling delete_merchant?"],["pass^k","Does it succeed every time across k runs?"],["Shadow mode","Agent drafts, humans act, compare decisions"]],"Agents need richer evals than chatbots."],
 ["order","Graduated autonomy rollout",["Offline evals in a sandbox","Shadow mode on live traffic","Human approves each action","Auto-approve low-risk segments","Expand scope as metrics and incidents allow"],"Earn autonomy with evidence."],
 ["pick","An agent got the right refund amount but called an admin tool it shouldn't. Eval verdict?",["Fail — trajectory violated policy","Pass — outcome correct","Partial credit only","Ignore"],0,"Process matters for safety."],
 ["tf","Ops truths",[["Budgets on steps and spend are part of agent design.",true,"Prevent runaway runs."],["Production incidents should become eval scenarios.",true,"Regression protection."]]]
]},
{act:"Expert", t:"Expert boss: Autonomous dispute agent", boss:true, time:45, rounds:[
 ["pick","A 25-step workflow succeeds 30% end to end. Most impactful change?",["Fewer, consolidated tools + verification at risky steps","Longer prompt","Higher temperature","More steps"],0,"Shorten and verify."],
 ["pick","Agent passes evals 9/10 but customers see inconsistent results. Measure…",["pass^k across repeated runs","pass@k","Average tokens","Latency only"],0,"Consistency."],
 ["pick","Tool outputs of 50k tokens slow and confuse the agent. Fix?",["Paginate/summarize outputs with concise mode","Bigger context model","More retries","Parallel tools"],0,"Token-efficient tools."],
 ["pick","Quality decays in long investigations. Fix?",["Compaction + notes + sub-agents for deep dives","Disable tools","Shorter system prompt","Temperature 0"],0,"Context engineering."],
 ["pick","Research tasks cost 15× chat; value is low for simple questions. Fix?",["Scale effort by complexity; single agent for simple queries","Always multi-agent","Disable search","Smaller output"],0,"Spend tokens where they pay."],
 ["pick","Correct outcomes but forbidden admin tool used sometimes. Fix?",["Remove/limit the tool per task + trajectory evals","Prompt warning","Reward outcome only","Bigger model"],0,"Enforce and evaluate the path."],
 ["pick","Ready to move from human approval to auto-approve. Evidence needed?",["Strong pass^k on low-risk segments + clean incident history","A demo","Average judge score","CEO approval only"],0,"Data-driven autonomy."]
]}
]);

/* ===== On-call desk: Agentic AI incident ===== */
QUEST.cases("agents", [
{
 title:"An agent burned ₹4 lakh overnight", icon:"🔁", sev:1, clock:"07:30", channel:"inc-2355-agent-cost", svc:"refund-agent · LangGraph on Claude", need:4, uiName:"LangSmith",
 terms:[["Agent loop","The model decides an action, a tool runs, the result goes back to the model, and it repeats until the model says it's done."],["Tool call","The model asks the app to run a function (here «get_order_status», «issue_refund»)."],["recursion_limit","LangGraph's cap on how many steps one run may take before it stops with an error."],["Context growth","Each step adds the tool result to the conversation, so every later call re-sends a longer prompt. Cost grows roughly quadratically."],["HTTP 429","\"Too many requests\": a rate limit. The right response is to wait and retry with backoff, then give up."],["Circuit breaker","A guard that stops calling a failing dependency for a while instead of hammering it."],["Budget guard","A hard limit on tokens or money per run, user or day."]],
 deep:[{"t": "Why agent cost grows quadratically", "md": "Each step re-sends the **whole conversation so far** (system prompt + every previous thought, call and result). If each step adds ~400 tokens, step *n* sends ~400·n tokens, so total input for *N* steps ≈ 400·N²/2.\n- 10 steps → ~20k tokens. 100 steps → ~2M. 1,840 steps → ~680M.\n- Mitigations: step and token limits, **summarising** or truncating old tool results, prompt caching for the static prefix, and returning **compact** tool outputs."}, {"t": "Designing tools for agents", "md": "- **Retries inside the tool** with exponential backoff and a cap; respect «Retry-After».\n- **Structured, final errors**: «{\"error\":\"orders_unavailable\",\"retryable\":false,\"next\":\"escalate\"}» so the model knows to stop.\n- **Circuit breaker**: after N failures, fail fast for a cool-down period.\n- **Idempotency keys** for actions (refunds!) so a retry can't double-act.\n- Small, specific tools with clear descriptions beat one big generic tool."}],
 pager:`[r]FIRING[/r]  LLM spend  refund-agent  [r]₹4.1 lakh[/r] in 9h (daily budget ₹30k)
top run    conv_88a1f   [r]1,840 steps[/r]   3.9M input tokens
runs > 50 steps: [r]212[/r] (normal: 0)
provider   rate-limit headroom: 4%`,
 brief:"The refund agent helps support agents resolve refund tickets. It's a LangGraph loop with tools to look up orders and issue refunds. Last week it was **migrated from a prebuilt AgentExecutor to a custom LangGraph graph**. Overnight, the Orders API was in a maintenance window.",
 slack:[
  {at:0, who:"arjun", t:"Why is our AI bill ₹4 lakh for one night?! The whole month's budget is ₹9 lakh."},
  {at:5, who:"kai", t:"Let's look at the worst run first. What is it actually doing for 1,840 steps?", cmd:"langsmith runs get conv_88a1f --steps 6"},
  {at:50, who:"dev", t:"Maybe Anthropic raised prices? I can switch us to a cheaper model in 5 minutes."},
  {on:"loop", who:"kai", t:"Same tool, same error, again and again. What does the Orders API return when it's rate-limited, and how does our tool pass that back?", cmd:"cat agent/tools/orders.py"},
  {on:"toolerr", who:"priya", t:"So the model reads \"please retry\" and dutifully retries, forever. But the graph should have stopped it long before step 1,840. What's the step limit?", cmd:"grep -n recursion_limit agent/graph.py"},
  {on:"limit", who:"sana", t:"And no per-run budget either? We should be able to kill a run that costs more than a few rupees."}
 ],
 hints:["Look inside the most expensive run: which tool is called, and what does it return each time?","The tool turns an HTTP 429 into the text \"please retry\" and hands it to the model. What would a model do with that?","Every agent loop needs a hard stop: a step limit and a cost budget. Check the graph's recursion_limit."],
 term:{host:"ai-ops", user:"oncall", suggest:["langsmith runs list --project refund-agent --sort cost --limit 3","curl -s orders-api/health"],
  cmds:[
  {m:["langsmith runs list"], out:`run_id      steps   input_tokens   cost(₹)   status
conv_88a1f  [r]1840[/r]    3,912,004      [r]9,844[/r]     running
conv_71c02  [r]1702[/r]    3,511,880      8,912     running
conv_5e9b0  [r]1655[/r]    3,402,117      8,601     running
[d]… 209 more runs with > 50 steps (normal p99: 9 steps)[/d]`, clue:"runaway", unlock:["langsmith runs get conv_88a1f --steps 6"]},
  {m:["langsmith runs get"], out:`step 1838  tool_call  get_order_status(order_id="O-77120")
step 1838  tool_out   "[y]Error: Orders API is busy (429). Please retry.[/y]"
step 1839  llm        "The Orders API is busy. I'll retry checking the order status."
step 1839  tool_call  get_order_status(order_id="O-77120")
step 1839  tool_out   "[y]Error: Orders API is busy (429). Please retry.[/y]"
step 1840  llm        "Retrying…"
[d]prompt size at step 1840: 2,140 tokens of instructions + [r]1,838 prior steps[/r][/d]`, clue:"loop", unlock:["cat agent/tools/orders.py"]},
  {m:["cat agent/tools/orders.py"], out:`@tool
def get_order_status(order_id: str) -> str:
    """Look up an order's status."""
    r = requests.get(f"{ORDERS}/orders/{order_id}", timeout=5)
    if r.status_code != 200:
        [r]return f"Error: Orders API is busy ({r.status_code}). Please retry."[/r]
    return r.text`, clue:"toolerr", unlock:["grep -n recursion_limit agent/graph.py"]},
  {m:["grep -n recursion_limit agent/graph.py","grep recursion_limit","cat agent/graph.py"], out:`41:    # was AgentExecutor(max_iterations=15) before the migration
42:    app = graph.compile(checkpointer=saver)
57:    result = app.invoke(state, config={"[r]recursion_limit[/r]": [r]10_000[/r]})   # raised "so long chats don't crash"
[d]-- no token or cost budget anywhere in the graph[/d]`, clue:"limit"},
  {m:["curl -s orders-api/health","curl orders-api"], out:`{"status":"degraded","reason":"[y]scheduled maintenance 23:00–05:00, rate limit 5 req/s[/y]"}`, clue:"maint"},
  {m:["curl -s llm-gateway/pricing","curl llm-gateway"], out:`model claude-sonnet   input $3 / MTok   output $15 / MTok   [d](unchanged since June)[/d]`, note:"Prices didn't change. The bill grew because the token volume exploded."},
  {m:["kubectl get pods"], out:`NAME                      READY   STATUS    RESTARTS   AGE
refund-agent-7f9c-x81kd   1/1     Running   0          6d
refund-agent-7f9c-q2m7w   1/1     Running   0          6d`, note:"Pods are healthy. The agent isn't crashing; it's looping."}
 ]},
 dash:[
  {title:"LLM spend per hour (₹)", x:["22:00","23:00","00:00","01:00","02:00","03:00","04:00","05:00","06:00"], series:[{name:"₹/h", v:[1100,9800,31000,48000,62000,71000,78000,80000,21000]}], marks:[{i:1, label:"Orders API maintenance"}], clue:"spend"},
  {title:"Steps per run (p99)", x:["22:00","23:00","00:00","01:00","02:00","03:00","04:00","05:00","06:00"], series:[{name:"p99 steps", v:[9,140,520,880,1190,1420,1650,1840,1840]}], marks:[{i:1, label:"maintenance"}], clue:"runaway"},
  {title:"LLM latency p95 (s)", unit:"s", x:["22:00","23:00","00:00","01:00","02:00","03:00","04:00","05:00","06:00"], series:[{name:"p95", v:[3.1,3.4,4.8,6.2,7.9,9.1,9.8,10.2,4.0]}], note:"Latency rose because prompts got huge. That's a consequence, not the cause."},
  {title:"Tickets resolved per hour", x:["22:00","23:00","00:00","01:00","02:00","03:00","04:00","05:00","06:00"], series:[{name:"resolved", v:[44,6,0,0,0,0,0,0,31]}], note:"Nothing got resolved during the window, as expected when no tool works. It shows the impact, not the mechanism."}
 ],
 ui:[
  {title:"Trace tree · conv_88a1f", md:`| Step | Node | Tokens in | Cost ₹ |
|---|---|---|---|
| 1 | agent → get_order_status | 2,310 | 0.6 |
| 100 | agent → get_order_status | 41,200 | 10.4 |
| 1000 | agent → get_order_status | 402,880 | 101 |
| 1840 | agent → get_order_status | **740,112** | **186** |`, clue:"context"}
 ],
 files:[
  {path:"agent/graph.py", meta:"migrated from AgentExecutor last week", text:`graph = StateGraph(State)
graph.add_node("agent", call_model)
graph.add_node("tools", ToolNode([get_order_status, issue_refund]))
graph.add_edge(START, "agent")
graph.add_conditional_edges("agent", tools_condition)
graph.add_edge("tools", "agent")
app = graph.compile(checkpointer=saver)

def handle(ticket):
    state = {"messages": [system_prompt, ticket]}
    return app.invoke(state, config={"recursion_limit": 10_000})`, clues:{11:"limit"}, notes:{6:"tools → agent is the normal ReAct loop. The edge is fine; what's missing is a limit."}}
 ],
 clues:{
  runaway:"212 runs took 50+ steps overnight (the worst: 1,840; normal p99: 9)",
  loop:"The worst run calls get_order_status on the same order over and over",
  toolerr:"The tool turns HTTP 429 into the text \"Please retry.\" and returns it to the model",
  limit:"recursion_limit was raised to 10,000 (the old AgentExecutor stopped at 15) and there's no cost budget",
  maint:"The Orders API was in maintenance (23:00–05:00) with a 5 req/s rate limit",
  spend:"Spend rose from ~₹1k to ~₹80k per hour from the start of the maintenance window",
  context:"Each step re-sends the whole history: 740k input tokens per call by step 1,840"
 },
 cause:{q:"What's the root cause?", o:[
  {t:"During the Orders API's rate-limited maintenance, the tool told the model \"please retry\", so it retried forever. The new graph had no real step limit (10,000) and no cost budget, and the context grew with every step", ok:true},
  {t:"The LLM provider raised prices", ok:false, why:"Pricing is unchanged; token volume exploded.", say:[["kai","Price per token hasn't changed since June. We sent 300× more tokens."]]},
  {t:"The model is hallucinating", ok:false, why:"It's doing exactly what the tool told it to: retry. The design is the problem.", say:[["priya","It's not hallucinating. The tool literally says \"Please retry\", and nothing ever tells it to stop."]]},
  {t:"A traffic spike of refund tickets", ok:false, why:"Tickets were normal; each run just never ended.", say:[["arjun","Ticket volume was a normal Tuesday night. It's the steps per run that went crazy."]]}
 ]},
 fix:{q:"What do you ship? Pick every action you'd take.", o:[
  {t:"Set a sane step limit (e.g. recursion_limit ≈ 25) plus a per-run token/₹ budget that ends the run with a handoff to a human", kind:"must", why:"Every agent loop needs a hard stop. Runaway runs cost a few rupees, not thousands.", miss:[["kai","Retries are handled in the tool now, but there's still no ceiling. Any new failure mode can loop to step 10,000 again."]]},
  {t:"Handle 429/5xx inside the tool: retry with backoff a few times, then return a structured, final error (\"orders unavailable, escalate\")", kind:"must", why:"Retrying is the tool's job, not the model's. The model should get a clear \"stop and escalate\" signal.", miss:[["priya","The limit stops runs at 25 steps, good, but every ticket during an outage now burns 25 LLM calls retrying uselessly. Retry belongs in the tool."]]},
  {t:"Kill the currently running runaway runs", kind:"good", why:"Stops the bleeding right now: 212 runs are still spending."},
  {t:"Alerts on cost per hour and on steps per run (p99), plus a circuit breaker on the Orders API", kind:"good", why:"You'd catch it within the hour, and the agent stops calling a dead API."},
  {t:"Add an eval: \"tool keeps failing\" must end in a handoff within N steps", kind:"good", why:"Locks the behaviour in so the next refactor can't remove it."},
  {t:"Switch to a cheaper model", kind:"meh", why:"Makes each loop iteration cheaper. The loop still never ends."},
  {t:"Ask the Orders team to remove their rate limit", kind:"bad", why:"The agent would hammer a system in maintenance even harder, and still loop on the next error.", say:[["dev","Orders team removed the limit… the agent sent 40k requests in 5 minutes and knocked the Orders API over. Now *checkout* status lookups are failing too. 😬"]]},
  {t:"Remove the get_order_status tool for now", kind:"bad", why:"Without order data, the agent guesses refund eligibility or refunds blindly.", say:[["arjun","The agent just issued 37 refunds without checking order status — including on orders that were never paid. Put the tool back!!"]]}
 ]},
 post:{
  summary:"The refund agent spent **₹4.1 lakh in 9 hours** (daily budget ₹30k). 212 runs looped for up to 1,840 steps while the Orders API was rate-limited for maintenance.",
  cause:"Three design gaps met one ordinary event. (1) «get_order_status» turned HTTP 429 into the text \"*Please retry.*\" and returned it to the model, which reasonably retried. (2) The LangGraph migration set «recursion_limit=10_000». The old AgentExecutor stopped at 15, and there was **no token or cost budget**. (3) Every step re-sent the full history, so prompts reached **740k tokens** per call and cost grew roughly quadratically.",
  prevent:["Hard step limit + per-run budget with a human handoff, enforced in the graph","Tools own their retries (backoff, max attempts) and return structured terminal errors","Circuit breakers on downstream APIs","Cost/steps alerts and a 'failing tool' eval in CI"]
 },
 learned:["Agents need **hard stops**: max steps, max tokens/₹ per run, then hand off to a human.","**Retries belong in the tool** (with backoff), not in the model's reasoning.","Cost per step grows with the **context**. Long loops get expensive fast.","Migrations can silently drop safety defaults (max_iterations=15 → 10,000)."]
}
]);

/* ===== Work simulator: Agentic AI ===== */
QUEST.work("agents", [
{
 type:"logs", title:"Read the agent trace", three:"answer all 4 questions with at most 1 wrong tap",
 brief:"A customer (Rahul, customer «C-1201») asked the refund agent for a refund. The agent refunded **₹18,400 for an order that belongs to someone else** (his sister, who shares the family phone number). Nobody was hacked: the agent just did what its design allowed.\n\nRead the trace and find each decision that went wrong.",
 source:"LangSmith trace · refund-agent · run r_55120 · 41 events",
 log:[
  "11:02:01 INFO  run start  session_customer=C-1201 channel=app model=claude-sonnet",
  "11:02:01 INFO  system     prompt v14 loaded (refund policy, 6 tools)",
  "11:02:01 DEBUG memory     loaded 3 past messages for C-1201",
  "11:02:02 INFO  user       \"I want a refund for my order from yesterday, it never arrived\"",
  "11:02:03 INFO  llm        thought: I need to find the customer's orders from yesterday.",
  "11:02:03 INFO  tool_call  search_orders(phone=\"98xxxx4410\", date=\"2026-11-17\")",
  "11:02:03 DEBUG tool       search_orders using phone number lookup (shared across family accounts)",
  "11:02:04 INFO  tool_out   search_orders → [y]3 results[/y]: O-55120 (₹18,400, customer C-8812, electronics), O-55077 (₹640, customer C-1201, groceries), O-55091 (₹1,210, customer C-1201, pharmacy)",
  "11:02:05 INFO  llm        thought: [y]The most expensive order is probably the one they care about.[/y] I'll check O-55120.",
  "11:02:05 INFO  tool_call  get_order_status(order_id=\"O-55120\")",
  "11:02:06 INFO  tool_out   O-55120: status=IN_TRANSIT, eta=2026-11-19, carrier=BlueDart",
  "11:02:06 DEBUG latency    llm=812ms tool=94ms",
  "11:02:07 INFO  llm        thought: It hasn't arrived and the customer wants a refund. Policy allows refunds for undelivered orders.",
  "11:02:07 WARN  policy     refund policy says IN_TRANSIT orders should wait for ETA; model judged eligible anyway",
  "11:02:08 INFO  tool_call  issue_refund(order_id=\"O-55120\", amount=18400, reason=\"not delivered\")",
  "11:02:09 INFO  tool_out   issue_refund → OK refund_id=RF-77120 [r](no check that order.customer_id == session_customer)[/r]",
  "11:02:09 INFO  llm        \"Done! I've refunded ₹18,400 for your order O-55120. It'll reach you in 3-5 days.\"",
  "11:02:10 INFO  user       \"wait what? my order was ₹640 groceries\"",
  "11:02:11 INFO  llm        \"I'm sorry for the confusion! Let me look again.\"",
  "11:02:11 DEBUG tokens     in=6,212 out=388 cost=₹0.61",
  "11:02:12 INFO  run end    status=success steps=7"
 ].join("\n"),
 qs:[
  {q:"Which tool result gave the agent **more than one** possible order?", a:["search_orders → [y]3 results"], why:"«search_orders» by **phone number** returned 3 orders, and one belongs to **another customer (C-8812)**. The tool searched by a weak identifier (a family-shared phone) instead of the **authenticated session's customer id**. Tools should be scoped to the logged-in user by design, not by whatever the model passes in."},
  {q:"Where did the agent **guess** instead of asking the customer?", a:["The most expensive order is probably the one they care about"], why:"With 3 candidates, the right move is to **ask** (\"Is it the ₹640 groceries order or the ₹1,210 pharmacy order?\"). Agents should be told, and tested, to clarify ambiguity before taking actions, especially irreversible ones."},
  {q:"Which line shows the agent's action went against **policy**?", a:["refund policy says IN_TRANSIT orders should wait for ETA"], tip:"Filter for «policy».", why:"The order was **in transit** with an ETA tomorrow; policy says wait. The model's judgment overrode the rule. Business rules like eligibility belong **in the tool's code** («issue_refund» should reject IN_TRANSIT orders), not only in the prompt."},
  {q:"Which line shows the missing **safety check** that made the bad refund possible?", a:["(no check that order.customer_id == session_customer)"], why:"«issue_refund» accepted **any** order id. One line of authorization in the tool, «order.customer_id == session.customer_id», would have blocked this no matter what the model decided. For money-moving tools also add: an amount limit for auto-approval, and human approval above it."}
 ],
 notes:[["run start","Normal start. Note the session already knows the customer: C-1201."],["prompt v14","Loading the system prompt. Normal."],["memory","Loading conversation memory. Normal."],["latency","Timing info. Fine."],["tokens","Cost info. ₹0.61 is normal for 7 steps."],["get_order_status","Checking status was reasonable. The problem was *which* order."],["run end","«status=success» means the run didn't crash, not that it did the right thing."],["wait what","The customer noticing: the symptom, after the damage."],["I'm sorry","The agent apologising: after the refund already went out."]],
 deep:[
  {t:"Reading an agent trace", md:"An agent run is a loop of **thought → tool call → tool output → thought**. For each step ask:\n1. **Did the tool return what the agent needed?** (Right scope, unambiguous, complete.)\n2. **Did the model interpret it correctly?** Watch for guesses (\"probably\", \"I'll assume\").\n3. **Should a guardrail have stopped this step?** Policy, authorization, amount limits, human approval.\n\nTools like LangSmith, Langfuse or Phoenix show each step with inputs, outputs, latency and tokens. «status=success» only means nothing crashed."},
  {t:"Put authority in tools, not prompts", md:"- **Scope by identity**: tools read the authenticated user from the session, never trust a user/model-supplied identifier like a phone number.\n- **Enforce rules in code**: eligibility, ownership, amount limits. The prompt can explain the policy; the tool must enforce it.\n- **Human-in-the-loop** for irreversible or high-value actions (refunds above ₹X, emails to new recipients).\n- **Return useful errors**: \"order belongs to a different customer; ask the user which order\" lets the model recover."},
  {t:"Teaching agents to ask", md:"- Prompt: \"If more than one item matches, list them and ask the user to choose. Never pick on their behalf.\"\n- Tool design: return candidates with distinguishing details so a question is easy.\n- Evals: build cases with **ambiguous** inputs and assert the agent asks before acting. Track an \"acted on ambiguity\" rate in production traces."}
 ],
 say:"When an agent does the wrong thing I read the trace step by step: was the tool output scoped and unambiguous, did the model guess, and which guardrail should have stopped the action. Here the fixes were scoping search to the session customer, asking when several orders match, and enforcing ownership and eligibility inside the refund tool."
}
]);

QUEST.story("agents", {title:"Agent or workflow?", icon:"🤔", place:"Mon 10 AM · design review", setup:"Product wants an 'autonomous agent' to process merchant KYC documents: read the PDF, extract fields, check them against the registry, approve or flag.",
 meters:[["err","Wrong approvals","%",4,0.2,"low",10],["cost","Cost per document"," ₹",9,2,"low",12],["trust","Compliance trust","%",35,75,"high",100]],
 beats:[["kai","The prototype agent decides its own steps. It's clever, but it approved 4% wrongly and costs ₹9 a doc."],["ui","Steps are always the same: extract → validate → registry lookup → decide"],
  ["q","Should this be a free-roaming agent?",[["No: the steps are fixed, so use a workflow (fixed graph) with the LLM only where judgment is needed",1,"Agents fit open-ended tasks; predictable processes are cheaper and safer as workflows.","A checklist for a routine job; improvisation for emergencies."],["Yes, agents are always better",0,"More variance, cost and risk.","Improvising a routine job."]]],
  ["q","Where should the LLM sit?",[["Extraction from messy PDFs (structured output) and summarising mismatches for reviewers; rules in code for validation and approval",1,"LLMs read unstructured text; deterministic code enforces compliance rules.","The clerk reads the document; the rulebook decides."],["Let the LLM decide approvals",0,"Compliance decisions need deterministic, auditable rules.","Letting the reader stamp approvals."]]],
  ["q","How do you handle uncertain cases?",[["Confidence thresholds and validation failures route to a human review queue",1,"Humans see exactly the cases that need them.","Unclear forms go to the senior clerk."],["Retry the agent until it approves",0,"Gaming your own process.","Asking until someone says yes."]]],
  ["kai","Wrong approvals 0.1%, ₹1.8 per doc, and compliance signed off."]],
 learned:["Use workflows for fixed processes; agents for open-ended ones.","LLMs extract and explain; code enforces rules.","Route uncertainty to humans."]});
QUEST.mock("agents", {title:"Agentic AI round", who:"rohit", intro:"Rohit here. Let's go deep on AI agents.", setup:"Rohit builds agent platforms.",
 qs:[["What is an agent, technically?","An LLM in a **loop**: it decides an action (tool call), observes the result, and repeats until done (ReAct-style). Key parts: model, tools with clear schemas, memory/state, stopping conditions, and guardrails.",[["An LLM choosing tool calls in a loop with observations until a stop condition, plus state and guardrails",1,"Precise."],["Any chatbot",0,"No tool loop."],["A cron job",0,"No."]]],
  ["How do you design good tools for an agent?","Few, **specific** tools with clear names, descriptions and typed parameters; scoped to the user; idempotent where possible; return compact, structured results and **actionable errors**; enforce rules (auth, limits) inside the tool.",[["Specific, typed, scoped tools with compact outputs, actionable errors and enforcement inside",1,"Great."],["One generic 'run code' tool",0,"Risky and unreliable."],["As many tools as possible",0.5,"Selection gets worse."]]],
  ["How do you evaluate an agent?","End-to-end task success on a dataset of scenarios, **trajectory** checks (right tools, right order, no unsafe actions), step count/cost/latency, and failure-mode tests (tool errors, ambiguous input, injection). Online: success rate, handoffs, cost per task.",[["Task success, trajectory checks, cost/steps, and adversarial scenarios, offline and online",1,"Complete."],["Check if it sounds confident",0,"No."],["Only unit-test the tools",0.5,"Needed but not enough."]]],
  ["What guardrails do production agents need?","Step and budget limits, human approval for risky actions, least-privilege tools, input/output filtering (PII, injection), timeouts and circuit breakers, full tracing and kill switches.",[["Limits, approvals, least privilege, filtering, timeouts, tracing, kill switch",1,"Production-ready."],["A strong system prompt",0.5,"Not enough."],["None, trust the model",0,"Red flag."]]]],
 learned:["Agent = LLM + tools in a loop + stop conditions.","Tools carry the safety.","Evaluate trajectories, not just answers."]});
