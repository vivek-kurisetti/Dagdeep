QUEST.zone("langchain", {
mission:["kai","We'll build the first version of the assistant with LangChain: prompts, models, tools and retrievers snapped together. Learn the building blocks and how they compose."],
levels:[
{t:"Runnables & LCEL", sub:"Composable pieces", rounds:[
 ["learn","Everything is a Runnable","Prompts, chat models, parsers, retrievers and tools implement the **Runnable** interface: «invoke», «batch», «stream» and async variants. The **pipe operator** «|» chains them (LangChain Expression Language).",["prompt","| model","| parser","invoke / stream / batch"]],
 ["fill","A simple chain",'from langchain_core.prompts import ChatPromptTemplate\nfrom langchain_core.output_parsers import StrOutputParser\nprompt = ChatPromptTemplate.from_messages([("system", "You are a payments expert."), ("human", "{question}")])\nchain = prompt ___ llm ___ StrOutputParser()\nchain.___({"question": "What is a chargeback?"})',["|","|","invoke"],["+","run","call"],"The pipe connects runnables left to right."],
 ["match","Runnable method",[["invoke","One input, one output"],["batch","Many inputs in parallel"],["stream","Yield tokens/chunks as they arrive"],["ainvoke","Async single call"]],"Same interface for every component."],
 ["learn","Parallel and passthrough","«RunnableParallel» runs branches on the same input and returns a dict; «RunnablePassthrough» forwards input unchanged. Classic RAG: «{'context': retriever | format_docs, 'question': RunnablePassthrough()} | prompt | llm»."],
 ["tf","LCEL facts",[["A dict in a chain is coerced to RunnableParallel.",true,"Each value runs on the input."],["You must write separate code to stream a chain.",false,"stream() works on any chain."],["with_retry and with_fallbacks wrap any runnable.",true,"Resilience without custom loops."]]]
]},
{t:"Models & output", sub:"Chat models, structured output", rounds:[
 ["learn","Chat models are swappable","Provider packages («langchain-anthropic», «langchain-openai»…) expose the same chat model interface; «init_chat_model('provider:model')» picks one by string. Messages: System, Human, AI, Tool."],
 ["learn","with_structured_output","«llm.with_structured_output(MySchema)» returns validated Pydantic objects (or dicts) using the provider's native structured output or tool calling under the hood."],
 ["fill","Extract a typed object",'class Refund(BaseModel):\n    payment_id: str\n    amount: float\n    reason: str\nextractor = llm.___(Refund)\nrefund = extractor.invoke(email_text)',["with_structured_output"],["bind_tools","parse_json","as_tool"],"Returns a Refund instance."],
 ["pick","Why prefer with_structured_output over 'please reply in JSON'?",["It's shorter","It uses schema-constrained generation/tool calling and validates the result","It's free","It disables streaming"],1,"Reliable parsing."],
 ["match","Message type",[["SystemMessage","Instructions and role"],["HumanMessage","User input"],["AIMessage","Model output, may include tool_calls"],["ToolMessage","Result of a tool call, linked by tool_call_id"]],"Tool loops depend on the ids matching."]
]},
{t:"Tools & agents", sub:"@tool, bind_tools, create_agent", rounds:[
 ["learn","Define tools","Decorate a function with «@tool»: the name, docstring and type hints become the tool schema. «llm.bind_tools([t1, t2])» lets the model emit tool calls; you (or an agent) execute them."],
 ["fill","A tool the model can call",'from langchain_core.tools import tool\n@___\ndef get_payment_status(payment_id: str) -> str:\n    """___"""\n    return db.status(payment_id)\nllm_with_tools = llm.___([get_payment_status])',["tool","Look up the current status of a payment by its id.","bind_tools"],["agent","TODO","with_structured_output"],"The docstring is the tool description."],
 ["learn","Agents in LangChain 1.x","«create_agent(model, tools, system_prompt=…)» builds a tool-calling agent loop **on top of LangGraph**: call model → run tools → repeat until the model answers. Middleware hooks add things like summarisation or human approval."],
 ["order","What create_agent does each step",["Send messages + tool schemas to the model","Model returns tool calls (or a final answer)","Execute the requested tools","Append ToolMessages to the state","Loop until no more tool calls"],"It's a small graph under the hood."],
 ["tf","Tool facts",[["The function docstring becomes the tool description.",true,"Write it for the model."],["bind_tools executes the tools automatically.",false,"It only lets the model request them."],["Old AgentExecutor is the recommended path for new apps.",false,"Use create_agent / LangGraph."]]]
]},
{t:"Retrieval & memory", sub:"Loaders, splitters, stores", rounds:[
 ["learn","Retrieval components","**Document loaders** read sources, **text splitters** chunk («RecursiveCharacterTextSplitter»), **embeddings** vectorise, **vector stores** save and search, and «.as_retriever()» turns a store into a Runnable."],
 ["order","Build a retriever",["Load documents with a loader","Split with RecursiveCharacterTextSplitter","Embed and add to a vector store","vectorstore.as_retriever(search_kwargs={'k': 5})"],"Then pipe it into a RAG chain."],
 ["match","Component → package role",[["langchain-core","Base interfaces and LCEL"],["langchain","Agents and high-level chains"],["langchain-community","Many third-party integrations"],["langchain-anthropic / -openai","Provider-specific models"]],"Install only what you use."],
 ["learn","Conversation memory","Chains are stateless; keep history yourself or use LangGraph's checkpointer with a «thread_id». Trim or summarise history to fit the context window."],
 ["pick","Which splitter is the usual default for prose?",["RecursiveCharacterTextSplitter","CharacterTextSplitter with no overlap","One chunk per document","Split every 10 characters"],0,"It tries paragraph, then sentence, then word boundaries."]
]},
{t:"Boss: Ship v1", boss:true, time:30, rounds:[
 ["pick","Parsing JSON from free text keeps failing. Use…",["with_structured_output(PydanticModel)","Regex","Higher temperature","StrOutputParser"],0,"Validated objects."],
 ["pick","Provider has an outage; you need a backup model automatically. Use…",["with_fallbacks([backup_llm])","A new chain","RunnablePassthrough","bind_tools"],0,"Fallbacks wrap any runnable."],
 ["pick","The model never calls your tool. Most likely?",["Vague tool name/docstring","Too many tokens","Streaming is on","Temperature 0"],0,"Descriptions drive tool choice."],
 ["pick","You need a tool-calling agent for v1. Use…",["create_agent (built on LangGraph)","AgentExecutor from 2023","A for loop with regex","RunnableParallel"],0,"Current recommended path."],
 ["pick","UI should show tokens as they're generated. Use…",["chain.stream()","chain.batch()","invoke twice","with_retry"],0,"Streaming."],
 ["pick","RAG chain needs both context and the question in the prompt. Use…",["{'context': retriever | fmt, 'question': RunnablePassthrough()}","Two separate chains","with_structured_output","bind_tools"],0,"Parallel map into the prompt."]
]}
]});

