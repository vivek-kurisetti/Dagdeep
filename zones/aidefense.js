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
