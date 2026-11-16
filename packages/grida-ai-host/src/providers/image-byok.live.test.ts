/**
 * LIVE BYOK image test — real OpenRouter key, real API call. Opt-in only, so
 * the normal suite never hits the network or spends credits.
 *
 *   GRIDA_LIVE_BYOK=1                — required, opts in.
 *   BYOK_OPENROUTER_API_KEY=<key>   — the key (falls back to editor/.env.local).
 *   LIVE_IMAGE_MODEL=<id>           — model to use (default: seedream-4.5).
 *
 * Run: `GRIDA_LIVE_BYOK=1 pnpm exec vitest run src/providers/image-byok.live.test.ts`
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveImageModel } from "./resolve-image";
import type { SecretsStore } from "@grida/daemon/server";

function loadKey(): string | undefined {
  if (process.env.BYOK_OPENROUTER_API_KEY)
    return process.env.BYOK_OPENROUTER_API_KEY;
  // Convenience fallback: editor/.env.local, relative to this package.
  try {
    const env = fs.readFileSync(
      path.resolve(process.cwd(), "../../editor/.env.local"),
      "utf8"
    );
    const m = env.match(/^\s*BYOK_OPENROUTER_API_KEY\s*=\s*(.+)\s*$/m);
    return m?.[1]?.trim().replace(/^["']|["']$/g, "");
  } catch {
    return undefined;
  }
}

const LIVE = process.env.GRIDA_LIVE_BYOK === "1";
const KEY = LIVE ? loadKey() : undefined;
const MODEL = process.env.LIVE_IMAGE_MODEL ?? "bytedance/seedream-4.5";

describe.skipIf(!LIVE || !KEY)("LIVE OpenRouter image generation", () => {
  it(`resolves + generates a real image (${MODEL})`, async () => {
    const secrets = {
      _getKey: async (id: string) => (id === "openrouter" ? KEY! : null),
    } as unknown as SecretsStore;

    const resolved = await resolveImageModel({ secrets }, MODEL, {
      explicit: "openrouter",
    });
    expect(resolved.provider_id).toBe("openrouter");
    console.log(`[live] binding_id=${resolved.binding_id}`);

    const result = await resolved.generate({
      prompt: "a single red apple on a white table, soft studio light",
      n: 1,
    });
    const img = result.images[0];
    expect(img).toBeTruthy();
    expect(img.data.length).toBeGreaterThan(1000);
    fs.writeFileSync("/tmp/grida-live-or.png", img.data);
    console.log(
      `[live] ✅ mediaType=${img.media_type} bytes=${img.data.length} → /tmp/grida-live-or.png`
    );
  }, 120_000);

  // image-to-image through the real product path: resolve for references, then
  // condition on a host-resolved reference through the shared operation.
  // Self-contained — generates its own reference, then edits it.
  it(`resolves + edits with a reference (${MODEL})`, async () => {
    const secrets = {
      _getKey: async (id: string) => (id === "openrouter" ? KEY! : null),
    } as unknown as SecretsStore;

    // 1. make a reference
    const base = await resolveImageModel({ secrets }, MODEL, {
      explicit: "openrouter",
    });
    const seed = await base.generate({
      prompt: "a single red apple on a white table, soft studio light",
      n: 1,
    });
    const ref = `data:${seed.images[0].media_type};base64,${Buffer.from(seed.images[0].data).toString("base64")}`;

    // 2. resolve for i2i and condition on the reference
    const edit = await resolveImageModel({ secrets }, MODEL, {
      explicit: "openrouter",
      references: true,
    });
    expect(edit.references_max).toBeGreaterThan(0);
    const result = await edit.generate({
      prompt: "make it a dramatic neon-lit night scene, keep the apple",
      n: 1,
      references: [ref],
    });
    const img = result.images[0];
    expect(img).toBeTruthy();
    expect(img.data.length).toBeGreaterThan(1000);
    const out = path.join(os.tmpdir(), "grida-live-or-i2i.png");
    fs.writeFileSync(out, img.data);
    console.log(
      `[live] ✅ i2i binding=${edit.binding_id} cap=${edit.references_max} bytes=${img.data.length} → ${out}`
    );
  }, 180_000);
});
