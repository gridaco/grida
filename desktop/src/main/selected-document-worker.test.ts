// GRIDA-SEC-004 / GRIDA-SEC-014 — selected document I/O under the built worker's Seatbelt profile.
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import {
  type DocumentFileGrant,
  WorkspaceFileWorkers,
} from "./workspace-file-worker";

const resources = process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES;
const supported =
  Boolean(resources) &&
  process.platform === "darwin" &&
  process.arch === "arm64";

it.runIf(supported)(
  "reads and saves one exact document directly in HOME",
  async () => {
    const fixture = await selectedDocument();
    const { workers, grant, selected, signal, home, protectedFile } = fixture;
    try {
      const before = await workers.openDocument(grant, signal);
      const bytes = await new Response(before.stream(0, before.size)).text();
      expect(bytes).toBe("<svg/>");
      expect(before.mtime).toBe((await fs.stat(selected)).mtimeMs);

      const write = Buffer.from('<svg id="edited"/>');
      const saved = await workers.saveDocument(
        grant,
        write,
        before.mtime,
        signal,
        () => {}
      );
      const updated = { ...grant, identity: saved.identity };
      expect(saved.identity).toEqual(await identity(selected));
      expect(saved.identity).not.toEqual(grant.identity);
      expect(saved.mtime).toBe((await fs.stat(selected)).mtimeMs);
      expect((await fs.stat(selected)).mode & 0o777).toBe(0o600);
      expect(await fs.readFile(selected)).toEqual(write);
      expect(await fs.readFile(protectedFile, "utf8")).toBe("private sibling");
      await expect(workers.openDocument(grant, signal)).rejects.toThrow(
        "document_file_changed"
      );

      // APFS can move birth time back when mtime is set before creation.
      // Advance mtime to exercise the conflict without changing identity.
      const newer = (saved.mtime + 10_000) / 1_000;
      await fs.utimes(selected, newer, newer);
      await expect(
        workers.saveDocument(
          updated,
          Buffer.from("stale"),
          saved.mtime,
          signal,
          () => {}
        )
      ).rejects.toThrow("modified-since");
      expect(await fs.readFile(selected)).toEqual(write);
      expect(
        (await fs.readdir(home)).filter((name) =>
          name.startsWith(".grida-save-")
        )
      ).toEqual([]);
    } finally {
      await fixture.close();
    }
  }
);

it.runIf(supported)(
  "refuses replacement, symlink, and hardlink without a second authority path",
  async () => {
    const fixture = await selectedDocument();
    const { workers, grant, selected, signal, home, protectedFile } = fixture;
    try {
      const before = await workers.openDocument(grant, signal);
      const former = path.join(home, "former.svg");
      await fs.rename(selected, former);
      await fs.writeFile(selected, "replacement");
      await expect(
        workers.saveDocument(
          grant,
          Buffer.from("stale"),
          before.mtime,
          signal,
          () => {}
        )
      ).rejects.toThrow("document_file_changed");
      expect(await fs.readFile(selected, "utf8")).toBe("replacement");
      await fs.rm(selected);
      await fs.symlink(protectedFile, selected);
      await expect(
        new Response(before.stream(0, before.size)).text()
      ).rejects.toThrow("workspace_media_worker_unavailable");
      await expect(workers.openDocument(grant, signal)).rejects.toThrow(
        /protected_root_overlap|path_authority_unavailable|document_file_changed/
      );
      await fs.rm(selected);
      await fs.rename(former, selected);
      await fs.link(selected, former);
      await expect(workers.openDocument(grant, signal)).rejects.toThrow(
        "document_file_changed"
      );
      expect(await fs.readFile(protectedFile, "utf8")).toBe("private sibling");
    } finally {
      await fixture.close();
    }
  }
);

it.runIf(supported)(
  "streams a selected save and reopen above the workspace file size limit",
  async () => {
    const fixture = await selectedDocument();
    const { workers, grant, signal } = fixture;
    try {
      const before = await workers.openDocument(grant, signal);
      await before.close();
      const bytes = Buffer.alloc(65 * 1024 * 1024, 32);
      bytes.write('<svg xmlns="http://www.w3.org/2000/svg">');
      bytes.write("</svg>", bytes.length - 6);
      const saved = await workers.saveDocument(
        grant,
        bytes,
        before.mtime,
        signal,
        () => {}
      );
      const opened = await workers.openDocument(
        { ...grant, identity: saved.identity },
        signal
      );
      expect(opened.size).toBe(bytes.length);
      const actual = createHash("sha256");
      for await (const chunk of opened.stream(0, opened.size))
        actual.update(chunk);
      expect(actual.digest("hex")).toBe(
        createHash("sha256").update(bytes).digest("hex")
      );
    } finally {
      await fixture.close();
    }
  },
  25_000
);

async function selectedDocument() {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "grida-selected-doc-"))
  );
  const home = path.join(root, "home");
  const protectedRoot = path.join(home, "private");
  const protectedFile = path.join(protectedRoot, "account.txt");
  const selected = path.join(home, "drawing.svg");
  const workers = new WorkspaceFileWorkers(resources!);
  try {
    await fs.mkdir(protectedRoot, { recursive: true, mode: 0o700 });
    await fs.writeFile(selected, "<svg/>");
    await fs.writeFile(protectedFile, "private sibling");
    const grant: DocumentFileGrant = {
      path: selected,
      parentIdentity: await identity(home),
      identity: await identity(selected),
      protected: [protectedRoot],
    };
    return {
      workers,
      grant,
      selected,
      home,
      protectedFile,
      signal: AbortSignal.timeout(20_000),
      async close() {
        workers.close();
        await fs.rm(root, { recursive: true, force: true });
      },
    };
  } catch (error) {
    workers.close();
    await fs.rm(root, { recursive: true, force: true });
    throw error;
  }
}

async function identity(filename: string) {
  const stat = await fs.lstat(filename, { bigint: true });
  return {
    device: String(stat.dev),
    inode: String(stat.ino),
    birthTimeNs: String(stat.birthtimeNs),
  };
}
