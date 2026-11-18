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

Plus the **Data flow player**: animated, step-by-step views of a write through MySQL (InnoDB), Apache Iceberg, and a MySQL → Debezium → Kafka → Flink → Iceberg CDC pipeline.

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

## On-call desk (workplace debugging)

A simulated workstation: you get paged, acknowledge, and investigate a real-looking production incident.

- **Slack** channel with teammates who react to what you find (timed messages, clue-triggered messages, hints on request)
- **Terminal** that accepts typed commands (`kubectl logs --previous`, `kafka-consumer-groups --describe`, `psql`, `aws s3 ls`, `yarn logs`…) with history, Tab completion and suggestion chips
- **Dashboards** (SVG charts with deploy markers), a **console** (Spark UI, Connect UI, LangSmith traces) and **code** you can flag line by line
- Every output and panel has a 🚩 flag. Real evidence goes to your notes; red herrings explain why they're noise
- **Notes**: once you have enough clues, pick the root cause and the fixes to ship. Wrong causes and harmful fixes visibly backfire in Slack
- Resolving produces a blameless **postmortem** with a timeline built from your own actions

Cases live in zone files via `QUEST.cases(zoneId, [...])` (see the schema comment in `quest-engine.js`) and are listed in the `CASES` registry. Current cases: Spark small files, Spark executor memoryOverhead kills, Kafka poison message, Postgres WAL pinned by a paused Debezium slot, RAG embedding-model mismatch.

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