QUEST.more("langchain", [
{act:"Expert", t:"Runnable internals", sub:"Config, branching, events", rounds:[
 ["learn","RunnableConfig travels with every call","Every runnable accepts a **config**: «callbacks», «tags», «metadata», «run_name», «max_concurrency», «recursion_limit» and «configurable» values. It propagates to child runnables automatically, which is how tracing and per-request settings flow through a chain.",null,null,`### Composition primitives
- «RunnableLambda(fn)»: wrap any function; gets the config if it accepts one.
- «RunnableBranch((cond, runnable), …, default)» or a router function returning a runnable.
- «.bind(stop=[…])»: fix call arguments (e.g. tools, stop sequences).
- «.with_config(run_name="classify", tags=["v7"])»: label for tracing.
- «.configurable_fields(temperature=ConfigurableField(id="temp"))» and «.configurable_alternatives(...)»: swap model settings or whole models per call via «config={"configurable": {...}}».
- «.with_retry(stop_after_attempt=3)» and «.with_fallbacks([...])».

### Streaming internals
- «stream()» yields output chunks of the final step.
- «astream_events(version="v2")» yields **events from every step**: «on_chat_model_stream» tokens, «on_tool_start/end», «on_retriever_end», with names and tags — for UIs that show intermediate progress.

### Batching
«batch(inputs, config={"max_concurrency": 5})» runs in parallel threads/tasks with a cap — essential with rate limits. Combine with an «InMemoryRateLimiter» on the chat model.`],
 ["match","Primitive",[["RunnableLambda","Wrap a Python function as a runnable"],["RunnableBranch","Choose a runnable by condition"],["configurable_alternatives","Swap models per request via config"],["astream_events","Stream events from every step"],["with_config(tags=...)","Label runs for tracing"]],"LCEL is more than the pipe."],
 ["fill","Swap the model per request",'llm = ChatAnthropic(model="claude-haiku").configurable_alternatives(\n    ConfigurableField(id="___"), default_key="fast",\n    smart=ChatAnthropic(model="claude-opus"))\nchain = prompt | llm\nchain.invoke(q, config={"___": {"llm": "smart"}})',["llm","configurable"],["model","metadata","tags"],"Route hard requests to a bigger model without rebuilding chains."],
 ["pick","A UI must show 'searching docs…' then stream tokens. Use…",["astream_events(version='v2')","batch()","invoke() twice","with_retry"],0,"Events from intermediate steps."],
 ["tf","Runnable truths",[["Config like tags and callbacks propagates to child runnables.",true,"That's how traces nest."],["batch() ignores rate limits automatically.",false,"Set max_concurrency and/or a rate limiter."]]]
]},
{act:"Expert", t:"Tool calling deep", sub:"Schemas, errors, hidden args", rounds:[
 ["learn","Tools as typed contracts","A tool's **name, description and args schema** (from type hints, docstrings or a Pydantic model) are sent to the model. The model returns «tool_calls» with ids; each result goes back as a «ToolMessage» with the matching «tool_call_id».",null,null,`### Details that matter
- **Parallel tool calls**: a single AIMessage can contain several tool calls; execute them (concurrently if safe) and return one ToolMessage per id.
- **Errors**: return a helpful error string as the tool result (or set «handle_tool_error») so the model can correct its call, instead of crashing the loop.
- **Hidden / injected arguments**: things like «user_id», DB sessions or the runtime context shouldn't be chosen by the model. Use injected args («InjectedToolArg», or the tool runtime/context in agents) so they're filled by your code, never visible in the schema — critical for **authorization**.
- **Artifacts**: «response_format="content_and_artifact"» returns a short text for the model and a full object (e.g. a dataframe) for your app.
- **return_direct**: end the loop with the tool's output.

### Structured output strategies in agents
«create_agent(..., response_format=Schema)» uses the provider's native structured output when available, otherwise a tool-calling strategy, and validates the final answer against the schema.`],
 ["bug","Which tool signature creates an authorization hole?",["def get_balance(merchant_id: str, runtime_user = injected) -> str","def refund(payment_id: str, amount_paise: int) -> str","def get_statement(user_id: str, month: str) -> str  # model chooses user_id","def search_docs(query: str) -> list"],2,"The model (or an injected prompt) can pick any user_id. Inject the caller's identity from your code instead."],
 ["order","Handling a parallel tool-call response",["AIMessage arrives with 3 tool_calls","Validate each call's arguments","Execute independent calls concurrently","Append one ToolMessage per tool_call_id","Call the model again with all results"],"Ids must match one-to-one."],
 ["pick","The model passes an invalid date and your tool raises an exception that kills the request. Better?",["Return a clear error message as the tool result so the model can retry","Catch and return nothing","Lower temperature","Remove the tool"],0,"Actionable errors let agents self-correct."],
 ["tf","Tool truths",[["Injected tool args appear in the schema the model sees.",false,"They're hidden and filled by your code."],["One AI message can request several tools at once.",true,"Parallel tool calls."]]]
]},
{act:"Expert", t:"Agents with middleware", sub:"create_agent hooks", rounds:[
 ["learn","Middleware shapes the agent loop","In LangChain 1.x, «create_agent» runs a model ↔ tools loop (built on LangGraph) and lets you plug **middleware** into it: hooks before/after the agent, before/after each model call, and wrappers around model calls and tool calls.",null,null,`### Hook points
- «before_agent» / «after_agent»: once per invocation (load memory, final logging).
- «before_model» / «after_model»: around every model call (trim/summarize history, check outputs, jump to end).
- «wrap_model_call»: wrap the call itself — change model, tools or prompt dynamically, retry, fallback.
- «wrap_tool_call»: wrap each tool execution — approvals, retries, caching, error shaping.

### Built-in middleware (examples)
- **Summarization**: compresses old messages near a token limit.
- **Human-in-the-loop**: pauses before selected tools for approve/edit/reject (uses LangGraph interrupts + a checkpointer).
- **PII** redaction/masking on inputs and outputs.
- **Model fallback**, **model/tool call limits**, **tool retry**.

### Dynamic behaviour
Middleware can select a cheaper model for simple turns, filter which tools are visible based on user role, or inject retrieved context into the system prompt — without rewriting the agent loop.`],
 ["match","Hook → good use",[["before_model","Summarize long history before each call"],["wrap_model_call","Switch to a bigger model for complex turns"],["wrap_tool_call","Require approval before refund tool runs"],["after_model","Block responses containing PII"],["before_agent","Load user preferences once per run"]],"Put cross-cutting logic in middleware."],
 ["pick","Only admins should see the delete_merchant tool. Cleanest place?",["Middleware that filters tools by user role before the model call","Tell the model in the prompt","Remove the tool for everyone","A separate prompt per user"],0,"Enforce visibility in code."],
 ["sort","Middleware or tool code?",{"Middleware":["Call limits across the whole run","Summarizing history","Approval gate for several risky tools"],"Tool code":["Validate refund amount ≤ captured amount","Query the payments DB"]},"Cross-cutting vs domain logic."],
 ["tf","Agent truths",[["Human-in-the-loop middleware needs a checkpointer to pause and resume.",true,"Built on interrupts."],["create_agent is built on LangGraph.",true,"So persistence and streaming come with it."]]]
]},
{act:"Expert", t:"Retrieval & indexing deep", sub:"Retrievers, indexing API", rounds:[
 ["learn","Retriever building blocks","LangChain ships retriever patterns you can compose: **EnsembleRetriever** (weighted RRF across retrievers, e.g. BM25 + vector), **MultiQueryRetriever** (LLM rephrasings), **ParentDocumentRetriever** (small chunks for search, parents for context), **ContextualCompressionRetriever** (rerank/filter results with a compressor such as a cross-encoder).",null,null,`### The indexing API
Syncing documents into a vector store naively creates duplicates and never deletes stale chunks. The **indexing API** uses a **RecordManager** (SQL table of document hashes and source ids) to:
- skip unchanged documents (content hash),
- upsert changed ones,
- delete chunks of documents that disappeared (cleanup modes: «incremental» deletes old versions of re-indexed sources; «full» deletes everything not in the current batch; «scoped_full» per source).

~~~
from langchain.indexes import SQLRecordManager, index
rm = SQLRecordManager("pg/policies", db_url=DB_URL); rm.create_schema()
index(docs, rm, vectorstore, cleanup="incremental", source_id_key="source")
~~~

### Loaders at scale
Use «lazy_load()» to stream documents instead of loading everything into memory; attach metadata (source, updated_at, acl) at load time so retrieval filters work later.`],
 ["match","Retriever",[["EnsembleRetriever","Fuse BM25 and vector results"],["ParentDocumentRetriever","Search small chunks, return parents"],["ContextualCompressionRetriever","Rerank or trim retrieved docs"],["MultiQueryRetriever","Generate rephrasings for recall"]],"Compose instead of rewriting."],
 ["pick","Re-running ingestion doubles chunks in the vector store each night. Fix?",["Indexing API with a RecordManager and cleanup mode","Delete the store nightly","Bigger chunks","Ensemble retriever"],0,"Hash-based dedup and cleanup."],
 ["fill","Hybrid retriever",'from langchain.retrievers import EnsembleRetriever\nhybrid = ___(retrievers=[bm25, vector_store.as_retriever(search_kwargs={"k": 20})],\n                       ___=[0.4, 0.6])',["EnsembleRetriever","weights"],["MultiQueryRetriever","scores","ratio"],"Weighted RRF over both lists."],
 ["tf","Indexing truths",[["Cleanup mode 'full' can delete documents missing from the current batch.",true,"Use carefully with partial loads."],["lazy_load reads everything into memory first.",false,"It streams documents."]]]
]},
{act:"Expert", t:"Expert boss: LangChain in production", boss:true, time:45, rounds:[
 ["pick","Requests from one tenant can fetch another tenant's statements via a tool arg. Fix?",["Injected identity from code, not model-chosen args","Prompt warning","Lower temperature","More tools"],0,"Authorization in code."],
 ["pick","Batch job hits provider 429s. Fix?",["max_concurrency + rate limiter + with_retry","More threads","Bigger batches","Disable tracing"],0,"Respect limits."],
 ["pick","Need per-request choice between a fast and a strong model. Use…",["configurable_alternatives","Two separate apps","RunnableParallel","bind_tools"],0,"Config-driven swaps."],
 ["pick","Refund tool must pause for approval in a create_agent agent. Use…",["Human-in-the-loop middleware + checkpointer","A sleep in the tool","A second agent","Prompt only"],0,"Interrupt-based approvals."],
 ["pick","Vector store keeps stale policy chunks. Fix?",["Indexing API with RecordManager cleanup","Restart the store","More k","Reranker"],0,"Sync deletions."],
 ["pick","Tool exceptions crash conversations. Better?",["Return actionable errors as tool results","Hide errors","Retry forever","Remove validation"],0,"Let the model self-correct."],
 ["pick","UI needs tool progress and tokens. Use…",["astream_events v2","invoke","batch","with_fallbacks"],0,"Events from every step."]
]}
]);

