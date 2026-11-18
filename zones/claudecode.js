QUEST.zone("claudecode", {
mission:["dev","The platform team is adopting Claude Code for every repo. Learn memory files, skills, subagents, hooks, MCP and permissions, then set up the payments monorepo so it's fast and safe."],
levels:[
{t:"Memory & context", sub:"CLAUDE.md, commands", rounds:[
 ["learn","CLAUDE.md is project memory","Claude Code loads **CLAUDE.md** files at startup: user-level («~/.claude/CLAUDE.md»), project («./CLAUDE.md», committed for the team), and nested ones in subdirectories when it works there. Put build/test commands, conventions and gotchas there. Keep it concise.",["~/.claude/CLAUDE.md (you)","./CLAUDE.md (team, committed)","subdir/CLAUDE.md (loaded when relevant)"]],
 ["sort","Belongs in the project CLAUDE.md?",{"Yes":["How to run tests: make test","We use Poetry, never pip install","Money is stored in paise as integers"],"No":["Your personal API keys","The entire 300-page architecture doc","Today's to-do list"]},"Short, durable, team-relevant instructions."],
 ["learn","Context management","Use «/clear» between unrelated tasks, «/compact» to summarise a long session, «@path» to pull a file into context, and **plan mode** to explore and propose before editing. «/init» drafts a CLAUDE.md from the repo."],
 ["match","Command",[["/init","Generate a starter CLAUDE.md"],["/clear","Start fresh context"],["/compact","Summarise the conversation to free context"],["/agents","Manage subagents"],["/mcp","Manage MCP server connections"]],"Slash commands are your control panel."],
 ["tf","Memory facts",[["CLAUDE.md content is loaded into context at session start.",true,"So keep it tight."],["You can import other files into CLAUDE.md with @path.",true,"Modular memory."],["Claude Code remembers everything from last week's sessions automatically.",false,"Durable knowledge goes in CLAUDE.md."]]]
]},
{t:"Skills", sub:"Packaged know-how", rounds:[
 ["learn","Skills are folders","A skill is a folder with a **SKILL.md** (YAML frontmatter with «name» and «description», then instructions) plus optional scripts, templates and references. Claude sees only names and descriptions until a task matches, then loads the skill: **progressive disclosure**.",["Startup: read name + description","Task matches description","Load SKILL.md body","Open extra files/scripts only if needed"]],
 ["fill","A SKILL.md header",'---\n___: iceberg-maintenance\n___: Run compaction, snapshot expiry and orphan cleanup on Iceberg tables. Use when asked to maintain or speed up lake tables.\n---\n# Steps\n1. Check table health with scripts/health.py ...',["name","description"],["title","trigger","version"],"The description decides when the skill is used: say what and when."],
 ["sort","Where does it live?",{"Project skill (.claude/skills/)":["Our deploy runbook for this repo","Team's dbt conventions"],"Personal skill (~/.claude/skills/)":["My own commit-message style","My personal notes workflow"]},"Plugins can also ship skills."],
 ["pick","Your skill never triggers. Most likely fix?",["Rewrite the description to say what it does and when to use it","Make SKILL.md longer","Rename the folder to uppercase","Add more scripts"],0,"Matching is driven by the description."],
 ["tf","Skill facts",[["All skill bodies are loaded into context at startup.",false,"Only metadata; bodies load on demand."],["Skills can include executable scripts.",true,"Claude runs them instead of rewriting logic."],["Skills differ from slash commands: skills are model-invoked.",true,"Commands are typed by you."]]]
]},
{t:"Subagents", sub:"Focused helpers", rounds:[
 ["learn","Subagents have their own context","A subagent is a Markdown file in «.claude/agents/» (or «~/.claude/agents/») with frontmatter: «name», «description», optional «tools» and «model», then a system prompt. Claude delegates matching tasks; the subagent works in a **separate context window** and returns a summary."],
 ["fill","A reviewer subagent",'---\nname: sql-reviewer\ndescription: Reviews SQL and dbt models for correctness and performance. Use after SQL changes.\n___: Read, Grep, Glob\n___: sonnet\n---\nYou are a senior analytics engineer. Check joins, grain, incremental logic...',["tools","model"],["permissions","engine"],"Limit tools to what the role needs."],
 ["sort","Good use of a subagent?",{"Good":["Search a huge codebase and report findings","Independent code review of a diff","Run and summarise a noisy test suite"],"Not needed":["Rename one variable","Answer a quick question about a file you just opened"]},"Delegate work that would flood the main context."],
 ["match","Why subagents help",[["Separate context","Main conversation stays clean"],["Tool restrictions","A reviewer can't edit files"],["Custom system prompt","Specialist behaviour"],["Parallel runs","Several investigations at once"]],"Specialists with boundaries."],
 ["pick","A security-review subagent should never modify code. How?",["Give it only read tools (Read, Grep, Glob)","Ask nicely in CLAUDE.md","Use a bigger model","Run it twice"],0,"Enforce with the tools list."]
]},
{t:"Hooks & permissions", sub:"Deterministic control", rounds:[
 ["learn","Hooks run your code at lifecycle events","Configured in settings JSON. Events include **PreToolUse**, **PostToolUse**, **UserPromptSubmit**, **Stop**, **SubagentStop**, **SessionStart**, **Notification**, **PreCompact**. A PreToolUse hook exiting with code **2** blocks the tool call and shows stderr to Claude."],
 ["match","Hook → use",[["PostToolUse on Edit/Write","Run the formatter after every edit"],["PreToolUse on Bash","Block rm -rf or prod credentials"],["SessionStart","Load recent context (e.g. open tickets)"],["Stop","Check tests passed before finishing"],["Notification","Ping Slack when Claude needs input"]],"Hooks are guaranteed; instructions are suggestions."],
 ["pick","Your PreToolUse hook should stop a dangerous command. Which exit code blocks it?",["0","1","2","127"],2,"Exit 2 blocks and feeds stderr back to Claude; other non-zero codes are non-blocking errors."],
 ["learn","Permissions","«settings.json» «permissions» has **allow**, **ask** and **deny** rules like «Bash(npm run test:*)» or «Read(./.env)». Project settings («.claude/settings.json») are shared; «settings.local.json» is personal. Deny wins."],
 ["fill","Lock down secrets, allow tests",'{\n  "permissions": {\n    "___": ["Bash(make test:*)", "Bash(git status)"],\n    "___": ["Read(./.env)", "Read(./secrets/**)", "Bash(curl:*)"]\n  }\n}',["allow","deny"],["permit","block","trust"],"Deny rules take precedence."],
 ["tf","Control facts",[["Hooks run with your user's permissions on your machine.",true,"Review hook scripts like any code."],["CLAUDE.md instructions are enforced like hooks.",false,"Hooks are deterministic; CLAUDE.md guides the model."]]]
]},
{t:"MCP, headless & plugins", sub:"Connect and automate", rounds:[
 ["learn","MCP in Claude Code","Add servers with «claude mcp add» (stdio or HTTP). Scopes: **local** (you, this project), **project** («.mcp.json», committed and shared), **user** (all your projects). Manage and authenticate with «/mcp»."],
 ["match","MCP scope",[["local","Only you, only this project (default)"],["project","Team shares via .mcp.json in the repo"],["user","You, across all projects"]],"Project scope prompts teammates to approve before use."],
 ["learn","Headless and CI","«claude -p \"prompt\"» runs non-interactively (print mode) with «--output-format json» or «stream-json», «--allowedTools» to pre-approve tools. Use it in CI, scripts and GitHub Actions. The **Agent SDK** builds custom agents on the same harness."],
 ["fill","Run in CI",'claude ___ "Review this diff for SQL injection and list findings" \\\n  --output-format ___ --allowedTools "Read,Grep"',["-p","json"],["--chat","yaml","-i"],"Print mode exits when done."],
 ["learn","Plugins","A **plugin** bundles commands, subagents, skills, hooks and MCP servers so a team installs one thing from a **marketplace** and gets a consistent setup."],
 ["sort","Which extension point?",{"Skill":["Detailed procedure Claude applies when relevant"],"Subagent":["Specialist with its own context and limited tools"],"Hook":["Must always run the linter after edits"],"MCP server":["Query Jira and Postgres"]},"Each solves a different problem."]
]},
{t:"Boss: Set up the monorepo", boss:true, time:30, rounds:[
 ["pick","Claude keeps using pip instead of Poetry. Fix?",["Add the rule to the project CLAUDE.md","Write a subagent","Raise context","Use -p"],0,"Durable project memory."],
 ["pick","Code must always be formatted after edits, no exceptions. Use…",["PostToolUse hook running the formatter","A note in CLAUDE.md","A skill","A prompt template"],0,"Deterministic."],
 ["pick","Never let Claude read .env files. Use…",["permissions deny Read(./.env)","Ask in chat","A Stop hook","A plugin README"],0,"Deny rules."],
 ["pick","The team's 40-step release runbook should be followed when relevant. Package it as…",["A skill with SKILL.md and scripts","A huge CLAUDE.md","A hook","An MCP prompt only"],0,"Progressive disclosure."],
 ["pick","Everyone needs the same Jira MCP server. Configure at…",["project scope (.mcp.json)","local scope","user scope on one laptop","An env var"],0,"Shared in the repo."],
 ["pick","PR reviews should run automatically in GitHub Actions. Use…",["claude -p with --output-format json and limited tools","Interactive mode","/compact","A subagent only"],0,"Headless mode."]
]}
]});

