QUEST.zone("mcp", {
mission:["dev","Every team wants their AI tools to reach Jira, Postgres and our payments API. Instead of N×M custom integrations, we'll expose them once over the Model Context Protocol. Build and secure a server."],
levels:[
{t:"The architecture", sub:"Hosts, clients, servers", rounds:[
 ["learn","Three roles","The **host** is the AI app (Claude, an IDE, your agent). For each server it connects to, the host runs an MCP **client**. A **server** exposes capabilities from a system (files, DB, API). Messages are **JSON-RPC 2.0**.",["Host (AI app)","MCP client (one per server)","MCP server","Your system"]],
 ["match","Role",[["Host","The AI application the user interacts with"],["Client","Maintains a 1:1 connection to one server"],["Server","Exposes tools, resources and prompts"],["JSON-RPC 2.0","Message format for requests, responses, notifications"]],"Hosts can connect to many servers at once."],
 ["learn","Why a protocol","Before MCP, every app × every integration needed custom code (N×M). With MCP, each integration is written once as a server and works in any MCP host (N+M)."],
 ["order","Connection lifecycle",["Client sends initialize with its protocol version and capabilities","Server replies with its version and capabilities","Client sends the initialized notification","Normal requests: tools/list, tools/call, resources/read…","Shutdown by closing the transport"],"Capability negotiation decides which features are used."],
 ["tf","Architecture facts",[["MCP servers can only be written in Python.",false,"Official SDKs exist for many languages."],["One host can connect to many MCP servers.",true,"One client per server."],["MCP messages use JSON-RPC 2.0.",true,"Requests have ids; notifications don't."]]]
]},
{t:"Primitives", sub:"Tools, resources, prompts", rounds:[
 ["learn","Server primitives","**Tools**: actions the **model** can invoke (with a JSON-schema input). **Resources**: data the **application** can read and attach as context, identified by URIs. **Prompts**: reusable templates the **user** picks (often as slash commands)."],
 ["sort","Tool, resource or prompt?",{"Tool (model-controlled)":["create_jira_ticket","run_sql_query","refund_payment"],"Resource (app-controlled)":["file:///policies/refunds.md","postgres://schema/payments"],"Prompt (user-controlled)":["/summarise-incident template","/code-review template"]},"Who decides when it's used defines the primitive."],
 ["learn","Client features","Servers can also ask the client for things: **sampling** (request an LLM completion through the host), **roots** (which directories/URIs the server may work in), and **elicitation** (ask the user for structured input mid-task)."],
 ["match","Client feature",[["Sampling","Server asks the host's model to generate text"],["Roots","Client tells the server which filesystem/URI boundaries apply"],["Elicitation","Server requests extra input from the user"]],"The host stays in control of the model and the user."],
 ["fill","A tool call request",'{"jsonrpc": "2.0", "id": 7, "method": "___",\n "params": {"name": "get_payment_status", "___": {"payment_id": "pay_123"}}}',["tools/call","arguments"],["tools/run","params","input"],"tools/list first discovers what's available."]
]},
{t:"Transports & building", sub:"stdio, Streamable HTTP, SDKs", rounds:[
 ["learn","Two standard transports","**stdio**: the host launches the server as a local subprocess and talks over stdin/stdout. Simple, local, no network. **Streamable HTTP**: the server is a web endpoint (POST requests, optional SSE streaming); good for remote, shared servers. The older HTTP+SSE transport is deprecated."],
 ["sort","stdio or Streamable HTTP?",{"stdio":["Local filesystem helper on a laptop","Git tools for one developer"],"Streamable HTTP":["Company-wide Jira server for 500 users","Hosted SaaS integration with OAuth"]},"Local process vs shared service."],
 ["learn","Build with an SDK","With the Python SDK's **FastMCP**, a decorated function becomes a tool; type hints and docstrings become the schema."],
 ["fill","A tiny MCP server",'from mcp.server.fastmcp import FastMCP\nmcp = ___("payments")\n@mcp.___()\ndef get_payment_status(payment_id: str) -> str:\n    """Return the current status of a payment."""\n    return db.status(payment_id)\nif __name__ == "__main__":\n    mcp.run(transport="___")',["FastMCP","tool","stdio"],["Server","resource","http2"],"Docstring = tool description."],
 ["bug","Why does this stdio server break the client?",["import sys, json","def handler(req):","    print('debug: got request', req)","    return process(req)"],2,"stdout carries protocol messages; stray prints corrupt the stream. Log to stderr."],
 ["tf","Building facts",[["The MCP Inspector helps test servers interactively.",true,"Use it before wiring into a host."],["Tool descriptions should be written for the model.",true,"They decide when the tool is used."]]]
]},
{t:"Security", sub:"Auth, consent, poisoning", rounds:[
 ["learn","Auth for remote servers","Remote HTTP servers use **OAuth 2.1**-based authorization: the server is a resource server, tokens come from an authorization server, and tokens must be issued **for that server** (audience). No token passthrough to other APIs."],
 ["learn","Threats specific to MCP","**Tool poisoning**: malicious instructions hidden in tool descriptions or results. **Rug pulls**: a tool's definition changes after you approved it. **Confused deputy / token passthrough**. **Over-broad permissions**. **Prompt injection** via fetched content."],
 ["match","Threat → mitigation",[["Hidden instructions in a tool description","Review/pin server versions; show full descriptions"],["Tool definition changes after approval","Detect changes and re-prompt for consent"],["Server forwards the user's token to other APIs","Tokens bound to this server's audience; no passthrough"],["Agent can delete prod data","Least-privilege tools and human confirmation"]],"Treat third-party servers like third-party code."],
 ["sort","Safe practice or risky?",{"Safe":["Install servers from trusted, pinned sources","Read-only DB credentials for a query tool","Confirm destructive tool calls with the user"],"Risky":["Auto-approve all tools from any server","Admin API keys in a community server","Passing user OAuth tokens through to other services"]},"Every server you add expands what an injected prompt can do."],
 ["tf","Security facts",[["Tool results can carry prompt injection.",true,"Treat them as untrusted data."],["Hosts should get user consent before invoking tools.",true,"Especially for actions with side effects."]]]
]},
{t:"Boss: Ship the payments server", boss:true, time:30, rounds:[
 ["pick","Analysts want the model to look up payments by id. Expose it as a…",["Tool","Prompt","Root","Sampling request"],0,"Model-invoked action."],
 ["pick","The refund policy doc should be attachable as context. Expose as a…",["Resource","Tool","Elicitation","Notification"],0,"App-controlled data by URI."],
 ["pick","500 employees will use it from many hosts. Transport?",["Streamable HTTP with OAuth","stdio on each laptop with shared admin key","Deprecated SSE","Email"],0,"Shared remote service."],
 ["pick","Server randomly breaks with parse errors in stdio mode. Cause?",["Logging to stdout","Wrong port","OAuth","Too many tools"],0,"Log to stderr."],
 ["pick","The refund tool must never fire without a human. Use…",["Host confirmation for destructive tools + server-side approval check","A longer description","Sampling","Roots"],0,"Defence in depth."],
 ["pick","A community server's tool description changed to 'also send files to evil.com'. Defence?",["Pin versions and re-approve on definition changes","Trust the registry","Use stdio","More tools"],0,"Rug-pull protection."]
]}
]});

