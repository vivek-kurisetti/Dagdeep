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

// ---- Story extras: under-the-hood explanations + mock interview ----
(function(){
  const M = QUEST.data.rag.missions;
  const D = {
"0.1":`### Why LLMs invent things
A language model is trained to produce the **most plausible continuation** of text. When the true answer isn't in its weights or its context, the most plausible-sounding text is still produced — fluent, confident, and wrong. Training also often rewards answering over abstaining.

### Signals you're seeing a knowledge gap
- Answers are generic ("instant", "within 24 hours") rather than your specific policy wording.
- Different phrasings of the same question give different numbers.
- The model can't cite where the fact came from.`,
"0.2":`### What changes with RAG
The prompt now contains the actual policy text, so the most plausible continuation **is** the policy. Adding "answer only from the context, cite the section, otherwise say you don't know" turns it into an open-book task with a way out.

### Why not fine-tuning for facts
- Weights blend knowledge statistically; exact numbers ("5–7 working days") aren't reliably memorised.
- Every policy change would need retraining.
- No citations → nobody can verify the answer.
- No per-user permissions: everything trained in is visible to everyone.
Fine-tuning shines for **behaviour** (tone, format, classification), often combined with RAG.`,
"0.6":`### Good chunking in practice
1. Parse documents with structure (headings, lists, tables) — use a layout-aware PDF parser instead of raw text extraction.
2. Split at section boundaries; cap size (~300–800 tokens); allow small overlap for prose.
3. Never split tables, code blocks or numbered procedures mid-way; very large tables → one chunk per row group with the header repeated.
4. Prepend a **context header**: document title, section path, version/date.
5. Store metadata separately (doc id, section, version, tenant, language) for filters and citations.

### Contextual retrieval
Going further, an LLM can write a one-sentence summary of where each chunk sits in its document; prepending it before embedding (and to the BM25 index) noticeably reduces retrieval failures in published experiments.`,
"0.8":`### Implementing abstention
- In the prompt: "If the context doesn't contain the answer, reply exactly: I don't have that information — would you like me to connect you to support?"
- In code: if top retrieval scores are below a threshold or the reranker scores are low, skip generation and go straight to the fallback.
- In evals: include **unanswerable** questions and score whether the bot abstains.

Abstaining feels like a failure in demos but builds trust in production — wrong answers cost far more than "let me check".`,
"1.1":`### What an embedding captures
An embedding model compresses text into a vector (e.g. 768–3,072 numbers) that captures **meaning**: "refund timeline" and "how long until money comes back" end up close. Rare tokens like «ERR_4012» have little influence on the vector — the query vector is dominated by "payout problem", so every payout page looks similar.

### Keyword search's strength
BM25 scores documents by how often query terms appear, weighted by how **rare** they are across the corpus (IDF). «ERR_4012» appears in one document → enormous weight → that document ranks first.`,
"1.3":`### Reciprocal Rank Fusion
For each document: score = Σ over retrievers of 1 / (k + rank), with k = 60. It uses **ranks**, not raw scores, so you don't need to calibrate BM25 scores against cosine similarities.

### Practical setup
- Retrieve top 50 from each retriever in parallel.
- Fuse with RRF (or weighted RRF if one retriever is clearly better for your traffic).
- Rerank the fused top 50 with a cross-encoder, keep 5–8.
Many vector databases (OpenSearch, Elasticsearch, Weaviate, Qdrant, pgvector + full-text) support hybrid search natively.`,
"1.6":`### Bi-encoder vs cross-encoder
- **Bi-encoder** (embeddings): query and document are encoded **separately**; similarity is a dot product. Fast, pre-computable, but it can't model fine interactions between query words and document words.
- **Cross-encoder** (reranker): reads query and document **together** through a transformer and outputs a relevance score. Much more accurate, but must run at query time for every candidate — so only on a shortlist.

### Budget
Reranking 50 chunks of ~300 tokens typically costs 100–400 ms on a GPU or a hosted rerank API. Measure recall@5 before/after to justify it.`,
"2.1":`### Where to enforce permissions
1. **At ingestion**: attach tenant id / ACL groups to every chunk's metadata.
2. **At query time**: build the filter from the **authenticated session** (never from the user's message or the model's output) and apply it **inside** the vector search (pre-filtering or filter-aware ANN), so top-k is computed only over allowed chunks.
3. **Strong isolation** for high-risk data: separate index/namespace per tenant.
4. **Caches** keyed by tenant and permission set.

### Why prompts can't be the control
The model already received the other tenant's text — a prompt injection, a paraphrase or a summary can leak it. Security must make it impossible for the data to reach the model.`,
"2.4":`### Delete-aware ingestion
- Give each chunk a **stable id**: «doc_id + section_path + content_hash».
- On a document change: re-chunk, **upsert** new/changed chunk ids, and **delete** ids that existed for that document before but not now.
- Keep a record manager table (doc id → chunk ids, hashes, version) to compute the diff.
- Store «version» and «effective_date» in metadata; optionally filter to the latest version at query time.

LangChain's indexing API with a RecordManager, or a CDC pipeline from the document store, implements exactly this.`,
"2.8":`### A minimal RAG eval harness
- **Golden set**: 100–300 real questions with the passages that answer them and reference answers; include unanswerable and tenant-sensitive questions.
- **Retrieval**: recall@5, recall@50, MRR.
- **Generation**: faithfulness (LLM judge checks every claim against retrieved context), correctness vs reference, citation accuracy, abstention rate on unanswerables.
- **CI gate**: fail the build if faithfulness or recall drops more than a threshold vs the main branch; review per-example regressions.
- **Production**: sample live traffic for online faithfulness checks; route thumbs-down to review and add to the golden set.`,
"0.4":`Indexing is offline and repeatable; queries are online and latency-sensitive. Keep them separate: ingestion jobs (with retries and versioning) write to the index; the query service only reads.`,
"1.4":`RRF rewards documents that **both** retrievers like. A document ranked 1st by one retriever and absent from the other scores 1/61 ≈ 0.0164; one ranked 3rd and 5th by both scores 1/63 + 1/65 ≈ 0.0313 — consensus wins.`,
"2.5":`Verification step: query a few known questions after ingestion and assert the cited version matches the latest document — a cheap automated smoke test.`,
"2.7":`MRR only looks at the **first** relevant result. Use recall@k when several chunks are needed, and nDCG when relevance is graded (some chunks are more useful than others).`
  };
  for (const k in D){ const [mi, si] = k.split(".").map(Number), S = M[mi].steps[si]; const tgt = S.options ? S.options.find(o => o.ok === true) : S; tgt.more = D[k]; }
})();

