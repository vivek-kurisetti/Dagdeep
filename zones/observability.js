QUEST.zone("observability", {
mission:["ravi","The assistant handles 50,000 conversations a day. When latency spikes or answers drift, I need to know why in minutes. Learn what to measure and which tools to use, then run the on-call drill."],
levels:[
{t:"What to observe", sub:"Traces, metrics, logs", rounds:[
 ["learn","LLM apps need traces","A single answer can involve retrieval, several LLM calls and tools. A **trace** links them as **spans** with inputs, outputs, model, tokens, latency, cost and errors. Metrics aggregate; logs add detail.",["Request span","Retriever span","LLM span (tokens, model)","Tool spans","Response"]],
 ["sort","Metric, trace or eval?",{"Metric":["p95 latency","Tokens per request","Error rate by model"],"Trace":["Exact prompt sent for request 8f2c","Which tool call failed"],"Eval":["Faithfulness score","Answer correctness vs reference"]},"Ops metrics + quality evals + traces to debug."],
 ["match","Latency terms",[["TTFT","Time to first token: what users feel in chat"],["TPOT / inter-token latency","Time per generated token"],["End-to-end latency","Request to final answer, incl. tools"],["Queue time","Waiting for capacity or rate limits"]],"Stream to make TTFT the number that matters."],
 ["tf","Basics",[["Average latency is enough to set SLOs.",false,"Use p95/p99."],["Cost should be tracked per feature and per customer.",true,"Tokens × price by model."],["Logging every prompt verbatim is always fine.",false,"Redact PII and secrets."]]]
]},
{t:"Tools & standards", sub:"OpenTelemetry, Langfuse, Phoenix…", rounds:[
 ["learn","OpenTelemetry GenAI conventions","OpenTelemetry defines **GenAI semantic conventions** (attributes like «gen_ai.request.model», «gen_ai.usage.input_tokens», «gen_ai.usage.output_tokens») so any backend can understand LLM spans. Libraries like OpenLLMetry and OpenInference instrument SDKs automatically."],
 ["match","Tool",[["LangSmith","LangChain's tracing, datasets and evals platform"],["Langfuse","Open-source LLM tracing, prompts and evals"],["Arize Phoenix","Open-source tracing and evals on OpenInference/OTel"],["Datadog / Grafana","General APM and dashboards with LLM features"],["Helicone / gateways","Proxy that logs requests, cost and caching"]],"Pick by stack, hosting and team."],
 ["fill","Record token usage on a span (OTel GenAI attributes)",'span.set_attribute("gen_ai.request.___", "claude-sonnet")\nspan.set_attribute("gen_ai.usage.___", resp.usage.input_tokens)\nspan.set_attribute("gen_ai.usage.output_tokens", resp.usage.output_tokens)',["model","input_tokens"],["engine","prompt_len"],"Standard names let any backend chart them."],
 ["sort","Self-host or managed?",{"Self-host friendly":["Langfuse","Arize Phoenix","OpenTelemetry Collector"],"Managed SaaS":["LangSmith cloud","Datadog LLM Observability"]},"Many offer both; data residency often decides."]
]},
{t:"Quality in production", sub:"Online evals, drift", rounds:[
 ["learn","Watch quality, not just uptime","Track **user feedback** (thumbs, edits, escalations), run **online evaluators** (LLM-as-judge for faithfulness, toxicity, PII) on sampled traffic, and segment by prompt version, model and customer. Alert on drops."],
 ["order","From alert to fix",["Alert: faithfulness score drops 15% for the refunds segment","Filter traces by segment and prompt version","Find retrieval returning an outdated policy doc","Re-index the doc and add the case to the eval dataset","Confirm scores recover"],"Traces + evals make root causes findable."],
 ["learn","Drift has many causes","Provider model updates, prompt edits, new user behaviour, stale knowledge base, tool API changes. Pin model versions, version prompts, and compare against baselines."],
 ["pick","Quality dropped on a date with no deploy from your side. First suspect?",["A provider model alias changed / data source changed","Your CSS","Database indexes","DNS"],0,"Pin model versions; check upstream changes."],
 ["tf","Quality facts",[["Online evals usually run on a sample to control cost.",true,"Score 1–10% of traffic."],["Thumbs-down rate alone fully measures quality.",false,"Most users never click; combine signals."]]]
]},
{t:"Cost & performance", sub:"Tokens, caching, routing", rounds:[
 ["learn","Levers for cost and latency","**Prompt caching** for long, repeated prefixes. **Shorter prompts** and trimmed history. **Model routing**: small model for easy requests, big for hard. **Streaming** for perceived latency. **Batch APIs** for offline jobs at lower price. **Semantic caching** for repeated questions."],
 ["match","Problem → lever",[["Same 20k-token system prompt every call","Prompt caching"],["Overnight classification of 1M tickets","Batch API"],["Simple FAQs on the biggest model","Model routing"],["Users stare at a blank screen","Streaming"]],"Measure before and after."],
 ["sort","Reduces cost?",{"Reduces cost":["Prompt caching","Trimming chat history","Routing easy queries to a small model"],"Increases cost":["Retrying every request 3 times","Sending all 40 retrieved chunks","Max_tokens far above need with verbose instructions"]},"Tokens are the bill."],
 ["pick","p95 latency is 14 s; traces show 9 s in a reranker and 3 s in the LLM. Fix first?",["The reranker","The LLM model size","Network","CSS"],0,"Fix the biggest span first."]
]},
{t:"Boss: On-call drill", boss:true, time:30, rounds:[
 ["pick","Users say 'slow'. Dashboard shows average 2 s. Next?",["Check p95/p99 and TTFT by segment","Close the ticket","Add more logs","Restart"],0,"Averages hide tails."],
 ["pick","Bill doubled this week. First look at…",["Tokens and cost by feature/customer in traces","Server CPU","Disk","DNS"],0,"Find who spends tokens."],
 ["pick","One request gave a wrong refund amount. How to debug?",["Open its trace: prompt, retrieved docs, tool calls","Ask the model","Re-run randomly","Read average metrics"],0,"Traces show the path."],
 ["pick","Need vendor-neutral instrumentation. Use…",["OpenTelemetry with GenAI conventions","Print statements","Screenshots","CSV logs"],0,"Standard telemetry."],
 ["pick","Quality dropped overnight without a deploy. Check…",["Upstream model version / data changes","Font","CI","Browser cache"],0,"Pin and compare."],
 ["pick","Logs contain customer card numbers. Fix?",["Redact PII before export","Keep logs 7 days","Encrypt dashboards only","Disable tracing"],0,"Never store what you don't need."]
]}
]});

