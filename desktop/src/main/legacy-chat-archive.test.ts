// GRIDA-SEC-004 — legacy archive fixtures use disposable private roots only.
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout } from "node:timers/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LegacyChatArchive } from "./legacy-chat-archive";

const roots: string[] = [];
const unix = process.platform === "darwin" || process.platform === "linux";

afterEach(async () => {
  for (const root of roots.splice(0))
    await fs.rm(root, { recursive: true, force: true });
});

async function fixture() {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "grida-legacy-archive-")
  );
  roots.push(root);
  const userDataPath = path.join(root, "legacy");
  const scratchBase = path.join(root, "scratch");
  const scratch = path.join(scratchBase, "sessions", "ses_fixture", "scratch");
  const db = path.join(userDataPath, "sessions.db");
  const archiveRoot = path.join(userDataPath, "chat-archive");
  await fs.mkdir(userDataPath, { mode: 0o700 });
  return {
    root,
    userDataPath,
    scratchBase,
    scratch,
    db,
    archiveRoot,
    archive: new LegacyChatArchive({ userDataPath, scratchBase }),
  };
}

// Historical storage columns used by the archive reader, with an inline file,
// a scratch attachment and a template context. The old writer's data shapes
// are kept in the fixture without importing its runtime.
const schema = `
  CREATE TABLE chat_sessions(id TEXT PRIMARY KEY);
  CREATE TABLE chat_messages(id TEXT PRIMARY KEY, session_id TEXT, role TEXT);
  CREATE TABLE chat_parts(id TEXT PRIMARY KEY, session_id TEXT, type TEXT, data_json TEXT);
  INSERT INTO chat_sessions VALUES ('ses_fixture'), ('ses_template');
  INSERT INTO chat_messages VALUES ('user_fixture', 'ses_fixture', 'user');
  INSERT INTO chat_parts VALUES
    ('p_inline', 'ses_fixture', 'file', '{"url":"data:image/png;base64,AAECAw=="}'),
    ('p_files', 'ses_fixture', 'data-user_file_attachments', '{"location":"scratch","files":[{"path":"upload.png","size":4},{"path":"swept.pdf","size":42}]}'),
    ('p_template', 'ses_template', 'data-user_template_selection', '{"bundle_location":"scratch","title":"Fixture"}'),
    ('p_template_present', 'ses_fixture', 'data-user_template_selection', '{"bundle_location":"scratch","title":"Fixture with scratch"}');
`;

function createDatabase(filename: string, version = 3) {
  const db = new DatabaseSync(filename);
  try {
    db.exec(`${schema} PRAGMA user_version = ${version}`);
  } finally {
    db.close();
  }
}

it("finds no chat store on a fresh launch and creates no archive", async () => {
  const { archive, archiveRoot } = await fixture();
  expect(await archive.snapshotQuiesced()).toBeNull();
  await expect(fs.lstat(archiveRoot)).rejects.toMatchObject({ code: "ENOENT" });
});