QUEST.interviews("rag", [
{title:"AI engineering round: RAG systems", icon:"🎤", place:"60-minute design + debugging round", setup:"Rohit leads the AI platform team. He'll ask you to design, debug and evaluate a production RAG system.",
 meters:{signal:{label:"Hire signal", value:40, unit:"%", goal:80, better:"high", max:100, cap:100}, depth:{label:"Depth", value:30, unit:"%", goal:75, better:"high", max:100, cap:100}, flags:{label:"Red flags", value:0, unit:"", goal:0, better:"low", max:5}},
 steps:[
  {say:[["rohit","Let's design something real: a support assistant over 40,000 internal documents for our merchants."]]},
  {choose:"“Walk me through your RAG architecture.”", model:`**Ingestion (offline):** connectors/CDC from doc sources → layout-aware parsing → structure-aware chunking with context headers → embeddings → vector + BM25 index with metadata (doc, section, version, tenant, ACL). Delete-aware updates with stable chunk ids.
**Query (online):** auth → query rewriting for follow-ups → hybrid retrieval (BM25 + vectors, RRF) **filtered by tenant/ACL** → cross-encoder rerank to top 5–8 → prompt with instructions to answer only from context, cite sections, abstain otherwise → stream answer.
**Quality & ops:** golden-set evals (recall@k, MRR, faithfulness) in CI, online sampling, tracing, latency/cost budgets, prompt caching, guardrails against injection in documents.`, options:[
   {t:"Ingestion with structure-aware chunking and metadata; hybrid retrieval filtered by tenant; reranking; grounded prompt with citations and abstention; evals in CI plus tracing and monitoring in production.", ok:true, fx:{signal:6, depth:7}, why:"End-to-end with security, quality and operations — the three things a design round checks."},
   {t:"Embed the documents into a vector database and send the top results to the LLM.", ok:"partial", fx:{signal:-2}, why:"The demo version. Missing chunking strategy, hybrid search, permissions, evaluation and operations."},
   {t:"Fine-tune an LLM on all 40,000 documents.", ok:false, fx:{signal:-8, flags:1}, why:"Doesn't handle changing facts, permissions or citations."}]},
  {choose:"“Retrieval looks fine — the right chunk is in the context — but answers are still wrong. What do you check?”", model:`1. **Faithfulness**: does the answer contradict or go beyond the context? (judge or manual check)
2. **Context quality**: too many chunks / long context → lost in the middle; conflicting chunks (old vs new versions); missing table headers.
3. **Prompt**: clear instruction to answer only from context, cite, and abstain; relevant chunk placed near the question; no instructions buried in documents (injection).
4. **Model**: too small for multi-step reasoning over tables → try a stronger model for those queries (routing).
5. Measure with the golden set before/after each change.`, options:[
   {t:"Check faithfulness, context length and ordering (lost in the middle), conflicting versions, prompt instructions and citations, possible injections in docs, and whether the model is strong enough — measured on a golden set.", ok:true, fx:{signal:6, depth:7}, why:"You separated retrieval from generation and listed the real failure modes."},
   {t:"Retrieve more chunks so it has more information.", ok:false, fx:{signal:-6, flags:1}, why:"More context often makes it worse (noise, lost in the middle, cost)."},
   {t:"Lower the temperature.", ok:"partial", fx:{signal:-2}, why:"Can reduce variability, rarely fixes wrong answers."}]},
  {task:["num","Rohit: “Five test questions; the first relevant chunk is at ranks 1, 1, 2, 5 and not found. What's the MRR?” (2 decimals; not found counts as 0)",0.54,0.01,"","(1 + 1 + 0.5 + 0.2 + 0) / 5 = 0.54."], label:"Metric maths", ok:{signal:4, depth:4}, bad:{signal:-4}},
  {choose:"“How do you evaluate this system before and after launch?”", model:`**Before launch:** a golden set (real questions, labelled passages, reference answers, unanswerable and tenant-sensitive cases). Retrieval: recall@5/@50, MRR. Generation: faithfulness, correctness, citation accuracy, abstention. LLM-as-judge with a clear rubric, **calibrated against human labels**. Run in CI and block regressions.
**After launch:** trace every request; sample traffic for online faithfulness; collect thumbs-down and escalations; route failures to annotation and add them to the golden set; dashboards for latency, cost and quality by segment.`, options:[
   {t:"A golden set with retrieval metrics (recall@k, MRR) and generation metrics (faithfulness, correctness, abstention) via a calibrated LLM judge in CI; in production, tracing, sampled online evals and feedback loops into the golden set.", ok:true, fx:{signal:6, depth:7}, why:"Offline + online, retrieval + generation, and judge calibration — complete."},
   {t:"We'll ask a few users to try it and give feedback.", ok:"partial", fx:{signal:-2}, why:"Useful, but not repeatable or comparable across versions."},
   {t:"If it answers in a demo, it works.", ok:false, fx:{signal:-8, flags:1}, why:"Demo-driven development is the top RAG anti-pattern."}]},
  {choose:"“How do you make sure merchants only see their own documents?”", model:`Permissions belong in **retrieval code**, not prompts: every chunk carries tenant id and ACL metadata at ingestion; at query time the filter comes from the **authenticated session** and is applied inside the search (pre-filter / filter-aware ANN) so other tenants' chunks never reach the model. For sensitive tenants, separate indexes. Caches keyed by tenant. Re-sync ACL changes quickly, and test with cross-tenant queries in the eval set.`, options:[
   {t:"Tenant and ACL metadata on every chunk, a filter built from the authenticated session applied inside the search, per-tenant indexes for sensitive data, tenant-keyed caches, and cross-tenant tests in evals.", ok:true, fx:{signal:6, depth:7}, why:"Defence in code at the right layer, plus testing."},
   {t:"Tell the model in the system prompt not to reveal other merchants' data.", ok:false, fx:{signal:-8, flags:1}, why:"Security can't depend on model obedience; the data has already leaked into the prompt."},
   {t:"Filter the LLM's answer for other merchants' names.", ok:"partial", fx:{signal:-2}, why:"An output filter is a weak last line of defence; leaks can be paraphrased."}]},
  {choose:"“Latency is 4 seconds and cost is too high. Where do you start?”", model:`Trace a request and fix the **largest span** first. Typical levers: run BM25 and vector retrieval **in parallel**; cap rerank candidates (e.g. 50 → 30); send fewer, better chunks (5–8, not 20); **prompt caching** for the stable system prompt and tools; **stream** tokens to cut perceived latency; route easy questions to a smaller model; cache answers for frequent questions (keyed by tenant); trim conversation history.`, options:[
   {t:"Trace it and fix the biggest span: parallel retrieval, smaller rerank set, fewer chunks, prompt caching, streaming, routing easy questions to a smaller model, and tenant-aware answer caching.", ok:true, fx:{signal:6, depth:7}, why:"Measurement-first with concrete levers on both latency and cost."},
   {t:"Switch to the cheapest model.", ok:"partial", fx:{signal:-2}, why:"May cut cost but hurts quality; you haven't looked where the time goes."},
   {t:"Remove the reranker and retrieval to save time.", ok:false, fx:{signal:-6, flags:1}, why:"Removes the grounding that makes answers correct."}]},
  {choose:"“RAG or fine-tuning for this support assistant?”", model:`**RAG** for knowledge: policies change, answers need citations, and access differs per merchant. **Fine-tuning** only if needed for behaviour: consistent tone/format, classification/routing, or distilling a big model into a cheaper one for high volume — usually **on top of** RAG. Start with prompting + RAG, measure, and fine-tune only for the gaps the evals reveal.`, options:[
   {t:"RAG for changing, permissioned knowledge with citations; fine-tuning only for behaviour or cost (tone, format, routing, distillation), usually on top of RAG and only where evals show a gap.", ok:true, fx:{signal:6, depth:7}, why:"Clear decision rule tied to evidence."},
   {t:"Fine-tuning is always better because the model learns our data.", ok:false, fx:{signal:-8, flags:1}, why:"Ignores freshness, citations and permissions."},
   {t:"Whichever is cheaper.", ok:"partial", fx:{signal:-2}, why:"Cost matters, but the deciding factors are the requirements."}]},
  {say:[["rohit","Great — you designed for correctness, security and operations, and you'd measure everything. That's the bar for this team."]]}
 ],
 learned:["Design answers = ingestion + retrieval + generation + security + evals + operations.","Separate retrieval failures from generation failures when debugging.","Permissions in code, never in prompts.","Evidence decides RAG vs fine-tuning."]}
]);

