QUEST.deep("claudecode", {
"CLAUDE.md is project memory": {
d: `Claude Code starts every session with no memory of previous ones. **CLAUDE.md** files are how you give it durable context. It loads them automatically:
- **User**: «~/.claude/CLAUDE.md» (your personal preferences across projects).
- **Project**: «./CLAUDE.md» (committed, shared with the team) and «CLAUDE.local.md»-style personal files (git-ignored).
- **Nested**: CLAUDE.md files in subdirectories are pulled in when Claude works in those folders.
- Files can **import** others with «@path/to/file».

What to put in: build/test/lint commands, architecture overview, code style rules, "gotchas" (don't touch generated files, use pnpm not npm), how to run things locally, PR conventions. Keep it **short and specific**: it costs context every session. Use «/init» to bootstrap one and «#» shortcuts or «/memory» to edit.`,
life: `The onboarding note you leave for a new teammate on their desk: how to build, where things live, team rules. They read it every morning because they have no memory of yesterday.`,
work: `Claude kept running «npm test» (slow, full suite) and editing generated protobuf files. Adding three lines to CLAUDE.md ("run «pnpm test:unit -- <file>» for focused tests; never edit «gen/»; run «make proto» after changing «.proto») fixed both behaviours across the team, because the file was committed.`,
ex: `# CLAUDE.md
## Commands
- Build: pnpm build · Unit tests: pnpm test:unit -- <path> · Lint: pnpm lint --fix
## Architecture
- services/payments: settlement logic (Kotlin); pipelines/: PySpark jobs on EMR
## Rules
- Never edit gen/ (generated). Run \`make proto\` after .proto changes.
- Money is in paise (Long). Never use floating point for amounts.
@docs/runbooks/local-setup.md`,
pit: [`Bloated CLAUDE.md that wastes context.`, `Secrets in CLAUDE.md.`, `Personal preferences committed to the shared project file.`],
q: [`Which CLAUDE.md should hold team-wide build commands?`, `The project-level ./CLAUDE.md committed to the repo.`]
},
"Context management": {
d: `Everything in a session (files read, command outputs, conversation) consumes the context window, and quality drops as it fills with stale material. Tools:
- «/clear»: start fresh between unrelated tasks (most underused command).
- «/compact [instructions]»: summarise the session so far to free space while keeping key decisions; auto-compaction happens near the limit.
- «@path»: pull a specific file or folder into context instead of letting Claude search broadly.
- **Plan mode** (Shift+Tab): Claude explores and proposes a plan without editing; you review before execution.
- **Subagents**: delegate exploration so verbose search results stay in their context.
- «/context» to see what's using space; «/rewind» or checkpoints to undo a wrong direction.

Habit: one task per session, specific prompts, clear when switching topics.`,
life: `A desk you can only fit so many papers on. Clear it between projects, keep a summary sheet of a long project, and bring only the files you need.`,
work: `A long session that had fixed three unrelated bugs started making odd edits referencing earlier files. Running «/clear» before each new task and using plan mode for the larger refactor reduced rework; the team added "one task per session" to their AI usage guidelines.`,
ex: `> /clear
> Use plan mode. Read @pipelines/settlement_job.py and @tests/test_settlement.py.
  Propose how to add bank-holiday handling. Don't edit yet.
...
> /compact Keep: decisions on holiday calendar source, files changed, failing tests.`,
pit: [`Endless sessions spanning many tasks.`, `Vague prompts that trigger broad searches.`, `Skipping plan mode on risky changes.`],
q: [`What's the difference between /clear and /compact?`, `/clear starts a fresh context; /compact summarises the current session to keep key information while freeing space.`]
},
"Skills are folders": {
d: `A **skill** packages know-how for a type of task: a folder containing **SKILL.md** (YAML frontmatter with «name» and «description», then Markdown instructions) plus optional **scripts**, templates, reference docs and examples.

Locations: personal («~/.claude/skills/<name>/»), project («.claude/skills/<name>/», shared via git), or from **plugins**. Claude sees each skill's name + description and **decides itself** to use a skill when a task matches; then it reads SKILL.md and any referenced files, and can run bundled scripts.

The **description** is crucial: it decides when the skill triggers ("Use when creating Airflow DAGs for our EMR jobs..."). Skills are great for repeatable workflows: company report formats, deployment checklists, data-quality procedures, internal API usage.`,
life: `A labelled recipe box in a shared kitchen. The cook glances at labels; when making biryani, they pull out that card and the masala mix stored with it.`,
work: `Engineers kept asking Claude to "write a new Spark job like our others", getting inconsistent results. A «new-spark-job» skill with the team template, required configs (AQE, partition sizing), a DAG snippet and a validation script made every generated job follow standards; reviews shrank from 20 comments to 3.`,
ex: `.claude/skills/new-spark-job/
├── SKILL.md
├── template_job.py
├── dag_snippet.py
└── scripts/validate_job.py
---
name: new-spark-job
description: Use when creating a new PySpark batch job for the lake (EMR + Airflow). Provides the team template, config defaults and a validator.
---
1. Copy template_job.py to pipelines/<name>.py ...
2. Run scripts/validate_job.py pipelines/<name>.py and fix all findings.`,
pit: [`Vague descriptions so the skill never triggers (or always does).`, `Huge SKILL.md instead of referencing files.`, `Secrets inside skill folders.`],
q: [`What decides whether Claude uses a skill for a task?`, `Claude matches the task to the skill's name and description, which are always visible to it.`]
},
"Subagents have their own context": {
d: `A **subagent** is a specialised assistant defined as a Markdown file with frontmatter in «.claude/agents/» (project) or «~/.claude/agents/» (user): «name», «description» (when to use), optional «tools» (restrict to e.g. Read, Grep, Glob), optional «model», then a system prompt body.

Claude can delegate to a subagent automatically (based on description) or when asked ("use the code-reviewer subagent"). The subagent runs in a **separate context window**, does its work, and returns only a result summary. Benefits: the main conversation stays clean, tools can be restricted (a reviewer that can't edit), and specialised instructions apply. Create with «/agents».`,
life: `Sending a specialist (an auditor) to review accounts in a separate room. They come back with a short report; your desk doesn't fill up with their working papers.`,
work: `A «test-failure-investigator» subagent (Read, Grep, Glob, Bash restricted to test commands) was used whenever CI failed. It read logs and code in its own context and returned "root cause + suggested fix". The main session stayed focused on the feature, and token use per session dropped noticeably.`,
ex: `---
name: sql-reviewer
description: Use after writing or changing SQL/dbt models to review for correctness, performance and PII exposure.
tools: Read, Grep, Glob
model: sonnet
---
You review SQL for: join fan-out, missing filters on partition columns, non-sargable predicates,
SELECT * in models, PII columns exposed to marts. Report findings as a checklist with file:line.`,
pit: [`Giving reviewer subagents write tools.`, `Vague descriptions (never delegated).`, `Expecting the subagent to see the whole main conversation.`],
q: [`Why does a subagent help with context management?`, `It works in its own context window and returns only a summary, so its exploration doesn't fill the main session.`]
},
"Hooks run your code at lifecycle events": {
d: `**Hooks** are shell commands (or prompts) that run automatically at specific events, configured in settings JSON under «hooks», with optional **matchers** (e.g. tool names). Events include:
- **PreToolUse**: before a tool runs; can **block** it (e.g. forbid edits to «prod/», block dangerous Bash).
- **PostToolUse**: after a tool succeeds (run formatter/linter on edited files).
- **UserPromptSubmit**: before Claude sees your prompt (add context, block secrets).
- **Stop** / **SubagentStop**: when Claude finishes (run tests, notify).
- **SessionStart** / SessionEnd, **PreCompact**, **Notification**.

Unlike instructions in CLAUDE.md (which the model may forget), hooks are **deterministic**: they always run. Since they execute with your permissions, review hook scripts like any code.`,
life: `Automatic rules in a factory: every part that leaves a station goes through a scanner (post-hook), and a safety gate physically blocks entry to restricted areas (pre-hook), regardless of what the worker remembers.`,
work: `Claude sometimes forgot to run «ruff» after edits. A PostToolUse hook on «Edit|Write» runs «ruff format» and «ruff check --fix» on the changed file. A PreToolUse hook blocks any Bash command containing «terraform apply» or «DROP TABLE», returning a message telling Claude to ask the user.`,
ex: `{"hooks": {
  "PostToolUse": [{"matcher": "Edit|Write",
    "hooks": [{"type": "command", "command": "ruff format \\"$CLAUDE_PROJECT_DIR\\" -q"}]}],
  "PreToolUse": [{"matcher": "Bash",
    "hooks": [{"type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/block_dangerous.sh"}]}]
}}`,
pit: [`Relying on CLAUDE.md for rules that must always happen.`, `Slow hooks on every tool call.`, `Unreviewed hook scripts from others.`],
q: [`Why use a hook instead of a CLAUDE.md instruction for formatting?`, `Hooks run deterministically every time; instructions can be forgotten or ignored.`]
},
"Permissions": {
d: `Claude Code asks before risky actions by default. The «permissions» block in settings defines rules:
- «allow»: run without asking (e.g. «Bash(pnpm test:*)», «Read(./src/**)»).
- «ask»: always confirm.
- «deny»: never allowed (e.g. «Read(./.env)», «Bash(curl:*)», «Edit(./infra/prod/**)»).

Settings files and precedence: enterprise managed policy (highest, can't be overridden) → command-line flags → «.claude/settings.local.json» (personal, git-ignored) → «.claude/settings.json» (project, committed) → «~/.claude/settings.json» (user). Deny rules win over allow.

**Permission modes**: default (ask), «acceptEdits» (auto-accept file edits), «plan» (read-only planning), and «bypassPermissions» (dangerous; only in isolated sandboxes/containers). Use «/permissions» to view and edit.`,
life: `A building access card: some doors open automatically (allow), some need the guard to buzz you in (ask), and the server room never opens for you (deny), with company policy overriding personal preferences.`,
work: `The team committed a project settings file that allows test/lint commands and denies reading «.env*», secrets folders and running «kubectl» against prod contexts. New engineers got safe defaults on day one; prompts for routine test runs disappeared.`,
ex: `// .claude/settings.json
{"permissions": {
  "allow": ["Bash(pnpm test:*)", "Bash(pnpm lint:*)", "Bash(git diff:*)"],
  "ask":   ["Bash(git push:*)"],
  "deny":  ["Read(./.env)", "Read(./.env.*)", "Read(./secrets/**)", "Bash(kubectl --context prod*)"]
}}`,
pit: [`bypassPermissions on a laptop with real credentials.`, `Over-broad allow rules like «Bash(*)».`, `Secrets readable because no deny rules exist.`],
q: [`A user allow rule and a project deny rule match the same action. Which wins?`, `Deny: deny rules take precedence over allow rules.`]
},
"MCP in Claude Code": {
d: `Claude Code is an MCP **host**: connect servers to give it tools like database access, issue trackers, browsers or internal APIs.
- Add: «claude mcp add <name> -- <command>» (stdio) or «claude mcp add --transport http <name> <url>» (remote), with «--env» for variables.
- **Scopes**: **local** (default; only you, this project), **project** (stored in «.mcp.json» at the repo root, committed so the team shares it; Claude asks for approval before using project servers), **user** (you, all projects).
- «/mcp» shows status, tools and handles OAuth login for remote servers.
- MCP tools appear as «mcp__<server>__<tool>» and can be targeted in permission rules.

Security: only add servers you trust (stdio servers run as you), use read-only credentials, and watch for prompt injection through tool outputs.`,
life: `Plugging adapters into a laptop: some are personal (your mouse), some come with the office desk for everyone (project), and IT only allows approved devices.`,
work: `The data team committed «.mcp.json» with a read-only Postgres MCP server pointing at the analytics replica and a Jira server. Engineers could ask Claude "which tables feed the settlement mart and are there open tickets on them?" without copying schemas into prompts.`,
ex: `claude mcp add --transport http jira https://mcp.internal/jira --scope project
claude mcp add pg-analytics --scope project -- npx -y @modelcontextprotocol/server-postgres "$ANALYTICS_RO_URL"
claude mcp list
// .claude/settings.json
{"permissions": {"allow": ["mcp__pg-analytics__query"], "deny": ["mcp__jira__delete_issue"]}}`,
pit: [`Untrusted stdio servers with access to your machine.`, `Write-capable DB credentials.`, `Committing secrets inside .mcp.json (use env vars).`],
q: [`Which scope shares an MCP server with the whole team via git?`, `Project scope, stored in .mcp.json at the repo root.`]
},
"Headless and CI": {
d: `**Headless / print mode**: «claude -p "task"» runs non-interactively and exits. Useful flags:
- «--output-format text | json | stream-json» for scripts.
- «--allowedTools» / «--disallowedTools» to pre-approve or block tools (no one is there to click "allow").
- «--max-turns» to cap the loop; «--permission-mode» for edit behaviour.
- «--append-system-prompt» to add instructions; pipe input via stdin.

Use cases: CI jobs (fix lint errors, update snapshots, write release notes), pre-commit helpers, batch migrations across many files, scheduled maintenance. The **Claude Code GitHub Action** lets people mention @claude in issues/PRs to implement or review changes. The **Claude Agent SDK** (Python/TypeScript) exposes the same agent loop programmatically for custom agents.`,
life: `Turning an interactive assistant into a scheduled worker: you leave a written instruction, specify exactly which tools they may touch, and collect their written report afterwards.`,
work: `A nightly job ran «claude -p» to update outdated dbt model docs: allowed tools Read, Edit, «Bash(dbt docs generate)», max 30 turns, JSON output parsed for a summary. Changes went to a PR for human review. It cleared a backlog of 200 undocumented models in two weeks.`,
ex: `claude -p "Find dbt models in models/marts without column descriptions and add them based on SQL and upstream docs. Don't change SQL." \\
  --allowedTools "Read,Edit,Glob,Grep,Bash(dbt parse)" \\
  --max-turns 30 --output-format json > result.json
jq -r '.result' result.json`,
pit: [`Broad tool permissions in CI (e.g. unrestricted Bash).`, `No max-turns or timeouts.`, `Auto-merging AI changes without review.`],
q: [`Why are --allowedTools important in headless mode?`, `There's no human to approve tool use, so you must pre-approve exactly what's safe and needed.`]
},
"Plugins": {
d: `A **plugin** bundles Claude Code extensions so a team installs them as one unit: **slash commands**, **subagents**, **skills**, **hooks** and **MCP servers**, described by a «.claude-plugin/plugin.json» manifest.

Plugins are distributed through **marketplaces**: a git repo (or URL) with a «marketplace.json» listing plugins. Users add a marketplace («/plugin marketplace add org/repo») and install plugins («/plugin install name@marketplace»), enable/disable them, and update them. Organisations can define approved marketplaces in managed settings.

Use plugins to standardise team workflows: "data-eng" plugin with a dbt reviewer subagent, a Spark job skill, a lint hook and the warehouse MCP server.`,
life: `A starter kit for new joiners: one box containing the laptop stickers, the coding standards booklet, the right adapters and access cards, instead of collecting each item separately.`,
work: `Each data engineer had a different set of copied commands and hooks. Packaging them as an internal «dataeng-toolkit» plugin in the company marketplace meant one install command, consistent behaviour, and updates rolled out by bumping the plugin version.`,
ex: `dataeng-toolkit/
├── .claude-plugin/plugin.json      {"name": "dataeng-toolkit", "version": "1.4.0", ...}
├── commands/review-dbt.md
├── agents/sql-reviewer.md
├── skills/new-spark-job/SKILL.md
├── hooks/hooks.json
└── .mcp.json
> /plugin marketplace add company/claude-plugins
> /plugin install dataeng-toolkit@company`,
pit: [`Installing plugins from unknown marketplaces (they can run hooks/code).`, `No versioning of internal plugins.`, `Duplicating the same setup in every repo instead.`],
q: [`What's in a plugin?`, `A bundle of extensions: commands, subagents, skills, hooks and MCP servers, with a manifest.`]
},
"How Claude Code works a task": {
d: `Claude Code is an **agent loop** in your terminal/IDE:
1. **Gather context**: CLAUDE.md, your prompt, then explore with tools: Glob (find files), Grep (search), Read (open files), Bash (run commands, git), WebFetch/WebSearch.
2. **Plan**: decide steps (explicitly in plan mode, or implicitly).
3. **Act**: Edit/Write files, run commands.
4. **Verify**: run tests, linters, type checks, builds; read output.
5. **Iterate** until done or blocked, asking permission for actions outside allowed rules.

It works best with **verification targets** (tests, a script that reproduces the bug, screenshots for UI) and **explicit scope**. Good workflow patterns: explore → plan → code → commit; write tests first then implement (TDD); give it a way to check its own work.`,
life: `A contractor who first walks through the house and reads the floor plan, proposes a plan, does the work, then tests every switch before calling you.`,
work: `"Fix the flaky settlement test" produced a guessy patch. Re-prompting with "first reproduce: run the test 20 times with «pytest -x --count=20», find the root cause, then fix and re-run 50 times" led Claude to find a timezone-dependent date boundary and fix it properly.`,
ex: `> Explore pipelines/settlement/ and explain how holidays are handled. Don't edit.
> Write a failing test in tests/test_holidays.py for a settlement on Diwali.
> Now make it pass. Run pytest tests/test_holidays.py and the full unit suite.
> Commit with a descriptive message.`,
pit: [`No way for Claude to verify (no tests/commands).`, `Huge vague tasks in one prompt.`, `Accepting changes without reading the diff.`],
q: [`Why give Claude a test or script to run?`, `It can verify its own work and iterate until the check passes instead of guessing.`]
},
"Three loading levels": {
d: `Skills use **progressive disclosure** so you can install many without filling context:
- **Level 1 (always loaded)**: each skill's «name» and «description» from the frontmatter: a few dozen tokens each.
- **Level 2 (when relevant)**: the body of SKILL.md is read when Claude decides the task matches.
- **Level 3+ (on demand)**: additional files the SKILL.md references (reference docs, examples, schemas) are read only if needed; **scripts** are executed and only their output enters context (the code itself needn't be read).

Design implications: put the "when to use" in the description; keep SKILL.md focused on the workflow; move large reference material into separate files with clear pointers ("for column naming rules see «naming.md»"); prefer deterministic scripts for exact operations (validation, formatting) over long prose instructions.`,
life: `A library: you see every book's spine label (level 1), pull a book off the shelf when its title matches (level 2), and only open the appendix when you need a detail (level 3).`,
work: `A data-catalog skill initially had a 6,000-word SKILL.md including every naming rule and example; it loaded fully on every related task. Splitting it into a 400-word workflow + «naming.md», «examples/», and a «validate_names.py» script cut context use by 85% with better compliance (the script caught violations deterministically).`,
ex: `---
name: dbt-model-standards
description: Use when creating or reviewing dbt models; enforces naming, tests and docs standards.
---
## Workflow
1. Follow naming rules in naming.md.
2. Add tests per tests_matrix.md.
3. Run: python scripts/check_model.py <model.sql> and fix all errors.`,
pit: [`Everything in SKILL.md.`, `Descriptions that don't say when to use the skill.`, `Long prose where a script would be exact.`],
q: [`Why can you install many skills without bloating context?`, `Only names and descriptions are always loaded; bodies and files load on demand.`]
},
"Delegation done right": {
d: `Subagents help when work is **separable**: broad codebase exploration, investigating test failures, reviewing a diff, researching docs, running a migration across independent modules. They run in their own context and return a summary.

Doing it well:
- **Clear task specs**: objective, scope (which folders), expected output format ("list of file:line + one-line reason"), and what not to do.
- **Restrict tools** to what the subagent needs (reviewers and explorers: read-only).
- **Parallelise** independent investigations; avoid parallel agents editing the same files.
- Use built-in subagents for exploration/planning, and custom ones for team-specific roles.
- **Verify** subagent conclusions in the main thread before acting on them (they can be wrong).

Don't delegate tiny tasks (overhead) or tightly coupled edits (conflicts).`,
life: `A lead engineer sending three people to investigate three suspected causes of an outage at once, each told exactly what to check and to report back in a fixed format, and then double-checking the most promising report.`,
work: `For a slow-pipeline investigation, the main session spawned three read-only subagents: one for Spark configs, one for recent commits touching the job, one for Airflow logs. They returned in parallel; the commit-history agent found a removed broadcast hint. The main session verified with «explain()» before fixing.`,
ex: `> Use 3 subagents in parallel (read-only):
  1) Review spark configs in conf/ for changes vs last month; output file:line + change.
  2) git log -p --since=2026-10-15 -- pipelines/settlement/; list risky changes.
  3) Summarise errors/warnings in logs/airflow/settlement_*.log.
  Then combine findings and propose the most likely root cause.`,
pit: [`Vague subagent tasks.`, `Parallel subagents editing the same files.`, `Acting on subagent output without verification.`],
q: [`When is delegating to subagents a bad idea?`, `For tiny tasks or tightly coupled edits where agents would conflict or need shared evolving context.`]
},
"Hook input and output": {
d: `Hooks receive a **JSON payload on stdin** with: «session_id», «transcript_path», «cwd», «hook_event_name», and event-specific fields such as «tool_name» and «tool_input» (PreToolUse), «tool_response» (PostToolUse) or «prompt» (UserPromptSubmit).

They respond through **exit codes** and/or **JSON on stdout**:
- Exit **0**: success (for some events stdout is added as context, e.g. UserPromptSubmit/SessionStart).
- Exit **2**: **blocking error**: the action is blocked and stderr is fed back to Claude (PreToolUse blocks the tool; UserPromptSubmit blocks the prompt; Stop prevents stopping and tells Claude what's left).
- Other non-zero: non-blocking error shown to the user.
- JSON output enables finer control: e.g. a PreToolUse «permissionDecision» of allow/deny/ask with a reason, «continue: false», «additionalContext».

Environment: «CLAUDE_PROJECT_DIR» for paths. Keep hooks fast, quote variables, and validate inputs (they run with your permissions).`,
life: `A security guard who reads each visitor's form (stdin JSON), and either waves them through, stops them with a written reason that the visitor must read (exit 2 + stderr), or notes a minor issue for the manager.`,
work: `A PreToolUse hook on Bash parsed «tool_input.command» with «jq»; if it matched «rm -rf» outside the project or any «aws s3 rm», it exited 2 with "Destructive command blocked; ask the user". Claude then asked the user instead of retrying variations. A Stop hook ran unit tests and exited 2 with failures so Claude kept working until green.`,
ex: `#!/usr/bin/env bash
# .claude/hooks/block_dangerous.sh
input=$(cat)
cmd=$(echo "$input" | jq -r '.tool_input.command // ""')
if echo "$cmd" | grep -Eq 'aws s3 rm|terraform apply|DROP TABLE'; then
  echo "Blocked: destructive command. Ask the user to run it manually." >&2
  exit 2
fi
exit 0`,
pit: [`Slow hooks on every tool call.`, `Unquoted variables (injection in your own hook).`, `Using exit 1 when you meant to block (only 2 blocks).`],
q: [`Which exit code blocks a PreToolUse action and sends the reason back to Claude?`, `Exit code 2, with the reason on stderr.`]
},
"Claude Code beyond the terminal": {
d: `The same agent runs in several surfaces:
- **IDE extensions** (VS Code, JetBrains): inline diffs, selection context, side panel.
- **Desktop and web/mobile apps**: start tasks remotely; cloud sessions run in isolated environments and can open PRs.
- **Headless mode** («claude -p») for scripts and CI with JSON/streaming output.
- **GitHub Actions** integration: mention @claude on issues/PRs to implement features, fix bugs or review, governed by workflow permissions.
- **Claude Agent SDK** (Python/TypeScript): the agent harness (tools, context management, permissions, subagents, hooks, MCP) as a library to build your own agents, e.g. an on-call triage bot or a data-quality agent.

Configuration (CLAUDE.md, settings, skills, MCP) carries across surfaces when it lives in the repo.`,
life: `The same skilled contractor you can call to your house (terminal), hire through an app (web), schedule for routine maintenance (CI), or hire their whole methodology to train your own crew (SDK).`,
work: `The data team used the GitHub Action: commenting "@claude add a not_null test to all primary keys in models/marts" on an issue created a PR. Separately, they built an Agent SDK-based "pipeline doctor" that reads Airflow failures, inspects logs via MCP, and posts a diagnosis to Slack.`,
ex: `# .github/workflows/claude.yml (sketch)
on: {issue_comment: {types: [created]}}
jobs:
  claude:
    if: contains(github.event.comment.body, '@claude')
    runs-on: ubuntu-latest
    permissions: {contents: write, pull-requests: write, issues: write}
    steps:
      - uses: actions/checkout@v4
      - uses: anthropics/claude-code-action@v1
        with: {anthropic_api_key: \${{ secrets.ANTHROPIC_API_KEY }}}`,
pit: [`Giving CI agents more repo permissions than needed.`, `Different configs per surface instead of repo-level config.`, `API keys in workflow files instead of secrets.`],
q: [`What is the Claude Agent SDK for?`, `Building your own agents programmatically on the same harness that powers Claude Code.`]
}
});
