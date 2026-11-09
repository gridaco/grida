// GRIDA-SEC-004 — disposable legacy and native stores exercise cold startup.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultScratchBase } from "@grida/agent/sandbox";
import type { NativeAgentChatLaunch } from "./native-agent-chat";

const electron = vi.hoisted(() => ({ temp: "", userData: "", media: "" }));
vi.mock("electron", () => ({
  app: {
    on: () => {},
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
  return {
    NativeAgentCutover,
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
  it("preserves a verified archive when the native executable is unavailable and resumes interrupted publication", async () => {
    const test = await fixture();
    writeLegacy(test.database, test.scratchBase);
    const first = test.NativeAgentCutover.start(test.launch);
    await expect(test.NativeAgentCutover.start(test.launch)).rejects.toThrow(
      "native_chat_cutover_in_progress"
    );
    await expect(first).rejects.toThrow(
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
    expect(fs.readdirSync(test.nativeState)).toEqual(["cutover.json"]);

    const pending = path.join(test.nativeState, ".cutover.pending");
    fs.writeFileSync(pending, "{ interrupted", { mode: 0o600 });
    await expect(test.NativeAgentCutover.start(test.launch)).rejects.toThrow(
      "native_agent_installation_unavailable"
    );
    expect(fs.readdirSync(test.nativeState)).toEqual(["cutover.json"]);
    expect(JSON.parse(fs.readFileSync(test.checkpoint, "utf8"))).toEqual(
      receipt
    );
    expect(fs.readdirSync(test.archiveRoot)).toEqual([receipt.archiveId]);

    fs.writeFileSync(
      path.join(archived, "scratch", "ses_fixture", "note.txt"),
      "modified"
    );
    await expect(test.NativeAgentCutover.start(test.launch)).rejects.toThrow(
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
    await expect(test.NativeAgentCutover.start(test.launch)).rejects.toThrow(
      "legacy_chat_command_drain_unverified"
    );
    expect(fs.existsSync(command)).toBe(true);
    expect(fs.existsSync(test.archiveRoot)).toBe(false);
    expect(fs.existsSync(test.nativeState)).toBe(false);
    fs.rmdirSync(command);
    fs.mkdirSync(test.nativeState, { mode: 0o700 });
    const foreign = path.join(test.nativeState, "foreign");
    fs.writeFileSync(foreign, "keep");
    await expect(test.NativeAgentCutover.start(test.launch)).rejects.toThrow(
      "native_chat_cutover_unowned_state"
    );
    expect(fs.readFileSync(foreign, "utf8")).toBe("keep");
    expect(fs.existsSync(test.archiveRoot)).toBe(false);
  });

  it("keeps the native store separate from credential custody before any archive work", async () => {
    const test = await fixture();
    await expect(
      test.NativeAgentCutover.start({
        ...test.launch,
        credentialHome: test.nativeState,
      })
    ).rejects.toThrow("native_chat_cutover_state_overlap");
    expect(fs.existsSync(test.nativeState)).toBe(false);
    expect(fs.existsSync(test.archiveRoot)).toBe(false);
  });

  it("captures later legacy commits when the first native startup never became ready", async () => {
    const test = await fixture();
    writeLegacy(test.database, test.scratchBase);
    await expect(test.NativeAgentCutover.start(test.launch)).rejects.toThrow(
      "native_agent_installation_unavailable"
    );
    const first = JSON.parse(fs.readFileSync(test.checkpoint, "utf8"));
    const writer = new DatabaseSync(test.database);
    try {
      writer.exec("INSERT INTO chat_sessions VALUES ('ses_later')");
    } finally {
      writer.close();
    }
    await expect(test.NativeAgentCutover.start(test.launch)).rejects.toThrow(
      "native_agent_installation_unavailable"
    );
    const second = JSON.parse(fs.readFileSync(test.checkpoint, "utf8"));
    expect(second.nativeReady).toBe(false);
    expect(second.archiveId).not.toBe(first.archiveId);
    expect(fs.readdirSync(test.archiveRoot).sort()).toEqual(
      [first.archiveId, second.archiveId].sort()
    );
    const db = new DatabaseSync(
      path.join(test.archiveRoot, second.archiveId, "sessions.db"),
      { readOnly: true }
    );
    try {
      expect(
        db.prepare("SELECT COUNT(*) AS count FROM chat_sessions").get()
      ).toEqual({ count: 2 });
    } finally {
      db.close();
    }
  });

  it.runIf(Boolean(nativeResources))(
    "starts the actual native process from its separate store after verifying the legacy cutoff",
    async () => {
      const test = await fixture();
      writeLegacy(test.database, test.scratchBase);
      await expect(test.NativeAgentCutover.start(test.launch)).rejects.toThrow(
        "native_agent_installation_unavailable"
      );
      const before = JSON.parse(fs.readFileSync(test.checkpoint, "utf8"));
      const launch = { ...test.launch, resourcesPath: nativeResources! };
      const first = await test.NativeAgentCutover.start(launch);
      let id: string;
      try {
        expect(first.stateDirectory).toBe(test.nativeState);
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
      const resumed = await test.NativeAgentCutover.start(launch);
      try {
        expect(await resumed.chat.load(id)).toEqual({ id });
        expect(resumed.archive).toEqual(first.archive);
        expect(fs.existsSync(test.database)).toBe(true);
      } finally {
        await resumed.chat.close();
      }
    },
    15000
  );
});
