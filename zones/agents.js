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
