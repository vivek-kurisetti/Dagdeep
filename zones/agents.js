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
