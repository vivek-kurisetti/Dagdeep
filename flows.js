const KIND_NAMES = {actor:"Client / engine", proc:"Compute layer", mem:"Memory", disk:"Durable storage", log:"Log / stream", meta:"Metadata / catalog"};
const STATE_NAMES = {memory:"memory", disk:"on disk", network:"shipped", catalog:"catalog", client:"client"};

const FLOWS = {
"mysql-write": {
  tab:"MySQL", sub:"write",
  intro:"<b>INSERT then COMMIT in InnoDB.</b> Watch how MySQL makes a change durable through the redo log and binlog, while the data page itself reaches disk much later.",
  nodes:{
    client:{c:0,r:0,label:"Client app",sub:"JDBC / mysql CLI",k:"actor"},
    sql:{c:1,r:0,label:"SQL layer",sub:"parser · optimizer",k:"proc"},
    replica:{c:2,r:0,label:"Replica / CDC",sub:"replica, Debezium",k:"actor"},
    undo:{c:0,r:1,label:"Undo log",sub:"rollback segments",k:"log"},
    innodb:{c:1,r:1,label:"InnoDB engine",sub:"trx, locks, B+tree",k:"proc"},
    binlog:{c:2,r:1,label:"Binary log",sub:"binlog.000042",k:"log"},
    bp:{c:1,r:2,label:"Buffer pool",sub:"16 KB pages, LRU",k:"mem"},
    logbuf:{c:2,r:2,label:"Log buffer",sub:"redo, in memory",k:"mem"},
    dw:{c:0,r:3,label:"Doublewrite",sub:"torn-page guard",k:"disk"},
    ibd:{c:1,r:3,label:"orders.ibd",sub:"tablespace file",k:"disk"},
    redo:{c:2,r:3,label:"Redo log files",sub:"#innodb_redo",k:"disk"}
  },
  steps:[
    {f:"client",t:"sql",title:"INSERT reaches the server",body:"A connection thread receives the statement. The SQL layer parses it, checks privileges, and the optimizer confirms the row goes into the PRIMARY key. The transaction is open.",code:"BEGIN;\nINSERT INTO orders (id, customer_id, amount, status)\nVALUES (1001, 42, 7499.00, 'NEW');",add:[["client","Transaction open, statement parsed"]]},
    {f:"sql",t:"innodb",title:"Executor hands the row to InnoDB",body:"The executor calls the storage engine handler (<code>write_row</code>). InnoDB assigns a transaction ID and takes an insert-intention lock on the gap where id 1001 belongs, so inserts into other gaps still proceed in parallel.",add:[["memory","trx 5507 assigned, insert-intention lock held"]]},
    {f:"ibd",t:"bp",title:"Fetch the target page",body:"InnoDB walks the clustered index B+tree down to the leaf page where 1001 belongs. If that 16 KB page is not in the buffer pool yet, it is read from orders.ibd. Hot pages are usually already cached.",add:[["memory","Leaf page (space 12, page 4) cached"]]},
    {f:"innodb",t:"undo",title:"Write an undo record",body:"Before touching the row, InnoDB records how to reverse the change. ROLLBACK uses it, and so do other transactions whose snapshots must not see row 1001 yet.",add:[["memory","Undo: delete id 1001 (for rollback and MVCC)"]]},
    {f:"innodb",t:"bp",title:"Change the page in memory",body:"The row is inserted into the leaf page inside the buffer pool and the page is marked dirty. The data file on disk has not changed at all.",add:[["memory","Dirty page in buffer pool"]]},
    {f:"bp",t:"logbuf",title:"Describe the change in redo",body:"A small redo record (which page changed and how, tagged with an LSN) goes into the in-memory log buffer. Redo is compact and written sequentially, which is why MySQL can confirm a commit without writing the whole 16 KB page.",add:[["memory","Redo record in log buffer, LSN 88,231,904"]]},
    {f:"client",t:"sql",title:"Client sends COMMIT",body:"With binary logging on, MySQL runs an internal two-phase commit between InnoDB and the binlog, so both agree on whether this transaction happened.",code:"COMMIT;",add:[["client","COMMIT requested"]]},
    {f:"logbuf",t:"redo",title:"Prepare: flush redo to disk",body:"InnoDB writes the transaction's redo to the redo log files and fsyncs them (<code>innodb_flush_log_at_trx_commit = 1</code>). The transaction is now PREPARED.",add:[["disk","Redo durable on disk (PREPARED)"]]},
    {f:"sql",t:"binlog",title:"Write and sync the binlog",body:"The change is written to the binary log as a Write_rows event and fsynced (<code>sync_binlog = 1</code>). Group commit batches many transactions into one fsync. Once this event is on disk, crash recovery will treat the transaction as committed.",add:[["disk","Write_rows event in binlog.000042"]]},
    {f:"logbuf",t:"redo",title:"Commit: mark it done in redo",body:"InnoDB writes a commit mark for the transaction and releases its locks. This write needs no separate fsync because the binlog already settled the outcome.",add:[["memory","Locks released, trx 5507 committed"]]},
    {f:"sql",t:"client",title:"OK goes back to the client",body:"The client gets its OK. The change is durable through redo and binlog, yet the data page is still only in memory. After a crash, recovery would replay redo to rebuild it.",add:[["client","Query OK, 1 row affected"]]},
    {f:"bp",t:"dw",title:"Background flush via doublewrite",body:"Later, page cleaner threads flush dirty pages. Each page is first written to the doublewrite area, so a crash halfway through a page write cannot leave a torn page.",add:[["disk","Page copy in doublewrite file"]]},
    {f:"dw",t:"ibd",title:"Page lands in orders.ibd",body:"The page is written to its real place in the tablespace. The checkpoint LSN moves past 88,231,904, so that part of the redo log can be reused.",add:[["disk","orders.ibd updated, checkpoint advanced"]]},
    {f:"binlog",t:"replica",title:"Replicas and CDC read the binlog",body:"Replica I/O threads and tools like Debezium stream the binlog events. This is where the <b>MySQL → Iceberg CDC</b> flow starts.",add:[["network","Event shipped to replica / Debezium"]]}
  ]
},
"mysql-read": {
  tab:"MySQL", sub:"read",
  intro:"<b>SELECT through a secondary index.</b> See how the optimizer picks an index, how InnoDB finds rows through two B+trees, and how MVCC hides changes your snapshot should not see.",
  nodes:{
    client:{c:0,r:0,label:"Client app",sub:"JDBC / mysql CLI",k:"actor"},
    parser:{c:1,r:0,label:"Parser",sub:"syntax, privileges",k:"proc"},
    optimizer:{c:2,r:0,label:"Optimizer",sub:"cost-based plan",k:"proc"},
    readview:{c:0,r:1,label:"Read view",sub:"MVCC snapshot",k:"mem"},
    innodb:{c:1,r:1,label:"InnoDB",sub:"index cursors",k:"proc"},
    undo:{c:0,r:2,label:"Undo log",sub:"older row versions",k:"log"},
    bp:{c:1,r:2,label:"Buffer pool",sub:"cached index pages",k:"mem"},
    ibd:{c:2,r:2,label:"orders.ibd",sub:"PRIMARY + idx_customer",k:"disk"}
  },
  steps:[
    {f:"client",t:"parser",title:"SELECT arrives",body:"The connection thread parses the statement, resolves table and column names and checks privileges.",code:"SELECT id, amount, status\nFROM orders\nWHERE customer_id = 42;",add:[["client","Statement parsed"]]},
    {f:"parser",t:"optimizer",title:"Optimizer picks a plan",body:"Using index statistics, the optimizer compares a full table scan with the secondary index idx_customer. It expects about 2 rows, so it picks an index lookup. EXPLAIN would show <code>type: ref</code>, <code>key: idx_customer</code>.",add:[["memory","Plan: ref on idx_customer, ~2 rows"]]},
    {f:"optimizer",t:"innodb",title:"Executor opens an index cursor",body:"The executor asks InnoDB for rows where customer_id = 42 through the handler interface, then keeps calling back for the next row.",add:[["memory","Cursor open on idx_customer"]]},
    {f:"innodb",t:"readview",title:"Take a consistent snapshot",body:"Under REPEATABLE READ, the first read creates a read view: the set of transactions still running. Their changes stay invisible to this query even if they commit mid-way. A plain SELECT takes no row locks.",add:[["memory","Read view: trx 5507 still active"]]},
    {f:"innodb",t:"bp",title:"Search the secondary index",body:"InnoDB walks idx_customer from root to leaf. Secondary index entries hold the indexed value plus the primary key, so it finds (42 → 1001) and (42 → 1007).",add:[["memory","Index hits: PK 1001, PK 1007"]]},
    {f:"ibd",t:"bp",title:"Cache miss reads from disk",body:"One leaf page was not cached, so it is read from orders.ibd. New pages enter the old end of the LRU list, so a single large scan cannot push out the hot working set.",add:[["disk","Page read from orders.ibd into pool"]]},
    {f:"bp",t:"innodb",title:"Look up full rows by primary key",body:"The secondary index only gave ids, so InnoDB descends the clustered index (PRIMARY) for each id to get amount and status. A covering index on (customer_id, amount, status) would skip this step.",add:[["memory","Full rows fetched from PRIMARY"]]},
    {f:"innodb",t:"undo",title:"Check visibility with MVCC",body:"Row 1007 was last changed by trx 5507, which the read view lists as active. InnoDB follows the row's undo pointer and rebuilds the version that was committed before the snapshot.",add:[["memory","Row 1007 rebuilt from undo"]]},
    {f:"innodb",t:"client",title:"Rows stream back",body:"The executor applies any remaining filters and sends rows to the client. Nothing was written and no locks were taken.",add:[["client","2 rows returned"]]}
  ]
},
"iceberg-write": {
  tab:"Iceberg", sub:"write", top:40,
  intro:"<b>Appending a batch to an Iceberg table.</b> Data files are written first and stay invisible. A tree of metadata files is built on top, and one atomic pointer swap in the catalog makes everything visible at once.",
  nodes:{
    catalog:{c:0,r:0,label:"Catalog",sub:"Glue / REST / Nessie",k:"meta"},
    metadata:{c:1,r:0,label:"metadata.json",sub:"schema, snapshots",k:"meta"},
    readers:{c:2,r:0,label:"Readers",sub:"Athena · Trino · Spark",k:"actor"},
    writer:{c:0,r:1.5,label:"Spark writer",sub:"driver + executors",k:"proc"},
    mlist:{c:1,r:1,label:"Manifest list",sub:"one per snapshot",k:"meta"},
    manifest:{c:1,r:2,label:"Manifests",sub:"Avro: files + stats",k:"meta"},
    data:{c:1,r:3,label:"Data files",sub:"Parquet on S3",k:"disk"}
  },
  steps:[
    {f:"writer",t:"catalog",title:"Look up the table",body:"The driver asks the catalog for lake.sales.orders. For each table the catalog keeps essentially one thing: a pointer to the current metadata file.",code:"INSERT INTO lake.sales.orders\nSELECT * FROM staging_orders\nWHERE order_date = DATE '2026-11-05';",add:[["catalog","Pointer → 00012-….metadata.json"]]},
    {f:"metadata",t:"writer",title:"Read the current metadata",body:"metadata.json holds the schema, the partition spec (<code>days(order_ts)</code>), sort order, properties and the snapshot history. The writer notes the current snapshot as its starting point.",add:[["memory","Base snapshot 7741, spec days(order_ts)"]]},
    {f:"writer",t:"data",title:"Write Parquet data files",body:"Executors write new files into the right partition and collect per-column stats as they go: row count, null count, min and max. No reader can see these files yet because nothing points to them.",add:[["disk","data/order_ts_day=2026-11-05/….parquet ×4"]]},
    {f:"writer",t:"manifest",title:"Write a manifest",body:"A manifest is an Avro file listing data files with their partition values and column stats. Readers later use these stats to skip files without opening them.",add:[["disk","metadata/9c1e…-m0.avro (lists 4 files)"]]},
    {f:"writer",t:"mlist",title:"Write a manifest list",body:"The manifest list is the snapshot. It points to the new manifest and reuses all existing manifests unchanged, each with a summary of the partitions it covers. An append never rewrites old metadata.",add:[["disk","metadata/snap-8812-….avro"]]},
    {f:"writer",t:"metadata",title:"Write the next metadata.json",body:"A new metadata file is written with snapshot 8812 added to the history and set as current. Files are never edited in place, so version 12 still exists next to it.",add:[["disk","metadata/00013-….metadata.json"]]},
    {f:"writer",t:"catalog",title:"Atomic commit: swap the pointer",body:"The writer asks the catalog to move the pointer from v12 to v13, but only if it still points to v12. If another job committed first, the writer reloads, checks for conflicts and retries with fresh metadata. The data files are reused.",add:[["catalog","Pointer → 00013 (committed)"]]},
    {f:"readers",t:"catalog",bend:120,title:"Readers pick up the new snapshot",body:"The next query that loads the table sees snapshot 8812. Queries already running keep reading snapshot 7741 until they finish. Time travel back to 7741 works until expire_snapshots removes it.",code:"SELECT count(*) FROM lake.sales.orders\nFOR VERSION AS OF 7741;",add:[["network","Snapshot 8812 visible to new queries"]]}
  ]
},
"iceberg-read": {
  tab:"Iceberg", sub:"read",
  intro:"<b>Querying an Iceberg table.</b> The engine never lists S3 folders. It walks down the metadata tree and uses stats at each level to skip whole groups of files before reading any data.",
  nodes:{
    catalog:{c:0,r:0,label:"Catalog",sub:"Glue / REST / Nessie",k:"meta"},
    metadata:{c:1,r:0,label:"metadata.json",sub:"schema, snapshots",k:"meta"},
    engine:{c:0,r:1.5,label:"Query engine",sub:"Trino / Athena / Spark",k:"proc"},
    mlist:{c:1,r:1,label:"Manifest list",sub:"partition summaries",k:"meta"},
    result:{c:2,r:1.5,label:"Result",sub:"rows to the client",k:"actor"},
    manifest:{c:1,r:2,label:"Manifests",sub:"file-level stats",k:"meta"},
    deletes:{c:0,r:3,label:"Delete files",sub:"merge-on-read",k:"disk"},
    data:{c:1,r:3,label:"Data files",sub:"Parquet on S3",k:"disk"}
  },
  steps:[
    {f:"engine",t:"catalog",title:"Resolve the table",body:"The engine asks the catalog where the current metadata file lives. One small lookup replaces slow directory listing on S3.",code:"SELECT customer_id, sum(amount)\nFROM lake.sales.orders\nWHERE order_ts >= TIMESTAMP '2026-11-05 00:00'\n  AND amount > 5000\nGROUP BY customer_id;",add:[["catalog","Pointer → 00013-….metadata.json"]]},
    {f:"metadata",t:"engine",title:"Read table metadata",body:"The engine loads the schema, partition spec and current snapshot. Because the table is partitioned by <code>days(order_ts)</code>, the filter on order_ts becomes a partition filter automatically. Nobody has to write a partition column in the query.",add:[["memory","Snapshot 8812, filter on order_ts_day ≥ 2026-11-05"]]},
    {f:"mlist",t:"engine",title:"Prune manifests",body:"The manifest list stores the partition range each manifest covers. Manifests that only cover older days are skipped without being opened.",add:[["memory","Manifests: 38 → 3"]]},
    {f:"manifest",t:"engine",title:"Prune data files",body:"Each manifest entry carries the file's partition values and column min/max. Files whose maximum amount is below 5000 are dropped as well. Most of the work is avoided here.",add:[["memory","Data files: 1,240 → 17"]]},
    {f:"data",t:"engine",title:"Read only what is needed",body:"Workers open the 17 Parquet files, read only the customer_id, amount and order_ts columns, and skip row groups using Parquet's own stats.",add:[["disk","≈ 410 MB read from a 96 GB table"]]},
    {f:"deletes",t:"engine",title:"Apply delete files",body:"On a format v2 table using merge-on-read, updates and deletes are stored as separate delete files. The engine applies them while reading, so removed or replaced rows never show. Compaction later folds them into the data files.",add:[["memory","312 rows hidden by delete files"]]},
    {f:"engine",t:"result",title:"Aggregate and return",body:"Workers aggregate and return the result. The query read one consistent snapshot, so a commit landing mid-query did not change its answer.",add:[["client","8,904 rows returned"]]}
  ]
},
"cdc": {
  tab:"MySQL → Iceberg", sub:"CDC",
  intro:"<b>Near-real-time CDC from MySQL into the lakehouse.</b> One UPDATE travels through the binlog, Debezium, Kafka and Flink, and becomes an Iceberg commit a few minutes later.",
  nodes:{
    app:{c:0,r:0,label:"Application",sub:"payments service",k:"actor"},
    mysql:{c:1,r:0,label:"MySQL",sub:"binlog_format=ROW",k:"disk"},
    debezium:{c:2,r:0,label:"Debezium",sub:"Kafka Connect source",k:"proc"},
    iceberg:{c:0,r:1,label:"Iceberg table",sub:"format v2 on S3",k:"disk"},
    flink:{c:1,r:1,label:"Flink job",sub:"upsert sink",k:"proc"},
    kafka:{c:2,r:1,label:"Kafka topic",sub:"cdc.payments.orders",k:"log"},
    query:{c:0,r:2,label:"Query engines",sub:"Athena · Trino",k:"actor"},
    maint:{c:1,r:2,label:"Maintenance",sub:"compaction, expiry",k:"proc"},
    ckpt:{c:2,r:2,label:"Checkpoint",sub:"state + offsets, S3",k:"disk"}
  },
  steps:[
    {f:"app",t:"mysql",title:"Row changes in MySQL",body:"The commit follows the MySQL write path. With <code>binlog_format=ROW</code> and <code>binlog_row_image=FULL</code>, the binlog event carries the full row before and after the change.",code:"UPDATE orders SET status = 'PAID'\nWHERE id = 1001;\nCOMMIT;",add:[["disk","binlog.000042 pos 77311: Update_rows"]]},
    {f:"mysql",t:"debezium",title:"Debezium tails the binlog",body:"Debezium connects like a replica with its own server_id and streams events from its last saved GTID set. On first start it takes a consistent snapshot of existing rows, then switches to the binlog.",add:[["network","Event read at GTID …:91822"]]},
    {f:"debezium",t:"kafka",title:"Publish a change event",body:"The event is keyed by primary key, so every change to order 1001 goes to the same partition and stays in order.",code:'{\n  "op": "u",\n  "before": { "id": 1001, "status": "NEW" },\n  "after":  { "id": 1001, "status": "PAID" },\n  "source": { "file": "binlog.000042", "pos": 77311 },\n  "ts_ms": 1793873400000\n}',add:[["network","cdc.payments.orders p3, offset 99102"]]},
    {f:"kafka",t:"flink",title:"Flink turns events into upserts",body:"The job reads the topic, keeps the latest change per key, and maps op c/u/d to insert, upsert or delete. Kafka offsets are kept in Flink state instead of being committed right away.",add:[["memory","Upsert id=1001, status=PAID"]]},
    {f:"flink",t:"iceberg",title:"Write data and delete files",body:"For an upsert the sink writes the new row to a data file plus an equality delete (id = 1001) that hides the old version. These files are pending and belong to no snapshot yet.",add:[["disk","1 data file + 1 equality-delete file (pending)"]]},
    {f:"flink",t:"ckpt",title:"Checkpoint",body:"At each checkpoint Flink saves its Kafka offsets and the list of pending files together. If the job fails, it restarts from here, so nothing is lost or committed twice.",add:[["disk","Checkpoint 4411: offset 99102 + pending files"]]},
    {f:"flink",t:"iceberg",title:"Commit the snapshot",body:"When the checkpoint completes, the committer makes a single Iceberg commit with all pending files. The checkpoint interval, often one to five minutes, decides how fresh the lake is.",add:[["catalog","Snapshot committed (sequence 2214)"]]},
    {f:"iceberg",t:"query",title:"Analysts query fresh data",body:"Queries see order 1001 as PAID a few minutes after the MySQL commit. Merge-on-read applies the equality delete, so only the latest version appears.",add:[["client","Row visible ~1–5 min after MySQL commit"]]},
    {f:"maint",t:"iceberg",title:"Compact and clean up",body:"Streaming commits leave many small files and delete files behind. Scheduled jobs compact them and apply deletes, expire old snapshots, and purge files nothing references any more.",code:"CALL lake.system.rewrite_data_files(table => 'sales.orders');\nCALL lake.system.expire_snapshots(\n  table => 'sales.orders',\n  older_than => TIMESTAMP '2026-11-03 00:00');\nCALL lake.system.remove_orphan_files(table => 'sales.orders');",add:[["disk","Small files compacted, old snapshots expired"]]}
  ]
}
};
const ORDER = ["mysql-write","mysql-read","iceberg-write","iceberg-read","cdc"];

