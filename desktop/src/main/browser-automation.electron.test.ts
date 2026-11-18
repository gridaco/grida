// GRIDA-SEC-016 — automated interaction with admitted guests in disposable profiles.
import { execFile } from "node:child_process";
import { builtinModules, createRequire } from "node:module";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const execute = promisify(execFile);
const require = createRequire(import.meta.url);

it.skipIf(process.env.GRIDA_DESKTOP_TEST_ELECTRON !== "1")(
  "operates on independent hidden guests and the explicitly displayed workbench guest",
  async () => {
    const temp = await fs.mkdtemp(
      path.join(os.tmpdir(), "grida-browser-automation-")
    );
    try {
      const { build } = await import("vite");
      for (const [name, filename] of [
        ["./browser-host.ts", "browser-host.cjs"],
        ["./browser-automation.ts", "browser-automation.cjs"],
        ["../browser-guest-preload.ts", "browser-guest-preload.js"],
      ]) {
        await build({
          configFile: false,
          publicDir: false,
          logLevel: "silent",
          build: {
            target: "esnext",
            outDir: temp,
            emptyOutDir: false,
            lib: {
              entry: fileURLToPath(new URL(name, import.meta.url)),
              formats: ["cjs"],
              fileName: () => filename,
            },
            rollupOptions: {
              external: [
                "electron",
                ...builtinModules,
                ...builtinModules.map((name) => "node:" + name),
              ],
            },
          },
        });
      }
      const profile = path.join(temp, "profile");
      await fs.mkdir(profile, { mode: 0o700 });
      const env = { ...process.env };
      delete env.ELECTRON_RUN_AS_NODE;
      const { stdout } = await execute(
        require("electron") as string,
        [
          fileURLToPath(
            new URL("./browser-automation.electron.cjs", import.meta.url)
          ),
          temp,
          profile,
        ],
        { env, timeout: 32_000, killSignal: "SIGKILL", maxBuffer: 1024 * 1024 }
      );
      expect(stdout).toContain("browser automation Electron scenarios passed");
    } finally {
      await fs.rm(temp, { recursive: true, force: true });
    }
  },
  45_000
);
