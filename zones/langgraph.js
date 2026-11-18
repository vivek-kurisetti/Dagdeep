QUEST.zone("langgraph", {
mission:["kai","v2 of the assistant needs loops, approvals and memory that survives restarts. That's LangGraph: agents as explicit state machines. Wire the graph, then pass the refund-approval boss."],
levels:[
{t:"State graphs", sub:"State, nodes, edges", rounds:[
 ["learn","Three ingredients","A **State** schema (TypedDict/Pydantic) shared by all nodes. **Nodes**: functions that take state and return a partial update. **Edges**: which node runs next, fixed or conditional. Compile, then invoke.",["Define State","Add nodes","Add edges from START to END","compile()","invoke / stream"]],
 ["fill","Wire a two-node graph",'from langgraph.graph import StateGraph, START, END\ng = ___(State)\ng.add_node("classify", classify)\ng.add_node("answer", answer)\ng.add_edge(___, "classify")\ng.add_edge("classify", "answer")\ng.add_edge("answer", ___)\napp = g.___()',["StateGraph","START","END","compile"],["Graph","BEGIN","STOP","build"],"Nodes return partial state updates."],
 ["learn","Nodes return updates, not state","A node returns only the keys it changes, e.g. «{'category': 'refund'}». LangGraph merges it into the shared state using each key's **reducer** (default: overwrite)."],
 ["pick","A node returns {'answer': 'ok'}. What happens to other state keys?",["They're deleted","They're kept unchanged","They're reset to defaults","The graph errors"],1,"Only returned keys are updated."],
 ["tf","Graph basics",[["LangGraph graphs can contain cycles.",true,"That's how agent loops work."],["You must call compile() before invoke().",true,"Compiling validates and builds the runnable."],["Every node must return the full state.",false,"Partial updates are the norm."]]]
]},
{t:"Reducers & routing", sub:"add_messages, conditional edges", rounds:[
 ["learn","Reducers merge updates","Annotate a key with a reducer: «messages: Annotated[list, add_messages]» appends (and updates by id) instead of overwriting. «Annotated[list, operator.add]» concatenates lists from parallel branches."],
 ["match","Key declaration → behaviour",[["count: int","Last write wins"],["messages: Annotated[list, add_messages]","Append/merge messages by id"],["results: Annotated[list, operator.add]","Concatenate lists from parallel nodes"],["MessagesState","Prebuilt state with a messages key"]],"Reducers matter most with parallel branches."],
 ["learn","Conditional edges","«add_conditional_edges('agent', route_fn, {...})»: a routing function reads state and returns the next node name (or END). The classic agent: if the last message has tool calls → 'tools', else → END."],
 ["bug","Which line breaks the agent loop?",["g.add_node('agent', call_model)","g.add_node('tools', ToolNode(tools))","g.add_conditional_edges('agent', tools_condition)","g.add_edge('tools', END)"],3,"After tools run, the result must go back to the agent: add_edge('tools', 'agent')."],
 ["learn","Fan-out with Send","«Send('summarise', {'doc': d})» from a conditional edge launches one node run per item in parallel (map-reduce). Results come back through a reducer like operator.add."],
 ["tf","Routing facts",[["Two parallel nodes writing the same key without a reducer can conflict.",true,"Add a reducer to merge them."],["tools_condition routes to END when the AI message has no tool calls.",true,"Prebuilt router."],["Command lets a node update state and choose the next node in one return.",true,"Command(update=..., goto=...)."]]]
]},
{t:"Persistence", sub:"Checkpointers, threads, memory", rounds:[
 ["learn","Checkpointers save every step","Compile with a **checkpointer** («InMemorySaver», «SqliteSaver», «PostgresSaver») and every super-step's state is saved under a «thread_id». Resume a conversation, survive restarts, inspect history and **time travel**."],
 ["fill","Remember a conversation",'from langgraph.checkpoint.postgres import PostgresSaver\napp = g.compile(___=PostgresSaver(conn))\nconfig = {"configurable": {"___": "merchant-42"}}\napp.invoke({"messages": [("user", "hi")]}, config)',["checkpointer","thread_id"],["memory","session","user_id"],"Same thread_id → same conversation state."],
 ["match","Memory type",[["Checkpointer (thread)","Short-term: this conversation's state"],["Store","Long-term: facts across threads (namespaced key-value, can be searchable)"],["get_state_history","Past checkpoints for replay or debugging"],["update_state","Edit state, then resume from there"]],"Threads for sessions, the Store for user-level memory."],
 ["pick","The service restarts mid-conversation. With PostgresSaver, the next message…",["Starts from scratch","Continues from the last checkpoint for that thread_id","Fails","Replays every tool call"],1,"Durable state per thread."],
 ["tf","Persistence facts",[["InMemorySaver is fine for production across replicas.",false,"Use a database-backed saver."],["Checkpoints enable human-in-the-loop pauses.",true,"The graph can stop and resume later."]]]
]},
{t:"Human in the loop", sub:"interrupt, Command, streaming", rounds:[
 ["learn","interrupt() pauses the graph","Inside a node, «interrupt(payload)» saves state and stops, returning the payload to the caller (e.g. 'approve refund of ₹12,000?'). Resume with «app.invoke(Command(resume=answer), config)»: the node re-runs and interrupt returns the answer."],
 ["order","Refund approval flow",["Agent decides a refund is needed","approve node calls interrupt({'amount': 12000})","Graph pauses; app shows an approval UI","Human approves; app sends Command(resume='approve')","Node continues and executes the refund"],"Needs a checkpointer and the same thread_id."],
 ["pick","After resuming, code before interrupt() in the node ran twice. Why?",["Bug in LangGraph","The node re-executes from its start on resume","Checkpointer missing","Wrong reducer"],1,"Keep side effects after the interrupt, or make them idempotent."],
 ["match","Stream mode",[["values","Full state after each step"],["updates","Only what each node changed"],["messages","LLM tokens as they're generated"],["custom","Anything you emit from inside nodes"]],"Pick what the UI needs."],
 ["tf","HITL facts",[["interrupt() needs a checkpointer.",true,"State must be saved to resume."],["Subgraphs can be used as nodes.",true,"Compose bigger systems from smaller graphs."]]]
]},
{t:"Boss: Refund approvals", boss:true, time:30, rounds:[
 ["pick","Agent never runs again after a tool executes. Fix?",["Edge from tools back to agent","More tools","Higher temperature","Remove END"],0,"Close the loop."],
 ["pick","Parallel retrieval nodes overwrite each other's results. Fix?",["Annotated[list, operator.add] reducer","Run them sequentially only","Bigger model","New thread_id"],0,"Merge with a reducer."],
 ["pick","Users lose context after every deploy. Fix?",["PostgresSaver checkpointer with stable thread_id","InMemorySaver","Longer prompts","Streaming"],0,"Durable checkpoints."],
 ["pick","Refunds over ₹10,000 need manager approval. Use…",["interrupt() + Command(resume=...)","A sleep loop","A second LLM","Retry policy"],0,"Pause and resume."],
 ["pick","Remember merchant preferences across all conversations. Use…",["The Store (long-term memory)","Checkpointer only","Bigger context","Reducers"],0,"Cross-thread memory."],
 ["pick","UI should show live tokens from the model node. Stream mode?",["messages","values","debug","updates only"],0,"Token streaming."]
]}
]});

