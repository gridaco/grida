/**
 * Bulk-ingest real images from a read-only local corpus into the LOCAL
 * Grida Library for richer similarity / cross-modal-search testing.
 *
 * These assets have NO descriptions (image-only) — matching the production
 * starting shape: __image is set, __text stays NULL, so they exercise
 * similar() (image<->image) and the tier-2 cross-modal floor of search()
 * (text query <-> image) at scale.
 *
 * Source is READ-ONLY: bytes are copied (read) and uploaded to the local
 * `library` bucket. The source directory is never modified.
 *
 * LOCAL ONLY.
 *   Env:
 *     BYOK_OPENROUTER_API_KEY (or OPENROUTER_API_KEY)  — required
 *     SUPABASE_URL (default local) / SUPABASE_SERVICE_ROLE_KEY — required
 *     SOURCES_DIR (default ~/.library/factory/sources)
 *     LIMIT (default 150)  CONCURRENCY (default 6)  CATEGORY (default textures)
 *     MAX_BYTES (default 3000000 — skip larger to stay within the embed API)
 *
 *   Run: pnpm tsx editor/scripts/library/ingest-sources.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createClient } from "@supabase/supabase-js";
import { embedImageUrl, vectorLiteral, openrouterKey } from "./_shared";

const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SOURCES_DIR =
  process.env.SOURCES_DIR || join(homedir(), ".library/factory/sources");
const LIMIT = Number(process.env.LIMIT || 150);
const CONCURRENCY = Number(process.env.CONCURRENCY || 6);
const CATEGORY = process.env.CATEGORY || "textures"; // label-valid + homepage filter
const MAX_BYTES = Number(process.env.MAX_BYTES || 3_000_000);

openrouterKey(); // validate the embedding key up front
if (!SERVICE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");

const BUCKET = "library";
const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  db: { schema: "grida_library" },
});
const storage = createClient(SUPABASE_URL, SERVICE_KEY).storage;

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

// PNG IHDR; otherwise a square fallback (display-only; correctness unaffected).
function dims(buf: Buffer, ext: string): { width: number; height: number } {
  if (
    ext === "png" &&
    buf.length > 24 &&
    buf.toString("ascii", 12, 16) === "IHDR"
  ) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  return { width: 1024, height: 1024 };
}

async function ingestOne(file: string): Promise<"ok" | "skip" | "err"> {
  const ext = file.split(".").pop()!.toLowerCase();
  const mime = MIME[ext];
  if (!mime) return "skip";
  const bytes = readFileSync(join(SOURCES_DIR, file));
  if (bytes.length > MAX_BYTES) return "skip";

  const hash = file.replace(/\.[^.]+$/, "");
  const path = `${CATEGORY}/${hash}.${ext}`;
  try {
    const up = await storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: mime, upsert: true });
    if (up.error) throw up.error;
    let objectId = up.data?.id;
    if (!objectId) {
      const listed = await storage
        .from(BUCKET)
        .list(CATEGORY, { search: `${hash}.${ext}` });
      objectId = listed.data?.find((o) => o.name === `${hash}.${ext}`)?.id;
    }
    if (!objectId) throw new Error(`no storage id for ${path}`);

    const { width, height } = dims(bytes, ext);
    const objErr = (
      await db.from("object").upsert({
        id: objectId,
        path,
        category: CATEGORY,
        mimetype: mime,
        width,
        height,
        bytes: bytes.length,
        transparency: false,
      })
    ).error;
    if (objErr) throw objErr;

    const vec = await embedImageUrl(
      `data:${mime};base64,${bytes.toString("base64")}`
    );
    const embErr = (
      await db.from("object_embedding").upsert({
        object_id: objectId,
        gemini_embedding_2__image: vectorLiteral(vec),
        gemini_embedding_2__text: null,
      })
    ).error;
    if (embErr) throw embErr;
    return "ok";
  } catch (e) {
    console.warn(`  ! ${file}: ${(e as Error).message.slice(0, 120)}`);
    return "err";
  }
}

async function run() {
  await db.from("category").upsert({ id: CATEGORY, name: "Textures" });

  const files = readdirSync(SOURCES_DIR)
    .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))
    .slice(0, LIMIT);
  console.log(`Ingesting ${files.length} images (concurrency ${CONCURRENCY})…`);

  const counts = { ok: 0, skip: 0, err: 0 };
  let i = 0;
  async function worker() {
    while (i < files.length) {
      const idx = i++;
      const r = await ingestOne(files[idx]);
      counts[r]++;
      if ((counts.ok + counts.err + counts.skip) % 25 === 0) {
        console.log(
          `  …${counts.ok} ok / ${counts.skip} skip / ${counts.err} err`
        );
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(
    `Done: ${counts.ok} ok, ${counts.skip} skipped, ${counts.err} errors.`
  );
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
