// GRIDA-SEC-013 — input/output preflight, publication, cleanup and partial-save regressions.
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
  lstat,
  link,
} from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MediaFiles } from "./media-files";

vi.mock("node:fs/promises", async (original) => {
  const files = await original<typeof import("node:fs/promises")>();
  return { ...files, link: vi.fn<typeof files.link>(files.link) };
});

const roots: string[] = [];
async function temporary() {
  const root = await mkdtemp(path.join(tmpdir(), "grida-media-files-"));
  roots.push(root);
  return root;
}
const signal = () => new AbortController().signal;
const metadata = {
  kind: "image",
  model_id: "synthetic/image",
  provider_id: "fal",
  binding_id: "synthetic/image",
  variant: "text",
};
afterEach(async () => {
  vi.mocked(link).mockClear();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("media input", () => {
  it("reads explicit JSON file or stdin without expanding paths or fetching URLs", async () => {
    const filename = path.join(await temporary(), "request.json");
    await writeFile(filename, '{"prompt":"a house"}');
    expect(await MediaFiles.readInput("@" + filename, signal())).toEqual({
      prompt: "a house",
    });
    expect(
      await MediaFiles.readInput(
        "-",
        signal(),
        Readable.from([Buffer.from('{"prompt":"stdin"}')])
      )
    ).toEqual({ prompt: "stdin" });
    await expect(
      MediaFiles.readInput("https://provider.example/input.json", signal())
    ).rejects.toMatchObject({ code: "invalid_input" });
  });
  it.each(["null", "[]", '{"prompt":', '"token-do-not-echo"'])(
    "rejects non-object or malformed JSON: %s",
    async (text) => {
      await expect(
        MediaFiles.readInput("-", signal(), Readable.from([Buffer.from(text)]))
      ).rejects.toMatchObject({
        code: "invalid_input",
        message: "invalid_input",
      });
    }
  );
  it("bounds streaming input and observes cancellation", async () => {
    await expect(
      MediaFiles.readInput(
        "-",
        signal(),
        Readable.from([Buffer.alloc(16 * 1024 * 1024 + 1)])
      )
    ).rejects.toMatchObject({ code: "invalid_input" });
    const controller = new AbortController();
    const stream = new Readable({ read() {} });
    const reading = MediaFiles.readInput("-", controller.signal, stream);
    controller.abort();
    await expect(reading).rejects.toMatchObject({ code: "cancelled" });
    stream.destroy();
  });
  it("rejects malformed UTF-8 and non-file inputs without raw filesystem errors", async () => {
    await expect(
      MediaFiles.readInput(
        "-",
        signal(),
        Readable.from([Buffer.from([123, 34, 120, 34, 58, 34, 0xff, 34, 125])])
      )
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      MediaFiles.readInput("@" + (await temporary()), signal())
    ).rejects.toMatchObject({ code: "input_unavailable" });
  });
});

describe("generation artifacts", () => {
  it("reserves a fresh directory before submission and refuses existing output", async () => {
    const root = await temporary();
    const target = path.join(root, "images");
    const directory = await MediaFiles.prepare(target);
    expect(link).toHaveBeenCalledOnce();
    expect(await readdir(directory.path)).toEqual([]);
    await expect(MediaFiles.prepare(target)).rejects.toMatchObject({
      code: "output_unavailable",
    });
    await directory.abandon();
    expect(await readdir(root)).toEqual([]);
  });
  it("refuses unsupported atomic publication during preflight and removes its empty reservation", async () => {
    const root = await temporary();
    const target = path.join(root, "unsupported-volume");
    vi.mocked(link).mockRejectedValueOnce(
      Object.assign(new Error("private filesystem diagnostic"), {
        code: "EPERM",
      })
    );
    await expect(MediaFiles.prepare(target)).rejects.toMatchObject({
      code: "output_unavailable",
      message: "output_unavailable",
    });
    expect(await readdir(root)).toEqual([]);
  });
  it("saves complete bytes and a safe receipt with exclusive filenames", async () => {
    const directory = await MediaFiles.prepare(
      path.join(await temporary(), "images")
    );
    const bytes = Uint8Array.of(1, 2, 3);
    const privateMetadata = {
      ...metadata,
      prompt: "do-not-record",
      token: "do-not-record",
    };
    const receipt = await directory.save(privateMetadata, [
      { data: bytes, media_type: "image/png" },
    ]);
    expect(await readFile(receipt.artifacts[0]!.path)).toEqual(
      Buffer.from(bytes)
    );
    expect(receipt.artifacts[0]).toMatchObject({
      bytes: 3,
      media_type: "image/png",
      sha256:
        "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81",
    });
    const text = await readFile(
      path.join(directory.path, "receipt.json"),
      "utf8"
    );
    expect(JSON.parse(text)).toEqual(receipt);
    expect(text).not.toContain("do-not-record");
    expect(await readdir(directory.path)).toEqual([
      "output-1.png",
      "receipt.json",
    ]);
    await directory.abandon();
    expect(await readFile(receipt.artifacts[0]!.path)).toEqual(
      Buffer.from(bytes)
    );
  });
  it.skipIf(process.platform === "win32")(
    "creates private POSIX artifact permissions",
    async () => {
      const directory = await MediaFiles.prepare(
        path.join(await temporary(), "private-output")
      );
      const receipt = await directory.save(metadata, [
        { data: Uint8Array.of(1), media_type: "image/png" },
      ]);
      expect((await lstat(receipt.artifacts[0]!.path)).mode & 0o777).toBe(
        0o600
      );
    }
  );
  it("never overwrites a raced destination and reports already saved artifacts", async () => {
    const directory = await MediaFiles.prepare(
      path.join(await temporary(), "result")
    );
    await writeFile(path.join(directory.path, "output-2.bin"), "preserve");
    const artifact = {
      data: Uint8Array.of(1),
      media_type: "application/unknown",
    };
    await expect(
      directory.save(metadata, [artifact, artifact])
    ).rejects.toMatchObject({
      code: "save_failed",
      directory: directory.path,
      saved: [
        expect.objectContaining({
          path: path.join(directory.path, "output-1.bin"),
        }),
      ],
    });
    expect(
      await readFile(path.join(directory.path, "output-2.bin"), "utf8")
    ).toBe("preserve");
    expect(await readdir(directory.path)).toEqual([
      "output-1.bin",
      "output-2.bin",
    ]);
  });
  it("refuses repeated saves and never removes a nonempty reservation", async () => {
    const directory = await MediaFiles.prepare(
      path.join(await temporary(), "result")
    );
    await directory.save(metadata, [
      { data: Uint8Array.of(0), media_type: "audio/mpeg" },
    ]);
    await expect(
      directory.save(metadata, [
        { data: Uint8Array.of(1), media_type: "audio/mpeg" },
      ])
    ).rejects.toMatchObject({ code: "save_failed" });
    await directory.abandon();
    expect(await readFile(path.join(directory.path, "output-1.mp3"))).toEqual(
      Buffer.from([0])
    );
  });
});
