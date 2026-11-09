import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LegacyChatSourceLease,
  type LegacyChatRetirement,
} from "./legacy-chat-source-lease";

const supported = process.platform === "darwin" || process.platform === "linux";
const archiveId = "a".repeat(64);
const directories: string[] = [];
const children: ChildProcessWithoutNullStreams[] = [];

afterEach(async () => {
  for (const child of children.splice(0)) {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null)
      continue;
    const exit = once(child, "exit");
    child.stdin.end();
    await exit;
  }
  await Promise.all(
    directories
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true }))
  );
});

async function fixture() {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "grida-legacy-source-"))
  );
  directories.push(root);
  const source = {
    userDataPath: path.join(root, "legacy"),
    scratchBase: path.join(root, "scratch"),
  };
  await fs.mkdir(source.userDataPath, { mode: 0o700 });
  return { root, source, lease: new LegacyChatSourceLease(source) };
}

const authorized = () => Promise.resolve(true);
const request = (requestId = "retire-source") => ({
  requestId,
  verifyWriterAdmission: vi.fn<typeof authorized>(authorized),
  verifyArchive: vi.fn<
    (retained: LegacyChatRetirement | null) => Promise<string | null>
  >(() => Promise.resolve(archiveId)),
});

async function childAt(source: { userDataPath: string; scratchBase: string }) {
  const code = `
    import { once } from "node:events";
    import { LegacyChatSourceLease } from ${JSON.stringify(
      new URL("./legacy-chat-source-lease.ts", import.meta.url).href
    )};
    const lease = new LegacyChatSourceLease(JSON.parse(process.argv[1]));
    const writer = await lease.claimWriter();
    process.stdout.write(writer.claimId + "\\n");
    process.stdin.resume();
    await once(process.stdin, "end");
    process.exit(27);
  `;
  const child = spawn(
    process.execPath,
    ["--input-type=module", "--eval", code, JSON.stringify(source)],
    { timeout: 8_000 }
  );
  children.push(child);
  const exit = once(child, "exit");
  // A closed or failing child produces EOF instead of a claimed lease.
  const output = createInterface({ input: child.stdout });
  try {
    const line = await output[Symbol.asyncIterator]().next();
    if (line.done) throw new Error("legacy lease fixture exited before claim");
    return { child, exit, claimId: line.value };
  } finally {
    output.close();
  }
}

