// GRIDA-SEC-004 — disposable legacy and native stores exercise cold startup.
import fs from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultScratchBase } from "@grida/agent/sandbox";
import type { NativeAgentChatLaunch } from "./native-agent-chat";
import { NativeWorkspaceAgents } from "./native-workspace-agents";
import { LegacyChatArchive } from "./legacy-chat-archive";
import { LegacyChatSourceLease } from "./legacy-chat-source-lease";

const electron = vi.hoisted(() => ({ temp: "", userData: "", media: "" }));
vi.mock("electron", () => ({
  app: {
    once: () => {},
    getPath: (name: "temp" | "userData") => electron[name],
    hasSingleInstanceLock: () => true,
  },
}));
vi.mock("../env", () => ({ EDITOR_BASE_URL: "https://grida.co" }));
vi.mock("./media-root", () => ({
  DesktopMediaRoot: {
    get current() {
      return electron.media;
    },
  },
}));

const nativeResources = process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES;
const supported = process.platform === "darwin" || process.platform === "linux";
const roots: string[] = [];
const fixtureAdmission = { verifyWriterAdmission: async () => true };

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

async function fixture() {
  vi.resetModules();
  const root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "grida-chat-cutover-")
  );
  roots.push(root);
  const child = (name: string) => {
    const directory = path.join(root, name);
    fs.mkdirSync(directory, { mode: 0o700 });
    return directory;
  };
  const legacy = child("legacy");
  const cwd = child("workspace");
  electron.temp = child("temp");
  electron.userData = child("desktop");
  electron.media = child("media");
  vi.stubEnv("GRIDA_AGENT_USER_DATA", legacy);
  const scratchBase = defaultScratchBase(legacy, electron.temp);
  const nativeState = path.join(electron.userData, "native-chat");
  const checkpoint = path.join(nativeState, "cutover.json");
  const archiveRoot = path.join(legacy, "chat-archive");
  const launch: Omit<NativeAgentChatLaunch, "stateDirectory"> = {
    resourcesPath: child("missing-resources"),
    cwd,
    provider: "openai-compatible",
    endpoint: "http://127.0.0.1:1/v1",
    model: "fixture",
  };
  const { NativeAgentCutover } = await import("./native-agent-cutover");
  const prepare = async (credentialHome?: string) => {
    vi.resetModules();
    const { NativeAgentCutover } = await import("./native-agent-cutover");
    return NativeAgentCutover.prepare({ ...fixtureAdmission, credentialHome });
  };
  return {
    NativeAgentCutover,
    prepare,
    start: async (options = launch) =>
      (await prepare(options.credentialHome)).startWorkspace("work", options),
    child,
    launch,
    nativeState,
    checkpoint,
    legacy,
    scratchBase,
    archiveRoot,
    database: path.join(legacy, "sessions.db"),
  };
}

function writeLegacy(database: string, scratchBase: string): void {
  const db = new DatabaseSync(database);
  try {
    db.exec(`
      CREATE TABLE chat_sessions(id TEXT PRIMARY KEY);
      CREATE TABLE chat_parts(id TEXT PRIMARY KEY, session_id TEXT, type TEXT, data_json TEXT);
      INSERT INTO chat_sessions VALUES ('ses_fixture');
      INSERT INTO chat_parts VALUES
        ('file_fixture', 'ses_fixture', 'data-user_file_attachments', '{"location":"scratch","files":[{"path":"note.txt","size":4}]}');
      PRAGMA user_version = 3;
    `);
  } finally {
    db.close();
  }
  const scratch = path.join(scratchBase, "sessions", "ses_fixture", "scratch");
  fs.mkdirSync(scratch, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(scratch, "note.txt"), "four", { mode: 0o600 });
}

