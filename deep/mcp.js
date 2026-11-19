QUEST.deep("mcp", {
"Three roles": {
d: `The **Model Context Protocol** defines three roles:
- **Host**: the AI application the user interacts with (Claude apps, an IDE like Cursor/VS Code, your own agent). It owns the LLM, the UI, user consent and security policy.
- **Client**: a connector inside the host, **one per server**, maintaining a 1:1 stateful session with that server (handshake, capability negotiation, message routing).
- **Server**: a program exposing capabilities (tools, resources, prompts) for one system: GitHub, Postgres, Jira, your internal settlements API.

The host can connect to many servers at once; servers don't see each other or the full conversation, only what the host sends them. That isolation is a security property: a server only learns what it needs for its own requests.`,
life: `A smartphone (host) with one app connector (client) per service, each talking to its own backend (server). The Uber backend never sees your WhatsApp chats.`,
work: `A data team's internal assistant (host) connected to three MCP servers: «warehouse» (read-only Redshift queries), «airflow» (DAG status), «pagerduty» (incidents). Each server was built and owned by the team running that system; the assistant team only configured which servers to connect.`,
ex: `// host config (e.g. claude_desktop_config.json style)
{"mcpServers": {
  "warehouse": {"command": "uvx", "args": ["warehouse-mcp"], "env": {"WH_ROLE": "readonly"}},
  "airflow":   {"url": "https://mcp.internal/airflow"}
}}`,
pit: [`Confusing host and client (client is per server, inside the host).`, `Assuming servers see the whole conversation.`, `One mega-server for every system.`],
q: [`How many MCP clients does a host create when connected to 4 servers?`, `Four: one client per server connection.`]
},
"Why a protocol": {
d: `Without a standard, each AI app integrates each data source with custom code: **N apps × M integrations**. Every new model app re-implements GitHub, Slack, databases; every tool vendor writes plugins for each app.

MCP turns this into **N + M**: each integration is written once as an MCP server; any MCP-compatible host can use it. It standardises:
- discovery (list tools/resources/prompts and their schemas),
- invocation and results (JSON-RPC 2.0 messages),
- transports (stdio, Streamable HTTP),
- auth for remote servers (OAuth 2.1),
- notifications (lists changed, progress, logging).

Like USB-C or LSP (Language Server Protocol, which did the same for editors × languages).`,
life: `USB-C: one standard port means any charger works with any phone, instead of a drawer full of brand-specific cables.`,
work: `The company had separate Slack-bot, IDE-plugin and web-assistant integrations with Jira, each maintained by different teams with different bugs. One Jira MCP server replaced all three integrations; new hosts (a CLI agent) got Jira support for free.`,
ex: `# same server, many hosts
Claude app    ─┐
IDE agent      ├──► jira-mcp-server ──► Jira REST API
Internal agent ┘`,
pit: [`Building host-specific plugins when an MCP server would do.`, `Treating MCP as an LLM framework (it's a protocol).`, `Assuming every host supports every optional feature.`],
q: [`What N×M problem does MCP solve?`, `Each AI app needing custom code for each integration; with MCP, integrations are written once and reused by any host.`]
},
"Server primitives": {
d: `Servers expose three primitives, distinguished by **who controls them**:
- **Tools** (model-controlled): actions/functions the LLM decides to call, with a JSON-schema input: «create_issue», «run_query», «get_weather». May have side effects; hosts should get user consent.
- **Resources** (application-controlled): read-only data identified by **URIs** («file:///…», «postgres://db/schema/orders»). The host/user chooses which to attach as context; servers can support subscriptions for updates and URI templates.
- **Prompts** (user-controlled): reusable prompt templates with arguments, often surfaced as slash commands («/summarise-incident incident_id=…»).

Choosing the right primitive matters: put "read the schema" as a resource the user attaches, "execute query" as a tool, and "standard incident review" as a prompt.`,
life: `A restaurant: tools are the waiter taking actions you ask for, resources are the menu and specials board you can look at, prompts are set-meal combos you order by name.`,
work: `A Postgres MCP server exposed table schemas as resources (so the user could attach exactly the relevant tables), a read-only «query» tool, and a «/explain-slow-query» prompt that structured the analysis. Hallucinated column names dropped because accurate schemas were in context.`,
ex: `@mcp.resource("schema://{table}")
def table_schema(table: str) -> str:
    return describe(table)

@mcp.tool()
def query(sql: str) -> list[dict]:
    """Run a read-only SQL query (SELECT only, max 500 rows)."""
    return run_readonly(sql, limit=500)

@mcp.prompt()
def explain_slow_query(sql: str) -> str:
    return f"Analyse this query's plan and suggest indexes:\\n{sql}"`,
pit: [`Exposing everything as tools (no user control over context).`, `Side-effecting "resources".`, `Huge resources attached by default.`],
q: [`Who controls tools, resources and prompts respectively?`, `Tools: the model. Resources: the application/user. Prompts: the user.`]
},
"Client features": {
d: `MCP is bidirectional; servers can request things **from the client** (if the client declared support):
- **Sampling**: the server asks the host's LLM to generate a completion («sampling/createMessage»). The server needs no API key of its own; the host stays in control (user review, model choice, cost). Useful for servers that need summarisation or classification as part of a tool.
- **Roots**: the client tells the server which directories/URIs it's allowed to operate within (e.g. the open project folder).
- **Elicitation**: the server asks the user for structured input mid-operation ("Which environment: staging or prod?") with a schema; the host renders a form.

Plus utilities: progress notifications, cancellation, logging, completion (argument autocomplete).`,
life: `A contractor (server) who can ask the homeowner (client) questions: "which rooms am I allowed in?" (roots), "which tiles do you want?" (elicitation), or "could your assistant write the summary report?" (sampling).`,
work: `A deploy MCP server used elicitation to confirm the target environment and change ticket before running «deploy_service», and sampling to generate a release-note summary using the host's model, so the server team didn't manage LLM keys or billing.`,
ex: `# server side (Python SDK sketch)
@mcp.tool()
async def deploy_service(name: str, ctx: Context) -> str:
    choice = await ctx.elicit("Confirm deployment", schema=DeployConfirm)
    if choice.action != "accept": return "Cancelled"
    notes = await ctx.session.create_message(
        messages=[{"role": "user", "content": {"type": "text", "text": f"Summarise changes for {name}"}}],
        max_tokens=300)
    return run_deploy(name, choice.data.env, notes)`,
pit: [`Using sampling without considering the host may deny it.`, `Ignoring roots and touching files outside them.`, `Elicitation for secrets (don't ask for passwords this way).`],
q: [`Why is sampling useful for server authors?`, `The server can use an LLM via the host without its own model credentials, while the host keeps control of model choice, cost and consent.`]
},
"Two standard transports": {
d: `- **stdio**: the host launches the server as a **local subprocess** and exchanges newline-delimited JSON-RPC over stdin/stdout. No network exposure, simplest setup, runs with the user's local permissions. Typical for local tools (filesystem, git, local DBs). Logs must go to stderr, never stdout.
- **Streamable HTTP**: the server runs as an independent web service with a single MCP endpoint. Clients POST messages; the server replies with JSON or an **SSE stream** for streaming/multiple messages; supports sessions («Mcp-Session-Id») and resumability. Used for remote, shared, multi-user servers with OAuth.

The older **HTTP+SSE** transport (two endpoints) is deprecated in favour of Streamable HTTP. Custom transports are allowed if they carry JSON-RPC.`,
life: `stdio is an intercom inside your house: private and direct. Streamable HTTP is a phone line to a shop across town: anyone allowed can call, so you need ID checks.`,
work: `A team started with a stdio Postgres server on each analyst's laptop (with each analyst's DB credentials). For shared, governed access they moved to a Streamable HTTP server in the VPC behind SSO/OAuth, with a read-only DB role, audit logging and rate limits.`,
ex: `# stdio server
mcp.run(transport="stdio")          # print() would corrupt the protocol; log to stderr
# HTTP server
mcp.run(transport="streamable-http", host="0.0.0.0", port=8000)   # endpoint /mcp`,
pit: [`Printing debug output to stdout in stdio servers.`, `Exposing an HTTP server without auth or with wildcard origins.`, `Building new servers on the deprecated HTTP+SSE transport.`],
q: [`Why must stdio servers never write logs to stdout?`, `stdout carries the JSON-RPC protocol; extra output corrupts messages.`]
},
"Build with an SDK": {
d: `Official SDKs exist for Python, TypeScript, Java, Kotlin, C#, Go, Ruby, Rust, Swift. In Python, **FastMCP** (part of the «mcp» package) turns decorated functions into tools: the function name becomes the tool name, the **docstring** becomes the description, and **type hints** (incl. Pydantic models) become the input JSON schema; return types can produce structured output.

Good practice:
- Write descriptions for the model: what it does, when to use, units/formats, limits.
- Validate inputs beyond types (ranges, allowlists) and enforce auth in the server.
- Return concise, structured results; errors as clear messages.
- Test with the **MCP Inspector** («npx @modelcontextprotocol/inspector») before connecting to a host.
- Package with «uv»/«uvx» or containers; pin dependencies.`,
life: `A form builder: you describe fields once (types, help text), and it generates the form, validation and documentation for you.`,
work: `An engineer built a «settlements» MCP server in an afternoon: 4 tools with Pydantic inputs, tested in MCP Inspector, containerised, and deployed behind the company's OAuth proxy. The richest time sink was writing good descriptions; the first version had the model confusing «settlement_date» with «transaction_date».`,
ex: `from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, Field
mcp = FastMCP("settlements")

class Range(BaseModel):
    from_date: str = Field(description="YYYY-MM-DD, settlement date (not txn date)")
    to_date: str

@mcp.tool()
def list_settlements(r: Range) -> list[dict]:
    """List settlements for the authenticated merchant. Amounts in INR."""
    return api.settlements(current_merchant(), r.from_date, r.to_date)

if __name__ == "__main__":
    mcp.run()`,
pit: [`Missing or vague docstrings.`, `Trusting type hints as full validation.`, `Skipping Inspector testing.`],
q: [`In FastMCP, where does a tool's input schema come from?`, `The function's type hints (and Pydantic models), with descriptions from the docstring/Field metadata.`]
},
"Auth for remote servers": {
d: `For HTTP transports, MCP authorization is based on **OAuth 2.1**:
- The MCP server is an OAuth **resource server**: it accepts **bearer access tokens** and validates them (signature, expiry, **audience** = this server, scopes).
- An **authorization server** (your IdP: Okta, Entra ID, Auth0, Keycloak, or the server's own) issues tokens after user login and consent.
- Clients use **Authorization Code + PKCE**; discovery via **Protected Resource Metadata** (RFC 9728) and auth server metadata; clients may register dynamically or via client ID metadata documents.
- **No token passthrough**: the server must not accept tokens issued for other services nor forward the client's token to upstream APIs; use its own credentials or token exchange for downstream calls.

stdio servers don't use this flow; they typically use credentials from the environment.`,
life: `A hotel (resource server) accepts key cards (tokens) issued by the front desk (authorization server) for that hotel only. A key card from another hotel doesn't open your room, and staff don't hand your card to the restaurant.`,
work: `A Jira MCP server first used one shared API token for all users, so everyone's agent could see every project. Rebuilding it as an OAuth resource server with the company IdP meant each user's agent got tokens scoped to their identity; Jira permissions applied per user and audit logs showed real names.`,
ex: `GET /mcp  (no token)
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer resource_metadata="https://mcp.internal/.well-known/oauth-protected-resource"
# server validates every request
claims = verify_jwt(token, issuer=IDP, audience="https://mcp.internal/jira")
require_scope(claims, "jira:read")`,
pit: [`Shared static API keys for multi-user servers.`, `Not validating token audience.`, `Passing client tokens through to upstream APIs.`],
q: [`What is "token passthrough" and why is it forbidden?`, `Forwarding a token meant for the MCP server (or accepting one meant for another API); it breaks audience checks, auditing and least privilege.`]
},
"Threats specific to MCP": {
d: `- **Tool poisoning**: hidden instructions in tool descriptions or tool results that steer the model.
- **Rug pulls**: a server changes tool definitions after users approved it.
- **Tool shadowing / cross-server influence**: one server's descriptions alter how the model uses another server's tools.
- **Confused deputy**: a proxy server with its own static credentials acting for users who shouldn't have access.
- **Token theft and over-scoped tokens**: servers holding powerful OAuth tokens for many services.
- **Local server risks**: stdio servers run with the user's OS permissions; a malicious package can read files and keys.
- **Session hijacking** on HTTP transports with weak session ids; **DNS rebinding** against local HTTP servers.

Mitigations: allowlisted, pinned servers; show tool descriptions and diff on change; per-server scoped tokens; human confirmation for sensitive tools; sandbox local servers; validate Origin headers and bind local servers to localhost.`,
life: `Installing apps from unknown developers on a phone with no permission prompts and auto-updates on: most are fine, but one bad app can read everything.`,
work: `An engineer installed a community MCP server via «npx» that ran with full access to their laptop, including «~/.aws/credentials». Security now requires internal registry servers only, run in containers with no home directory mount, and pinned versions with hash checks.`,
ex: `# run a local server in a container instead of directly
docker run --rm -i --network none -v "$PWD/project:/work:ro" mcp/filesystem /work
# local HTTP server: bind to localhost and check Origin
if request.headers.get("Origin") not in ALLOWED_ORIGINS: return 403`,
pit: [`Auto-updating third-party servers.`, `Local servers with full user permissions.`, `Unreviewed tool descriptions.`],
q: [`What is an MCP rug pull?`, `A server that changes its tool definitions/behaviour after you approved it, turning malicious later.`]
},
"Three message kinds": {
d: `MCP uses **JSON-RPC 2.0** messages:
- **Request**: has «id», «method», optional «params». Expects exactly one **Response** with the same id containing either «result» or «error» (code, message, data). Either side can send requests (client → server: «tools/call»; server → client: «sampling/createMessage»).
- **Notification**: «method» + «params», **no id**, no response. Used for events: «notifications/initialized», «notifications/tools/list_changed», «notifications/progress», «notifications/cancelled».

Lifecycle: client sends «initialize» (protocol version, capabilities, client info) → server responds with its capabilities → client sends «notifications/initialized» → normal operation → shutdown by closing transport. **Capability negotiation** decides which features (tools, resources subscribe, sampling, elicitation) both sides can use.`,
life: `Requests are letters with a reference number that expect a reply quoting that number. Notifications are announcements pinned on a board: no reply expected.`,
work: `A custom client hung because it waited for a response to «notifications/initialized» (it's a notification; no response ever comes). Another bug: the client reused request ids, so responses were matched to the wrong calls. Both were found by logging raw JSON-RPC traffic.`,
ex: `→ {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{"elicitation":{}},"clientInfo":{"name":"my-agent","version":"1.0"}}}
← {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18","capabilities":{"tools":{"listChanged":true}},"serverInfo":{"name":"settlements","version":"0.3"}}}
→ {"jsonrpc":"2.0","method":"notifications/initialized"}
→ {"jsonrpc":"2.0","id":2,"method":"tools/list"}`,
pit: [`Waiting for responses to notifications.`, `Reusing request ids within a session.`, `Skipping capability checks before using optional features.`],
q: [`How do you tell a notification from a request?`, `A notification has no «id» and never gets a response.`]
},
"Rich tool definitions and results": {
d: `A tool definition includes:
- «name», «title» (human-friendly), «description»,
- «inputSchema» (JSON Schema for arguments),
- optional «outputSchema»: the result's «structuredContent» must conform, so clients can validate and use it programmatically,
- **annotations** (hints, not guarantees): «readOnlyHint», «destructiveHint», «idempotentHint», «openWorldHint» (talks to external world). Hosts can use them for UI and confirmation policy, but must not trust annotations from untrusted servers for security.

A result («tools/call» response) contains «content»: a list of blocks (text, image, audio, **resource links**, embedded resources), optional «structuredContent», and «isError». Tool **execution errors** should be returned as results with «isError: true» (so the model can see and recover), while protocol errors (unknown tool, bad params) are JSON-RPC errors.`,
life: `A product listing with a label "fragile / safe to return / one-time use" (annotations), a spec sheet (schemas), and a delivery note that either contains the item or explains what went wrong.`,
work: `An agent kept retrying a failing «create_ticket» call because the server threw JSON-RPC errors, which the host hid from the model. Returning «isError: true» with "Project KEY not found; valid keys: PAY, RISK, OPS" let the model fix its argument on the next call.`,
ex: `{"name": "create_ticket", "title": "Create Jira ticket",
 "description": "Create an issue in a project. Use project keys PAY, RISK or OPS.",
 "inputSchema": {"type": "object", "properties": {"project": {"enum": ["PAY","RISK","OPS"]}, "summary": {"type": "string"}}, "required": ["project","summary"]},
 "outputSchema": {"type": "object", "properties": {"key": {"type": "string"}, "url": {"type": "string"}}},
 "annotations": {"destructiveHint": false, "idempotentHint": false, "openWorldHint": true}}
// result
{"content":[{"type":"text","text":"Created PAY-1832"}],"structuredContent":{"key":"PAY-1832","url":"https://jira/..."},"isError":false}`,
pit: [`Throwing protocol errors for normal tool failures.`, `Trusting annotations from untrusted servers.`, `structuredContent not matching outputSchema.`],
q: [`How should a tool report "record not found" so the model can recover?`, `As a normal result with «isError: true» and a helpful message, not as a JSON-RPC protocol error.`]
},
"Streamable HTTP in detail": {
d: `The server exposes **one endpoint** (e.g. «/mcp»):
- Client **POSTs** each JSON-RPC message with «Accept: application/json, text/event-stream». For requests, the server replies either with a single JSON response or opens an **SSE stream** that can carry progress notifications, server-to-client requests, and finally the response.
- Client can **GET** the endpoint to open an SSE stream for server-initiated messages outside a request.
- **Sessions**: the server may return «Mcp-Session-Id» on initialize; the client sends it on every subsequent request; DELETE ends the session. Session ids must be secure random values and are not authentication.
- **Resumability**: SSE events can have ids; after a disconnect, the client reconnects with «Last-Event-ID» to replay missed messages.
- «MCP-Protocol-Version» header on requests after initialization.
- Security: validate «Origin», bind local servers to 127.0.0.1, require auth.`,
life: `A help-desk counter: you hand over a form (POST); the clerk either answers immediately or says "wait here, I'll keep updating you" (SSE stream). Your token number (session id) keeps your case together, and if you step away you can ask "what did I miss since update #5?".`,
work: `Behind a corporate load balancer, long-running tool calls failed after 60 s idle. The fix: server progress notifications every 15 s on the SSE stream, sticky sessions on the LB (session id routing), and event ids so clients could resume after reconnects.`,
ex: `POST /mcp
Accept: application/json, text/event-stream
Mcp-Session-Id: 1f8c...
MCP-Protocol-Version: 2025-06-18
{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"backfill","arguments":{"day":"2026-11-18"}}}

HTTP/1.1 200 OK
Content-Type: text/event-stream
id: 41
data: {"jsonrpc":"2.0","method":"notifications/progress","params":{"progressToken":"t7","progress":30,"total":100}}`,
pit: [`Treating session id as authentication.`, `Load balancers breaking sessions or timing out SSE.`, `No Origin validation on local servers.`],
q: [`What header lets a client resume a dropped SSE stream?`, `«Last-Event-ID».`]
},
"How a client gets a token": {
d: `Flow for a remote MCP server:
1. Client calls the server without a token → «401» with «WWW-Authenticate» pointing to **Protected Resource Metadata** («/.well-known/oauth-protected-resource»).
2. Client reads it: which **authorization server(s)** to use and supported scopes.
3. Client fetches the authorization server's metadata (OAuth 2.0 AS metadata / OIDC discovery).
4. Client obtains a client identity: pre-registered, **Client ID Metadata Document**, or **Dynamic Client Registration**.
5. **Authorization Code flow with PKCE**: browser login + consent, code returned to the client's redirect URI, exchanged for tokens. The client includes the «resource» parameter (RFC 8707) naming the MCP server so the token's **audience** is that server.
6. Client sends «Authorization: Bearer <token>» on every request; refreshes as needed.
7. Server validates issuer, signature, expiry, audience and scopes on each request.`,
life: `Arriving at an office: the guard tells you which reception desk issues badges (metadata), you show ID there and get a visitor badge printed for this building only (audience), and the guard checks the badge each time you enter.`,
work: `A team's MCP server accepted any valid company JWT, including tokens minted for other internal APIs. A security review flagged it; adding an «aud» check for the MCP server's URL and requiring the «resource» parameter in clients fixed the cross-service token reuse risk.`,
ex: `GET /.well-known/oauth-protected-resource
{"resource": "https://mcp.internal/jira",
 "authorization_servers": ["https://login.company.in"],
 "scopes_supported": ["jira:read", "jira:write"]}
# authorization request (abridged)
https://login.company.in/authorize?response_type=code&client_id=...&code_challenge=...&code_challenge_method=S256
  &resource=https%3A%2F%2Fmcp.internal%2Fjira&scope=jira%3Aread`,
pit: [`Skipping PKCE.`, `Not binding tokens to the MCP server via resource/audience.`, `Long-lived tokens without refresh/rotation.`],
q: [`What does the «resource» parameter achieve?`, `It tells the authorization server which MCP server the token is for, so the token's audience is restricted to that server.`]
}
});