describe.skipIf(!supported)("cooperative legacy chat source lease", () => {
  it("allows only the exact verified drain to release a generation", async () => {
    const { source, lease } = await fixture();
    const writer = await lease.claimWriter();
    const other = new LegacyChatSourceLease(source);
    await expect(other.claimWriter()).rejects.toThrow(
      "legacy_chat_source_dirty"
    );
    const uncertain = vi.fn<(claimId: string) => Promise<boolean>>(
      async () => false
    );
    await expect(writer.completeDrain(uncertain)).rejects.toThrow(
      "legacy_chat_source_drain_unverified"
    );
    expect(uncertain).toHaveBeenCalledExactlyOnceWith(writer.claimId);
    const proposed = request();
    await expect(other.retire(proposed)).rejects.toThrow(
      "legacy_chat_source_dirty"
    );
    expect(proposed.verifyWriterAdmission).not.toHaveBeenCalled();
    expect(proposed.verifyArchive).not.toHaveBeenCalled();
    await writer.completeDrain(async (id) => id === writer.claimId);

    const current = await other.claimWriter();
    expect(current.claimId).not.toBe(writer.claimId);
    const stale = vi.fn<typeof authorized>(authorized);
    await writer.completeDrain(stale);
    expect(stale).not.toHaveBeenCalled();
    await expect(other.claimWriter()).rejects.toThrow(
      "legacy_chat_source_dirty"
    );
    await current.completeDrain(async (id) => id === current.claimId);
  });

  it("keeps the active generation dirty after an independent process exits", async () => {
    const { source, lease } = await fixture();
    const external = await childAt(source);
    expect(external.claimId).toMatch(/^[a-f0-9-]{36}$/);
    await expect(lease.claimWriter()).rejects.toThrow(
      "legacy_chat_source_dirty"
    );
    external.child.stdin.end();
    await expect(external.exit).resolves.toEqual([27, null]);
    const reopened = new LegacyChatSourceLease(source);
    await expect(reopened.claimWriter()).rejects.toThrow(
      "legacy_chat_source_dirty"
    );
    await expect(reopened.retire(request())).rejects.toThrow(
      "legacy_chat_source_dirty"
    );
  });

  it("publishes retirement only with verified admission and archive evidence", async () => {
    const { source, lease } = await fixture();
    const denied = request();
    denied.verifyWriterAdmission.mockResolvedValue(false);
    await expect(lease.retire(denied)).rejects.toThrow(
      "legacy_chat_source_writer_admission_unverified"
    );
    expect(denied.verifyArchive).not.toHaveBeenCalled();

    const failedArchive = request();
    failedArchive.verifyArchive.mockRejectedValue(
      new Error("archive unavailable")
    );
    await expect(lease.retire(failedArchive)).rejects.toThrow(
      "archive unavailable"
    );
    const writer = await lease.claimWriter();
    await writer.completeDrain(authorized);

    const verified = request();
    const receipt = await lease.retire(verified);
    expect(verified.verifyArchive).toHaveBeenCalledExactlyOnceWith(null);
    expect(receipt).toMatchObject({ requestId: "retire-source", archiveId });
    expect(receipt.sourceId).toMatch(/^[a-f0-9]{64}$/);
    const reopened = new LegacyChatSourceLease(source);
    await expect(reopened.claimWriter()).rejects.toThrow(
      "legacy_chat_source_retired"
    );
    await expect(reopened.retire(request("other-cutoff"))).rejects.toThrow(
      "legacy_chat_source_retirement_changed"
    );
    const replay = request();
    await expect(reopened.retire(replay)).resolves.toEqual(receipt);
    expect(replay.verifyArchive).toHaveBeenCalledExactlyOnceWith(receipt);
    replay.verifyArchive.mockResolvedValue(null);
    await expect(reopened.retire(replay)).rejects.toThrow(
      "legacy_chat_source_archive_unverified"
    );
  });

  it("keeps source exclusion through archive verification", async () => {
    const { source, lease } = await fixture();
    const ready = Promise.withResolvers<void>();
    const release = Promise.withResolvers<string | null>();
    const retiring = lease.retire({
      ...request(),
      verifyArchive() {
        ready.resolve();
        return release.promise;
      },
    });
    await ready.promise;
    try {
      await expect(
        new LegacyChatSourceLease(source).claimWriter()
      ).rejects.toThrow("legacy_chat_source_busy");
      const script = `
        import { LegacyChatSourceLease } from ${JSON.stringify(
          new URL("./legacy-chat-source-lease.ts", import.meta.url).href
        )};
        try {
          await new LegacyChatSourceLease(JSON.parse(process.argv[1])).claimWriter();
          process.exit(1);
        } catch (error) {
          process.stdout.write(error.message);
        }
      `;
      const child = spawn(
        process.execPath,
        ["--input-type=module", "--eval", script, JSON.stringify(source)],
        { timeout: 8_000 }
      );
      children.push(child);
      const exit = once(child, "exit");
      let output = "";
      for await (const chunk of child.stdout) output += String(chunk);
      await expect(exit).resolves.toEqual([0, null]);
      expect(output).toBe("legacy_chat_source_busy");
    } finally {
      release.resolve(null);
      await expect(retiring).resolves.toMatchObject({ archiveId: null });
    }
  });

  it("binds one canonical source to one scratch identity", async () => {
    const { root, source, lease } = await fixture();
    const writer = await lease.claimWriter();
    await writer.completeDrain(authorized);
    const alias = path.join(root, "alias");
    await fs.symlink(source.userDataPath, alias);
    await expect(
      new LegacyChatSourceLease({
        ...source,
        userDataPath: alias,
      }).claimWriter()
    ).rejects.toThrow("legacy_chat_source_unsafe_source");
    await expect(
      new LegacyChatSourceLease({
        ...source,
        scratchBase: path.join(root, "different"),
      }).claimWriter()
    ).rejects.toThrow("legacy_chat_source_scratch_changed");
  });

  it("refuses stale drain after the source directory is replaced", async () => {
    const { root, source, lease } = await fixture();
    const writer = await lease.claimWriter();
    await fs.rename(source.userDataPath, path.join(root, "previous"));
    await fs.mkdir(source.userDataPath, { mode: 0o700 });
    const replacement = await lease.claimWriter();
    const stale = vi.fn<typeof authorized>(authorized);
    await expect(writer.completeDrain(stale)).rejects.toThrow(
      "legacy_chat_source_claim_changed"
    );
    expect(stale).not.toHaveBeenCalled();
    await expect(lease.claimWriter()).rejects.toThrow(
      "legacy_chat_source_dirty"
    );
    await replacement.completeDrain(authorized);
  });

  it("refuses linked or non-private lease storage", async () => {
    const { root, source, lease } = await fixture();
    const control = path.join(source.userDataPath, "legacy-chat-ownership");
    const foreign = path.join(root, "foreign");
    await fs.mkdir(foreign, { mode: 0o700 });
    await fs.symlink(foreign, control);
    await expect(lease.claimWriter()).rejects.toThrow(
      "legacy_chat_source_unsafe_state"
    );
    expect(await fs.readdir(foreign)).toEqual([]);
    await fs.unlink(control);
    const writer = await lease.claimWriter();
    await writer.completeDrain(authorized);
    await fs.chmod(path.join(control, "control.sqlite"), 0o644);
    await expect(lease.claimWriter()).rejects.toThrow(
      "legacy_chat_source_unsafe_state"
    );
  });
});
