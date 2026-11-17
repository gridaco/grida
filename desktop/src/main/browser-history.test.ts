// GRIDA-SEC-016 — bounded durable metadata, exact removal and clear/write barriers.
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, expect, it, vi } from "vitest";
import { BrowserHistory } from "./browser-history";
import { DesktopBrowser } from "@grida/desktop-bridge";

const directories: string[] = [];
async function fixture() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "grida-browser-history-test-")
  );
  directories.push(directory);
  return {
    directory,
    history: await BrowserHistory.open(directory),
    file: path.join(directory, "browser-history.json"),
  };
}
const recent = { query: "", limit: 100 };
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true }))
  );
});

it("persists globally unique canonical visits, updates titles, and queries bounded recency deterministically", async () => {
  const f = await fixture();
  const changes: number[] = [];
  f.history.subscribe((change) => changes.push(change.revision));
  const old = f.history.visit("https://b.example/", "First", 10)!;
  f.history.visit("https://a.example/", "Alpha", 20);
  const current = f.history.visit("https://b.example/", "Second", 20)!;
  f.history.updateTitle("https://b.example/", "stale title", old);
  f.history.updateTitle("https://b.example/", "Better title", current);
  const snapshot = await f.history.query(recent);
  expect(DesktopBrowser.History.parseSnapshot(snapshot)).not.toBeNull();
  expect(snapshot.entries).toEqual([
    { url: "https://a.example/", title: "Alpha", lastVisitedAt: 20 },
    { url: "https://b.example/", title: "Better title", lastVisitedAt: 20 },
  ]);
  expect(
    (await f.history.query({ query: " BETTER ", limit: 1 })).entries
  ).toHaveLength(1);
  expect(
    (await (await BrowserHistory.open(f.directory)).query(recent)).entries
  ).toEqual(snapshot.entries);
  expect(changes).toEqual([1]);
  const permissions = (await fs.stat(f.file)).mode & 0o077;
  expect(process.platform === "win32" ? 0 : permissions).toBe(0);
});

it("rejects unsafe metadata and malformed query/removal payloads", async () => {
  const f = await fixture();
  for (const url of [
    "file:///private",
    "javascript:alert(1)",
    "https://user:pass@example.com/",
    "https://example.com",
    "https://example.com/\n",
  ])
    expect(f.history.visit(url, "title")).toBeNull();
  expect(f.history.visit("https://example.com/", "bad\ntitle")).toBeNull();
  await expect(f.history.query({ query: "", limit: 101 })).rejects.toThrow(
    "browser_history_request_invalid"
  );
  await expect(
    f.history.remove({ url: "https://example.com", path: "/private" })
  ).rejects.toThrow("browser_history_request_invalid");
  expect((await f.history.query(recent)).entries).toEqual([]);
});

it("caps the persisted entry count and byte size and handles oversized input files without unbounded reads", async () => {
  const f = await fixture();
  for (let index = 0; index < 700; index++)
    f.history.visit(`https://example.com/${index}`, "title", index);
  await f.history.flush();
  let data = JSON.parse(await fs.readFile(f.file, "utf8"));
  expect(data.entries).toHaveLength(500);
  expect(data.entries[0].lastVisitedAt).toBe(699);
  const long = "a".repeat(7900);
  for (let index = 0; index < 500; index++)
    f.history.visit(
      `https://example.com/${long}${index}`,
      "t".repeat(1000),
      1000 + index
    );
  await f.history.flush();
  expect((await fs.stat(f.file)).size).toBeLessThanOrEqual(
    BrowserHistory.MAX_FILE_BYTES
  );
  data = JSON.parse(await fs.readFile(f.file, "utf8"));
  expect(data.entries.length).toBeLessThan(500);
  await fs.writeFile(f.file, Buffer.alloc(BrowserHistory.MAX_FILE_BYTES + 1));
  expect(
    (await (await BrowserHistory.open(f.directory)).query(recent)).entries
  ).toEqual([]);
});

it.each([
  "{not json",
  JSON.stringify({ schema_version: 99, entries: [] }),
  JSON.stringify({
    schema_version: 1,
    entries: [{ url: "file:///private", title: "bad", lastVisitedAt: 1 }],
  }),
])(
  "recovers from invalid persisted metadata without exposing it: %s",
  async (content) => {
    const f = await fixture();
    await fs.writeFile(f.file, content);
    const history = await BrowserHistory.open(f.directory);
    expect((await history.query(recent)).entries).toEqual([]);
    history.visit("https://example.com/", "valid", 1);
    await history.flush();
    expect(
      (await (await BrowserHistory.open(f.directory)).query(recent)).entries
    ).toHaveLength(1);
  }
);

it.skipIf(process.platform === "win32")(
  "does not follow or overwrite a symlinked history target",
  async () => {
    const f = await fixture();
    const outside = path.join(f.directory, "outside.json");
    const original = JSON.stringify({
      schema_version: 1,
      entries: [
        { url: "https://private.example/", title: "private", lastVisitedAt: 1 },
      ],
    });
    await fs.writeFile(outside, original);
    await fs.symlink(outside, f.file);
    const history = await BrowserHistory.open(f.directory);
    expect((await history.query(recent)).entries).toEqual([]);
    await expect(history.clear()).rejects.toThrow(
      "browser_history_write_failed"
    );
    expect(await fs.readFile(outside, "utf8")).toBe(original);
    expect((await fs.lstat(f.file)).isSymbolicLink()).toBe(true);
  }
);

