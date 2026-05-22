import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { NodeFsBackend } from "./node";

/**
 * Real-filesystem coverage for `NodeFsBackend`. Each test gets a fresh
 * tmp dir under `os.tmpdir()` and cleans up afterwards. No mocking.
 */
describe("NodeFsBackend (real tmp fs)", () => {
  let tmp: string;
  let b: NodeFsBackend;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "agent-fs-"));
    b = new NodeFsBackend(tmp);
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("rejects non-absolute paths", async () => {
    await expect(b.write("canvas.svg", "x")).rejects.toThrow(/must start/);
    await expect(b.read("canvas.svg")).rejects.toThrow(/must start/);
  });

  it("starts empty: list returns [] and read returns null", async () => {
    expect(await b.list()).toEqual([]);
    expect(await b.read("/canvas.svg")).toBeNull();
  });

  it("write creates the file on disk; read returns it", async () => {
    await b.write("/canvas.svg", "<svg/>");
    expect(await b.read("/canvas.svg")).toBe("<svg/>");
    // Independently verify with raw fs.
    const onDisk = await fs.readFile(path.join(tmp, "canvas.svg"), "utf8");
    expect(onDisk).toBe("<svg/>");
  });

  it("write creates intermediate directories", async () => {
    await b.write("/notes/draft.md", "hello");
    expect(await b.read("/notes/draft.md")).toBe("hello");
    const stats = await fs.stat(path.join(tmp, "notes"));
    expect(stats.isDirectory()).toBe(true);
  });

  it("list enumerates every file across nested directories", async () => {
    await b.write("/canvas.svg", "A");
    await b.write("/notes/idea.md", "B");
    await b.write("/sketches/x/y/diagram.svg", "C");
    expect(new Set(await b.list())).toEqual(
      new Set(["/canvas.svg", "/notes/idea.md", "/sketches/x/y/diagram.svg"])
    );
  });

  it("delete removes the file; read returns null after", async () => {
    await b.write("/canvas.svg", "X");
    await b.delete("/canvas.svg");
    expect(await b.read("/canvas.svg")).toBeNull();
  });

  it("delete on a missing path is a no-op", async () => {
    await expect(b.delete("/never-existed")).resolves.toBeUndefined();
  });

  it("survives reconstruction (persistence across instance lifetime)", async () => {
    await b.write("/canvas.svg", "persistent");
    const b2 = new NodeFsBackend(tmp);
    expect(await b2.read("/canvas.svg")).toBe("persistent");
  });
});