/* ===== On-call desk: RAG incident ===== */
QUEST.cases("rag", [
{
 title:"The bot can't find the new policy", icon:"🤖", sev:2, clock:"11:30", channel:"inc-2324-assistant-retrieval", svc:"support-assistant · RAG (pgvector)", need:4,
 terms:[["RAG", "Retrieval-augmented generation: fetch relevant document chunks, then have the LLM answer from them."], ["Chunk", "A piece of a document (a few hundred tokens) that is embedded and stored for search."], ["Embedding", "A list of numbers that represents meaning. Similar texts get nearby vectors, but only within the same model."], ["Cosine similarity", "How close two vectors point (≈1 very similar, ≈0 unrelated). Retrieval ranks chunks by it."], ["recall@5", "Share of test questions where the correct chunk is in the top 5 results. Measures retrieval alone."], ["Faithfulness", "Whether the answer sticks to the retrieved context. Measures generation alone."], ["Blue/green re-index", "Build a complete new index next to the old one, test it, then switch traffic in one step."]],
 deep:[{"t": "Why two embedding models don't mix", "md": "An embedding model maps text to a point in its own learned space. Two models, even with the same number of dimensions, have **unrelated axes**: dimension 17 means something different in each. Cosine similarity between a v2 query vector and a v3 document vector is like comparing GPS coordinates with postcodes: it returns a number, but the number means nothing. Vector databases can't detect this; only your **metadata** (model id per chunk) and **evals** can."}, {"t": "Embedding migrations done right", "md": "1. Version the index: «chunks_v3» next to «chunks_v2».\n2. **Backfill** every chunk with the new model (batch, rate-limited, resumable).\n3. Run the **eval suite** (recall@k, MRR) on both; compare cost and latency.\n4. Switch **query and ingestion together** via one config value (blue/green).\n5. Keep v2 for rollback for a few days, then delete.\n6. Carry over **all metadata**, especially ACLs and effective dates."}],
 impact:{"label": "Tickets escalated", "ic": "🎫", "rate": 0.4, "start": 1240},
 pager:`[y]WARN[/y]  support-assistant  eval: retrieval recall@5 dropped [r]0.91 → 0.58[/r]
online   "I couldn't find that in our policies" answers up [r]4.1×[/r] since Monday
escal.   human handoffs +62% (support lead raised this)
example  Q: "What is the new refund window for UPI?" → bot: "I don't have that information."`,
 brief:"The new refund policy (UPI refunds within **5 days**, was 7) was published Monday and ingested the same day. The bot can't find it, and is getting worse on *older* questions too. Kai's team also changed the answer prompt on Monday, and the LLM provider had a latency blip on Tuesday.",
 slack:[
  {at:0, who:"kai", t:"Two changes went out Monday: a new system prompt (more cautious wording) and an ingestion pipeline upgrade. LLM latency also spiked Tuesday. Could be any of them 🤷"},
  {at:5, who:"priya", t:"\"I don't know\" answers usually mean the model didn't get the right context. Before blaming the LLM, check what **retrieval** actually returned for a failing question.", cmd:"rag trace --query \"What is the new refund window for UPI?\""},
  {at:50, who:"meera", t:"Support team says even \"how do I raise a chargeback?\" fails now, and that doc hasn't changed in a year."},
  {on:"wrongchunks", who:"priya", t:"The new policy doc *exists* in the index but scores near zero. Similarity that low for an exact match means the vectors aren't comparable. What embedded these chunks?", cmd:"psql -c \"select embed_model, count(*), min(ingested_at)::date from chunks group by 1;\""},
  {on:"mixed", who:"kai", t:"Ugh. The ingestion upgrade bumped the embedding model in the *ingest* config. The query service still pins the old one. Check the diff.", cmd:"git -C ~/repos/rag-platform show 4e1d2aa --stat"},
  {on:"diff", who:"sana", t:"While you're in there: make sure any re-embed keeps the ACL metadata on chunks. Last time we lost it and internal docs leaked into answers."}
 ],
 hints:["Separate retrieval from generation: look at the retrieval trace. Did the right chunk come back, and with what score?","A brand-new, exactly matching doc scoring ~0.1 cosine similarity means query and document vectors aren't in the same space.","Group chunks by the embedding model that produced them, and compare with the model the query service uses."],
 term:{host:"rag-ops", user:"oncall", suggest:["rag trace --query \"What is the new refund window for UPI?\"","rag eval --suite policies --last 7d"],
  cmds:[
  {m:["rag trace"], out:`query: "What is the new refund window for UPI?"
query_embedder: [c]text-embed-v2 (1024-d)[/c]
top-5 retrieved (cosine):
  0.71  faq/upi-limits.md#3           "UPI per-transaction limits for merchants…"
  0.69  policy/refunds-2024.md#2      "Refunds for card payments are processed within 7…"
  0.66  faq/settlement-times.md#1     "Settlements are credited T+1…"
  0.64  policy/refunds-2024.md#5      "UPI refunds are processed within 7 working days…"
  0.63  faq/chargebacks.md#4          "…"
[r]expected: policy/refunds-2025-11.md#1  rank 1,842  score 0.09[/r]
generator: received 5 chunks, none mention "5 days" → answered "I don't have that information."`, clue:"wrongchunks", unlock:["psql -c \"select embed_model, count(*), min(ingested_at)::date from chunks group by 1;\""]},
  {m:["rag eval"], out:`suite: policies (120 questions with gold chunks)
date        recall@5   faithfulness   answer_rate
11-13 Fri   0.92       0.95           0.97
11-14 Sat   0.91       0.96           0.97
11-16 Mon   [y]0.74[/y]       0.95           0.88
11-17 Tue   [r]0.63[/r]       0.96           0.79
11-18 Wed   [r]0.58[/r]       0.95           0.74
[d]faithfulness stays high: the model is faithful to whatever it's given[/d]`, clue:"recall", unlock:["rag trace --query \"What is the new refund window for UPI?\""]},
  {m:["psql -c \"select embed_model","psql -c \"select embed"], out:`   embed_model     |  count  |  min
-------------------+---------+------------
 text-embed-v2     | 1912044 | 2025-03-02
 [r]text-embed-v3[/r]     |  [r]611508[/r] | [r]2026-11-16[/r]
(2 rows)
[d]-- both stored in the same vector(1024) column and the same HNSW index[/d]`, clue:"mixed", unlock:["git -C ~/repos/rag-platform show 4e1d2aa --stat"]},
  {m:["git -C ~/repos/rag-platform show 4e1d2aa","git show 4e1d2aa"], out:`commit [y]4e1d2aa[/y]  (Mon 16 Nov 10:02, nikhil)
    Upgrade ingestion pipeline: new chunker + text-embed-v3

 ingest/config.yaml        | 4 ++--
 ingest/chunker.py         | 61 +++++++++++------
[d] query/config.yaml        | (unchanged)[/d]`, clue:"diff"},
  {m:["git -C ~/repos/rag-platform log","git log"], out:`[y]4e1d2aa[/y] (Mon 10:02, nikhil) Upgrade ingestion pipeline: new chunker + text-embed-v3
[y]a0c3317[/y] (Mon 09:40, kai)    System prompt: cite sources, say "I don't know" when unsure
[y]77b1e02[/y] (Thu, sana)        Enforce ACL filter on retrieval`, note:"Two Monday commits. The log alone doesn't say which one matters. Look at what each changed.", unlock:["git -C ~/repos/rag-platform show 4e1d2aa --stat","git -C ~/repos/rag-platform show a0c3317"]},
  {m:["git -C ~/repos/rag-platform show a0c3317","git show a0c3317"], out:`commit a0c3317 (Mon 09:40, kai)
- Answer the customer's question helpfully.
+ Answer only from the provided context. Cite the source.
+ If the context doesn't contain the answer, say "I don't have that information."`, note:"A good prompt change. It makes the bot honest about *missing context* instead of guessing. It exposed the retrieval problem; it didn't cause it."},
  {m:["curl -s llm-gateway/metrics","curl llm-gateway"], out:`p50_latency_ms 812   p95_latency_ms 2240   error_rate 0.2%
[d]Tue 14:00-14:40: p95 spiked to 9.8s (provider incident, resolved)[/d]`, note:"A 40-minute latency blip on Tuesday. Already resolved, and latency doesn't change *what* gets retrieved."}
 ]},
 dash:[
  {title:"Retrieval recall@5 (eval suite)", x:["Thu","Fri","Sat","Sun","Mon","Tue","Wed"], series:[{name:"recall@5", v:[0.92,0.92,0.91,0.91,0.74,0.63,0.58]}], marks:[{i:4, label:"Mon"}], clue:"recall"},
  {title:"Share of chunks embedded with v3", unit:"%", x:["Thu","Fri","Sat","Sun","Mon","Tue","Wed"], series:[{name:"% v3", v:[0,0,0,0,9,18,24]}], marks:[{i:4, label:"Mon"}], clue:"share"},
  {title:"LLM p95 latency (s)", unit:"s", x:["Thu","Fri","Sat","Sun","Mon","Tue","Wed"], series:[{name:"p95", v:[2.1,2.2,2.0,2.1,2.3,9.8,2.2]}], marks:[{i:5, label:"provider blip"}], note:"One spike on Tuesday that recovered. Recall fell on Monday and kept falling, so the timelines don't match."},
  {title:"Faithfulness (answers grounded in context)", x:["Thu","Fri","Sat","Sun","Mon","Tue","Wed"], series:[{name:"faithfulness", v:[0.95,0.95,0.96,0.95,0.95,0.96,0.95]}], note:"Flat. The model still sticks to what it's given; it's being *given* the wrong things. Generation isn't the problem."}
 ],
 uiName:"LangSmith",
 ui:[
  {title:"Trace · failing question", md:`| Step | Detail |
|---|---|
| embed_query | model **text-embed-v2** · 1024-d · 38 ms |
| vector_search | pgvector HNSW · k=5 · filter acl ⊂ {public, merchant} |
| top score | 0.71 (faq/upi-limits.md) |
| gold chunk | policy/refunds-2025-11.md#1 · embedded with **text-embed-v3** · score **0.09** |
| generate | 5 chunks in → "I don't have that information." |`, clue:"wrongchunks"},
  {title:"Trace · older question that also fails", md:`| Step | Detail |
|---|---|
| query | "How do I raise a chargeback?" |
| gold chunk | faq/chargebacks.md#2 · **re-chunked and re-embedded Monday with v3** (doc unchanged) |
| top score | 0.64 (a stale v2 duplicate of a different section) |`, clue:"oldfail"}
 ],
 files:[
  {path:"rag-platform/ingest/config.yaml", meta:"changed in 4e1d2aa (Mon)", text:`chunker:
  strategy: heading_aware
  max_tokens: 400
  overlap: 60
embedding:
  model: text-embed-v3        # was text-embed-v2
  dims: 1024
store:
  table: chunks
  index: hnsw_cosine`, clues:{6:"ingestv3"}, notes:{3:"Chunk size and overlap are reasonable. The new chunker isn't the problem."}},
  {path:"rag-platform/query/config.yaml", meta:"unchanged since March", text:`retrieval:
  embedding:
    model: text-embed-v2
    dims: 1024
  top_k: 5
  filter: acl
generation:
  model: claude-sonnet
  temperature: 0.2`, clues:{3:"queryv2"}, notes:{9:"Temperature 0.2 is fine for grounded answers. Sampling isn't why retrieval misses."}}
 ],
 clues:{
  recall:"Retrieval recall@5 fell from 0.91 to 0.58 starting Monday, while faithfulness stayed flat",
  wrongchunks:"For the failing question, the gold chunk exists but scores 0.09 (rank 1,842)",
  mixed:"The index mixes two embedding models: 1.9M v2 chunks plus 611k v3 chunks since Monday",
  share:"Share of v3-embedded chunks grows daily as docs get re-ingested",
  diff:"Commit 4e1d2aa switched ingestion to text-embed-v3; the query config wasn't touched",
  ingestv3:"ingest/config.yaml: «model: text-embed-v3»",
  queryv2:"query/config.yaml: queries still embedded with «text-embed-v2»",
  oldfail:"Old, unchanged docs fail too once they're re-chunked and re-embedded with v3"
 },
 cause:{q:"What's the root cause?", o:[
  {t:"Ingestion switched to a new embedding model (v3) but queries still use v2. Both land in the same 1024-d index, but the vector spaces aren't comparable, so every re-ingested chunk becomes unfindable", ok:true},
  {t:"Monday's cautious system prompt makes the bot refuse too often", ok:false, why:"The prompt only made the bot *honest* about missing context. Retrieval recall itself dropped, and faithfulness is unchanged.", say:[["kai","The prompt says \"don't guess\". But recall@5 dropped, which is measured *before* the prompt ever runs. The prompt only stopped the bot hiding it."]]},
  {t:"The LLM provider's latency incident degraded answers", ok:false, why:"The latency spike was 40 minutes on Tuesday. Recall fell on Monday and keeps falling.", say:[["priya","The latency blip was 40 minutes on Tuesday. Recall started falling Monday and is still falling today. Timelines don't match."]]},
  {t:"The new chunker splits policies badly", ok:false, why:"The gold chunk contains the exact answer and still scores 0.09. That's a vector-space problem, not a chunking one.", say:[["priya","The gold chunk literally says \"UPI refunds within 5 days\" and scores 0.09. Bad chunking gives you *partial* matches, not near-zero ones."]]}
 ]},
 fix:{q:"What do you ship? Pick every action you'd take.", o:[
  {t:"Re-embed the whole corpus with v3 into a **new** index (blue/green), run the eval suite, then switch query and ingest to v3 together", kind:"must", why:"Queries and documents must share one embedding model. Blue/green means no mixed state and an instant rollback.", miss:[["meera","Recall's back for old docs, but the new UPI refund policy still isn't found. Pinning ingest to v2 didn't re-embed the 611k v3 chunks already in the index."]]},
  {t:"Right now: point ingestion back to v2 and re-ingest Monday's documents with v2", kind:"must", why:"Fastest way to make the index consistent today while the v3 blue/green build runs.", miss:[["kai","The v3 rebuild will take ~2 days for 2.5M chunks. Meanwhile ingestion is *still* writing v3 into the live index, and recall dropped to 0.55. Stop the bleeding first."]]},
  {t:"Store «embed_model» on every chunk and have retrieval refuse to compare across models (fail loudly)", kind:"good", why:"Turns silent garbage into an error you'd catch the same day."},
  {t:"Add a recall@k eval gate to the ingestion pipeline's CI/CD", kind:"good", why:"A config change that tanks recall can't ship."},
  {t:"Keep ACL metadata on every re-embedded chunk and re-run the access-control eval", kind:"good", why:"A re-embed is a full rewrite of the index. Don't let a fix become a data leak."},
  {t:"Lower the generator temperature to 0", kind:"meh", why:"Sampling isn't the problem. The model never sees the right chunk."},
  {t:"Raise top_k from 5 to 100 so the right chunk gets in somewhere", kind:"bad", why:"The gold chunk is at rank 1,842. top_k=100 floods the context with noise, costs ~20× more tokens and still misses.", say:[["kai","top_k=100: token cost per answer went up 18×, latency doubled, and the refund policy is *still* not in the top 100. Rank was 1,842."]]},
  {t:"Revert Monday's system prompt so the bot answers more confidently", kind:"bad", why:"With the honesty instruction gone, the bot *invents* refund rules from the wrong chunks: confident and wrong.", say:[["sana","The bot just told a merchant that UPI refunds take \"7 working days\". That's the *old* policy, stated confidently. Support has two complaints already. Please put the guardrail back."]]}
 ]},
 post:{
  summary:"Support-assistant retrieval recall@5 fell from **0.91 to 0.58** over three days. \"I don't have that information\" answers rose 4.1× and human handoffs rose 62%. The newest policy docs were the hardest hit.",
  cause:"Commit «4e1d2aa» changed the **ingestion** embedding model to «text-embed-v3» but left the **query** service on «text-embed-v2». Both produce 1024-d vectors, so they fit the same column and HNSW index with no error, but they live in **different vector spaces**. Cosine similarity between a v2 query and a v3 chunk is essentially noise (~0.1). Every document ingested or re-ingested since Monday became unfindable, and that share grew daily. Monday's honest-answer prompt surfaced the problem instead of hiding it.",
  prevent:["Embedding model is versioned with the index: query and ingest read it from one place","Model changes go through blue/green re-indexing plus a recall eval gate","Each chunk stores «embed_model»; retrieval asserts it matches","Dashboards: recall@k and the \"no answer\" rate side by side, with deploy markers"]
 },
 learned:["Debug RAG in two halves: **retrieval** (did the right chunk come back?) then **generation** (did the model use it?).","Same dimensions ≠ same space. Query and document embeddings **must** come from the same model.","Flat **faithfulness** + falling **recall** = the model is fine; it's being fed the wrong context.","Embedding upgrades are **migrations**: re-embed everything, blue/green, eval gate, switch together."],
 cards:["embeddings","evals"]
}
]);