const PAD=24, COLW=210, ROWH=118, NW=186, NH=72;
const $ = id => document.getElementById(id);
const svg = $("svg");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let flowId = null, flow = null, cur = 0, playing = false, timer = null, raf = null, compact = null, centers = {};

function esc(s){return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}

function buildTabs(){
  $("tabs").innerHTML = ORDER.map(id => `<a href="#${id}" data-id="${id}">${FLOWS[id].tab}<small>${FLOWS[id].sub}</small></a>`).join("");
}

function geometry(){
  centers = {};
  const top = flow.top || 0;
  let maxR = 0;
  for (const [id,n] of Object.entries(flow.nodes)){
    centers[id] = {x: PAD + n.c*COLW + COLW/2, y: PAD + top + n.r*ROWH + NH/2};
    maxR = Math.max(maxR, n.r);
  }
  return {w: PAD*2 + 3*COLW, h: PAD*2 + top + maxR*ROWH + NH};
}

function clip(p, toward){
  const dx = toward.x - p.x, dy = toward.y - p.y;
  const s = Math.min((NW/2+5)/Math.max(Math.abs(dx),1e-6), (NH/2+5)/Math.max(Math.abs(dy),1e-6));
  return {x: p.x + dx*s, y: p.y + dy*s};
}

function edgePath(st){
  const A = centers[st.f], B = centers[st.t];
  const dx = B.x-A.x, dy = B.y-A.y, len = Math.hypot(dx,dy) || 1;
  const n = {x: -dy/len, y: dx/len};
  const off = 5, bend = st.bend || 0;
  const a = {x:A.x+n.x*off, y:A.y+n.y*off}, b = {x:B.x+n.x*off, y:B.y+n.y*off};
  const ctrl = {x:(a.x+b.x)/2 + n.x*bend, y:(a.y+b.y)/2 + n.y*bend};
  const s = clip(a, ctrl), e = clip(b, ctrl);
  return `M${s.x.toFixed(1)} ${s.y.toFixed(1)} Q${ctrl.x.toFixed(1)} ${ctrl.y.toFixed(1)} ${e.x.toFixed(1)} ${e.y.toFixed(1)}`;
}

