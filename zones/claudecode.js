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
