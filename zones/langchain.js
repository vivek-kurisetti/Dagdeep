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
