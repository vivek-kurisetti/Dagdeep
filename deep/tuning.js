QUEST.deep("tuning", {
"Fine-tuning changes behaviour": {
d: `Fine-tuning continues training a pretrained model on your examples, changing its **weights**. It's good at teaching **how** to respond: a fixed output format (JSON schema), a tone, a domain's jargon, a narrow classification or extraction task, or **distilling** a large model's behaviour into a smaller, cheaper one.

It's poor at teaching **facts that change** (prices, policies, today's data): knowledge baked into weights goes stale, can't be cited, and is hard to update or delete. For that, use **RAG** (retrieve at query time) or tools.

Decision order in practice: prompt engineering + few-shot → RAG/tools → fine-tuning when prompts are too long/expensive, behaviour is inconsistent, or latency/cost requires a smaller model.`,
life: `Fine-tuning is training a new employee in the company's writing style and procedures. RAG is giving them access to the policy wiki. You don't retrain someone every time a policy changes; you update the wiki.`,
work: `A support-ticket classifier using a big model with a 3,000-token prompt cost ₹9 per 1,000 tickets and was 1.8 s slow. Fine-tuning an 8B model on 6,000 labelled tickets gave the same accuracy (93%) at 1/10th the cost and 250 ms latency. Product FAQs stayed in RAG so updates didn't need retraining.`,
ex: `{"messages": [
  {"role": "system", "content": "Classify the ticket. Reply JSON only."},
  {"role": "user", "content": "Money debited but order not placed, UPI ref 4412..."},
  {"role": "assistant", "content": "{\\"category\\": \\"payment_failure\\", \\"priority\\": \\"high\\"}"}
]}`,
pit: [`Fine-tuning to "teach" frequently changing facts.`, `Skipping a strong prompt baseline before tuning.`, `Expecting fine-tuning to fix bad retrieval.`],
q: [`Your bot must answer about policies that change weekly. Fine-tune or RAG?`, `RAG: the knowledge changes often and needs to be current and citable; fine-tune only for style/format if needed.`]
},
"Data is the model": {
d: `Model quality after SFT tracks **data quality** more than any hyperparameter. Each example should look like a real production input and show the **ideal** output, in the exact format you want at inference (chat format: system, user, assistant turns).

Guidelines:
- **Coverage**: include edge cases, rare classes, refusals ("I can't help with that"), multilingual inputs if users write Hinglish.
- **Consistency**: the same input type should always get the same style of answer; conflicting labels confuse the model.
- **Quantity**: hundreds to a few thousand **high-quality** examples beat tens of thousands of noisy ones for format/style tasks.
- **Sources**: real logs (anonymised), expert-written answers, or outputs from a stronger model reviewed by humans (distillation).
- Remove PII and secrets; models can memorise and regurgitate them.`,
life: `Teaching a child to write letters by showing 50 excellent letters beats showing 5,000 random scribbles. And if half your examples say "Dear Sir" and half "Yo", they'll be confused.`,
work: `First attempt: 20k examples scraped from old agent replies; the tuned model learned agents' typos and inconsistent refund promises. Second attempt: 2,500 examples rewritten by senior agents with a style guide, plus 300 "escalate to human" cases. Win rate vs base in human review went from 48% to 81%.`,
ex: `# quick data checks
import json, collections
rows = [json.loads(l) for l in open("train.jsonl")]
print(len(rows))
print(collections.Counter(json.loads(r["messages"][-1]["content"])["category"] for r in rows))
assert all(r["messages"][-1]["role"] == "assistant" for r in rows)`,
pit: [`Training on raw logs without cleaning.`, `Class imbalance (model never predicts rare classes).`, `PII in training data.`],
q: [`Why can 2,000 clean examples beat 20,000 noisy ones?`, `The model imitates what it sees; noise and inconsistency are learned too, while clean consistent data teaches the target behaviour directly.`]
},
"Splits and leakage": {
d: `Split data into:
- **Train**: what the model learns from.
- **Validation**: used during development to pick epochs, learning rate, checkpoints.
- **Test**: touched once at the end for an honest score.

All drawn from the **same distribution** as production. **Leakage** makes scores look great and production results disappointing:
- Exact or near-duplicates across splits (same ticket re-sent, templated emails).
- The same customer/document in train and test (split by **group**, not by row).
- Time leakage: training on the future (split by time for anything that drifts).
- Test examples used in prompt design or few-shot examples.

Deduplicate with normalisation or embeddings (cosine > 0.95) before splitting.`,
life: `If a teacher gives students the exact exam questions as homework, everyone scores 100%, but nobody learned the subject.`,
work: `A tuned model scored 97% on test but 84% in production. 30% of test tickets were near-duplicates of training tickets (auto-generated "payment failed" templates). After grouping by template hash and re-splitting by customer and month, test accuracy was 86%, matching production, and the team could finally measure real improvements.`,
ex: `from sklearn.model_selection import GroupShuffleSplit
gss = GroupShuffleSplit(n_splits=1, test_size=0.1, random_state=7)
train_idx, test_idx = next(gss.split(X, y, groups=df["customer_id"]))
# near-dup check with embeddings
sims = test_emb @ train_emb.T
print((sims.max(axis=1) > 0.95).mean())   # fraction leaking`,
pit: [`Random row splits on grouped data.`, `Tuning many times against the test set.`, `Ignoring time drift.`],
q: [`Why split by customer instead of by row?`, `Rows from one customer are similar; if they appear in both train and test, the test score overstates performance on new customers.`]
},
"Full fine-tuning vs PEFT": {
d: `**Full fine-tuning** updates every weight. Maximum capacity to change behaviour, but memory-hungry (gradients + optimizer states for all parameters) and each tuned model is a full copy (16 GB for an 8B model in bf16).

**PEFT** (parameter-efficient fine-tuning) freezes the base model and trains a small number of new parameters:
- **LoRA**: adds low-rank matrices to selected layers; ~0.1–1% of parameters train.
- **QLoRA**: base model loaded in **4-bit** (NF4) + LoRA adapters in bf16; fine-tune a 70B model on a single 80 GB GPU (slower).
- Others: prefix/prompt tuning, IA3, DoRA.

PEFT usually reaches near full-FT quality for format/style/domain tasks, and adapters are small files (tens of MB) you can swap per customer or task on one shared base model.`,
life: `Full fine-tuning is renovating the whole house. LoRA is adding clip-on fixtures to a few rooms: much cheaper, easily removable, and you can have different fixtures for different guests.`,
work: `Three teams needed variants of an 8B model (support tone, KYC extraction, merchant onboarding). Instead of three full copies, they trained three LoRA adapters (≈80 MB each) and served them on one base model with multi-adapter serving (vLLM), cutting GPU needs from 3 cards to 1.`,
ex: `from peft import LoraConfig, get_peft_model
model = AutoModelForCausalLM.from_pretrained(base, torch_dtype=torch.bfloat16)
cfg = LoraConfig(r=16, lora_alpha=32, lora_dropout=0.05,
                 target_modules=["q_proj","k_proj","v_proj","o_proj"], task_type="CAUSAL_LM")
model = get_peft_model(model, cfg)
model.print_trainable_parameters()   # e.g. 0.2% trainable`,
pit: [`Full FT when a LoRA would do.`, `Expecting QLoRA to be as fast as LoRA (dequantization overhead).`, `Forgetting the adapter only works with its exact base model.`],
q: [`Why can one GPU serve many LoRA variants?`, `They share the frozen base weights; each variant only adds small adapter matrices.`]
},
"LoRA knobs": {
d: `- **r (rank)**: the inner dimension of the adapter. Higher r = more capacity and more parameters. 8–16 for style/format, 32–64 for harder domain shifts.
- **lora_alpha**: scales the update (effective scale = alpha / r). Common: alpha = r or 2r. Changing r without alpha changes the effective learning rate.
- **target_modules**: which layers get adapters. Attention projections (q, k, v, o) are the minimum; adding MLP layers (gate, up, down) often improves quality noticeably.
- **lora_dropout**: 0.05–0.1 regularisation for small datasets.
- **Learning rate**: LoRA uses higher LR than full FT (1e-4 to 2e-4 typical vs 1e-5).
- Epochs: 1–3 for most SFT datasets; more risks memorising.`,
life: `Tuning a guitar with a few pegs: rank is how many strings you can adjust, alpha is how hard you turn the pegs, and target modules is which guitar you're tuning.`,
work: `An extraction task plateaued at 88% F1 with r=8 on attention only. Adding MLP targets and r=32 reached 93%; raising r further to 128 gave no gain but doubled adapter size. Validation loss guided stopping at epoch 2.`,
ex: `LoraConfig(
  r=32, lora_alpha=64, lora_dropout=0.05,
  target_modules=["q_proj","k_proj","v_proj","o_proj","gate_proj","up_proj","down_proj"])
TrainingArguments(learning_rate=2e-4, num_train_epochs=2,
  per_device_train_batch_size=8, gradient_accumulation_steps=4,
  lr_scheduler_type="cosine", warmup_ratio=0.03, bf16=True)`,
pit: [`Using full-FT learning rates for LoRA (too low, nothing changes).`, `Huge rank on tiny data (overfitting).`, `Changing r without adjusting alpha.`],
q: [`Effective scale of the LoRA update with r=16, alpha=32?`, `alpha / r = 2.`]
},
"Watch the curves": {
d: `Plot **training loss** and **validation loss** every N steps.
- Both falling: learning.
- Train falling, validation flat or rising: **overfitting**. The model memorises training examples. Stop at the best validation checkpoint, reduce epochs, add data diversity, increase dropout, lower LR or rank.
- Both flat from the start: LR too low, labels masked wrongly, or data formatting broken.
- Loss spikes / NaN: LR too high, bad examples (extremely long, corrupted), mixed precision issues.

Loss isn't the goal, though: also run task metrics on validation (accuracy, JSON validity) at checkpoints; sometimes lower loss doesn't mean better outputs.`,
life: `A student doing practice papers: if their homework scores rise while mock-exam scores fall, they're memorising answers rather than learning.`,
work: `Training for 5 epochs, validation loss bottomed at epoch 2 and rose afterwards; the epoch-5 model repeated phrases from training data verbatim in 6% of answers. Keeping the epoch-2 checkpoint (with «load_best_model_at_end») fixed it and improved test accuracy by 4 points.`,
ex: `TrainingArguments(
  eval_strategy="steps", eval_steps=100,
  save_strategy="steps", save_steps=100,
  load_best_model_at_end=True, metric_for_best_model="eval_loss",
  report_to="wandb")`,
pit: [`Judging only by training loss.`, `Evaluating too rarely to see the turning point.`, `Assuming lower loss always means better generations.`],
q: [`Train loss keeps dropping, validation loss starts rising at step 800. What do you do?`, `Overfitting: use the checkpoint around step 800 and reduce epochs or add data/regularisation.`]
},
"Evaluate like production": {
d: `Evaluate the tuned model the way it will be used:
- Same **prompt template**, decoding settings (temperature, max tokens), and input distribution as production.
- **Task metrics** on the held-out test set: accuracy/F1 for classification, exact match or field-level F1 for extraction, **schema validity rate** for JSON.
- **LLM-as-judge** with a rubric for open-ended quality, calibrated against human ratings on a sample.
- **Human review** for tone and risky cases.
- **Regression suites**: general capabilities (does it still follow instructions, refuse unsafe requests, handle other languages?), plus latency and cost.

Compare **base vs tuned vs prompt-only baseline** side by side; ship only with a clear win and no major regressions.`,
life: `Test-driving a car on the roads you'll actually use (city traffic, potholes), not just on a smooth test track.`,
work: `The tuned model beat base by 9 points on the classification test set but failed the safety regression: it no longer refused requests for other customers' data, because training data had no refusals. Adding 400 refusal examples restored safety without losing the accuracy gain.`,
ex: `def evaluate(model, cases):
    res = []
    for c in cases:
        out = generate(model, c["input"], temperature=0)
        ok_json = is_valid_json(out)
        res.append({"id": c["id"], "valid": ok_json,
                    "correct": ok_json and json.loads(out)["category"] == c["label"]})
    return pd.DataFrame(res).mean(numeric_only=True)`,
pit: [`Evaluating with different prompts/decoding than production.`, `No safety or general-skill regression checks.`, `LLM judge without human calibration.`],
q: [`Why include a prompt-only baseline in the comparison?`, `To prove fine-tuning is worth its cost; sometimes a better prompt gets most of the gain.`]
},
"Why LoRA is cheap": {
d: `A frozen weight matrix W has shape d_out × d_in. LoRA learns «ΔW = B·A» where A is r × d_in and B is d_out × r, with r much smaller than d. The forward pass becomes «h = W·x + (alpha/r)·B·A·x».

Trainable parameters per matrix: **r × (d_in + d_out)** instead of d_in × d_out. For a 4096 × 4096 matrix with r = 16: 131k vs 16.8 M (0.8%). Only these get gradients and optimizer state, which is where most training memory goes.

B is initialised to zero, so training starts exactly from the base model. After training you can **merge** «W' = W + (alpha/r)BA» into the weights (no inference overhead) or keep adapters separate to swap them.`,
life: `Instead of repainting a whole wall to change its look, you add a thin decal made from two narrow strips. Tiny material, visible change, and you can peel it off.`,
work: `Interview question: "How many trainable params for LoRA r=8 on q,k,v,o of a model with 32 layers and hidden size 4096?" Per matrix: 8 × (4096 + 4096) = 65,536. × 4 matrices × 32 layers ≈ 8.4 M parameters (vs ~7 B total).`,
ex: `d_in = d_out = 4096; r = 16
full = d_in * d_out              # 16,777,216
lora = r * (d_in + d_out)        # 131,072
print(lora / full)               # 0.0078 -> 0.78%
# merge for serving
model = model.merge_and_unload()`,
pit: [`Assuming LoRA reduces forward-pass memory for activations (it mostly reduces gradient/optimizer memory).`, `Forgetting B starts at zero (so no early behaviour change is expected).`, `Merging adapters into a quantized base without care.`],
q: [`Why does initialising B to zero matter?`, `ΔW = BA starts at zero, so training begins from exactly the base model's behaviour.`]
},
"Bytes per parameter": {
d: `Memory for full fine-tuning with **Adam** and mixed precision, per parameter:
- bf16 weights: 2 bytes
- bf16 gradients: 2 bytes
- fp32 master weights: 4 bytes
- Adam first moment (m): 4 bytes
- Adam second moment (v): 4 bytes
≈ **16 bytes/param**, before **activations** (depend on batch size × sequence length × layers; reduce with gradient checkpointing).

So an 8B model needs ~128 GB just for these states: multiple GPUs with **ZeRO/FSDP** sharding. With LoRA, the base is frozen (2 bytes/param in bf16, or ~0.5 with 4-bit QLoRA) and only adapter params carry the 16-byte cost. Inference in bf16 needs ~2 bytes/param plus the **KV cache**.`,
life: `Packing for a trip: the clothes (weights) are only part of the luggage; you also carry spare copies, notes about each outfit (optimizer states) and laundry (gradients). The suitcase ends up 8× bigger than the clothes.`,
work: `Estimating hardware for fine-tuning a 13B model: full FT ≈ 13 × 16 = 208 GB + activations → 4×80 GB GPUs with FSDP. QLoRA ≈ 13 × 0.5 = 6.5 GB base + small adapter states + activations → one 24–48 GB GPU. The team chose QLoRA for a prototype, then LoRA on bf16 base for production quality.`,
ex: `params = 8e9
full_ft_gb = params * 16 / 1e9        # 128 GB (+ activations)
lora_base_gb = params * 2 / 1e9       # 16 GB frozen bf16
qlora_base_gb = params * 0.5 / 1e9    # ~4 GB in 4-bit
infer_gb = params * 2 / 1e9           # 16 GB + KV cache`,
pit: [`Forgetting activations and KV cache in estimates.`, `Ignoring optimizer states (the biggest part).`, `Batch size too large without gradient checkpointing.`],
q: [`Roughly how much memory for full fine-tuning a 7B model with Adam in mixed precision, excluding activations?`, `About 7 × 16 = 112 GB.`]
},
"Details that make or break SFT": {
d: `Small formatting details change results a lot:
- **Chat template**: use the model's exact template («tokenizer.apply_chat_template»): special tokens, role markers, BOS/EOS. Mismatch between training and inference format quietly degrades quality.
- **Loss masking**: compute loss only on **assistant tokens** (completion-only). Otherwise the model also learns to generate user prompts and system text.
- **EOS token**: make sure each assistant turn ends with the end token, or the model won't know when to stop and rambles.
- **Sequence length & packing**: truncation cutting off answers teaches incomplete outputs; packing multiple short examples per sequence speeds training but needs correct attention masking.
- **Padding side** and pad token set correctly for the model.`,
life: `Teaching someone to answer phone calls: if your training recordings include you reading the caller's lines too, they'll start talking like callers. And if recordings never include "goodbye", they never hang up.`,
work: `A tuned model kept generating "User: ..." after its answers and never stopped. Two bugs: loss was computed on the whole conversation, and the EOS token was missing after assistant turns. Fixing both with «DataCollatorForCompletionOnlyLM» / assistant-only masks and proper template made outputs clean.`,
ex: `text = tokenizer.apply_chat_template(example["messages"], tokenize=False)
# TRL SFTTrainer: train only on assistant turns
SFTConfig(assistant_only_loss=True, max_length=2048, packing=True)
assert tokenizer.eos_token in text`,
pit: [`Hand-written templates that differ from the model's.`, `Loss on prompt tokens.`, `Missing EOS → endless generations.`],
q: [`Why mask the user tokens from the loss?`, `So the model learns to produce assistant replies, not to imitate user/system text.`]
},
"From RLHF to DPO to GRPO": {
d: `After SFT, **preference tuning** aligns outputs with what people prefer:
- **RLHF**: collect pairs (chosen, rejected), train a **reward model** (Bradley–Terry loss), then optimise the policy with **PPO** to maximise reward with a **KL penalty** to the SFT model (prevents reward hacking and drift). Powerful but complex: 4 models in memory, unstable.
- **DPO** (Direct Preference Optimization): skips the reward model and RL; a simple classification-style loss directly increases the likelihood of chosen over rejected responses relative to a reference model. Stable, cheap, popular.
- Variants: IPO, KTO (works with thumbs up/down, no pairs), ORPO (SFT + preference in one step), SimPO.
- **GRPO** (Group Relative Policy Optimization): RL without a value network; sample a group of answers per prompt, score them (often with **verifiable rewards** like unit tests or math checks), and use the group's relative scores as advantages. Used for reasoning models.`,
life: `SFT is learning from model answers. Preference tuning is a coach watching two of your attempts and saying "this one's better", over and over, until your instincts change.`,
work: `A customer-reply model was accurate but too long. The team collected 3,000 pairs where agents picked the more concise, correct reply, and ran DPO (beta 0.1) on top of the SFT model. Average length dropped 35% with no loss in correctness; human preference win rate went from 50% to 68%.`,
ex: `from trl import DPOTrainer, DPOConfig
# dataset rows: {"prompt": ..., "chosen": ..., "rejected": ...}
trainer = DPOTrainer(model=sft_model, ref_model=None,
    args=DPOConfig(beta=0.1, learning_rate=5e-7, num_train_epochs=1),
    train_dataset=pairs, processing_class=tokenizer)
trainer.train()`,
pit: [`Preference data where "chosen" is only marginally better (noisy signal).`, `Skipping SFT and going straight to DPO on a base model.`, `RL reward hacking (model exploits the reward model).`],
q: [`What does DPO remove compared to classic RLHF?`, `The separate reward model and the PPO reinforcement-learning loop.`]
},
"After training": {
d: `Shipping a tuned model:
1. **Merge or serve adapters**: merge LoRA into weights for one model, or keep adapters for multi-tenant serving (vLLM / TGI support many adapters per base).
2. **Quantize for inference** if needed: fp8/int8 (minimal loss on modern GPUs), 4-bit GPTQ/AWQ for smaller GPUs, GGUF for llama.cpp/CPU. Re-run the eval suite after quantization; small accuracy drops are common, big ones mean the method or calibration data is wrong.
3. **Register** the model with its base model version, data version, hyperparameters, eval results and a model card.
4. **Roll out** gradually: shadow traffic, then A/B or canary, with monitoring of quality metrics, latency, cost and safety flags.
5. Plan **retraining**: data drift, new categories, base model upgrades.`,
life: `After tailoring a suit you still do a final fitting (re-eval after quantization), label it, and wear it to a smaller event before the big wedding.`,
work: `An AWQ 4-bit version of a tuned 8B model ran on a cheaper L4 GPU at 2.5× throughput, but JSON validity dropped from 99.6% to 97.1%. Switching to fp8 on an L40S kept 99.5% validity with 1.8× throughput; that was the shipped config, released via 10% canary for a week.`,
ex: `# vLLM serving with LoRA adapters
vllm serve meta-llama/Llama-3.1-8B-Instruct --enable-lora \\
  --lora-modules support=./adapters/support kyc=./adapters/kyc \\
  --quantization fp8
# request: {"model": "support", "messages": [...]}`,
pit: [`Skipping re-evaluation after quantization.`, `No versioning of data and adapters.`, `Full rollout without canary.`],
q: [`Why re-run evals after quantizing?`, `Quantization changes numerical precision and can degrade task quality; you must confirm the loss is acceptable.`]
}
});
