/**
 * Local Grida Library embedder — Stage-1 fixture pipeline.
 *
 * Doubles as the reference implementation for the sibling-repo
 * (gridaco/library) Python worker: it embeds an asset's IMAGE and its TEXT
 * (title + description + keywords) with Gemini Embedding 2 via OpenRouter,
 * applies the SAME post-processing the editor query path uses (truncate to
 * the configured dim + L2-normalize), and writes the two single-modality
 * vectors. Here it additionally uploads local fixture images into the local
 * `library` bucket and creates object rows so the editor can be exercised
 * end-to-end.
 *
 * LOCAL ONLY. Writes to the local Supabase. Never point this at prod.
 *
 *   Env:
 *     BYOK_OPENROUTER_API_KEY (or OPENROUTER_API_KEY)  — required
 *     SUPABASE_URL                                     — default local
 *     SUPABASE_SERVICE_ROLE_KEY                        — required
 *
 *   Run:
 *     pnpm tsx editor/scripts/library/embed-fixtures.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  embedText,
  embedImageUrl,
  vectorLiteral,
  openrouterKey,
} from "./_shared";

const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

openrouterKey(); // validate the embedding key up front
if (!SERVICE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");

const REPO_ROOT = resolve(__dirname, "../../..");
const BUCKET = "library";
const CATEGORY = "textures"; // label-valid; matches the library homepage filter

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  db: { schema: "grida_library" },
});
const storage = createClient(SUPABASE_URL, SERVICE_KEY).storage;

// Minimal PNG dimension reader (IHDR). Fixtures are PNG; fallback otherwise.
function pngSize(buf: Buffer): { width: number; height: number } {
  if (buf.length > 24 && buf.toString("ascii", 12, 16) === "IHDR") {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  return { width: 512, height: 512 };
}

// ── fixtures ───────────────────────────────────────────────────────────
// `described: false` leaves __text NULL → exercises the cross-modal floor.
type Fixture = {
  key: string;
  file: string;
  title: string;
  description?: string;
  keywords: string[];
  described: boolean;
};

const FIXTURES: Fixture[] = [
  {
    key: "brush-1",
    file: "editor/public/brushes/brush-preview-1.png",
    title: "Ink Brush Stroke",
    description: "A bold textured ink brush stroke on paper.",
    keywords: ["brush", "ink", "stroke", "texture"],
    described: true,
  },
  {
    key: "brush-2",
    file: "editor/public/brushes/brush-preview-2.png",
    title: "Dry Brush Texture",
    description: "A rough dry-brush paint texture with visible bristles.",
    keywords: ["brush", "dry", "paint", "texture"],
    described: true,
  },
  {
    key: "brush-3",
    file: "editor/public/brushes/brush-preview-3.png",
    title: "Charcoal Smudge",
    description: "A soft charcoal smudge texture.",
    keywords: ["charcoal", "smudge", "texture"],
    described: true,
  },
  {
    key: "logo",
    file: "editor/public/assets/logo-preview.png",
    title: "Grida Logo",
    description: "The Grida brand logo mark.",
    keywords: ["logo", "brand", "mark"],
    described: true,
  },
  {
    key: "poster",
    file: "editor/public/west/poster.png",
    title: "Event Poster",
    description: "A promotional event poster design.",
    keywords: ["poster", "event", "promo"],
    described: true,
  },
  // undescribed: image-only asset (tier-2 cross-modal floor)
  {
    key: "placeholder",
    file: "editor/public/assets/placeholder-image.png",
    title: "Placeholder",
    keywords: [],
    described: false,
  },
];

async function ensureCategory() {
  await supabase.from("category").upsert({ id: CATEGORY, name: "Textures" });
}

async function run() {
  await ensureCategory();
  for (const fx of FIXTURES) {
    const abs = resolve(REPO_ROOT, fx.file);
    const bytes = readFileSync(abs);
    const path = `${CATEGORY}/${fx.key}.png`;
    const { width, height } = pngSize(bytes);

    // 1. upload image to local storage (upsert). The upload response carries
    //    the storage object id, which is the FK target for object.id.
    const up = await storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: "image/png", upsert: true });
    if (up.error) throw up.error;

    // 2. resolve the storage object id (object.id FK → storage.objects.id)
    let objectId = up.data?.id;
    if (!objectId) {
      const listed = await storage
        .from(BUCKET)
        .list(CATEGORY, { search: `${fx.key}.png` });
      if (listed.error) throw listed.error;
      objectId = listed.data?.find((o) => o.name === `${fx.key}.png`)?.id;
    }
    if (!objectId) throw new Error(`could not resolve storage id for ${path}`);

    // 3. upsert the library object row
    const objErr = (
      await supabase.from("object").upsert({
        id: objectId,
        path,
        category: CATEGORY,
        mimetype: "image/png",
        width,
        height,
        bytes: bytes.length,
        transparency: false,
        title: fx.title,
        description: fx.description ?? null,
        keywords: fx.keywords,
      })
    ).error;
    if (objErr) throw objErr;

    // 4. embed image (always) + text (when described); same post-processing
    const dataUrl = `data:image/png;base64,${bytes.toString("base64")}`;
    const imageVec = await embedImageUrl(dataUrl);
    const textVec = fx.described
      ? await embedText(
          [fx.title, fx.description, fx.keywords.join(" ")]
            .filter(Boolean)
            .join(". ")
        )
      : null;

    // 5. upsert the two single-modality vectors
    const embErr = (
      await supabase.from("object_embedding").upsert({
        object_id: objectId,
        gemini_embedding_2__image: vectorLiteral(imageVec),
        gemini_embedding_2__text: textVec ? vectorLiteral(textVec) : null,
      })
    ).error;
    if (embErr) throw embErr;

    console.log(
      `✓ ${fx.key.padEnd(12)} image=${imageVec.length}d text=${textVec ? `${textVec.length}d` : "—"} (${fx.described ? "described" : "image-only"})`
    );
  }
  console.log(`\nDone: ${FIXTURES.length} fixtures embedded into local DB.`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
