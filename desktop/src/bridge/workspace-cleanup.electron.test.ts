// GRIDA-SEC-004 / GRIDA-SEC-016 — same-document teardown in the real isolated preload.
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const execute = promisify(execFile);
const require = createRequire(import.meta.url);

it.skipIf(process.env.GRIDA_DESKTOP_TEST_ELECTRON !== "1")(
  "dispatches attachment cleanup only while the chat or browser route is current",
  async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "grida-workspace-cleanup-")
    );
    try {
      const { build } = await import("vite");
      await build({
        configFile: false,
        logLevel: "silent",
        build: {
          target: "esnext",
          outDir: directory,
          emptyOutDir: false,
          lib: {
            entry: fileURLToPath(new URL("../preload.ts", import.meta.url)),
            formats: ["cjs"],
            fileName: () => "preload.cjs",
          },
          rollupOptions: { external: ["electron"] },
        },
      });
      const environment = { ...process.env };
      delete environment.ELECTRON_RUN_AS_NODE;
      const { stdout } = await execute(
        require("electron") as string,
        [
          fileURLToPath(
            new URL("./workspace-cleanup.electron.cjs", import.meta.url)
          ),
          path.join(directory, "preload.cjs"),
          directory,
        ],
        { env: environment, timeout: 15_000, killSignal: "SIGKILL" }
      );
      expect(stdout).toContain("Workspace cleanup verified");
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  },
  30_000
);
