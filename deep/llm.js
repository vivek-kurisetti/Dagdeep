QUEST.deep("llm", {
"Text becomes tokens": {
d: `Models don't see characters or words; they see **tokens** from a fixed vocabulary (typically 50k–200k entries) built with **BPE**-style algorithms: frequent words become one token, rare words split into pieces («tokenization» → «token» + «ization»). In English, 1 token ≈ 4 characters ≈ ¾ of a word.

Why it matters:
- **Cost and limits** are counted in tokens (input and output priced separately; output usually 3–5× more).
- **Other languages and scripts** often need more tokens per word (Hindi/Telugu can be 2–4× English), so the same message costs more and fills context faster.
- Numbers, code, JSON keys and whitespace tokenise unevenly; that's one reason models struggle with character-level tasks (counting letters, reversing strings).
- Each model family has its **own tokenizer**; counts differ between providers.`,
life: `Like a typist with a stamp set: common words have their own stamps, unusual words are stamped from syllable pieces. Billing is per stamp, not per word.`,
work: `A support bot's cost doubled after launching in Telugu. Token counts showed Telugu messages used 3.1× the tokens of the same English text. The team trimmed the system prompt (kept in English), summarised history after 6 turns, and set per-language max output tokens, bringing cost back within budget.`,
ex: `import tiktoken
enc = tiktoken.get_encoding("o200k_base")
for s in ["settlement pending", "సెటిల్మెంట్ పెండింగ్ లో ఉంది"]:
    print(len(s.split()), "words ->", len(enc.encode(s)), "tokens")
# Anthropic: client.messages.count_tokens(model=..., messages=[...])`,
pit: [`Estimating cost by words or characters.`, `Using one provider's tokenizer to count another's tokens.`, `Asking the model for exact character-level operations without tools.`],
q: [`Why might the same message cost more in Hindi than English?`, `Hindi text usually splits into more tokens per word with typical tokenizers, and pricing is per token.`]
},
"The context window": {
d: `The **context window** is the maximum number of tokens in one request: system prompt + conversation history + documents + tool definitions + tool results + the model's **output** (and reasoning tokens). Today's models range from ~128k to 1M+ tokens.

The model is **stateless**: it remembers nothing between API calls. "Chat memory" is your application re-sending previous turns each time. So long chats grow cost and latency every turn, and eventually overflow.

Context management strategies: keep system prompts tight; **summarise** or drop old turns; retrieve only relevant documents (RAG) instead of sending everything; trim large tool outputs; store long-term facts outside and inject only what's needed; use **prompt caching** for stable prefixes (system prompt, tool definitions, big documents) to cut cost and latency.`,
life: `A consultant with no memory between meetings who only knows what's in the folder you hand them each time. The folder has a size limit, and every page you add costs reading time.`,
work: `An agent's cost per conversation grew from ₹2 to ₹40 for long sessions, because every turn re-sent full tool outputs (large JSON). Truncating tool results to relevant fields, summarising after 10 turns, and caching the 6k-token system prompt + tools cut average cost by 70%.`,
ex: `messages = [{"role": "user", "content": summary_of_old_turns}] + last_6_turns
resp = client.messages.create(
    model="claude-sonnet-...", max_tokens=1024,
    system=[{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
    messages=messages)`,
pit: [`Assuming the model remembers previous calls.`, `Unbounded chat history.`, `Dumping huge raw tool outputs into context.`],
q: [`Does an LLM API remember your previous request?`, `No. It's stateless; you must include any needed history or state in each request.`]
},
"Next-token probabilities": {
d: `A language model is a function: given the tokens so far, output a **probability distribution** over the whole vocabulary for the next token. Generation repeats this: pick a token, append it, run again, until a stop token or max length.

How you pick shapes the output:
- **Temperature**: divides logits before softmax. ~0 = almost always the top token (deterministic-ish, good for extraction/classification). Higher (0.7–1.0) = more varied, creative.
- **Top-p (nucleus)**: sample only from the smallest set of tokens whose probabilities sum to p.
- **Top-k**: sample only from the k most likely tokens.

Even at temperature 0, outputs aren't guaranteed identical across runs (batching, hardware non-determinism). And high probability ≠ true: a fluent, confident wrong answer is just a likely sequence (hallucination).`,
life: `Autocomplete on your phone, scaled up: it suggests the most likely next word. Low temperature always picks the first suggestion; high temperature sometimes picks the third, making text more surprising.`,
work: `A JSON extraction pipeline at temperature 0.8 produced slightly different field values on retries, breaking idempotency checks. Setting temperature 0 for extraction (and keeping 0.7 only for customer-facing wording) made outputs stable; schema validation caught the rare remaining format issues.`,
ex: `client.messages.create(model=..., max_tokens=300, temperature=0,
  messages=[{"role": "user", "content": "Extract merchant_id and amount as JSON: ..."}])
# creative copy
client.messages.create(model=..., max_tokens=300, temperature=0.9, messages=[...])`,
pit: [`High temperature for factual extraction.`, `Expecting temperature 0 to be perfectly deterministic.`, `Treating fluent output as evidence of correctness.`],
q: [`What does lowering temperature do?`, `Sharpens the distribution so the most likely tokens are picked more often, making output more focused and less varied.`]
},
"Structure the prompt": {
d: `A reliable prompt usually has:
1. **Role and goal** (system prompt): who the model is acting as and what success looks like.
2. **Context**, clearly delimited (e.g. «<documents>», «<customer_message>» tags), so the model knows what is data vs instruction.
3. **Instructions and constraints**: steps, rules, what to do when information is missing ("say you don't know"), tone, length.
4. **Examples** (few-shot): 2–5 input → ideal output pairs covering edge cases. Examples are the strongest signal for format and style.
5. **Output format**: exact schema or template.

Be specific and positive ("respond in 3 bullet points under 20 words each") rather than vague ("be concise"). Explain *why* a rule exists; models follow reasons better. Version prompts like code and test them against an eval set.`,
life: `Briefing a new temp: who they're working for, the relevant files in labelled folders, clear rules, a few sample completed forms, and the exact form to fill.`,
work: `A refund-reason classifier prompt was one paragraph; accuracy 78%. Restructured with a role, labelled category definitions, 6 examples including tricky ones (partial refunds, chargebacks), an "OTHER" rule and a JSON schema: 92% on the same eval set.`,
ex: `SYSTEM: You classify payment support tickets for an Indian payments company.
<categories>
REFUND_DELAY: customer is waiting for a refund that was already initiated
DOUBLE_DEBIT: charged twice for one order
OTHER: anything else
</categories>
<examples> ... </examples>
Reply with JSON only: {"category": "...", "reason": "<15 words"}
USER: <ticket>{{ticket_text}}</ticket>`,
pit: [`Mixing instructions inside user-provided data without delimiters.`, `No examples for format-sensitive tasks.`, `Changing prompts without re-running evals.`],
q: [`Why wrap user-provided text in tags?`, `It separates data from instructions, reducing confusion and making prompt injection inside the data less effective.`]
},
"Let it think, then answer": {
d: `Models compute one token at a time; writing out intermediate steps gives them more computation and a scratchpad to build on. For multi-step problems (calculations, multi-condition rules, comparing documents), asking the model to **reason first, then answer** improves accuracy. Many models also have built-in **extended thinking / reasoning** modes with a thinking budget.

Useful patterns:
- "Think step by step inside «<thinking>», then give the final answer in «<answer>»" (so you can parse just the answer).
- **Quote first**: "Extract the relevant quotes, then answer from them" for document Q&A.
- **Self-check**: "Verify your answer against the rules before finalising".

Trade-offs: more output tokens (cost, latency). For simple classification or extraction, thinking adds little. Never show raw reasoning to end users if it may contain unvetted content.`,
life: `Solving a maths word problem: students who write their working get more right than those who jump to an answer, and the teacher can see where it went wrong.`,
work: `A settlement-calculation assistant (fees, GST, holidays, T+1 rules) was wrong 22% of the time when asked for a direct number. Requiring reasoning in tags plus a final JSON, and enabling extended thinking with a modest budget, cut errors to 5%. The final number was still recomputed in code for payouts.`,
ex: `Calculate the settlement date and net amount.
First reason inside <thinking>: list applicable rules, holidays, fee and GST steps.
Then output only <answer>{"settlement_date": "...", "net_amount": ...}</answer>.
# or API: thinking={"type": "enabled", "budget_tokens": 4000}`,
pit: [`Using reasoning for trivial tasks (cost/latency).`, `Parsing the whole output instead of the answer section.`, `Trusting LLM arithmetic for money without code verification.`],
q: [`Why does asking for reasoning first often improve accuracy?`, `It gives the model intermediate tokens to compute with and condition the final answer on, rather than answering in one step.`]
},
"Structured outputs": {
d: `When code consumes the output, ask for **JSON with an explicit schema**. Options, from weakest to strongest:
1. Prompt instructions + examples ("reply with JSON only").
2. **Prefilling** the response with «{» (where supported).
3. **Tool/function calling** with an input schema (the model "calls" a function whose arguments are your structure).
4. **Structured outputs / constrained decoding**: the API restricts tokens so output must match the JSON schema.

Always **validate** in code (Pydantic, JSON Schema): types, enums, ranges, required fields. Schema-valid isn't the same as correct. Handle failures: retry with the validation error message, or fall back. Keep schemas small and descriptive (field descriptions help); use enums for categories.`,
life: `Giving someone a printed form with boxes and dropdowns instead of asking them to "write it down somewhere": you get the same structure every time and spot missing fields instantly.`,
work: `An invoice parser using "return JSON" prompts failed parsing on ~3% of documents (trailing text, missing quotes). Switching to structured outputs with a Pydantic schema dropped parse failures to ~0; validation still caught 1% semantic issues (GSTIN format, negative amounts), which were retried with the error message.`,
ex: `from pydantic import BaseModel, Field
class Invoice(BaseModel):
    gstin: str = Field(pattern=r"^[0-9]{2}[A-Z0-9]{13}$")
    total_inr: float = Field(ge=0)
    due_date: str
resp = client.messages.create(model=..., max_tokens=500,
    tools=[{"name": "record_invoice", "input_schema": Invoice.model_json_schema(),
            "description": "Record parsed invoice fields"}],
    tool_choice={"type": "tool", "name": "record_invoice"}, messages=[...])
inv = Invoice(**resp.content[0].input)`,
pit: [`Parsing free text with regex.`, `No validation after generation.`, `Huge nested schemas that confuse the model.`],
q: [`Constrained decoding guarantees schema-valid JSON. Do you still need validation?`, `Yes: the values can still be wrong (bad dates, amounts, business rules); validate semantics in code.`]
},
"Tool use (function calling)": {
d: `You give the model a list of **tools**: name, description, and a JSON-schema for inputs. Instead of answering directly, the model can emit a **tool call** («get_order_status(order_id="ORD-991")»). Your code executes it, sends back a **tool result**, and the model continues, maybe calling more tools, until it produces a final answer. This loop is the core of **agents**.

The model never executes anything itself; **your code** does, so your code enforces auth, validation, rate limits and confirmations. Good tool design: clear names and descriptions (when to use, when not to), small focused tools, helpful error messages the model can act on, and returning only relevant fields. Tools can run in **parallel** when independent.`,
life: `A manager (the model) who can't use the computer but can ask an assistant (your code): "look up order 991". The assistant decides whether the manager is allowed to see it, runs the lookup and reports back.`,
work: `A merchant-support assistant answered "where is my settlement?" by guessing. Adding tools «get_settlements(merchant_id, date_range)» and «get_holiday_calendar()», with the merchant id injected from the session (not from the model), made answers accurate and safe: the model couldn't query another merchant's data even if a message asked it to.`,
ex: `tools = [{"name": "get_settlements",
  "description": "Settlements for the logged-in merchant. Use for questions about payouts.",
  "input_schema": {"type": "object", "properties": {
      "from_date": {"type": "string"}, "to_date": {"type": "string"}},
    "required": ["from_date", "to_date"]}}]
while True:
    r = client.messages.create(model=..., tools=tools, messages=msgs, max_tokens=1024)
    if r.stop_reason != "tool_use": break
    call = next(b for b in r.content if b.type == "tool_use")
    out = get_settlements(merchant_id=session.mid, **call.input)   # auth from session
    msgs += [{"role": "assistant", "content": r.content},
             {"role": "user", "content": [{"type": "tool_result", "tool_use_id": call.id, "content": json.dumps(out)}]}]`,
pit: [`Letting the model supply identity/authorization parameters.`, `Vague tool descriptions causing wrong tool choice.`, `Returning huge raw payloads as tool results.`],
q: [`Who actually executes a tool call?`, `Your application code; the model only proposes the call and its arguments.`]
},
"What happens inside one forward pass": {
d: `A forward pass turns the tokens so far into a prediction for the next one, in three parts.

**Embedding**: each token id becomes a vector (e.g. 4,096 numbers). Position information is added, usually as **RoPE** rotary encodings applied inside attention.

**Transformer layers** (dozens of them), each with two blocks wrapped in residual connections and normalisation:
- **Self-attention**: every token computes a query, key and value. It compares its query with the keys of earlier tokens (a causal mask hides later ones) and mixes their values. Many **heads** look for different relationships. Modern models use **GQA** (fewer key/value heads) to shrink the KV cache.
- **Feed-forward (MLP)**: a per-token network, often the largest share of parameters. In **MoE** models a router sends each token to a few "expert" MLPs.

**Output**: the final vector at the last position is projected to vocabulary size, giving **logits**, then probabilities for the next token.`,
life: `Each word at a meeting listens to everything said before it (attention), updates its understanding, then thinks on its own (feed-forward). After many rounds, the last speaker predicts what's said next.`,
work: `Explaining GPU memory for serving to an infra team: an 8B model with 32 layers, 8 KV heads (GQA) of size 128 in bf16 needs per token 2 (K,V) × 32 × 8 × 128 × 2 bytes ≈ 128 KB of KV cache. 100 concurrent 8k-token conversations ≈ 100 GB, more than the weights. That's why they chose a GPU with more memory and enabled KV-cache quantization.`,
ex: `# per-token KV cache bytes
layers, kv_heads, head_dim, bytes_per = 32, 8, 128, 2
kv_per_token = 2 * layers * kv_heads * head_dim * bytes_per   # 131,072 bytes
print(kv_per_token * 8192 * 100 / 1e9, "GB for 100 x 8k-token sequences")`,
pit: [`Thinking the model "looks up" facts in a database.`, `Ignoring KV cache when sizing GPU memory.`, `Assuming attention sees future tokens (causal mask prevents it).`],
q: [`What does the causal mask do?`, `It prevents each token from attending to later tokens, so predictions only use the past.`]
},
"Prefill vs decode": {
d: `Generation has two phases:
- **Prefill**: the whole prompt is processed **in parallel** in one forward pass. It's **compute-bound** (big matrix multiplications) and fills the **KV cache** with keys/values for every prompt token. Its time shows up as **time to first token (TTFT)**, growing with prompt length.
- **Decode**: one new token per step. Each step must read the weights and the whole KV cache from GPU memory for very little compute, so it's **memory-bandwidth-bound**. Its speed is **inter-token latency / tokens per second**.

Serving systems exploit this: **continuous batching** (mix many users' decode steps), **paged attention** (vLLM) for KV memory, **prefix/prompt caching** (reuse KV for shared prefixes), **chunked prefill**, **speculative decoding** (a small model drafts tokens, the big one verifies several at once), and **disaggregated** prefill/decode on separate GPUs.`,
life: `Reading a long brief before a meeting (prefill: fast reading in bulk) vs answering questions one word at a time while flipping back through your notes each time (decode).`,
work: `A RAG endpoint had p95 TTFT of 4 s with 12k-token prompts. The instructions + tool definitions were 6k tokens and identical across requests. Enabling prompt caching on that prefix cut TTFT to 1.6 s and input cost by ~50%; reducing retrieved chunks from 12 to 6 brought it to 1.1 s.`,
ex: `# measure both phases
t0 = time.time(); first = None; n = 0
with client.messages.stream(model=..., max_tokens=500, messages=msgs) as s:
    for text in s.text_stream:
        if first is None: first = time.time() - t0     # TTFT ≈ prefill
        n += 1
print("TTFT", first, "tokens/s", n / (time.time() - t0 - first))`,
pit: [`Optimising output speed when users wait on TTFT.`, `Huge prompts for every request without caching.`, `Comparing models without separating TTFT and tokens/s.`],
q: [`Which phase is memory-bandwidth-bound and why?`, `Decode: each step generates one token but must read all weights and the KV cache from memory.`]
},
"From logits to a token": {
d: `The final layer outputs **logits** (unnormalised scores) for every vocabulary token. Sampling pipeline (order varies by implementation):
1. Apply **penalties**: repetition/frequency/presence penalties lower logits of tokens already used; **logit bias** can force or forbid tokens.
2. **Temperature**: logits ÷ T. T < 1 sharpens, T > 1 flattens. T → 0 ≈ greedy (argmax).
3. **Filtering**: **top-k** keeps the k highest; **top-p** keeps the smallest set with cumulative probability ≥ p; **min-p** drops tokens below a fraction of the top token's probability.
4. **Softmax** → probabilities → **sample** one token.
5. **Constrained decoding** (grammars/JSON schema) masks tokens that would break the format.

**Beam search** (tracking several candidate sequences) is used in translation but rarely in chat LLMs.`,
life: `Choosing a dish: you rank options (logits), cross off dishes you had yesterday (penalty), decide how adventurous you're feeling (temperature), keep only the shortlist (top-p) and then pick.`,
work: `A product-description generator repeated phrases ("premium quality") in long outputs. Adding a mild frequency penalty and top-p 0.9 at temperature 0.8 reduced repetition without hurting fluency; for SKU-code extraction they used temperature 0 with a grammar so only valid codes could be produced.`,
ex: `import numpy as np
def sample(logits, T=0.7, top_p=0.9):
    z = logits / T
    p = np.exp(z - z.max()); p /= p.sum()
    idx = np.argsort(-p); cum = np.cumsum(p[idx])
    keep = idx[: np.searchsorted(cum, top_p) + 1]
    q = p[keep] / p[keep].sum()
    return np.random.choice(keep, p=q)`,
pit: [`Tuning temperature and top-p together blindly.`, `Penalties hurting outputs that legitimately repeat terms (code, JSON).`, `Assuming providers apply the same defaults.`],
q: [`What's the difference between top-k and top-p?`, `Top-k keeps a fixed number of tokens; top-p keeps a variable number whose cumulative probability reaches p.`]
},
"The training pipeline": {
d: `1. **Pretraining**: next-token prediction over trillions of tokens of web, books, code, papers. Produces a **base model** with broad knowledge and skills but no reliable instruction following. Most of the compute goes here.
2. **Supervised fine-tuning (SFT)**: curated (prompt, ideal response) examples teach the assistant format: follow instructions, answer helpfully, use tools.
3. **Preference / RL training**: **RLHF** (reward model + PPO), **DPO**-style methods, **RLAIF / Constitutional AI** (AI feedback against principles), and **RL with verifiable rewards** (maths, code tests) that builds reasoning skill. This shapes helpfulness, honesty, safety and style.
4. **Evaluation and red-teaming** throughout; then deployment with system prompts and safeguards.

Knowledge comes mostly from pretraining (with a **cutoff date**); behaviour mostly from post-training. That's why RAG/tools are used for fresh facts.`,
life: `Pretraining is a student reading an entire library. SFT is an internship where seniors show how to do the job. RLHF is performance reviews that reward good judgement.`,
work: `Explaining to a stakeholder why the bot didn't know last month's RBI circular: the model's knowledge stops at its training cutoff, and fine-tuning wouldn't keep up with weekly changes. The solution was retrieval over the circular archive plus a date-aware prompt.`,
ex: `base model:  "The capital of France is" -> " Paris. The capital of Germany is ..."
SFT model:   "What's the capital of France?" -> "Paris."
pref-tuned:  same, but concise, honest about uncertainty, refuses unsafe requests`,
pit: [`Thinking the model learns from your chats in real time (it doesn't, by default).`, `Expecting a base model to follow instructions.`, `Assuming knowledge after the cutoff.`],
q: [`Which stage gives the model most of its factual knowledge?`, `Pretraining.`]
},
"Long context isn't free recall": {
d: `A 1M-token window means the model **accepts** that much input, not that it uses all of it equally well. Known effects:
- **Lost in the middle**: information in the middle of long contexts is used less reliably.
- **Distractors**: similar-but-irrelevant passages cause wrong answers; accuracy drops as context grows ("context rot").
- **Multi-hop reasoning** across far-apart facts degrades more than simple needle-in-a-haystack retrieval, which benchmarks often overstate.
- **Cost and latency** scale with tokens (prefill time, price per token), even with caching.

So: retrieve and send only what's relevant; order important material first or near the question; restate the question after long documents; ask for quotes/citations; split big jobs into map-reduce steps (summarise chunks, then combine).`,
life: `Being handed a 900-page file and asked one question: you *can* read it all, but you'll answer more accurately (and faster) if someone hands you the five relevant pages.`,
work: `A contract-review prototype sent entire 300-page agreements (200k tokens) per question: 40 s and ₹60 per question, with missed clauses buried mid-document. A pipeline that split by section, retrieved relevant clauses, and ran per-clause checks took 6 s, cost ₹4 and found 15% more issues in the eval set.`,
ex: `# map-reduce over a long document
summaries = [llm(f"Extract obligations and deadlines from:\\n{sec}") for sec in sections]
answer = llm("Using these extracts, list all payment deadlines with section refs:\\n" + "\\n".join(summaries))`,
pit: [`Relying on needle-in-haystack scores as proof of real-world recall.`, `Sending whole corpora per question.`, `No citations to verify where answers came from.`],
q: [`Why can accuracy drop when you add more documents to a long-context prompt?`, `More distractors and longer context make the model less likely to find and correctly use the relevant information.`]
}
});