describe.skipIf(!supported)("Native Desktop cold start", () => {
  it("refuses an absent source on the existing-data path", async () => {
    const test = await fixture();
    await expect(test.prepare()).rejects.toThrow(
      "Legacy chat archive: source_missing"
    );
    expect(fs.existsSync(test.database)).toBe(false);
    expect(fs.existsSync(test.archiveRoot)).toBe(false);
    expect(fs.existsSync(test.nativeState)).toBe(false);
  });

  it("refuses existing legacy history when native chat is selected for a fresh profile", async () => {
    const test = await fixture();
    writeLegacy(test.database, test.scratchBase);
    await expect(test.NativeAgentCutover.prepareFresh()).rejects.toThrow(
      "native_chat_requires_fresh_profile"
    );
    expect(fs.existsSync(test.database)).toBe(true);
    expect(fs.existsSync(test.archiveRoot)).toBe(false);
    expect(fs.existsSync(test.nativeState)).toBe(false);
  });

  it("preserves a verified archive when the native executable is unavailable and resumes interrupted publication", async () => {
    const test = await fixture();
    writeLegacy(test.database, test.scratchBase);
    const first = test.NativeAgentCutover.prepare(fixtureAdmission);
    await expect(
      test.NativeAgentCutover.prepare(fixtureAdmission)
    ).rejects.toThrow("native_chat_cutover_in_progress");
    const prepared = await first;
    await expect(
      test.NativeAgentCutover.prepare(fixtureAdmission)
    ).rejects.toThrow("native_chat_cutover_already_prepared");
    expect(fs.readdirSync(test.nativeState)).toEqual(["cutover.json"]);
    await expect(prepared.startWorkspace("work", test.launch)).rejects.toThrow(
      "native_agent_installation_unavailable"
    );
    const receipt = JSON.parse(fs.readFileSync(test.checkpoint, "utf8"));
    expect(receipt).toEqual(
      expect.objectContaining({
        archiveId: expect.stringMatching(/^[a-f0-9]{64}$/),
        nativeReady: false,
      })
    );
    expect(fs.statSync(test.checkpoint).mode & 0o777).toBe(0o600);
    const archived = path.join(test.archiveRoot, receipt.archiveId);
    expect(
      fs.readFileSync(
        path.join(archived, "scratch", "ses_fixture", "note.txt"),
        "utf8"
      )
    ).toBe("four");
    expect(fs.existsSync(test.database)).toBe(true);
    expect(fs.readdirSync(test.nativeState).sort()).toEqual([
      "cutover.json",
      "workspaces",
    ]);

    const pending = path.join(test.nativeState, ".cutover.pending");
    fs.writeFileSync(pending, "{ interrupted", { mode: 0o600 });
    await expect(test.start()).rejects.toThrow(
      "native_agent_installation_unavailable"
    );
    expect(fs.readdirSync(test.nativeState).sort()).toEqual([
      "cutover.json",
      "workspaces",
    ]);
    expect(JSON.parse(fs.readFileSync(test.checkpoint, "utf8"))).toEqual(
      receipt
    );
    expect(fs.readdirSync(test.archiveRoot)).toEqual([receipt.archiveId]);

    fs.writeFileSync(
      path.join(archived, "scratch", "ses_fixture", "note.txt"),
      "modified"
    );
    await expect(test.start()).rejects.toThrow(
      "Legacy chat archive: invalid_receipt"
    );
    expect(
      JSON.parse(fs.readFileSync(test.checkpoint, "utf8")).nativeReady
    ).toBe(false);
  });

  it("refuses leftover command work and unrelated native state before archiving", async () => {
    const test = await fixture();
    writeLegacy(test.database, test.scratchBase);
    const command = path.join(test.scratchBase, "commands", "cmd-uncertain");
    fs.mkdirSync(command, { recursive: true, mode: 0o700 });
    await expect(test.start()).rejects.toThrow(
      "legacy_chat_command_drain_unverified"
    );
    expect(fs.existsSync(command)).toBe(true);
    expect(fs.existsSync(test.archiveRoot)).toBe(false);
    expect(fs.existsSync(test.nativeState)).toBe(false);
    fs.rmdirSync(command);
    fs.mkdirSync(test.nativeState, { mode: 0o700 });
    const foreign = path.join(test.nativeState, "foreign");
    fs.writeFileSync(foreign, "keep");
    await expect(test.start()).rejects.toThrow(
      "native_chat_cutover_unowned_state"
    );
    expect(fs.readFileSync(foreign, "utf8")).toBe("keep");
    expect(fs.existsSync(test.archiveRoot)).toBe(false);
  });

  it("keeps the native store separate from credential custody before any archive work", async () => {
    const test = await fixture();
    await expect(
      test.start({
        ...test.launch,
        credentialHome: test.nativeState,
      })
    ).rejects.toThrow("native_chat_cutover_state_overlap");
    expect(fs.existsSync(test.nativeState)).toBe(false);
    expect(fs.existsSync(test.archiveRoot)).toBe(false);
  });

  it("requires writer admission and the exact drained claim before publishing a cutoff", async () => {
    const test = await fixture();
    writeLegacy(test.database, test.scratchBase);
    await expect(
      test.NativeAgentCutover.prepare({
        verifyWriterAdmission: async () => false,
      })
    ).rejects.toThrow("writer_admission_unverified");
    expect(fs.existsSync(test.nativeState)).toBe(false);
    expect(fs.existsSync(test.archiveRoot)).toBe(false);
    const lease = new LegacyChatSourceLease({
      userDataPath: test.legacy,
      scratchBase: test.scratchBase,
    });
    const writer = await lease.claimWriter();
    await expect(test.prepare()).rejects.toThrow("dirty");
    expect(fs.existsSync(test.archiveRoot)).toBe(false);
    await writer.completeDrain(async (claimId) => claimId === writer.claimId);
    const prepared = await test.prepare();
    expect(prepared.archive?.sessionCount).toBe(1);
    await expect(lease.claimWriter()).rejects.toThrow("retired");
  });

  it("reuses the retired archive when startup stopped before publishing its Desktop receipt", async () => {
    const test = await fixture();
    writeLegacy(test.database, test.scratchBase);
    const first = await test.prepare();
    const receipt = fs.readFileSync(test.checkpoint, "utf8");
    // Simulate interruption after shared retirement but before this profile's
    // first receipt was durable. There is still no native workspace state.
    fs.unlinkSync(test.checkpoint);
    const second = await test.prepare();
    expect(second.archive).toEqual(first.archive);
    expect(fs.readFileSync(test.checkpoint, "utf8")).toBe(receipt);
    expect(fs.readdirSync(test.archiveRoot)).toEqual([first.archive?.id]);
  });

  it("recovers a committed source seal before shared retirement is published", async () => {
    const test = await fixture();
    writeLegacy(test.database, test.scratchBase);
    const source = { userDataPath: test.legacy, scratchBase: test.scratchBase };
    const key = createHash("sha256")
      .update(JSON.stringify([source.userDataPath, source.scratchBase]))
      .digest("hex");
    const requestId = `desktop-native-chat-${key}`;
    const lease = new LegacyChatSourceLease(source);
    const archive = new LegacyChatArchive(source);
    await expect(
      lease.retire({
        ...fixtureAdmission,
        requestId,
        verifyArchive: async () => {
          await archive.sealQuiesced({
            requestId,
            requireReadOnlySource: process.platform === "darwin",
          });
          throw new Error("interrupted before lease commit");
        },
      })
    ).rejects.toThrow("interrupted before lease commit");
    expect(fs.existsSync(test.nativeState)).toBe(false);
    const [archiveId] = fs.readdirSync(test.archiveRoot);
    const recovered = await test.prepare();
    expect(recovered.archive?.id).toBe(archiveId);
    expect(fs.readdirSync(test.archiveRoot)).toEqual([archiveId]);
    expect(JSON.parse(fs.readFileSync(test.checkpoint, "utf8"))).toMatchObject({
      archiveId,
      nativeReady: false,
    });
    await expect(lease.claimWriter()).rejects.toThrow("retired");
  });

  it.skipIf(process.platform !== "darwin" || !process.geteuid?.())(
    "withholds native readiness when the sealed source is still writable",
    async () => {
      const test = await fixture();
      writeLegacy(test.database, test.scratchBase);
      const source = {
        userDataPath: test.legacy,
        scratchBase: test.scratchBase,
      };
      const key = createHash("sha256")
        .update(JSON.stringify([source.userDataPath, source.scratchBase]))
        .digest("hex");
      const archive = new LegacyChatArchive(source);
      const original = await archive.sealQuiesced({
        requestId: `desktop-native-chat-${key}`,
      });
      const bytes = fs.readFileSync(test.database);
      await expect(test.prepare()).rejects.toThrow(
        "Legacy chat archive: source_fence_incomplete"
      );
      expect(fs.existsSync(test.nativeState)).toBe(false);
      expect(fs.readFileSync(test.database)).toEqual(bytes);
      await expect(archive.verify(original.id)).resolves.toEqual(original);
    }
  );

  it.runIf(Boolean(nativeResources))(
    "rechecks the exact source seal and archive before publishing native readiness",
    async () => {
      const test = await fixture();
      writeLegacy(test.database, test.scratchBase);
      const prepared = await test.prepare();
      const launch = { ...test.launch, resourcesPath: nativeResources! };
      const file = path.join(
        prepared.archive!.directory,
        "scratch/ses_fixture/note.txt"
      );
      const original = fs.readFileSync(file);
      fs.writeFileSync(file, "changed");
      await expect(prepared.startWorkspace("work", launch)).rejects.toThrow(
        "Legacy chat archive: invalid_receipt"
      );
      fs.writeFileSync(file, original);
      const mode = fs.lstatSync(test.database).mode & 0o7777;
      expect(mode & 0o200).toBe(process.platform === "darwin" ? 0 : 0o200);
      if (process.platform === "darwin") fs.chmodSync(test.database, 0o600);
      const source = new DatabaseSync(test.database);
      try {
        source.exec("PRAGMA user_version=3");
      } finally {
        source.close();
        if (process.platform === "darwin") fs.chmodSync(test.database, mode);
      }
      await expect(prepared.startWorkspace("work", launch)).rejects.toThrow(
        "Legacy chat archive: invalid_source_seal"
      );
      expect(
        JSON.parse(fs.readFileSync(test.checkpoint, "utf8")).nativeReady
      ).toBe(false);
    },
    10_000
  );

  it.runIf(Boolean(nativeResources))(
    "starts the actual native process from its separate store after verifying the legacy cutoff",
    async () => {
      const test = await fixture();
      writeLegacy(test.database, test.scratchBase);
      await expect(test.start()).rejects.toThrow(
        "native_agent_installation_unavailable"
      );
      const before = JSON.parse(fs.readFileSync(test.checkpoint, "utf8"));
      const launch = { ...test.launch, resourcesPath: nativeResources! };
      const first = await test.start(launch);
      let id: string;
      try {
        expect(path.dirname(first.stateDirectory)).toBe(
          path.join(test.nativeState, "workspaces")
        );
        expect(first.archive).toEqual(
          expect.objectContaining({
            id: before.archiveId,
            sessionCount: 1,
            inputCaveats: [],
          })
        );
        expect(JSON.parse(fs.readFileSync(test.checkpoint, "utf8"))).toEqual({
          ...before,
          nativeReady: true,
        });
        const session = await first.chat.create();
        id = session.id;
        expect(id).not.toBe("ses_fixture");
        expect(await first.chat.observe(session)).toEqual(
          expect.objectContaining({ current: null, latest: null })
        );
      } finally {
        await first.chat.close();
      }
      const resumed = await test.start(launch);
      try {
        expect(await resumed.chat.load(id)).toEqual({ id });
        expect(resumed.stateDirectory).toBe(first.stateDirectory);
        expect(resumed.archive).toEqual(first.archive);
        expect(fs.existsSync(test.database)).toBe(true);
      } finally {
        await resumed.chat.close();
      }
    },
    15000
  );

  it.runIf(Boolean(nativeResources))(
    "opens two private workspace stores under one prepared archive",
    async () => {
      const test = await fixture();
      writeLegacy(test.database, test.scratchBase);
      const prepared = await test.NativeAgentCutover.prepare(fixtureAdmission);
      const one = { ...test.launch, resourcesPath: nativeResources! };
      const two = { ...one, cwd: test.child("other-workspace") };
      const results = await Promise.allSettled([
        prepared.startWorkspace("one", one),
        prepared.startWorkspace("two", two),
      ]);
      try {
        const [first, second] = results.map((result) => {
          if (result.status === "rejected") throw result.reason;
          return result.value;
        });
        expect(first.stateDirectory).not.toBe(second.stateDirectory);
        expect(first.archive).toEqual(second.archive);
        const session = await first.chat.create();
        await expect(second.chat.load(session.id)).rejects.toThrow(
          "session_missing"
        );
        expect(
          JSON.parse(fs.readFileSync(test.checkpoint, "utf8")).nativeReady
        ).toBe(true);
        expect(fs.readdirSync(test.archiveRoot)).toHaveLength(1);
      } finally {
        await Promise.all(
          results.map((result) =>
            result.status === "fulfilled"
              ? result.value.chat.close()
              : undefined
          )
        );
      }
    },
    15000
  );

  it.runIf(Boolean(nativeResources))(
    "shares workspace startup across windows and drains all retained ownership",
    async () => {
      const test = await fixture();
      const prepared = await test.NativeAgentCutover.prepareFresh();
      const workspace = { id: "work", root: test.launch.cwd };
      const release = vi.fn<() => void>();
      const launch = { ...test.launch, resourcesPath: nativeResources! };
      const prepare = vi.fn<
        () => Promise<{ launch: typeof launch; release: () => void }>
      >(async () => ({ launch, release }));
      const owners = new NativeWorkspaceAgents(prepared, prepare);
      let id: string;
      try {
        const first = owners.open(workspace);
        const second = owners.open(workspace);
        expect(owners.current(workspace.id)).toBeNull();
        const active = await first;
        expect(await second).toBe(active);
        expect(owners.current(workspace.id)).toBe(active);
        expect(prepare).toHaveBeenCalledTimes(1);
        await expect(
          owners.open({ ...workspace, root: test.child("other-root") })
        ).rejects.toThrow("native_workspace_root_changed");
        id = (await active.chat.create()).id;
      } finally {
        await owners.close();
      }
      expect(owners.current(workspace.id)).toBeNull();
      expect(release).toHaveBeenCalledTimes(1);
      await expect(owners.open(workspace)).rejects.toThrow(
        "native_workspace_closing"
      );
      const restarted = new NativeWorkspaceAgents(prepared, prepare);
      try {
        const active = await restarted.open(workspace);
        expect(await active.chat.load(id)).toEqual({ id });
      } finally {
        await restarted.close();
      }
      expect(release).toHaveBeenCalledTimes(2);
      const began = Promise.withResolvers<void>();
      const resolveLaunch = Promise.withResolvers<void>();
      const pending = new NativeWorkspaceAgents(prepared, async (_, signal) => {
        began.resolve();
        await resolveLaunch.promise;
        expect(signal.aborted).toBe(true);
        return { launch, release };
      });
      const result = pending.open(workspace);
      await began.promise;
      const drained = pending.close();
      resolveLaunch.resolve();
      await expect(result).rejects.toThrow("native_workspace_closing");
      await drained;
      expect(release).toHaveBeenCalledTimes(3);
    },
    15000
  );

  it.runIf(Boolean(nativeResources))(
    "reopens a disconnected workspace without redispatching interrupted work",
    async () => {
      const test = await fixture();
      const prepared = await test.NativeAgentCutover.prepareFresh();
      const workspace = { id: "work", root: test.launch.cwd };
      const resourcesPath = test.child("crash-resources");
      const executableDir = path.join(resourcesPath, "native-agent");
      fs.mkdirSync(executableDir, { mode: 0o700 });
      const original = path.join(
        nativeResources!,
        "native-agent",
        "grida-agent"
      );
      const pidFile = path.join(resourcesPath, "fixture.pid");
      const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
      fs.writeFileSync(
        path.join(executableDir, "grida-agent"),
        `#!/bin/sh\nprintf '%s' "$$" > ${quote(pidFile)}\nexec ${quote(original)} "$@"\n`,
        { mode: 0o700 }
      );
      const requested = Promise.withResolvers<void>();
      let attempts = 0;
      const release = vi.fn<() => void>();
      const owners = new NativeWorkspaceAgents(prepared, async () => ({
        launch: {
          ...test.launch,
          resourcesPath,
          providerNetwork: {
            prepare: () => async () => {
              attempts += 1;
              requested.resolve();
              return new Response(new ReadableStream(), {
                headers: { "content-type": "text/event-stream" },
              });
            },
          },
        },
        release,
      }));
      try {
        const first = await owners.open(workspace);
        const session = await first.chat.create();
        const accepted = await first.chat.submit(
          session,
          "crash-fixture",
          "Hold this attempt"
        );
        await requested.promise;
        const pid = Number(fs.readFileSync(pidFile, "utf8"));
        expect(pid).toBeGreaterThan(1);
        process.kill(pid, "SIGKILL");
        await vi.waitFor(() => expect(owners.current(workspace.id)).toBeNull());
        const replacement = await owners.open(workspace);
        expect(replacement).not.toBe(first);
        expect(release).toHaveBeenCalledTimes(1);
        const reopened = await replacement.chat.load(session.id);
        expect(
          (await replacement.chat.observe(reopened)).current
        ).toMatchObject({
          turnId: accepted.turnId,
          disposition: "interrupted",
        });
        expect(attempts).toBe(1);
      } finally {
        await owners.close();
      }
      expect(release).toHaveBeenCalledTimes(2);
    },
    15_000
  );
});
