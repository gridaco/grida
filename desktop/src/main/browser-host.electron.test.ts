// GRIDA-SEC-016 — opt-in proof against real Chromium views and owner teardown.
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
  "composes an isolated unframeable browser page and destroys live guests after their owning shell dies",
  async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "grida-browser-proof-")
    );
    try {
      await fs.chmod(directory, 0o700);
      const { build } = await import("vite");
      await build({
        configFile: false,
        logLevel: "silent",
        build: {
          target: "esnext",
          outDir: directory,
          emptyOutDir: false,
          lib: {
            entry: fileURLToPath(new URL("./browser-host.ts", import.meta.url)),
            formats: ["cjs"],
            fileName: () => "browser-host.cjs",
          },
          rollupOptions: {
            external: [
              "electron",
              ...builtinModules,
              ...builtinModules.map((name) => `node:${name}`),
            ],
          },
        },
      });
      const resultPath = path.join(directory, "result.json");
      const userData = path.join(directory, "browser");
      await fs.mkdir(userData, { mode: 0o700 });
      const environment = { ...process.env };
      delete environment.ELECTRON_RUN_AS_NODE;
      await execute(
        require("electron") as string,
        [
          fileURLToPath(
            new URL("./browser-host.electron.cjs", import.meta.url)
          ),
          path.join(directory, "browser-host.cjs"),
          resultPath,
          userData,
        ],
        { env: environment, timeout: 20_000, maxBuffer: 1024 * 1024 }
      );
      const result = JSON.parse(await fs.readFile(resultPath, "utf8"));
      expect(result).toEqual({
        electron: expect.any(String),
        pageLoaded: true,
        isolated: true,
        layout: true,
        radius: true,
        hiddenThumbnail: true,
        shortcut: true,
        reattached: true,
        destroyedWithShell: true,
      });
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  },
  30_000
);
