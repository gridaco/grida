import { createHash, randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { IpcMainInvokeEvent, WebContents } from "electron";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NativeExternalRunIpc } from "./native-external-run-ipc";
import { NativeExternalRuns } from "./native-external-runs";
import { NativeWorkspaceCatalog } from "./native-workspace-catalog";
import type { WorkspaceMediaGrant } from "./workspace-media-registry";

const script = String.raw`
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const [, , command, ...args] = process.argv;
const arg = name => args[args.indexOf(name) + 1];
const id = arg("--run-id");
const dir = arg("--state-dir");
const store = path.join(dir, "fixture-" + id);
const base = {
  schema_version: 1, run_id: id, session_id: id, turn_id: id, input_id: id,
  driver: {
    kind:"external_acp", transport:"acp_v1_stdio", execution:"local_confined_process",
    workspace_access:"read_only", network:"denied", input:"text",
    observation:"retained_text_and_outcome", stop:"owned_process", recovery:"local_receipt",
  },
};
const emit = value => process.stdout.write(JSON.stringify(value) + "\n");
if (command === "inspect-external") {
  if (!fs.existsSync(store)) {
    process.stderr.write("grida-agent: external_acp_run_missing\n");
    process.exitCode = 1;
  } else {
    emit({ ...base, ...JSON.parse(fs.readFileSync(store, "utf8")), kind: "external_run" });
  }
} else if (command === "run-external") {
  assert(Object.keys(process.env).every(key => key === "__CF_USER_TEXT_ENCODING"));
  const profile = JSON.parse(fs.readFileSync(arg("--profile"), "utf8"));
  assert.equal(profile.executable.path, "/usr/bin/test-acp-peer");
  assert.equal(fs.statSync(arg("--profile")).mode & 0o777, 0o600);
  assert(!profile.temporaryParent.startsWith(dir + "/"));
  const input = fs.readFileSync(0, "utf8");
  assert(!args.includes(input));
  fs.appendFileSync(path.join(dir, "fixture-launches"), JSON.stringify({ id, input, profile }) + "\n");
  const finish = (disposition, cleanup_verified, code, drop = false) => {
    const account = {text: input, cleanup_verified, response_truncated: false};
    fs.writeFileSync(store, JSON.stringify({disposition, account}));
    if (!drop) emit({ ...base, kind: "finished", disposition, account,
      ...(input === "bad echo" ? {input_id: "different"} : {}),
    });
    process.exitCode = code;
  };
  if (input === "hold") {
    const timer = setInterval(() => {}, 100);
    process.on("SIGTERM", () => {
      clearInterval(timer);
      finish("cancelled", true, 130);
    });
    emit({ ...base, kind: "accepted" });
  } else {
    emit({ ...base, kind: "accepted" });
    if (input === "uncertain") finish("uncertain", false, 5);
    else finish("succeeded", true, 0, input === "lost reply");
  }
} else process.exitCode = 2;
`;

