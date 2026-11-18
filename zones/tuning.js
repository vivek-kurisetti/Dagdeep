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

QUEST.more("tuning", [
{act:"Expert", t:"LoRA maths", sub:"Parameters, rank, merging", rounds:[
 ["learn","Why LoRA is cheap","For a weight matrix W (d_out × d_in), LoRA learns ΔW = B·A with A (r × d_in) and B (d_out × r), scaled by alpha / r. Only A and B train: **r × (d_in + d_out)** parameters instead of d_in × d_out.",null,null,`### Worked numbers
A 4,096 × 4,096 attention projection has 16.8M weights. With r = 16, LoRA trains 16 × (4,096 + 4,096) = **131,072** parameters — under 1%. Adapting q, k, v, o in 32 layers: 131,072 × 4 × 32 ≈ 16.8M trainable parameters for a 7B model.

### Choosing r, alpha, targets
- r 8–64 is common; higher r = more capacity (helpful for harder or broader tasks), more memory.
- alpha often equals r or 2r; it scales the update — changing r without alpha changes the effective learning rate.
- Targeting MLP layers as well as attention usually helps quality.
- Initialization: B starts at zero, so training starts from the base model's behaviour.

### Serving
- **Merge** ΔW into W for zero overhead (one model per task).
- Or keep adapters separate and serve **many LoRAs on one base** (multi-LoRA serving in vLLM and similar) — swap per request, great for per-customer adapters.

### Variants
DoRA (decomposes magnitude/direction), rsLoRA (rank-stabilized scaling), LoRA+ (different learning rates for A and B) — try only if plain LoRA plateaus.`],
 ["num","LoRA rank 16 on a 4,096 × 4,096 matrix. Trainable parameters for that matrix?",131072,0,"parameters","16 × (4,096 + 4,096) = 131,072."],
 ["match","Knob",[["r (rank)","Adapter capacity and memory"],["lora_alpha","Scales the update (effective step size)"],["target_modules","Which layers get adapters"],["Merging","Fold ΔW into base weights for serving"],["Multi-LoRA serving","Many adapters on one base model"]],"Small knobs, big effects."],
 ["pick","You serve 30 merchants, each with its own fine-tuned style. Cheapest serving setup?",["One base model with per-merchant LoRA adapters swapped per request","30 fully fine-tuned models","30 GPUs","Prompting only, always"],0,"Multi-LoRA serving."],
 ["tf","LoRA truths",[["LoRA's B matrix is usually initialized to zero.",true,"Start from the base model."],["Changing r without adjusting alpha keeps the same effective scale.",false,"Scale is alpha / r."]]]
]},
{act:"Expert", t:"Memory & compute maths", sub:"Why full fine-tuning is expensive", rounds:[
 ["learn","Bytes per parameter","Full fine-tuning with Adam in mixed precision needs roughly **16 bytes per parameter**: bf16 weights (2) + bf16 gradients (2) + fp32 master weights (4) + Adam first and second moments (4 + 4) — **before activations**.",null,null,`### Rules of thumb
- 7B full fine-tune ≈ 112 GB for weights/grads/optimizer alone → multiple GPUs with ZeRO/FSDP sharding.
- **LoRA**: base weights frozen in bf16 (2 bytes/param → 14 GB for 7B) + small adapter optimizer states.
- **QLoRA**: base in 4-bit NF4 (~0.5 byte/param → ~3.5–4 GB for 7B) + adapters → fits on a single 24 GB GPU with room for activations.

### Activations
Grow with batch size × sequence length × hidden size × layers. Tools: **gradient checkpointing** (recompute activations in backward, ~30% slower, much less memory), **FlashAttention**, shorter max sequence length, packing.

### Batch maths
Effective batch = micro-batch × gradient accumulation steps × number of GPUs. Keep effective batch stable when changing hardware.

### Throughput
Training tokens/s depends on GPU, sequence length and method. Estimate run time: total tokens (examples × avg tokens × epochs) ÷ tokens/s.`],
 ["num","Full fine-tuning a 7B model with Adam mixed precision at ~16 bytes/parameter. Memory for weights, gradients and optimizer states (GB, 10⁹ bytes)?",112,0,"GB","7 × 10⁹ × 16 bytes = 112 GB, before activations."],
 ["num","Micro-batch 4, gradient accumulation 8, 2 GPUs. Effective batch size?",64,0,"examples","4 × 8 × 2 = 64."],
 ["match","Technique → saves",[["QLoRA","Base model memory (4-bit weights)"],["Gradient checkpointing","Activation memory"],["ZeRO / FSDP","Shards optimizer states, grads, weights across GPUs"],["Paged optimizers","Spikes in optimizer memory"]],"Fit bigger models on smaller hardware."],
 ["tf","Memory truths",[["Adam's optimizer states are larger than the bf16 weights themselves.",true,"Two fp32 moments per parameter."],["Gradient checkpointing speeds up training.",false,"It trades compute for memory."]]]
]},
{act:"Expert", t:"Data & training recipes", sub:"Templates, masking, hyperparameters", rounds:[
 ["learn","Details that make or break SFT","Format examples with the model's **chat template** (exact special tokens and roles the model was trained on). Compute loss **only on assistant tokens** (mask system/user tokens) so the model learns to answer, not to imitate users.",null,null,`### Common recipe (starting points)
- LoRA learning rate ~1e-4 to 2e-4; full fine-tune ~1e-5 to 2e-5.
- Warmup a few percent of steps, cosine or linear decay.
- 1–3 epochs; watch validation loss and task metrics each epoch.
- Max sequence length covering 95–99% of examples; **packing** short examples into one sequence improves throughput (with proper attention masking).

### Data quality checklist
- Deduplicate (exact and near-duplicate).
- Consistent formats and styles in targets.
- Balanced classes / topics; include hard and edge cases.
- No test-set leakage; no PII you can't train on.
- For synthetic data: generate with a strong model, **filter** by automatic checks and judges, and spot-check by humans.

### Distillation
Use a strong model to produce outputs (and optionally reasoning) for your task, then train a small model on them: big cost savings at inference, quality close to the teacher on the narrow task.

### Pitfalls
Wrong chat template at inference vs training, training on the system prompt you'll change later, and evaluating with a different decoding setup than production.`],
 ["bug","Which training setup line causes the model to imitate users?",["tokenizer.apply_chat_template(messages)","labels = input_ids.clone()  # loss on all tokens","lr = 2e-4 with cosine schedule","max_seq_len = 2048 with packing"],1,"Loss on user/system tokens teaches the model to generate them. Mask everything except assistant tokens."],
 ["sort","Good SFT data practice?",{"Good":["Near-duplicate removal","Same output format across examples","Held-out test from real traffic","Judge + human filtering of synthetic data"],"Bad":["Including test questions in training","Mixing three output formats","Training on unreviewed synthetic outputs only"]},"Data quality dominates hyperparameters."],
 ["pick","The tuned model outputs garbled role tokens in production. Most likely cause?",["Chat template mismatch between training and inference","LoRA rank too low","Too many epochs","Wrong GPU"],0,"Use the same template everywhere."],
 ["tf","Recipe truths",[["Packing multiple short examples per sequence improves throughput.",true,"With correct masking."],["Full fine-tuning usually uses higher learning rates than LoRA.",false,"LoRA typically uses higher LRs."]]]
]},
{act:"Expert", t:"Preference & RL training", sub:"Reward models, DPO, GRPO", rounds:[
 ["learn","From RLHF to DPO to GRPO","**RLHF**: train a **reward model** on human preference pairs (Bradley–Terry), then optimize the policy with **PPO** while a **KL penalty** keeps it close to the reference model. **DPO** skips the reward model: a closed-form loss on (chosen, rejected) pairs with a temperature β. **GRPO** (used for reasoning RL) samples a group of answers per prompt, scores them with a reward (often verifiable: tests pass, answer correct), and uses the group-relative advantage — no value network.",null,null,`### Choosing
- Have preference pairs (chosen vs rejected)? Start with **DPO** (or variants: IPO, KTO for unpaired good/bad labels, ORPO/SimPO without a reference model).
- Have automatic correctness checks (unit tests, exact answers, schema validators)? **RL with verifiable rewards** (GRPO/PPO) can improve reasoning on those tasks.
- Need broad helpfulness aligned to human taste? Reward models + RL, at much higher complexity.

### Risks
- **Reward hacking**: the policy exploits reward model or checker weaknesses (verbose answers, gaming tests). Use KL penalties, diverse checks, and human review.
- **Over-optimization**: past a point, reward goes up while real quality goes down.
- **Safety regressions**: re-run safety evals after any preference/RL stage.

### DPO's β
Higher β keeps the policy closer to the reference (more conservative); lower β allows bigger shifts toward chosen answers.`],
 ["match","Method",[["Reward model + PPO","Classic RLHF with KL penalty"],["DPO","Preference pairs, no reward model"],["KTO","Unpaired good/bad labels"],["GRPO","Group-relative advantages, no critic"],["RL with verifiable rewards","Reward from tests or exact answers"]],"Pick by the data you have."],
 ["pick","Training a SQL generator where each output can be executed and checked against expected results. Promising approach?",["RL with verifiable rewards (e.g. GRPO) on top of SFT","DPO without pairs","More pretraining","Prompt caching"],0,"Automatic correctness signals."],
 ["sort","Sign of reward hacking?",{"Likely hacking":["Answers get longer and reward rises, human ratings fall","Code passes tests by special-casing test inputs"],"Healthy":["Reward and human ratings rise together","Held-out task accuracy improves"]},"Always check with independent evals."],
 ["tf","Preference truths",[["DPO needs a separately trained reward model.",false,"That's the point of DPO."],["A KL penalty keeps the policy near the reference model.",true,"Limits drift and hacking."]]]
]},
{act:"Expert", t:"Serving & evaluating tuned models", sub:"Quantization, harnesses, rollout", rounds:[
 ["learn","After training","**Merge or serve adapters**, then decide on **quantization** for inference (fp8/int8, or 4-bit with GPTQ/AWQ; GGUF for llama.cpp). Re-evaluate after quantization — small models and fine-tuned behaviours can degrade.",null,null,`### Evaluation stack
- **Task metrics** on a held-out test set from real traffic (accuracy/F1, exact match, schema validity).
- **General capability regression**: a few standard benchmarks via an eval harness (e.g. lm-evaluation-harness) to catch catastrophic forgetting.
- **Safety evals**: refusal behaviour, jailbreak resistance, harmful content — tuning can weaken them.
- **Contamination checks**: ensure test items aren't in training data (n-gram overlap, dedup).
- **A/B in production**: shadow traffic or a small percentage, compare quality, latency, cost.

### Managed vs self-hosted
Managed fine-tuning (cloud/provider APIs) handles infra and serving but limits methods and model choice. Self-hosting gives full control (methods, quantization, multi-LoRA) with ops burden. Decide on data residency, cost at your volume and required latency.

### Versioning
Track base model version, data snapshot hash, config, adapter weights and eval results together (model registry). Roll back quickly if production metrics fall.`],
 ["order","Ship a fine-tuned model safely",["Evaluate on held-out task test set vs prompted baseline","Run general and safety regression evals","Quantize and re-evaluate","Shadow or small A/B in production","Full rollout with monitoring and rollback plan"],"Evidence at every step."],
 ["match","Check",[["Held-out task test","Did the target skill improve?"],["Benchmark harness","Did general skills regress?"],["Safety evals","Did refusals/safety weaken?"],["Contamination check","Are test scores inflated by leakage?"],["Post-quantization eval","Did compression hurt quality?"]],"Five checks before shipping."],
 ["pick","A 4-bit quantized version of your tuned 3B model drops 6 points on your task. Options?",["Try 8-bit/fp8 or a better quantization method (AWQ/GPTQ) and re-evaluate","Ship anyway","Retrain from scratch","Raise temperature"],0,"Quantization isn't free; measure."],
 ["tf","Serving truths",[["Quantization can degrade fine-tuned behaviours.",true,"Re-evaluate after compressing."],["A model registry should link data, config, weights and evals.",true,"Reproducibility and rollback."]]]
]},
{act:"Expert", t:"Expert boss: The small model program", boss:true, time:45, rounds:[
 ["pick","Full fine-tune of 7B OOMs on one 24 GB GPU. Fix?",["QLoRA (4-bit base + LoRA) with gradient checkpointing","Bigger batch","Higher LR","More epochs"],0,"Memory maths."],
 ["pick","Tuned model starts writing user-style turns. Fix?",["Mask loss to assistant tokens only","Raise rank","Lower LR","More data"],0,"Loss masking."],
 ["pick","Need per-merchant styles for 30 merchants cheaply. Use…",["Multi-LoRA serving on one base","30 full fine-tunes","Bigger prompts","DPO"],0,"Adapters per tenant."],
 ["pick","Have human preference pairs, no reward model budget. Use…",["DPO","PPO with reward model","GRPO","Pretraining"],0,"Direct preference optimization."],
 ["pick","Reward rises during RL but human ratings fall. Diagnose…",["Reward hacking / over-optimization; add KL, better checks","Need more steps","Lower β","Bigger batch"],0,"Independent evals catch it."],
 ["pick","After tuning, general reasoning benchmarks dropped. Mitigate?",["Mix in general data, lower LR/epochs, prefer LoRA","Train longer","Remove validation","Higher LR"],0,"Catastrophic forgetting."],
 ["pick","Training on 2,000 synthetic examples from a big model gives a small model 90% of the big model's task accuracy. This is…",["Distillation","Pretraining","RAG","Quantization"],0,"Teacher → student."]
]}
]);