QUEST.more("claudecode", [
{act:"Expert", t:"The agent loop & context", sub:"Tools, thinking, checkpoints", rounds:[
 ["learn","How Claude Code works a task","Claude Code runs an agent loop: read context (CLAUDE.md, your message), plan, call tools (Read, Grep, Glob, Edit, Write, Bash, WebFetch/WebSearch, subagents, MCP tools), observe results, repeat. Everything it reads costs **context**.",null,null,`### Watching context
- «/context» shows what fills the window (system, tools, MCP tool definitions, memory files, messages).
- MCP servers with many tools can eat thousands of tokens before you type — disable unused servers.
- Auto-compaction summarizes when the window fills; «/compact focus on the migration plan» lets you steer what's kept.
- «/clear» between unrelated tasks beats one endless session.

### Thinking and planning
- **Plan mode** (Shift+Tab to cycle modes) lets Claude explore and propose a plan without editing files.
- Asking it to "think" more allocates more reasoning for hard problems; use it for architecture decisions and tricky bugs, not trivial edits.

### Safety nets
- **Checkpoints**: file edits are checkpointed; rewind code and/or conversation (Esc Esc or «/rewind») to undo a wrong direction. Checkpoints don't undo external side effects (database writes, deployments, pushes).
- Git remains the real safety net: commit before big changes.

### Effective prompting
Give verifiable goals ("make tests in payments/ pass; don't change the public API"), point to files with «@path», ask for tests first (TDD), and let it iterate against tests or screenshots.`],
 ["sort","Good habit or anti-pattern?",{"Good habit":["/clear between unrelated tasks","Plan mode before a large refactor","Giving a test command to verify against","Disabling unused MCP servers"],"Anti-pattern":["One 8-hour session for everything","Relying on rewind to undo a database migration","Vague goals like 'make it better'"]},"Context and verifiability drive quality."],
 ["pick","Rewind restored the code, but the staging DB still has the bad migration. Why?",["Checkpoints only track file edits, not external side effects","Rewind is broken","Git conflict","Plan mode was on"],0,"Undo external changes yourself."],
 ["match","Command / key",[["/context","See what's consuming the context window"],["/compact <focus>","Summarize while keeping chosen details"],["Shift+Tab","Cycle permission modes incl. plan mode"],["Esc Esc / /rewind","Restore an earlier checkpoint"],["@path","Pull a file into context"]],"Daily drivers."],
 ["tf","Loop truths",[["MCP tool definitions consume context even if unused.",true,"Disable servers you don't need."],["Checkpoints replace git.",false,"Commit regularly."]]]
]},
{act:"Expert", t:"Skills in depth", sub:"Progressive disclosure engineering", rounds:[
 ["learn","Three loading levels","**Level 1**: the skill's «name» + «description» are always in context (small). **Level 2**: the SKILL.md body loads when the task matches. **Level 3+**: referenced files (reference docs, templates) are read only when needed, and **scripts are executed** — their code doesn't need to enter context, only their output.",null,null,`### Frontmatter rules
- «name»: lowercase letters, numbers and hyphens, up to 64 characters.
- «description»: up to 1,024 characters; say **what it does and when to use it**, with trigger words users actually say.
- In Claude Code, «allowed-tools» can restrict which tools the skill may use without asking.

### Writing good skills
- Keep SKILL.md focused (a few hundred lines at most); move details to reference files linked **one level deep** («see reference/iceberg-procedures.md»).
- Prefer **scripts** for deterministic, fragile or repetitive work (validation, parsing, file generation) — reliable and token-cheap.
- Give a workflow checklist and **feedback loops** ("run scripts/validate.py; fix errors; repeat").
- Provide examples of inputs/outputs; avoid explaining things the model already knows.
- Test with real tasks and watch which files it reads.

### Where skills come from
Personal («~/.claude/skills/»), project («.claude/skills/», committed), and **plugins**. Skills are model-invoked; slash commands are user-invoked; subagents run in separate contexts; MCP connects external systems — they combine well.`],
 ["fill","A well-formed skill header",'---\nname: ___\ndescription: ___\n---\n# Iceberg maintenance\n1. Run scripts/health.py <table> and read the report\n2. Follow reference/procedures.md for compaction options',["iceberg-maintenance","Compacts small files, expires snapshots and removes orphans on Iceberg tables. Use when asked to maintain, clean up or speed up lake tables."],["Iceberg Maintenance!","Helps with data"],"Lowercase-hyphen name; description says what and when."],
 ["pick","A skill must validate 200 YAML configs exactly the same way every time. Best design?",["A script in the skill that Claude runs, with SKILL.md describing when/how","Long instructions describing every rule","A subagent","A hook"],0,"Deterministic work → scripts."],
 ["order","How a skill gets used",["Startup: only name + description are loaded","User asks for a matching task","Claude reads the SKILL.md body","It opens a referenced file only if needed","It runs bundled scripts and uses their output"],"Progressive disclosure keeps context lean."],
 ["tf","Skill truths",[["Script source code must be read into context to run it.",false,"Only its output enters context."],["Deeply nested reference chains are recommended.",false,"Keep references one level deep."]]]
]},
{act:"Expert", t:"Subagents & orchestration", sub:"Delegation patterns", rounds:[
 ["learn","Delegation done right","Claude Code can spawn **subagents** (built-in ones like a general-purpose agent and a read-only explorer, plus your own in «.claude/agents/»). Each runs in its own context with its own system prompt and tool set, then returns a **summary**. Several can run in **parallel**.",null,null,`### Patterns
- **Explore → plan → implement**: an explorer subagent maps the codebase; the main agent plans; implementation happens in the main context.
- **Fan-out research**: parallel subagents investigate separate modules/services and report findings.
- **Independent review**: a reviewer subagent with read-only tools critiques a diff with fresh eyes (no bias from having written it).
- **Test runner**: runs noisy test suites and returns only failures + likely causes.

### Writing subagent definitions
- A sharp «description» (when to delegate — include "use proactively after…" if you want automatic delegation).
- Minimal «tools» list; read-only for reviewers/explorers.
- «model»: cheaper/faster models for search tasks, stronger ones for reasoning.
- A system prompt with output format ("return: findings, files, confidence").

### Costs
Each subagent consumes its own tokens. Parallel fan-out is faster but multiplies spend — use it for breadth, not for small edits.`],
 ["match","Pattern",[["Read-only explorer","Map an unfamiliar codebase without edits"],["Reviewer subagent","Fresh-eyes critique of a diff"],["Parallel investigators","Check 6 services for a deprecated API at once"],["Test runner subagent","Return only failures from a noisy suite"]],"Delegate to protect the main context."],
 ["pick","The main session fills with 40k tokens of grep output while exploring. Better?",["Delegate exploration to a subagent that returns a summary","Increase context","Use /clear mid-task","Disable Grep"],0,"Context isolation."],
 ["sort","Delegate or do it in the main thread?",{"Delegate":["Survey 30 files for a pattern","Independent security review","Long-running test triage"],"Main thread":["Small edit you're already looking at","Decision that needs the whole conversation context"]},"Delegation trades tokens for focus."],
 ["tf","Subagent truths",[["Subagents share the main agent's context window.",false,"Each has its own."],["A subagent's tools list can be narrower than the main agent's.",true,"Least privilege."]]]
]},
{act:"Expert", t:"Hooks & policy in depth", sub:"Inputs, outputs, precedence", rounds:[
 ["learn","Hook input and output","Hooks receive JSON on **stdin**: session id, transcript path, current directory, event name, and for tool events «tool_name» and «tool_input» (plus «tool_response» for PostToolUse). **Matchers** select tools by name or regex («Edit|Write», «Bash», «mcp__github__.*»).",null,null,`### Controlling behaviour
- **Exit code 0**: success; stdout is shown in transcript mode (for UserPromptSubmit and SessionStart, stdout is **added to Claude's context**).
- **Exit code 2**: blocking error — stderr goes to Claude (PreToolUse: the tool call is blocked; Stop: Claude is told to continue).
- Other codes: non-blocking error shown to the user.
- **JSON output** for finer control, e.g. PreToolUse can return a permission decision (allow / deny / ask) with a reason; Stop hooks can block stopping with a reason.

### Examples
- PreToolUse on «Bash»: deny commands matching «rm -rf», «terraform apply», or reading «.env».
- PostToolUse on «Edit|Write»: run the formatter/linter; feed errors back with exit 2.
- Stop: run the test suite; if it fails, exit 2 with the failures so Claude keeps working.
- SessionStart: print the current sprint's open tickets to give context.

### Settings precedence
Enterprise **managed policy** settings override everything; then command-line flags; then **local project** («.claude/settings.local.json»); then **shared project** («.claude/settings.json»); then **user** («~/.claude/settings.json»). Deny rules win over allow rules.`],
 ["order","Settings precedence, highest first",["Enterprise managed policy","Command-line arguments","Local project settings (.claude/settings.local.json)","Shared project settings (.claude/settings.json)","User settings (~/.claude/settings.json)"],"Admins can enforce policy that users can't override."],
 ["bug","Which hook script fails to block the dangerous command?",["cmd=$(jq -r '.tool_input.command')","if echo \"$cmd\" | grep -q 'terraform apply'; then","  echo 'Blocked: use the deploy pipeline' >&2; exit 1","fi"],2,"Exit code 1 is a non-blocking error. Use exit 2 to block a PreToolUse call."],
 ["match","Hook event → typical job",[["UserPromptSubmit","Add context or block prompts with secrets"],["PreToolUse","Allow/deny/ask before a tool runs"],["PostToolUse","Lint/format/test after edits"],["Stop","Refuse to finish until tests pass"],["PreCompact","Save notes before compaction"]],"Deterministic guardrails."],
 ["tf","Hook truths",[["SessionStart hook stdout can be added to Claude's context.",true,"Useful for dynamic context."],["A local project setting can override an enterprise managed policy.",false,"Managed policy wins."]]]
]},
{act:"Expert", t:"Automation & the Agent SDK", sub:"Headless, CI, SDK, sandboxing", rounds:[
 ["learn","Claude Code beyond the terminal","**Headless mode** («claude -p») runs a single task non-interactively with JSON or streaming JSON output, pre-approved tools and a max turn count. The **Claude Agent SDK** (Python/TypeScript) exposes the same agent harness — tools, context management, permissions, hooks, subagents, MCP — for building your own agents.",null,null,`### CI patterns
- PR review: «claude -p "review this diff for security issues" --output-format json --allowedTools "Read,Grep,Glob"».
- Issue triage, changelog drafting, migration batches across many repos (fan out one headless run per repo).
- GitHub Actions integration responds to @-mentions in issues/PRs.
- Always: least-privilege tools, no production credentials, explicit turn/time limits, and human review of changes.

### Agent SDK basics
- A «query()» call runs the agent loop and streams messages; a client object supports multi-turn sessions.
- Configure: system prompt, allowed/disallowed tools, permission mode, MCP servers, custom in-process tools, hooks, subagents, working directory.
- Use it for non-coding agents too (support, research, ops) — the harness handles context compaction and tool execution.

### Sandboxing
Claude Code can run Bash inside a **sandbox** with filesystem and network isolation (allowed paths and domains), cutting permission prompts while containing damage from mistakes or prompt injection in repo files.

### Repo-borne injection
Files in a repo (README, CLAUDE.md in a dependency, issue text) can contain instructions. Treat untrusted repos with restricted permissions and sandboxing.`],
 ["fill","A locked-down CI review run",'claude -p "Review the diff in PR #42 for SQL injection" \\\n  --output-format ___ \\\n  --allowedTools "___" \\\n  --max-turns 10',["json","Read,Grep,Glob"],["text","Bash,Write,Edit","yaml"],"Read-only tools for a review bot."],
 ["sort","Headless/SDK fit or interactive fit?",{"Headless / SDK":["Nightly dependency-upgrade PRs across 40 repos","PR review bot in CI","Custom support agent with company tools"],"Interactive":["Exploring a new codebase with a teammate","Designing an architecture change with back-and-forth"]},"Automation vs collaboration."],
 ["pick","Running Claude Code on an untrusted open-source repo. Safest setup?",["Sandboxed Bash, restricted tools, no secrets in environment","bypassPermissions for speed","Admin cloud credentials","Auto-approve everything"],0,"Contain prompt injection risks."],
 ["tf","Automation truths",[["The Agent SDK exposes the same harness as Claude Code.",true,"Tools, context management, permissions, MCP."],["CI runs should use production credentials for convenience.",false,"Least privilege, always."]]]
]},
{act:"Expert", t:"Expert boss: Platform team rollout", boss:true, time:45, rounds:[
 ["pick","Sessions start with 30k tokens used before any prompt. Check…",["/context: MCP tool definitions and memory files","Model size","Network","Git"],0,"Trim always-loaded context."],
 ["pick","Org must forbid reading secrets everywhere, overriding user settings. Use…",["Enterprise managed policy settings with deny rules","CLAUDE.md note","A skill","User settings"],0,"Highest precedence."],
 ["pick","A PreToolUse hook prints an error but the command still runs. Fix?",["Exit with code 2 (or return a deny decision)","Exit 1","Print to stdout","Sleep"],0,"Blocking semantics."],
 ["pick","Skill rarely triggers; description is 'Utilities'. Fix?",["Describe what it does and when, with trigger words","Longer body","Rename folder","Add scripts"],0,"Descriptions drive matching."],
 ["pick","Exploring 200 files floods context. Use…",["Read-only explorer subagent returning a summary","/compact every minute","Bigger model","WebSearch"],0,"Context isolation."],
 ["pick","Weekly upgrades across 40 repos should run unattended. Use…",["Headless claude -p or the Agent SDK with limited tools","Interactive sessions","Plan mode","A hook"],0,"Automation."],
 ["pick","Untrusted repo contains instructions in its README targeting agents. Mitigate…",["Sandbox + restricted permissions + human review","Trust it","bypassPermissions","Delete README only"],0,"Repo-borne injection."]
]}
]);