function fixture() {
  const root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "grida-external-owner-")
  );
  const workspace = path.join(root, "workspace");
  const state = path.join(root, "state");
  const scratch = path.join(root, "scratch");
  const resources = path.join(root, "resources");
  const packageFiles = path.join(resources, "native-agent");
  const profileFile = path.join(root, "external.json");
  fs.mkdirSync(resources, { mode: 0o700 });
  for (const dir of [workspace, state, scratch, packageFiles])
    fs.mkdirSync(dir, { mode: 0o700 });
  const helper = path.join(packageFiles, "agent-kit-sandbox-helper");
  fs.writeFileSync(helper, "bundled helper fixture", { mode: 0o700 });
  fs.writeFileSync(
    path.join(packageFiles, "grida-agent"),
    `#!${process.execPath}\n${script}`,
    { mode: 0o700 }
  );
  const metadata = fs.statSync(workspace, { bigint: true });
  const identity = {
    device: metadata.dev.toString(),
    inode: metadata.ino.toString(),
    birthTimeNs: metadata.birthtimeNs.toString(),
  };
  const grant: WorkspaceMediaGrant = {
    root: workspace,
    workspaceId: "workspace",
    identity,
    protected: [profileFile],
  };
  const profile = {
    version: 1,
    name: "Reviewed local peer",
    workspaceId: grant.workspaceId,
    root: workspace,
    identity,
    executable: {
      path: "/usr/bin/test-acp-peer",
      sha256: Array<number>(32).fill(1),
    },
    bubblewrap: { path: "/usr/bin/bwrap", sha256: Array<number>(32).fill(2) },
    arguments: ["--stdio"],
    runtimePaths: ["/usr/bin", "/usr/lib"],
    deadlineMs: 5000,
  };
  fs.writeFileSync(profileFile, JSON.stringify(profile), { mode: 0o600 });
  const lookup = vi.fn<() => Promise<WorkspaceMediaGrant>>(async () => grant);
  const options = {
    resourcesPath: resources,
    privateDirectory: state,
    temporaryDirectory: scratch,
    profileFile,
    workspace: lookup,
  };
  const launches = () => {
    const scope = fs.readdirSync(state)[0];
    const logfile = scope && path.join(state, scope, "fixture-launches");
    if (!logfile || !fs.existsSync(logfile)) return [];
    return fs
      .readFileSync(logfile, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
  };
  return {
    grant,
    profile,
    helper,
    lookup,
    options,
    launches,
    close: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

const current = () => {};
const linuxProcess = () =>
  vi.stubGlobal(
    "process",
    Object.create(process, { platform: { value: "linux" } })
  );
afterEach(() => vi.unstubAllGlobals());

describe.skipIf(process.platform === "win32")(
  "Main-owned external ACP runs",
  () => {
    it("admits only an explicit native Linux launcher option before the separator", () => {
      const option = "--native-external-acp-profile=/private/reviewed.canvas";
      linuxProcess();
      expect(
        NativeExternalRuns.launchProfile(["--native-chat", option], true)
      ).toBe("/private/reviewed.canvas");
      expect(
        NativeExternalRuns.launchProfile(["--native-chat", "--", option], true)
      ).toBeUndefined();
      expect(() =>
        NativeExternalRuns.launchProfile(["--native-chat", option], false)
      ).toThrow("native_external_profile_invalid");
      expect(() =>
        NativeExternalRuns.launchProfile([option, "--", "--native-chat"], true)
      ).toThrow("native_external_profile_invalid");
      expect(() =>
        NativeExternalRuns.launchProfile(
          ["--native-chat", option, option],
          true
        )
      ).toThrow("native_external_profile_invalid");
      expect(() =>
        NativeExternalRuns.launchProfile(
          [
            "--native-chat",
            "--native-external-acp-profile",
            "/private/reviewed.canvas",
          ],
          true
        )
      ).toThrow("native_external_profile_invalid");
    });

    it("uses the native catalog's protected scratch and drains the selected peer before Forget", async () => {
      const test = fixture();
      linuxProcess();
      let owner: NativeExternalRuns | undefined;
      try {
        const browserData = test.options.privateDirectory;
        const catalog = new NativeWorkspaceCatalog({
          browserData,
          projectsRoot: path.join(path.dirname(browserData), "projects"),
          protectedPaths: [
            test.options.temporaryDirectory,
            test.options.profileFile,
          ],
        });
        const open = () =>
          catalog.openExternalRuns((access) =>
            NativeExternalRuns.open({
              ...access,
              profileFile: test.options.profileFile,
              resourcesPath: test.options.resourcesPath,
            })
          );
        await expect(open()).rejects.toThrow("workspace_not_registered");
        const workspace = await catalog.openSelected(test.grant.root);
        fs.writeFileSync(
          test.options.profileFile,
          JSON.stringify({
            ...test.profile,
            workspaceId: workspace.id,
          })
        );
        owner = await open();
        const scratch = path.join(
          path.dirname(browserData),
          ".grida-external-scratch"
        );
        expect((await catalog.fileGrant(workspace.id)).protected).toContain(
          scratch
        );
        await expect(catalog.openSelected(scratch)).rejects.toThrow(
          "workspace_media_root_denied"
        );
        const alias = path.join(path.dirname(browserData), "scratch-alias");
        fs.symlinkSync(scratch, alias);
        await expect(catalog.openSelected(alias)).rejects.toThrow(
          "workspace_media_root_denied"
        );
        const origin = "https://editor.fixture.invalid";
        const frame = { url: `${origin}/desktop/workspace?id=${workspace.id}` };
        const sender = Object.assign(new EventEmitter(), {
          mainFrame: frame,
          isDestroyed: () => false,
          isLoadingMainFrame: () => false,
        }) as unknown as WebContents;
        const event = {
          sender,
          senderFrame: frame,
        } as unknown as IpcMainInvokeEvent;
        const ipc = new NativeExternalRunIpc(
          origin,
          (caller) => caller === sender,
          () => (owner?.accepting ? owner : undefined)
        );
        expect(await ipc.status(event)).toEqual({
          name: test.profile.name,
          run: null,
        });
        const stopped = randomUUID();
        await ipc.start(event, stopped, "hold");
        await vi.waitFor(async () =>
          expect((await ipc.status(event))?.run).toMatchObject({
            runId: stopped,
            disposition: "running",
          })
        );
        expect(await ipc.stop(event, stopped)).toMatchObject({
          disposition: "cancelled",
          cleanupVerified: true,
        });
        const id = randomUUID();
        await ipc.start(event, id, "hold");
        await vi.waitFor(async () =>
          expect((await ipc.status(event))?.run).toMatchObject({
            runId: id,
            disposition: "running",
          })
        );
        await catalog.forget(workspace.id);
        expect(await catalog.find(workspace.id)).toBeNull();
        expect(await ipc.status(event)).toBeNull();
        expect(await owner.observe(id)).toMatchObject({
          disposition: "cancelled",
          cleanupVerified: true,
        });
        await expect(
          owner.start(randomUUID(), "replacement", current)
        ).rejects.toThrow("native_external_closing");
      } finally {
        await owner?.close().catch(() => {});
        test.close();
      }
    });

    it("reopens an exact lost receipt without dispatching the same run again", async () => {
      const test = fixture();
      linuxProcess();
      let owner: NativeExternalRuns | undefined;
      try {
        owner = await NativeExternalRuns.open(test.options);
        expect(owner.selection).toEqual({
          workspaceId: "workspace",
          name: "Reviewed local peer",
        });
        const id = randomUUID();
        expect(await owner.start(id, "lost reply", current)).toMatchObject({
          runId: id,
          disposition: "starting",
        });
        await vi.waitFor(async () =>
          expect((await owner!.observe(id)).disposition).toBe("succeeded")
        );
        const original = await owner.observe(id);
        expect(original).toEqual({
          runId: id,
          disposition: "succeeded",
          text: "lost reply",
          responseTruncated: false,
          cleanupVerified: true,
        });
        expect(test.launches()).toMatchObject([
          {
            id,
            input: "lost reply",
            profile: {
              cwd: test.grant.root,
              workspaceIdentity: test.grant.identity,
              protectedPaths: expect.arrayContaining([
                test.options.profileFile,
                test.options.privateDirectory,
              ]),
              helper: {
                path: test.helper,
                sha256: [
                  ...createHash("sha256")
                    .update(fs.readFileSync(test.helper))
                    .digest(),
                ],
              },
            },
          },
        ]);
        await owner.close();
        owner = await NativeExternalRuns.open(test.options);
        expect(await owner.latest()).toEqual(original);
        expect(await owner.start(id, "lost reply", current)).toEqual(original);
        await expect(owner.start(id, "changed", current)).rejects.toThrow(
          "native_external_input_conflict"
        );
        expect(test.launches()).toHaveLength(1);
        const next = randomUUID();
        await owner.start(next, "bad echo", current);
        await vi.waitFor(async () =>
          expect((await owner!.observe(next)).disposition).toBe("succeeded")
        );
        expect(await owner.observe(id)).toEqual(original);
        expect(test.launches()).toHaveLength(2);
      } finally {
        await owner?.close().catch(() => {});
        test.close();
      }
    });

    it("stops only the exact running peer and drains the replacement on quit", async () => {
      const test = fixture();
      linuxProcess();
      let owner: NativeExternalRuns | undefined;
      try {
        owner = await NativeExternalRuns.open(test.options);
        const id = randomUUID();
        await owner.start(id, "hold", current);
        await vi.waitFor(async () =>
          expect((await owner!.observe(id)).disposition).toBe("running")
        );
        expect((await owner.start(id, "hold", current)).disposition).toBe(
          "running"
        );
        await expect(
          owner.start(randomUUID(), "other", current)
        ).rejects.toThrow("native_external_busy");
        await expect(owner.stop(randomUUID())).rejects.toThrow(
          "native_external_run_missing"
        );
        expect((await owner.observe(id)).disposition).toBe("running");
        expect(await owner.stop(id)).toEqual({
          runId: id,
          disposition: "cancelled",
          text: "hold",
          responseTruncated: false,
          cleanupVerified: true,
        });
        const next = randomUUID();
        await owner.start(next, "hold", current);
        await vi.waitFor(async () =>
          expect((await owner!.observe(next)).disposition).toBe("running")
        );
        await owner.close();
        expect(await owner.observe(next)).toMatchObject({
          disposition: "cancelled",
          cleanupVerified: true,
        });
        await expect(
          owner.start(randomUUID(), "hold", current)
        ).rejects.toThrow("native_external_closing");
        expect(test.launches()).toHaveLength(2);
      } finally {
        await owner?.close().catch(() => {});
        test.close();
      }
    });

    it("retains an unverified run and refuses replacement after reopening Main", async () => {
      const test = fixture();
      linuxProcess();
      let owner: NativeExternalRuns | undefined;
      try {
        owner = await NativeExternalRuns.open(test.options);
        const id = randomUUID();
        await owner.start(id, "uncertain", current);
        await vi.waitFor(async () =>
          expect((await owner!.observe(id)).disposition).toBe("uncertain")
        );
        await expect(owner.close()).rejects.toThrow(
          "native_external_shutdown_unverified"
        );
        owner = await NativeExternalRuns.open(test.options);
        expect(await owner.latest()).toMatchObject({
          runId: id,
          disposition: "uncertain",
          cleanupVerified: false,
        });
        await expect(
          owner.start(randomUUID(), "replacement", current)
        ).rejects.toThrow("native_external_shutdown_unverified");
        const pending = owner.start(randomUUID(), "replacement", current);
        await Promise.all([
          expect(pending).rejects.toThrow(
            "native_external_shutdown_unverified"
          ),
          expect(owner.close()).rejects.toThrow(
            "native_external_shutdown_unverified"
          ),
        ]);
        expect(test.launches()).toHaveLength(1);
      } finally {
        await owner?.close().catch(() => {});
        test.close();
      }
    });

    it("requires the exact registered identity and a current workspace before spawn", async () => {
      const test = fixture();
      linuxProcess();
      let owner: NativeExternalRuns | undefined;
      try {
        owner = await NativeExternalRuns.open(test.options);
        test.lookup.mockResolvedValueOnce(test.grant).mockResolvedValueOnce({
          ...test.grant,
          identity: { ...test.grant.identity, inode: "0" },
        });
        const id = randomUUID();
        await expect(owner.start(id, "read", current)).rejects.toThrow(
          "native_external_workspace_changed"
        );
        expect(await owner.observe(id)).toMatchObject({
          disposition: "not_dispatched",
        });
        let checks = 0;
        const invalidated = () => {
          if (++checks >= 3) throw new Error("frame withdrawn");
        };
        await expect(
          owner.start(randomUUID(), "read", invalidated)
        ).rejects.toThrow("frame withdrawn");
        expect(test.launches()).toEqual([]);
      } finally {
        await owner?.close().catch(() => {});
        test.close();
      }
    });

    it("refuses non-Linux, aliased profiles and workspace-local runtime roots", async () => {
      const test = fixture();
      try {
        vi.stubGlobal(
          "process",
          Object.create(process, { platform: { value: "darwin" } })
        );
        await expect(NativeExternalRuns.open(test.options)).rejects.toThrow(
          "native_external_platform_unsupported"
        );
        linuxProcess();
        await expect(
          NativeExternalRuns.open({
            ...test.options,
            temporaryDirectory: test.options.privateDirectory,
          })
        ).rejects.toThrow("native_external_profile_invalid");
        const alias = test.options.profileFile + ".alias";
        fs.symlinkSync(test.options.profileFile, alias);
        await expect(
          NativeExternalRuns.open({ ...test.options, profileFile: alias })
        ).rejects.toThrow("native_external_state_invalid");
        fs.writeFileSync(
          test.options.profileFile,
          JSON.stringify({
            ...test.profile,
            bubblewrap: { ...test.profile.bubblewrap, path: "/usr/bin/other" },
          })
        );
        await expect(NativeExternalRuns.open(test.options)).rejects.toThrow(
          "native_external_profile_invalid"
        );
        fs.writeFileSync(
          test.options.profileFile,
          JSON.stringify({
            ...test.profile,
            runtimePaths: ["/usr/bin", test.grant.root],
          })
        );
        await expect(NativeExternalRuns.open(test.options)).rejects.toThrow(
          "native_external_profile_invalid"
        );
        expect(test.launches()).toEqual([]);
      } finally {
        test.close();
      }
    });
  }
);
