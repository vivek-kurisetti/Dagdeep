QUEST.deep("rag", {
"Two phases": {
d: `**Indexing (offline / continuous)**: load sources (PDFs, Confluence, tickets, DB rows) → clean and extract text (tables, headings) → **chunk** → **embed** each chunk → store vector + text + **metadata** (source URL, section, updated_at, access groups) in a vector store, often alongside a keyword index.

**Query (online)**: (optionally rewrite the question) → embed it → **retrieve** top-k chunks (vector, keyword or hybrid, filtered by metadata/permissions) → **rerank** → build a prompt with the chunks and instructions ("answer only from context, cite sources, say you don't know") → **generate** → post-process (citations, guardrails).

Most quality problems are indexing problems: bad extraction, bad chunking, missing metadata, stale documents.`,
life: `A library: indexing is cataloguing every book into cards by topic. Answering a question is pulling the right cards, fetching those pages, and then writing an answer from them.`,
work: `An internal "ask the runbook" bot answered wrongly 30% of the time. Investigation: PDF tables were extracted as jumbled text, and half the chunks had no section titles. Switching to a layout-aware parser and prefixing each chunk with its document and heading path fixed most failures before touching the LLM or prompt.`,
ex: `# index
for doc in load_docs():
    for ch in chunk(doc.text, size=800, overlap=120):
        vec = embed(f"{doc.title} > {ch.heading}\\n{ch.text}")
        store.upsert(id=ch.id, vector=vec, text=ch.text,
                     meta={"src": doc.url, "acl": doc.groups, "updated": doc.updated})
# query
hits = store.search(embed(q), k=40, filter={"acl": {"$in": user.groups}})
ctx = rerank(q, hits)[:6]
answer = llm(prompt(q, ctx))`,
pit: [`Blaming the LLM for retrieval/indexing problems.`, `No metadata for filtering or citations.`, `Indexing once and never updating.`],
q: [`Name the two phases of RAG and what happens in each.`, `Indexing: parse, chunk, embed, store with metadata. Query: embed question, retrieve (+rerank), prompt with context, generate.`]
},
"Why RAG": {
d: `An LLM knows only what was in its training data (up to a cutoff) and nothing about your private documents. RAG supplies the right text **at query time**. Benefits:
- **Fresh**: update the index, not the model.
- **Grounded & citable**: answers point to sources users can check, reducing hallucination.
- **Access control**: retrieve only documents the user is allowed to see (permission filters at retrieval).
- **Cheaper than training**: no GPUs to retrain when docs change.

Fine-tuning complements it: use fine-tuning for **behaviour** (format, tone, domain phrasing), RAG for **knowledge**. Long-context models don't remove the need: stuffing everything is costly, slow, and recall degrades with length.`,
life: `An open-book exam: you don't memorise the whole textbook; you know how to find the right page and answer from it, and you can show the page.`,
work: `A KYC policy assistant was first fine-tuned on policy docs; when RBI guidelines changed, it kept quoting old rules for weeks until retrained. A RAG version indexed the current circulars, showed citations, and was updated within an hour of a new circular being published.`,
ex: `SYSTEM: Answer only from the <context>. If the answer isn't there, say "I couldn't find this in the policy documents". Cite sources as [n].
<context>
[1] (KYC Master Direction §38, updated 2026-10-02) ...
[2] ...
</context>
QUESTION: What documents are needed for re-KYC of a small account?`,
pit: [`Fine-tuning for knowledge that changes.`, `Assuming long context makes retrieval unnecessary.`, `No "I don't know" path.`],
q: [`Where should access control be enforced in RAG?`, `At retrieval: filter chunks by the user's permissions before they ever reach the prompt.`]
},
"Chunking strategies": {
d: `Chunks are the unit of retrieval. Too big: embeddings blur several topics together and you waste context. Too small: chunks lose the context needed to answer ("it must be submitted within 30 days": what must?).

Approaches:
- **Fixed size** (e.g. 400–1,000 tokens) with **overlap** (10–20%): simple baseline.
- **Recursive / structure-aware**: split by headings → paragraphs → sentences; keep tables and code blocks intact.
- **Semantic chunking**: split where embedding similarity between sentences drops.
- **Parent-child (small-to-big)**: index small chunks for precise matching, return the larger parent section to the LLM.
- **Contextual chunk headers**: prepend document title and heading path (or an LLM-generated context sentence) to each chunk before embedding.

Tune chunk size against a retrieval eval set, not by intuition.`,
life: `Cutting a textbook into flashcards: one card per paragraph with the chapter name on top works; cutting mid-sentence or putting a whole chapter on one card doesn't.`,
work: `A FAQ bot with 2,000-token chunks had recall@5 of 61%. Switching to heading-aware ~500-token chunks with the heading path prepended raised it to 84%; parent-child retrieval (match on 200-token children, return 1,200-token parents) pushed answer accuracy up another 6 points.`,
ex: `from langchain_text_splitters import RecursiveCharacterTextSplitter
splitter = RecursiveCharacterTextSplitter(
    chunk_size=2000, chunk_overlap=300,           # characters ≈ 500 tokens
    separators=["\\n## ", "\\n### ", "\\n\\n", "\\n", ". ", " "])
chunks = [f"{doc.title} > {h}\\n{t}" for h, t in split_with_headings(doc, splitter)]`,
pit: [`Splitting tables row by row without headers.`, `No overlap, so answers that cross a boundary are lost.`, `One chunk size for every document type.`],
q: [`What problem does parent-child chunking solve?`, `Small chunks match precisely but lack context; returning their parent section gives the LLM enough surrounding text.`]
},
"Embeddings and similarity": {
d: `An **embedding model** maps text to a vector (e.g. 768–3,072 dimensions) so that texts with similar meaning are close. Similarity is usually **cosine similarity** (angle between vectors), or dot product on normalised vectors (equivalent).

Things that matter in practice:
- **Model choice**: domain and language coverage (Hindi/Telugu/Hinglish?), max input length, dimension (storage cost), speed. Check leaderboards (MTEB) and, more importantly, your own eval.
- **Query vs document prompts**: many models expect prefixes like «query:» / «passage:» or have separate modes.
- **Same model for indexing and querying**; changing the model means **re-embedding everything**.
- **Matryoshka** embeddings let you truncate dimensions to save storage with small quality loss.
- Embeddings capture meaning, not exact strings: error codes and IDs are weak points (use hybrid search).`,
life: `Placing every book on a giant map where books about similar topics sit near each other. A question is dropped on the map, and you pick up the nearest books.`,
work: `An English-only embedding model gave recall@10 of 52% on Hinglish merchant queries ("settlement nahi aaya"). A multilingual model raised it to 81%. Storage was a concern at 3,072 dims; truncating Matryoshka embeddings to 1,024 dims cost only 1.5 points of recall and cut index size by 3×.`,
ex: `import numpy as np
def cos(a, b): return float(a @ b / (np.linalg.norm(a) * np.linalg.norm(b)))
q = embed("query: settlement not received")
d1 = embed("passage: Settlements are credited T+1 ...")
d2 = embed("passage: How to change your password ...")
print(cos(q, d1), cos(q, d2))   # d1 should be higher`,
pit: [`Mixing embeddings from two models in one index.`, `Ignoring the model's required prefixes.`, `Assuming embeddings handle exact IDs well.`],
q: [`You switch embedding models. What must you do with the index?`, `Re-embed all documents with the new model; vectors from different models aren't comparable.`]
},
"Vector indexes": {
d: `Exact (flat) search compares the query with every vector: perfect recall, but O(N) per query. At millions of vectors, you use **approximate nearest neighbour (ANN)** indexes:
- **HNSW**: a layered proximity graph; very fast, high recall, more memory; supports incremental inserts. The common default (pgvector, OpenSearch, Qdrant, Weaviate, Milvus).
- **IVF**: cluster vectors into lists; search only the nearest «nprobe» clusters. Needs training on data; good with **PQ** compression for huge datasets.
- **DiskANN / ScaNN**: disk-friendly or highly optimised variants.

Choose a store by operations, not just speed: **metadata filtering** (and how it combines with ANN), hybrid search support, updates/deletes, multi-tenancy, backups, cost. pgvector in Postgres is often enough up to tens of millions of vectors.`,
life: `Finding the nearest restaurants: checking every restaurant in India (exact) vs asking neighbours who know nearby places and hopping toward the best area (graph-based ANN).`,
work: `A team started with a flat index in a notebook (3 s per query at 2 M chunks). Moving to pgvector with HNSW («m=16, ef_construction=64», «ef_search=80») gave 15 ms queries at 97% recall@10 vs exact, while keeping chunks, metadata and ACLs in the same Postgres they already ran.`,
ex: `CREATE EXTENSION vector;
CREATE TABLE chunks (id bigserial PRIMARY KEY, doc_id bigint, acl text[],
                     body text, embedding vector(1024));
CREATE INDEX ON chunks USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
SET hnsw.ef_search = 80;
SELECT id, body FROM chunks WHERE acl && ARRAY['support']
ORDER BY embedding <=> $1 LIMIT 20;`,
pit: [`Picking a vector DB before knowing filtering/update needs.`, `Never measuring ANN recall vs exact.`, `Filters that make ANN return too few results (post-filtering).`],
q: [`What's the trade-off of ANN indexes?`, `Much faster search in exchange for slightly lower recall than exact search (tunable).`]
},
"Hybrid search": {
d: `**Dense (vector) retrieval** understands meaning and paraphrases but is weak on exact tokens: error codes («E-4012»), SKUs, names, acronyms, numbers. **Sparse/keyword retrieval** (BM25, or learned sparse like SPLADE) is the opposite: exact terms match strongly, synonyms don't.

**Hybrid search** runs both and fuses the ranked lists, usually with **Reciprocal Rank Fusion** (rank-based, no score calibration needed) or a weighted sum of normalised scores. It consistently beats either alone on real enterprise queries, which mix natural language with identifiers.

Many stores support it natively (OpenSearch, Elasticsearch, Weaviate, Qdrant, Vespa), or you can combine Postgres full-text + pgvector.`,
life: `Looking for a book by asking a librarian who understands what you mean (vector) and also checking the exact title catalogue (keyword), then combining both lists.`,
work: `Support agents searched "UPI error U30 refund". Vector-only search returned generic refund articles; the U30 page was #14. BM25 found it at #1 but missed paraphrased questions. Hybrid with RRF put the U30 page at #1 and kept good results for natural questions; recall@5 went from 71% to 89%.`,
ex: `-- Postgres: keyword + vector, fused in SQL (sketch)
WITH kw AS (SELECT id, row_number() OVER (ORDER BY ts_rank(tsv, q) DESC) r
            FROM chunks, plainto_tsquery('english', $1) q WHERE tsv @@ q LIMIT 50),
     vec AS (SELECT id, row_number() OVER (ORDER BY embedding <=> $2) r
            FROM chunks ORDER BY embedding <=> $2 LIMIT 50)
SELECT id, sum(1.0 / (60 + r)) AS score FROM (SELECT * FROM kw UNION ALL SELECT * FROM vec) x
GROUP BY id ORDER BY score DESC LIMIT 10;`,
pit: [`Vector-only search for ID-heavy domains.`, `Adding raw scores from different retrievers (different scales).`, `Not tokenising codes properly for BM25.`],
q: [`Why do vector embeddings struggle with "error E-4012"?`, `Exact codes carry little semantic meaning in embedding space; similar-looking codes and generic error text end up nearby.`]
},
"Rerank the candidates": {
d: `Retrieval should be **fast and wide**: get the top 30–100 candidates cheaply. Then a **reranker** orders them precisely and you keep the best 3–8 for the prompt.

A **cross-encoder** reranker reads the query and a candidate **together** in one transformer pass and outputs a relevance score. Because it sees both texts jointly (word-level interactions), it's much more accurate than comparing two independent embeddings, but too slow to run over the whole corpus, hence the two-stage design.

Options: hosted rerank APIs (Cohere, Voyage, Jina), open models (bge-reranker, mxbai-rerank), or an LLM as reranker (expensive). Typical gains: +10–20 points of precision@5.`,
life: `A recruiter quickly shortlists 50 CVs by keywords (retrieval), then a hiring manager reads each shortlisted CV carefully against the job (rerank) and picks the top 5.`,
work: `Answers often used the right document but the wrong section: the right chunk was in the top 20 but at rank 9. Adding a cross-encoder over the top 40 moved the right chunk to the top 3 in 87% of eval questions (from 58%). Latency rose 120 ms, acceptable; they sent only 5 chunks to the LLM, cutting prompt tokens 40%.`,
ex: `from sentence_transformers import CrossEncoder
rr = CrossEncoder("BAAI/bge-reranker-v2-m3")
cands = hybrid_search(q, k=40)
scores = rr.predict([(q, c.text) for c in cands])
top = [c for _, c in sorted(zip(scores, cands), key=lambda x: -x[0])][:5]`,
pit: [`Reranking too few candidates (nothing to fix if the right one wasn't retrieved).`, `Sending 20 chunks to the LLM instead of reranking.`, `Ignoring reranker latency in the budget.`],
q: [`Why not use the cross-encoder for the whole corpus?`, `It needs one model pass per (query, document) pair at query time, far too slow for millions of documents; bi-encoder vectors are precomputed.`]
},
"Lost in the middle": {
d: `Research and practice show LLMs use information at the **beginning and end** of a long context more reliably than information buried in the **middle**, and accuracy drops as irrelevant text (distractors) increases.

So for RAG prompts:
- Send **fewer, better** chunks (rerank, then top 3–8), not everything retrieved.
- Put the **most relevant** chunk first (or nearest the question).
- Put **instructions and the question** clearly, often at the end after the documents for long contexts.
- Label chunks with ids and sources; ask the model to **quote/cite** the supporting passage before answering, which forces it to locate evidence.
- Remove duplicates and boilerplate (headers/footers repeated in every chunk).`,
life: `Reading a 40-page brief the night before a meeting: you remember the first and last pages best. A good assistant gives you the three key pages, best one on top.`,
work: `With 20 chunks per prompt, the bot answered correctly 71% of the time even when the right chunk was included; it often used a nearby but wrong chunk. Reducing to 6 reranked chunks, ordering by score, and requiring «quote then answer» lifted accuracy to 86% and cut cost per query by half.`,
ex: `<documents>
<doc id="1" src="settlement-faq.md#t1">... most relevant ...</doc>
<doc id="2" src="...">...</doc>
</documents>
First, copy the exact sentences from the documents that answer the question inside <quotes>. Then answer using only those quotes, citing [id]. If no quote answers it, say you don't know.
Question: When are weekend settlements credited?`,
pit: [`Stuffing top-20 chunks "to be safe".`, `Putting the question before 30k tokens of context with no restatement.`, `Repeated boilerplate in every chunk.`],
q: [`Why can adding more retrieved chunks lower accuracy?`, `More distractors and longer context; the model may miss or misuse the relevant passage, especially in the middle.`]
},
"Evaluate retrieval and generation separately": {
d: `A wrong answer can come from **retrieval** (the right text never reached the prompt) or **generation** (it was there but the model ignored it or hallucinated). Measure them separately:

**Retrieval** (needs a labelled set of question → relevant chunk/doc ids): recall@k, precision@k, MRR, nDCG. Context recall/precision variants judge with an LLM.

**Generation**:
- **Faithfulness / groundedness**: every claim is supported by the retrieved context.
- **Answer relevance**: it addresses the question.
- **Correctness** vs a reference answer.
- **Citation accuracy**, refusal correctness ("don't know" when it shouldn't answer).

Build a **golden set** of 100–500 real questions with labels; run it on every change (chunking, model, prompt) in CI. Tools: Ragas, DeepEval, LangSmith, Phoenix, TruLens; LLM judges calibrated on human labels.`,
life: `If a student answers wrongly in an open-book test, check: did they open the right page (retrieval) or misread the right page (generation)? The fix is different.`,
work: `Changing the LLM didn't improve a bot stuck at 74% correct. Splitting the eval showed recall@6 was only 78%: most wrong answers had no relevant chunk. Fixing chunking and adding hybrid search raised recall@6 to 93% and correctness to 88% with the same LLM.`,
ex: `def recall_at_k(results, gold, k=6):
    return sum(any(r in gold[q] for r in results[q][:k]) for q in gold) / len(gold)
# generation: LLM judge
JUDGE = """Given CONTEXT and ANSWER, list each claim in ANSWER and mark it SUPPORTED or NOT.
Return JSON {"supported": n, "total": m}."""`,
pit: [`Only end-to-end "looks good" checks.`, `Golden sets built from synthetic questions that don't match real users.`, `Uncalibrated LLM judges.`],
q: [`Recall@6 is 60% and faithfulness is 95%. Where should you work?`, `Retrieval: answers are faithful to what's retrieved, but the right context is often missing.`]
},
"Bi-encoders vs cross-encoders": {
d: `**Bi-encoder**: query and document are encoded **separately** into vectors; relevance = dot product / cosine. Documents can be encoded once and indexed, so search over millions is fast (with ANN). But the model never sees query and document together, so fine-grained interactions are lost ("not" negations, which entity the question is about).

**Cross-encoder**: the query and document are concatenated and passed through the model **together**; attention connects every query word with every document word, producing one relevance score. Much more accurate, but you must run it for every pair at query time, so it's only viable on a short candidate list.

**Late interaction** (ColBERT): stores a vector per token and scores with MaxSim; a middle ground with higher storage.`,
life: `Bi-encoder: judging matches by comparing two separately written profiles. Cross-encoder: putting both people in one room and watching how they actually interact. Better judgment, but you can't do it for everyone.`,
work: `Interview answer framing: "We retrieve 50 candidates with a bi-encoder + BM25 in ~20 ms, then rerank with a cross-encoder in ~100 ms on GPU, keeping 5. Using a cross-encoder alone over 4 M chunks would take hours per query."`,
ex: `# bi-encoder: precompute
doc_vecs = bi.encode(docs, normalize_embeddings=True)       # once
scores = doc_vecs @ bi.encode(q, normalize_embeddings=True)  # fast
# cross-encoder: per pair at query time
scores = ce.predict([(q, d) for d in top50])`,
pit: [`Expecting bi-encoders to understand negation well.`, `Running cross-encoders over large candidate sets.`, `Using a reranker trained for a different language.`],
q: [`Why can documents be pre-indexed with a bi-encoder but not a cross-encoder?`, `Bi-encoder document vectors don't depend on the query; cross-encoder scores require the query and document together.`]
},
"HNSW and IVF": {
d: `**HNSW** (Hierarchical Navigable Small World): vectors are nodes in a multi-layer graph. Upper layers are sparse "highways", the bottom layer contains all nodes. Search starts at an entry point in the top layer, greedily moves to closer neighbours, drops a layer, repeats, and finally explores the bottom layer with a candidate list of size «ef_search».
- «M»: links per node (more = better recall, more memory).
- «ef_construction»: build-time candidate list (better graph, slower build).
- «ef_search»: query-time candidate list (recall vs latency knob).

**IVF** (inverted file): k-means clusters vectors into «nlist» lists; a query searches the «nprobe» closest centroids' lists. Needs training; with **PQ** (product quantization) vectors are compressed (e.g. 32× smaller) for billion-scale indexes at some recall cost.`,
life: `HNSW: flights between big hubs, then trains between cities, then walking in the neighbourhood. IVF: the city divided into districts; you only search the few districts closest to where you think the address is.`,
work: `At 50 M vectors, HNSW in memory needed ~250 GB RAM. Switching to IVF-PQ («nlist=16384, m=64») fit in 30 GB with recall@10 of 0.92 (vs 0.98 HNSW); adding a rerank step on full-precision vectors for the top 100 recovered recall to 0.97.`,
ex: `import faiss
d = 1024
quant = faiss.IndexFlatIP(d)
index = faiss.IndexIVFPQ(quant, d, 16384, 64, 8)   # nlist, m, bits
index.train(sample_vecs); index.add(all_vecs)
index.nprobe = 32
D, I = index.search(q_vecs, 100)`,
pit: [`Default ef_search too low for required recall.`, `IVF trained on a non-representative sample.`, `Never benchmarking recall vs flat search.`],
q: [`Which HNSW parameter trades recall for latency at query time?`, `ef_search.`]
},
"Reciprocal Rank Fusion": {
d: `Different retrievers produce scores on different scales (BM25 scores ~0–30, cosine 0–1), so adding raw scores is meaningless. **RRF** uses only **ranks**:

«RRF(d) = Σ over retrievers 1 / (k + rank_i(d))», with k ≈ 60.

A document ranked 1st by BM25 and 3rd by vectors gets 1/61 + 1/63; one ranked 1st by only one retriever gets 1/61. Documents that appear high in **several** lists rise to the top. k dampens the influence of top ranks (higher k = flatter weighting). It's simple, robust, needs no training, and is the default hybrid fusion in many systems. You can add weights per retriever if one is consistently better.`,
life: `Two friends each rank their top restaurants. A place both friends rank highly beats a place only one friend loves, and you never need to compare their rating scales.`,
work: `A weighted sum of normalised BM25 and cosine scores needed retuning every time the corpus changed. Switching to RRF (k = 60) gave equal or better nDCG@10 on all three eval sets and removed the tuning work.`,
ex: `def rrf(lists, k=60):
    scores = {}
    for lst in lists:
        for rank, doc in enumerate(lst, start=1):
            scores[doc] = scores.get(doc, 0) + 1 / (k + rank)
    return sorted(scores, key=scores.get, reverse=True)
fused = rrf([bm25_ids, vector_ids])`,
pit: [`Adding raw scores from different retrievers.`, `Using k = 0 (top-rank dominance).`, `Fusing very short lists (missing documents get no credit).`],
q: [`Doc A: rank 1 in BM25 only. Doc B: rank 2 in both lists. Which wins with k = 60?`, `B: 2/62 ≈ 0.0323 vs A: 1/61 ≈ 0.0164.`]
},
"Keep the index correct": {
d: `The vector index is a **derived dataset**: it must follow its sources like any pipeline output.
- **Updates**: when a document changes, re-chunk and re-embed it, and **remove** old chunks (stable chunk ids per doc + version, or delete-by-doc-id then insert).
- **Deletes**: removed documents must disappear from the index fast, or the bot quotes withdrawn policies.
- **Permissions**: ACL changes (someone leaves a team) must propagate to metadata filters; consider filtering at query time against the live permission system for sensitive data.
- **Model changes**: re-embedding everything; run old and new indexes side by side and switch atomically (alias).
- **Freshness monitoring**: lag between source update and index update; counts per source vs source of truth.

Event-driven sync (CDC, webhooks) beats nightly full rebuilds for large corpora.`,
life: `A library catalogue must remove cards for books that were withdrawn and update cards for new editions; otherwise readers go looking for books that don't exist or read outdated ones.`,
work: `An HR bot kept answering with the old leave policy for 3 weeks after it was replaced, because the nightly job only upserted new documents and never deleted chunks of removed ones. Adding doc-level versioning (delete all chunks for doc_id, then insert) and a weekly reconciliation (index doc ids vs Confluence) fixed it.`,
ex: `def sync(doc):
    store.delete(filter={"doc_id": doc.id})
    if doc.deleted: return
    chunks = chunk(doc)
    store.upsert([{"id": f"{doc.id}:{doc.version}:{i}", "vector": embed(c),
                   "meta": {"doc_id": doc.id, "acl": doc.acl, "version": doc.version}}
                  for i, c in enumerate(chunks)])`,
pit: [`Insert-only pipelines (stale and deleted content stays).`, `ACLs captured once at index time and never updated.`, `Re-embedding in place without a rollback path.`],
q: [`Why use per-document delete-then-insert instead of only upserting chunks?`, `A changed document may produce fewer chunks; upserts alone leave orphaned old chunks behind.`]
},
"Ranking metrics": {
d: `With labelled relevance for each query:
- **Recall@k**: fraction of all relevant items that appear in the top k. "Did we get the evidence at all?" Most important for RAG retrieval.
- **Precision@k**: fraction of the top k that are relevant. "How much noise do we send to the LLM?"
- **MRR** (mean reciprocal rank): average of 1 / rank of the **first** relevant result. Good when one answer chunk is enough.
- **nDCG@k**: rewards relevant items more when they're near the top, supports graded relevance (2 = perfect, 1 = partial); normalised by the ideal ordering.
- **Hit rate@k**: share of queries with at least one relevant item in top k.

Report them per query type (IDs, how-to, policy) to find weak spots.`,
life: `Judging a search engine: did the right page appear on page one (recall/hit rate), how many results were junk (precision), and was the best page first or fifth (MRR/nDCG)?`,
work: `Overall MRR was 0.71, but slicing by query type showed "error code" queries at 0.38. That one slice drove the decision to add BM25 hybrid search, which lifted it to 0.82 without changing other slices.`,
ex: `import math
def mrr(ranked, gold):
    for i, d in enumerate(ranked, 1):
        if d in gold: return 1 / i
    return 0
def ndcg(ranked, rel, k=10):
    dcg = sum(rel.get(d, 0) / math.log2(i + 1) for i, d in enumerate(ranked[:k], 1))
    ideal = sum(r / math.log2(i + 1) for i, r in enumerate(sorted(rel.values(), reverse=True)[:k], 1))
    return dcg / ideal if ideal else 0`,
pit: [`Reporting only an average across very different query types.`, `Using precision when recall is what matters for RAG.`, `Small eval sets with no confidence intervals.`],
q: [`First relevant result is at rank 4. What's the reciprocal rank?`, `0.25.`]
}
});