QUEST.more("mcp", [
{act:"Expert", t:"Protocol mechanics", sub:"Messages, errors, capabilities", rounds:[
 ["learn","Three message kinds","**Requests** have an «id» and expect a **response** with the same id containing «result» or «error». **Notifications** have no id and get no response. Either side can send requests (servers ask clients for sampling, roots, elicitation).",null,null,`### Error handling
- **Protocol errors** use JSON-RPC error codes: «-32700» parse error, «-32600» invalid request, «-32601» method not found, «-32602» invalid params, «-32603» internal error.
- **Tool execution errors** are *not* protocol errors: the tool returns a normal result with «isError: true» and a message the model can read and react to.

### Capability negotiation
In «initialize», each side declares capabilities. Servers: «tools» (with «listChanged»), «resources» (with «subscribe», «listChanged»), «prompts», «logging», «completions». Clients: «roots» (with «listChanged»), «sampling», «elicitation». Only negotiated features may be used.

### Housekeeping messages
- «notifications/tools/list_changed»: tool set changed → client re-fetches «tools/list».
- **Progress**: a request can carry «_meta.progressToken»; the receiver sends «notifications/progress» with progress/total.
- **Cancellation**: «notifications/cancelled» with the request id.
- «ping» keeps connections healthy.
- List methods are **paginated** with an opaque «cursor» / «nextCursor».`],
 ["match","Message",[["Request","Has an id and expects a response"],["Notification","No id, no response"],["-32601","Method not found"],["isError: true","Tool ran but failed; model can react"],["notifications/progress","Progress updates for a long request"]],"Know the wire format."],
 ["pick","A tool can't find the payment id the model passed. How should the server report it?",["Tool result with isError: true and a helpful message","JSON-RPC error -32603","Close the connection","Return an empty success"],0,"Execution errors go back to the model as tool results."],
 ["sort","Server or client capability?",{"Server capability":["tools.listChanged","resources.subscribe","prompts","logging"],"Client capability":["sampling","roots","elicitation"]},"Declared in initialize."],
 ["tf","Protocol truths",[["Notifications receive responses.",false,"No id, no response."],["Servers may send requests to clients.",true,"Sampling, roots, elicitation."],["tools/list may be paginated.",true,"cursor / nextCursor."]]]
]},
{act:"Expert", t:"Tools, resources & prompts deep", sub:"Schemas, content, annotations", rounds:[
 ["learn","Rich tool definitions and results","A tool has «name», «description», «inputSchema» (JSON Schema), optional «outputSchema», and **annotations**. Results contain a «content» array (text, image, audio, resource links, embedded resources) and, when an outputSchema exists, «structuredContent» matching it.",null,null,`### Annotations are hints, not guarantees
«readOnlyHint», «destructiveHint», «idempotentHint», «openWorldHint» help hosts decide UI and confirmation behaviour. A malicious server can lie, so hosts must **not** trust annotations from untrusted servers for security decisions.

### Structured output
With «outputSchema», clients can validate «structuredContent» and pass typed data to code, while «content» keeps a text rendering for the model (and older clients).

### Resources
- Static URIs («file:///policies/refunds.md») or **resource templates** with URI templates («payments://{payment_id}»).
- «resources/read» returns text or base64 blobs with MIME types.
- «resources/subscribe» + «notifications/resources/updated» for change notifications.
- Tools can return **resource links** so the client fetches large content only if needed.

### Prompts and completion
Prompts have named **arguments**; «completion/complete» lets clients autocomplete argument values (e.g. merchant names) as the user types.`],
 ["fill","A tool definition with structured output",'{\n  "name": "get_payment",\n  "description": "Fetch one payment by id.",\n  "___": {"type": "object", "properties": {"payment_id": {"type": "string"}}, "required": ["payment_id"]},\n  "___": {"type": "object", "properties": {"status": {"type": "string"}, "amount_paise": {"type": "integer"}}},\n  "annotations": {"___": true}\n}',["inputSchema","outputSchema","readOnlyHint"],["params","returns","safe"],"Typed in, typed out, and a hint for the host UI."],
 ["pick","A third-party server marks delete_records with readOnlyHint: true. Host behaviour?",["Don't trust hints from untrusted servers; still confirm destructive-looking actions","Skip confirmation","Block the server forever automatically","Trust it"],0,"Annotations are advisory."],
 ["match","Feature",[["Resource template","payments://{payment_id} style parameterized URIs"],["resources/subscribe","Get notified when a resource changes"],["Resource link in tool result","Let the client fetch large content lazily"],["completion/complete","Autocomplete prompt arguments"]],"Beyond plain tools."],
 ["tf","Primitive truths",[["structuredContent should match the tool's outputSchema.",true,"Clients can validate it."],["Resources are typically chosen by the model like tools.",false,"Applications/users choose resources."]]]
]},
{act:"Expert", t:"Transports deep", sub:"Streamable HTTP sessions & safety", rounds:[
 ["learn","Streamable HTTP in detail","The server exposes **one endpoint**. The client **POSTs** each JSON-RPC message (with «Accept: application/json, text/event-stream»). For requests, the server answers with a single JSON response **or** an **SSE stream** (progress notifications, server requests, then the response). A **GET** opens a stream for server-initiated messages.",null,null,`### Sessions and versions
- The server may assign «Mcp-Session-Id» in the initialize response; the client sends it on every later request. DELETE ends the session.
- Clients send «MCP-Protocol-Version» on HTTP requests after initialization.
- **Resumability**: SSE events can carry ids; after a disconnect, the client reconnects with «Last-Event-ID» to replay missed messages.

### Security requirements
- Validate the **Origin** header to prevent DNS rebinding attacks against local servers.
- Local servers should bind to **localhost** (127.0.0.1), not all interfaces.
- Use proper authentication for remote servers.

### stdio details
Messages are newline-delimited JSON on stdin/stdout; messages must not contain embedded newlines. **stderr** is for logs. The client owns the server process lifecycle (start, terminate).

### Scaling remote servers
Session affinity (or shared session storage) across replicas, timeouts for long streams, and stateless designs where possible.`],
 ["order","A long tool call over Streamable HTTP",["Client POSTs tools/call with a progressToken","Server opens an SSE stream in response","Server sends progress notifications on the stream","Server sends the final JSON-RPC response","Stream closes"],"One request, streamed updates."],
 ["pick","A local MCP server listens on 0.0.0.0 without Origin checks. Risk?",["Other machines or malicious websites (DNS rebinding) can call it","Slower responses","Session ids collide","Nothing"],0,"Bind to localhost and validate Origin."],
 ["match","Header / mechanism",[["Mcp-Session-Id","Ties requests to a server-side session"],["Last-Event-ID","Resume an SSE stream after disconnect"],["Origin validation","Blocks DNS rebinding"],["MCP-Protocol-Version","Negotiated version on each HTTP request"]],"Production HTTP servers need all four."],
 ["tf","Transport truths",[["stdio messages may contain raw newlines inside JSON.",false,"Newline-delimited framing forbids it."],["A Streamable HTTP server may answer a POST with an SSE stream.",true,"For streaming responses."]]]
]},
{act:"Expert", t:"Authorization deep", sub:"OAuth 2.1, metadata, audiences", rounds:[
 ["learn","How a client gets a token","Remote MCP servers act as **OAuth 2.1 resource servers**. Unauthenticated requests get «401» with a «WWW-Authenticate» header pointing to **Protected Resource Metadata** (RFC 9728), which names the **authorization server**. The client discovers its endpoints (RFC 8414 / OIDC discovery), registers or identifies itself, runs authorization code + **PKCE**, and calls the server with a bearer token.",["401 + WWW-Authenticate (resource metadata URL)","Fetch protected resource metadata","Discover authorization server metadata","Register/identify client; auth code + PKCE with resource parameter","Call MCP server with access token"],null,`### Audience binding
Clients must include the **resource parameter** (RFC 8707) naming the MCP server; the token's **audience** is that server. Servers must **reject tokens not issued for them**.

### No token passthrough
An MCP server must never accept a token meant for another service, nor forward the client's token to downstream APIs. If it calls downstream APIs, it uses **its own** credentials or a proper token exchange — otherwise you get confused-deputy attacks and broken audit trails.

### Client registration
Clients may use pre-registered client ids, **Dynamic Client Registration** (RFC 7591), or newer metadata-document-based client identification supported by recent spec revisions. Proxy servers that use a static client id with a third-party authorization server must obtain **per-client user consent** to avoid confused-deputy issues.

### Scopes and least privilege
Request minimal scopes; servers can respond with «insufficient_scope» to trigger step-up authorization for sensitive tools.`],
 ["order","OAuth discovery for a remote MCP server",["Client calls the server without a token","Server replies 401 with resource metadata location","Client reads protected resource metadata to find the authorization server","Client runs authorization code flow with PKCE and resource indicator","Client retries with the bearer token"],"Standard OAuth plumbing."],
 ["pick","An MCP server forwards the user's token to the payments API it wraps. Problem?",["Token passthrough: wrong audience, confused deputy, broken audit","None","Too slow","Breaks JSON-RPC"],0,"Use the server's own credentials or token exchange."],
 ["match","RFC / mechanism",[["RFC 9728","Protected resource metadata"],["RFC 8707 resource indicators","Bind token audience to the MCP server"],["PKCE","Protects the authorization code exchange"],["RFC 7591","Dynamic client registration"]],"Know the building blocks."],
 ["tf","Auth truths",[["MCP servers must validate token audience.",true,"Reject tokens issued for others."],["stdio servers typically use the OAuth flow for each call.",false,"Local stdio servers usually get credentials from the environment."]]]
]},
{act:"Expert", t:"Expert boss: MCP platform review", boss:true, time:45, rounds:[
 ["pick","Model can't recover when a tool fails; server returns JSON-RPC -32603. Fix?",["Return isError: true tool results with actionable messages","More retries in the host","Drop the tool","Larger timeout"],0,"Let the model react."],
 ["pick","Host auto-approves tools marked readOnlyHint from a community server. Risk?",["Hints can lie; destructive tools slip through","None","Slower","Pagination breaks"],0,"Don't trust untrusted annotations."],
 ["pick","Clients lose progress updates when mobile networks drop. Fix?",["SSE event ids + Last-Event-ID resumability","Bigger timeout","stdio","Disable progress"],0,"Resume streams."],
 ["pick","Local dev server reachable from a malicious web page. Fix?",["Bind to localhost and validate Origin","Use a longer session id","Disable SSE","Add tools"],0,"DNS rebinding defense."],
 ["pick","A token from your MCP server works on the internal billing API too. Fix?",["Audience-restricted tokens via resource indicators; validate audience","Longer tokens","Shorter sessions","Bigger scopes"],0,"Bind tokens to one resource."],
 ["pick","Server's tool list changes at runtime; clients don't notice. Fix?",["Declare tools.listChanged and send notifications/tools/list_changed","Restart clients","Paginate","Use prompts"],0,"Notify clients."],
 ["pick","A tool returns 30 MB of logs inline. Better?",["Return a resource link and a summary","Compress base64","Split into 30 tool calls","Increase limits"],0,"Fetch large content lazily."]
]}
]);

