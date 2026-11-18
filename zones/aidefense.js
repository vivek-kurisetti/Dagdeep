QUEST.zone("aidefense", {
mission:["sana","You found the holes. Now design the defences: layers around the model, tight permissions, safe outputs and governance. No single filter saves us; defence in depth does."],
levels:[
{t:"Defence in depth", sub:"Layers around the model", rounds:[
 ["learn","Assume the model can be tricked","Design so a fully hijacked model still **can't do much harm**. Layers: input checks, separation of untrusted content, least-privilege tools, approval for risky actions, output validation, monitoring and limits.",["Input filtering","Untrusted content isolation","Least-privilege tools","Human approval","Output validation","Monitoring + limits"]],
 ["order","Put the layers in request order",["Authenticate the user and apply rate limits","Screen input (injection/PII classifiers)","Retrieve only data this user may see","Model runs with least-privilege tools","Validate and sanitise output before acting or rendering","Log, monitor and alert"],"Each layer catches what the last one missed."],
 ["sort","Real security control or wishful thinking?",{"Real control":["Tool permissions enforced in code","Per-user access checks at retrieval","Output schema validation","Human approval for payments"],"Wishful thinking":["'Never reveal secrets' in the system prompt as the only protection","Hoping users won't paste malicious text"]},"Prompts guide; code enforces."],
 ["tf","Principles",[["Authorization should be enforced outside the model.",true,"The model is not a policy engine."],["Secrets in the system prompt are safe if you ask the model not to share them.",false,"Assume prompts leak."]]]
]},
{t:"Taming untrusted content", sub:"Isolate and constrain", rounds:[
 ["learn","Separate instructions from data","Wrap untrusted text in clear delimiters and tell the model it's data, never instructions (spotlighting). Stronger: the **dual-LLM pattern**, where a quarantined model reads untrusted content and only returns constrained values to a privileged model that holds the tools."],
 ["match","Technique",[["Spotlighting / delimiters","Mark untrusted text as data in the prompt"],["Dual-LLM / quarantine","Privileged model never sees raw untrusted text"],["Plan-then-execute","Fix the tool plan before reading untrusted data"],["Injection classifier","Flag likely injection in inputs and tool results"]],"Combine several; none is perfect alone."],
 ["learn","Break the lethal trifecta","If an agent reads untrusted content, remove or gate one leg: no private data in that context, **or** no external communication (no arbitrary URLs, email, image rendering), **or** human approval before anything leaves."],
 ["pick","A browsing agent also has access to the user's mailbox. Strongest fix?",["Split into separate agents/contexts and require approval before sending anything out","Longer system prompt","Higher temperature","Bigger model"],0,"Break the trifecta structurally."],
 ["tf","Isolation facts",[["Delimiters alone stop all injections.",false,"They reduce risk; structural controls are stronger."],["Tool results should be treated as untrusted input.",true,"They can carry injections."]]]
]},
{t:"Least privilege for agents", sub:"Tools, sandboxes, approvals", rounds:[
 ["learn","Scope every tool","Give each tool the narrowest capability: read-only DB users, row-level filters by tenant, specific endpoints instead of a generic HTTP tool, amount limits. Use **short-lived, scoped credentials** held by the tool layer, never by the model."],
 ["sort","Good or bad tool design?",{"Good":["refund(payment_id, amount) capped at ₹5,000 with approval above","query_payments(merchant scoped to the caller)","Read-only replica credentials"],"Bad":["http_request(any_url, any_method)","run_sql(any_query) as admin","shell(command) on the prod host"]},"Generic power tools turn injections into breaches."],
 ["learn","Sandbox code execution","If the agent runs code: isolated container or microVM, no network (or allowlisted egress), CPU/memory/time limits, no host secrets, throwaway filesystem."],
 ["match","Control → stops",[["Network egress allowlist","Exfiltration to attacker domains"],["Human approval","Irreversible actions"],["Per-tenant row filters","Cross-tenant data leaks"],["Spending/rate limits","Unbounded consumption"]],"Map each control to a threat."],
 ["pick","Where should the refund limit be enforced?",["In the refund tool/API code","In the system prompt","In the user's message","In the model's temperature"],0,"Code is the boundary."]
]},
{t:"Outputs & governance", sub:"Validate, monitor, govern", rounds:[
 ["learn","Treat output as untrusted","Validate against schemas, parameterise SQL, escape HTML, allowlist URLs and image domains, scan for PII and secrets before display or logging. Never «eval» model output."],
 ["fill","Safe use of a model-suggested filter",'merchant_id = int(model_out["merchant_id"])\ncur.execute("SELECT * FROM payments WHERE merchant_id = ___ AND tenant_id = %s",\n            (merchant_id, ___))',["%s","current_user.tenant_id"],["{merchant_id}","model_out['tenant']"],"Parameterise, and take the tenant from the session, not the model."],
 ["learn","Governance","Inventory models and data flows, classify data, keep audit logs of prompts and tool calls (with PII redaction), monitor for abuse, have an incident runbook, and follow frameworks like **NIST AI RMF** and **ISO/IEC 42001**. Vet models and packages (supply chain)."],
 ["sort","Monitoring signal or not?",{"Watch it":["Spike in refused/blocked requests","Tool calls to unusual domains","Sudden token usage jump per user"],"Noise":["Model's favourite colour","Average font size in replies"]},"Monitor behaviour, not trivia."],
 ["tf","Governance facts",[["Logging full prompts with card numbers is fine for debugging.",false,"Redact or tokenise sensitive data."],["Model files from unknown sources can contain malicious code.",true,"Prefer safetensors and trusted sources."]]]
]},
{t:"Boss: Harden the assistant", boss:true, time:30, rounds:[
 ["pick","Emails can contain injections and the agent can send mail. Fix?",["Require human approval for outgoing mail and isolate untrusted content","Bigger model","Longer prompt","Temperature 0"],0,"Break the trifecta."],
 ["pick","The model writes SQL that's executed directly. Fix?",["Fixed parameterised queries/tools instead of free SQL","Ask it to be careful","Lower temperature","More examples"],0,"Constrain the capability."],
 ["pick","Cross-tenant leaks in RAG answers. Fix?",["Enforce tenant filters at retrieval in code","Prompt 'only use this merchant's data'","Rerank","Bigger chunks"],0,"Access control in code."],
 ["pick","Agent runs Python for analysis. Safe setup?",["Sandbox: no network, resource limits, no secrets","Run on the prod host","Admin user","Shared laptop"],0,"Isolation."],
 ["pick","Rendered answers leak data via image URLs. Fix?",["Allowlist image domains / strip external images","Disable markdown bold","Lower max_tokens","More logging"],0,"Close the channel."],
 ["pick","Bill spikes from abusive users. Fix?",["Per-user rate limits and token budgets","Bigger quota","Turn off logging","Use a smaller font"],0,"Limit consumption."]
]}
]});

