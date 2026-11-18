// GRIDA-SEC-004 — project immutable command resources outside protected app data.
import { createHash, randomUUID } from "node:crypto";
import { constants, rmSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { BundledPrograms } from "./bundled-programs";
import {
  commandTemporaryRoot,
  pinExecutable,
  requirePrivateDirectory,
} from "./native-agent-hooks";

type Pin = Awaited<ReturnType<typeof pinExecutable>>;

export namespace NativeCommandRuntime {
  // Reuse pinned copies during this launch and own their cleanup exclusively.
  const ownerId = randomUUID();
  const projections = new Map<string, Promise<void>>();
  const cleanup = new Set<string>();
  let registeredCleanup = false;

  export async function prepare(
    resources: string,
    workspace: string,
    protectedPaths: readonly string[]
  ): Promise<{
    helper: Pin;
    programDirectory?: string;
  }> {
    const helper = await pinExecutable(
      path.join(resources, "native-agent", "agent-kit-sandbox-helper")
    );
    const program = await BundledPrograms.resolve(resources, "grida-fx");
    const protectedRoots = await Promise.all(
      protectedPaths.map((root) => fs.realpath(root).catch(() => root))
    );
    const projectHelper = protectedRoots.some((root) =>
      contains(root, helper.path)
    );
    if (!projectHelper && !program) return { helper };

    const binRevision = createHash("sha256")
      .update(
        JSON.stringify([
          helper.path,
          projectHelper,
          helper.sha256,
          program?.sha256,
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

    const files = [
      ...(projectHelper ? [helper] : []),
      ...(program ? [program] : []),
    ];
    let prepared = projections.get(directory);
    if (!prepared) {
      prepared = project(directory, files).catch((error) => {
        projections.delete(directory);
        throw error;
      });
      projections.set(directory, prepared);
    }
    await prepared;
    for (const file of files) await verifyCopy(directory, file);
    return {
      helper: projectHelper
        ? { ...helper, path: inProjection(directory, helper) }
        : helper,
      ...(program ? { programDirectory: path.join(directory, "bin") } : {}),
    };
  }

  async function project(directory: string, files: readonly Pin[]) {
    const staging = await fs.mkdtemp(
      path.join(path.dirname(directory), ".grida-command-runtime-")
    );
    try {
      await requirePrivateDirectory(staging);
      for (const file of files) {
        const destination = inProjection(staging, file);
        if (path.dirname(destination) !== staging)
          await fs.mkdir(path.dirname(destination), { mode: 0o700 });
        await fs.copyFile(file.path, destination, constants.COPYFILE_EXCL);
        await fs.chmod(destination, 0o500);
        await verifyCopy(staging, file);
      }
      if (
        (await fs.readdir(staging)).sort().join("\n") !==
        files
          .map(
            (file) =>
              path
                .relative(staging, inProjection(staging, file))
                .split(path.sep)[0]
          )
          .sort()
          .join("\n")
      )
        throw new Error("native_command_runtime_inventory_invalid");
      if (files.some((file) => path.basename(file.path) === "grida-fx")) {
        const bin = path.join(staging, "bin");
        await requirePrivateDirectory(bin);
        if ((await fs.readdir(bin)).join("\n") !== "grida-fx")
          throw new Error("native_command_runtime_inventory_invalid");
      }
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

  function inProjection(directory: string, file: Pin) {
    const name = path.basename(file.path);
    return name === "grida-fx"
      ? path.join(directory, "bin", name)
      : path.join(directory, name);
  }

  async function verifyCopy(directory: string, expected: Pin) {
    const destination = inProjection(directory, expected);
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