/* ===== Work simulator: RAG ===== */
QUEST.work("rag", [
{
 type:"tune", title:"Tune the retriever", three:"hit every goal in 2 runs or fewer",
 brief:"The support assistant answers from **1,800 policy and FAQ documents**. Your eval set has 200 real questions with the correct source chunk marked. Right now it finds the right chunk only **74%** of the time.\n\nGet retrieval to **90%+**, keep each answer **cheap** and **fast**. Prices: ₹0.08 per 1,000 prompt tokens; the prompt template itself is ~800 tokens.",
 knobs:[
  {k:"cs", label:"Chunk size", opts:[128,512,2048], def:2048, fmt:v => v + " tokens", help:"How big each indexed piece of a document is.\n\n- **Small (128)**: precise embeddings, but answers that span two sentences get split, and context around a rule is lost.\n- **Large (2048)**: one embedding has to represent many topics, so it matches nothing strongly (diluted), and every retrieved chunk is expensive to send.\n- **~300-800 tokens**, split on headings or paragraphs, is a common sweet spot for policy docs."},
  {k:"ov", label:"Overlap", opts:[0,15], def:0, fmt:v => v + "%", help:"How much consecutive chunks share. Overlap keeps a sentence that sits on a boundary complete in at least one chunk. 10-20% is typical; it costs a little more storage."},
  {k:"hy", label:"Hybrid search (BM25 + vectors)", opts:["off","on"], def:"off", help:"Vector search finds **meaning** but is weak on exact tokens: error codes («ERR_4012»), product names, numbers. **BM25** keyword search is great at those. **Hybrid** runs both and merges the rankings (e.g. reciprocal rank fusion)."},
  {k:"k", label:"top_k sent to the model", opts:[3,8,30], def:3, help:"How many chunks go into the prompt. More chunks raise recall but cost more tokens, add latency, and can **bury** the right chunk (models use the start and end of long contexts better than the middle)."},
  {k:"rr", label:"Reranker", opts:["off","on"], def:"off", help:"A **cross-encoder** reads the question and each candidate together and re-scores them, much more accurately than vector similarity. Typical setup: retrieve ~50 candidates cheaply, rerank, keep the best top_k. Adds ~300-400 ms."}
 ],
 metrics:[
  {k:"rec", label:"Recall (right chunk found)", unit:"%", gl:"≥ 90%", goal:v => v >= 90},
  {k:"cost", label:"Cost per answer", gl:"≤ ₹0.40", goal:v => v <= 0.4, show:v => "₹" + v.toFixed(2)},
  {k:"lat", label:"Latency p95", unit:" s", gl:"≤ 2.5 s", goal:v => v <= 2.5, show:v => v.toFixed(1)}
 ],
 sim:v => {
  const log = []; let r = {128:0.70, 512:0.80, 2048:0.74}[v.cs];
  log.push(`Chunk size ${v.cs}: base recall **${Math.round(r * 100)}%**${v.cs === 2048 ? " (big chunks dilute the embedding: each one is about many things)" : v.cs === 128 ? " (tiny chunks split rules from their conditions)" : ""}.`);
  if (v.ov){ const g = v.cs === 2048 ? 0.01 : 0.04; r += g; log.push(`Overlap keeps boundary sentences whole: **+${Math.round(g * 100)}%**.`); }
  if (v.hy === "on"){ r += 0.06; log.push(`Hybrid search finds exact codes and names («ERR_4012», «UPI Lite»): **+6%**.`); }
  const kg = {3:0, 8:0.06, 30:0.10}[v.k]; if (kg){ r += kg; log.push(`top_k ${v.k}: more chances to include the right chunk: **+${Math.round(kg * 100)}%**.`); }
  if (v.rr === "on"){ r += v.k === 30 ? 0.02 : 0.06; log.push(`Reranker picks the best of 50 candidates for the top ${v.k}: **+${v.k === 30 ? 2 : 6}%**${v.k === 30 ? " (less gain: you were already sending most candidates)" : ""}.`); }
  const ctx = v.k * v.cs; if (ctx > 8000){ r -= 0.04; log.push(`${ctx.toLocaleString()} tokens of context: the right chunk gets **lost in the middle**, −4%.`); }
  const rec = Math.round(Math.min(0.98, r) * 100), cost = (ctx + 800) / 1000 * 0.08, lat = 0.9 + ctx / 1000 * 0.25 + (v.rr === "on" ? 0.35 : 0) + (v.hy === "on" ? 0.1 : 0);
  log.push(`Prompt ≈ ${(ctx + 800).toLocaleString()} tokens → **₹${cost.toFixed(2)}** per answer, **${lat.toFixed(1)} s** p95.`);
  return {m:{rec, cost, lat}, log};
 },
 best:"A strong setup: **512-token chunks, 15% overlap, hybrid search on, reranker on, top_k 3**: ~96% recall, ~₹0.19 and ~1.7 s per answer. Retrieve wide and cheap, rerank, and send the model only a few excellent chunks.",
 deep:[
  {t:"Measure retrieval separately from generation", md:"- Build an eval set: real questions + the **gold chunk(s)** that contain the answer.\n- **Recall@k**: is a gold chunk in the top k? **MRR**: how high does it rank?\n- Only after retrieval is good, judge generation: **faithfulness** (does the answer stick to the context?) and **answer correctness**.\n- Tune one knob at a time and re-run the eval. Track cost and latency next to quality."},
  {t:"Chunking that respects the document", md:"- Split on **structure** (headings, sections, list items) before falling back to token counts.\n- Prepend the **document title and section path** to each chunk («Refund policy › UPI › Timelines»). It improves embeddings and helps the model cite.\n- Keep tables whole; convert them to text rows if needed.\n- Store metadata (doc id, version, effective date, ACL) for **filtering** before similarity search."},
  {t:"Retrieve → rerank → generate", md:"| Stage | Tool | Goal |\n|---|---|---|\n| Retrieve | Vector + BM25 (hybrid), metadata filters | **High recall**, cheap: ~50 candidates |\n| Rerank | Cross-encoder | **High precision**: best 3-5 |\n| Generate | LLM with citations | Faithful answer from few, relevant chunks |\n\nSending 30 chunks \"to be safe\" costs more, adds latency and often lowers accuracy (*lost in the middle*). A reranker usually beats a bigger top_k."}
 ],
 say:"I tune RAG retrieval with an eval set and recall@k: structure-aware chunks of a few hundred tokens with some overlap, hybrid BM25 plus vector search for exact terms, then a cross-encoder reranker so I can send the model only three to five strong chunks, which keeps cost and latency down."
}
]);
