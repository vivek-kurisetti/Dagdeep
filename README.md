# Dagdeep

**Learn data and AI engineering by playing.** No reading walls: every concept is a power-up card you collect mid-level, then use straight away in puzzle rounds. Wrong answers explain themselves, so mistakes are how you learn.

Live site: https://vivek0803.github.io/Dagdeep/

## How it plays

- **🎤 Interview mode** (Spark, Kafka, RAG): mock interviews where you pick the answer you'd give, the interviewer reacts, and a model answer is shown; plus a cheat sheet of model answers per zone.
- **Surprises**: plot-twist bonus questions mid-mission, a mystery chest after each first clear, and secret trophies.
- **Real Spark UI screenshots** in the Spark story, captured from real Spark 4 jobs replaying each scenario (`img/`).

- **🎬 Story missions** (Spark, Kafka, RAG so far): each mission is a real situation — a late nightly job, a broker crash, a data leak — played as a live incident with teammates' messages, Spark UI / log screens, decisions with consequences on meters (runtime, cost, trust…), hands-on tasks, and an everyday-life analogy for every concept. Missions unlock **detailed concept cards**: real-life analogy, how it works step by step, worked example, gotchas and an interview answer.

- **World map** with two worlds and 26 zones. Rank, XP, day streak and collected cards show on the map.
- **Zones** have a short story mission, a path of levels that unlock in order, and a **card deck** of every concept you've collected.
- **Levels** have 3 hearts, a streak multiplier, and a feedback sheet after every round that teaches the why. Stars = hearts left.
- **Round types:** concept power-up, pick, sort (one card at a time into buckets), order the steps, match pairs, fill the code blanks, spot the bug, and true/false speed rounds.
- **Expert tier** in every zone: 4–6 extra levels on internals, numbers and failure modes, with **deep cards** (a "Go deeper" panel with full explanations, tables and code) and **calculation rounds** where you work out real numbers (RCUs, KV cache size, error budgets…), ending in an expert boss.
- **Boss levels** add a timer to every round. Spark also has 8 arcade levels (Plan or Run?, Partition Packer, Shuffle Hunter, Hash Router, Join Duel, Skew Smasher, Executor Fit, The Nightly Job).

### Data Engineering world
Spark · Kafka · Debezium CDC · AWS (S3, Glue, Athena, DynamoDB) · Apache Iceberg · Redshift · Snowflake · Databricks · dbt · StarRocks · Cassandra · MySQL · PostgreSQL · MongoDB

### AI Engineering world
LLM fundamentals · RAG · LangChain · LangGraph · LangSmith · Agentic AI · MCP · Claude Code (CLAUDE.md, skills, subagents, hooks, MCP, headless) · Security of AI (OWASP LLM Top 10, red-teaming) · Security for AI (defence in depth, least privilege, governance) · AI observability · Fine-tuning

Plus the **Data flow player**: animated, step-by-step views of how Spark splits a job into stages and tasks across a shuffle; reads and writes in PostgreSQL (MVCC, WAL, shared buffers), MySQL (InnoDB) and Amazon Redshift (slices, DISTKEY, zone maps); Apache Iceberg; and a MySQL → Debezium → Kafka → Flink → Iceberg CDC pipeline.

Progress is saved in the visitor's browser.

## Files

| File | What it is |
|---|---|
| `index.html` | Page shell, data-flow player and routing |
| `quest-engine.js` | World map, zones, levels, round mechanics, XP, cards (zone list lives here) |
| `quest.css` | Styles for the game |
| `zones/<id>.js` | One file per zone, loaded on demand |
| `game-kit.js`, `course-spark-games.js` | Arcade framework and the Spark arcade levels |

## Accounts: Google sign-in (optional)

Without setup, everyone plays as a guest and progress is saved in their browser. **🔄 Start fresh** in the account menu clears progress at any time.

To give every user their own progress, synced across devices:

1. Create a project at https://console.firebase.google.com (free Spark plan is enough).
2. **Build → Authentication → Get started → Sign-in method → Google → Enable.**
3. **Authentication → Settings → Authorized domains → Add domain:** `vivek0803.github.io` (and `localhost` for testing).
4. **Build → Firestore Database → Create database** (production mode, a region near your users, e.g. `asia-south1`).
5. **Firestore → Rules**, paste and publish:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

6. **Project settings → Your apps → Web app (</>)**, register it, copy the config object into `firebase-config.js`:

```js
window.DAGDEEP_FIREBASE = {
  apiKey: "…", authDomain: "your-project.firebaseapp.com", projectId: "your-project", appId: "…"
};
```

7. Commit and push. The web config isn't a secret; the rules above ensure each signed-in user can only read and write their own document (`users/{uid}`). Guest progress is moved into the account on first sign-in.

## Google sign-in

Firebase project **dagdeep** is wired in `firebase-config.js` (the web config is public by design). Each signed-in user's progress is stored in Firestore at `users/{uid}`, protected by the rules below. Authorized domains (Firebase → Authentication → Settings) must include every domain that serves the site. Popups fall back to redirect, in-app browsers (LinkedIn, Instagram) get an "open in your browser" prompt, and anyone can export/import progress as JSON.

## System design

`#design` (loaded on demand from `design-data.js` + `design.js`):
- **Design rounds** in interview format: clarify (pick the right questions), estimate (back-of-envelope numbers), build the architecture (pick a component per box; the diagram draws itself), deep-dive trade-offs, and free-text answers scored against a model-answer checklist. Players choose **write first, then compare** or **pick from options**.
- **How to approach a design**: a 6-step framework with timings and habits.
- **Architecture gallery**: Lambda, Kappa, medallion lakehouse, CDC + outbox, real-time OLAP, feature store, RAG platform, agent platform, each with a diagram, use-when and watch-outs.
- **Project ideas**: 12 portfolio projects (idea, what you learn, stack, how to stand out), no code.

Diagrams are generated SVG from a small spec (`{nodes:{id:{c, r, label, sub, k}}, edges:[[from, to, label]]}`) and flip to top-to-bottom on phones.

## Learning path and robustness

- Every zone opens on **📘 Concepts**: every concept from the drills in order (basic, then expert), each expandable with a *Go deeper* section and a "Mark as understood" toggle with progress. Then Missions → Drills → Work → Interview → Cards.
- **20 incidents** now (added Cassandra wide partition, MongoDB missing index, Snowflake runaway task, DynamoDB hot key, Delta MERGE conflict, LLM 429 retry storm, MCP tool rename, LangGraph state bloat). Each shows a **live business-impact counter** that keeps growing until you resolve it.
- Zone files retry twice on network errors; any rendering error shows a friendly recovery screen instead of a blank page; a network-first service worker keeps played content available offline.

## Security

- Static site: no server, no secrets. The Firebase web config is public by design.
- Firestore rules: each user can only read and write `users/{their uid}`, and only the fields `quest`, `profile`, `name`, `updatedAt`.
- Content-Security-Policy (meta tag): scripts only from this site and Google's sign-in domains; no inline scripts, no plugins.
- All progress loaded from storage, Firestore or an imported file is sanitized (only ids, numbers and booleans survive), and all rendered text is HTML-escaped.
- Recommended in Google Cloud: restrict the browser API key to the site's domains and the Identity Toolkit, Token Service and Firestore APIs; keep the project on the free Spark plan (or set a budget alert); optionally enable App Check.

## Story missions and mock interviews everywhere

Every one of the 26 zones has at least one story mission (🎬) and one mock interview round (🎤). New ones are written compactly with `QUEST.story(zoneId, {...})` and `QUEST.mock(zoneId, {...})` (formats documented next to `Q.story` in `quest-engine.js`). `#interview` lists every round. Answer options in missions, interviews, incidents and work tasks are shuffled on every play.

## Work simulator

`#work` is a hub of real tasks from a data/AI engineer's week, in six different formats, each with its own clean layout:

| Type | You… |
|---|---|
| 📟 Incident | get paged and investigate with Slack, a terminal, dashboards and code |
| 🔍 PR review | read a diff, tap risky lines, say what's wrong, then approve or request changes |
| 🧾 Log hunt | answer questions by tapping the right line in hundreds of filterable log lines |
| 🎛️ Tune it | pick values for real config knobs, run a simulation, hit every goal in few runs |
| 🧭 Postmortem | order shuffled events, label trigger/cause/symptom/response, then do the 5 whys |
| 🚦 Triage | sort an inbox of alerts and tickets by urgency and pick the first move |

Every task ends with a 🔬 deep dive, an interview answer and links to the course. Non-incident tasks live in zone files via `QUEST.work(zoneId, [...])` (schemas at the top of the work-simulator section in `quest-engine.js`) and are registered in `WORK`.

## On-call desk (workplace debugging)

A simulated workstation: you get paged, acknowledge, and investigate a real-looking production incident.

