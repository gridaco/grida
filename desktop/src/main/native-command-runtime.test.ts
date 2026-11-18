import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { NativeCommandRuntime } from "./native-command-runtime";

describe.skipIf(process.platform !== "darwin" && process.platform !== "linux")(
  "Packaged command resources",
  () => {
    it("projects only the pinned executable and required helper outside the denied install", async () => {
      const { root, install, resources, workspace } = await createFixture();
      try {
        const first = await NativeCommandRuntime.prepare(resources, workspace, [
          install,
        ]);
        const second = await NativeCommandRuntime.prepare(
          resources,
          workspace,
          [install]
        );
        expect(first).toEqual(second);
        const directory = first.programDirectory!;
        expect(first.helper.path.startsWith(install + path.sep)).toBe(false);
        expect(directory.startsWith(install + path.sep)).toBe(false);
        expect(await fs.readdir(directory)).toEqual(["grida-fx"]);
        expect(
          (await fs.stat(path.join(directory, "grida-fx"))).mode & 0o777
        ).toBe(0o500);
        expect(await fs.readdir(path.dirname(directory))).toEqual([
          "agent-kit-sandbox-helper",
          "bin",
        ]);
      } finally {
        await fs.rm(root, { recursive: true, force: true });
      }
    });

    it("keeps another Desktop process's projection available on exit", async () => {
      const { root, install, resources, workspace } = await createFixture();
      const previousExitListeners = new Set(process.listeners("exit"));
      try {
        // Reload the module so each simulated process owns its own cache and cleanup.
        vi.resetModules();
        const first = (await import("./native-command-runtime"))
          .NativeCommandRuntime;
        const exiting = await first.prepare(resources, workspace, [install]);
        const exit = process
          .listeners("exit")
          .find((listener) => !previousExitListeners.has(listener));
        if (!exit) throw new Error("missing projection cleanup");

        vi.resetModules();
        const second = (await import("./native-command-runtime"))
          .NativeCommandRuntime;
        const surviving = await second.prepare(resources, workspace, [install]);

        process.removeListener("exit", exit);
        exit(0);
        await expect(fs.stat(exiting.helper.path)).rejects.toMatchObject({
          code: "ENOENT",
        });
        await expect(
          second.prepare(resources, workspace, [install])
        ).resolves.toEqual(surviving);
        expect(surviving.programDirectory).not.toBe(exiting.programDirectory);
      } finally {
        for (const listener of process.listeners("exit")) {
          if (previousExitListeners.has(listener)) continue;
          process.removeListener("exit", listener);
          listener(0);
        }
        await fs.rm(root, { recursive: true, force: true });
      }
    });
  }
);

async function createFixture() {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "grida-carrier-"))
  );
  const install = path.join(root, "app");
  const resources = path.join(install, "resources");
  const workspace = path.join(root, "workspace");
  const carrier = path.join(resources, "bundled-programs");
  const sourceBin = path.join(carrier, "bin");
  const sourceHelper = path.join(resources, "native-agent");
  await fs.mkdir(workspace);
  await fs.mkdir(sourceBin, { recursive: true });
  await fs.mkdir(sourceHelper);
  await fs.writeFile(
    path.join(sourceHelper, "agent-kit-sandbox-helper"),
    "sandbox helper",
    { mode: 0o755 }
  );
  await fs.writeFile(path.join(sourceBin, "grida-fx"), "FX engine", {
    mode: 0o755,
  });
  await fs.writeFile(path.join(carrier, "fx-version"), "0.9.0\n");
  await fs.writeFile(path.join(resources, "app.asar"), "application");
  return { root, install, resources, workspace };
}
