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