QUEST.story("claudecode", {title:"Teach the agent your repo", icon:"🧠", place:"Mon 9 AM · new team member (an AI one)", setup:"Your team started using Claude Code. It writes decent code but keeps using the wrong test command, ignores your conventions, and re-explaining every session wastes time.",
 meters:[["re","Repeated instructions/day","",14,1,"low",20],["ok","PRs accepted first time","%",40,80,"high",100],["trust","Team trust","%",40,75,"high",100]],
 beats:[["priya","It ran 'pytest' again. We use 'make test' with a test DB container."],["ui","Repo: no CLAUDE.md, no custom commands, no hooks"],
  ["q","Where should project conventions live?",[["A CLAUDE.md at the repo root: build/test commands, code style, architecture notes, do's and don'ts",1,"It's loaded into context automatically every session.","An onboarding doc the new joiner reads every morning."],["Repeat them in every prompt",0,"Tedious and inconsistent.","Re-explaining to the new joiner daily."]]],
  ["q","You do the same 6-step release check weekly. How do you package it?",[["Make it a skill (or custom slash command) with the steps and scripts, so it can be invoked by name",1,"Reusable, versioned, shareable with the team.","A laminated checklist anyone can pick up."],["Write it in a Slack message",0.5,"Not versioned or invocable.","A sticky note that gets lost."]]],
  ["q","How do you guarantee formatting and block risky commands?",[["Hooks: run the formatter after edits and a pre-tool hook that blocks commands like 'rm -rf' or pushes to main",1,"Deterministic enforcement, not a polite request.","A door that physically won't open, not a sign."],["Ask it nicely in CLAUDE.md",0.5,"Usually followed, not guaranteed.","A sign on the door."]]],
  ["priya","First-time PR acceptance at 82%. Nobody repeats the test command any more."]],
 learned:["CLAUDE.md for project memory.","Skills/commands for repeatable workflows.","Hooks for guarantees."]});
