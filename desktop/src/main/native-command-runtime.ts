// GRIDA-SEC-004 — project immutable command resources outside protected app data.
import { createHash, randomUUID } from "node:crypto";
import { constants, rmSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import {
  commandTemporaryRoot,
  pinExecutable,
  requirePrivateDirectory,
} from "./native-agent-hooks";

type Pin = Awaited<ReturnType<typeof pinExecutable>>;
type Command = Pin & { skill: string };

export namespace NativeCommandRuntime {
  // Reuse pinned copies during this launch and own their cleanup exclusively.
  const ownerId = randomUUID();
  const projections = new Map<string, Promise<void>>();
  const cleanup = new Set<string>();
  let registeredCleanup = false;

  export async function prepare(
    resources: string,
    workspace: string,
    protectedPaths: readonly string[],
    command?: Command
  ): Promise<{
    helper: Pin;
    program?: { directory: string; skill: string };
  }> {
    const helper = await pinExecutable(
      path.join(resources, "native-agent", "agent-kit-sandbox-helper")
    );
    const protectedRoots = await Promise.all(
      protectedPaths.map((root) => fs.realpath(root).catch(() => root))
    );
    const projectHelper = protectedRoots.some((root) =>
      contains(root, helper.path)
    );
    if (!projectHelper && !command) return { helper };

    const binRevision = createHash("sha256")
      .update(
        JSON.stringify([
          helper.path,
          projectHelper,
          helper.sha256,
          command?.path,
          command?.sha256,
        ])
      )
      .digest("hex");
    const directory = path.join(
      await commandTemporaryRoot(),
      `grida-command-runtime-${ownerId}-${binRevision}`
    );
    const canonicalWorkspace = await fs.realpath(workspace);
    if (
      contains(canonicalWorkspace, directory) ||
      contains(directory, canonicalWorkspace) ||
      protectedRoots.some(
        (root) => contains(root, directory) || contains(directory, root)
      )
    )
      throw new Error("native_command_runtime_scope_invalid");

    const projectedHelper = projectHelper ? helper : undefined;
    let prepared = projections.get(directory);
    if (!prepared) {
      prepared = project(directory, projectedHelper, command).catch((error) => {
        projections.delete(directory);
        throw error;
      });
      projections.set(directory, prepared);
    }
    await prepared;
    const projected = path.join(directory, "bin");
    const helperPath = projectHelper
      ? path.join(directory, path.basename(helper.path))
      : helper.path;
    if (projectHelper) await verifyCopy(helperPath, helper);
    if (command)
      await verifyCopy(
        path.join(projected, path.basename(command.path)),
        command
      );
    return {
      helper: { ...helper, path: helperPath },
      ...(command
        ? { program: { directory: projected, skill: command.skill } }
        : {}),
    };
  }

  async function project(directory: string, helper?: Pin, command?: Pin) {
    const staging = await fs.mkdtemp(
      path.join(path.dirname(directory), ".grida-command-runtime-")
    );
    try {
      await requirePrivateDirectory(staging);
      const inventory: string[] = [];
      if (helper) {
        const name = path.basename(helper.path);
        await copy(path.join(staging, name), helper);
        inventory.push(name);
      }
      if (command) {
        const bin = path.join(staging, "bin");
        const name = path.basename(command.path);
        await fs.mkdir(bin, { mode: 0o700 });
        await requirePrivateDirectory(bin);
        await copy(path.join(bin, name), command);
        if ((await fs.readdir(bin)).join("\n") !== name)
          throw new Error("native_command_runtime_inventory_invalid");
        inventory.push("bin");
      }
      if (
        (await fs.readdir(staging)).sort().join("\n") !==
        inventory.sort().join("\n")
      )
        throw new Error("native_command_runtime_inventory_invalid");
      await fs.rename(staging, directory);
      cleanup.add(directory);
      if (!registeredCleanup) {
        registeredCleanup = true;
        process.once("exit", () => {
          for (const location of cleanup) {
            try {
              rmSync(location, { recursive: true, force: true });
            } catch {
              // An abandoned projection has no owner in a subsequent launch.
            }
          }
        });
      }
    } finally {
      await fs.rm(staging, { recursive: true, force: true });
    }
  }

  async function copy(destination: string, file: Pin) {
    await fs.copyFile(file.path, destination, constants.COPYFILE_EXCL);
    await fs.chmod(destination, 0o500);
    await verifyCopy(destination, file);
  }

  async function verifyCopy(destination: string, expected: Pin) {
    const actual = await pinExecutable(destination);
    const stat = await fs.lstat(destination);
    if (
      actual.path !== destination ||
      stat.uid !== process.geteuid?.() ||
      (stat.mode & 0o7777) !== 0o500 ||
      stat.nlink !== 1 ||
      !actual.sha256.every((byte, index) => byte === expected.sha256[index])
    )
      throw new Error("native_command_runtime_binary_changed");
  }

  function contains(parent: string, candidate: string) {
    const relative = path.relative(parent, candidate);
    return (
      relative === "" ||
      (relative !== ".." &&
        !relative.startsWith(".." + path.sep) &&
        !path.isAbsolute(relative))
    );
  }
}
