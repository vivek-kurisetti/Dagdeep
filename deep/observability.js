QUEST.deep("observability", {
"LLM apps need traces": {
d: `Classic monitoring (CPU, error rate, latency) tells you a request was slow or failed, not **why** an answer was wrong. An LLM request fans out into retrieval, prompt building, one or more model calls, tool calls and post-processing. A **trace** captures that as a tree of **spans**, each with:
- inputs and outputs (prompt, retrieved chunks, completion, tool args/results),
- model name/version and parameters,
- token usage and cost,
- latency (incl. time to first token),
- errors and retries,
- metadata (user/tenant, feature, prompt version).

With traces you can answer: what did the model actually see? Which step was slow? Which prompt version produced this? Tools: LangSmith, Langfuse, Arize Phoenix, Datadog/Honeycomb/Grafana via OpenTelemetry.`,
life: `A parcel tracking page that shows every hub, scan and delay, instead of just "delivered late".`,
work: `"Answers got worse since Tuesday" was untraceable with only API logs. After adding tracing, the team saw that a Tuesday deploy changed the retriever's «k» from 8 to 3; many answers lacked the key chunk. Rolling back fixed it within an hour.`,
ex: `trace: answer_settlement_question (2.4s, ₹0.38)
 ├─ span retrieve (210ms) k=8 hits=8 top_score=0.82
 ├─ span rerank (95ms) kept=5
 ├─ span llm.chat (1.9s) model=claude-sonnet-4-5 in=3,120 out=410 ttft=620ms
 └─ span validate_json (3ms) ok=true`,
pit: [`Logging only final answers.`, `No prompt/model version on spans.`, `Raw PII stored in traces.`],
q: [`What can a trace show that an error-rate metric can't?`, `What each step received and returned (e.g. empty retrieval, wrong prompt version), explaining why an answer was wrong.`]
},
"OpenTelemetry GenAI conventions": {
d: `**OpenTelemetry** (OTel) is the vendor-neutral standard for traces, metrics and logs. Its **GenAI semantic conventions** standardise attribute names for LLM operations so any backend can understand them:
- «gen_ai.operation.name» (chat, embeddings, execute_tool, invoke_agent),
- «gen_ai.provider.name» (formerly «gen_ai.system»), «gen_ai.request.model», «gen_ai.response.model»,
- «gen_ai.usage.input_tokens», «gen_ai.usage.output_tokens»,
- request params like «gen_ai.request.temperature», «gen_ai.request.max_tokens»,
- «gen_ai.response.finish_reasons», plus events/attributes for prompt and completion content (opt-in, since it may contain sensitive data).

Instrument once with OTel (OpenLLMetry, OpenInference, provider instrumentations) and send to any backend. The conventions are still evolving (marked development/experimental), so pin instrumentation versions.`,
life: `Standard shipping labels: any courier's scanner can read them, so you can switch courier companies without relabelling every parcel.`,
work: `The company used Datadog for services and wanted LLM visibility without another silo. OTel GenAI instrumentation on the Python services sent spans with token usage to the existing collector; dashboards for cost per service and p95 TTFT were built in the same tool the SREs already used.`,
ex: `from opentelemetry import trace
tracer = trace.get_tracer("payments-assistant")
with tracer.start_as_current_span("chat claude-sonnet-4-5") as span:
    span.set_attribute("gen_ai.operation.name", "chat")
    span.set_attribute("gen_ai.provider.name", "anthropic")
    span.set_attribute("gen_ai.request.model", "claude-sonnet-4-5")
    resp = client.messages.create(...)
    span.set_attribute("gen_ai.usage.input_tokens", resp.usage.input_tokens)
    span.set_attribute("gen_ai.usage.output_tokens", resp.usage.output_tokens)`,
pit: [`Custom attribute names that no dashboard understands.`, `Capturing full prompt content by default (privacy).`, `Unpinned instrumentation as conventions change.`],
q: [`Why use the GenAI semantic conventions instead of custom attribute names?`, `Any OTel-compatible backend and tool can interpret them consistently, avoiding lock-in and custom mapping.`]
},
"Watch quality, not just uptime": {
d: `An LLM service can be 100% available and still give bad answers. Monitor **quality signals**:
- **Explicit feedback**: thumbs up/down, ratings, "report a problem".
- **Implicit feedback**: user edits to drafts, copy rate, retries/regenerations, escalation to a human, abandonment, follow-up "that's wrong".
- **Online evaluators** on sampled traffic: groundedness/faithfulness vs retrieved docs, relevance, toxicity, PII leakage, format validity, refusal rate.
- **Business outcomes**: ticket resolution rate, handle time, conversion.

Slice by model/prompt version, tenant, language, feature to find where quality drops. Pair with **guardrail hit rates** (how often filters trigger) as early warnings.`,
life: `A restaurant tracking not just whether it's open, but how much food comes back uneaten, how many customers ask for the manager, and repeat visits.`,
work: `Thumbs-down rate was flat at 5%, but slicing by language showed Telugu conversations at 18%. Online groundedness scores were also lower there: the retriever's embedding model handled Telugu poorly. Switching to a multilingual embedder brought Telugu thumbs-down to 6%.`,
ex: `metrics:
  feedback_negative_rate{feature, language, prompt_version}
  escalation_rate{feature}
  groundedness_score_p50{model}            # online LLM judge on 5% sample
  json_valid_rate{endpoint}
  guardrail_block_rate{type="pii|injection|toxicity"}`,
pit: [`Only uptime/latency dashboards.`, `Aggregate metrics hiding segment problems.`, `Ignoring implicit signals like edits and retries.`],
q: [`Name two implicit quality signals.`, `Users regenerating/retrying answers and escalating to a human (also heavy edits to drafts, abandonment).`]
},
"Drift has many causes": {
d: `Quality can change without you deploying anything:
- **Model changes**: providers update models behind aliases («-latest»); deprecations force migrations.
- **Prompt edits** and config changes (temperature, k, chunk size).
- **Data/knowledge drift**: the knowledge base becomes stale, new products/policies appear, documents change format.
- **User behaviour drift**: new user segments, languages, seasonal topics (sale days, tax season).
- **Tool/API changes**: an upstream API changes its response format.
- **Dependency upgrades** in frameworks.

Controls: **pin model versions** (use dated model ids), **version prompts** and configs, record versions on every trace, run **scheduled evals** on a fixed dataset to detect provider-side changes, and monitor input distributions (topics, languages, lengths).`,
life: `A recipe that suddenly tastes different: maybe the supplier changed the flour (model), someone edited the recipe (prompt), the customers changed (users), or the oven was replaced (tools).`,
work: `A classification endpoint's accuracy dropped 6 points over a weekend with no deploys. Traces showed the model id was an alias that had moved to a newer snapshot. They pinned the dated model id, re-ran evals on the new snapshot, adjusted the prompt, and only then migrated deliberately.`,
ex: `MODEL = "claude-sonnet-4-5-20250929"     # pinned, not an alias
PROMPT_VERSION = "support-classify@v14"
span.set_attribute("app.prompt_version", PROMPT_VERSION)
# nightly: run eval dataset against prod config; alert if accuracy < 0.90`,
pit: [`Using "latest" aliases in production.`, `Unversioned prompts edited in a UI.`, `No scheduled evals without deploys.`],
q: [`How can quality change if you didn't deploy?`, `Provider model updates, changing user behaviour or data, stale knowledge, or upstream tool/API changes.`]
},
"Levers for cost and latency": {
d: `Main levers, roughly in order of impact:
- **Model routing**: small/fast model for easy requests, large model only when needed (classifier or confidence-based routing).
- **Prompt caching**: reuse cached prefixes (system prompt, tools, large docs) for big discounts on input tokens and lower TTFT.
- **Shorter prompts**: trim instructions, fewer/better RAG chunks, compact history, smaller tool outputs.
- **Output limits**: «max_tokens», concise formats (JSON over prose), stop sequences.
- **Batching**: batch APIs (often ~50% cheaper) for offline jobs.
- **Response caching**: exact or semantic caching for repeated questions (careful with personalisation and freshness).
- **Streaming**: doesn't reduce cost, but improves perceived latency.
- **Parallelism**: run independent calls/tools concurrently.

Measure cost per request/feature/tenant before optimising; often 20% of features drive 80% of spend.`,
life: `Running a delivery business: send bikes for small parcels and trucks only for big ones (routing), pre-pack common orders (caching), and send overnight non-urgent orders in bulk (batch).`,
work: `A support assistant cost ₹1.8 per conversation. Routing simple FAQ intents to a small model (60% of traffic), caching the 7k-token system prompt + tools, and cutting RAG chunks from 10 to 5 brought it to ₹0.55 with no drop in eval scores; nightly ticket summarisation moved to the batch API.`,
ex: `def route(msg):
    intent, conf = small_llm_classify(msg)
    if intent in SIMPLE_INTENTS and conf > 0.85:
        return "claude-haiku-4-5"
    return "claude-sonnet-4-5"
client.messages.create(model=route(msg), max_tokens=400,
    system=[{"type": "text", "text": SYSTEM, "cache_control": {"type": "ephemeral"}}], messages=msgs)`,
pit: [`Optimising without per-feature cost data.`, `Semantic caching that returns another user's personalised answer.`, `Routing without evaluating quality per route.`],
q: [`Which lever helps most when every request repeats a long system prompt?`, `Prompt caching of that stable prefix.`]
},
"GenAI semantic conventions": {
d: `Beyond basic chat spans, the OTel GenAI conventions describe:
- **Span types**: model calls («chat», «text_completion», «embeddings»), **agent** operations («create_agent», «invoke_agent») and **tool execution** («execute_tool» with «gen_ai.tool.name», «gen_ai.tool.call.id»).
- **Metrics**: «gen_ai.client.token.usage» (histogram by token type input/output), «gen_ai.client.operation.duration», server-side metrics like time to first token and time per output token.
- **Content capture**: inputs/outputs (messages, system instructions, tool definitions) as opt-in attributes or events, because they may hold sensitive data; often controlled by an env flag.
- **Provider-specific** attributes (e.g. for OpenAI, Anthropic, AWS Bedrock) layered on the common ones.

Using these, one dashboard can compare token usage and latency across providers and agents consistently.`,
life: `A common language for flight data: every airline reports departures, delays and fuel in the same fields, so airports can compare them on one board.`,
work: `Agents built with two frameworks emitted different span shapes; dashboards needed per-framework queries. Standardising on GenAI conventions («invoke_agent» root, «chat» and «execute_tool» children) let one Grafana dashboard show tool error rates and token usage per agent, regardless of framework.`,
ex: `invoke_agent settlement-helper                 gen_ai.operation.name=invoke_agent
 ├─ chat claude-sonnet-4-5                     gen_ai.usage.input_tokens=2810
 ├─ execute_tool get_settlements               gen_ai.tool.name=get_settlements
 └─ chat claude-sonnet-4-5                     gen_ai.response.finish_reasons=["end_turn"]
metric: gen_ai.client.token.usage{gen_ai.token.type="input", gen_ai.request.model=...}`,
pit: [`Capturing content without a privacy review.`, `Inconsistent span names across services.`, `Ignoring the metrics side (only traces).`],
q: [`Why is message content capture opt-in in the GenAI conventions?`, `Prompts and completions can contain sensitive or personal data, so capturing them should be a deliberate choice.`]
},
"Keep the interesting traces": {
d: `Storing every trace with full prompts is expensive at scale. Sampling strategies:
- **Head sampling**: decide at the start of a trace (e.g. keep 10% randomly). Cheap and simple, but blind: it drops most errors and slow requests too.
- **Tail sampling**: decide after the trace completes, based on its content: keep **all errors**, all **slow** traces (p99), all with **negative feedback** or guardrail hits, and a small random sample of normal traffic. Needs a collector that buffers spans (OTel Collector tail_sampling processor).
- **Priority rules**: always keep traces for VIP tenants under investigation, new feature flags, or new model versions during rollout.

Also manage **retention** (short for raw content, longer for metrics/aggregates) and **redaction** before storage.`,
life: `A CCTV system that keeps all footage where an alarm went off and a few random clips from quiet hours, instead of storing every second forever.`,
work: `Tracing 100% of 4 M requests/day with prompts cost more than the LLM calls. Tail sampling (100% errors, latency > 8 s, thumbs-down, guardrail hits; 2% of the rest) cut trace storage by 94% while keeping nearly every trace engineers actually opened.`,
ex: `processors:
  tail_sampling:
    decision_wait: 30s
    policies:
      - {name: errors, type: status_code, status_code: {status_codes: [ERROR]}}
      - {name: slow, type: latency, latency: {threshold_ms: 8000}}
      - {name: feedback, type: string_attribute, string_attribute: {key: app.feedback, values: [negative]}}
      - {name: baseline, type: probabilistic, probabilistic: {sampling_percentage: 2}}`,
pit: [`Head sampling only (losing errors).`, `Keeping raw prompts forever.`, `Feedback arriving after the sampling decision window.`],
q: [`Why is tail sampling better for debugging?`, `It decides after seeing the whole trace, so it can keep all errors, slow requests and bad-feedback traces.`]
},
"Define SLOs users feel": {
d: `SLOs should reflect what users experience at the right point:
- **Chat UX**: **time to first token (TTFT) p95** (e.g. < 1.5 s), streaming tokens/s, end-to-end p95 for complete answers.
- **Agent tasks**: end-to-end task latency p95, **task success rate** (from evals or outcome checks).
- **Availability**: successful responses / total, counting provider errors, timeouts and guardrail failures appropriately.
- **Quality SLOs**: e.g. schema-valid output ≥ 99.5%, groundedness score ≥ 0.9 on sampled traffic, negative feedback ≤ 5%.
- **Cost SLOs/budgets**: cost per conversation or per tenant per day.

Use **error budgets** and burn-rate alerts (fast and slow windows) instead of alerting on every spike. Remember provider rate limits and outages: fallbacks and degraded modes count toward meeting SLOs.`,
life: `For a food delivery app, users care about "how soon do I see the order confirmed" (first token) and "when does food arrive" (end-to-end), not the kitchen's CPU usage.`,
work: `The team's SLO was "API p95 < 10 s", which users found too slow but was always met. Moving to TTFT p95 < 1.5 s (with streaming) and schema-valid ≥ 99.5% exposed the real problem: long RAG prompts. Trimming context met the new SLO and satisfaction scores rose.`,
ex: `slo:
  - name: chat_ttft
    objective: 95% of requests TTFT < 1500ms over 28d
  - name: valid_json
    objective: 99.5% of extraction responses schema-valid over 7d
alert: burn_rate(chat_ttft, 1h) > 14 and burn_rate(chat_ttft, 5m) > 14`,
pit: [`SLOs on server metrics users don't feel.`, `Alerting on every latency spike.`, `No quality or cost SLOs.`],
q: [`For a streaming chat app, which latency metric best reflects user experience?`, `Time to first token (TTFT), alongside end-to-end latency.`]
},
"Model the bill": {
d: `LLM cost per request:
«cost = input_tokens × input_price + cached_read_tokens × cache_read_price + cache_write_tokens × cache_write_price + output_tokens × output_price» (+ reasoning/thinking tokens billed as output, + tool/search fees if any), summed across every model call in the trace.

Track it like any other metric: **per request, feature, tenant, model, prompt version**. Useful views:
- Cost per successful task (not just per call).
- Top features/tenants by spend; cost outliers (runaway agent loops).
- Input vs output split (output usually priced 3–5× higher).
- Cache hit rate and savings.

Then forecast: requests/day × avg cost, with growth; set **budgets and alerts** per tenant/feature, and hard caps for agents (max steps/tokens).`,
life: `A phone bill itemised by person in the family and by call type (local, STD, roaming), so you see who's driving the cost and set limits.`,
work: `Finance asked why LLM spend doubled. Cost per trace by feature showed an "auto-summarise every ticket" job (added quietly) producing 45% of spend, with large outputs. Switching it to the batch API with shorter summaries and caching the instructions cut its cost by 70%.`,
ex: `PRICES = {"claude-sonnet-4-5": {"in": 3.0, "out": 15.0, "cache_read": 0.30}}   # USD / 1M tokens (example)
def cost_usd(model, u):
    p = PRICES[model]
    return (u.input_tokens * p["in"] + u.output_tokens * p["out"]
            + (u.cache_read_input_tokens or 0) * p["cache_read"]) / 1e6
span.set_attribute("app.cost_usd", cost_usd(model, resp.usage))`,
pit: [`Hard-coded prices that go stale.`, `Ignoring output and reasoning tokens.`, `No per-tenant budgets for agents.`],
q: [`Why track cost per successful task rather than per call?`, `Retries, multi-step agents and failures mean the real cost of delivering an outcome can be several calls; that's what matters for the business.`]
}
});