describe.skipIf(!unix)("legacy chat preservation", () => {
  it("requires the idle legacy WAL owner to close before sealing", async () => {
    const { archive, db, archiveRoot } = await fixture();
    createDatabase(db);
    const writer = spawn(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
        import { DatabaseSync } from "node:sqlite";
        const db = new DatabaseSync(process.argv[1]);
        db.exec("PRAGMA journal_mode = WAL");
        db.prepare("SELECT id FROM chat_sessions LIMIT 1").get();
        process.stdout.write("ready\\n");
        process.stdin.resume();
        process.stdin.once("end", () => db.close());
      `,
        db,
      ],
      { stdio: ["pipe", "pipe", "inherit"] }
    );
    const closed = once(writer, "close");
    try {
      const [ready] = await once(writer.stdout, "data");
      expect(ready.toString()).toBe("ready\n");
      await expect(
        archive.sealQuiesced({ requestId: "retire" })
      ).rejects.toThrow("Legacy chat archive: source_busy");
      await expect(fs.lstat(archiveRoot)).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      writer.stdin.end();
      await expect(closed).resolves.toEqual([0, null]);
    }
    const result = await archive.sealQuiesced({ requestId: "retire" });
    expect(result.sessionCount).toBe(2);
    expect(result.inputCaveats).not.toHaveLength(0);
    const source = new DatabaseSync(db, { readOnly: true });
    const preserved = new DatabaseSync(
      path.join(result.directory, "sessions.db"),
      { readOnly: true }
    );
    try {
      expect(source.prepare("PRAGMA user_version").get()?.user_version).toBe(
        2_147_483_647
      );
      expect(preserved.prepare("PRAGMA user_version").get()?.user_version).toBe(
        3
      );
      expect(
        source.prepare("SELECT id FROM chat_sessions ORDER BY id").all()
      ).toEqual(
        preserved.prepare("SELECT id FROM chat_sessions ORDER BY id").all()
      );
    } finally {
      source.close();
      preserved.close();
    }
  });

  it("recaptures an unsealed source and only reuses the archive named by its seal", async () => {
    const { archive, db } = await fixture();
    createDatabase(db);
    const orphan = await archive.snapshotQuiesced();
    const writer = new DatabaseSync(db);
    try {
      writer.exec("INSERT INTO chat_sessions VALUES ('ses_after_archive')");
    } finally {
      writer.close();
    }
    const receipt = await archive.sealQuiesced({ requestId: "retire" });
    expect(receipt.id).not.toBe(orphan?.id);
    expect(receipt.sessionCount).toBe(3);
    expect(
      await archive.sealQuiesced({
        requestId: "retire",
        expectedArchiveId: receipt.id,
      })
    ).toEqual(receipt);
    await expect(
      archive.sealQuiesced({
        requestId: "retire",
        expectedArchiveId: orphan!.id,
      })
    ).rejects.toThrow("Legacy chat archive: invalid_source_seal");
    await expect(
      archive.sealQuiesced({ requestId: "another-cutoff" })
    ).rejects.toThrow("Legacy chat archive: invalid_source_seal");
  });

  it("refuses a source replaced while verifying its retained archive", async () => {
    const { archive, db } = await fixture();
    createDatabase(db);
    const receipt = await archive.sealQuiesced({ requestId: "retire" });
    const manifest = path.join(receipt.directory, "manifest.json");
    const open = fs.open;
    const replace = vi.spyOn(fs, "open").mockImplementation(async (...args) => {
      if (args[0] === manifest) {
        await fs.rename(db, `${db}.detached`);
        createDatabase(db);
      }
      return open(...args);
    });
    try {
      await expect(
        archive.sealQuiesced({
          requestId: "retire",
          expectedArchiveId: receipt.id,
        })
      ).rejects.toThrow("Legacy chat archive: source_changed");
      expect(replace).toHaveBeenCalledWith(manifest, expect.any(Number));
    } finally {
      replace.mockRestore();
    }
    const replacement = new DatabaseSync(db, { readOnly: true });
    try {
      expect(
        replacement.prepare("PRAGMA user_version").get()?.user_version
      ).toBe(3);
    } finally {
      replacement.close();
    }
  });

  it("refuses to seal an absent or unknown legacy source", async () => {
    const { archive, db, archiveRoot } = await fixture();
    await expect(archive.sealQuiesced({ requestId: "retire" })).rejects.toThrow(
      "Legacy chat archive: source_missing"
    );
    await expect(fs.lstat(db)).rejects.toMatchObject({ code: "ENOENT" });
    createDatabase(db, 4);
    await expect(archive.sealQuiesced({ requestId: "retire" })).rejects.toThrow(
      "Legacy chat archive: unsupported_schema"
    );
    await expect(fs.lstat(archiveRoot)).rejects.toMatchObject({
      code: "ENOENT",
    });
    const source = new DatabaseSync(db, { readOnly: true });
    try {
      expect(source.prepare("PRAGMA user_version").get()?.user_version).toBe(4);
    } finally {
      source.close();
    }
  });
  it("preserves committed WAL rows, selected scratch and inline bytes in a verified receipt", async () => {
    const { archive, db, root, scratch, scratchBase, userDataPath } =
      await fixture();
    // Exiting without SQLite close leaves committed records only in WAL.
    const writer = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
      import { DatabaseSync } from "node:sqlite";
      const db = new DatabaseSync(process.argv[1]);
      db.exec("PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0");
      db.exec(process.argv[2]);
      process.exit(0);
    `,
        db,
        `${schema} PRAGMA user_version = 3;`,
      ],
      { encoding: "utf8", timeout: 5_000 }
    );
    expect(writer.status).toBe(0);
    expect((await fs.stat(`${db}-wal`)).size).toBeGreaterThan(0);
    const bare = path.join(root, "uncheckpointed.db");
    await fs.copyFile(db, bare);
    const mainOnly = new DatabaseSync(bare, { readOnly: true });
    try {
      expect(
        mainOnly
          .prepare("SELECT name FROM sqlite_master WHERE name = 'chat_parts'")
          .get()
      ).toBeUndefined();
    } finally {
      mainOnly.close();
    }

    await fs.mkdir(path.join(scratch, "bundle"), {
      recursive: true,
      mode: 0o700,
    });
    await fs.writeFile(
      path.join(scratch, "upload.png"),
      Buffer.from([0, 1, 2, 3])
    );
    await fs.writeFile(
      path.join(scratch, "bundle", "manifest.json"),
      "bundle bytes"
    );
    const unrelated = path.join(
      scratchBase,
      "sessions",
      "ses_unrelated",
      "scratch"
    );
    await fs.mkdir(unrelated, { recursive: true, mode: 0o700 });
    await fs.writeFile(path.join(unrelated, "no-copy"), "unrelated");
    await fs.writeFile(
      path.join(userDataPath, "auth.json"),
      "private credential fixture"
    );

    const receipt = await archive.snapshotQuiesced();
    expect(receipt).not.toBeNull();
    const { id, directory, inputCaveats, sessionCount } = receipt!;
    expect(sessionCount).toBe(2);
    expect(inputCaveats).toEqual([
      { partId: "p_files", path: "swept.pdf", reason: "missing" },
      { partId: "p_template", reason: "template_scratch_missing" },
      { partId: "p_template_present", reason: "template_members_unknown" },
    ]);
    expect(await archive.verify(id)).toEqual(receipt);
    expect((await fs.readdir(directory)).sort()).toEqual([
      "manifest.json",
      "scratch",
      "sessions.db",
    ]);
    expect(await fs.readdir(path.join(directory, "scratch"))).toEqual([
      "ses_fixture",
    ]);
    expect(
      await fs.readFile(
        path.join(directory, "scratch", "ses_fixture", "upload.png")
      )
    ).toEqual(Buffer.from([0, 1, 2, 3]));
    expect(
      await fs.readFile(
        path.join(
          directory,
          "scratch",
          "ses_fixture",
          "bundle",
          "manifest.json"
        ),
        "utf8"
      )
    ).toBe("bundle bytes");
    expect((await fs.stat(directory)).mode & 0o777).toBe(0o700);
    expect(
      (await fs.stat(path.join(directory, "sessions.db"))).mode & 0o777
    ).toBe(0o600);
    const archived = new DatabaseSync(path.join(directory, "sessions.db"), {
      readOnly: true,
    });
    try {
      expect(
        archived
          .prepare("SELECT data_json FROM chat_parts WHERE id = 'p_inline'")
          .get()
      ).toEqual({ data_json: '{"url":"data:image/png;base64,AAECAw=="}' });
      expect(archived.prepare("PRAGMA user_version").get()).toEqual({
        user_version: 3,
      });
    } finally {
      archived.close();
    }
    expect(
      await fs.readFile(path.join(userDataPath, "auth.json"), "utf8")
    ).toBe("private credential fixture");
    expect(await fs.readFile(path.join(scratch, "upload.png"))).toEqual(
      Buffer.from([0, 1, 2, 3])
    );
    expect(await archive.snapshotQuiesced()).toEqual(receipt);
  });

  it("restarts a partial archive and converges concurrent retries without replacing receipts", async () => {
    const { archive, archiveRoot, db, userDataPath, scratchBase } =
      await fixture();
    createDatabase(db, 0);
    const partial = path.join(archiveRoot, ".pending");
    const killed = spawnSync(
      process.execPath,
      [
        "--experimental-transform-types",
        "--input-type=module",
        "-e",
        `
        import fs from "node:fs/promises";
        const { LegacyChatArchive } = await import(process.argv[1]);
        const open = fs.open;
        fs.open = async (...args) => {
          const handle = await open(...args);
          if (String(args[0]).endsWith("/.pending/manifest.json")) {
            await handle.writeFile("interrupted manifest");
            await handle.sync();
            process.kill(process.pid, "SIGKILL");
          }
          return handle;
        };
        await new LegacyChatArchive({ userDataPath: process.argv[2], scratchBase: process.argv[3] }).snapshotQuiesced();
      `,
        new URL("./legacy-chat-archive.ts", import.meta.url).href,
        userDataPath,
        scratchBase,
      ],
      { timeout: 5_000 }
    );
    expect(killed.signal).toBe("SIGKILL");
    expect(await fs.readFile(path.join(partial, "manifest.json"), "utf8")).toBe(
      "interrupted manifest"
    );
    const another = new LegacyChatArchive({ userDataPath, scratchBase });
    const [first, second] = await Promise.all([
      archive.snapshotQuiesced(),
      another.snapshotQuiesced(),
    ]);
    expect(first).not.toBeNull();
    expect(second).toEqual(first);
    expect(await fs.readdir(archiveRoot)).toEqual([first!.id]);
    expect(await archive.snapshotQuiesced()).toEqual(first);

    const later = new DatabaseSync(db);
    try {
      later.exec("INSERT INTO chat_sessions VALUES ('ses_later')");
    } finally {
      later.close();
    }
    const next = await archive.snapshotQuiesced();
    expect(next!.id).not.toBe(first!.id);
    expect(next!.sessionCount).toBe(3);
    expect(await archive.verify(first!.id)).toEqual(first);
  });

  it("waits for an active SQLite writer before capturing a cutoff", async () => {
    const { archive, archiveRoot, db } = await fixture();
    createDatabase(db);
    const writer = new DatabaseSync(db);
    try {
      writer.exec(
        "BEGIN IMMEDIATE; INSERT INTO chat_sessions VALUES ('ses_committing')"
      );
      const pending = archive.snapshotQuiesced();
      await setTimeout(125);
      await expect(fs.lstat(archiveRoot)).rejects.toMatchObject({
        code: "ENOENT",
      });
      writer.exec("COMMIT");
      const receipt = await pending;
      expect(receipt?.sessionCount).toBe(3);
    } finally {
      writer.close();
    }
  });

  it("does not publish an unsafe scratch alias or follow it into another owner", async () => {
    const { archive, archiveRoot, db, scratch, userDataPath } = await fixture();
    createDatabase(db);
    await fs.mkdir(scratch, { recursive: true, mode: 0o700 });
    const credential = path.join(userDataPath, "auth.json");
    await fs.writeFile(credential, "untouched");
    await fs.symlink(credential, path.join(scratch, "upload.png"));

    await expect(archive.snapshotQuiesced()).rejects.toMatchObject({
      code: "unsafe_source",
    });
    expect(await fs.readdir(archiveRoot)).toEqual([]);
    expect(await fs.readFile(credential, "utf8")).toBe("untouched");
    expect(await fs.readlink(path.join(scratch, "upload.png"))).toBe(
      credential
    );
  });

  it("rechecks receipt bytes and retains a corrupted published archive for investigation", async () => {
    const { archive, db, scratch } = await fixture();
    createDatabase(db);
    await fs.mkdir(scratch, { recursive: true, mode: 0o700 });
    await fs.writeFile(path.join(scratch, "upload.png"), "four");
    const receipt = (await archive.snapshotQuiesced())!;
    const archived = path.join(
      receipt.directory,
      "scratch",
      "ses_fixture",
      "upload.png"
    );
    await fs.writeFile(archived, "xxxx");

    await expect(archive.verify(receipt.id)).rejects.toMatchObject({
      code: "invalid_receipt",
    });
    await expect(archive.snapshotQuiesced()).rejects.toMatchObject({
      code: "invalid_receipt",
    });
    expect(await fs.readFile(archived, "utf8")).toBe("xxxx");
    expect(await fs.readFile(path.join(scratch, "upload.png"), "utf8")).toBe(
      "four"
    );
  });

  it("does not treat a stranded WAL as an empty legacy store", async () => {
    const { archive, db } = await fixture();
    await fs.writeFile(`${db}-wal`, "stranded");
    await expect(archive.snapshotQuiesced()).rejects.toMatchObject({
      code: "unsafe_source",
    });
  });

  it("does not confuse a missing archived source with a fresh profile", async () => {
    const { archive, db } = await fixture();
    createDatabase(db);
    const receipt = (await archive.snapshotQuiesced())!;
    await fs.unlink(db);
    await expect(archive.snapshotQuiesced()).rejects.toMatchObject({
      code: "source_missing",
    });
    expect(await archive.verify(receipt.id)).toEqual(receipt);
  });

  it("does not publish unfamiliar schemas or leave pending data", async () => {
    const { archive, archiveRoot, db } = await fixture();
    createDatabase(db, 4);
    await expect(archive.snapshotQuiesced()).rejects.toMatchObject({
      code: "unsupported_schema",
    });
    expect(await fs.readdir(archiveRoot)).toEqual([]);
  });

  it("refuses an archive root accessible to other local users", async () => {
    const { archive, archiveRoot, db } = await fixture();
    createDatabase(db);
    await fs.mkdir(archiveRoot, { mode: 0o755 });
    await expect(archive.snapshotQuiesced()).rejects.toMatchObject({
      code: "unsafe_archive",
    });
    expect(await fs.readdir(archiveRoot)).toEqual([]);
  });
});
