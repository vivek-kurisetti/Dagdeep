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