it("never recreates an exact removed URL through a pending or later title callback", async () => {
  const f = await fixture();
  const token = f.history.visit("https://example.com/path?q=1", "first", 1)!;
  await f.history.remove({ url: "https://example.com/path?q=1" });
  f.history.updateTitle("https://example.com/path?q=1", "late title", token);
  await f.history.flush();
  expect(
    (await (await BrowserHistory.open(f.directory)).query(recent)).entries
  ).toEqual([]);
  f.history.visit("https://example.com/path?q=1", "new real visit", 2);
  await f.history.flush();
  expect((await f.history.query(recent)).entries[0].title).toBe(
    "new real visit"
  );
});

it("serializes clear after a staged older write and rejects resurrection from old title tokens", async () => {
  const f = await fixture();
  const original = fs.rename.bind(fs);
  let release!: () => void;
  let staged = false;
  vi.spyOn(fs, "rename").mockImplementationOnce(async (source, destination) => {
    staged = true;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await original(source, destination);
  });
  const token = f.history.visit("https://example.com/", "old", 1)!;
  await vi.waitFor(() => expect(staged).toBe(true));
  const clearing = f.history.clear();
  f.history.updateTitle("https://example.com/", "late", token);
  release();
  await clearing;
  await f.history.flush();
  expect(
    (await (await BrowserHistory.open(f.directory)).query(recent)).entries
  ).toEqual([]);
});

it("rechecks queued removal authority before committing a file mutation", async () => {
  const f = await fixture();
  f.history.visit("https://example.com/", "keep", 1);
  await f.history.flush();
  let admitted = true;
  const original = fs.lstat.bind(fs);
  let release!: () => void;
  vi.spyOn(fs, "lstat").mockImplementationOnce(async (file) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return original(file);
  });
  const removing = f.history.remove({ url: "https://example.com/" }, () => {
    if (!admitted) throw new Error("expired");
  });
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  admitted = false;
  release();
  await expect(removing).rejects.toThrow("browser_history_write_failed");
  expect(
    (await (await BrowserHistory.open(f.directory)).query(recent)).entries
  ).toHaveLength(1);
});

it("retains a failed visit batch for a later successful flush", async () => {
  const f = await fixture();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  let fail!: () => void;
  vi.spyOn(fs, "rename").mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        fail = () => reject(new Error("disk unavailable"));
      })
  );
  f.history.visit("https://example.com/", "retained", 1);
  await vi.waitFor(() => expect(fail).toBeTypeOf("function"));
  fail();
  await f.history.flush();
  expect(
    (await (await BrowserHistory.open(f.directory)).query(recent)).entries
  ).toEqual([
    { url: "https://example.com/", title: "retained", lastVisitedAt: 1 },
  ]);
});

it.each(["title", "visit", "remove", "clear"] as const)(
  "preserves newer %s changes when restoring a failed visit batch",
  async (change) => {
    const f = await fixture();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let fail!: () => void;
    vi.spyOn(fs, "rename").mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = () => reject(new Error("disk unavailable"));
        })
    );
    const url = "https://example.com/";
    const token = f.history.visit(url, "old", 1)!;
    await vi.waitFor(() => expect(fail).toBeTypeOf("function"));
    let mutation: Promise<void> | undefined;
    if (change === "title") f.history.updateTitle(url, "new title", token);
    if (change === "visit") f.history.visit(url, "new visit", 2);
    if (change === "remove") mutation = f.history.remove({ url });
    if (change === "clear") mutation = f.history.clear();
    fail();
    await mutation;
    await f.history.flush();
    const entries = (
      await (await BrowserHistory.open(f.directory)).query(recent)
    ).entries;
    expect(entries).toEqual(
      change === "remove" || change === "clear"
        ? []
        : [
            {
              url,
              title: change === "title" ? "new title" : "new visit",
              lastVisitedAt: change === "title" ? 1 : 2,
            },
          ]
    );
  }
);

it("keeps newer pending updates ahead of restored visits when the pending bound is full", async () => {
  const f = await fixture();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  let fail!: () => void;
  vi.spyOn(fs, "rename").mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        fail = () => reject(new Error("disk unavailable"));
      })
  );
  const token = f.history.visit("https://example.com/old-0", "old", 1000)!;
  for (let index = 1; index < BrowserHistory.MAX_ENTRIES; index++)
    f.history.visit(`https://example.com/old-${index}`, "old", index);
  await vi.waitFor(() => expect(fail).toBeTypeOf("function"));
  f.history.updateTitle("https://example.com/old-0", "new title", token);
  for (let index = 1; index < BrowserHistory.MAX_ENTRIES; index++)
    f.history.visit(`https://example.com/new-${index}`, "new", 1000 + index);
  fail();
  await f.history.flush();
  const history = await BrowserHistory.open(f.directory);
  expect((await history.query({ query: "old-0", limit: 1 })).entries).toEqual([
    {
      url: "https://example.com/old-0",
      title: "new title",
      lastVisitedAt: 1000,
    },
  ]);
  expect((await history.query({ query: "/old-1", limit: 1 })).entries).toEqual(
    []
  );
});
