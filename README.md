# Data Flow Explorer

A learning site for data and AI engineers:

- **Data flows** – animated, step-by-step views of how data moves through MySQL (InnoDB), Apache Iceberg, and a MySQL → Debezium → Kafka → Flink → Iceberg CDC pipeline.
- **Roadmaps** – Data Engineer, AI Engineer and Forward Deployed Engineer roadmaps with a visual map, deep-dive chapters, flow diagrams, worked examples and interview questions.
- **Courses** – *LLM Fundamentals, played*: 20 lessons with interactive labs, quizzes, XP, streaks, badges and a final project, ending with a full production-readiness unit.

It is a static site: plain HTML, CSS and JavaScript with no build step. Progress is saved in the visitor's browser.

## Files

| File | What it is |
|---|---|
| `index.html` | The page, styles and core logic |
| `roadmaps.js`, `roadmap-extras.js`, `deep-de-*.js`, `advanced-de-*.js` | Roadmap content |
| `course-*.js` | The LLM course content, engine and labs |
| `config.js` | Site settings (optional live-model endpoint) |
| `api/worker.js` | Optional serverless proxy for live LLM labs |

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
