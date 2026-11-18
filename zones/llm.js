QUEST.zone("llm", {
mission:["kai","We're building an AI support assistant for merchants. Before any framework, you need to know how the model itself behaves: tokens, sampling, context and structured output."],
levels:[
{t:"Tokens & context", sub:"What the model sees", rounds:[
 ["learn","Text becomes tokens","Models read and write **tokens**: sub-word pieces from a fixed vocabulary (BPE-style). In English, 1 token ≈ ¾ of a word on average. Pricing, limits and latency are all counted in tokens.",["Text","Tokenizer splits into tokens","Model predicts next token","Repeat until stop"]],
 ["learn","The context window","Everything the model sees in one call (system prompt, history, documents, tools, its own output) must fit the **context window**. The model is **stateless**: chat 'memory' is your app resending history."],
 ["pick","A chatbot 'forgot' what the user said 40 turns ago. Most likely reason?",["The model learned and unlearned","History was truncated to fit the context window","Temperature too high","The tokenizer failed"],1,"Summarise or retrieve older turns instead of dropping them."],
 ["sort","Counts toward the context window?",{"Yes":["System prompt","Retrieved documents","Tool definitions","The model's output"],"No":["Model weights","Last week's separate conversation (unless resent)"]},"Only what you send in this request counts."],
 ["tf","Token facts",[["Output tokens usually cost more than input tokens.",true,"Generation is the expensive part."],["Non-English text often uses more tokens per word.",true,"Tokenizers are skewed to their training data."],["Models remember earlier API calls automatically.",false,"Each call is stateless."]]]
]},
{t:"Sampling", sub:"Temperature, top-p, stops", rounds:[
 ["learn","Next-token probabilities","At each step the model outputs a probability for every token. **Temperature** reshapes them (low = focused, high = varied). **Top-p** samples from the smallest set whose probabilities add to p. **Max tokens** caps length; **stop sequences** end early."],
 ["match","Setting → effect",[["temperature 0","Most likely tokens: repeatable, focused"],["temperature 1","Default variety"],["top_p 0.9","Ignore the unlikely 10% tail"],["max_tokens","Hard cap on output length"]],"Low temperature for extraction, higher for brainstorming."],
 ["sort","Low or higher temperature?",{"Low":["Extract invoice fields to JSON","Classify ticket category","SQL generation"],"Higher":["Brainstorm campaign names","Write varied marketing copy"]},"Determinism vs diversity."],
 ["pick","Output stops mid-sentence and stop_reason says max_tokens. Fix?",["Raise max_tokens or ask for a shorter answer","Raise temperature","Lower top_p","Change the tokenizer"],0,"The cap was hit."],
 ["tf","Sampling facts",[["Temperature 0 guarantees identical outputs forever.",false,"Mostly stable, but not guaranteed across runs or versions."],["Hallucinations come from predicting plausible text, not looking things up.",true,"Ground answers with retrieved sources."]]]
]},
{t:"Prompting", sub:"System prompts, examples", rounds:[
 ["learn","Structure the prompt","Give the model a **role and goal** (system prompt), **context** clearly delimited (e.g. XML tags), **explicit instructions and constraints**, **examples** of good output (few-shot), and the output **format**. Say what to do, not only what not to do."],
 ["order","Build a solid support prompt",["Role and goal in the system prompt","Merchant context in <context> tags","Rules: tone, what to refuse, when to escalate","Two examples of ideal replies","Required output format"],"Clear structure beats clever wording."],
 ["learn","Let it think, then answer","For multi-step problems, ask the model to reason before answering (or use a model's extended thinking). Ask it to quote the relevant source text before answering to reduce hallucinations."],
 ["pick","The assistant invents refund policies. Best first fix?",["Raise temperature","Put the real policy in context and instruct it to answer only from it, else escalate","Use a bigger font","Remove the system prompt"],1,"Grounding + an explicit 'I don't know' path."],
 ["match","Technique → when",[["Few-shot examples","Output style/format must be consistent"],["XML tags","Separate instructions from untrusted documents"],["Prompt chaining","Task has distinct stages"],["Prefill / format instructions","Force JSON or a specific start"]],"Combine as needed."]
]},
{t:"Structured output & tools", sub:"JSON, function calling", rounds:[
 ["learn","Structured outputs","Ask for JSON with a **schema**. Many APIs offer constrained decoding / structured outputs that guarantee schema-valid JSON. Still **validate** in code (e.g. Pydantic) before using it."],
 ["learn","Tool use (function calling)","You describe tools (name, description, JSON-schema input). The model replies with a **tool call**; your code runs it and sends the **result** back; the model continues. The model never executes anything itself.",["Send tools + user message","Model returns tool_use","Your code executes it","Send tool_result","Model answers"]],
 ["order","One tool-use round trip",["Send the user question with tool definitions","Model responds with a tool call and arguments","Your app validates and runs the tool","Send the tool result back","Model writes the final answer"],"Loop while the model keeps calling tools."],
 ["bug","Which part of this tool definition will confuse the model most?",["name: get_payment_status","description: 'stuff'","input_schema: {type: object, properties: {payment_id: {type: string}}}","required: ['payment_id']"],1,"Descriptions are how the model decides when and how to call a tool. Explain what it does, when to use it and the argument format."],
 ["tf","Tool facts",[["The model executes the tool on its own servers.",false,"Your code runs it (unless it's a provider-hosted tool)."],["Tool results should be treated as untrusted input.",true,"They can contain prompt injection."],["Good tool descriptions improve tool choice.",true,"They're part of the prompt."]]]
]},
{t:"Boss: Support assistant", boss:true, time:30, rounds:[
 ["pick","Answers vary wildly for the same ticket classification. Fix?",["Lower temperature + few-shot examples","Raise max_tokens","Longer system prompt only","Higher top_p"],0,"Consistency."],
 ["pick","The bot invents order statuses. Fix?",["Give it a get_order_status tool and require using it","Raise temperature","Remove history","Bigger model only"],0,"Ground in real data."],
 ["pick","JSON output sometimes breaks the parser. Fix?",["Structured outputs with a schema + validation","Ask nicely","Increase temperature","Stop sequences"],0,"Constrain and validate."],
 ["pick","Long chats get expensive and slow. Fix?",["Summarise old turns / trim history","Raise max_tokens","Add more examples","Use temperature 2"],0,"Fewer input tokens."],
 ["pick","A pasted email tells the bot to reveal internal notes. Fix?",["Treat pasted content as data in tags; never follow its instructions","Higher temperature","More tools","Bigger context"],0,"Separate instructions from data."],
 ["pick","Answers cut off mid-sentence. Fix?",["Raise max_tokens","Lower temperature","Add stop sequences","Fewer tools"],0,"The cap was hit."]
]}
]});