- **Slack** channel with teammates who react to what you find (timed messages, clue-triggered messages, hints on request)
- **Terminal** that accepts typed commands (`kubectl logs --previous`, `kafka-consumer-groups --describe`, `psql`, `aws s3 ls`, `yarn logs`…) with history, Tab completion and suggestion chips
- **Dashboards** (SVG charts with deploy markers), a **console** (Spark UI, Connect UI, LangSmith traces) and **code** you can flag line by line
- Every output and panel has a 🚩 flag. Real evidence goes to your notes; red herrings explain why they're noise
- **Notes**: once you have enough clues, pick the root cause and the fixes to ship. Wrong causes and harmful fixes visibly backfire in Slack
- Resolving produces a blameless **postmortem** with a timeline built from your own actions

- **❓ Guide** tab and a 1-2-3 stepper (Investigate → Root cause → Ship the fix) explain the rules, each tool, scoring, and the terms used in that incident
- Every incident links to the course: **📚 Brush up first** on the pager, study material in the Guide (readable in place or opened in a new tab), and **Go deeper** links in the postmortem. Course pages live at `#learn-<zone>-<level>` and `#card-<zone>-<key>`, and they link back to the incidents that use them

Cases live in zone files via `QUEST.cases(zoneId, [...])` (see the schema comment in `quest-engine.js`); each needs an entry in the `CASES` registry with its `topics` and `study` refs (`"zone:levelIndex"` or `"zone/cardKey"`). Current cases (12): Spark small files, Spark executor memoryOverhead kills, Kafka poison message, Postgres WAL pinned by a paused Debezium slot, RAG embedding-model mismatch, MySQL replica lag from a PK-less purge, Iceberg metadata bloat from failed maintenance, Debezium purged binlog after a password rotation, dbt incremental duplicates, Redshift CTAS losing its DISTKEY, a runaway LangGraph agent, and indirect prompt injection exfiltrating PII.

## Story missions

Append to a zone file after `QUEST.zone(...)`:

```js
QUEST.cards("kafka", { partitions: {t, one, life, how: [...], ex: `markdown`, traps: [...], say} });
QUEST.missions("kafka", [{title, icon, place, setup,
  meters: {lag: {label, value, unit, goal, better: "low", max}},
  steps: [
    {say: [["dev", "text"], ["ui", "Screen title\nline"], ["code", "..."]]},
    {choose: "Prompt", options: [{t, ok: true|false|"partial", fx: {lag: -1000}, say: [...], why, life}]},
    {task: ["num", ...round], intro: [...], label, ok: {fx}, bad: {fx}, life},
    {card: "partitions"}
  ], learned: [...]}]);
```

## Adding or extending a zone

1. Add a row to `ZONES` in `quest-engine.js`: `[id, world, title, short, hue, monogram]`.
2. Create `zones/<id>.js`:

```js
QUEST.zone("kafka", {
  mission: ["dev", "One-line story with **bold** and «code»."],
  levels: [
    {t: "Level title", sub: "subtitle", rounds: [
      ["learn", "Card title", "Concept text", ["optional", "flow", "steps"], "optional code"],
      ["pick", "Question?", ["A", "B", "C"], 1, "Why B is right"],
      ["sort", "Prompt", {"Bucket 1": ["x", "y"], "Bucket 2": ["z"]}, "why"],
      ["order", "Prompt", ["step 1", "step 2", "step 3"], "why"],
      ["match", "Prompt", [["term", "meaning"], ["term2", "meaning2"], ["term3", "meaning3"]], "why"],
      ["fill", "Prompt", "code with ___ blanks", ["answer1"], ["decoy"], "why"],
      ["bug", "Prompt", ["line 1", "line 2"], 1, "why"],
      ["tf", "Prompt", [["statement", true, "why"]]],
      ["num", "Question?", 42, 0.5, "unit", "why"],   // answer, tolerance
      ["learn", "Deep card", "Short body", null, null, `Deep text: ### headings, - bullets, | tables |, ~~~ code`]
    ]},
    {t: "Boss", boss: true, time: 30, rounds: [/* ... */]},
    {act: "Expert", t: "Expert level", rounds: [/* ... */]},   // or append later with QUEST.more(id, [levels])
    {t: "Arcade", arcade: "planOrRun"}
  ]
});
```

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy

GitHub Pages deploys on every push to `main` via `.github/workflows/pages.yml` (it copies `index.html`, `*.js`, `*.css` and `zones/`). Any static host works too (Netlify, Cloudflare Pages, Vercel: no build command, output directory `/`).
