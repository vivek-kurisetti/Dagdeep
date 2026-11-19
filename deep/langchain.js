QUEST.deep("langchain", {
"Everything is a Runnable": {
d: `LangChain's core abstraction is the **Runnable**: anything with «invoke(input)», «batch(inputs)», «stream(input)» and async versions («ainvoke», «abatch», «astream»). Prompts, chat models, output parsers, retrievers, tools and your own functions («RunnableLambda») all implement it.

Runnables compose with the **pipe operator** (LCEL): «prompt | model | parser» creates a «RunnableSequence» whose output of each step feeds the next. You get for free: streaming through the chain, batching with concurrency, retries («.with_retry()»), fallbacks («.with_fallbacks([...])»), configurable fields, and tracing in LangSmith.

For multi-step logic with loops, state and branching, LangChain 1.x pushes you to **LangGraph**; LCEL stays great for straight pipelines.`,
life: `LEGO bricks with the same studs: any brick connects to any other, and the finished model behaves like one piece.`,
work: `A team had hand-written glue code for prompt formatting, model calls, JSON parsing and retries in five services. Rewriting as «prompt | llm.with_retry(stop_after_attempt=3) | parser» chains standardised behaviour, gave streaming for the UI, and made every step visible in LangSmith traces.`,
ex: `from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain.chat_models import init_chat_model
prompt = ChatPromptTemplate.from_messages([
    ("system", "Summarise payment incidents for executives in 3 bullets."),
    ("user", "{incident}")])
llm = init_chat_model("anthropic:claude-sonnet-4-5", temperature=0)
chain = prompt | llm | StrOutputParser()
print(chain.invoke({"incident": text}))
for chunk in chain.stream({"incident": text}): print(chunk, end="")
chain.batch([{"incident": a}, {"incident": b}], config={"max_concurrency": 4})`,
pit: [`Building complex agents with long LCEL chains instead of LangGraph.`, `Calling invoke in loops instead of batch.`, `Swallowing exceptions inside RunnableLambda.`],
q: [`What does «prompt | model | parser» create?`, `A RunnableSequence: one Runnable whose invoke runs each step, passing outputs along.`]
},
"Parallel and passthrough": {
d: `- «RunnableParallel({"a": r1, "b": r2})» (or a dict literal inside a chain) runs each branch on the **same input** concurrently and returns «{"a": ..., "b": ...}».
- «RunnablePassthrough()» passes its input through unchanged; «RunnablePassthrough.assign(key=runnable)» adds a computed key to the input dict.
- «itemgetter("question")» picks a field.

Classic RAG chain:
«{"context": retriever | format_docs, "question": RunnablePassthrough()} | prompt | llm | parser»
The question goes to the retriever and, unchanged, to the prompt. Parallel branches cut latency when several independent lookups (retrievers, APIs) are needed.`,
life: `Sending the same customer form to two departments at once (parallel) while keeping a photocopy of the original to attach to the final reply (passthrough).`,
work: `A merchant Q&A chain needed docs retrieval, the merchant's live settlement status and FAQ snippets. Running them sequentially took 2.4 s; a RunnableParallel with three branches took 0.9 s before the LLM call.`,
ex: `from operator import itemgetter
from langchain_core.runnables import RunnableParallel, RunnablePassthrough
gather = RunnableParallel(
    docs=itemgetter("q") | retriever | format_docs,
    status=itemgetter("merchant_id") | RunnableLambda(get_status),
    q=itemgetter("q"))
chain = gather | prompt | llm | StrOutputParser()
chain.invoke({"q": "Why is my settlement late?", "merchant_id": "m_881"})`,
pit: [`Sequential calls where branches are independent.`, `Passing the wrong type into the next step (dict vs string).`, `Forgetting rate limits when parallelising.`],
q: [`In the RAG chain, why wrap the question in RunnablePassthrough?`, `So the original question goes unchanged into the prompt while also being sent to the retriever.`]
},
"Chat models are swappable": {
d: `Each provider has an integration package («langchain-anthropic», «langchain-openai», «langchain-google-genai», «langchain-aws», «langchain-ollama»...) implementing the same **BaseChatModel** interface: messages in («SystemMessage», «HumanMessage», «AIMessage», «ToolMessage»), an «AIMessage» out with «content», «tool_calls» and «usage_metadata».

«init_chat_model("anthropic:claude-sonnet-4-5")» picks the provider from a string, so model choice can live in config. You can make the model **configurable at runtime** and add **fallbacks** («primary.with_fallbacks([backup])») for outages or rate limits.

"Swappable" still needs evaluation: prompts tuned for one model may behave differently on another; tool-calling and structured output support vary. Run your eval dataset before switching.`,
life: `Different car brands with the same pedals and steering wheel: you can drive any of them, but each handles a bit differently, so test-drive before a road trip.`,
work: `During a provider outage, a support assistant failed completely. Adding «with_fallbacks» to a second provider kept it running at slightly lower quality. Separately, a cost review switched routine classification to a smaller model via config change after it matched accuracy on the eval set.`,
ex: `from langchain.chat_models import init_chat_model
primary = init_chat_model("anthropic:claude-sonnet-4-5", temperature=0, max_retries=2)
backup  = init_chat_model("openai:gpt-4.1-mini", temperature=0)
llm = primary.with_fallbacks([backup])
msg = llm.invoke([("system", "Be concise."), ("user", "Explain T+1 settlement.")])
print(msg.content, msg.usage_metadata)`,
pit: [`Switching models without re-running evals.`, `Provider-specific parameters breaking portability.`, `No fallback for critical paths.`],
q: [`Does a common interface mean the same prompt works equally well on every model?`, `No; behaviour differs between models, so evaluate before swapping.`]
},
"with_structured_output": {
d: `«llm.with_structured_output(Schema)» returns a Runnable that outputs a **parsed, validated object** (Pydantic instance, TypedDict/JSON schema dict) instead of free text. Under the hood it uses the provider's best mechanism: native **structured outputs / JSON schema mode** or **tool calling** with your schema as the tool's input.

Options: «method="json_schema" | "function_calling" | "json_mode"», «include_raw=True» to get the raw message and parsing errors instead of an exception (useful for retries/logging), «strict=True» where supported.

Write field **descriptions** in the schema: they become instructions to the model. Validate business rules in code afterwards (Pydantic validators).`,
life: `Handing someone a form with labelled boxes and dropdowns instead of a blank sheet: you always get the fields you need, in the right format.`,
work: `An invoice-extraction service parsed JSON from free text with regex and failed on 4% of invoices. «with_structured_output(Invoice, include_raw=True)» cut failures to 0.2%; the remaining ones were retried once with the parsing error appended, and logged with the raw output for review.`,
ex: `from pydantic import BaseModel, Field, field_validator
class Invoice(BaseModel):
    vendor_gstin: str = Field(description="15-char GSTIN")
    total_inr: float = Field(description="Grand total in rupees", ge=0)
    due_date: str = Field(description="YYYY-MM-DD")
    @field_validator("vendor_gstin")
    def gstin_len(cls, v): assert len(v) == 15; return v
extract = llm.with_structured_output(Invoice, include_raw=True)
r = extract.invoke(f"Extract fields:\\n{invoice_text}")
inv, err = r["parsed"], r["parsing_error"]`,
pit: [`No field descriptions.`, `Assuming validity means correctness.`, `Huge nested schemas for simple tasks.`],
q: [`What does include_raw=True give you?`, `The raw model message plus the parsed object and any parsing error, so you can handle failures without exceptions.`]
},
"Define tools": {
d: `«@tool» turns a Python function into a tool: the **function name** becomes the tool name, the **docstring** the description, and **type hints** (or an «args_schema» Pydantic model) the JSON schema. «llm.bind_tools([t1, t2])» sends those schemas with each request; the model may reply with «AIMessage.tool_calls» («name», «args», «id»).

Your code (or a «ToolNode» / agent) executes the tool and returns a «ToolMessage(content, tool_call_id)», then calls the model again. Extras:
- «tool_choice» to force a specific tool or "any".
- «InjectedToolArg» / runtime injection for values the model must **not** control (user id, DB session).
- «return_direct», «response_format="content_and_artifact"» to return large artifacts without putting them all in the model context.
- Raise «ToolException» / return helpful error text so the model can recover.`,
life: `Listing services on a menu with clear descriptions; the customer (model) orders "service X with these options", and the kitchen (your code) prepares it and sends back the result.`,
work: `A tool «get_settlements(merchant_id, date)» let the model pass any merchant_id; a crafted message got another merchant's data in testing. Marking «merchant_id» as an injected argument filled from the session (hidden from the model's schema) closed the hole.`,
ex: `from typing import Annotated
from langchain_core.tools import tool, InjectedToolArg
@tool
def get_settlements(date: str, merchant_id: Annotated[str, InjectedToolArg]) -> list[dict]:
    """Settlements for the logged-in merchant on a date (YYYY-MM-DD). Amounts in INR."""
    return api.settlements(merchant_id, date)
llm_t = llm.bind_tools([get_settlements])
ai = llm_t.invoke("What was settled on 2026-11-18?")
for call in ai.tool_calls:
    out = get_settlements.invoke({**call["args"], "merchant_id": session.mid})`,
pit: [`Letting the model supply identity/authorization arguments.`, `Vague docstrings.`, `Returning huge outputs into the context.`],
q: [`Where does a @tool's description come from?`, `The function's docstring (and argument descriptions from type hints / schema).`]
},
"Agents in LangChain 1.x": {
d: `LangChain 1.x standardises agents on «create_agent(model, tools, system_prompt=..., ...)» (in «langchain.agents»). It builds a **LangGraph** graph: call the model → if tool calls, execute tools → append results → call the model again → stop when the model answers without tool calls (or a limit hits).

Because it's LangGraph underneath, you get: **checkpointers** (memory per thread_id), **streaming** of steps and tokens, **human-in-the-loop** interrupts, **structured final output** («response_format=Schema»), and **middleware** to customise the loop (summarisation, PII redaction, approvals, model/tool call limits, dynamic model selection).

Older APIs («AgentExecutor», «initialize_agent») are legacy; prefer create_agent, or a custom LangGraph when you need full control.`,
life: `A ready-made kitchen workflow (take order → cook → taste → adjust → serve) you can customise with house rules, instead of designing the kitchen from scratch.`,
work: `A legacy AgentExecutor-based bot had no persistence; conversations broke on pod restarts. Migrating to «create_agent» with a Postgres checkpointer gave per-user threads, and «HumanInTheLoopMiddleware» added approval for the «issue_refund» tool with minimal code.`,
ex: `from langchain.agents import create_agent
from langchain.agents.middleware import HumanInTheLoopMiddleware
from langgraph.checkpoint.postgres import PostgresSaver
agent = create_agent(
    model="anthropic:claude-sonnet-4-5",
    tools=[get_settlements, issue_refund],
    system_prompt="You help merchants with settlements. Verify with tools before answering.",
    middleware=[HumanInTheLoopMiddleware(interrupt_on={"issue_refund": True})],
    checkpointer=checkpointer)
agent.invoke({"messages": [{"role": "user", "content": "Refund pay_91x"}]},
             {"configurable": {"thread_id": "m_881-chat-1"}})`,
pit: [`Starting new projects on AgentExecutor.`, `No checkpointer, so no memory or HITL.`, `No limits on model/tool calls.`],
q: [`What is create_agent built on?`, `LangGraph: it's a graph with model and tool nodes in a loop.`]
},
"Retrieval components": {
d: `The RAG building blocks in LangChain:
- **Document loaders**: PDFs, web pages, Confluence, Notion, S3, databases → «Document(page_content, metadata)».
- **Text splitters**: «RecursiveCharacterTextSplitter» (default), Markdown/HTML header splitters, token-based splitters, code-aware splitters.
- **Embeddings**: provider classes with «embed_documents» / «embed_query».
- **Vector stores**: pgvector, Chroma, FAISS, Qdrant, Pinecone, OpenSearch... with «add_documents», «similarity_search», metadata filters.
- **Retrievers**: «vectorstore.as_retriever(search_type="mmr" | "similarity_score_threshold", search_kwargs={"k": 8, "filter": {...}})», plus BM25, ensemble, multi-query, parent-document, contextual compression (rerank).

Keep metadata (source, section, ACL, updated_at) through every step for filtering and citations.`,
life: `A library pipeline: receiving books (loaders), cutting them into index cards (splitters), placing cards on a meaning map (embeddings + store), and a librarian who fetches the right cards (retriever).`,
work: `A Confluence RAG lost section titles because the default splitter cut across headings. Switching to «MarkdownHeaderTextSplitter» then recursive splitting, keeping header metadata, and filtering by «space» per user's permissions improved answer citations and recall.`,
ex: `from langchain_text_splitters import MarkdownHeaderTextSplitter, RecursiveCharacterTextSplitter
from langchain_postgres import PGVector
hdr = MarkdownHeaderTextSplitter([("#", "h1"), ("##", "h2")])
rec = RecursiveCharacterTextSplitter(chunk_size=1500, chunk_overlap=200)
chunks = rec.split_documents(hdr.split_text(markdown))
store = PGVector(embeddings=emb, collection_name="runbooks", connection=DB_URI)
store.add_documents(chunks)
retriever = store.as_retriever(search_kwargs={"k": 8, "filter": {"space": {"$in": user.spaces}}})`,
pit: [`Dropping metadata during splitting.`, `Default chunking for structured docs.`, `No permission filters on retrieval.`],
q: [`Why keep metadata on every chunk?`, `For filtering (permissions, recency), citations, and debugging which source an answer came from.`]
},
"Conversation memory": {
d: `Chat models and chains are **stateless**. "Memory" means your app stores history and decides what to send each turn.

Modern approach: build the conversation as a LangGraph/«create_agent» with a **checkpointer**; pass a «thread_id» per conversation; state («messages») persists between calls. Older «ConversationBufferMemory» classes are legacy.

Keep the context in budget:
- **Trim** («trim_messages» by token count, keeping the system message and recent turns).
- **Summarise** old turns into a running summary (e.g. «SummarizationMiddleware»).
- **Long-term memory**: store durable facts (preferences) in a Store and retrieve when relevant, rather than replaying all history.
- Drop large tool outputs after use.`,
life: `A call-centre agent with notes: they don't replay every past call; they read a short summary of previous calls plus the last few minutes of this one.`,
work: `Long merchant chats hit context limits after ~40 turns and costs climbed linearly. Adding token-based trimming (keep last 3,000 tokens + system) plus a running summary cut average prompt size by 65% with no drop in eval scores for follow-up questions.`,
ex: `from langchain_core.messages import trim_messages
trimmed = trim_messages(history, max_tokens=3000, strategy="last",
                        token_counter=llm, include_system=True, start_on="human")
# or with create_agent
from langchain.agents.middleware import SummarizationMiddleware
agent = create_agent(model, tools, middleware=[SummarizationMiddleware(model=small_llm, max_tokens_before_summary=4000)],
                     checkpointer=cp)`,
pit: [`Unbounded history.`, `Trimming that cuts a tool call from its tool result (invalid sequences).`, `Legacy memory classes in new code.`],
q: [`Why must trimming keep tool calls and their results together?`, `Providers reject message sequences where a tool result has no matching tool call (or vice versa).`]
},
"RunnableConfig travels with every call": {
d: `Every Runnable method accepts a «config» («RunnableConfig») that propagates to all nested runnables:
- «callbacks»: handlers for start/end/error/tokens (tracing, logging, streaming to UI).
- «tags», «metadata»: labels for tracing and filtering (user tier, feature, experiment).
- «run_name»: friendly name in traces.
- «max_concurrency»: limit parallel work in batch/parallel branches.
- «recursion_limit»: for graphs.
- «configurable»: runtime values, e.g. «thread_id», or which model to use via «configurable_fields» / «configurable_alternatives».

Because it propagates, setting metadata at the top call tags every child run in LangSmith, so you can filter all traces for one merchant or feature.`,
life: `A work order stapled to a job that every department along the way can read: who it's for, priority, deadline, and which tools to use.`,
work: `To debug complaints from a large merchant, the team passed «metadata={"merchant_id": ..., "plan": "enterprise"}» and «tags=["support-bot"]» in config at the API layer. In LangSmith they could filter that merchant's traces in seconds and saw every nested retriever and LLM call tagged.`,
ex: `chain.invoke({"q": q}, config={
    "run_name": "merchant_qa",
    "tags": ["support-bot", "v3"],
    "metadata": {"merchant_id": mid, "plan": "enterprise"},
    "max_concurrency": 4,
    "configurable": {"thread_id": f"{mid}-{session_id}"}})`,
pit: [`Not propagating config in custom RunnableLambdas (accept a config param).`, `PII in metadata sent to tracing.`, `Unbounded concurrency in batch.`],
q: [`Why set metadata at the top-level invoke?`, `It propagates to all nested runs, so every child trace is labelled and filterable.`]
},
"Tools as typed contracts": {
d: `Tool schemas are a **contract** between the model and your code. The model only sees: name, description and argument schema. Make each part precise:
- **Types and constraints**: enums, patterns, min/max, formats (dates), required vs optional with defaults.
- **Descriptions** for each argument (units, examples, "use X not Y").
- **Validation**: Pydantic validates the model's arguments before your function runs; invalid args can be returned as an error message so the model retries correctly.
- **Results**: return compact, structured outputs; for big data, return a summary to the model and keep the full artifact separately («content_and_artifact»).
- **Errors**: «handle_tool_error=True» or custom handlers return helpful text instead of crashing the agent.`,
life: `A well-designed government form: each box says what goes in it and in what format, mistakes are flagged immediately, and the clerk tells you exactly what to fix.`,
work: `An agent passed dates as "18 Nov" or "yesterday" and the tool crashed. Using an args_schema with a «date» type and description "YYYY-MM-DD; resolve relative dates first", plus returning validation errors as tool messages, made the agent self-correct on the next call.`,
ex: `from pydantic import BaseModel, Field
from datetime import date
class RefundArgs(BaseModel):
    payment_id: str = Field(pattern=r"^pay_[A-Za-z0-9]{14}$", description="Payment id like pay_XXXXXXXXXXXXXX")
    amount_inr: float = Field(gt=0, description="Refund amount in rupees (not paise)")
    reason: str = Field(description="One of DUPLICATE, CUSTOMER_REQUEST, FRAUD")
@tool(args_schema=RefundArgs)
def issue_refund(payment_id: str, amount_inr: float, reason: str) -> str:
    """Issue a refund after verifying the payment is captured."""
    ...`,
pit: [`Untyped str args for everything.`, `Crashing on invalid args instead of returning guidance.`, `Ambiguous units.`],
q: [`What happens when the model sends arguments that fail the Pydantic schema?`, `Validation fails before your code runs; with error handling, the message is returned so the model can retry with corrected args.`]
},
"Middleware shapes the agent loop": {
d: `«create_agent» exposes hooks around the loop via **middleware**:
- «before_agent» / «after_agent»: once per invocation.
- «before_model» / «after_model»: around each model call (trim/summarise messages, check guardrails, stop conditions).
- «wrap_model_call»: intercept the call itself (dynamic model choice, retries, fallbacks, prompt changes per request).
- «wrap_tool_call»: intercept tool execution (auth, logging, error handling, caching).

Built-ins include **SummarizationMiddleware**, **HumanInTheLoopMiddleware** (approve/edit/reject tool calls), **PIIMiddleware** (redact/mask/block), model and tool **call limits**, model fallback, LLM tool selector, and more. Middleware composes in order, keeping cross-cutting concerns out of your tools and prompts.`,
life: `Airport processes around each flight: check-in before (before_model), security wrapping the boarding (wrap), and customs after landing (after_model), all without changing how the plane flies.`,
work: `Compliance required masking card numbers and Aadhaar numbers before any text reached the model, and approvals for refunds above ₹5,000. Two middleware entries (PII redaction on input, HITL with a custom condition) met both requirements without touching tool code.`,
ex: `from langchain.agents.middleware import PIIMiddleware, ModelCallLimitMiddleware, wrap_tool_call
@wrap_tool_call
def audit(request, handler):
    log.info("tool", name=request.tool_call["name"], user=request.runtime.context.user_id)
    return handler(request)
agent = create_agent(model, tools, middleware=[
    PIIMiddleware("credit_card", strategy="mask"),
    ModelCallLimitMiddleware(run_limit=15),
    audit])`,
pit: [`Putting auth/logging inside every tool instead of middleware.`, `Middleware order surprises.`, `Heavy work in before_model slowing every step.`],
q: [`Which hook would you use to switch to a cheaper model for simple requests?`, `wrap_model_call (dynamic model selection per call).`]
},
"Retriever building blocks": {
d: `Composable retrievers in LangChain:
- **EnsembleRetriever**: combine retrievers (e.g. BM25 + vector) with weights using reciprocal rank fusion → hybrid search.
- **MultiQueryRetriever**: an LLM rewrites the question into several variants, retrieves for each, and unions results (helps with vague questions).
- **ParentDocumentRetriever**: index small child chunks for precise matching, return larger parent documents.
- **ContextualCompressionRetriever**: wrap a base retriever with a compressor/reranker (cross-encoder, LLM extractor, embeddings filter) to keep only relevant parts.
- **SelfQueryRetriever**: LLM turns natural language into a query + metadata filter («year > 2024 and type = circular»).
- **Time-weighted** retrievers boost recent documents.

Measure each addition on your retrieval eval set; each one adds latency and sometimes cost.`,
life: `Different search strategies at a library: ask two librarians and merge their lists (ensemble), rephrase your question a few ways (multi-query), find the right paragraph then hand over the whole chapter (parent), and have someone highlight only relevant lines (compression).`,
work: `A policy assistant's recall@5 was 68%. Ensemble (BM25 0.4 + vector 0.6) → 79%; adding a cross-encoder compression step → precision@5 from 52% to 74%. MultiQuery added 600 ms with only +1 point, so it was dropped.`,
ex: `from langchain.retrievers import EnsembleRetriever, ContextualCompressionRetriever
from langchain_community.retrievers import BM25Retriever
from langchain.retrievers.document_compressors import CrossEncoderReranker
bm25 = BM25Retriever.from_documents(chunks, k=20)
vec = store.as_retriever(search_kwargs={"k": 20})
hybrid = EnsembleRetriever(retrievers=[bm25, vec], weights=[0.4, 0.6])
retriever = ContextualCompressionRetriever(
    base_compressor=CrossEncoderReranker(model=cross_encoder, top_n=5), base_retriever=hybrid)`,
pit: [`Stacking every retriever trick without measuring.`, `MultiQuery cost/latency on every request.`, `SelfQuery generating wrong filters without validation.`],
q: [`What does EnsembleRetriever use to merge results?`, `Weighted reciprocal rank fusion across the component retrievers.`]
}
});