QUEST.more("llm", [
{act:"Expert", t:"Transformer internals", sub:"Embeddings, attention, layers", rounds:[
 ["learn","What happens inside one forward pass","Tokens become **embedding vectors**. Each transformer **layer** applies **self-attention** (every token looks at earlier tokens) and an **MLP**, each wrapped with a residual connection and normalization. The last layer's vector for the final position becomes **logits** over the vocabulary.",["Token ids → embeddings (+ position info)","N layers: attention + MLP with residuals","Final hidden state → logits","Softmax → probabilities","Sample next token"],null,`### Attention in one paragraph
For each token, the layer computes a **query** (what am I looking for?), **key** (what do I contain?) and **value** (what do I pass on?). Attention weights = softmax(Q·Kᵀ / √d) over previous positions (a **causal mask** hides future tokens). The output is the weighted sum of values. **Multi-head** attention runs many of these in parallel with different projections, so heads can track syntax, coreference, copying, etc.

### Position
Attention itself is order-blind, so models inject position. Most modern LLMs use **RoPE** (rotary position embeddings), rotating Q and K by position so dot products depend on relative distance — which also makes context-length extension tricks possible.

### Cost
Attention compares every token with every earlier token: compute grows with **n²** in sequence length (memory-efficient kernels like FlashAttention avoid materializing the n×n matrix, but the work remains quadratic). MLP cost grows linearly with n. That's why very long prompts are slow and expensive.

### Variants you'll hear about
- **GQA / MQA**: many query heads share fewer key/value heads → smaller KV cache, faster inference.
- **Mixture of Experts (MoE)**: each token is routed to a few expert MLPs out of many; huge total parameters, much smaller active parameters per token.`],
 ["order","One decoding step, inside the model",["Look up embeddings for the tokens","Each layer: attention over previous tokens","Each layer: MLP transformation (with residuals)","Project final hidden state to logits","Softmax and sample the next token"],"Repeat with the new token appended."],
 ["num","Attention work grows with n². If a prompt goes from 8,000 to 32,000 tokens, attention compute grows by what factor?",16,0,"×","(32,000 / 8,000)² = 4² = 16×. MLP work grows only 4×."],
 ["match","Term",[["Causal mask","Tokens can't attend to future positions"],["RoPE","Rotary position encoding on queries and keys"],["GQA","Query heads share fewer key/value heads"],["MoE","Each token uses a few of many expert MLPs"],["Residual connection","Adds a layer's input to its output"]],"Vocabulary for reading model cards."],
 ["tf","Internals truths",[["Self-attention in a decoder can look at future tokens.",false,"The causal mask prevents it."],["An MoE model with 400B total parameters uses all 400B for every token.",false,"Only the routed experts are active."]]]
]},
{act:"Expert", t:"Inference engineering", sub:"Prefill, decode, KV cache", rounds:[
 ["learn","Prefill vs decode","**Prefill** processes the whole prompt in parallel (compute-bound) and fills the **KV cache**. **Decode** generates one token at a time, reading the full KV cache and weights each step (memory-bandwidth-bound). TTFT ≈ prefill time; tokens/sec ≈ decode speed.",null,null,`### KV cache size
Per token, each layer stores a key and a value vector for each KV head:
«bytes = 2 × layers × kv_heads × head_dim × bytes_per_value × tokens»
Example: 32 layers, 8 KV heads (GQA), head_dim 128, fp16 (2 bytes), 8,000 tokens → 2 × 32 × 8 × 128 × 2 × 8,000 ≈ 1.05 GB per sequence. With 64 concurrent long conversations, KV cache, not weights, dominates GPU memory.

### Serving techniques
- **Continuous batching**: new requests join the batch at every step instead of waiting for the batch to finish (vLLM, TGI, TensorRT-LLM).
- **PagedAttention**: KV cache in fixed blocks like virtual memory → little fragmentation, prefix sharing.
- **Prefix caching**: reuse the KV cache of a shared prompt prefix (system prompt, documents) across requests — that's what provider **prompt caching** sells you.
- **Speculative decoding**: a small draft model proposes several tokens, the big model verifies them in one pass; same output distribution, faster.
- **Quantization**: int8/fp8/int4 weights (and KV cache) cut memory and bandwidth; quality loss depends on method.

### Why output tokens cost more
Each output token needs a full decode step over the model; input tokens are processed in parallel during prefill.`],
 ["num","KV cache: 32 layers, 8 KV heads, head_dim 128, fp16 (2 bytes), 8,000 tokens. Size in MiB (1 MiB = 1,048,576 bytes)?",1000,1,"MiB","2 × 32 × 8 × 128 × 2 × 8,000 = 1,048,576,000 bytes = 1,000 MiB."],
 ["sort","Mostly improves TTFT or throughput?",{"TTFT (time to first token)":["Prefix / prompt caching of a long system prompt","Shorter prompts"],"Throughput (tokens/s, requests/s)":["Continuous batching","Speculative decoding","Quantized weights on memory-bound decode"]},"Prefill vs decode bottlenecks."],
 ["pick","Why does doubling concurrent long-context users run a GPU server out of memory before compute saturates?",["KV cache grows per sequence and per token","Weights are copied per user","Tokenizer memory","Logits are cached"],0,"Long contexts × many users = huge KV cache."],
 ["tf","Inference truths",[["Speculative decoding changes the model's output distribution.",false,"Verification keeps it identical (for exact schemes)."],["Decode is usually memory-bandwidth-bound.",true,"It streams weights and KV cache every token."]]]
]},
{act:"Expert", t:"Decoding & control", sub:"Logits, constrained decoding, logprobs", rounds:[
 ["learn","From logits to a token","Logits are divided by **temperature**, filtered (top-k: keep k most likely; top-p: smallest set with cumulative probability ≥ p; min-p: drop tokens below a fraction of the top token's probability), renormalized and sampled.",null,null,`### Temperature maths
p_i = exp(z_i / T) / Σ exp(z_j / T). As T → 0 the distribution collapses onto the argmax (greedy); T > 1 flattens it. Two logits 2.0 and 1.0 at T = 1 give probabilities ≈ 0.73 / 0.27; at T = 0.5 they become ≈ 0.88 / 0.12.

### Constrained decoding
Structured outputs work by **masking** invalid tokens at each step according to a JSON schema or grammar, so the model can only produce valid output. The schema is compiled into a state machine; providers cache it. Caveat: the model can still put wrong **values** in valid structure.

### Logprobs
Some APIs return log probabilities per output token. Uses: confidence estimates for classification, detecting uncertain extractions, calibrating thresholds. Low max-logprob on a key field → route to human review.

### Penalties and stops
Frequency/presence penalties discourage repeating tokens; stop sequences end generation; max tokens caps it. Reasoning models may ignore or restrict sampling parameters — check the provider's docs.

### Determinism
Even at temperature 0, outputs can vary across runs because of floating-point non-associativity in batched GPU kernels and provider-side changes. For reproducibility, pin model versions and evaluate on samples, not single runs.`],
 ["num","Two candidate tokens with logits 2.0 and 1.0 at temperature 1. Probability of the first (2 decimals)?",0.73,0.01,"","exp(2) / (exp(2) + exp(1)) = 7.39 / (7.39 + 2.72) ≈ 0.73."],
 ["match","Technique → use",[["Constrained decoding","Guarantee schema-valid JSON"],["Logprobs","Flag low-confidence classifications"],["min-p","Drop tokens far less likely than the top token"],["Stop sequences","End output at a delimiter"]],"Control the output, not just the prompt."],
 ["pick","Structured outputs guarantee valid JSON, yet extracted amounts are sometimes wrong. Why?",["Constraints enforce structure, not correctness of values","Temperature too low","Tokenizer issue","JSON is too strict"],0,"Validate values and evaluate extraction accuracy."],
 ["tf","Decoding truths",[["Temperature 0.5 makes the top token more likely than at temperature 1.",true,"Lower temperature sharpens the distribution."],["Temperature 0 guarantees bit-identical outputs across runs.",false,"Numerics and provider changes can vary results."]]]
]},
{act:"Expert", t:"How models are trained", sub:"Pretraining to RL", rounds:[
 ["learn","The training pipeline","**Pretraining**: next-token prediction on trillions of tokens → broad knowledge and skills. **Supervised fine-tuning**: examples of helpful responses. **Preference training** (RLHF, RLAIF, DPO, constitutional methods): prefer better answers. **RL with verifiable rewards**: reasoning on math/code with automatically checkable answers.",["Pretraining (next-token)","SFT on demonstrations","Preference optimization","RL on verifiable tasks","Safety training and evals"],null,`### Why hallucinations happen
Pretraining rewards **plausible continuations**, and evaluation/training setups often reward guessing over saying "I don't know". Models learn calibrated-ish uncertainty internally but don't always express it. Mitigations: grounding (RAG/tools), instructing to abstain, training that rewards abstention, and checking claims.

### Knowledge cutoff
Pretraining data stops at a date. Facts after it are unknown unless supplied in context. Models may also be unsure about the exact cutoff.

### Reasoning models
Trained with RL to produce long internal **reasoning** before answering; performance scales with **test-time compute** (thinking budget). Better for multi-step math, code, planning; slower and costlier for simple tasks.

### Evaluation pitfalls
- **Contamination**: benchmark questions leaked into training data inflate scores.
- **Saturation**: top models all near 100% on old benchmarks.
- Your own **task-specific evals** matter more than leaderboards.`],
 ["order","Typical training stages",["Pretraining on large text corpora","Supervised fine-tuning on demonstrations","Preference optimization (RLHF / DPO / AI feedback)","Reinforcement learning on verifiable tasks","Safety evaluations and red-teaming"],"Order varies by lab, but this is the common shape."],
 ["sort","Mitigates hallucination or not?",{"Mitigates":["Ground answers in retrieved sources","Allow and reward 'I don't know'","Verify claims with tools"],"Doesn't":["Raising temperature","Longer system prompt praising accuracy","Asking the model to be confident"]},"Grounding and abstention beat exhortation."],
 ["tf","Training truths",[["Benchmark contamination can inflate scores.",true,"Use private, task-specific evals."],["Reasoning models are always the best choice.",false,"Costlier and slower; use where multi-step reasoning helps."]]]
]},
{act:"Expert", t:"Long context & caching economics", sub:"Context rot, prompt caching", rounds:[
 ["learn","Long context isn't free recall","Models can accept huge contexts but **recall and reasoning degrade** with length and distractors ('context rot', 'lost in the middle'). Simple needle-in-a-haystack tests overstate real performance on multi-fact reasoning over long inputs.",null,null,`### Practical rules
- Put instructions at the top (system) and the question near the **end**, after long documents.
- Ask the model to **quote** relevant passages first, then answer.
- Retrieve and include only relevant chunks instead of whole corpora when quality matters.
- Measure on your own long-context tasks.

### Prompt caching economics (pattern)
Providers cache the processed prefix (KV cache) for a time window. A typical scheme: **cache writes cost a bit more** than normal input (e.g. 1.25×), **cache reads cost a fraction** (e.g. 0.1×), and TTFT drops because prefill of the cached part is skipped.
- Put stable content first (tools, system prompt, documents), variable content last.
- Any change early in the prefix invalidates everything after it.
- Watch cache hit rate metrics (cache_read vs cache_creation tokens).

### Worked example
50,000-token system prompt, 100 calls in the cache window, $3 per million input tokens:
- No cache: 100 × 50k = 5M tokens → $15.
- Cached: 1 write at 1.25× (62.5k) + 99 reads at 0.1× (495k) ≈ 557.5k token-equivalents → about $1.67.`],
 ["num","50,000-token prefix, 100 calls, $3/M input tokens. Cache write 1.25×, reads 0.1× (99 reads). Cost with caching in USD (2 decimals)?",1.67,0.02,"USD","(62,500 + 495,000) tokens × $3 / 1,000,000 ≈ $1.67 vs $15 uncached."],
 ["bug","Which prompt layout destroys cache hits?",["[tools definitions]","[system prompt: support rules]","[current timestamp: 2026-11-18 10:42:17]","[policy documents, 40k tokens]"],2,"A changing timestamp early in the prefix invalidates the cache for everything after it. Move variable content to the end."],
 ["pick","Long-document QA misses facts in the middle of a 150k-token context. Best first fix?",["Retrieve relevant sections and ask for quotes before answering","Raise temperature","Repeat the question 5 times","Use a smaller model"],0,"Less noise, explicit grounding."],
 ["tf","Context truths",[["Passing a needle-in-a-haystack test proves strong long-context reasoning.",false,"It's a simple retrieval test."],["Stable content should go at the start of the prompt for caching.",true,"Prefix-based caching."]]]
]},
{act:"Expert", t:"Expert boss: Model internals review", boss:true, time:45, rounds:[
 ["pick","GPU server OOMs with 50 users at 100k context, not at 8k. Cause?",["KV cache memory per sequence","Weights duplicated","Tokenizer","Logprobs"],0,"KV cache scales with tokens × users."],
 ["pick","Users complain about slow first token on a 60k-token prompt that's identical each call. Fix?",["Prompt caching of the stable prefix","Higher temperature","Speculative decoding only","Larger max_tokens"],0,"Skip repeated prefill."],
 ["pick","JSON is valid but field values are often wrong. Next step?",["Evaluate extraction accuracy, add examples/validation","More constrained decoding","Temperature 2","Shorter schema"],0,"Structure ≠ correctness."],
 ["pick","A classifier must route uncertain cases to humans. Use…",["Logprob thresholds on the label tokens","top_p 0.1","Stop sequences","Longer prompts"],0,"Confidence from logprobs."],
 ["pick","Throughput is poor though GPU compute is idle much of the time during generation. Try…",["Continuous batching / speculative decoding","Bigger prompts","Higher temperature","Disable caching"],0,"Decode is bandwidth-bound; batch more work per step."],
 ["pick","Benchmark says 92%, your task eval says 64%. Trust…",["Your task-specific eval","The benchmark","Neither","Average both"],0,"Leaderboards don't measure your task."],
 ["pick","Moving the date header from the top to the end of the prompt cut costs 70%. Why?",["Cache hits on the now-stable prefix","Fewer tokens","Better tokenization","Lower temperature"],0,"Prefix caching."]
]}
]);

