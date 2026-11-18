QUEST.zone("rag", {
mission:["kai","The support assistant must answer from 40,000 pages of merchant docs and policies. That's retrieval-augmented generation. Build the pipeline piece by piece, then pass the eval."],
levels:[
{t:"The RAG pipeline", sub:"Index, retrieve, generate", rounds:[
 ["learn","Two phases","**Indexing** (offline): load documents, split into chunks, embed each chunk, store vectors + text + metadata. **Query** (online): embed the question, retrieve similar chunks, put them in the prompt, generate a grounded answer with citations.",["Load","Chunk","Embed","Store","Retrieve","Generate"]],
 ["order","Order the indexing pipeline",["Load documents (PDF, HTML, Confluence)","Clean and split into chunks","Embed each chunk","Store vectors with text and metadata"],"Indexing runs offline and on updates."],
 ["learn","Why RAG","The model doesn't know your private or fresh data. RAG adds it at query time: no retraining, easy updates, citations, and access control at retrieval. Fine-tuning changes behaviour; RAG supplies **knowledge**."],
 ["sort","RAG or fine-tuning?",{"RAG":["Answer from today's policy docs","Cite the source page","Per-user document permissions"],"Fine-tuning":["Always reply in our strict JSON style","Teach a narrow classification behaviour"]},"Knowledge → RAG. Behaviour/format → tuning (or prompting)."],
 ["tf","Basics",[["Embeddings capture meaning, so 'refund' can match 'money back'.",true,"Semantic search."],["RAG removes all hallucinations.",false,"It reduces them; still instruct to answer only from context."],["Retrieval quality caps answer quality.",true,"Garbage in, garbage out."]]]
]},
{t:"Chunking & embeddings", sub:"Split well, embed right", rounds:[
 ["learn","Chunking strategies","**Fixed size** with overlap (e.g. 500–1,000 tokens, 10–20% overlap) is a baseline. **Structure-aware** splitting by headings/sections keeps meaning together. **Semantic** chunking splits where topics change. Add the doc title and section path to each chunk."],
 ["match","Problem → chunking fix",[["Answers miss context from the previous paragraph","Add overlap"],["Chunks mix two unrelated topics","Split on headings / semantic boundaries"],["Tables broken across chunks","Keep tables whole with their caption"],["Chunk text alone is ambiguous","Prepend doc title + section (contextual chunk headers)"]],"Chunking is where most RAG quality is won."],
 ["learn","Embeddings and similarity","An embedding model maps text to a vector; similar meaning → nearby vectors. Compare with **cosine similarity** (or dot product on normalized vectors). Use the **same model** for documents and queries; re-embed everything if you change it."],
 ["pick","You switched embedding models for new documents only. Retrieval got worse. Why?",["Vectors from different models live in different spaces","Chunk overlap too small","Temperature","Too many documents"],0,"Re-embed the whole corpus with one model."],
 ["learn","Vector indexes","Exact search compares every vector; **ANN** indexes trade a little recall for speed. **HNSW** (graph-based) is the common default; **IVF** clusters vectors. Stores: pgvector, OpenSearch, Pinecone, Qdrant, Weaviate, Milvus…"],
 ["tf","Embedding facts",[["Bigger chunks always retrieve better.",false,"They dilute meaning and waste context."],["HNSW is an approximate nearest-neighbour index.",true,"Tunable recall vs speed (ef_search)."],["Metadata filters (product, date, tenant) narrow retrieval.",true,"And enforce access control."]]]
]},
{t:"Better retrieval", sub:"Hybrid, rerank, rewrite", rounds:[
 ["learn","Hybrid search","Vectors miss exact terms (error codes, SKUs, names); keyword search (**BM25**) nails them. **Hybrid** runs both and fuses the ranked lists (e.g. **Reciprocal Rank Fusion**)."],
 ["learn","Rerank the candidates","Retrieve a wide set (e.g. top 50) quickly, then a **cross-encoder reranker** scores each (query, chunk) pair together and keeps the best 5–8. Much better precision for a small latency cost.",["Hybrid retrieve top 50","Rerank with a cross-encoder","Keep top 5–8","Build the prompt"]],
 ["match","Technique → fixes",[["BM25 / hybrid","Exact codes like ERR_4012 not found"],["Reranker","Right doc retrieved but ranked 30th"],["Query rewriting","Vague or conversational follow-up questions"],["Metadata filter","Answers from the wrong product or tenant"]],"Each fixes a different failure."],
 ["pick","User asks 'and what about for UPI?' after a refund question. Retrieval fails. Fix?",["Rewrite the follow-up into a standalone query using chat history","Bigger chunks","Lower temperature","More GPUs"],0,"Condense conversation into a self-contained query."],
 ["learn","Lost in the middle","Models attend best to the start and end of long contexts. Put the most relevant chunks first (or last), keep the count small, and ask the model to cite chunk ids."],
 ["sort","Improves precision or recall?",{"Recall (find it at all)":["Hybrid search","Query expansion / multi-query","Higher top-k"],"Precision (rank the best first)":["Cross-encoder reranking","Metadata filters"]},"Tune both, measure both."]
]},
{t:"Evaluating RAG", sub:"Measure, don't guess", rounds:[
 ["learn","Evaluate retrieval and generation separately","**Retrieval**: recall@k, MRR/nDCG on a labelled question → relevant chunk set. **Generation**: **faithfulness** (claims supported by retrieved context), **answer relevance**, correctness vs a reference. LLM-as-judge plus human spot checks."],
 ["match","Metric → question it answers",[["Context recall","Did we retrieve the facts needed?"],["Context precision","Is retrieved context mostly relevant?"],["Faithfulness","Is every claim backed by the context?"],["Answer relevance","Does it actually answer the question?"]],"Frameworks like Ragas compute these."],
 ["pick","Answers are fluent but cite facts not in the retrieved chunks. Which metric drops?",["Faithfulness","Context recall","Latency","Recall@k"],0,"Unsupported claims = low faithfulness."],
 ["order","Improve a RAG system safely",["Build a golden set of real questions + expected sources","Measure retrieval recall@k and answer faithfulness","Change one thing (chunking, hybrid, reranker)","Re-run the eval and compare","Ship only if metrics improve without regressions"],"Evals turn tuning into engineering."],
 ["tf","Eval facts",[["You can't evaluate RAG without labelled data.",false,"LLM-judged metrics work without references; labels make it stronger."],["Low context recall means generation tuning won't help much.",true,"Fix retrieval first."]]]
]},
{t:"Boss: Pass the eval", boss:true, time:30, rounds:[
 ["pick","Error code questions fail; vector search returns generic pages. Fix?",["Add BM25 hybrid search","Bigger chunks","Higher temperature","More GPUs"],0,"Exact-term matching."],
 ["pick","Correct page is in top 50 but rarely in top 5. Fix?",["Cross-encoder reranker","Lower top-k","New embedding model only","Fine-tune the LLM"],0,"Precision at the top."],
 ["pick","Merchants see answers from other merchants' docs. Fix?",["Tenant metadata filter enforced at retrieval","Prompt 'don't leak'","Smaller chunks","Rerank"],0,"Access control belongs in retrieval."],
 ["pick","Answers miss info split across chunk boundaries. Fix?",["Structure-aware chunking with overlap","Higher temperature","Fewer documents","BM25 only"],0,"Keep context together."],
 ["pick","Faithfulness 0.62: answers add unsupported claims. Fix?",["Instruct to answer only from context with citations, else say unsure","Raise top-k to 200","Remove the system prompt","Bigger chunks"],0,"Grounding instructions + citations."],
 ["pick","Policy doc updated; answers still use the old text. Fix?",["Re-index changed documents (incremental ingestion)","Lower temperature","Re-train the LLM","Rerank"],0,"Keep the index fresh."]
]}
]});