QUEST.story("langchain", {title:"The JSON that wasn't", icon:"🧩", place:"Mon 2 PM · invoice extraction", setup:"A LangChain pipeline extracts invoice fields for finance. 9% of runs crash on bad JSON, and a vendor change broke everything twice.",
 meters:[["fail","Failed runs","%",9,0.5,"low",15],["lock","Vendor lock-in","%",80,20,"low",100],["trust","Finance trust","%",45,70,"high",100]],
 beats:[["arjun","The invoice bot failed 400 times this week. Finance is typing them by hand."],["ui","prompt | llm | StrOutputParser() | json.loads\nJSONDecodeError: Expecting ',' delimiter: line 7 column 3"],
  ["q","What's the most reliable way to get structured output?",[["Use structured output: llm.with_structured_output(Invoice) with a Pydantic schema (tool/JSON-schema mode)",1,"The provider enforces the schema; LangChain validates into a typed object.","A form with boxes instead of a blank page."],["Add 'ONLY RETURN JSON' in caps to the prompt",0.5,"Helps a bit; still free text.","Asking nicely for neat handwriting."],["Regex the JSON out",0,"Brittle.","Guessing what the scribble says."]]],
  ["q","Some invoices still fail validation. What next?",[["Add retries with the validation error fed back (or an output-fixing step), and route persistent failures to a human queue",1,"Self-correction handles most; humans handle the rest.","Sending a form back with the wrong box highlighted."],["Ignore failed invoices",0,"Finance loses data.","Binning forms that are hard to read."]]],
  ["q","How do you avoid breaking when switching model vendors?",[["Use LangChain's chat model interface (init_chat_model / provider classes) and keep prompts, schemas and evals provider-agnostic",1,"Swap providers by config, verify with the same eval set.","Standard plugs instead of a custom wire."],["Write directly to one vendor's SDK everywhere",0,"Lock-in.","Hard-wiring the lamp."]]],
  ["arjun","0.3% failures, and they land in a review queue. Finance stopped typing."]],
 learned:["Structured output with schemas beats parsing text.","Retry with validation errors; human fallback.","Abstractions + evals make vendor swaps safe."]});
