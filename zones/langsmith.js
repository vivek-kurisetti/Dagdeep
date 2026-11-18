QUEST.zone("langsmith", {
mission:["kai","The assistant is live, and nobody knows why yesterday's answers got worse. LangSmith gives us traces, datasets and evals. Learn to see inside the system and gate every release on evals."],
levels:[
{t:"Tracing", sub:"Runs and traces", rounds:[
 ["learn","A trace is a tree of runs","Each request becomes a **trace**: a tree of **runs** (chain, LLM, retriever, tool) with inputs, outputs, latency, tokens, cost, errors and metadata. LangChain/LangGraph trace automatically when tracing is enabled.",["Set LANGSMITH_TRACING=true","Set LANGSMITH_API_KEY","Run your app","Inspect traces in a project"]],
 ["fill","Enable tracing",'export LANGSMITH_TRACING=___\nexport LANGSMITH_API_KEY=lsv2_...\nexport LANGSMITH_PROJECT=___',["true","support-assistant-prod"],["false","on-call"],"Use separate projects per environment."],
 ["learn","Trace any code","Wrap your own functions with «@traceable» (Python) or «traceable()» (JS) to add them as runs, and add **metadata** and **tags** (user tier, model version, prompt version) to filter later. OpenTelemetry ingestion is supported too."],
 ["match","What to look at in a trace",[["Retriever run outputs","Were the right documents fetched?"],["LLM run input","Exact final prompt sent"],["Run latency breakdown","Which step is slow"],["Token counts","Where cost comes from"]],"Debug by reading the actual prompt, not your template."],
 ["tf","Tracing facts",[["Tracing needs code changes in every LangChain component.",false,"An environment variable enables it."],["Metadata lets you filter traces by version or user segment.",true,"Add it generously."],["You can mask or hide inputs/outputs for sensitive data.",true,"Configure hiding for PII."]]]
]},
{t:"Datasets", sub:"Examples to test against", rounds:[
 ["learn","Datasets of examples","A **dataset** holds examples: inputs, optional reference outputs, metadata. Build from hand-written cases, **production traces** (add a bad trace to a dataset in one click), or synthetic generation. Version it and use splits."],
 ["sort","Good dataset example sources?",{"Great source":["Real production questions that failed","Edge cases from support tickets","Expert-written reference answers"],"Weak source":["Only the 3 demo questions","Examples copied from the prompt's few-shots"]},"Your eval is only as good as its examples."],
 ["order","Turn a bug report into a regression test",["Find the bad trace in LangSmith","Add its input to the 'regressions' dataset","Write the expected behaviour as the reference","Run an experiment on the current version","Keep it in CI so the bug can't return"],"Every incident becomes a test."],
 ["pick","How many examples to start with?",["Wait for 10,000","Start with ~20–50 high-quality, diverse cases and grow","Only one","Exactly 100"],1,"Start small and real; add failures as you find them."]
]},
{t:"Evaluators & experiments", sub:"Scores you can trust", rounds:[
 ["learn","Evaluators score runs","**Code evaluators**: exact match, regex, JSON valid, contains citation. **LLM-as-judge**: grade correctness, faithfulness, tone with a rubric. **Pairwise**: which of two versions is better. **Human** review via annotation queues."],
 ["match","Pick the evaluator",[["Output must be valid JSON","Code evaluator"],["Is the answer faithful to the retrieved context?","LLM-as-judge with a rubric"],["Is v2 better than v1?","Pairwise comparison"],["Subtle domain judgement","Human annotation queue"]],"Cheapest reliable evaluator wins."],
 ["learn","Experiments","An **experiment** runs your app on a dataset and applies evaluators. Compare experiments side by side to see which examples improved or regressed. Gate releases: block if key metrics drop."],
 ["fill","Run an experiment (Python SDK)",'from langsmith import ___\nresults = evaluate(\n    target=my_app,\n    data="support-golden",\n    ___=[correctness, has_citation],\n    experiment_prefix="prompt-v7")',["evaluate","evaluators"],["test","metrics","judge"],"Each evaluator returns a score per example."],
 ["tf","Judge facts",[["LLM judges need calibration against human labels.",true,"Check agreement before trusting them."],["A judge model should see a clear rubric.",true,"Vague rubrics give noisy scores."],["An average score is all you need to compare versions.",false,"Look at per-example regressions."]]]
]},
{t:"Production loop", sub:"Online evals, feedback, prompts", rounds:[
 ["learn","Close the loop in production","Collect **user feedback** (thumbs, corrections) attached to runs. Run **online evaluators** on sampled live traffic. Set **rules/alerts** (e.g. send low-score traces to an annotation queue or dataset). Manage prompt versions in the **Prompt Hub**."],
 ["order","Continuous improvement loop",["Trace production traffic","Score with feedback and online evaluators","Route failures to annotation and datasets","Change prompt/model and run offline experiments","Deploy if experiments beat the baseline"],"Observe → evaluate → improve → repeat."],
 ["sort","Offline or online evaluation?",{"Offline (before release)":["Golden dataset experiment in CI","Pairwise v1 vs v2"],"Online (in production)":["Judge 5% of live answers for faithfulness","Thumbs-down rate by prompt version"]},"You need both."],
 ["pick","A prompt edit in the hub broke answers for one merchant segment. How do you find it fastest?",["Filter traces by prompt version and segment metadata","Read all logs","Ask users","Retrain"],0,"Metadata makes this a two-click query."]
]},
{t:"Boss: Why did it get worse?", boss:true, time:30, rounds:[
 ["pick","Answers got worse; you suspect retrieval. Look at…",["Retriever run outputs in traces","Only the final answer","Server CPU","Token price"],0,"Inspect what was retrieved."],
 ["pick","Need to know if prompt v8 beats v7 before shipping. Do…",["Experiments on the same dataset, compare","Ship and watch","Ask the model","Average latency"],0,"Offline comparison."],
 ["pick","Every incident keeps recurring. Fix the process?",["Add failing traces to a regression dataset run in CI","More logging","Bigger model","Turn off tracing"],0,"Incidents become tests."],
 ["pick","Check faithfulness on live traffic without labels. Use…",["Online LLM-as-judge evaluator on a sample","Exact match","Unit tests","Manual review of all traffic"],0,"Sampled online evals."],
 ["pick","Judge says 95% correct but users complain. First check?",["Judge-vs-human agreement on a sample","Raise temperature","More examples","Change project"],0,"Calibrate the judge."],
 ["pick","Traces contain card numbers. Fix?",["Mask/hide sensitive inputs and outputs before sending","Delete the project weekly","Disable evals","Use a bigger model"],0,"Never log PII you don't need."]
]}
]});