QUEST.more("rag", [
{act:"Expert", t:"Embedding models deep", sub:"Bi-encoders, dims, asymmetry", rounds:[
 ["learn","Bi-encoders vs cross-encoders","A **bi-encoder** embeds query and document **separately** into vectors; similarity is a cheap dot product, so documents can be pre-indexed. A **cross-encoder** reads (query, document) **together** and outputs a relevance score: much more accurate, but must run per pair at query time — hence reranking only the top candidates.",null,null,`### Choosing an embedding model
- **Domain and language**: test on your data; multilingual models for Indian languages + English mixes.
- **Dimensions**: 384–3,072 typical. More dims = more memory and slower search; **Matryoshka**-trained models let you truncate vectors (e.g. 1,024 → 256) with modest quality loss.
- **Asymmetric prompts**: many models expect prefixes like «query:» vs «passage:» (or task instructions). Using the wrong one hurts recall.
- **Normalization**: normalize to unit length so dot product = cosine similarity.
- **Max input length**: text beyond it is truncated silently — another reason chunk size matters.

### Late interaction
**ColBERT**-style models keep one vector per token and score with MaxSim between query and document tokens: better precision than single-vector, more storage.

### Fine-tuning embeddings
With (query, relevant passage) pairs from your logs or synthetic generation, contrastive fine-tuning (with hard negatives) can lift recall significantly on domain jargon (e.g. payments terms like MDR, chargeback, settlement).`],
 ["match","Model type",[["Bi-encoder","Pre-compute document vectors, fast search"],["Cross-encoder","Score query+document together for reranking"],["ColBERT","Per-token vectors with late interaction"],["Matryoshka embeddings","Truncate dimensions with little loss"]],"Speed vs accuracy at each stage."],
 ["pick","Recall dropped after switching models, though both are strong. Docs show the new model expects «query:» and «passage:» prefixes. Fix?",["Add the correct prefixes when embedding queries and documents (re-embed corpus)","Lower top-k","Use BM25 only","Increase chunk size"],0,"Asymmetric models need their instructions."],
 ["num","10 million chunks with 768-dim float32 vectors. Raw vector memory in GB (1 GB = 10⁹ bytes, 1 decimal)?",30.7,0.1,"GB","10,000,000 × 768 × 4 bytes = 30.72 GB before index overhead."],
 ["tf","Embedding truths",[["Cross-encoders can pre-compute document scores offline.",false,"They need the query."],["Text beyond the model's max length may be silently truncated.",true,"Chunk accordingly."]]]
]},
{act:"Expert", t:"Vector index internals", sub:"HNSW, IVF, quantization, filters", rounds:[
 ["learn","HNSW and IVF","**HNSW** builds a layered proximity graph; search greedily walks from a top-layer entry point down to the nearest neighbours. Knobs: «M» (links per node), «ef_construction» (build quality), «ef_search» (query breadth: recall vs latency). **IVF** clusters vectors into «nlist» buckets and searches the «nprobe» nearest buckets.",null,null,`### Memory and speed
- HNSW memory ≈ vectors + graph links (≈ M × 2 × 4 bytes per vector per layer-0 node). Fast and high-recall, but RAM-heavy and slower to build.
- IVF is lighter; recall depends on nprobe. Combine with **PQ** (product quantization) to compress vectors 8–32×.
- **Scalar quantization** (int8) ~4× smaller; **binary quantization** 32× smaller, usually paired with **rescoring** the top candidates using full-precision vectors.
- **DiskANN**-style indexes keep most data on SSD for billion-scale.

### Filtered search pitfalls
- **Post-filtering**: search top-k, then drop non-matching tenants → can return fewer than k results (or zero) for selective filters.
- **Pre-filtering**: restrict candidates first; exact for small subsets, but can break HNSW graph traversal efficiency.
- Good engines integrate filters into traversal or switch strategy by selectivity. For strict multi-tenancy, a **namespace/collection per tenant** avoids leaks and filter pathologies.

### Measure
Benchmark recall@k of the ANN index **against exact search** on your data and tune ef_search/nprobe to your latency budget.`],
 ["match","Knob → effect",[["ef_search (HNSW)","Higher recall, slower queries"],["M (HNSW)","More links: better recall, more memory"],["nprobe (IVF)","Search more clusters: higher recall, slower"],["Binary quantization + rescoring","32× smaller with near-original quality"]],"Tune against exact-search recall."],
 ["pick","Merchant-scoped searches sometimes return 0 results though matching docs exist. Index uses post-filtering. Why?",["Top-k candidates were all other merchants' docs, then filtered out","Embeddings broken","HNSW M too high","Chunk overlap"],0,"Use pre-filtering, filter-aware traversal or per-tenant namespaces."],
 ["sort","Saves memory or improves recall?",{"Saves memory":["Product quantization","Binary quantization","Matryoshka truncation"],"Improves recall":["Higher ef_search","Higher nprobe","Rescoring with full vectors"]},"Memory vs recall dial."],
 ["tf","Index truths",[["ANN recall should be measured against exact search.",true,"That's the ground truth."],["Post-filtering always returns k results.",false,"Selective filters can leave few or none."]]]
]},
{act:"Expert", t:"Advanced retrieval", sub:"RRF, contextual chunks, small-to-big", rounds:[
 ["learn","Reciprocal Rank Fusion","RRF merges ranked lists without calibrating scores: «score(d) = Σ 1 / (k + rank_i(d))», usually with k = 60. Documents ranked well by several retrievers rise to the top.",null,null,`### Contextual retrieval
Chunks lose context ("revenue grew 3%" — which company, which quarter?). **Contextual retrieval** prepends a short, generated description of where the chunk sits in its document before embedding and BM25 indexing. Combined with BM25 and reranking, this cut retrieval failures substantially in Anthropic's published experiments. Prompt caching makes generating those contexts cheap.

### Small-to-big (parent document)
Embed **small** chunks for precise matching, but return the **parent** section (or neighbouring chunks) to the model for context.

### Query transformations
- **Multi-query**: generate several rephrasings, retrieve for each, fuse with RRF.
- **HyDE**: generate a hypothetical answer, embed that, search — helps when questions and documents use different vocabulary.
- **Decomposition**: split multi-hop questions into sub-questions.
- **Routing**: send the question to the right index (policies vs API docs vs tickets).

### Structured and graph retrieval
For questions over entities and relationships ("which merchants share a settlement account with X?"), **text-to-SQL** or **GraphRAG** (entity/relationship graphs with community summaries) beat chunk search. **Agentic RAG** lets the model decide when and what to retrieve iteratively.`],
 ["num","A document is rank 1 in BM25 and rank 3 in vector search. RRF score with k = 60, multiplied by 1,000 (1 decimal)?",32.3,0.1,"×10⁻³","1/61 + 1/63 = 0.01639 + 0.01587 = 0.03227 → 32.3."],
 ["match","Technique → problem",[["Contextual retrieval","Chunks ambiguous without document context"],["Small-to-big","Precise match but answer needs surrounding text"],["HyDE","Questions use different words than docs"],["Decomposition","Multi-hop questions"],["Text-to-SQL","Aggregations over structured data"]],"Diagnose failures, then choose."],
 ["pick","Q: 'Total refunds for merchant 42 last month?' RAG over docs fails. Best approach?",["Route to a SQL tool over the payments DB","Bigger chunks","More rerankers","HyDE"],0,"Aggregations belong in SQL, not text retrieval."],
 ["tf","Retrieval truths",[["RRF needs scores from different retrievers to be calibrated.",false,"It uses ranks only."],["Small-to-big returns larger context than what was matched.",true,"Parent sections."]]]
]},
{act:"Expert", t:"Production RAG", sub:"Freshness, tenancy, latency", rounds:[
 ["learn","Keep the index correct","A production RAG index is a **derived dataset** that must track its sources: inserts, updates, **deletes** and **permission changes**.",null,null,`### Ingestion pipeline
- Change detection: CDC from source systems, webhooks, or periodic hashing of documents.
- Stable chunk ids (doc id + chunk index + content hash) → upsert changed chunks, delete removed ones. Without deletes, retired policies keep being cited.
- Store metadata: source URL, version, updated_at, ACLs, tenant, language, doc type.

### Access control
Enforce **document-level permissions at query time** (filters from the user's groups/tenant) or with per-tenant indexes. Never rely on the LLM to hide content it was given. Re-sync ACL changes quickly.

### Latency budget (typical)
Query rewrite 200–500 ms, embedding 20–50 ms, ANN search 10–50 ms, BM25 10–50 ms, reranking 100–400 ms, generation TTFT 300–1,000 ms + streaming. Parallelize retrievers; cache embeddings for frequent queries; cache answers for FAQs (semantic cache) carefully with permissions.

### Safety
Retrieved documents are **untrusted input**: they can carry prompt injections. Keep tools minimal for RAG answers, cite sources, and sanitize rendered output.`],
 ["order","Handle an updated policy document",["Detect the change (CDC/webhook/hash)","Re-chunk with stable chunk ids","Upsert changed chunks and delete removed ones","Update metadata (version, updated_at, ACL)","Verify retrieval returns the new text"],"Deletes matter as much as inserts."],
 ["sort","Belongs in code or in the prompt?",{"Code (enforced)":["Tenant filter on retrieval","Deleting retired documents","ACL sync"],"Prompt (guidance)":["Cite sources","Say you're unsure if context lacks the answer"]},"Security in code, behaviour in prompts."],
 ["pick","A retired refund policy keeps being cited. Most likely gap?",["Ingestion handles inserts/updates but not deletes","Embedding model","Reranker","Temperature"],0,"Delete stale chunks."],
 ["tf","Production truths",[["Semantic caches must respect permissions.",true,"Otherwise cached answers leak."],["Retrieved documents can contain prompt injections.",true,"Treat as untrusted."]]]
]},
{act:"Expert", t:"RAG evaluation deep", sub:"Metrics with maths", rounds:[
 ["learn","Ranking metrics","**Recall@k**: fraction of relevant items found in the top k. **MRR**: average of 1/rank of the first relevant item. **nDCG@k**: rewards relevant items near the top, with graded relevance and log discount.",null,null,`### Formulas
- Recall@k = |relevant ∩ top-k| / |relevant|
- Precision@k = |relevant ∩ top-k| / k
- MRR = (1/|Q|) Σ 1 / rank_first_relevant
- DCG@k = Σ rel_i / log2(i + 1); nDCG = DCG / ideal DCG

### Building a golden set
Sample real user questions (stratified by topic and difficulty), label the passages that answer them, and include **unanswerable** questions (the right behaviour is to abstain). 100–300 examples catch most regressions; grow it with production failures.

### Generation metrics
Faithfulness (claims supported by context), answer relevance, correctness vs reference, citation precision (cited chunks actually support the claim), abstention accuracy on unanswerable questions.

### Ablations
Change one component at a time (chunking → hybrid → reranker → prompt) and record both retrieval and generation metrics. Watch latency and cost alongside quality.`],
 ["num","3 queries; the first relevant result is at rank 1, 2 and 4. MRR (2 decimals)?",0.58,0.01,"","(1 + 0.5 + 0.25) / 3 = 0.583."],
 ["num","A question has 4 relevant chunks; top-5 retrieval contains 3 of them. Recall@5 (percent)?",75,0,"%","3 / 4 = 75%."],
 ["match","Metric",[["Recall@k","Did we find the relevant chunks at all?"],["MRR","How high is the first relevant result?"],["nDCG","Are the most relevant results near the top?"],["Abstention accuracy","Does it refuse when the answer isn't there?"]],"Use several, not one."],
 ["tf","Eval truths",[["Unanswerable questions belong in a RAG golden set.",true,"Abstaining is correct behaviour."],["Change several components at once to save time.",false,"You won't know what helped."]]]
]},
{act:"Expert", t:"Expert boss: RAG for 40,000 pages", boss:true, time:45, rounds:[
 ["pick","Payments jargon (MDR, TDR, settlement) retrieves poorly with a general embedding model. Fix?",["Fine-tune embeddings on domain query–passage pairs (plus hybrid search)","Bigger chunks","Lower ef_search","Temperature"],0,"Teach the vector space your domain."],
 ["pick","Vector RAM costs explode at 200M chunks. Fix?",["Quantization (int8/binary) with rescoring, or disk-based ANN","More replicas","Higher dims","Bigger M"],0,"Compress vectors."],
 ["pick","Tenant-filtered searches return too few results. Fix?",["Filter-aware search or per-tenant namespaces","Post-filtering with k=5","Drop filters","Rerank"],0,"Avoid post-filter starvation."],
 ["pick","Chunks like 'grew 12% QoQ' lack context and rank wrong. Fix?",["Contextual retrieval (prepend document context)","Smaller chunks","Remove BM25","Temperature 0"],0,"Give chunks context."],
 ["pick","MRR fell from 0.71 to 0.52 after a new chunker shipped. Next step?",["Roll back / ablate chunker settings against the golden set","Ship anyway","Change the LLM","Add more docs"],0,"Evals gate releases."],
 ["pick","Answers cite a deleted policy. Fix?",["Delete-aware incremental ingestion with stable chunk ids","Bigger reranker","Re-embed nightly with duplicates","Lower top-k"],0,"Sync deletes."],
 ["pick","'How many failed payments yesterday?' needs an exact number. Route to…",["SQL tool","Vector search","HyDE","GraphRAG"],0,"Structured data → SQL."]
]}
]);