function renderDiagram(){
  const {w,h} = geometry();
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  let out = `<defs>${["future","past","active"].map(c =>
    `<marker id="mk-${c}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="${c==="active"?5:6}" markerHeight="${c==="active"?5:6}" orient="auto-start-reverse"><path class="mk-${c}" d="M0 0 L10 5 L0 10 z"/></marker>`).join("")}</defs>`;
  out += `<g id="edges">` + flow.steps.map((st,i) => `<path id="e${i}" class="edge future" d="${edgePath(st)}" marker-end="url(#mk-future)"/>`).join("") + `</g>`;
  out += `<g id="nodes">`;
  for (const [id,n] of Object.entries(flow.nodes)){
    const c = centers[id], x = c.x-NW/2, y = c.y-NH/2;
    out += `<g class="node k-${n.k}" id="n-${id}"><rect class="box" x="${x}" y="${y}" width="${NW}" height="${NH}" rx="10"/>`+
      `<rect class="stripe" x="${x+8}" y="${y+14}" width="5" height="${NH-28}" rx="2.5"/>`;
    if (compact){
      out += `<text class="lbl" x="${c.x+5}" y="${c.y+8}" text-anchor="middle" style="font-size:22px">${esc(n.label)}</text>`;
    } else {
      out += `<text class="lbl" x="${c.x+5}" y="${c.y-3}" text-anchor="middle">${esc(n.label)}</text>`+
        `<text class="sub" x="${c.x+5}" y="${c.y+18}" text-anchor="middle">${esc(n.sub)}</text>`;
    }
    out += `</g>`;
  }
  out += `</g><circle id="halo" class="packet-halo" r="13" cx="-50" cy="-50"/><circle id="packet" class="packet" r="6.5" cx="-50" cy="-50"/>`;
  svg.innerHTML = out;
  const kinds = [...new Set(Object.values(flow.nodes).map(n => n.k))];
  $("legend").innerHTML = kinds.map(k => `<span><i style="background:var(--k-${k})"></i>${KIND_NAMES[k]}</span>`).join("");
}

