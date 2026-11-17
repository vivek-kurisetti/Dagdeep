# Dagdeep

**Learn data and AI engineering by playing.** No reading walls: every concept is a power-up card you collect mid-level, then use straight away in puzzle rounds. Wrong answers explain themselves, so mistakes are how you learn.

Live site: https://vivek0803.github.io/Dagdeep/

## How it plays

- **World map** with two worlds and 26 zones. Rank, XP, day streak and collected cards show on the map.
- **Zones** have a short story mission, a path of levels that unlock in order, and a **card deck** of every concept you've collected.
- **Levels** have 3 hearts, a streak multiplier, and a feedback sheet after every round that teaches the why. Stars = hearts left.
- **Round types:** concept power-up, pick, sort (one card at a time into buckets), order the steps, match pairs, fill the code blanks, spot the bug, and true/false speed rounds.
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
      ["tf", "Prompt", [["statement", true, "why"]]]
    ]},
    {t: "Boss", boss: true, time: 30, rounds: [/* ... */]},
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