QUEST.cards("rag", {
rag:{t:"Retrieval-augmented generation (RAG)", one:"Fetch the relevant pages from your own documents at question time and make the model answer only from them.",
 life:"An open-book exam. A student who didn't study bluffs confidently. Hand them the right textbook pages, ask them to quote the paragraph they used, and their answers become reliable.",
 how:["The model only knows its training data — not your policies, not last week's changes.","**Indexing** (offline): load documents → split into chunks → embed each chunk → store vector + text + metadata.","**Query** (online): embed the question → retrieve the most similar chunks (often hybrid with keywords) → rerank → put the top chunks in the prompt.","Instruct: answer **only from the provided context**, cite the chunk/section, and say 'I don't know' when the context doesn't contain the answer.","Evaluate retrieval and answers separately (did we fetch the right chunk? is the answer faithful to it?)."],
 ex:`Before RAG:
~~~
Q: How long do UPI refunds take?
Bot: UPI refunds are instant and guaranteed within 2 hours.      ← invented
~~~
After RAG:
~~~
<context>
[refunds_v7.pdf §3.2] UPI refunds are credited within 5–7 working days ...
</context>
Answer only from the context. Cite the section. If it isn't there, say so.

Bot: UPI refunds take 5–7 working days (refunds_v7.pdf §3.2).
~~~
| Need | RAG | Fine-tuning |
|---|---|---|
| Facts that change monthly | ✓ | ✗ |
| Citations | ✓ | ✗ |
| Per-user permissions | ✓ (filters) | ✗ |
| Fixed output style/format | ~ | ✓ |`,
 traps:["Retrieval quality caps answer quality: wrong chunks → confident wrong answers.","Without an 'I don't know' path, the model fills gaps with plausible text.","Retrieved documents are untrusted input (they can contain prompt injections)."],
 say:"RAG retrieves relevant chunks from our own data at query time and grounds the model's answer in them with citations. It's the right tool for knowledge that changes or is private; fine-tuning is for behaviour and format. I evaluate retrieval recall and answer faithfulness separately."},
chunking:{t:"Chunking", one:"How you cut documents into pieces decides whether the right piece can be found and understood.",
 life:"Turning a textbook into index cards for revision. Cut mid-table and one card says 'UPI' while the next says '5–7 days' — neither is useful. Keep each table on one card and write the chapter name at the top.",
 how:["Embedding models and prompts need bounded pieces; whole documents dilute meaning and waste tokens.","Baseline: ~300–800 tokens per chunk with 10–20% overlap.","Better: **structure-aware** splitting on headings/sections; keep tables, code blocks and lists intact.","Add **context**: document title, section path, date/version, product — prepended to the chunk text and stored as metadata for filters.","Measure: change chunking, re-run the retrieval eval (recall@k), keep what wins."],
 ex:`Broken chunking (fixed 200-token windows):
~~~
Chunk 211: "... refund timelines by method:  | Method | UPI | Cards |"
Chunk 212: "| Time | 5–7 days | 7–10 days | Netbanking ..."
~~~
Neither chunk answers "UPI refund time". Structure-aware chunk:
~~~
[Refund policy v7 > 3. Timelines > 3.2 Refund time by method]
| Method | Time |
| UPI | 5–7 working days |
| Cards | 7–10 working days |
~~~
Result on our 120-question golden set: recall@5 61% → 78%.`,
 traps:["Very big chunks: matches get diluted and you pay for irrelevant tokens.","Very small chunks: no context ('it takes 5 days' — what does?).","Re-chunking means re-embedding everything; keep stable chunk ids for updates."],
 say:"I chunk by document structure — headings, sections, intact tables — with modest overlap, and prepend the title and section path so each chunk stands on its own. I tune chunk size against retrieval recall on a golden set rather than guessing."},
embeddings:{t:"Embeddings and hybrid search", one:"Vectors find text with similar meaning; keyword search finds exact terms. Production RAG usually needs both.",
 life:"A librarian who shelves by topic finds you 'books about payment failures', but you needed the one with the exact title 'ERR_4012'. The catalogue computer finds exact titles. Ask both and merge their lists.",
 how:["An **embedding model** maps text to a vector; similar meanings end up close (cosine similarity).","Use the same model for documents and queries; follow its query/passage prefixes if it has them.","Vector search misses rare exact tokens: error codes, SKUs, names, IDs.","**BM25** keyword search ranks by term frequency and rarity — great for exact terms.","**Hybrid**: run both and fuse the ranked lists, commonly with **Reciprocal Rank Fusion**: score = Σ 1/(60 + rank)."],
 ex:`Query: "ERR_4012 on payout"
| Rank | Vector only | BM25 |
|---|---|---|
| 1 | Payout FAQ | Error codes A–Z (defines ERR_4012) |
| 2 | Payment failures overview | Payout troubleshooting |
| 37 | Error codes A–Z | — |

RRF for "Error codes A–Z": 1/(60+1) + 1/(60+37) = 0.0164 + 0.0103 = 0.0267 → ranks first after fusion.

~~~
hybrid = EnsembleRetriever(retrievers=[bm25, vector.as_retriever(search_kwargs={"k": 50})],
                           weights=[0.5, 0.5])
~~~`,
 traps:["Mixing vectors from two embedding models in one index breaks similarity.","Bigger embedding models don't fix exact-term misses — BM25 does.","Stuffing top-100 chunks into the prompt is slow, expensive and causes 'lost in the middle'."],
 say:"Dense embeddings capture meaning but miss exact identifiers like error codes, so I use hybrid retrieval: BM25 plus vectors fused with reciprocal rank fusion, then a reranker on the top candidates."},
rerank:{t:"Reranking", one:"Retrieve many candidates fast, then score each one carefully against the question and keep only the best few.",
 life:"Hiring: first shortlist 50 CVs with a keyword filter (fast, rough), then actually interview the shortlist (slow, accurate) and hire the top 5.",
 how:["First-stage retrieval (vectors/BM25) is fast but approximate; the right chunk is often at rank 9 or 14.","A **cross-encoder reranker** reads the question and a chunk **together** and outputs a relevance score.","Run it on the top 30–100 candidates, keep the best 5–8 for the prompt.","Costs ~100–400 ms; worth it when precision matters.","Measure with recall@5 / MRR before and after."],
 ex:`Recall@50 = 97% but recall@5 = 76%: the right chunk is found but buried.

| Stage | Candidates | Latency |
|---|---|---|
| Hybrid retrieve | 50 | 60 ms |
| Cross-encoder rerank | 50 → 5 | 250 ms |
| LLM answer | 5 chunks | 900 ms |

After reranking: recall@5 76% → 90%, faithfulness up, prompt tokens down 60% vs sending 20 chunks.`,
 traps:["Reranking can't recover a chunk that first-stage retrieval never fetched — check recall@50 first.","Rerankers have max input lengths: long chunks get truncated.","Latency adds up: run retrievers in parallel and cap the candidate count."],
 say:"I separate recall and precision: hybrid retrieval gets the right chunk into the top 50, and a cross-encoder reranker moves it into the top 5 that go to the model. I track recall@k at both stages to know which one to tune."},
access:{t:"Access control and freshness in RAG", one:"The index must enforce who may see what and must forget what was deleted — in code, not in the prompt.",
 life:"Bank lockers: the clerk opens only the locker that matches your key. Nobody asks customers to 'please open only your own locker'. And when a branch shuts a locker, it's removed from the register — not left for someone to open by mistake.",
 how:["Store **tenant/ACL metadata** with every chunk (merchant_id, groups, visibility).","At query time apply a **filter from the logged-in session** (or use per-tenant indexes) before results reach the model.","Never rely on the prompt ('don't reveal other merchants') — a model can't be trusted to hide what it was given.","Ingestion must handle **updates and deletes**: stable chunk ids (doc id + section + hash), upsert changed chunks, delete removed ones.","Re-sync permissions quickly when access changes."],
 ex:`Incident log:
~~~
query by merchant_a: "my MDR for cards"
retrieved: pricing_agreement_merchant_b.pdf §2   score 0.91
filter: none
~~~
Fix:
~~~
results = store.similarity_search(
    query, k=50,
    filter={"tenant_id": session.merchant_id, "visibility": {"$in": session.groups}})
~~~
Stale policy fix: ingestion now deletes chunks whose source section disappeared; stale citations 18% → 0%.`,
 traps:["Post-filtering after top-k can return zero results for small tenants — filter inside the search.","Semantic caches must be keyed by tenant/permissions too.","Updating docs without deleting old chunks leaves retired policies searchable."],
 say:"Access control lives in retrieval: every chunk carries tenant and ACL metadata, and queries are filtered by the authenticated user's identity — never by prompt instructions. Ingestion is delete-aware with stable chunk ids so the index matches the sources."},
evals:{t:"Evaluating RAG", one:"Measure retrieval and answers with numbers on a fixed question set before every release.",
 life:"A mock exam with an answer key before the board exam. You don't guess whether you're ready; you score yourself on the same paper every time you change how you study.",
 how:["Build a **golden set**: real user questions, the passages that answer them, reference answers, plus questions that **can't** be answered.","**Retrieval metrics**: recall@k, MRR (1/rank of first relevant), nDCG.","**Answer metrics**: faithfulness (every claim supported by context), correctness vs reference, citation accuracy, correct abstention.","Use LLM-as-judge with a clear rubric, calibrated against human labels.","Run evals in CI; block a release when key metrics drop; add every production failure to the set."],
 ex:`Three questions; first relevant chunk at ranks 1, 2 and 4:
MRR = (1/1 + 1/2 + 1/4) / 3 = **0.58**

| Version | Recall@5 | MRR | Faithfulness | Abstention |
|---|---|---|---|---|
| v1 fixed chunks | 0.61 | 0.52 | 0.74 | 0.40 |
| v2 structure chunks | 0.78 | 0.63 | 0.82 | 0.70 |
| v3 + hybrid + rerank | 0.90 | 0.79 | 0.91 | 0.85 |`,
 traps:["Averages hide regressions on critical questions — read per-example diffs.","A judge that disagrees with humans makes metrics meaningless — calibrate it.","Testing only answerable questions rewards bluffing."],
 say:"I keep a golden set with labelled passages and unanswerable questions, track recall@k and MRR for retrieval and faithfulness/correctness for answers with a calibrated LLM judge, and gate releases on those metrics in CI."}
});