QUEST.more("langsmith", [
{act:"Expert", t:"The trace data model", sub:"Runs, sampling, distributed tracing", rounds:[
 ["learn","Runs, traces and ordering","Each **run** has an id, «run_type» (chain, llm, tool, retriever, embedding, prompt, parser), parent run, start/end times, inputs/outputs, error, tokens/cost, tags and metadata. All runs in one request share a **trace_id**; a «dotted_order» field encodes position in the tree for fast ordering.",null,null,`### How tracing stays off the hot path
SDKs send runs **asynchronously in batches** from a background thread. In serverless functions, flush before the function exits («wait_for_all_tracers()» / client flush), or traces are lost.

### Sampling
Set a sampling rate («LANGSMITH_SAMPLING_RATE» / tracing sampling env) to send only a fraction of traces for very high-volume endpoints. Keep 100% for low-volume or critical flows, and consider always tracing errors.

### Distributed tracing
When a request crosses services (API → retrieval service → agent worker), propagate trace context via headers (LangSmith's «langsmith-trace» and «baggage» headers from the run tree) so all spans join one trace. OpenTelemetry-based export/ingestion is supported too.

### Attaching data
- **Metadata** (model, prompt version, tenant, feature flag) for filtering.
- **Feedback** (scores/comments) attached to a run by id — from users, evaluators or annotators.
- **Threads**: group traces of one conversation with a «session_id»/«thread_id» metadata key for conversation-level views.`],
 ["match","Field",[["run_type","Kind of step: llm, tool, retriever, chain…"],["trace_id","Shared by all runs in one request"],["dotted_order","Encodes order and nesting in the tree"],["Feedback","Score/comment attached to a run"],["thread metadata","Groups traces into a conversation"]],"The vocabulary of every trace."],
 ["pick","Traces from a Lambda function randomly go missing. Most likely?",["Background batches not flushed before the function exits","Sampling bug","Wrong project name","Too many tags"],0,"Flush tracers at the end of the handler."],
 ["num","An endpoint does 2,000,000 requests/day; you sample traces at 5%. Traces per day?",100000,0,"traces","2,000,000 × 0.05 = 100,000."],
 ["tf","Tracing truths",[["Tracing blocks each request until runs are uploaded.",false,"Uploads are async and batched."],["Trace context can be propagated across services with headers.",true,"Distributed tracing."]]]
]},
{act:"Expert", t:"Evaluator design", sub:"Judges, bias, calibration", rounds:[
 ["learn","Evaluators you can trust","An evaluator takes the run (outputs) and the example (inputs, reference) and returns a **key** and **score**. **Summary evaluators** compute dataset-level metrics (precision, recall, F1). **Pairwise** evaluators compare two experiments' outputs.",null,null,`### LLM-as-judge pitfalls
- **Position bias**: in pairwise comparisons, judges favour the first (or second) answer. Run both orders and average, or randomize.
- **Verbosity bias**: longer answers look better. Put length expectations in the rubric.
- **Self-preference**: judges may favour outputs from their own model family.
- **Vague rubrics**: "is it good?" → noise. Use specific, binary or few-level criteria ("Does every claim appear in the context? yes/no").

### Calibration
Label 50–100 examples by humans, run the judge, and measure **agreement** (and Cohen's kappa for chance-corrected agreement). Iterate the rubric/judge prompt until agreement is acceptable, then trust it at scale — and re-check periodically.

### Variance
LLM apps are stochastic. Run each example several times (**repetitions**) to see variance; a 2-point difference between versions on 80 examples may be noise.

### Cheap first
Use code evaluators (JSON validity, exact match on labels, regex for citations, latency/cost thresholds) wherever possible; reserve LLM judges for semantic criteria.`],
 ["num","A judge agrees with human labels on 170 of 200 examples. Agreement rate (%)?",85,0,"%","170 / 200 = 85%. Check kappa too: high raw agreement can be inflated if one label dominates."],
 ["sort","Mitigates judge bias?",{"Mitigates":["Swap answer order in pairwise and average","Specific yes/no rubric criteria","Calibrate against human labels"],"Doesn't":["Ask the judge to 'be fair'","Use the longest answer as reference","Run once and trust it"]},"Design out the bias."],
 ["pick","Pairwise eval says v2 wins 70% — but only when v2 is shown first. What's happening?",["Position bias","v2 is better","Dataset too large","Temperature"],0,"Evaluate both orders."],
 ["tf","Evaluator truths",[["Summary evaluators compute metrics across the whole dataset.",true,"E.g. F1 for classification."],["Repetitions help measure run-to-run variance.",true,"Stochastic outputs need them."]]]
]},
{act:"Expert", t:"Experiments in CI", sub:"Thresholds, testing integrations", rounds:[
 ["learn","Gate releases on evals","Treat evals like tests: a dataset version + evaluators + thresholds. Run on every prompt/model/code change, compare with the baseline experiment, and **fail CI** on regressions in key metrics.",null,null,`### Practical setup
- Pin a **dataset version/tag** so comparisons are apples to apples.
- Use LangSmith's **pytest / Vitest / Jest** integrations to log test cases as experiments while asserting thresholds in code.
- Keep fast **smoke evals** (20–50 critical examples) on every PR and a fuller suite nightly.
- Track **cost and latency** per experiment alongside quality: a 1-point quality gain for 3× cost may not ship.

### Reading comparisons
Look at per-example diffs: which examples **regressed**, not just the average. A new prompt can fix 10 easy cases and break 3 critical ones.

### Significance (rough)
With n examples and accuracy around 80%, the standard error is about √(0.8 × 0.2 / n). For n = 100 that's 4 points: differences smaller than ~8 points (2 SE) may be noise. Use more examples, repetitions, or paired comparisons on the same examples.`],
 ["num","Accuracy ≈ 80% on n = 100 examples. Standard error in percentage points (√(0.8×0.2/100) × 100)?",4,0.1,"points","√(0.16 / 100) = 0.04 → 4 points. A 3-point improvement is within noise."],
 ["order","A PR that changes the system prompt",["CI runs smoke evals on the pinned dataset","Compare with the main-branch baseline experiment","Inspect per-example regressions","Fail if key metrics drop beyond thresholds","Merge; nightly full suite confirms"],"Evals as tests."],
 ["pick","Average correctness rose 2 points but two critical refund cases now fail. Ship?",["No — review per-example regressions on critical cases","Yes, average improved","Only on Fridays","Re-run until it passes"],0,"Critical regressions matter more than averages."],
 ["tf","CI truths",[["Comparing experiments on different dataset versions is fine.",false,"Pin the version."],["Cost and latency should be tracked with quality.",true,"Trade-offs need all three."]]]
]},
{act:"Expert", t:"Production monitoring & prompts", sub:"Rules, queues, Prompt Hub", rounds:[
 ["learn","Automations close the loop","**Automation rules** run on traces matching a filter with a sampling rate: add to a dataset, send to an **annotation queue**, run an **online evaluator**, or call a webhook. **Dashboards** chart latency, cost, error rates and feedback by metadata.",null,null,`### Useful rules
- Thumbs-down feedback → annotation queue with a rubric for reviewers.
- Online evaluator flags low faithfulness → add to "regressions" dataset.
- Errors in the refund tool → webhook to alerting.
- 5% sample of all traffic → online correctness judge for trend lines.

### Annotation queues
Reviewers see the trace, a rubric (feedback keys with allowed values) and can correct outputs, which become reference answers for datasets.

### Prompt management
The **Prompt Hub** versions prompts as commits; tag a commit «prod» or «staging» and pull by tag at runtime, so changing a prompt doesn't need a deploy. Record the prompt commit in trace metadata to connect quality changes to prompt versions. The **Playground** lets you run prompts against dataset examples before committing.

### Retention and privacy
Trace retention tiers differ (short base retention vs extended for traces you keep, e.g. those with feedback). Mask or hide inputs/outputs containing PII at the SDK level before upload.`],
 ["match","Rule → action",[["Negative user feedback","Send to annotation queue"],["Low faithfulness online score","Add to regression dataset"],["Tool error spike","Webhook to alerting"],["Random 5% of traffic","Online evaluator for trends"]],"Automate triage."],
 ["fill","Pull the production prompt by tag",'from langsmith import Client\nclient = Client()\nprompt = client.___("support-answer:___")\nchain = prompt | llm',["pull_prompt","prod"],["get","latest_commit","push_prompt"],"Change prompts without redeploying code."],
 ["tf","Monitoring truths",[["Annotation queue corrections can become dataset references.",true,"Human labels improve evals."],["Prompt versions should be recorded in trace metadata.",true,"Links quality to versions."]]]
]},
{act:"Expert", t:"Expert boss: Quality operations", boss:true, time:45, rounds:[
 ["pick","Serverless traces disappear. Fix?",["Flush tracers before exit","Disable batching globally","More tags","Increase sampling"],0,"Async uploads need a flush."],
 ["pick","Pairwise judge favors whichever answer is first. Fix?",["Evaluate both orders and average","Use a bigger judge only","Longer rubric","Ignore"],0,"Position bias."],
 ["pick","v2 beats v1 by 3 points on 100 examples. Conclusion?",["Possibly noise; add examples/repetitions or paired analysis","Ship immediately","v1 is broken","Judge is broken"],0,"SE ≈ 4 points."],
 ["pick","Every thumbs-down should be reviewed by a domain expert. Set up…",["Automation rule → annotation queue with rubric","Email export","Manual search daily","More dashboards"],0,"Automated triage."],
 ["pick","A prompt change needs to go live without deploying code. Use…",["Prompt Hub tag pulled at runtime","Hardcode prompt","Env var with full prompt","Restart service"],0,"Versioned prompts."],
 ["pick","Judge scores and human scores disagree a lot. Before trusting the judge…",["Calibrate: refine rubric until agreement is acceptable","Use more judges blindly","Average them","Drop humans"],0,"Calibration."],
 ["pick","Trace spans from the retrieval microservice show as separate traces. Fix?",["Propagate trace headers between services","Same project name","Bigger sampling","Different run_type"],0,"Distributed tracing."]
]}
]);