QUEST.story("llm", {title:"The bot that cut off mid-sentence", icon:"✂️", place:"Thu 4 PM · support assistant", setup:"Long merchant chats end with half answers, cost per chat doubled, and the bot sometimes forgets what the merchant said at the start.",
 meters:[["cut","Truncated answers","%",14,1,"low",20],["cost","Cost per chat"," ₹",4.2,1.5,"low",5],["trust","Merchant trust","%",45,70,"high",100]],
 beats:[["kai","Look at this chat: 64 messages, and the answer stops mid-word."],["ui","model: context 200k tokens · max_tokens: 512\nprompt tokens this turn: 58,210 (full history + 12 policy docs)\nfinish_reason: max_tokens"],
  ["q","Why did the answer stop mid-sentence?",[["It hit max_tokens: the output limit, not the context window",1,"finish_reason=max_tokens says the model was cut off by the output cap you set.","A speaker whose mic is cut after 30 seconds."],["The context window is full",0.5,"58k of 200k is fine; it's the output cap.","The room isn't full; the mic is muted."],["The model crashed",0,"It stopped by design.","The speaker didn't faint."]]],
  ["q","Cost doubled because every turn re-sends 58k tokens. Best fix?",[["Summarise or trim old turns, retrieve only relevant docs per turn, and use prompt caching for the fixed prefix",1,"Input tokens are billed every call; send less, cache what repeats.","Don't re-read the whole diary every time someone speaks."],["Use a bigger context model",0,"More room, same cost per token.","A bigger diary."]]],
  ["q","How do you make sure it remembers the key facts from the start?",[["Keep a short running summary or structured 'facts so far' (merchant id, issue) pinned in the prompt",1,"Important facts stay near the top, compact, instead of buried in 60 turns.","Sticky notes on the folder's cover."],["Raise temperature",0,"Unrelated.","Speaking more creatively doesn't improve memory."]]],
  ["kai","No more cut-offs, ₹1.3 per chat, and it remembers the order id."]],
 learned:["max_tokens caps output; context window caps input + output.","You pay for input tokens every turn: trim, retrieve, cache.","Pin key facts in a compact summary."]});
