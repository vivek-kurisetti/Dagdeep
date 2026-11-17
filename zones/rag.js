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
