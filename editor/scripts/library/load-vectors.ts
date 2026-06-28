/**
 * Populate `grida_library.object_embedding` from a local backfill JSONL
 * (produced by backfill-prod.ts). Streams the file (it is large) and batch-
 * upserts the two Gemini columns keyed by object_id.
 *
 * Modes:
 *   DRY_RUN=1  — parse + validate every line (dim, normalization, id shape),
 *                report counts/issues, NO DB connection, NO writes.
 *   (default)  — batch-upsert into the target DB.
 *
 * TARGET is explicit and must be chosen deliberately:
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY  (local: 127.0.0.1)
 *   For PROD this is a Stage-3 write — run ONLY with explicit approval.
 *
 *   Env: IN_FILE (default ~/.library/factory/vectors/gemini-backfill.jsonl)
 *        BATCH (default 500)  DRY_RUN (0/1)
 *
 *   Run (validate): DRY_RUN=1 pnpm tsx editor/scripts/library/load-vectors.ts
 */
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { homedir } from "node:os";
import { createClient } from "@supabase/supabase-js";
import { DIM, vectorLiteral } from "./_shared";

const IN_FILE =
  process.env.IN_FILE ||
  join(homedir(), ".library/factory/vectors/gemini-backfill.jsonl");
const BATCH = Number(process.env.BATCH || 500);
const DRY_RUN = process.env.DRY_RUN === "1";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type Line = {
  object_id: string;
  image: number[];
  text: number[] | null;
  described?: boolean;
};

function validate(o: Line): string | null {
  if (!o.object_id || !UUID_RE.test(o.object_id)) return "bad object_id";
  if (!Array.isArray(o.image) || o.image.length !== DIM) return "image dim";
  let s = 0;
  for (const x of o.image) s += x * x;
  if (Math.abs(Math.sqrt(s) - 1) > 1e-3) return "image not normalized";
  if (o.text != null) {
    if (!Array.isArray(o.text) || o.text.length !== DIM) return "text dim";
    let t = 0;
    for (const x of o.text) t += x * x;
    if (Math.abs(Math.sqrt(t) - 1) > 1e-3) return "text not normalized";
  }
  return null;
}

async function run() {
  const db =
    DRY_RUN || !SERVICE_KEY
      ? null
      : createClient(SUPABASE_URL, SERVICE_KEY!, {
          db: { schema: "grida_library" },
        });
  if (!DRY_RUN && !db)
    throw new Error("SUPABASE_SERVICE_ROLE_KEY required to write");
  console.log(
    DRY_RUN
      ? `DRY-RUN validating ${IN_FILE}`
      : `LOADING ${IN_FILE} → ${SUPABASE_URL} (BATCH ${BATCH})`
  );

  const rl = createInterface({
    input: createReadStream(IN_FILE),
    crlfDelay: Infinity,
  });

  let total = 0,
    bad = 0,
    withText = 0,
    written = 0;
  const issues: Record<string, number> = {};
  let batch: Record<string, unknown>[] = [];

  async function flush() {
    if (!batch.length) return;
    if (db) {
      const { error } = await db.from("object_embedding").upsert(batch);
      if (error) throw error;
      written += batch.length;
    }
    batch = [];
  }

  for await (const line of rl) {
    if (!line.trim()) continue;
    total++;
    let o: Line;
    try {
      o = JSON.parse(line);
    } catch {
      bad++;
      issues["json parse"] = (issues["json parse"] || 0) + 1;
      continue;
    }
    const err = validate(o);
    if (err) {
      bad++;
      issues[err] = (issues[err] || 0) + 1;
      continue;
    }
    if (o.text != null) withText++;
    batch.push({
      object_id: o.object_id,
      gemini_embedding_2__image: vectorLiteral(o.image),
      gemini_embedding_2__text: o.text ? vectorLiteral(o.text) : null,
    });
    if (batch.length >= BATCH) await flush();
    if (total % 2000 === 0)
      console.log(`  …${total} parsed (${withText} w/ text, ${bad} bad)`);
  }
  await flush();

  console.log(
    `\n${DRY_RUN ? "DRY-RUN" : "LOAD"} done: total=${total}  valid=${total - bad}  bad=${bad}  with_text=${withText}` +
      (db ? `  written=${written}` : "")
  );
  if (bad) console.log("issues:", issues);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