QUEST.missions("rag", [
{title:"The bot that invented a refund rule", icon:"🤥", place:"Mon 11:30 AM · merchant escalation", setup:"A merchant posted a screenshot on social media: the support bot promised UPI refunds 'within 2 hours'. The real policy says 5–7 working days.",
 meters:{correct:{label:"Correct answers", value:52, unit:"%", goal:75, better:"high", max:100, cap:100}, madeup:{label:"Made-up answers", value:31, unit:"%", goal:8, better:"low", max:40}, trust:{label:"Merchant trust", value:40, unit:"%", goal:65, better:"high", max:100, cap:100}},
 steps:[
  {say:[["kai","Escalation from Sharma Electronics. Look at this."],["ui","Chat log · merchant: Sharma Electronics\nQ: How long do refunds take for UPI?\nBot: UPI refunds are instant and guaranteed within 2 hours.\n— refunds_v7.pdf §3.2: UPI refunds are credited within 5–7 working days."]]},
  {choose:"Why did the bot answer so confidently — and wrongly?", options:[
   {t:"The model never saw our policy, so it generated a plausible-sounding answer", ok:true, why:"An LLM predicts likely text. Without our documents in its context, 'refund time' gets a fluent, generic, invented answer.", life:"A student who didn't study writes a confident essay anyway."},
   {t:"Temperature is too high", ok:"partial", why:"Sampling settings change wording, not knowledge. At temperature 0 it would invent the same thing more consistently.", life:"Asking the bluffing student to speak more calmly."},
   {t:"The model is broken", ok:false, why:"It's working as designed: generating plausible text. It just has no access to our facts.", life:"The student isn't broken; they were never given the textbook."}]},
  {choose:"What's the right fix?", options:[
   {t:"RAG: retrieve the relevant policy sections and answer only from them, with citations", ok:true, fx:{correct:15, madeup:-15, trust:10}, why:"Retrieval puts our current policy text into the prompt; instructions + citations keep answers grounded and checkable.", life:"Make it an open-book exam: hand over the right pages and ask for the paragraph used."},
   {t:"Fine-tune the model on our policy PDFs", ok:"partial", fx:{correct:3}, why:"Fine-tuning shapes behaviour and style; it doesn't reliably store facts, can't cite, and policies change monthly.", life:"Making the student memorise last year's textbook — they'll still mix things up and won't know this month's changes."},
   {t:"Add 'Never make things up' to the system prompt", ok:"partial", fx:{madeup:-3}, why:"Slightly helps, but the model still has nothing true to say. Exhortation can't replace information.", life:"Telling the unprepared student 'don't bluff' without giving them the book."}]},
  {card:"rag"},
  {task:["order","Put the indexing pipeline in order",["Load policy PDFs and help-center pages","Split them into chunks","Embed each chunk","Store vectors with text and metadata"],"Indexing runs offline; queries then embed the question and search the store."], intro:[["kai","Let's build the index properly. What happens in what order?"]], label:"Build the index", ok:{trust:0}},
  {say:[["kai","Better, but some answers are still wrong. The refund table got split in half."],["ui","Chunk 211: '... refund timelines by method:  | Method | UPI | Cards |'\nChunk 212: '| Time | 5–7 days | 7–10 days | Netbanking ...'"]]},
  {choose:"How do you fix chunking?", options:[
   {t:"Split on headings, keep tables whole, and prepend the document title + section path to each chunk", ok:true, fx:{correct:10, madeup:-6, trust:10}, why:"Each chunk now contains a complete idea and says where it comes from ('Refund policy v7 > Timelines'). Retrieval matches it, and the model can read it on its own.", life:"Revision cards: keep each table on one card and write the chapter name on top."},
   {t:"Make chunks 10× bigger", ok:"partial", fx:{correct:2}, why:"Fewer splits, but each chunk mixes many topics, so matching gets fuzzier and prompts get expensive.", life:"Photocopying a whole chapter per card: the answer is in there somewhere."},
   {t:"Make chunks 50 tokens", ok:false, fx:{correct:-5}, why:"Tiny chunks lose context: '5–7 days' without saying what takes 5–7 days.", life:"Cards with half-sentences on them."}]},
  {card:"chunking"},
  {choose:"Last guardrail: what should the bot do when the retrieved context doesn't contain the answer?", options:[
   {t:"Say it doesn't know, and offer to escalate to a human", ok:true, fx:{madeup:-3, trust:5}, why:"Abstaining is the correct behaviour when evidence is missing; it protects trust more than any guess.", life:"A good bank clerk says 'let me check with my manager' rather than guessing your loan rate."},
   {t:"Answer from general knowledge", ok:false, fx:{madeup:5}, why:"That's exactly how the 2-hour refund promise happened.", life:"The bluffing student again."},
   {t:"Retrieve 100 more chunks until something matches", ok:false, fx:{madeup:3}, why:"More loosely related text makes the model more likely to stitch together a wrong answer.", life:"Grabbing random books off the shelf until one mentions refunds."}]},
  {say:[["kai","Correct answers up from 52% to 77%, made-up answers down to 7%. And Sharma Electronics got an apology with the right policy link."]]}
 ],
 learned:["LLMs invent plausible answers when they lack facts: ground them with retrieval.","Chunk by structure, keep tables whole, add titles and section paths.","Give the bot a way to say 'I don't know'."]},
{title:"ERR_4012", icon:"🔎", place:"Wed 03:00 PM · support queue", setup:"Merchants paste error codes like ERR_4012 into the bot, and it replies with generic 'payment failed' pages. Support tickets are piling up.",
 meters:{recall:{label:"Recall@5", value:58, unit:"%", goal:90, better:"high", max:100, cap:100}, latency:{label:"Answer latency", value:900, unit:" ms", goal:1500, better:"low", max:3000}, trust:{label:"Support trust", value:50, unit:"%", goal:70, better:"high", max:100, cap:100}},
 steps:[
  {say:[["meera","42 tickets today with error codes the bot couldn't explain."],["ui","Query: 'ERR_4012 on payout'\nTop results (vector search):\n 1. Payout FAQ                  0.82\n 2. Payment failures overview   0.81\n 3. Settlement timelines        0.80\n37. Error codes A–Z  ← defines ERR_4012"]]},
  {choose:"Why does vector search miss an exact code?", options:[
   {t:"Embeddings capture meaning; a rare exact token like ERR_4012 barely affects the vector, so topic-similar pages win", ok:true, why:"The query vector mostly says 'payout problem'. Every payout page looks similar. The one page that contains the exact string doesn't stand out in vector space.", life:"A librarian who shelves by topic brings you 'books about failures' when you asked for one exact title."},
   {t:"The page that defines ERR_4012 isn't indexed", ok:false, why:"It's in the index — it's ranked 37th.", life:"The book is in the library, just on the wrong shelf for this question."},
   {t:"The LLM can't read error codes", ok:false, why:"The LLM never received the right page; the problem is retrieval.", life:"The student can read; they were handed the wrong chapter."}]},
  {card:"embeddings"},
  {choose:"How do you fix it?", options:[
   {t:"Hybrid search: BM25 keyword search plus vectors, fused with reciprocal rank fusion", ok:true, fx:{recall:18, latency:40, trust:10}, why:"BM25 ranks the page containing 'ERR_4012' first; fusion combines it with semantic results. Exact codes and fuzzy questions both work.", life:"Ask both the librarian (meaning) and the catalogue computer (exact titles), then merge their lists."},
   {t:"Switch to a bigger embedding model", ok:"partial", fx:{recall:3, latency:100}, why:"Slightly better vectors, same blind spot for rare exact tokens.", life:"A more experienced librarian who still shelves by topic."},
   {t:"Send the top 100 chunks to the LLM", ok:false, fx:{latency:900, recall:2}, why:"Slow, expensive, and the right chunk gets lost in the middle of a huge prompt.", life:"Dumping 100 books on the student's desk for one question."}]},
  {task:["num","RRF with k = 60: a page is rank 1 in BM25 and rank 3 in vector search. Its score × 1,000 (1 decimal)?",32.3,0.1,"","1/61 + 1/63 = 0.01639 + 0.01587 = 0.03227 → 32.3."], intro:[["kai","Check you understand how fusion scores pages."]], label:"Fuse two rankings", ok:{trust:5}},
  {say:[["kai","Recall@50 is 97% now. But the right chunk often sits at #9 or #14, and we only send 5 chunks."]]},
  {choose:"How do you get the right chunk into the top 5?", options:[
   {t:"Add a cross-encoder reranker over the top 50 and keep the best 5", ok:true, fx:{recall:14, latency:250, trust:5}, why:"The reranker reads question and chunk together, which is far more accurate than vector distance. It's slower, so it only runs on the shortlist.", life:"Shortlist 50 CVs by keywords, then actually interview the shortlist and hire the top 5."},
   {t:"Send 50 chunks to the LLM instead of 5", ok:false, fx:{latency:1200}, why:"Latency and cost explode, and answer quality often drops with long noisy contexts.", life:"Hiring all 50 shortlisted people."},
   {t:"Lower the LLM's temperature", ok:false, why:"Generation settings can't fix which chunks were retrieved.", life:"Calmer interviews don't change who's on the shortlist."}]},
  {card:"rerank"},
  {say:[["meera","Error-code tickets dropped from 42 a day to 3. The bot even links the exact troubleshooting section now."]]}
 ],
 learned:["Vectors capture meaning, not exact codes: add BM25 (hybrid).","Fuse rankings with RRF: Σ 1/(60 + rank).","Retrieve wide, rerank narrow."]},
{title:"The leak and the stale policy", icon:"🔐", place:"Fri 09:15 AM · security incident", setup:"A merchant reports seeing another merchant's custom pricing in a bot answer. The same morning, finance finds the bot quoting last month's refund policy.",
 meters:{leaks:{label:"Cross-tenant leaks/day", value:12, unit:"", goal:0, better:"low", max:15}, stale:{label:"Stale citations", value:18, unit:"%", goal:2, better:"low", max:25}, faith:{label:"Faithfulness", value:74, unit:"%", goal:90, better:"high", max:100, cap:100}},
 steps:[
  {say:[["sana","🚨 Severity 1. Merchant A saw a line from Merchant B's pricing agreement."],["ui","Retrieval log\nquery by merchant_a: 'my MDR for cards'\nretrieved: pricing_agreement_merchant_b.pdf §2   score 0.91\nfilter: none"]]},
  {choose:"How do you stop cross-tenant leaks?", options:[
   {t:"Enforce a tenant filter at retrieval, in code, from the logged-in session (or per-tenant indexes)", ok:true, fx:{leaks:-12}, why:"Each chunk carries a tenant id; the search only considers chunks the authenticated user may see. The model never receives other merchants' data.", life:"Bank lockers: the clerk only opens the locker that matches your key."},
   {t:"Add 'Never reveal other merchants' data' to the system prompt", ok:false, fx:{leaks:-2}, why:"The data is already in the prompt; a model can be tricked or simply slip. Security can't depend on the model's obedience.", life:"Handing customers every locker key and asking them to open only their own."},
   {t:"Use a stricter reranker", ok:false, why:"Ranking decides order, not permission. The wrong tenant's chunk can still rank first.", life:"Sorting the lockers more neatly doesn't lock them."}]},
  {card:"access"},
  {say:[["meera","Second issue: we changed the refund policy last week. The bot still quotes the old one in 18% of answers."]]},
  {choose:"Why is the old policy still showing up?", options:[
   {t:"Ingestion adds new chunks but never deletes the old version's chunks", ok:true, fx:{stale:-16}, why:"Both versions sit in the index; whichever matches better wins. Ingestion needs stable chunk ids and deletes.", life:"You added the new menu to the restaurant binder but never removed the old pages."},
   {t:"The embedding model is outdated", ok:false, why:"The embedding model doesn't know policy versions; the index contents do.", life:"Blaming the binder's paper for old pages still being inside."},
   {t:"A cache is serving old answers", ok:"partial", fx:{stale:-4}, why:"A semantic cache can serve stale answers too, but the root cause is that old chunks are still searchable.", life:"Clearing the waiter's notepad while the old menu pages stay in the binder."}]},
  {task:["order","Make ingestion delete-aware",["Detect that the policy document changed","Re-chunk it with stable chunk ids (doc + section + hash)","Upsert changed chunks","Delete chunks whose sections no longer exist","Verify retrieval returns only the new text"],"Deletes matter as much as inserts."], label:"Fix ingestion", ok:{stale:-2}},
  {say:[["kai","Before we ship changes like this again, I want a number, not vibes."]]},
  {task:["num","Three test questions: the first relevant chunk is at rank 1, 2 and 4. What's the MRR (2 decimals)?",0.58,0.01,"","(1 + 1/2 + 1/4) / 3 = 0.583."], label:"Score retrieval", ok:{faith:6}},
  {choose:"How do you stop shipping regressions?", options:[
   {t:"A golden dataset with recall, MRR and faithfulness evals in CI; block releases when they drop", ok:true, fx:{faith:10}, why:"Every change is scored on the same questions — including unanswerable and tenant-sensitive ones — before it reaches merchants.", life:"A mock exam with an answer key before the board exam."},
   {t:"Ask the team to test manually before each release", ok:"partial", fx:{faith:2}, why:"Better than nothing, but inconsistent and impossible to compare across versions.", life:"Asking a friend whether you seem ready."},
   {t:"Ship, then watch for complaints", ok:false, fx:{faith:-5}, why:"Merchants become your test suite — that's how this incident happened.", life:"Finding out you failed when results are published."}]},
  {card:"evals"},
  {say:[["sana","Zero leaks in 7 days, stale citations at 0%, faithfulness 90%. Closing the incident."],["kai","And every future change now has to beat the golden set first."]]}
 ],
 learned:["Permissions belong in retrieval code, never in the prompt.","Ingestion must delete what the source deleted.","Measure (recall, MRR, faithfulness) and gate releases on it."]}
]);
