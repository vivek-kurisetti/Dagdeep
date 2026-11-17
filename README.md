# Dagdeep

**Learn data and AI engineering by playing.** Every lesson is a hands-on lab: drag sliders, run simulations, break pipelines on purpose and fix them, then beat a challenge for XP.

Live site: https://vivek0803.github.io/Dagdeep/

## Courses

| Course | Level | What you play with |
|---|---|---|
| **LLM Fundamentals, played** | Beginner | Tokens, sampling, prompts, JSON, evals, cost, latency, then a production unit: retries and fallbacks, prompt injection, tracing, safe releases, architecture. Prompt labs can call a live model. |
| **Spark Internals, played** | Intermediate | Job counting, partition planning and small files, stage boundaries, shuffle simulator, join strategy game, skew fixer, executor tuner, and a final "rescue the nightly job" project. |
| **Kafka & Streaming, played** | Intermediate | Log playground, key/ordering game, broker crash test, consumer group balancer, crash lab for delivery guarantees, schema compatibility, watermark tuner, checkpoint tuner, exactly-once sink designer, and a launch-day drill. |

Plus the **Data flow player**: animated, step-by-step views of a write through MySQL (InnoDB), Apache Iceberg, and a MySQL → Debezium → Kafka → Flink → Iceberg CDC pipeline.

XP, levels, streaks and badges are shared across courses; progress is saved per course in the visitor's browser.

## Files

| File | What it is |
|---|---|
| `index.html` | The page, styles, data-flow player and routing |
| `course-engine.js` | Course engine: catalog, course map, lessons, quizzes, XP, badges, LLM labs |
| `course-llm-content.js`, `course-llm-prod.js`, `course-prod-labs.js` | LLM course content and production labs |
| `course-spark.js` | Spark course content and labs |
| `course-kafka.js` | Kafka & Streaming course content and labs |
| `config.js` | Site settings (optional live-model endpoint) |
| `api/worker.js` | Optional serverless proxy for live LLM labs |

## Adding a course

Create `course-<id>.js` that registers `window.COURSES.<id> = {id, title, short, tagline, story, hue, level, hours, order, units:[...]}` and adds its labs to `window.COURSE_LABS`, then add a `<script>` tag after `course-engine.js` in `index.html`. Each lesson has `title, mins, sum, mission, body` (Markdown-like text with `:::flow`, `:::lanes`, `:::tip` blocks and tables), `lab, labTitle, challenge` and `take`; quizzes use `kind:"quiz"` with `questions`; a final project uses `kind:"boss"`.

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy (pick one)

### Option A: Netlify Drop (about 2 minutes, no account setup)
1. Go to https://app.netlify.com/drop
2. Drag this whole folder onto the page.
3. You get a public URL immediately. Sign in to keep it and rename the subdomain.

### Option B: GitHub Pages (free, deploys on every push)
1. Create a new repository, for example `data-flow-explorer`, and push these files to `main`.
2. In the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The included workflow (`.github/workflows/pages.yml`) publishes the site to
   `https://<your-username>.github.io/<repo-name>/` (for this repo: https://vivek0803.github.io/Dagdeep/).

```bash
git init && git add . && git commit -m "Data Flow Explorer"
git branch -M main
git remote add origin https://github.com/<your-username>/data-flow-explorer.git
git push -u origin main
```

### Option C: Cloudflare Pages or Vercel
Import the repository and set the build command to *none* and the output directory to `/` (the repository root).

## Live model in the course labs (optional)

Without configuration, the four prompt labs run on a built-in simulator. To use a real model on your public site:

1. Create a Cloudflare Worker and paste in `api/worker.js` (or `npx wrangler deploy`).
2. Set the worker's variables:
   - `API_KEY` (secret): your Anthropic or Groq API key
   - `PROVIDER`: `anthropic` or `groq`
   - `MODEL`: for example `claude-haiku-5-5` or `llama-3.3-70b-versatile`
   - `ALLOWED_ORIGIN`: your site URL, for example `https://yourname.github.io`
3. Optional: bind a KV namespace as `RATE_KV` to enable per-visitor rate limiting.
4. Put the worker URL in `config.js` as `llmEndpoint` and redeploy the site.

**Never put an API key in `config.js` or any front-end file**: anything shipped to the browser is public. The worker keeps the key server-side, limits prompt size and output tokens, restricts which site can call it, retries transient errors with backoff and jitter, and can rate-limit visitors.

## Production checklist

- [x] Static, no build step; works on any static host
- [x] SEO and social meta tags, favicon
- [x] Responsive down to 360 px; respects reduced-motion settings
- [x] Progress stored per browser with safe fallbacks
- [x] API key kept server-side behind a proxy with origin check, size caps, retries and rate limiting
- [ ] Add your own domain in your host's settings
- [ ] Set a monthly spending limit with your model provider
