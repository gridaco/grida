// GRIDA-SEC-004 — verify receipt-error identity across the real isolated IPC boundary.
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
  "preserves native machine errors across actual Electron invoke and the isolated context bridge",
  async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "grida-chat-invoke-")
    );
    try {
      const entry = path.join(directory, "preload.ts");
      const helper = fileURLToPath(
        new URL("./native-chat-invoke.ts", import.meta.url)
      );
      await fs.writeFile(
        entry,
        `
        import { contextBridge, ipcRenderer } from "electron";
        import { NativeChatInvoke } from ${JSON.stringify(helper)};
        const channel = "grida:native-chat:input-receipt";
        contextBridge.exposeInMainWorld("nativeChatErrorProbe", {
          raw: (code) => ipcRenderer.invoke(channel, code),
          normalized: (code, target = channel) => NativeChatInvoke.invoke((...args) => ipcRenderer.invoke(...args), target, code),
        });
      `
      );
      const { build } = await import("vite");
      await build({
        configFile: false,
        logLevel: "silent",
        build: {
          outDir: directory,
          emptyOutDir: false,
          lib: { entry, formats: ["cjs"], fileName: () => "preload.cjs" },
          rollupOptions: { external: ["electron"] },
        },
      });
      const resultPath = path.join(directory, "result.json");
      const userData = path.join(directory, "user-data");
      await fs.mkdir(userData);
      const environment = { ...process.env };
      delete environment.ELECTRON_RUN_AS_NODE;
      await execute(
        require("electron") as string,
        [
          fileURLToPath(
            new URL("./native-chat-invoke.electron.cjs", import.meta.url)
          ),
          path.join(directory, "preload.cjs"),
          resultPath,
          userData,
        ],
        { env: environment, timeout: 15_000, maxBuffer: 1024 * 1024 }
      );
      const result = JSON.parse(await fs.readFile(resultPath, "utf8"));
      expect(result.raw).toEqual({
        message:
          "Error invoking remote method 'grida:native-chat:input-receipt': Error: input_unavailable",
        isError: true,
      });
      expect(result.absent).toEqual({
        message: "input_unavailable",
        isError: true,
      });
      expect(result.changed).toEqual({
        message: "native_chat_selection_revision_changed",
        isError: true,
      });
      expect(result.queued).toEqual({
        message: "session_queue_waiting",
        isError: true,
      });
      expect(result.prose.message).toBe(
        "Error invoking remote method 'grida:native-chat:input-receipt': Error: Fixture provider failed with details."
      );
      expect(result.nested.message).toBe(
        "Error invoking remote method 'grida:native-chat:input-receipt': Error: Error invoking remote method 'grida:native-chat:other': Error: input_unavailable"
      );
      expect(result.unrelated.message).toBe(
        "Error invoking remote method 'grida:unrelated:probe': Error: input_unavailable"
      );
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  },
  30_000
);