QUEST.mock("llm", {title:"LLM fundamentals round", who:"rohit", intro:"Rohit here. Let's check your LLM fundamentals.", setup:"Rohit leads the AI platform team.",
 qs:[["What is a token and why does it matter?","Tokens are the sub-word units the model reads and writes (roughly ¾ of an English word; Indian languages often take more). Context limits, latency and **price** are all per token, and long inputs dilute attention.",[["Sub-word units; limits, latency and cost are counted in tokens",1,"Practical."],["A token is a word",0.5,"Approximate; sub-word."],["An API key",0,"No."]]],
  ["Temperature 0 vs 1?","Temperature scales the probability distribution before sampling. **0** ≈ most likely token every time (consistent; good for extraction, classification); higher = more varied (brainstorming). It doesn't add knowledge or reduce hallucination by itself.",[["Controls randomness of sampling; low for consistent tasks, higher for creative ones; doesn't add facts",1,"Accurate."],["Higher temperature makes the model smarter",0,"No."],["Temperature controls max length",0,"That's max_tokens."]]],
  ["Why do LLMs hallucinate, and how do you reduce it?","They generate likely text, not verified facts. Reduce with **grounding** (RAG with citations), instructions to abstain, tool use for facts (DB lookups, calculators), constrained outputs (schemas), evals measuring faithfulness, and human review for high stakes.",[["They predict plausible text; ground with retrieval/tools, allow abstaining, constrain outputs, measure with evals",1,"Complete."],["Lower temperature fixes it",0.5,"Only makes errors consistent."],["Bigger models never hallucinate",0,"They do."]]],
  ["When would you fine-tune instead of prompting or RAG?","Prompting first; RAG for **knowledge** that changes. Fine-tune for **behaviour**: consistent format/style, a narrow task at lower cost/latency with a smaller model, or domain language. Needs good labelled data and evals.",[["Prompt first, RAG for changing knowledge, fine-tune for consistent behaviour or cheaper specialised models",1,"Mature answer."],["Fine-tune to teach new facts",0.5,"Unreliable for facts and stale quickly."],["Always fine-tune",0,"Costly and often unnecessary."]]]],
 learned:["Tokens drive limits and cost.","Temperature = randomness, not knowledge.","Prompt → RAG → fine-tune."]});