QUEST.more("langgraph", [
{act:"Expert", t:"The Pregel runtime", sub:"Super-steps and channels", rounds:[
 ["learn","Super-steps","LangGraph executes graphs with a **Pregel / bulk-synchronous** model. In each **super-step**, all nodes triggered by the previous step run (in parallel), their writes are collected, **reducers** merge them into **channels** (state keys) at the end of the step, and that determines which nodes run next.",["Nodes triggered by updated channels","Run them in parallel","Collect their writes","Apply reducers at step end","Checkpoint, then next super-step"],null,`### Consequences
- Two nodes in the same super-step **can't see each other's writes**; they both read the state from the start of the step.
- Without a reducer, two parallel writes to the same key in one step raise an «InvalidUpdateError».
- A checkpoint is saved after each super-step, so resuming restarts at a step boundary.
- **Pending writes**: if one of several parallel nodes fails, the successful nodes' writes are stored with the checkpoint; on resume, only the failed node re-runs.

### Recursion limit
Each super-step counts toward the **recursion_limit** in the run config. Agent loops that never terminate hit it and raise «GraphRecursionError» — set it deliberately and design explicit exit conditions.

### Determinism and replay
Because state transitions happen at step boundaries and are checkpointed, you can **replay** from any checkpoint or **fork** with modified state — the basis for time travel and debugging.`],
 ["pick","Nodes A and B run in the same super-step. A writes {'x': 1}. What does B see for x during that step?",["1","The value from before the step","Undefined","B waits for A"],1,"Writes apply at the end of the super-step."],
 ["order","Life of one super-step",["Determine nodes triggered by last step's updates","Run them concurrently on the same state snapshot","Gather all writes","Apply reducers to update channels","Save a checkpoint"],"Bulk-synchronous execution."],
 ["pick","Of three parallel nodes, one fails. After fixing and resuming from the checkpoint, what re-runs?",["All three","Only the failed node (others' pending writes are kept)","The whole graph","Nothing"],1,"Pending writes make retries cheap."],
 ["tf","Runtime truths",[["Parallel nodes writing one key without a reducer raise an error.",true,"InvalidUpdateError."],["Each super-step counts toward recursion_limit.",true,"Endless loops hit it."]]]
]},
{act:"Expert", t:"Durable execution", sub:"Durability modes, tasks, side effects", rounds:[
 ["learn","Make long runs survive failures","With a checkpointer, LangGraph can resume a run after crashes, deploys or human pauses. **Durability modes** control when checkpoints are written: «exit» (only when the run ends/pauses — fastest), «async» (in the background during the next step), «sync» (before continuing — safest).",null,null,`### Side effects and replays
On resume, a node (or the code before an «interrupt()») may **run again**. Rules:
- Make side effects **idempotent** (idempotency keys for payments/emails).
- Or isolate them in **tasks**: in the **functional API**, «@task» functions' results are checkpointed, so on resume completed tasks return their saved result instead of re-executing.

~~~
from langgraph.func import entrypoint, task
@task
def issue_refund(payment_id, amount): ...      # result saved once it completes
@entrypoint(checkpointer=saver)
def refund_flow(req):
    ok = approve(req)                            # may interrupt for a human
    return issue_refund(req["payment_id"], req["amount"]).result()
~~~

### Retries and caching
- «RetryPolicy(max_attempts=3, retry_on=…)» per node for flaky APIs.
- **Node caching** («CachePolicy(ttl=…)») skips recomputing expensive deterministic nodes for the same input.

### Static breakpoints
«interrupt_before=["tools"]» / «interrupt_after» at compile or run time pause execution for debugging without changing node code.`],
 ["match","Mode / feature",[["durability='sync'","Checkpoint before moving on: safest"],["durability='exit'","Checkpoint only at the end or a pause: fastest"],["@task","Checkpointed unit of work in the functional API"],["RetryPolicy","Automatic retries for a node"],["interrupt_before","Static breakpoint for debugging"]],"Choose durability per workload."],
 ["pick","After resuming an approval flow, customers got two refund emails. Best fix?",["Make the email send idempotent or put it in a @task","Disable checkpointing","Use durability='exit'","More retries"],0,"Re-executed code must be safe to repeat."],
 ["sort","Safe to re-run on resume?",{"Safe":["Reading payment status","Idempotent upsert with a request id","LLM call whose output is regenerated"],"Unsafe unless guarded":["Sending an email","Charging a card","Posting to Slack"]},"Guard external side effects."],
 ["tf","Durability truths",[["Completed @task results are reused on resume.",true,"They're checkpointed."],["Code before interrupt() never re-runs on resume.",false,"The node restarts from its beginning."]]]
]},
{act:"Expert", t:"Advanced control flow", sub:"Command, Send, subgraphs", rounds:[
 ["learn","Command, Send and subgraphs","«Command(update=…, goto=…)» lets a node update state **and** choose the next node — great for agent handoffs. «Send(node, state)» from a conditional edge spawns a node run per item (map-reduce). **Subgraphs** are graphs used as nodes.",null,null,`### Handoffs between agents
In a multi-agent graph, an agent node returns «Command(goto="billing_agent", update={...})». From inside a subgraph, «Command(graph=Command.PARENT, goto="other_agent")» jumps to a node in the **parent** graph.

### Map-reduce with Send
~~~
def fan_out(state):
    return [Send("summarize", {"doc": d}) for d in state["docs"]]
g.add_conditional_edges("split", fan_out, ["summarize"])
# summarize writes to "summaries": Annotated[list, operator.add]
~~~
Each Send gets its **own input state**; outputs merge via the reducer.

### Subgraph state
- **Shared keys**: add the compiled subgraph directly as a node; overlapping keys pass through.
- **Different schema**: call the subgraph inside a node function and map state in/out.
- Subgraphs can have their own checkpointer namespace; interrupts inside them bubble up to the parent.

### Schemas
Define separate **input**, **output** and **private** state schemas so callers only see what they should and internal scratch keys stay hidden.`],
 ["fill","Hand off to another agent from a node",'from langgraph.types import Command\ndef triage(state):\n    if "refund" in state["messages"][-1].content:\n        return ___(goto="___", update={"topic": "refund"})\n    return Command(goto="faq_agent")',["Command","refund_agent"],["Send","END","Edge"],"Update and route in one return."],
 ["match","Construct",[["Command(goto=…)","Choose the next node from inside a node"],["Command.PARENT","Jump to a node in the parent graph"],["Send","One node run per item with its own input"],["Private state schema","Scratch keys hidden from callers"]],"Control flow beyond static edges."],
 ["pick","Summarize 40 documents in parallel then combine. Pattern?",["Send per document + operator.add reducer + combine node","40 static nodes","A for loop in one node","Subgraph per doc with no reducer"],0,"Map-reduce."],
 ["tf","Flow truths",[["Each Send can carry a different input state.",true,"That's the point."],["Interrupts inside subgraphs are invisible to the parent.",false,"They surface to the caller."]]]
]},
{act:"Expert", t:"Memory, time travel & deployment", sub:"Store, forking, double-texting", rounds:[
 ["learn","Long-term memory with the Store","The **Store** is a key-value store with **namespaces** (e.g. «('memories', user_id)»), shared across threads. With an embedding index configured, «store.search(namespace, query=…)» does **semantic search** over memories.",null,null,`### Memory patterns
- **Semantic**: facts about the user ("prefers Hindi replies").
- **Episodic**: past successful interactions as few-shot examples.
- **Procedural**: updated instructions/prompts the agent refines over time.
Write memories in the **hot path** (agent decides during the conversation) or in the **background** (a separate process extracts memories after the conversation).

### Time travel
«graph.get_state_history(config)» lists checkpoints. To fork: «update_state(config_with_checkpoint_id, values)» creates a new checkpoint branching from an old one, then «invoke(None, new_config)» resumes from there — debug "what if the tool had returned X?".

### Deployment (Agent Server)
Deployed graphs expose **assistants** (configured graphs), **threads** (persistent conversations), and **runs** (executions, streaming or background), plus cron jobs and a Store. **Double-texting** strategies decide what happens when a user sends a new message while a run is in progress: «reject», «enqueue», «interrupt» (stop current, keep progress) or «rollback» (stop and discard).`],
 ["match","Double-texting strategy",[["reject","Refuse the new message while a run is active"],["enqueue","Run the new message after the current one"],["interrupt","Stop the current run, keep its progress, start new"],["rollback","Stop and discard the current run, start new"]],"Pick by UX."],
 ["order","Fork a conversation to test a different tool result",["List checkpoints with get_state_history","Pick the checkpoint before the tool call","update_state with a modified tool result","Invoke with None from the new checkpoint","Compare the new branch's outcome"],"Time travel for debugging."],
 ["pick","An assistant should remember a merchant's language preference in all future threads. Store it in…",["The Store under the merchant's namespace","The thread's checkpoint only","A global variable","The system prompt file"],0,"Cross-thread memory."],
 ["tf","Memory truths",[["The Store can do semantic search over memories when indexed.",true,"Embedding-backed search."],["Forking from an old checkpoint deletes newer ones.",false,"It creates a new branch."]]]
]},
{act:"Expert", t:"Expert boss: Production LangGraph", boss:true, time:45, rounds:[
 ["pick","Parallel retrievers throw InvalidUpdateError. Fix?",["Reducer on the shared key","Run sequentially","Raise recursion_limit","New thread"],0,"Merge parallel writes."],
 ["pick","An agent loop ends with GraphRecursionError. Fix first?",["Add explicit stop conditions and tool-call limits","Raise the limit to 10,000","Remove checkpointer","Use Send"],0,"Design termination."],
 ["pick","Approval resume caused a duplicate payment. Fix?",["Idempotency key or @task around the payment","durability='exit'","Bigger model","Retry policy"],0,"Guard side effects."],
 ["pick","Supervisor must route to billing agent from inside a subgraph. Use…",["Command(graph=Command.PARENT, goto=…)","Send","A static edge","interrupt"],0,"Cross-graph handoff."],
 ["pick","Users double-send messages while the agent runs, causing chaos. Configure…",["Double-texting strategy (e.g. interrupt or enqueue)","More workers","Shorter prompts","recursion_limit"],0,"Defined behaviour for concurrent input."],
 ["pick","Need 'what if the tool had returned an error?' debugging. Use…",["Fork from a checkpoint with update_state","Re-run from scratch","Store search","Send"],0,"Time travel."],
 ["pick","Throughput matters more than crash safety for a cheap summarization graph. Durability?",["exit","sync","async with retries off","No checkpointer ever"],0,"Fewest checkpoint writes."]
]}
]);
