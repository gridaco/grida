// GRIDA-SEC-004 — disposable legacy and native stores exercise cold startup.
import fs from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultScratchBase } from "@grida/agent/sandbox";
import type { NativeAgentChatLaunch } from "./native-agent-chat";
import type { IpcMainInvokeEvent, WebContents } from "electron";
import type { NativeEditorSvgText } from "@grida/desktop-bridge";
import { IPC_CHANNELS } from "../bridge/contract";
import { NativeChatIpc } from "./native-chat-ipc";
import { NativeDocumentFiles } from "./native-document-files";
import { NativeGatewayConnection } from "./native-gateway-connection";
import { WorkspaceFileWorkers } from "./workspace-file-worker";
import { NativeWorkspaceAgents } from "./native-workspace-agents";
import { LegacyChatArchive } from "./legacy-chat-archive";
import {
  LegacyChatSourceLease,
  type LegacyChatWriterAdmission,
} from "./legacy-chat-source-lease";

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
    current() {
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
  const prepare = async (
    credentialHome?: string,
    admission: Parameters<
      typeof NativeAgentCutover.prepare
    >[0] = fixtureAdmission
  ) => {
    vi.resetModules();
    const { NativeAgentCutover } = await import("./native-agent-cutover");
    return NativeAgentCutover.prepare({ ...admission, credentialHome });
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
  it("retries a managed cutoff against the same acknowledged writer", async () => {
    const test = await fixture();
    const lease = new LegacyChatSourceLease({
      userDataPath: test.legacy,
      scratchBase: test.scratchBase,
    });
    const writer = await lease.claimManagedWriter();
    writeLegacy(test.database, test.scratchBase);
    const verifyWriterAdmission = vi.fn<LegacyChatWriterAdmission>(
      async (identity, claim) =>
        identity.sourceId === writer.sourceId &&
        identity.scratchId === writer.scratchId &&
        claim === writer.claimId
    );
    const admission = {
      requireDrainedClaim: true as const,
      verifyWriterAdmission,
    };
    await expect(test.prepare(undefined, admission)).rejects.toThrow(
      "legacy_chat_source_dirty"
    );
    expect(verifyWriterAdmission).not.toHaveBeenCalled();
    expect(fs.existsSync(test.archiveRoot)).toBe(false);
    await writer.completeDrain(async (claim) => claim === writer.claimId);

    const command = path.join(test.scratchBase, "commands", "undrained");
    fs.mkdirSync(command, { recursive: true, mode: 0o700 });
    await expect(test.prepare(undefined, admission)).rejects.toThrow(
      "legacy_chat_command_drain_unverified"
    );
    expect(fs.existsSync(test.checkpoint)).toBe(false);
    fs.rmdirSync(command);
    await test.prepare(undefined, admission);
    const checkpoint = fs.readFileSync(test.checkpoint);
    await test.prepare(undefined, admission);
    expect(fs.readFileSync(test.checkpoint)).toEqual(checkpoint);
    expect(verifyWriterAdmission.mock.calls.map(([, claim]) => claim)).toEqual([
      writer.claimId,
      writer.claimId,
      writer.claimId,
    ]);
    await expect(lease.claimManagedWriter()).rejects.toThrow(
      "legacy_chat_source_retired"
    );
  });

  it("refuses an absent source on the existing-data path", async () => {
    const test = await fixture();
    await expect(test.prepare()).rejects.toThrow(
      "Legacy chat archive: source_missing"
    );
    expect(fs.existsSync(test.database)).toBe(false);
    expect(fs.existsSync(test.archiveRoot)).toBe(false);
    expect(fs.existsSync(test.nativeState)).toBe(false);
  });

  it.runIf(process.platform === "darwin")(
    "revalidates a completed managed handoff for media-only without repairing storage",
    async () => {
      const test = await fixture();
      const source = {
        userDataPath: test.legacy,
        scratchBase: test.scratchBase,
        desktopUserDataPath: electron.userData,
        providerHome: test.legacy,
        mediaRoot: electron.media,
      };
      const lease = new LegacyChatSourceLease(source);
      const writer = await lease.claimManagedWriter();
      writeLegacy(test.database, test.scratchBase);
      const verifyWriterAdmission: LegacyChatWriterAdmission = async (
        identity,
        claimId
      ) =>
        identity.sourceId === writer.sourceId &&
        identity.scratchId === writer.scratchId &&
        claimId === writer.claimId;
      const verify = () =>
        test.NativeAgentCutover.verifyCompletedMediaOnly(
          source,
          verifyWriterAdmission
        );
      await expect(verify()).rejects.toThrow(
        "native_chat_cutover_not_completed"
      );
      await writer.completeDrain(async () => true);
      const cutover = await test.NativeAgentCutover.prepare({
        requireDrainedClaim: true,
        verifyWriterAdmission,
      });
      await expect(verify()).rejects.toThrow(
        "native_chat_cutover_not_completed"
      );

      const { NativeAgentChat } = await import("./native-agent-chat");
      const start = vi
        .spyOn(NativeAgentChat, "start")
        .mockResolvedValue({ close: async () => {} } as Awaited<
          ReturnType<typeof NativeAgentChat.start>
        >);
      try {
        await cutover.startWorkspace("work", test.launch);
      } finally {
        start.mockRestore();
      }
      const checkpoint = fs.readFileSync(test.checkpoint);
      const database = fs.readFileSync(test.database);
      const control = path.join(
        LegacyChatSourceLease.controlRoot(test.legacy),
        "control.sqlite"
      );
      const controlBytes = fs.readFileSync(control);
      await expect(verify()).resolves.toEqual(cutover.archive);
      await expect(
        test.NativeAgentCutover.verifyCompletedMediaOnly(
          source,
          async () => false
        )
      ).rejects.toThrow("writer_admission_unverified");

      const pending = path.join(test.nativeState, ".cutover.pending");
      fs.writeFileSync(pending, checkpoint, { mode: 0o600 });
      await expect(verify()).rejects.toThrow(
        "native_chat_cutover_not_completed"
      );
      expect(fs.readFileSync(pending)).toEqual(checkpoint);
      fs.unlinkSync(pending);

      fs.chmodSync(test.database, 0o600);
      await expect(verify()).rejects.toThrow("source_fence_incomplete");
      expect(fs.statSync(test.database).mode & 0o777).toBe(0o600);
      fs.chmodSync(test.database, 0o400);
      const archivedInput = path.join(
        cutover.archive!.directory,
        "scratch",
        "ses_fixture",
        "note.txt"
      );
      fs.writeFileSync(archivedInput, "five");
      await expect(verify()).rejects.toThrow("invalid_receipt");
      expect(fs.readFileSync(test.database)).toEqual(database);
      expect(fs.readFileSync(test.checkpoint)).toEqual(checkpoint);
      expect(fs.readFileSync(control)).toEqual(controlBytes);
      fs.unlinkSync(control);
      await expect(verify()).rejects.toMatchObject({ code: "ENOENT" });
      expect(fs.existsSync(control)).toBe(false);
    }
  );

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

  it("reveals only the retired archive after fresh verification and preserves failed recovery", async () => {
    const test = await fixture();
    const reveal = vi.fn<(directory: string) => void>();
    const fresh = await test.NativeAgentCutover.prepareFresh();
    await expect(fresh.revealLegacyChatArchive(reveal)).rejects.toThrow(
      "legacy_chat_archive_unavailable"
    );
    expect(reveal).not.toHaveBeenCalled();

    const retired = await fixture();
    writeLegacy(retired.database, retired.scratchBase);
    const prepared = await retired.prepare();
    const archive = prepared.archive!;
    const checkpoint = fs.readFileSync(retired.checkpoint);
    const sealedSource = fs.readFileSync(retired.database);
    await prepared.revealLegacyChatArchive(reveal);
    expect(reveal).toHaveBeenCalledExactlyOnceWith(archive.directory);

    const input = path.join(
      archive.directory,
      "scratch",
      "ses_fixture",
      "note.txt"
    );
    fs.writeFileSync(input, "five");
    await expect(prepared.revealLegacyChatArchive(reveal)).rejects.toThrow(
      "invalid_receipt"
    );
    fs.writeFileSync(input, "four");
    fs.renameSync(archive.directory, `${archive.directory}-moved`);
    await expect(prepared.revealLegacyChatArchive(reveal)).rejects.toThrow(
      "Legacy chat archive"
    );
    fs.symlinkSync(`${archive.directory}-moved`, archive.directory);
    await expect(prepared.revealLegacyChatArchive(reveal)).rejects.toThrow(
      "Legacy chat archive"
    );
    expect(reveal).toHaveBeenCalledOnce();
    expect(fs.readFileSync(retired.checkpoint)).toEqual(checkpoint);
    expect(fs.readFileSync(retired.database)).toEqual(sealedSource);
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
    const { AgentSidecarSupervisor } =
      await import("./agent-sidecar-supervisor");
    const compatibility = new AgentSidecarSupervisor();
    const marker = LegacyChatSourceLease.controlRoot(test.legacy);
    await expect(
      compatibility.assertCompatibilitySourceAvailable()
    ).resolves.toBeUndefined();
    expect(fs.existsSync(marker)).toBe(false);
    await expect(
      test.NativeAgentCutover.prepare({
        verifyWriterAdmission: async () => false,
      })
    ).rejects.toThrow("writer_admission_unverified");
    expect(fs.existsSync(test.nativeState)).toBe(false);
    expect(fs.existsSync(test.archiveRoot)).toBe(false);
    await expect(compatibility.start()).rejects.toThrow(
      "legacy_chat_handoff_required"
    );
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
    await expect(compatibility.start()).rejects.toThrow(
      "legacy_chat_handoff_required"
    );
    expect(
      fs.readFileSync(
        path.join(
          test.scratchBase,
          "sessions",
          "ses_fixture",
          "scratch",
          "note.txt"
        ),
        "utf8"
      )
    ).toBe("four");
  });

  it("binds the attested historical scratch to the retired source and retry", async () => {
    const test = await fixture();
    const tempRoot = test.child("historical-srt");
    const historicalBase = defaultScratchBase(test.legacy, tempRoot);
    writeLegacy(test.database, historicalBase);
    const source = fs.statSync(test.legacy, { bigint: true });
    const digest = (values: readonly string[]) =>
      createHash("sha256").update(JSON.stringify(values)).digest("hex");
    const historicalScratch = {
      sourceId: digest([
        "legacy-chat-source-v1",
        test.legacy,
        source.dev.toString(),
        source.ino.toString(),
      ]),
      scratchId: digest(["legacy-chat-scratch-v1", test.scratchBase]),
      witness: await LegacyChatArchive.observeHistoricalScratch(
        { userDataPath: test.legacy, scratchBase: test.scratchBase },
        tempRoot
      ),
    };
    const verifyWriterAdmission = vi.fn<LegacyChatWriterAdmission>(
      async () => true
    );
    await expect(
      test.prepare(undefined, {
        verifyWriterAdmission,
        historicalScratch: { ...historicalScratch, scratchId: "0".repeat(64) },
      })
    ).rejects.toThrow("native_chat_cutover_historical_scratch_mismatch");
    expect(verifyWriterAdmission).not.toHaveBeenCalled();
    expect(fs.existsSync(test.archiveRoot)).toBe(false);

    const admission = { verifyWriterAdmission, historicalScratch };
    const displaced = historicalBase + ".displaced";
    fs.renameSync(historicalBase, displaced);
    await expect(test.prepare(undefined, admission)).rejects.toThrow(
      "historical_scratch_changed"
    );
    fs.mkdirSync(historicalBase, { mode: 0o700 });
    await expect(test.prepare(undefined, admission)).rejects.toThrow(
      "historical_scratch_changed"
    );
    expect(fs.existsSync(test.archiveRoot)).toBe(false);
    fs.rmdirSync(historicalBase);
    fs.renameSync(displaced, historicalBase);

    const unfinished = path.join(historicalBase, "commands", "cmd-unverified");
    fs.mkdirSync(unfinished, { mode: 0o700, recursive: true });
    await expect(test.prepare(undefined, admission)).rejects.toThrow(
      "legacy_chat_command_drain_unverified"
    );
    expect(fs.existsSync(test.archiveRoot)).toBe(false);
    fs.rmdirSync(unfinished);

    const first = await test.prepare(undefined, admission);
    expect(first.protectedPaths).toContain(historicalBase);
    expect(first.archive?.inputCaveats).toEqual([
      {
        partId: "file_fixture",
        path: "note.txt",
        reason: "historical_scratch_candidate",
      },
    ]);
    expect(
      fs.readFileSync(
        path.join(first.archive!.directory, "scratch-srt/ses_fixture/note.txt"),
        "utf8"
      )
    ).toBe("four");
    fs.renameSync(tempRoot, tempRoot + ".retired");
    const reopened = await test.prepare(undefined, admission);
    expect(reopened.archive).toEqual(first.archive);
    await expect(test.prepare()).rejects.toThrow(
      "native_chat_cutover_source_changed"
    );
    await expect(
      test.prepare(undefined, {
        ...admission,
        historicalScratch: {
          ...historicalScratch,
          witness: await LegacyChatArchive.observeHistoricalScratch(
            { userDataPath: test.legacy, scratchBase: test.scratchBase },
            test.child("different-srt")
          ),
        },
      })
    ).rejects.toThrow("native_chat_cutover_source_changed");
    expect(fs.readdirSync(test.archiveRoot)).toEqual([first.archive?.id]);
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
    "recovers a writable seal before lease retirement and refuses to rebase an accepted archive",
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
      const legacy = new DatabaseSync(test.database);
      try {
        legacy.exec("INSERT INTO chat_sessions VALUES ('ses_post_seal')");
      } finally {
        legacy.close();
      }
      const prepared = await test.prepare();
      expect(prepared.archive?.id).not.toBe(original.id);
      expect(prepared.archive?.sessionCount).toBe(2);
      expect(
        JSON.parse(fs.readFileSync(test.checkpoint, "utf8"))
      ).toMatchObject({
        archiveId: prepared.archive?.id,
        nativeReady: false,
      });
      fs.chmodSync(test.database, 0o600);
      const bytes = fs.readFileSync(test.database);
      await expect(test.prepare()).rejects.toThrow(
        "Legacy chat archive: source_fence_incomplete"
      );
      expect(fs.readFileSync(test.database)).toEqual(bytes);
      await expect(archive.verify(original.id)).resolves.toEqual(original);
      expect(fs.readdirSync(test.archiveRoot).sort()).toEqual(
        [original.id, prepared.archive?.id].sort()
      );
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
    "persists selected SVG chat with a rootless native worker and live text reply",
    async () => {
      const test = await fixture();
      writeLegacy(test.database, test.scratchBase);
      const prepared = await test.prepare();
      const selected = path.join(test.child("user-files"), "drawing.svg");
      const original = "<svg>Original</svg>";
      fs.writeFileSync(selected, original);
      const origin = "https://editor.fixture.invalid";
      const target = randomUUID();
      const offers: string[][] = [];
      const toolReplies: unknown[] = [];
      const connection = await NativeGatewayConnection.open({
        origin,
        account: {
          withGatewayGrant: async (_, accept) =>
            accept({
              token: "fixture.gateway.token",
              subject: "synthetic-user",
              organizationId: 12,
              expiresAt: Date.now() + 120_000,
              isCurrent: () => true,
            }),
        },
        network: {
          prepare: () => async (body) => {
            const request = JSON.parse(body.toString());
            offers.push(
              (request.tools ?? []).map(
                (tool: { function: { name: string } }) => tool.function.name
              )
            );
            const event = (delta: object, finish_reason: string | null) =>
              `data: ${JSON.stringify({ id: "fixture", choices: [{ index: 0, delta, finish_reason }] })}\n\n`;
            const tool = offers.length === 1;
            const delta = tool
              ? {
                  tool_calls: [
                    {
                      index: 0,
                      id: "replace",
                      type: "function",
                      function: {
                        name: "svg_replace_selected_text",
                        arguments: JSON.stringify({
                          revision: target,
                          text: "Changed",
                        }),
                      },
                    },
                  ],
                }
              : { content: "The selected text changed." };
            toolReplies.push(
              ...request.messages.filter(
                (message: { role: string }) => message.role === "tool"
              )
            );
            return new Response(
              event(delta, null) +
                event({}, tool ? "tool_calls" : "stop") +
                "data: [DONE]\n\n",
              { headers: { "content-type": "text/event-stream" } }
            );
          },
        },
      });
      const workers = new WorkspaceFileWorkers(nativeResources!);
      const receipts = path.join(electron.userData, "document-identities");
      const launch = {
        ...connection.launch("fixture"),
        resourcesPath: nativeResources!,
      };
      const owners = new NativeWorkspaceAgents(prepared, async () => ({
        launch,
      }));
      const files = new NativeDocumentFiles(
        [electron.userData],
        path.dirname(selected),
        workers,
        receipts
      );
      const docId = await files.register(selected);
      let current: WebContents | undefined;
      const ipc = new NativeChatIpc(
        origin,
        () => null,
        {
          admits: () => true,
          ensure: async () => {
            throw new Error("unexpected workspace");
          },
        },
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        false,
        {
          identity: (sender, id, owner) => {
            if (sender !== current || id !== docId)
              throw new Error("unexpected document");
            return files.chatIdentity(id, owner);
          },
          current: (key) => owners.currentDocument(key),
          ensure: async (id, requireCurrent) => {
            await owners.open({ id, requireCurrent });
          },
          close: (key) => owners.closeDocument(key),
        }
      );
      const received = vi.fn<(request: NativeEditorSvgText.Request) => void>();
      const frame = {
        url: `${origin}/desktop/file?docId=${docId}`,
        send(
          channel: string,
          request: NativeEditorSvgText.Request & {
            attachmentId: string;
            callId: string;
          }
        ) {
          if (channel !== IPC_CHANNELS.NATIVE_CHAT_EDITOR_SVG_TEXT) return;
          received(request);
          void ipc
            .documentRequest(event, () =>
              ipc.replyEditorSvgText(
                event,
                request.attachmentId,
                request.callId,
                { kind: "applied", path: "/canvas.svg", saved: false }
              )
            )
            .catch(() => {});
        },
      };
      const contents = Object.assign(new EventEmitter(), {
        mainFrame: frame,
        isDestroyed: () => false,
        isLoadingMainFrame: () => false,
      });
      const event = {
        sender: contents,
        senderFrame: frame,
      } as unknown as IpcMainInvokeEvent;
      current = event.sender;
      const invoke = <T>(run: () => T) => ipc.documentRequest(event, run);
      try {
        await expect(invoke(() => ipc.status(event, true))).resolves.toBe(
          "native-ready"
        );
        const attachment = await invoke(() => ipc.create(event));
        const scoped = {
          active: "/canvas.svg",
          open: ["/canvas.svg"],
          truncated: false,
        };
        await expect(
          invoke(() =>
            ipc.publishEditorSurfaces(event, attachment.attachmentId, {
              ...scoped,
              open: ["/canvas.svg", "/sibling.svg"],
            })
          )
        ).rejects.toThrow("native_chat_editor_surfaces_invalid");
        await expect(
          invoke(() =>
            ipc.publishEditorSurfaces(event, attachment.attachmentId, scoped, 1)
          )
        ).rejects.toThrow("native_chat_editor_surfaces_invalid");
        await invoke(() =>
          ipc.publishEditorSurfaces(event, attachment.attachmentId, scoped)
        );
        await invoke(() =>
          ipc.submit(
            event,
            attachment.attachmentId,
            "fixture-selected-svg",
            "Change the selected text.",
            "act",
            undefined,
            target
          )
        );
        await vi.waitFor(
          async () => {
            const { snapshot } = await invoke(() =>
              ipc.observe(event, attachment.attachmentId)
            );
            expect(snapshot.latest?.status).toBe("succeeded");
          },
          { timeout: 6000 }
        );
        expect(received).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({
            operation: { kind: "replace", revision: target, text: "Changed" },
          })
        );
        expect(toolReplies).toEqual([
          expect.objectContaining({
            content: expect.stringContaining('"saved":false'),
          }),
        ]);
        expect(offers[0]).toEqual(
          expect.arrayContaining([
            "svg_replace_selected_text",
            "svg_read_selected_text",
            "surface_list_open",
          ])
        );
        for (const offer of offers)
          for (const denied of [
            "read_file",
            "list_files",
            "search_text",
            "run_command",
            "surface_open",
            "spawn_agent",
          ])
            expect(offer).not.toContain(denied);
        expect(fs.readFileSync(selected, "utf8")).toBe(original);
        const key = await files.chatIdentity(docId, {
          signal: new AbortController().signal,
          check() {},
        });
        const context = path.join(
          test.nativeState,
          "documents",
          key,
          "context"
        );
        expect(fs.statSync(context).mode & 0o777).toBe(0o700);
        expect(fs.readdirSync(context)).toEqual([]);
        contents.emit("did-start-navigation", { isMainFrame: true });
        await owners.closeDocument(key);
        expect(owners.currentDocument(key)).toBeNull();
        await expect(invoke(() => ipc.status(event, true))).resolves.toBe(
          "native-ready"
        );
        const reopened = await invoke(() =>
          ipc.load(event, attachment.sessionId)
        );
        expect(
          await invoke(() => ipc.transcript(event, reopened.attachmentId))
        ).not.toHaveLength(0);
        expect(offers).toHaveLength(2);
      } finally {
        await owners.close();
        connection.close();
        workers.close();
      }
    },
    15_000
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
