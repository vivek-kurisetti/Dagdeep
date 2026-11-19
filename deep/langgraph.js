QUEST.deep("langgraph", {
"Three ingredients": {
d: `A LangGraph application is a **state machine**:
- **State**: a schema (TypedDict, dataclass or Pydantic) describing everything the graph tracks: messages, extracted fields, flags, counters. Every node reads it.
- **Nodes**: plain Python functions (or runnables) «node(state) -> partial update». They call LLMs, tools, APIs or just compute.
- **Edges**: which node runs next. Normal edges are fixed («A → B»); **conditional edges** call a routing function on the state. Special nodes «START» and «END» mark entry and exit.

You build with «StateGraph(State)», add nodes and edges, then «compile()» into a runnable that supports «invoke», «stream», checkpointing and interrupts. Unlike a linear chain, graphs can **loop** (agent ↔ tools), **branch** and **pause**.`,
life: `A board game: the board (state) shows everyone's position, each square (node) has an action, and arrows (edges), sometimes depending on a dice roll (conditional), tell you where to go next.`,
work: `A chargeback-handling flow: «classify» → (conditional) «fetch_evidence» or «auto_reject» → «draft_response» → «human_review» → «submit». Modelled as a LangGraph, each step was testable alone, the review step could pause for days, and the whole flow was visible as a diagram for ops.`,
ex: `from typing import TypedDict
from langgraph.graph import StateGraph, START, END
class S(TypedDict):
    ticket: str
    category: str
    reply: str
def classify(s): return {"category": llm_classify(s["ticket"])}
def draft(s):    return {"reply": llm_draft(s["ticket"], s["category"])}
g = StateGraph(S)
g.add_node("classify", classify); g.add_node("draft", draft)
g.add_edge(START, "classify"); g.add_edge("classify", "draft"); g.add_edge("draft", END)
app = g.compile()
app.invoke({"ticket": "Refund not received for order 991"})`,
pit: [`Putting business logic in edges instead of nodes.`, `Huge, untyped state dicts.`, `Using a graph where a single function call would do.`],
q: [`What does a LangGraph node receive and return?`, `It receives the current state and returns a partial update (only the keys it changes).`]
},
"Nodes return updates, not state": {
d: `A node returns a dict of **only the keys it wants to change**: «return {"category": "refund"}». LangGraph applies it to the shared state using each key's **reducer**: the default reducer **overwrites** the value; custom reducers can append, add or merge.

Benefits: nodes stay small and decoupled (they don't need to copy the whole state), parallel nodes can update different keys safely, and checkpoints record exactly what changed. Don't mutate the incoming state object in place; return updates. Returning nothing («None» or «{}») means no change.

Watch out: if two parallel nodes update the **same key** with the default (overwrite) reducer in the same super-step, LangGraph raises an error («InvalidUpdateError»); give that key a reducer.`,
life: `Team members don't each rewrite the entire project plan; they send "change these two lines" notes, and the coordinator merges them into the master plan.`,
work: `A bug: a node did «state["messages"].append(x); return state», mutating the input and returning everything; history was duplicated after checkpoints and parallel branches overwrote each other's fields. Rewriting nodes to return only «{"messages": [x]}» with an «add_messages» reducer fixed both.`,
ex: `def enrich(state: S) -> dict:
    risk = score(state["ticket"])
    return {"risk": risk}          # only what changed
# ✗ don't
def bad(state):
    state["risk"] = score(state["ticket"])
    return state`,
pit: [`Mutating state in place.`, `Returning the full state from every node.`, `Parallel writes to the same key without a reducer.`],
q: [`Two parallel nodes both return «{"notes": ...}» and «notes» has no reducer. What happens?`, `An InvalidUpdateError: concurrent updates to a key need a reducer to merge them.`]
},
"Reducers merge updates": {
d: `A **reducer** defines how an update combines with the existing value: «new_value = reducer(old_value, update)». Declare it with «Annotated[type, reducer]» in the state schema:
- «messages: Annotated[list, add_messages]»: appends new messages, **updates** existing ones with the same id, and supports removal via «RemoveMessage». The standard for chat/agent state.
- «results: Annotated[list, operator.add]»: concatenates lists; ideal for collecting outputs from parallel branches (map-reduce).
- «total: Annotated[int, operator.add]»: sums.
- Custom functions: merge dicts, keep max, dedupe by key.

Keys without a reducer use **overwrite**. «MessagesState» is a prebuilt state with «messages» + «add_messages».`,
life: `A class register: attendance marks are added each day (append reducer), while "class monitor" is simply replaced when a new one is chosen (overwrite).`,
work: `A research graph fanned out to 8 search nodes in parallel. With a plain «list» type for «findings», the run crashed on concurrent updates; switching to «Annotated[list, operator.add]» collected all 8 results, and a final node deduplicated them.`,
ex: `import operator
from typing import Annotated, TypedDict
from langgraph.graph.message import add_messages
class S(TypedDict):
    messages: Annotated[list, add_messages]
    findings: Annotated[list[str], operator.add]
    cost_inr: Annotated[float, operator.add]
    status: str                                  # overwrite`,
pit: [`operator.add on messages (duplicates on retries instead of updating by id).`, `Forgetting reducers for parallel-updated keys.`, `Unbounded append lists growing forever.`],
q: [`Why use add_messages instead of operator.add for chat messages?`, `add_messages updates messages with the same id (and supports removal), so retries or edits don't create duplicates.`]
},
"Conditional edges": {
d: `«add_conditional_edges(source, routing_fn, path_map)»: after «source» runs, «routing_fn(state)» returns the name of the next node (or a list of names, or «END»). «path_map» optionally maps return values to nodes and documents possible branches for visualisation.

The classic **tool-calling agent loop**:
- «agent» node calls the LLM with tools bound.
- Conditional edge: if the last message has **tool calls** → «tools» node (executes them, e.g. prebuilt «ToolNode»), else → «END».
- Edge «tools → agent» loops back.

Routing functions should be **pure and cheap** (read state, return a name). Put expensive logic (LLM classification) in a node that writes a field, then route on that field. Add a step counter or rely on the recursion limit to stop runaway loops.`,
life: `A traffic signal at a junction: it looks at the situation (state) and points cars left, right or straight. The decision is quick; the driving happens on the roads (nodes).`,
work: `A support graph routed by LLM classification inside the routing function itself; retries and streaming re-ran the LLM call and sometimes took different branches. Moving classification into a «classify» node that stores «category», with a pure router reading it, made runs deterministic and checkpoint-replayable.`,
ex: `from langgraph.prebuilt import ToolNode, tools_condition
g.add_node("agent", call_model)
g.add_node("tools", ToolNode(tools))
g.add_edge(START, "agent")
g.add_conditional_edges("agent", tools_condition)     # -> "tools" or END
g.add_edge("tools", "agent")
app = g.compile()
app.invoke({"messages": [("user", "Status of payment pay_91x?")]}, {"recursion_limit": 25})`,
pit: [`LLM calls inside routing functions.`, `No stop condition for loops.`, `Returning node names that don't exist (runtime errors).`],
q: [`What does tools_condition route to?`, `To the "tools" node if the last AI message contains tool calls, otherwise to END.`]
},
"Fan-out with Send": {
d: `Sometimes the number of parallel branches is only known at runtime (one per document, per merchant, per sub-question). From a conditional edge, return a list of «Send(node_name, payload)» objects: LangGraph runs «node_name» once per Send, **in parallel** in the next super-step, each with its own payload as input state.

Results flow back to the shared state through a **reducer** (e.g. «operator.add» on a results list). A following node (the "reduce" step) then runs once all branches finish.

This is **map-reduce** inside a graph: split → parallel process → combine. Control concurrency with «max_concurrency» in the run config if branches call rate-limited APIs.`,
life: `A teacher handing one essay to each of 30 students to grade in parallel (Send per essay), then collecting all grades into one register (reducer) and computing the class average.`,
work: `A monthly reconciliation graph produced a list of 120 merchants with mismatches, then used Send to run «investigate_merchant» per merchant in parallel (max_concurrency 10 to respect the bank API limit). A final node compiled one report. Runtime went from 2 hours sequential to 14 minutes.`,
ex: `from langgraph.types import Send
class S(TypedDict):
    merchants: list[str]
    reports: Annotated[list[dict], operator.add]
def fan_out(state):
    return [Send("investigate", {"merchant": m}) for m in state["merchants"]]
g.add_conditional_edges("find_mismatches", fan_out, ["investigate"])
g.add_edge("investigate", "compile_report")
app.invoke(inputs, {"max_concurrency": 10})`,
pit: [`No reducer on the results key.`, `Unbounded fan-out hitting rate limits.`, `Sending huge payloads per branch.`],
q: [`How do parallel Send branches return results?`, `By returning updates to a state key with a reducer (e.g. operator.add on a list) that merges all branch outputs.`]
},
"Checkpointers save every step": {
d: `Compile with a **checkpointer** and LangGraph saves a **checkpoint** (state snapshot + metadata + next nodes) after every super-step, keyed by a **thread_id** you pass in config. Implementations: «InMemorySaver» (tests), «SqliteSaver», «PostgresSaver», Redis and others.

What it enables:
- **Conversation memory** per thread: call again with the same thread_id and the state continues.
- **Human-in-the-loop**: pause with interrupts and resume later.
- **Fault tolerance**: resume after crashes from the last checkpoint instead of starting over.
- **Time travel**: «get_state_history(config)» lists past checkpoints; you can replay or **fork** from one (update state, then continue).
- Debugging: inspect exactly what state each step saw.`,
life: `Autosave in a video game: progress is saved after every level, per player profile (thread). Crash? Reload from the last save. Want to try a different choice? Load an older save.`,
work: `A KYC review graph ran across days (waiting for documents and reviewers). With «PostgresSaver», each case was a thread; deployments and pod restarts didn't lose progress, and support could view a case's state history to answer "why was this flagged?".`,
ex: `from langgraph.checkpoint.postgres import PostgresSaver
with PostgresSaver.from_conn_string(DB_URI) as cp:
    cp.setup()
    app = g.compile(checkpointer=cp)
    cfg = {"configurable": {"thread_id": "kyc-case-8812"}}
    app.invoke({"messages": [("user", "start review")]}, cfg)
    print(app.get_state(cfg).values)
    for snap in app.get_state_history(cfg): print(snap.config, snap.next)`,
pit: [`InMemorySaver in production.`, `Reusing thread ids across users.`, `Storing huge blobs in state (checkpoint bloat).`],
q: [`What identifies which saved conversation/state a run continues?`, `The thread_id in the run config.`]
},
"interrupt() pauses the graph": {
d: `Inside a node, «value = interrupt(payload)» **pauses** execution: the current state is checkpointed and the run returns to the caller with the payload (e.g. a proposed refund for approval) under «__interrupt__». Nothing else runs.

To resume, invoke again with the same thread_id and «Command(resume=answer)». The node **re-executes from its beginning**, and this time «interrupt()» returns the resume value. Consequences:
- Code before the interrupt in that node runs **again** on resume: keep it idempotent or move side effects after the interrupt / into another node.
- Multiple interrupts in a node are matched by order.
- Requires a checkpointer.

Patterns: approve/reject an action, edit a draft or tool arguments, ask the user for missing info, review LLM output before sending.`,
life: `A bank teller prepares a large withdrawal slip, then stops and says "manager approval needed". When the manager signs, the teller starts that counter procedure from the top with the signature in hand.`,
work: `A refund node called the payment API, then interrupted for approval. On resume the node re-ran from the top and called the API again, issuing a duplicate refund in testing. Fix: compute the proposal → interrupt → only after approval call the API (with an idempotency key).`,
ex: `from langgraph.types import interrupt, Command
def refund_node(state):
    proposal = {"payment_id": state["pid"], "amount": state["amount"]}
    decision = interrupt({"action": "approve_refund", **proposal})   # pauses here
    if decision != "approve":
        return {"status": "rejected"}
    res = payments.refund(**proposal, idempotency_key=state["pid"])
    return {"status": "refunded", "ref": res.id}
out = app.invoke(inputs, cfg)              # returns with __interrupt__
app.invoke(Command(resume="approve"), cfg) # continues`,
pit: [`Side effects before interrupt() (they repeat on resume).`, `Forgetting the checkpointer.`, `Resuming with a different thread_id.`],
q: [`What happens to code before interrupt() when the graph resumes?`, `The node re-runs from its start, so that code executes again.`]
},
"Super-steps": {
d: `LangGraph's runtime follows a **Pregel / bulk-synchronous parallel** model:
1. In a **super-step**, every node scheduled for this step runs, possibly in **parallel**.
2. Their updates are collected and applied to state (via reducers) **together at the end** of the step.
3. The next set of nodes is determined from edges, and the next super-step starts.
4. A checkpoint is written per super-step.

Implications:
- Nodes in the same super-step don't see each other's updates.
- If any node in a parallel step fails, the step's updates aren't applied (transactional per step); successful sibling writes are saved as pending writes so they aren't re-run on retry.
- «recursion_limit» (default 25 in many versions) counts super-steps and stops infinite loops with «GraphRecursionError».`,
life: `Exam rounds: all students answer this round's question at the same time, papers are collected together, results posted, then the next round starts. Nobody sees another's answer mid-round.`,
work: `A graph with nodes A → (B, C in parallel) → D showed D sometimes missing C's result. The developer had added a direct edge B → D, so D was scheduled in a step after B only. Making D wait on both («add_edge(["B", "C"], "D")») ensured D ran after both finished in the same super-step.`,
ex: `g.add_edge("A", "B"); g.add_edge("A", "C")      # B and C run in the same super-step
g.add_edge(["B", "C"], "D")                       # D waits for both
app.invoke(inputs, {"recursion_limit": 50})`,
pit: [`Expecting parallel nodes to see each other's writes.`, `Joining branches incorrectly so a node runs early.`, `Raising recursion_limit to hide a loop bug.`],
q: [`When are updates from parallel nodes applied to the state?`, `Together at the end of the super-step, after all nodes in that step finish.`]
},
"Make long runs survive failures": {
d: `Long-running graphs (multi-hour research, multi-day approvals) will meet crashes, deploys and timeouts. With a durable checkpointer:
- **Resume** a thread by invoking with the same thread_id (and «None» input) to continue from the last checkpoint.
- **Durability modes** (LangGraph ≥ 0.6): «"exit"» (checkpoint only when the run ends or pauses: fastest, least durable), «"async"» (checkpoint written asynchronously while the next step runs), «"sync"» (write before continuing: safest).
- **Pending writes**: if a parallel step partially fails, successful nodes' writes are kept so they aren't recomputed.
- Make nodes **idempotent** (they may re-run), and wrap external calls with **retries** («RetryPolicy» on nodes) and idempotency keys.
- Use **tasks** («@task» in the functional API) to checkpoint expensive sub-results inside nodes.`,
life: `A long train journey with tickets checked at each station: if the train breaks down, passengers continue from the last station they reached, not from the origin.`,
work: `A 3-hour data-quality audit graph failed at step 40 of 55 when an API timed out, and originally restarted from scratch. With PostgresSaver, «durability="sync"», a RetryPolicy(max_attempts=3) on API nodes, and resume-on-failure in the job runner, failures cost minutes instead of hours.`,
ex: `from langgraph.types import RetryPolicy
g.add_node("call_bank_api", call_bank_api, retry_policy=RetryPolicy(max_attempts=3, initial_interval=2.0))
app = g.compile(checkpointer=cp)
try:
    app.invoke(inputs, cfg, durability="sync")
except Exception:
    app.invoke(None, cfg)          # resume from last checkpoint`,
pit: [`Non-idempotent nodes (duplicate side effects on re-run).`, `"exit" durability for critical long runs.`, `No retry policies on flaky I/O.`],
q: [`How do you resume a failed thread from its last checkpoint?`, `Invoke the graph again with the same thread_id config and None as input.`]
},
"Command, Send and subgraphs": {
d: `- «Command(update={...}, goto="node")»: returned from a node, it updates state **and** chooses the next node in one go, without a separate conditional edge. Great for **agent handoffs** ("transfer to billing agent") and dynamic routing. «goto» can also target a node in the **parent graph» («graph=Command.PARENT»).
- «Command(resume=...)»: resumes after an interrupt.
- «Send(node, payload)»: dynamic parallel fan-out with per-branch input.
- **Subgraphs**: a compiled graph used as a node in another graph. Share state keys with the parent, or call it inside a node function and transform state in and out. Subgraphs encapsulate team-specific logic (a "research team" graph) and can have their own checkpoint namespaces.

Multi-agent architectures (supervisor, swarm/handoffs, hierarchical teams) are built from these pieces.`,
life: `A receptionist who both updates your file and walks you to the right department (Command), a manager who sends copies of a task to several staff at once (Send), and departments that have their own internal procedures (subgraphs).`,
work: `A support system had a triage agent and specialist agents (payments, KYC, disputes) as subgraphs. Specialists used «Command(goto="triage", graph=Command.PARENT, update=...)» to hand back when a question was out of scope. Each team owned and tested its own subgraph independently.`,
ex: `from langgraph.types import Command
def triage(state) -> Command:
    dept = classify(state["messages"][-1])
    return Command(update={"dept": dept}, goto=f"{dept}_agent")
payments_graph = build_payments_graph().compile()
g.add_node("payments_agent", payments_graph)       # subgraph as node`,
pit: [`Mixing Command goto and static edges confusingly from the same node.`, `Subgraphs with mismatched state keys.`, `Deeply nested graphs that are hard to debug.`],
q: [`What two things can a node do at once by returning Command?`, `Update state and choose the next node (goto).`]
},
"Long-term memory with the Store": {
d: `Checkpointers give **short-term memory** within a thread. The **Store** gives **long-term memory** across threads: a key-value store organised by **namespaces** (tuples like «("memories", user_id)»), with «put», «get», «search» and optional **semantic search** when configured with an embedding index. Implementations: in-memory, Postgres, Redis; LangGraph Platform provides one.

Nodes access it via the runtime («store» argument / «get_store()»). Typical uses: user preferences, facts learned across conversations, past decisions, few-shot examples collected over time. You decide **what to write** (explicit "remember this", background reflection) and **what to read** (semantic search on the current query).

Memory types often discussed: semantic (facts), episodic (past events/examples), procedural (updated instructions).`,
life: `Checkpointer = today's meeting notes for this conversation. Store = the CRM card for the customer, available in every future meeting.`,
work: `A merchant assistant remembered each merchant's preferred report format and settlement bank via the Store under «("prefs", merchant_id)». New conversations started personalised without re-asking; a "forget my preferences" action deleted the namespace for DPDP compliance.`,
ex: `from langgraph.store.postgres import PostgresStore
store = PostgresStore.from_conn_string(DB_URI, index={"embed": embed_fn, "dims": 1024})
app = g.compile(checkpointer=cp, store=store)
def personalise(state, *, store):
    ns = ("prefs", state["merchant_id"])
    hits = store.search(ns, query=state["messages"][-1].content, limit=3)
    return {"context": [h.value for h in hits]}
store.put(("prefs", "m_881"), "report_format", {"format": "xlsx"})`,
pit: [`Storing everything (noisy, privacy risk).`, `Namespaces not scoped per user/tenant.`, `No deletion path for user data.`],
q: [`Checkpointer vs Store: which persists across threads?`, `The Store; checkpoints are per thread.`]
}
});