QUEST.more("observability", [
{act:"Expert", t:"OpenTelemetry for GenAI deep", sub:"Spans, attributes, content capture", rounds:[
 ["learn","GenAI semantic conventions","OpenTelemetry's GenAI conventions define how to describe model calls, agent runs and tool executions as **spans**, plus **metrics** and optional **events** for prompts/completions.",null,null,`### Spans
- Model call spans named like «chat {model}» with attributes such as «gen_ai.operation.name» (chat, embeddings, …), «gen_ai.request.model», «gen_ai.response.model», «gen_ai.request.temperature», «gen_ai.request.max_tokens», «gen_ai.usage.input_tokens», «gen_ai.usage.output_tokens», «gen_ai.response.finish_reasons».
- Agent spans for invoking agents and executing tools («execute_tool {tool}»), nested under your request span.
- Request vs response model matters: an alias like "latest" can resolve to a different concrete model.

### Content capture
Prompt and completion **contents are opt-in** (they may contain PII/secrets). Capture them only where allowed, redact in the collector (processors), or store content in a separate, access-controlled system referenced by id.

### Metrics
Histograms like client **token usage** and **operation duration** let you chart p50/p95 latency and tokens by model and operation without storing every trace.

### Instrumentation
Auto-instrumentation libraries (OpenLLMetry, OpenInference, vendor SDKs) wrap provider SDKs and frameworks; export via OTLP to any backend (Langfuse, Phoenix, Datadog, Grafana Tempo, Honeycomb…). The OTel Collector handles batching, sampling, redaction and routing.`],
 ["match","Attribute",[["gen_ai.request.model","Model you asked for"],["gen_ai.response.model","Model that actually answered"],["gen_ai.usage.output_tokens","Generated tokens"],["gen_ai.response.finish_reasons","Why generation stopped"],["gen_ai.operation.name","chat, embeddings, execute_tool…"]],"Standard names make dashboards portable."],
 ["pick","Quality shifted though you never changed code; spans show request model 'x-latest' but a new response model value. Meaning?",["The provider alias now points to a different model version","Tracing bug","Cache hit","Temperature drift"],0,"Pin versions; alert on response model changes."],
 ["sort","Default capture or opt-in only?",{"Capture by default":["Token counts","Latency","Model names","Finish reasons","Error types"],"Opt-in with redaction":["Full prompt text","Full completion text","Tool arguments containing customer data"]},"Metadata freely, content carefully."],
 ["tf","OTel truths",[["Prompt contents should always be stored in traces.",false,"Opt-in; redact sensitive data."],["The OTel Collector can redact attributes before export.",true,"Processors."]]]
]},
{act:"Expert", t:"Sampling & telemetry cost", sub:"Head vs tail sampling", rounds:[
 ["learn","Keep the interesting traces","**Head sampling** decides at the start (e.g. keep 10%) — cheap but blind. **Tail sampling** decides after the trace completes — keep all errors, slow requests, low eval scores, negative feedback, and a small random sample of the rest.",null,null,`### Sizing telemetry
Estimate: requests/day × spans/request × bytes/span. LLM spans with content are large (prompts can be tens of KB). Store full content for a short retention, keep metrics and metadata longer.

### Practical policy
- 100% of errors and guardrail blocks.
- 100% of traces with negative feedback or low online-eval scores.
- p99 latency outliers.
- 1–10% random baseline for trends and evals.
- Truncate very long payloads (keep head and tail) and store references for full documents.

### Correlation
Propagate trace ids into logs and user-facing request ids so support tickets map to traces. Attach conversation/session ids for multi-turn analysis.`],
 ["num","50,000 conversations/day × 8 spans each × 4 KB per span. Telemetry per day in GB (1 GB = 10⁶ KB)?",1.6,0.05,"GB","50,000 × 8 × 4 KB = 1,600,000 KB = 1.6 GB/day before any content capture."],
 ["sort","Keep with tail sampling?",{"Keep":["Trace ending in a 500 error","Trace with thumbs-down feedback","p99.9 latency trace","Guardrail-blocked request"],"Sample down":["Ordinary successful fast request","Health-check traffic"]},"Spend storage on what you'll investigate."],
 ["pick","Head sampling at 5% means you rarely have traces for user-reported errors. Fix?",["Tail sampling that keeps all errors and flagged traces","Raise to 100% forever","Turn off tracing","Log only metrics"],0,"Decide after the outcome is known."],
 ["tf","Sampling truths",[["Head sampling can keep all error traces reliably.",false,"It decides before knowing the outcome."],["Metrics can be computed on 100% of traffic even if traces are sampled.",true,"Aggregate before sampling."]]]
]},
{act:"Expert", t:"SLOs for LLM products", sub:"Latency, availability, quality budgets", rounds:[
 ["learn","Define SLOs users feel","Classic SLOs (availability, latency) still apply, measured at the right points: **TTFT p95** for chat, **end-to-end p95** for agent tasks, **success rate** including provider 429/5xx after retries. Add **quality SLOs** from online evals and feedback.",null,null,`### Examples
- Availability: 99.5% of chat requests return a non-error response (after retries/fallbacks) per 30 days.
- Latency: p95 TTFT < 1.5 s; p95 full answer < 8 s.
- Quality: ≥ 92% of sampled answers pass the faithfulness judge per week; thumbs-down rate < 4%.
- Cost: median cost per resolved conversation < ₹2.

### Error budgets
99.5% availability over 30 days allows 0.5% failures: for 3 million requests, 15,000 failed requests. Burn-rate alerts (fast and slow windows) catch incidents early without paging on noise.

### Dependencies
Provider outages and rate limits are part of your SLO. Mitigate with retries + backoff, **fallback models/providers** through a gateway, graceful degradation (cached answers, smaller model), and queueing for non-interactive work.

### Quality SLO caveats
Judges drift too: monitor judge agreement with periodic human samples. Segment by language, customer tier and feature.`],
 ["num","SLO 99.5% success over 30 days; 3,000,000 requests. Allowed failed requests in the error budget?",15000,0,"requests","0.5% × 3,000,000 = 15,000."],
 ["match","SLO type",[["p95 TTFT < 1.5 s","Perceived responsiveness of chat"],["Faithfulness pass rate ≥ 92%","Quality from sampled online evals"],["99.5% non-error responses","Availability including provider failures"],["Cost per resolved conversation","Efficiency"]],"Users feel latency, correctness and failures."],
 ["pick","Provider returns 429s at peak and your availability SLO burns. Best mitigation?",["Gateway with retries/backoff + fallback model + request queueing","Disable retries","Bigger prompts","Lower SLO silently"],0,"Engineer around dependency limits."],
 ["tf","SLO truths",[["Average latency is a good SLO metric.",false,"Use percentiles."],["Quality SLOs need monitoring of the judge itself.",true,"Judges drift."]]]
]},
{act:"Expert", t:"Cost & capacity engineering", sub:"Caching, routing, batch, limits", rounds:[
 ["learn","Model the bill","Cost = Σ (input tokens × input price + cached input × cache price + output tokens × output price) per model. Track it per feature, tenant and conversation. Biggest levers: **prompt caching**, **routing** to smaller models, **trimming context**, **batch APIs** for offline work, and **output length** control.",null,null,`### Rate limits
Providers limit requests per minute and tokens per minute (often input and output separately). Plan capacity: peak RPM × average tokens; reserve headroom; queue background jobs; spread across regions/providers if allowed.

### Gateways
An LLM gateway (e.g. LiteLLM, Portkey, cloud-native gateways) centralizes keys, retries, fallbacks, budgets per team, caching, and logging — one place to enforce spend limits and observe usage.

### Caching metrics
Monitor **cache hit rate** (cached input tokens ÷ total input). Low hit rate usually means the prefix varies (timestamps, user names early in the prompt) or calls are spaced beyond the cache TTL.

### Worked example
1M input tokens/day at $3/M; 70% served from cache at 0.1× price: 0.3 × $3 + 0.7 × $0.30 = $0.90 + $0.21 = **$1.11/day** vs $3.00 — a 63% cut on input.`],
 ["num","1M input tokens/day at $3/M; 70% are cache hits billed at 0.1×. Daily input cost in USD (2 decimals)?",1.11,0.01,"USD","0.3 × $3 + 0.7 × $0.30 = $1.11."],
 ["sort","Cuts cost without hurting quality (usually)?",{"Usually safe":["Prompt caching of stable prefixes","Batch API for nightly classification","Trimming irrelevant retrieved chunks"],"Needs evals first":["Routing everything to the smallest model","Halving max_tokens","Removing few-shot examples"]},"Some savings are free; others need measurement."],
 ["pick","Cache hit rate is 4% despite a 30k-token shared system prompt. Likely cause?",["Something variable (timestamp/user name) sits early in the prefix","Too few users","Wrong region","Streaming enabled"],0,"Move variable content to the end."],
 ["tf","Cost truths",[["Batch APIs are suitable for real-time chat.",false,"They trade latency for price."],["A gateway can enforce per-team budgets.",true,"Central control point."]]]
]},
{act:"Expert", t:"Expert boss: Observability on-call", boss:true, time:45, rounds:[
 ["pick","Answers changed overnight; spans show a new response model under the same alias. Fix?",["Pin explicit model versions and alert on response model changes","Ignore","Lower temperature","Clear caches"],0,"Version drift."],
 ["pick","Traces for reported failures are missing due to 5% head sampling. Fix?",["Tail sampling keeping errors/feedback/outliers","100% forever","Disable sampling of metrics","Logs only"],0,"Outcome-aware sampling."],
 ["pick","Compliance flags full prompts with card data in the tracing backend. Fix?",["Redact in SDK/collector; make content capture opt-in","Shorter retention only","Encrypt dashboards","Disable tracing"],0,"Don't collect what you can't keep."],
 ["pick","Error budget burned 40% in one hour from provider 5xx. First move?",["Fail over to fallback model/provider via gateway","Page the data team","Retrain","Lower SLO"],0,"Mitigate dependency failure."],
 ["pick","Daily cost doubled; one tenant's tokens 10×. Next?",["Per-tenant budgets/rate limits; investigate their usage pattern","Raise global quota","Disable caching","Ignore"],0,"Attribute and cap."],
 ["pick","Faithfulness SLO dipped only for Telugu queries. Next?",["Segment traces, inspect retrieval/eval for that language","Global prompt rewrite","Raise temperature","Ignore small segments"],0,"Segment analysis."],
 ["pick","p95 TTFT high; traces show 2 s spent before the LLM call in guardrails. Fix?",["Run guardrails in parallel with retrieval / faster classifier","Remove all guardrails","Bigger LLM","More logs"],0,"Fix the slowest span first."]
]}
]);
