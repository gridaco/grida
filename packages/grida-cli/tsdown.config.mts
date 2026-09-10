// GRIDA-SEC-010 / GRIDA-SEC-013 — bundle public SDK owners; native keyring loading stays lazy.
import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/bin.ts"],
  format: ["esm"],
  platform: "node",
  target: "node24",
  fixedExtension: true,
  deps: {
    alwaysBundle: [
      "@grida/auth",
      "@grida/home",
      "@grida/account",
      "@grida/ai",
      "@grida/ai-models",
    ],
    // Review dependency growth explicitly: this executable has no agent/desktop host.
    onlyBundle: [
      "ai",
      "@ai-sdk/gateway",
      "@ai-sdk/provider",
      "@ai-sdk/provider-utils",
      "zod",
      "eventsource-parser",
      "@vercel/oidc",
    ],
    neverBundle: [/^node:/, "@github/keytar"],
  },
});
