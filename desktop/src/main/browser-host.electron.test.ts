// GRIDA-SEC-016 — opt-in proof against real Chromium DOM guests and owner teardown.
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

const skipElectron = process.env.GRIDA_DESKTOP_TEST_ELECTRON !== "1";

async function runBrowserProof(scenario: "browser" | "download") {
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
    await build({
      configFile: false,
      logLevel: "silent",
      build: {
        target: "esnext",
        outDir: directory,
        emptyOutDir: false,
        lib: {
          entry: fileURLToPath(
            new URL("../browser-guest-preload.ts", import.meta.url)
          ),
          formats: ["cjs"],
          fileName: () => "browser-guest-preload.js",
        },
        rollupOptions: { external: ["electron"] },
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
        fileURLToPath(new URL("./browser-host.electron.cjs", import.meta.url)),
        path.join(directory, "browser-host.cjs"),
        resultPath,
        userData,
        scenario,
      ],
      {
        env: environment,
        timeout: 20_000,
        killSignal: "SIGKILL",
        maxBuffer: 1024 * 1024,
      }
    );
    return JSON.parse(await fs.readFile(resultPath, "utf8"));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

it.skipIf(skipElectron)(
  "admits isolated DOM guests under Desktop CSP, composes live overlays, and verifies CDP and document teardown",
  async () => {
    expect(await runBrowserProof("browser")).toEqual({
      electron: expect.any(String),
      pageLoaded: true,
      isolated: true,
      hostCsp: true,
      earlyDenied: true,
      guestCdp: true,
      liveDomOverlays: true,
      inactiveInput: true,
      requestPolicy: true,
      sharedProfile: true,
      backgroundAutomation: true,
      retryNewGuest: true,
      crashRecovery: true,
      documentReloadEndsGuests: true,
      hiddenThumbnail: true,
      destroyedWithShell: true,
    });
  },
  30_000
);

it.skipIf(skipElectron)(
  "requires foreground download confirmation after the initiating automation scope expires",
  async () => {
    expect(await runBrowserProof("download")).toEqual({
      downloadConfirmations: [false, true],
    });
  },
  30_000
);
