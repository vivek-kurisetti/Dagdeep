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