QUEST.story("langsmith", {title:"\"The new prompt is better\" — is it?", icon:"🧪", place:"Wed 3 PM · prompt release", setup:"A teammate rewrote the support prompt and wants to ship it today because \"it feels better\". Last time a 'better' prompt raised wrong answers by 6%.",
 meters:[["reg","Undetected regressions","",3,0,"low",5],["conf","Release confidence","%",30,80,"high",100],["trust","Team trust","%",50,75,"high",100]],
 beats:[["kai","Can we ship prompt v15 today? It feels much better."],["ui","Evidence so far: 6 hand-picked chats that look nicer"],
  ["q","What do you need before shipping?",[["Run v14 and v15 on the same dataset of real, labelled questions and compare scores in a LangSmith experiment",1,"Same inputs, same evaluators, side by side.","A taste test with the same dishes, blindfolded."],["More hand-picked examples",0,"Selection bias.","Asking friends if they like your cooking."]]],
  ["q","How do you score answers?",[["Mix code checks (format, citations present), LLM-as-judge with a rubric for correctness/faithfulness, and spot human review",1,"Cheap deterministic checks plus calibrated judges.","A checklist plus an expert taster."],["Only BLEU score",0,"Measures word overlap, not correctness.","Judging food by how similar it looks."]]],
  ["q","v15 wins on average but loses on refunds questions. Now what?",[["Look at the failing refund traces, fix the prompt, re-run, and add those cases to the dataset",1,"Averages hide slices; failures become regression tests.","Fixing the dish that got sent back, then adding it to the test menu."],["Ship it; average is higher",0,"Refund errors cost money.","Ignoring the complaint because others liked it."]]],
  ["kai","v16 beats v14 everywhere, including refunds. Shipping with the eval in CI."]],
 learned:["Compare prompts on the same dataset, not vibes.","Code checks + LLM judges + human review.","Look at slices; turn failures into tests."]});
