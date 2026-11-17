// LLM Fundamentals course content. Each lesson names a lab implemented in course-engine.js.
window.COURSE_LLM = {
id:"llm", title:"LLM Fundamentals, played",
tagline:"Learn how language models really work by poking them: drag sliders, guess tokens, fix broken JSON and write prompts that run against a live model.",
story:"You just joined the support team at Paydesk, a payments startup that gets 10,000 tickets a day. Your new teammate is an LLM. By the end of this course you will have built a ticket sorter that runs on it.",
units:[
/* ===================== UNIT 1 ===================== */
{title:"How a model writes", hue:28, desc:"Tokens, probabilities and the one-token-at-a-time loop.",
items:[
{id:"1", title:"Meet your model", mins:5, lab:"nextToken", labTitle:"Be the model",
sum:"An LLM does exactly one thing: predict the next token. Everything else is that skill on repeat.",
mission:"Before you trust your new teammate with customer tickets, find out how it thinks. Spoiler: it is playing a guessing game, very well.",
challenge:"Guess the model's top choice in at least 4 of 6 rounds.",
body:`## One skill, repeated
A large language model reads some text and predicts what comes next. Not a whole answer: one small piece, called a **token**. Then it adds that token to the text and predicts again. Chat, code, summaries and translations are all this single skill repeated hundreds of times.

:::flow One step inside the model
Read the text so far :: your prompt plus everything generated already
Score every token it knows :: usually 100,000+ candidates
Turn scores into probabilities :: they add up to 100%
Pick one token :: the most likely, or a weighted random pick
Append it and go again :: until something says stop
:::

## Where the knowledge comes from
**Pretraining** on a huge amount of text teaches the model grammar, facts and patterns: what usually follows what. **Post-training** then teaches it to follow instructions and answer helpfully. There is no database lookup at answer time. The model knows what was in its training data, plus whatever you put in the prompt.

## Why this matters at Paydesk
- The model only knows Paydesk's refund rules if you put them in the prompt.
- It writes the *likely* text, not the *checked* text, so it can be confidently wrong.
- Because it picks from probabilities, the same question can get different answers.

:::tip How to use the lab
Each round shows the start of a sentence and four candidate next tokens. Tap the one you think the model ranks highest. Then look at the bars: some choices are near-certain, others are close calls. Close calls are where answers vary between runs.
:::`,
take:["An LLM predicts one token at a time from probabilities.","Knowledge comes from training data plus your prompt, nothing else.","Likely is not the same as correct: verify important facts."]},

{id:"2", title:"Tokens", mins:6, lab:"tokenizer", labTitle:"Token slicer",
sum:"Models read and write tokens, not words. Tokens decide your price, your limits and some strange mistakes.",
mission:"Finance wants to know why the bill went up when Paydesk started supporting Telugu tickets. Time to look at text the way the model sees it.",
challenge:"Write a sentence of at least 5 words that needs 1.6 or more tokens per word.",
body:`## Text becomes numbers
Before the model sees your text, a **tokenizer** cuts it into pieces from a fixed vocabulary and replaces each piece with an ID number. Common words are usually one token. Rare words, long words, numbers and non-English text get split into several.

:::flow From text to model input
Your text :: "Refund of ₹7,499 pending"
Split into tokens :: "Ref" "und" " of" " ₹" "7" "," "499" " pending"
Map to IDs :: [8291, 1179, 315, 22740, 22, 11, 3633, 15639]
Model reads the IDs :: and predicts the next ID
Decode the output IDs :: back into text for you
:::

## Rules of thumb
- In English, one token is about **4 characters**, or roughly three quarters of a word.
- Spaces usually stick to the start of the next word: " refund" and "refund" are different tokens.
- Numbers often split into chunks, which is one reason models make arithmetic slips.
- Hindi, Telugu and other scripts can take several times more tokens than English for the same meaning.

## Why you should care
| Thing | Counted in |
|---|---|
| Price | Input tokens + output tokens |
| Context window | Tokens |
| max_tokens limit | Output tokens |
| Speed | Output tokens per second |

:::note About the lab
The lab uses a small toy tokenizer to show the idea. Real tokenizers learn their vocabulary from data, so their exact splits differ, but the patterns are the same: rare words, numbers and non-Latin scripts cost more.
:::`,
take:["Tokens, not words, are the unit of price, limits and speed.","~4 characters per token in English; other scripts and numbers cost more.","Exact splits depend on the model's tokenizer."]},

{id:"3", title:"Writing one token at a time", mins:6, lab:"generate", labTitle:"Token-by-token writer",
sum:"Generation is a loop: predict, pick, append, repeat, until a stop token or a limit.",
mission:"Paydesk's first auto-reply looked odd. Step through how the model builds a reply so you can see each decision it made.",
challenge:"Build a complete reply that reaches the end token, choosing at least one token that was not the top pick.",
body:`## The generation loop
:::flow Autoregressive generation
Prompt goes in :: "Write a short reply to the customer"
Model scores candidates :: " Thanks" 55%, " Sorry" 35%, " Hi" 10%
One token is chosen :: greedy or sampled
Token is appended :: the text gets longer by one token
Repeat :: each step sees all previous tokens
Stop :: end-of-sequence token, a stop sequence, or max_tokens
:::

Each new token depends on everything before it. One unusual early pick sends the rest of the answer down a different path, which is why two runs of the same prompt can diverge after only a few words.

## Greedy vs sampling
- **Greedy decoding** always takes the top token. Repeatable, but can be dull or get stuck in loops.
- **Sampling** picks randomly in proportion to the probabilities. More varied and natural. Temperature, top-k and top-p (next unit) shape this randomness.

## Why long answers are slow
The prompt is processed in one parallel pass, but output tokens are produced one after another. A 500-token answer needs 500 steps, so output length is the biggest driver of response time.`,
take:["Generation = repeat(predict, pick, append).","Early choices change everything after them.","Output length drives latency because tokens come out one by one."]},

{id:"q1", kind:"quiz", title:"Checkpoint: how a model writes", mins:3,
questions:[
 {q:"What does an LLM predict at each step?", o:["The full answer","The next token","The next sentence","The user's intent"], a:1, e:"It predicts a probability for every possible next token, then one is chosen."},
 {q:"Roughly how many characters is one English token?", o:["1","4","10","20"], a:1, e:"About 4 characters, or three quarters of a word, on average."},
 {q:"Why might a Telugu ticket cost more than the same ticket in English?", o:["Telugu models are premium","It usually splits into more tokens","Unicode is billed per byte","It isn't more expensive"], a:1, e:"Tokenizers trained mostly on English text split other scripts into more pieces."},
 {q:"Which mostly decides how long a response takes?", o:["Prompt length","Number of output tokens","Number of users","Model's training date"], a:1, e:"Output tokens are generated one at a time, so their count dominates latency."},
 {q:"Greedy decoding means…", o:["Using the biggest model","Always taking the most likely token","Sampling at high temperature","Caching the prompt"], a:1, e:"Greedy always takes the top-probability token, making output repeatable."}
]}
]},

/* ===================== UNIT 2 ===================== */
{title:"Controlling the output", hue:205, desc:"The dials: temperature, top-k, top-p, max tokens and seeds.",
items:[
{id:"4", title:"Temperature", mins:6, lab:"temperature", labTitle:"Temperature dial",
sum:"Temperature reshapes the probabilities before a token is picked: low is focused, high is adventurous.",
mission:"The ticket classifier sometimes answers 'pending' for clearly approved payments. Find out how temperature caused it.",
challenge:"Push the temperature until the absurd token \"banana\" gets picked at least once in 20 samples.",
body:`## What the dial does
The model outputs raw scores (logits). Temperature divides them before they become probabilities:

~~~
probability(token) = softmax(logit / temperature)
~~~

:::lanes Same scores, different temperatures
# Low (0.2)
Top token dominates :: "approved" ~95%
Rare tokens vanish :: almost never picked
Output is repeatable :: good for classification
# Medium (1.0)
Probabilities as trained :: "approved" ~55%
Some variety :: "declined" shows up
Natural writing :: good default for chat
# High (1.8)
Distribution flattens :: everything gets a chance
Odd tokens appear :: "banana" can sneak in
Creative but risky :: errors multiply
:::

## Choosing a temperature
| Task | Temperature |
|---|---|
| Classification, extraction, SQL | 0 – 0.2 |
| Support replies, summaries | 0.3 – 0.7 |
| Brainstorming, marketing ideas | 0.8 – 1.2 |
Temperature 0 makes most providers pick the top token (greedy), which is the closest you get to repeatable output.

:::warn Watch out
High temperature does not make a model smarter or more creative in a useful way. It makes unlikely tokens more likely, including wrong ones.
:::`,
take:["Temperature divides logits before softmax.","Low = focused and repeatable; high = varied and error-prone.","Use near 0 for anything that must be exact."]},

{id:"5", title:"Top-k and top-p", mins:6, lab:"topkp", labTitle:"Candidate cutter",
sum:"Top-k and top-p remove the unlikely tail before sampling, so randomness stays sensible.",
mission:"Marketing wants creative replies but legal wants zero nonsense. Use top-k and top-p to get variety without absurd words.",
challenge:"Leave top-k at 10 and use only top-p to keep exactly 3 candidates.",
body:`## Cutting the tail
Even at a sensible temperature, there is a long tail of unlikely tokens. Each is improbable, but together they can add up to a real chance of a weird pick. Two filters remove the tail before sampling:

:::flow Sampling with filters
Model gives probabilities :: for every token
Apply temperature :: reshape the distribution
Top-k :: keep only the k most likely tokens
Top-p (nucleus) :: keep the smallest set whose probabilities add up to p
Renormalise :: survivors' probabilities add up to 100% again
Sample one token :: from the survivors
:::

## Top-k vs top-p
- **Top-k = 5** always keeps exactly 5 candidates, whether the model is sure or unsure.
- **Top-p = 0.9** adapts: when the model is confident, maybe only 1-2 tokens make up 90%; when it is unsure, maybe 20 do.
That adaptiveness is why top-p is the more common choice.

:::tip Practical rule
Tune temperature *or* top-p, not both at once. Many APIs default top-p to 1.0 (no cut) and suggest adjusting temperature first. Some APIs don't expose top-k at all.
:::`,
take:["Top-k keeps a fixed number of candidates.","Top-p keeps the smallest set covering p of the probability.","They cut nonsense tails while keeping variety."]},

{id:"6", title:"Max tokens and stop reasons", mins:5, lab:"maxTokens", labTitle:"Token budget",
sum:"max_tokens caps the output. The stop reason tells you whether the answer finished or got cut off.",
mission:"Some Paydesk replies end mid-sentence and the JSON parser keeps crashing. Find the culprit.",
challenge:"Find the smallest max_tokens that still lets the reply finish naturally.",
body:`## A hard ceiling on output
«max_tokens» limits how many tokens the model may generate. It does not shorten the answer politely: the model doesn't know about the limit while writing, so it is simply cut off when it hits it.

## Always read the stop reason
Every response says why generation ended:
| Meaning | OpenAI-style finish_reason | Anthropic stop_reason |
|---|---|---|
| Finished naturally | stop | end_turn |
| Hit the max_tokens limit | length | max_tokens |
| Hit a stop sequence you set | stop | stop_sequence |
| Wants to call a tool | tool_calls | tool_use |

:::flow Handling a response safely
Get the response :: text + stop reason
Stop reason is "length"? :: the answer is incomplete
Retry or continue :: with a higher limit, or ask to continue
Otherwise parse it :: e.g. JSON.parse for structured output
:::

:::warn The classic bug
A JSON answer cut off by max_tokens is invalid JSON. If your parser crashes on some responses but not others, check the stop reason first.
:::

## Stop sequences
You can also pass strings that end generation early, such as a blank line («\\n\\n») or «</answer>». Useful for keeping output short and predictable.`,
take:["max_tokens truncates; the model doesn't plan around it.","Check the stop reason before trusting output.","Truncated JSON is invalid JSON."]},

{id:"7", title:"Seeds and reproducibility", mins:5, lab:"seeds", labTitle:"Seed lab",
sum:"Sampling uses random numbers. A seed makes that randomness repeatable, as far as the provider allows.",
mission:"A customer complained about a reply you can't reproduce. Learn how to make sampled runs repeatable for debugging and tests.",
challenge:"Find a seed where at least 4 of the 5 tickets come out \"approved\".",
body:`## Where randomness comes from
When sampling, the model draws a random number to choose among candidates. Computers make "random" numbers from a starting value called a **seed**. Same seed + same inputs = same sequence of random numbers = same picks.

:::flow Same seed, same answer
Fix the seed :: e.g. 42
Fix the prompt and parameters :: temperature, top_p, model version
Sample :: random draws follow the same sequence
Get the same output :: as long as nothing else changed
:::

## The fine print
- Not every API supports a seed. Where supported, it is usually "best effort": model updates, hardware and batching can still change outputs slightly.
- Temperature 0 removes most randomness without a seed, but even then outputs are not always bit-identical.
- For tests, pin the exact model version, use temperature 0 (or a seed), and judge results across many examples rather than one run.

:::note Why this matters for evals
If outputs vary run to run, one lucky run can make a bad prompt look good. Run evaluations on many cases, and repeat important ones.
:::`,
take:["Seeds make sampled outputs repeatable where supported.","Pin model version + parameters for tests.","Judge prompts across many runs, not one."]},

{id:"q2", kind:"quiz", title:"Checkpoint: controlling the output", mins:3,
questions:[
 {q:"You need consistent labels from a classifier. Which temperature?", o:["0 to 0.2","0.7","1.2","2.0"], a:0, e:"Low temperature makes the top label dominate, giving repeatable answers."},
 {q:"Top-p = 0.9 keeps…", o:["The top 9 tokens","Tokens with probability above 0.9","The smallest set of tokens adding up to 90%","90% of the vocabulary"], a:2, e:"Nucleus sampling keeps the smallest set whose cumulative probability reaches p."},
 {q:"Your JSON parser fails on some responses. What do you check first?", o:["The seed","The stop reason","The temperature","The system prompt"], a:1, e:"A 'length' / 'max_tokens' stop reason means the output was truncated."},
 {q:"Which is true about seeds?", o:["They guarantee identical output forever","They make sampling repeatable on a best-effort basis","They lower cost","They only work at temperature 2"], a:1, e:"Seeds fix the random draws, but model or infrastructure changes can still alter output."},
 {q:"Why is top-p usually preferred over top-k?", o:["It is faster","It adapts to how confident the model is","It removes the need for temperature","It's the only one APIs support"], a:1, e:"Top-p keeps few tokens when the model is sure and more when it's unsure."}
]}
]},

/* ===================== UNIT 3 ===================== */
{title:"Prompts", hue:275, desc:"Messages, system prompts, examples, JSON and evaluation.",
items:[
{id:"8", title:"Chat messages and roles", mins:5, lab:"chatOrder", labTitle:"Conversation builder",
sum:"A chat request is a list of messages with roles. The model sees them flattened into one token sequence.",
mission:"The new intern's API calls keep failing or getting weird answers. Rebuild the conversation the way the API expects it.",
challenge:"Arrange the messages into a valid conversation.",
body:`## Roles
| Role | Who writes it | Purpose |
|---|---|---|
| system | You, the developer | Standing instructions: role, rules, format |
| user | The end user (or your app) | The request |
| assistant | The model | Earlier model replies, or examples you write |
| tool | Your code | Results of tool calls (later course) |
Some APIs take the system prompt as a separate parameter instead of a message; the idea is identical.

## The model has no memory
Every API call is independent. To continue a conversation, your app sends the **whole history** again each time:
:::flow A two-turn conversation
Call 1 :: system + user("My refund is late")
Reply 1 :: assistant("Sorry! Which order?")
Call 2 sends everything again :: system + user + assistant + user("Order 7781")
Reply 2 :: uses the full history
:::
This is why long chats get slower and pricier: every turn re-sends all earlier tokens.

## What the model actually sees
Behind the scenes a **chat template** flattens the messages into one sequence with special tokens marking each role, then the model predicts what the assistant says next. The lab shows a simplified version of that flattening.`,
take:["Messages have roles: system, user, assistant (and tool).","APIs are stateless: resend the history each call.","Messages are flattened into one token sequence by a chat template."]},

{id:"9", title:"System prompts", mins:7, lab:"systemPrompt", labTitle:"System prompt playground",
sum:"The system prompt sets who the model is, what it must do and the exact shape of its answer.",
mission:"The ticket router needs one label per ticket, nothing else. The current prompt gets friendly essays. Fix it.",
challenge:"Write a system prompt that makes the model reply with only the label, for example REFUND, and nothing else.",
body:`## Anatomy of a good system prompt
:::flow What to include
Role and audience :: "You route Paydesk support tickets."
The task :: "Classify each ticket into one label."
The allowed outputs :: "REFUND, CHARGEBACK, SETTLEMENT_DELAY, KYC, OTHER"
Rules for hard cases :: "Money debited but order failed = REFUND."
Output format :: "Reply with the label only. No other text."
:::

## Weak vs strong
| Weak | Strong |
|---|---|
| "Help with tickets." | Names the task, the labels, the format |
| "Be concise." | "Reply with one word from this list." |
| Rules buried in a paragraph | One rule per line |
| Format implied | Format stated, with an example |

## Tips that work
- Be explicit. The model can't read your mind or Paydesk's wiki.
- Say what to do, not only what to avoid.
- Give the exact output format, ideally with an example.
- Put stable instructions in the system prompt and the changing data (the ticket) in the user message. Stable prefixes can also be cached, which cuts cost.

:::note Live model
When live mode is on, this lab sends your system prompt and the ticket to Claude and shows the real reply. Otherwise a built-in simulator answers, which only responds well when your prompt names the labels and asks for the label alone.
:::`,
take:["State role, task, allowed outputs, edge-case rules and format.","Specific instructions beat vague ones like 'be concise'.","Keep stable instructions in the system prompt; data in user messages."]},

{id:"10", title:"Few-shot prompting", mins:6, lab:"fewShot", labTitle:"Example picker",
sum:"A few worked examples teach the model your format and your edge cases faster than paragraphs of rules.",
mission:"Three ticket types keep getting misrouted. Instead of writing more rules, show the model examples.",
challenge:"Pick examples so all 3 tricky tickets are labelled correctly.",
body:`## Show, don't just tell
**Zero-shot**: instructions only. **Few-shot**: instructions plus a handful of input → output examples. Examples are especially good at teaching:
- the exact output format,
- company-specific conventions ("money debited but order failed" counts as a refund at Paydesk),
- where the line sits between similar labels.

:::flow Building a few-shot prompt
Instructions :: task + allowed labels
Example 1 :: ticket → label
Example 2 :: ticket → label (a tricky one)
Example 3 :: ticket → label (another category)
The real ticket :: → model completes the pattern
:::

## Choosing examples
- Cover each label, and especially the confusable pairs.
- Use real, messy tickets, not textbook ones.
- Keep the format identical across examples.
- 3-8 examples is usually plenty; more costs tokens on every call.
- Vary the order of labels so the model doesn't just copy the last one.

:::warn Examples are strong signals
If every example is short and polite, outputs will be too. If one example has a mistake, the model may copy it.
:::`,
take:["Examples teach format and edge cases efficiently.","Pick diverse, realistic examples that cover confusable labels.","Every example costs tokens on every request."]},

{id:"11", title:"Structured output", mins:6, lab:"jsonFix", labTitle:"JSON surgeon",
sum:"When code consumes the answer, ask for JSON with a schema, then validate it before using it.",
mission:"The routing service crashes on the model's output. Repair the broken JSON and learn the checks that should catch it.",
challenge:"Edit the output until it is valid JSON that passes every schema check.",
body:`## Why structure
Free text is for people. Code needs fields it can rely on: a label from a fixed list, a priority, a confidence number. So ask for JSON and describe the schema exactly.

:::flow A safe structured-output pipeline
Prompt with a schema :: field names, types, allowed values
Model returns text :: hopefully JSON
Check the stop reason :: truncated output is invalid
Parse :: JSON.parse / json.loads
Validate :: types, enums, ranges (pydantic, zod)
Valid → use it :: invalid → send the error back and retry once or twice
:::

## Common breakages
| Problem | Example |
|---|---|
| Single quotes | {'label': 'REFUND'} |
| Trailing comma | {"label": "REFUND",} |
| Unquoted string | "priority": high |
| Extra prose | Sure! Here's the JSON: {...} |
| Value outside the enum | "label": "Refund request" |
| Cut off by max_tokens | {"label": "REF |

:::tip Use native features when you can
Many APIs offer structured output or tool schemas that constrain the model to valid JSON for your schema. Still validate: the schema guarantees shape, not that the label is the right one.
:::`,
take:["Ask for JSON with an exact schema.","Always parse and validate before using output.","Retry with the validation error when output is invalid."]},

{id:"12", title:"Evaluating prompts", mins:6, lab:"evalLab", labTitle:"Prompt scoreboard",
sum:"A prompt is only as good as its score on real examples. Measure before and after every change.",
mission:"Two teammates argue about whose prompt is better. Settle it with a scoreboard, not opinions.",
challenge:"Reach at least 7 out of 8 correct on the test set.",
body:`## Vibes are not evaluation
Trying three tickets by hand and saying "looks good" is how bad prompts reach production. A small, fixed test set turns opinions into numbers.

:::flow A simple evaluation loop
Collect real tickets :: 50-200 with correct labels
Run the prompt on all of them :: same settings each time
Score :: accuracy overall and per label
Read the failures :: what pattern did the model miss?
Change one thing :: a rule, an example, the format
Re-run and compare :: keep the change only if the score improves
:::

## What to measure
- **Accuracy** for classification; **exact match** for extraction.
- **Per-label accuracy**: an 90% overall score can hide a label that is always wrong.
- **Format validity**: how often the output parses.
- For open-ended text: a rubric scored by people or by a model acting as judge, checked against human grades.

:::warn Overfitting to the test set
If you tweak the prompt until it passes one particular set, it may fail on new tickets. Keep a separate hold-out set you only check occasionally.
:::`,
take:["Use a fixed, labelled test set.","Look at per-label results and failures, not just one number.","Change one thing at a time and re-measure."]},

{id:"q3", kind:"quiz", title:"Checkpoint: prompts", mins:4,
questions:[
 {q:"How does a chat model remember earlier turns?", o:["It stores a session on the server","Your app resends the history each call","It fine-tunes itself","It doesn't need to"], a:1, e:"API calls are stateless; the conversation history is sent every time."},
 {q:"Which belongs in the system prompt?", o:["The customer's ticket text","Stable instructions and output format","The model's previous reply","The API key"], a:1, e:"Standing instructions go in the system prompt; changing data goes in user messages."},
 {q:"Few-shot examples are best for teaching…", o:["New facts","Output format and edge cases","Faster responses","Lower cost"], a:1, e:"Examples show format and how borderline cases should be handled."},
 {q:"The model returned {'label': 'REFUND'}. What's wrong?", o:["Nothing","Single quotes aren't valid JSON","Labels must be lowercase","JSON can't have one field"], a:1, e:"JSON requires double quotes around keys and strings."},
 {q:"Your prompt scores 92% overall. What should you check next?", o:["Nothing, ship it","Per-label accuracy and failures","The temperature only","The seed"], a:1, e:"An overall score can hide a label that fails consistently."}
]}
]},

/* ===================== UNIT 4 ===================== */
{title:"In production", hue:160, desc:"Context windows, cost and latency.",
items:[
{id:"13", title:"The context window", mins:6, lab:"contextPack", labTitle:"Context packer",
sum:"Everything the model sees, and everything it writes, must fit in one fixed token budget.",
mission:"The support bot forgets the refund policy in long chats. Decide what earns a place in the context window.",
challenge:"Fit the required items plus the refund policy, few-shot examples and recent messages inside 8,000 tokens.",
body:`## One budget for everything
The context window is the maximum number of tokens the model can handle in one call: system prompt + conversation + documents + the output it will write. If you exceed it, the API rejects the request or your app must cut something.

:::flow What fills a support bot's window
System prompt :: instructions and rules
Retrieved documents :: the refund policy section that matters
Few-shot examples :: a handful
Conversation history :: recent turns
The new message :: the ticket
Room for the answer :: reserved output tokens
:::

## When it doesn't fit
- **Trim history:** keep the last few turns, drop the oldest.
- **Summarise:** replace old turns with a short summary.
- **Retrieve, don't paste:** include only the relevant policy section, not the whole FAQ (that is the idea behind RAG).
- **Shorten instructions:** every token in the system prompt is paid on every call.

:::note Bigger isn't automatically better
Very long contexts cost more, respond more slowly, and models can pay less attention to details buried in the middle. Put the most important content near the start or end, and include only what helps.
:::`,
take:["Input and output share one token budget.","Retrieve and summarise instead of pasting everything.","Long contexts are slower, costlier and can dilute attention."]},

{id:"14", title:"Cost", mins:5, lab:"costLab", labTitle:"Budget boss",
sum:"Cost = tokens × price. Model choice, prompt length, caching and batching are your levers.",
mission:"The CFO saw a projected six-figure monthly bill for the ticket sorter. You have a $3,000 budget. Make it work.",
challenge:"Get the monthly cost under $3,000 for 50,000 tickets a day.",
body:`## The formula
~~~
cost per call = input_tokens × input_price + output_tokens × output_price
monthly cost  = cost per call × calls per day × 30
~~~
Prices are quoted per million tokens, and output tokens usually cost several times more than input tokens.

## The levers
| Lever | Typical effect |
|---|---|
| Smaller model | Often 5-20x cheaper; fine for simple classification |
| Shorter prompt | Saves on every single call |
| Prompt caching | Repeated prefix billed at a fraction |
| Batch API | Big discount when you can wait for results |
| Shorter outputs | Labels instead of essays |

:::flow Picking a model for a task
Start with a strong model :: get the prompt and eval working
Measure quality :: on your test set
Try a smaller model :: same eval
Keep the cheapest that passes :: route only hard cases to the big one
:::

:::note Illustrative prices
The lab uses made-up round prices to show proportions. Always check your provider's current price list.
:::`,
take:["Know your tokens per call and calls per day.","Smaller models, caching, batching and short outputs are the big levers.","Pick the cheapest model that passes your eval."]},

{id:"15", title:"Latency", mins:5, lab:"latencyLab", labTitle:"Speed run",
sum:"Users feel time to first token; your pipeline feels total time. Streaming and shorter outputs help most.",
mission:"Agents say the reply assistant feels sluggish. Make it feel instant without dropping to a weaker model.",
challenge:"Using the Medium model, get the felt wait under 1 second and the total under 4 seconds.",
body:`## Two numbers
- **Time to first token (TTFT):** how long before anything appears. Mostly model size plus prompt length (the prompt is processed first, called *prefill*).
- **Output speed:** tokens per second while writing (*decode*). Total time ≈ TTFT + output tokens ÷ speed.

:::lanes Without vs with streaming
# Without streaming
Request sent :: user waits
Model writes the whole answer :: still waiting
Full answer appears at once :: felt wait = total time
# With streaming
Request sent :: short wait
First words appear :: felt wait = time to first token
Text keeps flowing :: user is already reading
:::

## Levers
| Lever | Helps |
|---|---|
| Streaming | Felt wait (not total) |
| Fewer output tokens | Total time, a lot |
| Shorter prompt | Time to first token |
| Smaller model | Both |
| Prompt caching | Time to first token on repeated prefixes |
| Parallel calls | Throughput for batches |`,
take:["TTFT is what users feel; total time matters for pipelines.","Streaming hides waiting; fewer output tokens remove it.","Prompt length mainly affects time to first token."]},

{id:"q4", kind:"quiz", title:"Checkpoint: in production", mins:3,
questions:[
 {q:"The context window limit includes…", o:["Only the prompt","Only the output","Prompt plus output","Only the system prompt"], a:2, e:"Input and generated output share the same window."},
 {q:"Best way to give the bot your 200-page FAQ?", o:["Paste it all every time","Retrieve the relevant sections","Put it in the seed","Fine-tune on it daily"], a:1, e:"Retrieve only what's relevant for each question; it's cheaper and more accurate."},
 {q:"Which usually costs more per token?", o:["Input","Output","They're always equal","System prompt tokens"], a:1, e:"Output tokens are typically priced several times higher than input tokens."},
 {q:"Streaming mainly improves…", o:["Total time","Cost","Felt wait (time to first token)","Accuracy"], a:2, e:"Users start reading sooner; total generation time is about the same."},
 {q:"You need lower cost and the task is simple classification. First move?", o:["Bigger model","Try a smaller model against your eval","Raise temperature","Remove the eval"], a:1, e:"Simple tasks often run fine on smaller models; your eval tells you if quality holds."}
]},

{id:"boss", kind:"boss", title:"Final project: the ticket sorter", mins:15, lab:"boss", labTitle:"Ticket sorter",
sum:"Combine everything: a system prompt, examples and a JSON format, scored on 10 tickets you haven't seen.",
mission:"Launch day. Your sorter will route real tickets. Write the prompt, run it on the hidden test set, and hit 8 out of 10 to ship.",
challenge:"Score at least 8 out of 10 on the hidden tickets.",
body:`## The brief
Paydesk needs every ticket labelled with one of **REFUND, CHARGEBACK, SETTLEMENT_DELAY, KYC, OTHER** and a priority of **low, medium or high**, as JSON:
~~~
{"label": "REFUND", "priority": "high"}
~~~
## House rules your prompt must teach
- Money debited but the order or payment shows failed → **REFUND**.
- The customer says they don't recognise a payment, or their bank mentions a dispute → **CHARGEBACK**.
- A merchant asking where their payout or settlement is → **SETTLEMENT_DELAY**.
- Anything about PAN, Aadhaar, documents or verification → **KYC**.
- Priority is **high** when money is stuck for a customer, **medium** for merchants, **low** for general questions.

:::flow Your workflow
Write the system prompt :: role, labels, rules, JSON format
Add 2-4 examples :: especially the tricky rules
Run on the hidden set :: 10 tickets
Read the misses :: and improve one thing
Run again :: 8/10 ships it
:::`,
take:["You combined role, rules, examples, format and evaluation.","Reading failures is how prompts improve.","This loop is how real LLM features get built."]}
]}
]};