QUEST.mock("langchain", {title:"LangChain round", who:"farah", intro:"Farah here. Let's talk building LLM apps with LangChain.", setup:"Farah's team builds internal AI tools.",
 qs:[["What is LCEL and why use it?","**LangChain Expression Language**: compose Runnables with «|» (prompt | model | parser). Every chain gets «invoke/batch/stream/ainvoke», parallelism («RunnableParallel»), fallbacks, retries and tracing for free.",[["Composable Runnables with a uniform interface for invoke/batch/stream, plus parallelism, fallbacks and tracing",1,"Accurate."],["A new programming language",0,"It's Python/JS composition."],["Only for prompts",0,"Whole pipelines."]]],
  ["How do you add memory to a chatbot?","Keep message history per session (e.g. «RunnableWithMessageHistory» or LangGraph checkpointer), trim or summarise to fit context, and store long-term facts separately (a store or vector memory) with the user's consent.",[["Per-session history with trimming/summaries; long-term facts in a separate store",1,"Practical."],["The model remembers automatically",0,"Stateless."],["Send all history forever",0.5,"Breaks context limits and cost."]]],
  ["How do you make a chain resilient to provider outages?","«with_fallbacks» to another model, retries with backoff («with_retry»), timeouts, and circuit breaking at the gateway; monitor error rates.",[["Fallback models, retries with backoff, timeouts, monitoring",1,"Good."],["Hope",0,"No."],["Catch and return empty strings",0,"Silent failure."]]],
  ["When would you move from a chain to LangGraph?","When you need **loops**, branching on state, multiple agents, human-in-the-loop interrupts, or durable state/persistence. Simple linear pipelines stay as chains.",[["For loops, branching, multi-agent, interrupts and persistence; chains for linear flows",1,"Right boundary."],["Always LangGraph",0.5,"Overkill for simple flows."],["Never",0,"Agents need it."]]]],
 learned:["LCEL: composable runnables.","Structured output, fallbacks, retries.","Chains for linear; LangGraph for stateful."]});