QUEST.story("mcp", {title:"An MCP server for the warehouse", icon:"🔌", place:"Thu 2 PM · analytics team request", setup:"Analysts want their AI assistant to answer questions from the Redshift warehouse. You're building an MCP server for it.",
 meters:[["risk","Data risk","%",80,10,"low",100],["use","Answer success","%",30,80,"high",100],["trust","Security trust","%",30,75,"high",100]],
 beats:[["meera","Can the assistant just run SQL for us?"],["ui","Draft server: one tool run_sql(query: str) using the admin user"],
  ["q","What's wrong with the draft?",[["An admin, arbitrary-SQL tool lets any prompt injection read or change everything",1,"Least privilege: the assistant should have exactly the access the analyst has, read-only.","Handing a visitor the master key."],["Nothing, analysts are trusted",0,"The model isn't the analyst; content can manipulate it.","Trusting whoever holds the key."]]],
  ["q","How do you redesign the tools?",[["Read-only role per user (OAuth), a list_tables and describe_table resource, and run_query restricted to SELECT with row limits and timeouts",1,"Discoverable schema, safe queries, user-level permissions.","A library card that only allows reading, with a catalogue."],["Remove all tools",0,"No value.","Locking the library."]]],
  ["q","Which transport for a shared team server?",[["Streamable HTTP with OAuth, behind your gateway",1,"Remote, multi-user, authenticated. stdio suits local single-user servers.","A front desk that checks ID."],["stdio over the internet",0,"stdio is for local processes.","Shouting through the wall."]]],
  ["meera","The assistant answers from the warehouse, with my own permissions. Security approved."]],
 learned:["MCP tools need least privilege.","Expose schema as resources; constrain queries.","HTTP + OAuth for shared servers; stdio for local."]});