QUEST.mock("claudecode", {title:"AI-assisted engineering round", who:"farah", intro:"Farah here. Let's talk about using coding agents well.", setup:"Farah leads developer productivity.",
 qs:[["How do you get good results from a coding agent on a big task?","Give context (CLAUDE.md, relevant files), ask for a **plan** first, break work into reviewable steps, have it run **tests**, review diffs, and iterate. Use subagents for parallel research when useful.",[["Context, plan first, small steps, tests, review diffs, iterate",1,"Effective workflow."],["One giant prompt and merge whatever comes back",0,"Risky."],["Avoid giving it context to prevent bias",0,"Context is what makes it good."]]],
  ["What is MCP and why does it matter for coding agents?","The **Model Context Protocol**: a standard way to connect agents to tools and data (GitHub, DBs, docs) through MCP servers exposing tools, resources and prompts. One integration works across clients.",[["A standard protocol for connecting agents to tools and data via servers",1,"Correct."],["A model",0,"Protocol."],["A code formatter",0,"No."]]],
  ["How do you keep agent changes safe?","Permissions (ask before risky commands), hooks to block dangerous actions, sandboxes/branches, tests and CI gates, code review, and no secrets in context.",[["Permissions, hooks, sandboxes/branches, tests/CI, review, no secrets",1,"Layered."],["Auto-approve everything for speed",0,"Risky."],["Only run it on Fridays",0,"Not a control."]]],
  ["Skills vs subagents vs hooks?","**Skills**: packaged instructions/scripts for a kind of task, loaded when relevant. **Subagents**: separate agents with their own context for focused or parallel work. **Hooks**: deterministic scripts on events (before/after tool use) for enforcement.",[["Skills = reusable know-how, subagents = separate focused workers, hooks = deterministic enforcement",1,"Clear."],["They're the same",0,"Different roles."],["Hooks are prompts",0,"They're code."]]]],
 learned:["Plan, small steps, tests, review.","MCP connects tools.","Skills, subagents and hooks have distinct jobs."]});
