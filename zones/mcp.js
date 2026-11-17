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