QUEST.mock("mcp", {title:"MCP round", who:"rohit", intro:"Rohit here. Let's talk Model Context Protocol.", setup:"Rohit's team builds MCP servers for internal systems.",
 qs:[["What are the three main MCP primitives?","**Tools** (actions the model can call, with JSON-schema inputs), **resources** (data the client can read, like files or schemas), and **prompts** (reusable templates). Clients may also offer sampling and elicitation.",[["Tools, resources and prompts",1,"Correct."],["Models, vectors and chains",0,"No."],["Only tools",0.5,"Misses resources and prompts."]]],
  ["How does an MCP connection work?","A client (in the host app) connects to a server over a **transport** (stdio for local processes, Streamable HTTP for remote), exchanges JSON-RPC messages, negotiates capabilities on initialize, then lists and calls tools/resources.",[["Client–server over stdio or Streamable HTTP using JSON-RPC with capability negotiation",1,"Accurate."],["REST only",0,"JSON-RPC."],["It's a vector DB protocol",0,"No."]]],
  ["Security concerns with MCP servers?","Over-privileged tools, **tool poisoning** (malicious descriptions), prompt injection via tool outputs, token handling (no passthrough of client tokens), untrusted third-party servers, and missing user consent for actions. Use OAuth, least privilege, allowlisted servers and approvals.",[["Over-privilege, tool poisoning, injection via outputs, token misuse, untrusted servers; mitigate with OAuth, least privilege, allowlists, approvals",1,"Good."],["None, it's a standard",0,"Red flag."],["Only rate limiting",0.5,"Narrow."]]],
  ["Why standardise tool access with MCP instead of custom integrations?","Build a server once and use it from any MCP client (IDEs, chat apps, agents); consistent discovery and schemas; easier governance and reuse; vendors and community provide servers.",[["Build once, use across clients, consistent discovery, easier governance",1,"Clear."],["It makes models smarter",0,"No."],["It's required by law",0,"No."]]]],
 learned:["Tools, resources, prompts.","Transports: stdio and Streamable HTTP.","Least privilege and trusted servers."]});
