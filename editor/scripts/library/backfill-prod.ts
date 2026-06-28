/**
 * Stage 2 — batch-embed the PRODUCTION library corpus to LOCAL disk.
 *
 * READ-ONLY against prod: reads the public_read `object` list via REST and
 * passes each image's PUBLIC render URL straight to the embedding provider
 * (which fetches it server-side — no download/base64 on our side). Computes
 * the two Gemini Embedding 2 vectors and APPENDS them to a local JSONL file.
 * **It never writes to prod.**
 *
 * Resumable: object_ids already in OUT_FILE are skipped.
 *
 *   Env (required):
 *     PROD_URL          e.g. https://<ref>.supabase.co
 *     PROD_ANON_KEY     public anon/publishable key (read-only, public data)
 *     BYOK_OPENROUTER_API_KEY (or OPENROUTER_API_KEY)
 *   Env (optional):
 *     OUT_FILE   (default ~/.library/factory/vectors/gemini-backfill.jsonl)
 *     LIMIT (default 0 = all)  CONCURRENCY (default 8)  TRANSFORM_WIDTH (1024)
 *
 *   Run: pnpm tsx editor/scripts/library/backfill-prod.ts
 *
 * Output line: {"object_id","image":[..1536],"text":[..1536]|null,"described":bool}
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { embedImageUrl, embedText, openrouterKey } from "./_shared";

const PROD_URL = process.env.PROD_URL;
const ANON = process.env.PROD_ANON_KEY;
const OUT_FILE =
  process.env.OUT_FILE ||
  join(homedir(), ".library/factory/vectors/gemini-backfill.jsonl");
const LIMIT = Number(process.env.LIMIT || 0); // 0 = all
const CONCURRENCY = Number(process.env.CONCURRENCY || 8);
const TRANSFORM_WIDTH = Number(process.env.TRANSFORM_WIDTH || 1024);

if (!PROD_URL || !ANON) throw new Error("PROD_URL + PROD_ANON_KEY required");
const KEY = openrouterKey();

const RESTH = {
  apikey: ANON,
  Authorization: `Bearer ${ANON}`,
  "Accept-Profile": "grida_library",
};

type Row = {
  id: string;
  path: string;
  title: string | null;
  description: string | null;
  keywords: string[];
  mimetype: string;
};

async function fetchPage(offset: number, limit: number): Promise<Row[]> {
  const url =
    `${PROD_URL}/rest/v1/object` +
    `?select=id,path,title,description,keywords,mimetype` +
    `&order=id.asc&limit=${limit}&offset=${offset}`;
  const res = await fetch(url, { headers: RESTH });
  if (!res.ok) throw new Error(`list ${res.status}: ${await res.text()}`);
  return res.json();
}

// Public, size-normalized image URL. The embedding provider fetches this
// itself — no download/base64 on our side. (SVGs may not rasterize via the
// render endpoint; those rows error out and are logged/skipped for separate
// handling, mirroring the worker's SVG→PNG path.)
function imageUrl(path: string): string {
  const enc = path.split("/").map(encodeURIComponent).join("/");
  return `${PROD_URL}/storage/v1/render/image/public/library/${enc}?width=${TRANSFORM_WIDTH}&quality=80`;
}

function loadDone(): Set<string> {
  const done = new Set<string>();
  if (existsSync(OUT_FILE)) {
    for (const line of readFileSync(OUT_FILE, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        done.add(JSON.parse(line).object_id);
      } catch {}
    }
  }
  return done;
}

async function processRow(r: Row): Promise<"ok" | "err"> {
  try {
    const image = await embedImageUrl(imageUrl(r.path), KEY);
    const described = !!r.description?.trim();
    const text = described
      ? await embedText(
          [r.title, r.description, (r.keywords || []).join(" ")]
            .filter(Boolean)
            .join(". "),
          KEY
        )
      : null;
    appendFileSync(
      OUT_FILE,
      JSON.stringify({ object_id: r.id, image, text, described }) + "\n"
    );
    return "ok";
  } catch (e) {
    console.warn(`  ! ${r.id} (${r.path}): ${(e as Error).message}`);
    return "err";
  }
}

async function run() {
  mkdirSync(dirname(OUT_FILE), { recursive: true });
  const done = loadDone();
  console.log(`Resuming: ${done.size} already embedded → ${OUT_FILE}`);

  // collect the work list (paged), skipping already-done ids
  const todo: Row[] = [];
  const PAGE = 1000;
  for (let off = 0; ; off += PAGE) {
    const rows = await fetchPage(off, PAGE);
    if (!rows.length) break;
    for (const r of rows) if (!done.has(r.id)) todo.push(r);
    if (LIMIT && todo.length >= LIMIT) break;
  }
  const work = LIMIT ? todo.slice(0, LIMIT) : todo;
  console.log(`To embed: ${work.length} objects (concurrency ${CONCURRENCY})`);

  let i = 0,
    ok = 0,
    err = 0;
  async function worker() {
    while (i < work.length) {
      const r = work[i++];
      if ((await processRow(r)) === "ok") ok++;
      else err++;
      if ((ok + err) % 100 === 0)
        console.log(`  …${ok + err}/${work.length}  (${ok} ok / ${err} err)`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`Done: ${ok} ok, ${err} err. Total in file: ${done.size + ok}.`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
