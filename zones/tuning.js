QUEST.zone("tuning", {
mission:["kai","We want a small, cheap model that classifies disputes and writes replies in our exact style. Prompting got us 80% there. Learn when fine-tuning is worth it and how to do it right."],
levels:[
{t:"Should you fine-tune?", sub:"Prompt, RAG or tune", rounds:[
 ["learn","Fine-tuning changes behaviour","Fine-tuning updates model weights on your examples. It's best for **format, style, tone and narrow tasks**, and for distilling a big model's skill into a small, cheap one. For **knowledge** that changes, use RAG. Try prompting first."],
 ["sort","Prompting, RAG or fine-tuning?",{"Prompting":["Quick prototype of a new feature","Small style tweak"],"RAG":["Answer from today's policies","Cite sources"],"Fine-tuning":["Small model must match our exact JSON and tone at scale","Classify 30 dispute types cheaply at high volume"]},"Escalate only when the simpler option fails."],
 ["order","Decision path",["Write a strong prompt with examples and evaluate","Add RAG if knowledge is missing","Fine-tune if behaviour/format/cost still falls short","Re-evaluate against the same test set"],"Always keep a baseline."],
 ["tf","Tuning facts",[["Fine-tuning is the best way to add fast-changing facts.",false,"Use RAG for that."],["A fine-tuned small model can beat a big general model on a narrow task.",true,"And cost far less."],["You need an eval set before you tune.",true,"Otherwise you can't tell if it helped."]]]
]},
{t:"Data", sub:"Quality over quantity", rounds:[
 ["learn","Data is the model","Collect examples that look like real production inputs, with ideal outputs. Typical SFT data is chat-format: system, user, assistant. Hundreds to a few thousand **high-quality, diverse** examples often beat 100k noisy ones."],
 ["sort","Good training data?",{"Good":["Real tickets with expert-approved replies","Balanced examples across all 30 dispute types","Hard edge cases with correct answers"],"Bad":["Duplicates of the same 50 easy tickets","Replies with inconsistent formats","Examples that leak test-set answers"]},"Garbage in, confident garbage out."],
 ["learn","Splits and leakage","Hold out **validation** (for tuning decisions) and **test** sets (final score) drawn from the same distribution but **never trained on**. Deduplicate across splits to avoid leakage that inflates scores."],
 ["pick","Validation accuracy is 99% but production is 70%. Most likely?",["Data leakage or train/production mismatch","Too few GPUs","LoRA rank too low","Temperature"],0,"Your test isn't representative."],
 ["tf","Data facts",[["Inconsistent output formats in training data teach inconsistency.",true,"Normalise them."],["More examples always beat better examples.",false,"Quality and coverage matter more."]]]
]},
{t:"Methods", sub:"SFT, LoRA, QLoRA, DPO", rounds:[
 ["learn","Full fine-tuning vs PEFT","**Full fine-tuning** updates all weights: most capacity, huge memory. **PEFT** methods train a small set of new parameters. **LoRA** adds low-rank matrices A·B to chosen layers; the base stays frozen. **QLoRA** does LoRA on a 4-bit quantised base (NF4) to fit big models on one GPU."],
 ["match","Method → idea",[["SFT","Train on input → ideal output pairs"],["LoRA","Train small low-rank adapters, freeze the base"],["QLoRA","LoRA on a 4-bit quantised base model"],["DPO","Learn from chosen vs rejected answer pairs, no reward model"],["RLHF (PPO)","Reward model + reinforcement learning"],["Distillation","Small model learns from a big model's outputs"]],"SFT first; preference tuning on top."],
 ["learn","LoRA knobs","**r** (rank): adapter capacity (8–64 common). **alpha**: scaling (often r or 2r). **target_modules**: which layers get adapters (attention projections, often MLP too). **dropout** for regularisation. Adapters are small files you can swap per task."],
 ["fill","A LoRA config (PEFT)",'from peft import LoraConfig\ncfg = LoraConfig(___=16, lora_alpha=32, lora_dropout=0.05,\n                 ___=["q_proj", "k_proj", "v_proj", "o_proj"],\n                 task_type="CAUSAL_LM")',["r","target_modules"],["rank_size","layers","epochs"],"Higher r = more capacity and memory."],
 ["pick","You have chosen/rejected reply pairs from agents. Simplest way to use them?",["DPO","Pretraining from scratch","Prompt caching","RAG"],0,"Direct preference optimisation needs no reward model."]
]},
{t:"Training & evaluation", sub:"Loss curves, regressions", rounds:[
 ["learn","Watch the curves","Training loss should fall; **validation loss** tells the truth. If train keeps falling but validation rises, you're **overfitting**: stop earlier, fewer epochs, more/diverse data, lower learning rate. 1–3 epochs is typical for SFT."],
 ["match","Symptom → fix",[["Val loss rises while train loss falls","Overfitting: fewer epochs / more data"],["Loss spikes or NaN","Learning rate too high"],["Model forgot general skills","Catastrophic forgetting: mix in general data, use LoRA"],["No improvement over base","Data too small/noisy or task better solved by prompting"]],"Diagnose before tweaking."],
 ["learn","Evaluate like production","Compare base vs tuned on the held-out test set with task metrics (accuracy, F1, format validity) plus LLM-judge and human review for style. Check **regressions** on general ability and safety."],
 ["order","A safe fine-tuning cycle",["Build train/val/test sets from real data","Baseline the prompted model on test","Train LoRA, track train and val loss","Evaluate on test + safety/regression suites","Deploy behind a flag and monitor"],"Ship with evidence."],
 ["tf","Training facts",[["Lower training loss always means a better model.",false,"Watch validation and real metrics."],["Fine-tuning can weaken safety behaviours.",true,"Re-run safety evals after tuning."],["LoRA adapters can be merged into the base for serving.",true,"Or kept separate to swap per task."]]]
]},
{t:"Boss: Ship the small model", boss:true, time:30, rounds:[
 ["pick","Model needs to know policies that change monthly. Approach?",["RAG, not fine-tuning","Fine-tune monthly","Bigger LoRA rank","DPO"],0,"Knowledge → retrieval."],
 ["pick","70B model doesn't fit one GPU for training. Use…",["QLoRA","Full fine-tuning","More epochs","Higher learning rate"],0,"4-bit base + LoRA."],
 ["pick","Val loss rises after epoch 2. Do…",["Stop earlier / fewer epochs","Train 10 more epochs","Raise learning rate","Remove validation"],0,"Overfitting."],
 ["pick","You have pairs of preferred vs rejected replies. Use…",["DPO","SFT on rejected answers","Pretraining","Prompt caching"],0,"Preference tuning."],
 ["pick","Tuned model scores 98% offline, 72% live. Check…",["Leakage and train/production mismatch","GPU type","Tokenizer speed","Font"],0,"Representative test data."],
 ["pick","After tuning, the model ignores safety instructions more often. Do…",["Run safety evals, add safety data, re-tune","Ignore it","Raise temperature","More epochs"],0,"Tuning can erode safety; test for it."]
]}
]});
