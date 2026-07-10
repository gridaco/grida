import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SidecarLogWriter } from "./sidecar-log";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "sidecar-log-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("SidecarLogWriter", () => {
  it("appends ISO8601-stamped stream-tagged lines, creating the dir lazily", () => {
    const w = new SidecarLogWriter(path.join(dir, "nested", "logs"));
    w.write("out", "hello");
    w.write("err", "boom");
    w.write("sup", "listening port=1234");
    const body = fs.readFileSync(w.file, "utf8");
    const lines = body.trimEnd().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[out\] hello$/
    );
    expect(lines[1]).toContain("[err] boom");
    expect(lines[2]).toContain("[sup] listening port=1234");
  });

  it("resumes size accounting from an existing file across writer instances", () => {
    const a = new SidecarLogWriter(dir, { max_bytes: 200, keep: 2 });
    a.write("out", "first");
    // A fresh writer (process restart) must count the existing bytes, not
    // restart from zero — otherwise rotation drifts past the cap.
    const b = new SidecarLogWriter(dir, { max_bytes: 200, keep: 2 });
    const big = "x".repeat(180);
    b.write("out", big); // would exceed 200 with the existing bytes → rotate
    expect(fs.existsSync(path.join(dir, "sidecar.1.log"))).toBe(true);
    expect(fs.readFileSync(path.join(dir, "sidecar.1.log"), "utf8")).toContain(
      "first"
    );
    expect(fs.readFileSync(b.file, "utf8")).toContain(big);
  });

  it("rotates at the byte cap and drops the oldest beyond `keep`", () => {
    const w = new SidecarLogWriter(dir, { max_bytes: 120, keep: 3 });
    // Each entry is ~90 bytes with the timestamp prefix → one per file.
    w.write("out", `gen-1 ${"a".repeat(60)}`);
    w.write("out", `gen-2 ${"b".repeat(60)}`); // rotates gen-1 → .1
    w.write("out", `gen-3 ${"c".repeat(60)}`); // gen-1 → .2, gen-2 → .1
    w.write("out", `gen-4 ${"d".repeat(60)}`); // gen-1 falls off the end
    const files = fs.readdirSync(dir).sort();
    expect(files).toEqual(["sidecar.1.log", "sidecar.2.log", "sidecar.log"]);
    expect(fs.readFileSync(path.join(dir, "sidecar.log"), "utf8")).toContain(
      "gen-4"
    );
    expect(fs.readFileSync(path.join(dir, "sidecar.1.log"), "utf8")).toContain(
      "gen-3"
    );
    expect(fs.readFileSync(path.join(dir, "sidecar.2.log"), "utf8")).toContain(
      "gen-2"
    );
    // gen-1 dropped
    const all = files
      .map((f) => fs.readFileSync(path.join(dir, f), "utf8"))
      .join("");
    expect(all).not.toContain("gen-1");
  });

  it("rotates by UTF-8 byte count, not UTF-16 length (multi-byte content)", () => {
    // Discriminating cap: each 🚀 is a UTF-16 surrogate PAIR (2 code units)
    // but 4 UTF-8 bytes. Per line the entry is ~112 UTF-16 units vs ~192
    // bytes (32-char prefix + 80 units / 160 bytes of emoji). With a 300 cap,
    // a `.length`-based counter sees 112+112=224 < 300 on the second write and
    // would NOT rotate; byte counting sees 192+192=384 > 300 and DOES. So this
    // fails against the old `.length` accounting and passes only with bytes.
    const w = new SidecarLogWriter(dir, { max_bytes: 300, keep: 2 });
    const emoji = "🚀".repeat(40);
    w.write("out", emoji);
    w.write("out", emoji);
    expect(fs.existsSync(path.join(dir, "sidecar.1.log"))).toBe(true);
    expect(fs.readFileSync(path.join(dir, "sidecar.1.log"), "utf8")).toContain(
      emoji
    );
    expect(fs.readFileSync(w.file, "utf8")).toContain(emoji);
  });

  it("swallows fs errors and recovers on the next write", () => {
    const w = new SidecarLogWriter(dir, { max_bytes: 1024, keep: 2 });
    w.write("out", "before");
    // Make the target dir unwritable by replacing the file with a directory —
    // appendFileSync will EISDIR. Must not throw.
    fs.rmSync(w.file);
    fs.mkdirSync(w.file);
    expect(() => w.write("out", "lost")).not.toThrow();
    // Restore writability; the writer re-resolves and keeps going.
    fs.rmdirSync(w.file);
    expect(() => w.write("out", "after")).not.toThrow();
    expect(fs.readFileSync(w.file, "utf8")).toContain("after");
  });

  it("keep=1 truncates in place instead of rotating", () => {
    const w = new SidecarLogWriter(dir, { max_bytes: 100, keep: 1 });
    w.write("out", "x".repeat(60));
    w.write("out", "y".repeat(60)); // exceeds cap → drop current, start fresh
    const files = fs.readdirSync(dir);
    expect(files).toEqual(["sidecar.log"]);
    const body = fs.readFileSync(w.file, "utf8");
    expect(body).toContain("y".repeat(60));
    expect(body).not.toContain("x".repeat(60));
  });
});