QUEST.more("aidefense", [
{act:"Expert", t:"Architectural defense patterns", sub:"Designs that resist injection", rounds:[
 ["learn","Patterns that constrain what injected text can do","Research on securing LLM agents proposes designs where untrusted data **can't** change the agent's control flow. The key idea: once an agent ingests untrusted input, constrain it so that input can't trigger consequential actions.",null,null,`### The patterns
- **Action-selector**: the LLM only maps a request to one of a fixed set of actions; tool outputs never feed back into the LLM.
- **Plan-then-execute**: the LLM fixes the plan (which tools, in what order) **before** seeing untrusted data; data can influence parameters but not add new actions.
- **LLM map-reduce**: process each untrusted item in an isolated sub-call that returns constrained output (e.g. a boolean or a validated field); a separate step aggregates.
- **Dual LLM**: a privileged LLM plans and uses tools but only sees **symbolic references** («$VAR1») to untrusted content; a quarantined LLM processes the content with no tools.
- **Code-then-execute** (e.g. CaMeL-style): the LLM writes a program over tools; an interpreter tracks **data provenance/capabilities** and blocks flows like "untrusted data → send_email recipient".
- **Context minimization**: drop the user's original prompt or irrelevant content from later steps so injected text has less to work with.

### Trade-offs
More security usually means less flexibility. Pick the strongest pattern your task allows, and combine with least-privilege tools and human approval.`],
 ["match","Pattern",[["Action-selector","LLM picks from fixed actions; no feedback loop"],["Plan-then-execute","Tool plan fixed before reading untrusted data"],["Dual LLM","Quarantined model handles untrusted text; privileged model sees references"],["LLM map-reduce","Isolated per-item processing with constrained outputs"],["Code-then-execute with provenance","Interpreter blocks unsafe data flows"]],"Designs beat filters."],
 ["pick","An agent summarizes customer emails and then decides whether to issue refunds. Strongest simple pattern?",["Map-reduce: each email → constrained fields (intent, amount) validated by code; refunds decided by rules + approval","One agent reads all emails with refund tool enabled","Longer system prompt","Bigger model"],0,"Untrusted text never directly drives actions."],
 ["sort","Pattern fits the task?",{"Plan-then-execute":["Fetch 3 known reports and email a fixed recipient a summary"],"Dual LLM":["Assistant that must read untrusted web pages while holding email tools"],"Action-selector":["Support bot choosing among 6 canned workflows"]},"Choose the most constrained design that still works."],
 ["tf","Pattern truths",[["Plan-then-execute stops injected text from adding new tool calls.",true,"The plan is fixed first."],["Architectural patterns remove the need for least privilege.",false,"Layer them."]]]
]},
{act:"Expert", t:"Guardrail systems", sub:"Classifiers, rails, canaries", rounds:[
 ["learn","Input and output guardrails","Guardrails are **classifiers and rules** around the model: prompt-injection/jailbreak detectors, content safety classifiers, PII detectors, topic restrictions, and output validators. Examples include open models (e.g. Llama Guard, Prompt Guard), managed services (cloud guardrail products) and frameworks (NeMo Guardrails).",null,null,`### Design considerations
- **Latency**: classifiers add tens to hundreds of ms; run input checks in parallel with retrieval, and stream output checks.
- **False positives** block legitimate users; **false negatives** let attacks through. Tune thresholds per surface with labelled data.
- **Coverage**: check inputs *and* tool results *and* retrieved documents *and* outputs.
- **Fail mode**: decide whether a guardrail outage fails open or closed per risk level.

### Canary tokens
Put a random secret string in the system prompt; if it ever appears in output or outbound tool calls, you have a prompt-leak or exfiltration — alert and block.

### Rate and spend limits
Per-user and per-tenant request/token budgets cap abuse and "denial of wallet" attacks; anomaly detection on usage spikes.

### Remember
Guardrail classifiers are probabilistic and can be bypassed. They reduce risk; **architecture and permissions** bound the damage when they fail.`],
 ["num","An injection classifier has a 2% false positive rate. With 50,000 legitimate messages a day, how many are wrongly blocked?",1000,0,"messages","50,000 × 0.02 = 1,000/day. Tune thresholds or use softer actions (flag, require confirmation)."],
 ["sort","Where should a check run?",{"On input":["Jailbreak/injection detection on user prompts","PII detection before logging"],"On tool results / retrieved docs":["Injection detection in fetched web pages","Stripping invisible characters from tickets"],"On output":["PII/secret leakage check","Canary token detection","Allowlisted URLs only"]},"Defense at every boundary."],
 ["pick","The system prompt's canary string appears in an outbound HTTP tool call. Meaning?",["Likely prompt leakage/exfiltration attempt — block and alert","Normal behaviour","Cache hit","Rate limit"],0,"Canaries detect leaks."],
 ["tf","Guardrail truths",[["Guardrail classifiers can be bypassed.",true,"Layer with structural controls."],["Checking only user input is enough for agents.",false,"Tool results and documents carry injections too."]]]
]},
{act:"Expert", t:"Identity, authorization & secrets", sub:"Delegated access done right", rounds:[
 ["learn","Agents act on behalf of someone","Every tool call should carry the **end user's identity and permissions**, not a superuser service account. Use **delegated, scoped, short-lived** credentials (OAuth on-behalf-of / token exchange) so the agent can never do more than the user could.",null,null,`### Authorization outside the model
- A **policy engine** (e.g. OPA/Rego, Cedar) or plain code checks each tool call: who is asking, which resource, which action, amount limits, tenant boundaries.
- Deny by default; allowlist tools per agent and per task type.
- Re-check authorization at every hop in multi-agent systems (no privilege laundering through a more powerful agent).

### Secrets
- Never in prompts, CLAUDE.md-style files or tool descriptions.
- Held by the tool layer (vault, workload identity), injected at execution time, scoped to the operation.
- Rotate; log usage.

### Human approval UX
Show the **exact action and parameters** ("Refund ₹12,000 to payment p_9 for merchant MegaMart"), the reason and the data it's based on. Avoid approval fatigue: approve risky actions only, batch low-risk ones, and auto-deny on timeout for critical actions.

### Audit
Log who (user + agent + model version), what (tool + arguments), why (trace link), and outcome — immutable and searchable.`],
 ["order","A safe refund tool call",["Agent proposes refund(payment_id, amount)","Policy engine checks user role, tenant and limits","Above threshold: human approves the exact action","Tool executes with a scoped, short-lived credential","Audit log records user, agent, args and result"],"Authorization and audit outside the model."],
 ["pick","Agent uses one admin API key for all users' requests. Main risk?",["Any injection or bug can act beyond the user's permissions","Higher latency","More tokens","Cache misses"],0,"Use delegated, per-user credentials."],
 ["match","Control",[["Token exchange / on-behalf-of","Agent acts with the user's permissions"],["Policy engine (OPA/Cedar)","Central allow/deny decisions per tool call"],["Vault + workload identity","Secrets never enter prompts"],["Immutable audit log","Reconstruct who did what and why"]],"Identity is the backbone of agent security."],
 ["tf","Identity truths",[["Approval prompts should show the exact parameters.",true,"Users approve what they can see."],["Putting API keys in the system prompt is fine if the model is told to hide them.",false,"Never put secrets in prompts."]]]
]},
{act:"Expert", t:"Governance & incident response", sub:"Frameworks, kill switches, playbooks", rounds:[
 ["learn","Frameworks you'll be asked about","**NIST AI RMF**: four functions — **Govern, Map, Measure, Manage**. **ISO/IEC 42001**: certifiable AI management system. **EU AI Act**: risk-based obligations (prohibited practices, high-risk systems, transparency duties, general-purpose AI model obligations). **OWASP** and **MITRE ATLAS** for threat catalogues.",null,null,`### Operational governance
- **Inventory**: every model, prompt, agent, tool, data source and owner (an AI bill of materials).
- **Risk tiering**: what can each system do, to whom, with which data?
- **Change management**: prompt/model/tool changes go through evals and review like code.
- **Evaluation**: safety and security evals (red-team suites) per release.

### AI incident response
1. **Detect**: alerts from guardrails, canaries, anomaly detection, user reports.
2. **Contain**: **kill switches** — disable a tool, an agent, a model version, or outbound channels instantly via feature flags; revoke credentials.
3. **Investigate**: traces of model calls and tool calls, inputs/outputs, data accessed.
4. **Eradicate**: remove poisoned documents/memories, fix permissions, patch prompts/architecture.
5. **Recover**: restore service gradually with added monitoring.
6. **Learn**: post-incident review; add attacks to regression suites.

### Data protection
Classify data used in prompts, logs and training; minimize retention; redact PII in traces; respect data residency for providers and vector stores.`],
 ["match","NIST AI RMF function",[["Govern","Policies, roles, accountability"],["Map","Context, intended use, risks identified"],["Measure","Testing, metrics, evaluation"],["Manage","Prioritize and act on risks, incident response"]],"Four functions to remember."],
 ["order","AI incident: agent emailing customer data externally",["Alert fires on unusual outbound domain","Kill switch disables the email tool","Revoke the agent's credentials; preserve traces","Find and remove the poisoned source; fix permissions","Restore with new guardrails and regression tests"],"Contain first, then investigate."],
 ["pick","Fastest containment for a misbehaving tool in production?",["Feature-flag kill switch for that tool","Retrain the model","Write a new prompt","Wait for the next release"],0,"Design kill switches before you need them."],
 ["tf","Governance truths",[["An AI inventory should include prompts, tools and data sources.",true,"Not just models."],["Incidents should produce new regression tests.",true,"Learn and lock in."]]]
]},
{act:"Expert", t:"Expert boss: Security architecture review", boss:true, time:45, rounds:[
 ["pick","Email triage agent with refund tools reads raw customer emails. Redesign?",["Map-reduce extraction to validated fields + rules + approval for refunds","Bigger guardrail model only","Longer prompt","Temperature 0"],0,"Structural isolation."],
 ["pick","Injection classifier blocks 3% of genuine Hindi messages. Fix?",["Tune thresholds with labelled multilingual data; soften action to flag/confirm","Turn it off","Block all Hindi","Bigger model"],0,"Measure false positives per segment."],
 ["pick","Agents share one admin service account. Fix?",["Per-user delegated, scoped, short-lived credentials + policy checks","Rotate admin key weekly","Hide the key in prompt","More logging only"],0,"Least privilege per user."],
 ["pick","A low-privilege agent asks the finance agent to pay invoices. Control?",["Re-authorize at each hop against the original user","Trust internal agents","Rate limit only","Bigger model"],0,"No privilege laundering."],
 ["pick","Need to stop an exfiltrating tool in seconds. Have…",["A kill switch feature flag per tool","A runbook PDF","Model retraining","A new prompt"],0,"Pre-built containment."],
 ["pick","Auditors ask who approved a ₹2 lakh refund and why. Need…",["Immutable audit log with user, agent, args, approval and trace link","Chat history screenshots","Model card","Dashboards"],0,"Traceable decisions."],
 ["pick","Which framework structures risk work as Govern–Map–Measure–Manage?",["NIST AI RMF","ISO 27001","PCI DSS","SOC 2"],0,"NIST AI RMF."]
]}
]);
