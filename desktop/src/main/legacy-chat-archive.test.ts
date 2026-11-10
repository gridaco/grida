// GRIDA-SEC-004 — legacy archive fixtures use disposable private roots only.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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

  it.skipIf(process.platform !== "darwin" || !process.geteuid?.())(
    "reuses a read-only source with an inert journal and refuses other SQLite state",
    async () => {
      const { archive, db } = await fixture();
      createDatabase(db);
      const legacy = new DatabaseSync(db);
      try {
        legacy.exec("PRAGMA journal_mode=WAL");
      } finally {
        legacy.close();
      }
      await expect(fs.lstat(`${db}-shm`)).rejects.toMatchObject({
        code: "ENOENT",
      });
      const identity = await fs.lstat(db);
      const options = { requestId: "frozen", requireReadOnlySource: true };
      const receipt = await archive.sealQuiesced(options);
      const frozen = await fs.lstat(db);
      expect(frozen.ino).toBe(identity.ino);
      expect(frozen.mode & 0o7777).toBe(0o400);
      const before = await fs.readFile(db);
      await expect(
        archive.sealQuiesced({ ...options, expectedArchiveId: receipt.id })
      ).resolves.toEqual(receipt);
      expect(await fs.readFile(db)).toEqual(before);
      const journal = `${db}-journal`;
      const inactive = Buffer.concat([Buffer.alloc(28), Buffer.alloc(640, 1)]);
      await fs.writeFile(journal, inactive, { mode: 0o600 });
      await expect(archive.sealQuiesced(options)).resolves.toEqual(receipt);
      await expect(fs.readFile(journal)).resolves.toEqual(inactive);
      const incomplete = Buffer.alloc(768, 1);
      await fs.writeFile(journal, incomplete);
      await expect(archive.sealQuiesced(options)).rejects.toThrow(
        "Legacy chat archive: source_fence_incomplete"
      );
      await expect(fs.readFile(journal)).resolves.toEqual(incomplete);
      await fs.truncate(journal, 0);
      await expect(archive.sealQuiesced(options)).resolves.toEqual(receipt);
      await fs.writeFile(`${db}-shm`, "ambiguous", { mode: 0o600 });
      await expect(archive.sealQuiesced(options)).rejects.toThrow(
        "Legacy chat archive: source_fence_incomplete"
      );
      expect(await fs.readFile(db)).toEqual(before);
      await expect(archive.verify(receipt.id)).resolves.toEqual(receipt);
    }
  );

  it.skipIf(process.platform !== "darwin" || !process.geteuid?.())(
    "refuses a rollback journal that changes during verification",
    async () => {
      const { archive, db } = await fixture();
      createDatabase(db);
      const options = { requestId: "journal", requireReadOnlySource: true };
      const receipt = await archive.sealQuiesced(options);
      const canonical = await fs.realpath(db);
      const journal = `${canonical}-journal`;
      await fs.writeFile(journal, Buffer.alloc(0), { mode: 0o600 });
      const open = fs.open;
      const replace = vi
        .spyOn(fs, "open")
        .mockImplementation(async (...args) => {
          if (args[0] === journal) {
            await fs.rename(journal, `${journal}.displaced`);
            await fs.writeFile(journal, Buffer.alloc(0), { mode: 0o600 });
          }
          return open(...args);
        });
      try {
        await expect(archive.sealQuiesced(options)).rejects.toThrow(
          "Legacy chat archive: source_changed"
        );
      } finally {
        replace.mockRestore();
      }
      await fs.unlink(journal);
      await fs.symlink(db, journal);
      await expect(archive.sealQuiesced(options)).rejects.toThrow(
        "Legacy chat archive: unsafe_source"
      );
      await expect(archive.verify(receipt.id)).resolves.toEqual(receipt);
    }
  );

  it.skipIf(process.platform !== "darwin" || !process.geteuid?.())(
    "refuses an extended ACL before retiring the source",
    async () => {
      const { archive, db, archiveRoot } = await fixture();
      createDatabase(db);
      const acl = spawnSync("/bin/chmod", ["+a", "everyone allow write", db]);
      expect(acl.status).toBe(0);
      const before = await fs.readFile(db);
      await expect(
        archive.sealQuiesced({ requestId: "acl", requireReadOnlySource: true })
      ).rejects.toThrow("Legacy chat archive: unsafe_source");
      expect(await fs.readFile(db)).toEqual(before);
      await expect(fs.lstat(archiveRoot)).rejects.toMatchObject({
        code: "ENOENT",
      });
    }
  );

  it.skipIf(process.platform !== "darwin" || !process.geteuid?.())(
    "recaptures newer history after a writable seal and reuses unchanged recovery on retry",
    async () => {
      const { archive, db, archiveRoot, scratch } = await fixture();
      createDatabase(db);
      await fs.mkdir(scratch, { recursive: true, mode: 0o700 });
      await fs.writeFile(path.join(scratch, "upload.png"), "past", {
        mode: 0o600,
      });
      const canonical = await fs.realpath(db);
      const open = fs.open;
      const options = { requestId: "incomplete", requireReadOnlySource: true };
      const interrupt = async () => {
        const changeMode = vi
          .spyOn(fs, "open")
          .mockImplementation(async (...args) => {
            const handle = await open(...args);
            if (args[0] === canonical)
              vi.spyOn(handle, "chmod").mockRejectedValueOnce(
                new Error("injected mode failure")
              );
            return handle;
          });
        try {
          await expect(archive.sealQuiesced(options)).rejects.toThrow(
            "Legacy chat archive: source_fence_incomplete"
          );
        } finally {
          changeMode.mockRestore();
        }
      };
      await interrupt();
      const [archiveId] = await fs.readdir(archiveRoot);
      const source = new DatabaseSync(db);
      try {
        expect(source.prepare("PRAGMA user_version").get()?.user_version).toBe(
          2_147_483_647
        );
        source.exec(`INSERT INTO chat_sessions VALUES ('ses_unarchived');
          INSERT INTO chat_messages VALUES ('msg_unarchived', 'ses_unarchived', 'assistant');
          CREATE TABLE additional_history(payload BLOB);
          INSERT INTO additional_history VALUES (x'001200ff');`);
      } finally {
        source.close();
      }
      await fs.writeFile(path.join(scratch, "upload.png"), "next");
      const before = await fs.readFile(db);
      const mode = (await fs.lstat(db)).mode;
      await expect(
        archive.sealQuiesced({ ...options, expectedArchiveId: archiveId })
      ).rejects.toThrow("Legacy chat archive: source_fence_incomplete");
      expect(await fs.readFile(db)).toEqual(before);
      expect((await fs.lstat(db)).mode).toBe(mode);
      expect(await fs.readdir(archiveRoot)).toEqual([archiveId]);
      expect((await archive.verify(archiveId)).sessionCount).toBe(2);

      await interrupt();
      const recovered = await archive.sealQuiesced(options);
      expect(recovered.id).not.toBe(archiveId);
      expect(recovered.sessionCount).toBe(3);
      expect(recovered.sqliteVersion).toBe(3);
      expect((await fs.readdir(archiveRoot)).sort()).toEqual(
        [archiveId, recovered.id].sort()
      );
      await expect(
        archive.sealQuiesced({ ...options, expectedArchiveId: recovered.id })
      ).resolves.toEqual(recovered);
      await expect(
        fs.readFile(
          path.join(archiveRoot, archiveId, "scratch/ses_fixture/upload.png"),
          "utf8"
        )
      ).resolves.toBe("past");
      await expect(
        fs.readFile(
          path.join(recovered.directory, "scratch/ses_fixture/upload.png"),
          "utf8"
        )
      ).resolves.toBe("next");
      const copied = new DatabaseSync(
        path.join(recovered.directory, "sessions.db"),
        { readOnly: true }
      );
      try {
        expect(
          copied
            .prepare("SELECT role FROM chat_messages WHERE id='msg_unarchived'")
            .get()?.role
        ).toBe("assistant");
        expect(
          copied
            .prepare("SELECT hex(payload) AS bytes FROM additional_history")
            .get()?.bytes
        ).toBe("001200FF");
        expect(
          copied
            .prepare(
              "SELECT name FROM sqlite_schema WHERE name='grida_legacy_chat_retirement'"
            )
            .get()
        ).toBeUndefined();
      } finally {
        copied.close();
      }
    }
  );

  it.skipIf(process.platform !== "darwin" || !process.geteuid?.())(
    "refuses to strip a retirement table with an unknown dependency",
    async () => {
      const { archive, db, archiveRoot } = await fixture();
      createDatabase(db);
      const prior = await archive.sealQuiesced({ requestId: "dependency" });
      const source = new DatabaseSync(db);
      try {
        source.exec(
          "CREATE VIEW additional_view AS SELECT request_id FROM grida_legacy_chat_retirement"
        );
      } finally {
        source.close();
      }
      const bytes = await fs.readFile(db);
      await expect(
        archive.sealQuiesced({
          requestId: "dependency",
          requireReadOnlySource: true,
        })
      ).rejects.toThrow("Legacy chat archive: invalid_source_seal");
      expect(await fs.readFile(db)).toEqual(bytes);
      expect(await fs.readdir(archiveRoot)).toEqual([prior.id]);
    }
  );

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

  it("reads stored attachment parts and still verifies earlier immutable receipts", async () => {
    const { archive, db, scratch } = await fixture();
    createDatabase(db);
    const filesType = "data-user_file_attachments";
    const templateType = "data-user_template_selection";
    const saved = {
      location: "scratch",
      files: [{ path: "upload.png", size: 4 }],
    };
    const legacy = new DatabaseSync(db);
    try {
      const insert = legacy.prepare(
        "INSERT INTO chat_parts VALUES (?, 'ses_fixture', ?, ?)"
      );
      insert.run(
        "wrapped_files",
        filesType,
        JSON.stringify({ type: filesType, data: saved })
      );
      insert.run(
        "wrapped_template",
        templateType,
        JSON.stringify({
          type: templateType,
          data: { bundle_location: "scratch" },
        })
      );
      insert.run(
        "wrapped_wrong_type",
        filesType,
        JSON.stringify({ ...saved, type: templateType, data: saved })
      );
      insert.run(
        "wrapped_wrong_size",
        filesType,
        JSON.stringify({
          type: filesType,
          data: {
            location: "scratch",
            files: [{ path: "upload.png", size: 3 }],
          },
        })
      );
      insert.run(
        "wrapped_wrong_path",
        filesType,
        JSON.stringify({
          type: filesType,
          data: {
            location: "scratch",
            files: [{ path: "../upload.png", size: 4 }],
          },
        })
      );
    } finally {
      legacy.close();
    }
    await fs.mkdir(scratch, { recursive: true, mode: 0o700 });
    await fs.writeFile(path.join(scratch, "upload.png"), "abcd");
    const current = (await archive.snapshotQuiesced())!;
    expect(current.inputCaveats).toEqual([
      { partId: "p_files", path: "swept.pdf", reason: "missing" },
      { partId: "p_template", reason: "template_scratch_missing" },
      { partId: "p_template_present", reason: "template_members_unknown" },
      { partId: "wrapped_template", reason: "template_members_unknown" },
      { partId: "wrapped_wrong_path", reason: "invalid_descriptor" },
      {
        partId: "wrapped_wrong_size",
        path: "upload.png",
        reason: "size_changed",
      },
      { partId: "wrapped_wrong_type", reason: "invalid_descriptor" },
    ]);
    expect(await archive.verify(current.id)).toEqual(current);

    // Reconstruct the manifest a previous reader published over the exact same
    // SQLite and scratch files, including its former caveat interpretation.
    const inputCaveats = [
      ...current.inputCaveats.slice(0, 3),
      ...[
        "wrapped_files",
        "wrapped_template",
        "wrapped_wrong_path",
        "wrapped_wrong_size",
      ].map((partId) => ({ partId, reason: "invalid_descriptor" })),
    ];
    const manifest = JSON.parse(
      await fs.readFile(path.join(current.directory, "manifest.json"), "utf8")
    );
    const bytes = `${JSON.stringify({ ...manifest, inputCaveats })}\n`;
    const id = createHash("sha256").update(bytes).digest("hex");
    const directory = path.join(path.dirname(current.directory), id);
    await fs.rename(current.directory, directory);
    const manifestPath = path.join(directory, "manifest.json");
    await fs.writeFile(manifestPath, bytes);
    expect(await archive.verify(id)).toEqual({
      ...current,
      directory,
      id,
      inputCaveats,
    });
    expect(await fs.readFile(manifestPath, "utf8")).toBe(bytes);
    await fs.writeFile(
      path.join(directory, "scratch", "ses_fixture", "upload.png"),
      "dcba"
    );
    await expect(archive.verify(id)).rejects.toThrow(
      "Legacy chat archive: invalid_receipt"
    );
  });

  it("verifies an old receipt when corrected caveats exceed the capture budget", async () => {
    const { archive, archiveRoot, db } = await fixture();
    createDatabase(db);
    const type = "data-user_file_attachments";
    const data = JSON.stringify({
      type,
      data: {
        location: "scratch",
        files: Array.from({ length: 64 }, (_, index) => ({
          path: `missing-${index}.png`,
          size: 4,
        })),
      },
    });
    const inputCaveats = Array.from({ length: 1_563 }, (_, index) => ({
      partId: `part-${String(index).padStart(4, "0")}`,
      reason: "invalid_descriptor",
    }));
    const legacy = new DatabaseSync(db);
    try {
      legacy.exec("BEGIN; DELETE FROM chat_parts");
      const insert = legacy.prepare(
        "INSERT INTO chat_parts VALUES (?, 'ses_fixture', ?, ?)"
      );
      for (const caveat of inputCaveats) insert.run(caveat.partId, type, data);
      legacy.exec("COMMIT");
    } finally {
      legacy.close();
    }
    await expect(archive.snapshotQuiesced()).rejects.toThrow(
      "Legacy chat archive: archive_limit"
    );
    const database = await fs.readFile(db);
    const manifest = `${JSON.stringify({
      version: 1,
      sqliteVersion: 3,
      sessionCount: 2,
      files: [
        {
          path: "sessions.db",
          size: database.length,
          sha256: createHash("sha256").update(database).digest("hex"),
        },
      ],
      inputCaveats,
    })}\n`;
    const id = createHash("sha256").update(manifest).digest("hex");
    const directory = path.join(archiveRoot, id);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    await fs.writeFile(path.join(directory, "sessions.db"), database, {
      mode: 0o600,
    });
    await fs.writeFile(path.join(directory, "manifest.json"), manifest, {
      mode: 0o600,
    });
    expect(await archive.verify(id)).toMatchObject({ id, inputCaveats });
  });

  it("preserves a historical SRT candidate separately and reports conflicting bytes", async () => {
    const { db, root, scratch, scratchBase, userDataPath } = await fixture();
    createDatabase(db);
    await fs.mkdir(scratch, { recursive: true, mode: 0o700 });
    await fs.writeFile(path.join(scratch, "upload.png"), "aaaa");
    const historicalSrtTempRoot = path.join(await fs.realpath(root), "claude");
    const tag = createHash("sha256")
      .update(path.resolve(userDataPath))
      .digest("hex")
      .slice(0, 16);
    const historicalBase = path.join(
      historicalSrtTempRoot,
      `grida-agent-${tag}`
    );
    const historical = path.join(
      historicalBase,
      "sessions",
      "ses_fixture",
      "scratch"
    );
    await fs.mkdir(historical, { recursive: true, mode: 0o700 });
    await fs.writeFile(path.join(historical, "upload.png"), "bbbb");
    await fs.writeFile(path.join(historical, "swept.pdf"), "x".repeat(42));
    const unrelated = path.join(
      historicalBase,
      "sessions",
      "ses_unrelated",
      "scratch"
    );
    await fs.mkdir(unrelated, { recursive: true, mode: 0o700 });
    await fs.writeFile(
      path.join(unrelated, "unrelated.txt"),
      "outside history"
    );
    const source = { userDataPath, scratchBase };
    const archive = new LegacyChatArchive({
      ...source,
      historicalScratch: await LegacyChatArchive.observeHistoricalScratch(
        source,
        historicalSrtTempRoot
      ),
    });
    const before = await archive.snapshotQuiesced();
    expect(before?.inputCaveats).toContainEqual({
      partId: "p_files",
      path: "upload.png",
      reason: "scratch_candidates_differ",
    });
    expect(before?.inputCaveats).toContainEqual({
      partId: "p_files",
      path: "swept.pdf",
      reason: "historical_scratch_candidate",
    });
    const { id, directory } = before!;
    expect(
      await fs.readFile(
        path.join(directory, "scratch/ses_fixture/upload.png"),
        "utf8"
      )
    ).toBe("aaaa");
    expect(
      await fs.readFile(
        path.join(directory, "scratch-srt/ses_fixture/upload.png"),
        "utf8"
      )
    ).toBe("bbbb");
    expect(await fs.readdir(path.join(directory, "scratch-srt"))).toEqual([
      "ses_fixture",
    ]);
    const seal = {
      requestId: "retain-candidate",
      requireReadOnlySource: process.platform === "darwin",
    };
    expect(await archive.sealQuiesced(seal)).toEqual(before);
    const reopened = new LegacyChatArchive({ userDataPath, scratchBase });
    expect(await reopened.verify(id)).toEqual(before);
    expect(
      await reopened.sealQuiesced({
        ...seal,
        expectedArchiveId: id,
      })
    ).toEqual(before);
    await fs.writeFile(
      path.join(directory, "scratch-srt/ses_fixture/upload.png"),
      "cccc"
    );
    await expect(reopened.verify(id)).rejects.toThrow(
      "Legacy chat archive: invalid_receipt"
    );
  });

  it("keeps existing receipts stable when the attested candidate is absent", async () => {
    const { archive, db, root, scratchBase, userDataPath } = await fixture();
    createDatabase(db);
    const historicalSrtTempRoot = path.join(await fs.realpath(root), "empty");
    await fs.mkdir(historicalSrtTempRoot, { mode: 0o700 });
    const source = { userDataPath, scratchBase };
    const historicalScratch = await LegacyChatArchive.observeHistoricalScratch(
      source,
      historicalSrtTempRoot
    );
    const original = await archive.snapshotQuiesced();
    expect(
      await new LegacyChatArchive({
        ...source,
        historicalScratch,
      }).snapshotQuiesced()
    ).toEqual(original);
    const tag = createHash("sha256")
      .update(userDataPath)
      .digest("hex")
      .slice(0, 16);
    await fs.mkdir(path.join(historicalSrtTempRoot, `grida-agent-${tag}`));
    await expect(
      new LegacyChatArchive({ ...source, historicalScratch }).snapshotQuiesced()
    ).rejects.toThrow("Legacy chat archive: historical_scratch_changed");
    expect(await archive.verify(original!.id)).toEqual(original);
  });

  it("refuses an overlapping historical scratch root or a symlink candidate", async () => {
    const { archiveRoot, db, root, scratchBase, userDataPath } =
      await fixture();
    createDatabase(db);
    const historicalSrtTempRoot = path.join(await fs.realpath(root), "claude");
    const tag = createHash("sha256")
      .update(path.resolve(userDataPath))
      .digest("hex")
      .slice(0, 16);
    const historical = path.join(historicalSrtTempRoot, `grida-agent-${tag}`);
    await fs.mkdir(historical, { recursive: true, mode: 0o700 });
    const historicalScratch = await LegacyChatArchive.observeHistoricalScratch(
      { userDataPath, scratchBase },
      historicalSrtTempRoot
    );
    await expect(
      new LegacyChatArchive({
        userDataPath,
        scratchBase: historical,
        historicalScratch,
      }).snapshotQuiesced()
    ).rejects.toThrow("Legacy chat archive: unsafe_source");
    await fs.rename(historical, scratchBase);
    await fs.symlink(scratchBase, historical, "dir");
    await expect(
      new LegacyChatArchive({
        userDataPath,
        scratchBase,
        historicalScratch,
      }).snapshotQuiesced()
    ).rejects.toThrow("Legacy chat archive: unsafe_source");
    await expect(fs.lstat(archiveRoot)).rejects.toMatchObject({
      code: "ENOENT",
    });
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

  it("rejects an archived input changed in place after hashing while verification continues", async () => {
    const { archive, db, scratch } = await fixture();
    createDatabase(db);
    await fs.mkdir(scratch, { recursive: true, mode: 0o700 });
    const names = ["upload.png", "second.txt"];
    for (const name of names)
      await fs.writeFile(path.join(scratch, name), "four");
    const receipt = (await archive.snapshotQuiesced())!;
    const inputs = names.map((name) =>
      path.join(receipt.directory, "scratch", "ses_fixture", name)
    );
    const open = fs.open.bind(fs);
    let first: string | undefined;
    let changed: string | undefined;
    const change = vi.spyOn(fs, "open").mockImplementation(async (...args) => {
      const filename = args[0];
      if (typeof filename === "string" && inputs.includes(filename)) {
        if (!first) first = filename;
        else if (filename !== first && !changed) {
          changed = first;
          await fs.writeFile(changed, "five");
          await fs.utimes(changed, 0, 0);
        }
      }
      return open(...args);
    });
    try {
      await expect(archive.verify(receipt.id)).rejects.toMatchObject({
        code: "source_changed",
      });
      expect(changed).toBeDefined();
      expect(await fs.readFile(changed!, "utf8")).toBe("five");
    } finally {
      change.mockRestore();
    }
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
