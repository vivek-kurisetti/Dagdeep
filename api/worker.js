/**
 * LLM proxy for Data Flow Explorer (Cloudflare Worker).
 *
 * The browser sends {"prompt": "..."}; this worker adds your secret API key,
 * calls the model provider, and returns {"text": "..."}. The key never reaches the browser.
 *
 * Secrets / variables (set in the Cloudflare dashboard or with `wrangler secret put`):
 *   PROVIDER        "anthropic" (default) or "groq"
 *   API_KEY         your provider API key            (secret)
 *   MODEL           e.g. "claude-haiku-5-5" or "llama-3.3-70b-versatile"
 *   ALLOWED_ORIGIN  your site URL, e.g. "https://yourname.github.io"
 * Optional KV binding RATE_KV enables a simple per-IP limit (30 requests / 10 minutes).
 */
const MAX_PROMPT_CHARS = 6000;
const MAX_TOKENS = 400;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = env.ALLOWED_ORIGIN || "";
    const cors = {
      "Access-Control-Allow-Origin": allowed || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return json({ error: "POST only" }, 405, cors);
    if (allowed && origin !== allowed) return json({ error: "origin not allowed" }, 403, cors);

    // Simple per-IP rate limit (optional KV namespace bound as RATE_KV)
    if (env.RATE_KV) {
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      const key = "rl:" + ip + ":" + Math.floor(Date.now() / 600000);
      const n = parseInt((await env.RATE_KV.get(key)) || "0", 10);
      if (n >= 30) return json({ error: "rate limited, try again in a few minutes" }, 429, cors);
      await env.RATE_KV.put(key, String(n + 1), { expirationTtl: 700 });
    }

    let body;
    try { body = await request.json(); } catch { return json({ error: "invalid JSON" }, 400, cors); }
    const prompt = String(body.prompt || "").slice(0, MAX_PROMPT_CHARS);
    if (!prompt.trim()) return json({ error: "empty prompt" }, 400, cors);

    try {
      const text = (env.PROVIDER || "anthropic") === "groq" ? await groq(prompt, env) : await anthropic(prompt, env);
      return json({ text }, 200, cors);
    } catch (e) {
      return json({ error: "upstream error" }, 502, cors);
    }
  }
};

async function anthropic(prompt, env) {
  const r = await fetchWithRetry("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env.API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: env.MODEL || "claude-haiku-5-5", max_tokens: MAX_TOKENS, messages: [{ role: "user", content: prompt }] })
  });
  const j = await r.json();
  return (j.content || []).map(c => c.text || "").join("");
}

async function groq(prompt, env) {
  const r = await fetchWithRetry("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": "Bearer " + env.API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ model: env.MODEL || "llama-3.3-70b-versatile", max_tokens: MAX_TOKENS, temperature: 0.2, messages: [{ role: "user", content: prompt }] })
  });
  const j = await r.json();
  return j.choices?.[0]?.message?.content || "";
}

// Timeout + retry with exponential backoff and jitter on 429 / 5xx (Unit 5, lesson 16).
async function fetchWithRetry(url, opts, retries = 2) {
  for (let attempt = 0; ; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 20000);
    try {
      const r = await fetch(url, { ...opts, signal: ctl.signal });
      if (r.ok) return r;
      if (!(r.status === 429 || r.status >= 500) || attempt >= retries) throw new Error("status " + r.status);
    } catch (e) {
      if (attempt >= retries) throw e;
    } finally { clearTimeout(timer); }
    await new Promise(res => setTimeout(res, 500 * 2 ** attempt + Math.random() * 400));
  }
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: { ...headers, "content-type": "application/json" } });
}