function movePacket(i, animate){
  cancelAnimationFrame(raf);
  const path = $("e"+i), p = $("packet"), h = $("halo");
  if (!path) return;
  const len = path.getTotalLength();
  const place = t => { const pt = path.getPointAtLength(len*t); for (const el of [p,h]){ el.setAttribute("cx",pt.x); el.setAttribute("cy",pt.y);} };
  if (!animate || reduceMotion){ place(1); return; }
  const start = performance.now(), dur = 950;
  const tick = now => {
    const t = Math.min(1,(now-start)/dur), e = t<.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2;
    place(e);
    if (t<1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

function go(i, animate=true){
  const N = flow.steps.length;
  cur = Math.max(0, Math.min(N-1, i));
  const st = flow.steps[cur];
  flow.steps.forEach((_,j) => {
    const e = $("e"+j), cls = j===cur ? "active" : j<cur ? "past" : "future";
    e.setAttribute("class", "edge "+cls);
    e.setAttribute("marker-end", `url(#mk-${cls})`);
  });
  $("e"+cur).parentNode.appendChild($("e"+cur));
  for (const id of Object.keys(flow.nodes)){
    const g = $("n-"+id);
    g.classList.toggle("on", id===st.f || id===st.t);
  }
  movePacket(cur, animate);

  const fl = flow.nodes[st.f].label, tl = flow.nodes[st.t].label;
  $("card").innerHTML = `<p class="kicker">Step ${cur+1} · ${esc(fl)} <em>→</em> ${esc(tl)}</p><h2>${st.title}</h2><p>${st.body}</p>` +
    (st.code ? `<pre><code>${esc(st.code)}</code></pre>` : "");
  $("counter").textContent = `Step ${cur+1} of ${N}`;
  $("bar").style.width = ((cur+1)/N*100)+"%";
  $("prev").disabled = cur===0;
  $("next").disabled = cur===N-1;

  const items = [];
  flow.steps.slice(0,cur+1).forEach((s,j) => (s.add||[]).forEach(a => items.push({j, kind:a[0], text:a[1]})));
  $("state").innerHTML = items.map(it =>
    `<li class="${it.j===cur?"new":""}"><span class="num">${String(it.j+1).padStart(2,"0")}</span><span class="chip c-${it.kind}">${STATE_NAMES[it.kind]}</span><span class="txt">${esc(it.text)}</span></li>`).join("");

  [...$("steps").querySelectorAll("button")].forEach((b,j) => {
    b.className = j===cur ? "on" : j<cur ? "done" : "";
    b.setAttribute("aria-current", j===cur ? "step" : "false");
  });
}

function stop(){ playing=false; clearTimeout(timer); $("play").textContent = "Play"; }
function play(){
  if (cur >= flow.steps.length-1) go(0);
  playing = true; $("play").textContent = "Pause";
  const tick = () => {
    timer = setTimeout(() => {
      if (!playing) return;
      if (cur < flow.steps.length-1){ go(cur+1); tick(); } else stop();
    }, 2800);
  };
  tick();
}

function showMode(m){
  if (m !== "flows" && typeof stop === "function") stop();
  $("flowsView").hidden = m!=="flows";
  $("courseView").hidden = m!=="courses";
  [["modeFlows","flows"],["modeCourses","courses"]].forEach(([id, k]) => {
    if (m === k) $(id).setAttribute("aria-current","page"); else $(id).removeAttribute("aria-current");
  });
  if (m === "flows") document.title = "Data flows · Dagdeep";
}

function loadFlow(id){
  if (!FLOWS[id]) id = ORDER[0];
  stop();
  flowId = id; flow = FLOWS[id];
  [...$("tabs").querySelectorAll("a")].forEach(a => { if (a.dataset.id===id) a.setAttribute("aria-current","page"); else a.removeAttribute("aria-current"); });
  showMode("flows");
  $("modeFlows").href = "#"+id;
  compact = $("diagramWrap").clientWidth < 560;
  $("intro").innerHTML = flow.intro;
  $("steps").innerHTML = flow.steps.map((s,j) => `<li><button data-j="${j}">${s.title}</button></li>`).join("");
  renderDiagram();
  go(0, false);
}

function route(){
  const h = location.hash.slice(1);
  if (FLOWS[h]) loadFlow(h);
  else loadQuest(h);
}

function checkCompact(){
  if ($("flowsView").hidden) return;
  const c = $("diagramWrap").clientWidth < 560;
  if (c !== compact){ compact = c; if (flow){ const k = cur; renderDiagram(); go(k,false); } }
}

/* ---------- Shared text helpers (used by courses) ---------- */
/* ----- text helpers ----- */
const LVL = {B:"Fundamentals", I:"Intermediate", S:"Senior"};
function inl(t){ return esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/«(.+?)»/g, "<code>$1</code>"); }
function md(src){
  const out = []; let para = [], list = null, code = null, block = null, table = null, sec = 0;
  const flushP = () => { if (para.length){ out.push(`<p>${inl(para.join(" "))}</p>`); para = []; } };
  const flushL = () => { if (list){ out.push(`<${list.t}>${list.items.map(i => `<li>${inl(i)}</li>`).join("")}</${list.t}>`); list = null; } };
  const flushT = () => { if (table){ const [h, ...rows] = table; out.push(`<div class="tbl"><table><thead><tr>${h.map(c => `<th>${inl(c)}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inl(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`); table = null; } };
  const flushAll = () => { flushP(); flushL(); flushT(); };
  const stepOf = l => { const [a, b] = l.split(" :: "); return b ? [a.trim(), b.trim()] : a.trim(); };
  const endBlock = () => {
    const {kind, title, lines} = block;
    if (kind === "flow") out.push(`<figure class="dflow">${title ? `<figcaption>${inl(title)}</figcaption>` : ""}${flowHTML(lines.filter(l => l.trim()).map(stepOf))}</figure>`);
    else if (kind === "lanes"){
      const lanes = []; lines.forEach(l => { if (l.startsWith("# ")) lanes.push({label:l.slice(2), steps:[]}); else if (l.trim() && lanes.length) lanes[lanes.length-1].steps.push(stepOf(l)); });
      out.push(`<figure class="dflow">${title ? `<figcaption>${inl(title)}</figcaption>` : ""}${flowHTML(lanes)}</figure>`);
    } else out.push(`<aside class="callout c-${kind}"><p class="c-h">${inl(title || {note:"Note", tip:"Tip", warn:"Watch out"}[kind])}</p>${lines.filter(l => l.trim()).map(l => `<p>${inl(l)}</p>`).join("")}</aside>`);
    block = null;
  };
  for (const line of src.split("\n")){
    if (code !== null){ if (line.startsWith("~~~")){ out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`); code = null; } else code.push(line); continue; }
    if (block){ if (line.trim() === ":::") endBlock(); else block.lines.push(line); continue; }
    let m;
    if (line.startsWith("~~~")){ flushAll(); code = []; continue; }
    if ((m = line.match(/^:::(flow|lanes|note|tip|warn)\s*(.*)$/))){ flushAll(); block = {kind:m[1], title:m[2].trim(), lines:[]}; continue; }
    if (line.startsWith("|")){
      flushP(); flushL();
      if (/^\|[\s:|-]+\|?\s*$/.test(line)) continue;
      (table = table || []).push(line.replace(/^\||\|\s*$/g, "").split("|").map(c => c.trim()));
      continue;
    }
    flushT();
    if (line.startsWith("## ")){ flushP(); flushL(); out.push(`<h5 data-sec="${sec++}">${inl(line.slice(3))}</h5>`); }
    else if (line.startsWith("### ")){ flushP(); flushL(); out.push(`<h6>${inl(line.slice(4))}</h6>`); }
    else if ((m = line.match(/^- (.*)/))){ flushP(); if (!list || list.t !== "ul"){ flushL(); list = {t:"ul", items:[]}; } list.items.push(m[1]); }
    else if ((m = line.match(/^\d+\. (.*)/))){ flushP(); if (!list || list.t !== "ol"){ flushL(); list = {t:"ol", items:[]}; } list.items.push(m[1]); }
    else if (!line.trim()){ flushP(); flushL(); }
    else { flushL(); para.push(line.trim()); }
  }
  if (block) endBlock();
  flushAll();
  return out.join("");
}
function tocOf(src){ return src.split("\n").filter(l => l.startsWith("## ")).map(l => l.slice(3)); }
function iqHTML(q, open){
  return `<details class="iq"${open ? " open" : ""}><summary><span class="lvl lvl-${q[0]}">${LVL[q[0]]}</span>${inl(q[1])}</summary><div class="ans">${inl(q[2])}</div></details>`;
}
function flowHTML(fl){
  const step = (s, i) => { const [a, b] = Array.isArray(s) ? s : [s, ""]; return `<li data-n="${i+1}" style="--i:${i}"><div class="fs"><b>${esc(a)}</b>${b ? `<span>${esc(b)}</span>` : ""}</div></li>`; };
  const lane = steps => `<ol class="flane">${steps.map(step).join("")}</ol>`;
  if (fl[0] && fl[0].steps) return `<div class="flow lanes">${fl.map(l => `<div class="lane"><p class="lane-label">${esc(l.label)}</p>${lane(l.steps)}</div>`).join("")}</div>`;
  return `<div class="flow">${lane(fl)}</div>`;
}

$("prev").onclick = () => { stop(); go(cur-1); };
$("next").onclick = () => { stop(); go(cur+1); };
$("restart").onclick = () => { stop(); go(0); };
$("play").onclick = () => playing ? stop() : play();
$("steps").addEventListener("click", e => { const b = e.target.closest("button"); if (b){ stop(); go(+b.dataset.j); } });
document.addEventListener("keydown", e => {
  if (e.target.closest("input,textarea") || $("flowsView").hidden) return;
  if (e.key==="ArrowRight"){ stop(); go(cur+1); }
  if (e.key==="ArrowLeft"){ stop(); go(cur-1); }
});
window.addEventListener("hashchange", route);
let rz; window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(checkCompact, 150); });

buildTabs();
route();
