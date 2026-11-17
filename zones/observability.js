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