QUEST.mock("langsmith", {title:"LLM observability & evals round", who:"ana", intro:"Ana here. How do you know your LLM app works?", setup:"Ana runs AI quality for the platform.",
 qs:[["What do you trace in an LLM app?","Every run as a tree: inputs, outputs, prompts, retrieved docs, tool calls, latency, tokens/cost, errors, model/version, user feedback, plus metadata (user, tenant, release) to filter by.",[["Full run trees with prompts, retrieval, tools, latency, tokens, errors, versions and feedback",1,"Complete."],["Only errors",0.5,"Misses quality."],["Nothing, LLMs are black boxes",0,"Red flag."]]],
  ["Offline vs online evaluation?","**Offline**: run a fixed dataset before release (regression testing). **Online**: score a sample of production traffic (judges, feedback, heuristics) to catch drift and new failure types; promote interesting production traces into the dataset.",[["Offline datasets before release, online scoring on production samples, feeding failures back",1,"Loop."],["Only offline",0.5,"Misses real-world drift."],["Only user thumbs",0.5,"Sparse and biased."]]],
  ["How do you make LLM-as-judge trustworthy?","Specific rubric, pairwise or reference-based where possible, a strong judge model, randomise order to avoid position bias, and **calibrate** against human labels (measure agreement).",[["Clear rubric, references/pairwise, bias controls, calibrated against humans",1,"Rigour."],["Ask 'is this good?'",0,"Vague."],["Use the same small model as the app",0.5,"Weaker judge, self-preference."]]],
  ["Which metrics go on the dashboard?","Quality (eval scores, feedback, fallback/abstain rate), reliability (errors, timeouts), latency (p50/p95, time to first token), cost (tokens per request, per user), safety (flagged content), all sliced by version and feature.",[["Quality, reliability, latency, cost and safety, sliced by version",1,"Balanced."],["Only cost",0,"Narrow."],["Only uptime",0,"Narrow."]]]],
 learned:["Trace everything as run trees.","Offline datasets + online sampling.","Calibrate LLM judges."]});
