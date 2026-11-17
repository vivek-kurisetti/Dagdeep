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
