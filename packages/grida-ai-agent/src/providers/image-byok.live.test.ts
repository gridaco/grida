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
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateImage } from "ai";
import { resolveImageModel } from "./resolve-image";
import type { SecretsStore } from "../secrets";

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

    const result = await generateImage({
      model: resolved.model,
      prompt: "a single red apple on a white table, soft studio light",
      n: 1,
    });
    const img = result.images[0];
    expect(img).toBeTruthy();
    expect(img.uint8Array.length).toBeGreaterThan(1000);
    fs.writeFileSync("/tmp/grida-live-or.png", img.uint8Array);
    console.log(
      `[live] ✅ mediaType=${img.mediaType} bytes=${img.uint8Array.length} → /tmp/grida-live-or.png`
    );
  }, 120_000);
});
