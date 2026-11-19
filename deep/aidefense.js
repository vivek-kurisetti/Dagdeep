QUEST.deep("aidefense", {
"Assume the model can be tricked": {
d: `Design principle: treat the LLM like an **untrusted component** that may be fully controlled by an attacker on any given request. Then ask: with the model compromised, what's the worst it can do? Make that answer "not much".

**Defence in depth** layers:
1. **Input**: classify/flag injection and abuse; normalise content; size limits.
2. **Context separation**: untrusted content clearly marked; isolate untrusted processing (dual-LLM, quarantined contexts).
3. **Capabilities**: least-privilege tools, tenant and user scoping in code, egress limits.
4. **Approvals**: humans confirm irreversible or high-value actions.
5. **Output**: validate, escape, scan for PII/secrets, allowlist links/images.
6. **Monitoring**: traces, anomaly alerts, rate limits, kill switches.
No single layer is sufficient; each reduces probability or impact.`,
life: `Banks assume a teller could be fooled, so tellers have transaction limits, big withdrawals need a manager, vaults have time locks and cameras record everything.`,
work: `Threat model for a payout assistant assumed full hijack. Result: it can read only the logged-in merchant's data (row-level filter), propose payouts but not execute them (approval in the dashboard), and can't send messages outside the app. A later successful jailbreak in testing produced only a rude reply, no data or money impact.`,
ex: `threat_model = {
  "assume": "model fully controlled by attacker",
  "can_read": "current merchant's records only (enforced by DB policy)",
  "can_write": "draft payout requests (human approval required)",
  "egress": "none (no URL fetch, images from CDN only)",
  "worst_case": "misleading text to this merchant -> mitigated by UI disclaimers + audit"}`,
pit: [`Relying on the system prompt as a security boundary.`, `Security logic inside prompts instead of code.`, `One layer only (e.g. just an input filter).`],
q: [`What's the key question in "assume the model can be tricked" design?`, `If the model is fully hijacked, what's the worst it can do with its permissions, and how do we make that small?`]
},
"Separate instructions from data": {
d: `Since the model can't inherently distinguish commands from content, make the separation as explicit and structural as possible:
- **Spotlighting / delimiting**: wrap untrusted text in tags or markers, state in the system prompt that content in those tags is data and must never be followed. Variants: datamarking (interleave a special character), encoding untrusted text.
- **Role separation**: keep instructions in the system prompt; untrusted content only in user/tool content.
- **Dual-LLM pattern**: a **privileged** LLM plans and calls tools but never sees raw untrusted text; a **quarantined** LLM processes untrusted content with no tools, and its outputs are passed back as **opaque variables** (references) or strictly validated structured fields.
- **Structured extraction**: convert untrusted text into constrained fields (enum intent, numbers) before any privileged step uses it.

These reduce injection success; they don't eliminate it.`,
life: `A judge reads evidence documents but follows only the court's procedures. Better still, a clerk reads unknown letters first and passes the judge only a form with ticked boxes, never the letter's free text.`,
work: `An email-triage agent fed raw emails into a planner with tool access. Refactoring to a quarantined extractor (no tools) returning «{intent: enum, order_id: pattern-validated, sentiment}» and a planner that only saw those fields removed every injection path found in red-team tests, since free text never reached the tool-using model.`,
ex: `# quarantined: no tools
fields = quarantined_llm(
  "Extract fields from the email. Output JSON only.", email_text,
  schema={"intent": ["REFUND","STATUS","OTHER"], "order_id": r"^ORD-\\d{8}$"})
validate(fields)
# privileged: never sees email_text
plan = privileged_llm(f"Customer intent={fields['intent']} order={fields['order_id']}", tools=TOOLS)`,
pit: [`Delimiters without telling the model what they mean.`, `Passing quarantined free text straight to the privileged model.`, `Believing delimiting alone is a complete defence.`],
q: [`In the dual-LLM pattern, which model sees untrusted text?`, `Only the quarantined model, which has no tools; the privileged model sees only validated or opaque outputs.`]
},
"Break the lethal trifecta": {
d: `If a task requires reading untrusted content, make sure that same context lacks at least one of: private data, external communication.

Practical ways:
- **Split agents**: a browsing/reading agent with no private data access; a data agent that never reads untrusted content.
- **Remove egress**: no arbitrary HTTP, no remote image rendering, email only to verified internal domains, outbound messages require human approval.
- **Remove private data**: run the untrusted-content task in a fresh session without user secrets, memory or connected accounts.
- **Taint tracking**: once untrusted content enters a session, automatically disable sensitive tools for the rest of it (or require approval).

Document for each agent which legs it has; any agent with all three is a design bug.`,
life: `If the house-sitter must read strangers' letters, don't also give them the safe key; or if they need the safe key, have someone else read the letters.`,
work: `A research assistant needed to browse the web (untrusted) and access internal pricing docs (private). They split it: a browser subagent returns summaries with no internal access; the main agent reads internal docs but has no web tools; outbound emails need user click-to-send. A red-team attempt to exfiltrate pricing via a crafted web page failed.`,
ex: `class Session:
    def add_content(self, content, trusted):
        if not trusted:
            self.tainted = True
    def allow(self, tool):
        if self.tainted and tool in {"send_email", "http_fetch", "post_slack"}:
            return "needs_approval"
        return "allow"`,
pit: [`One "do-everything" assistant with all integrations.`, `Forgetting that rendering images is egress.`, `Tainted sessions that keep full privileges.`],
q: [`An agent must summarise inbound emails and has access to the CRM. How do you break the trifecta?`, `Remove external communication from that context (no fetch, no sending, no remote images), or require human approval for any outbound action.`]
},
"Scope every tool": {
d: `Least privilege at the tool level:
- **Read-only** credentials unless writes are needed; separate read and write tools.
- **Tenant/user scoping in code**: the tool gets «merchant_id» from the authenticated session, not from model arguments; DB row-level security as a backstop.
- **Narrow endpoints** instead of generic capabilities («get_order_status» not «http_request», «query_sales_summary» not «run_sql»).
- **Limits**: amount caps, rate limits, daily quotas, allowed recipients/domains, allowed file paths.
- **Short-lived, scoped tokens** per tool and per user (OAuth scopes, STS credentials).
- **Idempotency and dry-run** modes for writes.

If an argument controls who/what is accessed, validate it against the user's permissions every call.`,
life: `Giving a delivery person a key that opens only the building's parcel room, only during the day, instead of a master key to every flat.`,
work: `An analytics agent had «run_sql» with a DB user that could read every table, including card tokens. Replacing it with three parameterised query tools over a read-only role restricted to aggregated views and enabling Postgres RLS by «merchant_id» meant even a fully hijacked agent could only see the current merchant's aggregates.`,
ex: `CREATE ROLE agent_ro NOLOGIN;
GRANT SELECT ON v_merchant_daily_sales TO agent_ro;
ALTER TABLE v_merchant_daily_sales ENABLE ROW LEVEL SECURITY;  -- (on base table)
CREATE POLICY by_merchant ON sales USING (merchant_id = current_setting('app.merchant_id')::bigint);
def query_sales(from_date, to_date):
    with conn(role="agent_ro", settings={"app.merchant_id": session.merchant_id}) as c:
        return c.execute(SQL_SALES, (from_date, to_date)).fetchall()`,
pit: [`Model-supplied tenant ids.`, `Shared admin service accounts.`, `Generic SQL/HTTP/shell tools in production agents.`],
q: [`Why should the tenant id come from the session, not the model's tool arguments?`, `The model's arguments can be manipulated by injected content; the session identity is authenticated by your system.`]
},
"Sandbox code execution": {
d: `If an agent writes and runs code (data analysis, scripts), assume the code may be malicious (via injection or plain mistakes). Isolation checklist:
- Run in an **isolated container or microVM** (gVisor, Firecracker), not on app servers.
- **No network**, or an egress **allowlist** (package mirror only), to prevent exfiltration and downloading tools.
- **Resource limits**: CPU, memory, disk, process count, and a wall-clock timeout.
- **No host secrets**: no cloud credentials, no mounted home directories, no Docker socket.
- **Ephemeral**: fresh sandbox per task, destroyed afterwards; read-only base image.
- **Least data**: mount only the files the task needs; outputs go through review/validation.
- Log commands and outputs for audit.`,
life: `Letting a visitor experiment in a lab: a separate sealed room, no phone line out, limited supplies, a timer on the door, and the room is cleaned completely after each visitor.`,
work: `A data-analysis agent ran Python inside the API server's container, which had an AWS role with S3 write access. Moving execution to Firecracker microVMs with no network and only the uploaded CSV mounted removed both the exfiltration path and the risk of a runaway loop taking down the API.`,
ex: `docker run --rm --network none --memory 1g --cpus 1 --pids-limit 128 \\
  --read-only --tmpfs /tmp:size=256m \\
  -v "$PWD/task_input:/data:ro" --security-opt no-new-privileges \\
  sandbox-python:3.12 timeout 60 python /data/analysis.py`,
pit: [`Running agent code in the application process.`, `Sandboxes with network access and cloud credentials.`, `Reusing sandboxes across users.`],
q: [`Why disable network in code sandboxes?`, `It blocks exfiltration of data and downloading of malicious payloads if the generated code is hostile.`]
},
"Treat output as untrusted": {
d: `Model output is user-controllable text (an attacker can influence it). Wherever it goes, handle it like external input (OWASP LLM05):
- **To SQL**: never concatenate; use parameterised queries or a fixed set of query templates. If generating SQL, run with read-only, restricted roles and validate against an allowlist of tables.
- **To HTML/markdown**: escape, sanitise, restrict links/images (CSP), no raw HTML rendering.
- **To shells/APIs**: validate against schemas and allowlists; never «eval» or «exec».
- **To other systems/agents**: schema validation, size limits, business rule checks (amounts, ids belong to the user).
- **Before display/logging**: scan for PII and secrets; redact.

The same applies to tool results flowing back into prompts.`,
life: `A translator's output still goes through the editor before printing; you don't send it straight to the press just because the translator usually gets it right.`,
work: `A dashboard rendered model-generated summaries with «innerHTML». A red-team ticket made the model output a script tag; it executed in the support agent's browser (XSS) with their session. Switching to text rendering with a sanitiser and a strict CSP closed it.`,
ex: `// browser
el.textContent = modelOutput;                      // not innerHTML
// or sanitise markdown
el.innerHTML = DOMPurify.sanitize(marked.parse(modelOutput), {ALLOWED_URI_REGEXP: /^https:\\/\\/(docs|cdn)\\.ourcompany\\.in/});
# python
cur.execute("SELECT * FROM orders WHERE id = %s AND merchant_id = %s", (fields["order_id"], session.mid))`,
pit: [`innerHTML / eval on model output.`, `LLM-generated SQL with write privileges.`, `Logging raw outputs containing PII.`],
q: [`Which OWASP LLM risk is "model output passed unvalidated into a browser or SQL"?`, `LLM05 Improper Output Handling.`]
},
"Governance": {
d: `Security of AI systems is also organisational:
- **Inventory**: every model, provider, prompt, dataset, RAG index, agent, tool and data flow; owners for each.
- **Data classification**: what data may go to which model (e.g. no card data to external APIs; PII redaction; data residency).
- **Vendor review**: data retention, training use, region, certifications of model providers.
- **Audit logs**: prompts, tool calls, outputs (with PII redaction), approvals; retention per policy.
- **Monitoring**: abuse patterns, cost spikes, guardrail hits, drift in quality.
- **Incident runbook**: how to disable an agent/tool quickly (kill switch), rotate credentials, notify users/regulators.
- **Change management**: evals and security tests before prompt/model/tool changes ship.
- **Training** for developers and users on risks and acceptable use.`,
life: `Like running a fleet of company vehicles: a register of every car, rules on who drives what, logbooks, regular inspections, and a procedure when there's an accident.`,
work: `An audit asked "which systems send customer data to external LLM APIs?" Nobody knew; three teams had shadow integrations. The result was an AI inventory, a gateway through which all LLM calls must go (with PII redaction and logging), and a quarterly review tied to the company's RBI data-localisation obligations.`,
ex: `ai_inventory:
  - name: merchant-support-assistant
    owner: payments-cx
    model: provider-x / model-y (region: ap-south-1)
    data: [merchant_profile, settlements]  # no card data
    tools: [get_settlements, create_ticket]
    approvals: [refund > 5000]
    logs: traces 90d, redacted
    kill_switch: feature_flag.support_assistant`,
pit: [`Shadow AI integrations bypassing review.`, `Logs containing raw PII.`, `No way to switch an agent off quickly.`],
q: [`Why route all LLM calls through a central gateway?`, `It gives one place to enforce redaction, logging, quotas, provider allowlists and to switch things off.`]
},
"Patterns that constrain what injected text can do": {
d: `Research ("Design Patterns for Securing LLM Agents against Prompt Injections", 2025, and Google DeepMind's CaMeL) proposes architectures where untrusted data **cannot alter control flow**:
- **Action-selector**: the LLM only picks from a fixed set of actions; tool outputs never come back to the LLM.
- **Plan-then-execute**: the plan (sequence of tool calls) is fixed **before** reading untrusted data; data can fill parameters but not add actions.
- **LLM map-reduce**: untrusted items processed by isolated LLM calls with constrained outputs, aggregated by code.
- **Dual LLM**: privileged planner + quarantined processor with symbolic variables.
- **Code-then-execute (CaMeL)**: the LLM writes a program; an interpreter tracks data provenance (capabilities) and enforces policies on what tainted values may flow into.
- **Context minimisation**: remove the user's original prompt/untrusted text from context before later steps.

Each trades flexibility for provable limits on what injection can achieve.`,
life: `A bank teller who decides the steps of a transaction before opening the customer's letter: whatever the letter says, it can only fill in the amount field of a pre-approved form, not add "also transfer to account X".`,
work: `An invoice-processing agent was redesigned as plan-then-execute: the plan "extract fields → validate vendor → create payable draft" is fixed by code; the LLM reading the invoice only returns schema-bound fields. Injected text in invoices could at worst produce wrong field values, which vendor validation and human approval catch.`,
ex: `PLAN = ["extract_invoice_fields", "match_vendor", "create_payable_draft"]   # fixed in code
fields = quarantined_extract(invoice_text, InvoiceSchema)   # untrusted -> constrained
vendor = match_vendor(fields.gstin)                          # deterministic
if vendor and fields.total_inr < vendor.limit:
    create_payable_draft(vendor.id, fields.total_inr)         # still needs approval`,
pit: [`Assuming these patterns are free (they reduce flexibility).`, `Letting tool outputs re-enter the planner's context.`, `Using unconstrained free text as parameters for sensitive actions.`],
q: [`How does plan-then-execute limit injection?`, `The action sequence is decided before untrusted data is read, so injected text can't add new actions, only influence parameter values.`]
},
"Input and output guardrails": {
d: `Guardrails are checks around model calls:
- **Input**: prompt-injection / jailbreak classifiers (e.g. Prompt Guard-style models, provider safety endpoints), content safety (toxicity, self-harm), PII detection and redaction, topic restrictions, size limits.
- **Output**: content safety, PII/secret scanners, schema validation, groundedness checks (does the answer match retrieved sources?), policy rules (no financial advice, no competitor mentions), link/image allowlists.
- **Tool calls**: argument validation, policy engines (OPA-style rules), approval routing.

Frameworks: NVIDIA NeMo Guardrails, Guardrails AI, Llama Guard, cloud provider guardrail services. Measure guardrails like any model: precision/recall on your data, latency and cost added, and **false positives** that frustrate users. They reduce risk; they don't replace permission design.`,
life: `Airport security: bag scanners at entry (input), checks at boarding (output), and staff who can stop specific actions. Useful layers, but the cockpit door is still locked.`,
work: `Adding an off-the-shelf toxicity filter blocked 4% of legitimate merchant messages containing Hindi slang about delays. The team calibrated thresholds on 2,000 labelled messages, added a Hinglish-aware classifier, and routed borderline cases to a softer response instead of a hard block; false positives fell to 0.3%.`,
ex: `def guarded_call(user_msg):
    if injection_score(user_msg) > 0.9: return SAFE_REFUSAL
    msg = redact_pii(user_msg)
    out = llm(msg)
    if pii_found(out) or not schema_ok(out) or not grounded(out, ctx):
        return fallback()
    return out`,
pit: [`Untested thresholds causing many false positives.`, `Guardrails as the only defence.`, `Ignoring added latency in real-time flows.`],
q: [`Why measure false positives of guardrails?`, `Over-blocking legitimate users damages the product and pushes people to work around the system.`]
},
"Agents act on behalf of someone": {
d: `An agent's tool calls should carry the **end user's identity and permissions**, so it can never do more than the user could do themselves. Patterns:
- **Delegated authorization**: OAuth 2.x flows where the user grants the agent specific **scopes** (read calendar, not delete). Token exchange (RFC 8693) for downstream services with narrowed scope.
- **Short-lived, audience-restricted tokens** per tool/server; refresh tokens stored securely, never in prompts.
- **Per-user policy checks** in every tool (does this user own this order?).
- **Consent and visibility**: users see what the agent can access and can revoke it.
- **Audit**: log "agent X acting for user Y did Z", distinct from the user's own actions.
- For MCP: servers should validate tokens issued for them (audience), not pass tokens through to other APIs.`,
life: `A personal assistant with a signed letter of authority that says exactly what they may do for you ("collect my parcels", not "sign property papers"), valid until Friday.`,
work: `An internal ops agent used a single service account with access to every merchant's data, so any employee asking it could see any merchant. Switching to token exchange with the employee's identity and role scopes meant the agent saw only merchants assigned to that employee; audit logs now show "agent on behalf of <employee>".`,
ex: `# exchange the user's token for a narrow downstream token
resp = requests.post(TOKEN_URL, data={
  "grant_type": "urn:ietf:params:oauth:grant-type:token-exchange",
  "subject_token": user_access_token,
  "subject_token_type": "urn:ietf:params:oauth:token-type:access_token",
  "audience": "settlements-api", "scope": "settlements:read"})
api.get("/settlements", headers={"Authorization": f"Bearer {resp.json()['access_token']}"})`,
pit: [`One superuser service account for all users.`, `Tokens placed in the model's context.`, `Passing a user token meant for one API through to another (token passthrough).`],
q: [`Why not run all agent tools with one powerful service account?`, `The agent could then access data or perform actions the requesting user isn't allowed to (confused deputy), and audit can't tell users apart.`]
},
"Frameworks you'll be asked about": {
d: `- **NIST AI RMF 1.0** (+ Generative AI Profile, 2024): four functions: **Govern** (policies, roles, culture), **Map** (context, risks of each system), **Measure** (test, evaluate, track metrics), **Manage** (prioritise, respond, monitor).
- **ISO/IEC 42001**: certifiable **AI management system** standard (like ISO 27001 for AI): policies, risk assessment, controls, continual improvement.
- **EU AI Act**: risk-based law: prohibited practices, **high-risk** systems (e.g. creditworthiness assessment) with obligations on data, documentation, human oversight, robustness; transparency duties for some AI; obligations for general-purpose AI models. Phased application from 2025–2027.
- **OWASP Top 10 for LLM Apps** and **OWASP Agentic AI threats**: practical engineering risk lists.
- **MITRE ATLAS**: adversary tactics and techniques against AI systems (like ATT&CK).
- In India: the **DPDP Act 2023** governs personal data processing; sector regulators (RBI) add expectations for financial services.`,
life: `Building codes, fire codes and safety certifications for a building: different documents for different purposes, but an inspector expects you to know which apply.`,
work: `For a credit-risk feature using an LLM, the compliance team mapped controls to NIST AI RMF functions, documented the system under ISO 42001-style procedures, checked whether EU customers made it "high-risk" under the EU AI Act, and verified DPDP consent and purpose limits for the personal data used.`,
ex: `| Framework | Type | Use it for |
|---|---|---|
| NIST AI RMF | voluntary framework | structuring risk management (Govern/Map/Measure/Manage) |
| ISO/IEC 42001 | certifiable standard | an auditable AI management system |
| EU AI Act | law | obligations by risk tier in the EU |
| OWASP LLM Top 10 | engineering list | threat modelling LLM apps |
| MITRE ATLAS | threat knowledge base | red-team planning |`,
pit: [`Confusing voluntary frameworks with legal obligations.`, `Paper compliance without engineering controls.`, `Ignoring local data protection law.`],
q: [`What are the four functions of the NIST AI RMF?`, `Govern, Map, Measure, Manage.`]
}
});
