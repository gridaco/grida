import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NativeCommandRuntime } from "./native-command-runtime";

describe.skipIf(process.platform !== "darwin" && process.platform !== "linux")(
  "Packaged command resources",
  () => {
    it("projects only the pinned executable and required helper outside the denied install", async () => {
      const fixture = await fs.mkdtemp(
        path.join(os.tmpdir(), "grida-carrier-")
      );
      try {
        const root = await fs.realpath(fixture);
        const install = path.join(root, "app");
        const resources = path.join(install, "resources");
        const workspace = path.join(root, "workspace");
        const sourceBin = path.join(resources, "bundled-programs", "bin");
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
        await fs.writeFile(
          path.join(resources, "bundled-programs", "fx-version"),
          "0.9.0\n"
        );
        await fs.writeFile(path.join(resources, "app.asar"), "application");

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
        await fs.rm(fixture, { recursive: true, force: true });
      }
    });
  }
);
