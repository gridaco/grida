// GRIDA-SEC-013 — input/output preflight, publication, cleanup and partial-save regressions.
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
  lstat,
  link,
  open,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MediaFiles } from "./media-files";

vi.mock("node:fs/promises", async (original) => {
  const files = await original<typeof import("node:fs/promises")>();
  return {
    ...files,
    link: vi.fn<typeof files.link>(files.link),
    open: vi.fn<typeof files.open>(files.open),
  };
});

const roots: string[] = [];
async function temporary() {
  const root = await mkdtemp(path.join(tmpdir(), "grida-media-files-"));
  roots.push(root);
  return root;
}
const signal = () => new AbortController().signal;
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  "base64"
);
// Minimal container/frame headers: the CLI admits headers, without pixel decoding.
const jpeg = Buffer.from(
  "ffd8ffe000044a46ffc0000b080001000101011100ffda0008010100003f0000ffd9",
  "hex"
);
const webp = Buffer.from(
  "5249464612000000574542505650384c050000002f0000000000",
  "hex"
);
const metadata = {
  kind: "image",
  model_id: "synthetic/image",
  provider_id: "fal",
  binding_id: "synthetic/image",
  variant: "text",
};
afterEach(async () => {
  vi.useRealTimers();
  vi.mocked(link).mockClear();
  vi.mocked(open).mockClear();
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
  it("keeps JSON BOM handling and treats @- as a literal file path", async () => {
    expect(
      await MediaFiles.readInput(
        "-",
        signal(),
        Readable.from([Buffer.from('\ufeff{"prompt":"bom"}')])
      )
    ).toEqual({ prompt: "bom" });
    const root = await temporary();
    const filename = path.join(root, "-");
    await writeFile(filename, '{"prompt":"file"}');
    const original = vi.mocked(open).getMockImplementation()!;
    vi.mocked(open).mockImplementationOnce(async (selected, ...args) => {
      expect(selected).toBe(path.resolve("-"));
      return await original(filename, ...args);
    });
    expect(await MediaFiles.readInput("@-", signal())).toEqual({
      prompt: "file",
    });
  });
});

describe("MediaFiles.readText", () => {
  it("preserves whitespace and a text BOM from literal cwd-relative paths and stdin", async () => {
    const filename = path.join(await temporary(), "@prompt.txt");
    const content = "\ufeff  first line\r\n\nsecond\tline  \n";
    await writeFile(filename, content);
    expect(
      await MediaFiles.readText(
        path.relative(process.cwd(), filename),
        signal()
      )
    ).toBe(content);
    expect(
      await MediaFiles.readText(
        "-",
        signal(),
        Readable.from([Buffer.from(content)])
      )
    ).toBe(content);
  });
  it("rejects invalid UTF-8 without replacing source bytes", async () => {
    const filename = path.join(await temporary(), "binary.txt");
    await writeFile(filename, Buffer.from([0xf0, 0x28, 0x8c, 0x28]));
    await expect(MediaFiles.readText(filename, signal())).rejects.toMatchObject(
      {
        code: "invalid_input",
        message: "invalid_input",
      }
    );
  });
  it("admits the exact text limit and rejects another streamed byte", async () => {
    const full = Buffer.alloc(MediaFiles.inputLimits.text, 0x61);
    expect(
      (await MediaFiles.readText("-", signal(), Readable.from([full]))).length
    ).toBe(MediaFiles.inputLimits.text);
    await expect(
      MediaFiles.readText(
        "-",
        signal(),
        Readable.from([full, Buffer.from("b")])
      )
    ).rejects.toMatchObject({ code: "invalid_input" });
  });
  it("times out silent stdin and permits cancellation without destroying shared stdin", async () => {
    vi.useFakeTimers();
    const silent = new Readable({ read() {} });
    const timed = MediaFiles.readText("-", signal(), silent);
    await Promise.all([
      expect(timed).rejects.toMatchObject({ code: "input_unavailable" }),
      vi.advanceTimersByTimeAsync(30_000),
    ]);
    expect(silent.destroyed).toBe(false);
    silent.destroy();
    const stream = new Readable({ read() {} });
    const controller = new AbortController();
    const reading = MediaFiles.readText("-", controller.signal, stream);
    controller.abort();
    await expect(reading).rejects.toMatchObject({ code: "cancelled" });
    expect(stream.destroyed).toBe(false);
    stream.destroy();
  });
});

describe("MediaFiles.readImage", () => {
  it.each([
    ["image/png", png, "reference.jpg"],
    ["image/jpeg", jpeg, "reference.webp"],
    ["image/webp", webp, "reference.png"],
  ] as const)(
    "detects %s from bytes despite the file extension",
    async (mime, bytes, name) => {
      const filename = path.join(await temporary(), name);
      await writeFile(filename, bytes);
      const result = await MediaFiles.readImage(
        path.relative(process.cwd(), filename),
        signal()
      );
      expect(result).toEqual({ data: bytes, media_type: mime });
      expect(open).toHaveBeenCalledOnce();
      await writeFile(filename, "changed after snapshot");
      expect(result.data).toEqual(bytes);
    }
  );
  it.each([
    Buffer.from("ordinary text"),
    Buffer.from("GIF89a"),
    png.subarray(0, 32),
    jpeg.subarray(0, 20),
    webp.subarray(0, 22),
    Buffer.from(png).fill(0, 16, 20),
    Buffer.from(png).fill(0xff, 16, 20),
    Buffer.from(png).fill(0xc9, 12, 13),
    Buffer.from(png).fill(3, 24, 25),
    Buffer.from(jpeg).fill(0xff, 12, 14),
    Buffer.from(webp).fill(0xff, 16, 20),
    Buffer.from(webp).fill(0xd2, 0, 1),
  ])(
    "rejects unsupported bytes and malformed image headers %#",
    async (bytes) => {
      const filename = path.join(await temporary(), "private-reference.png");
      await writeFile(filename, bytes);
      await expect(
        MediaFiles.readImage(filename, signal())
      ).rejects.toMatchObject({
        code: "invalid_input",
        message: "invalid_input",
      });
    }
  );
  it("admits the exact image cap and rejects larger files before streaming", async () => {
    const filename = path.join(await temporary(), "large.png");
    const bytes = Buffer.alloc(MediaFiles.inputLimits.image);
    png.copy(bytes);
    await writeFile(filename, bytes);
    expect(
      (await MediaFiles.readImage(filename, signal())).data.byteLength
    ).toBe(MediaFiles.inputLimits.image);
    await writeFile(filename, Buffer.concat([bytes, Buffer.from([0])]));
    await expect(
      MediaFiles.readImage(filename, signal())
    ).rejects.toMatchObject({
      code: "input_unavailable",
    });
  });
  it("still enforces the streamed cap if the file grows after stat", async () => {
    const filename = path.join(await temporary(), "growing.png");
    await writeFile(filename, png);
    const original = vi.mocked(open).getMockImplementation()!;
    vi.mocked(open).mockImplementationOnce(async (...args) => {
      const file = await original(...args);
      const stat = file.stat.bind(file);
      vi.spyOn(file, "stat").mockImplementationOnce(async () => {
        const info = await stat();
        await writeFile(
          filename,
          Buffer.alloc(MediaFiles.inputLimits.image + 1)
        );
        return info;
      });
      return file;
    });
    await expect(
      MediaFiles.readImage(filename, signal())
    ).rejects.toMatchObject({
      code: "invalid_input",
    });
  });
  it("enforces a remaining aggregate allowance before creating a file stream", async () => {
    const filename = path.join(await temporary(), "bounded.png");
    await writeFile(filename, png);
    const original = vi.mocked(open).getMockImplementation()!;
    const streamed =
      vi.fn<Awaited<ReturnType<typeof open>>["createReadStream"]>();
    vi.mocked(open).mockImplementationOnce(async (...args) => {
      const file = await original(...args);
      vi.spyOn(file, "createReadStream").mockImplementation(streamed);
      return file;
    });
    await expect(
      MediaFiles.readImage(filename, signal(), png.length - 1)
    ).rejects.toMatchObject({ code: "input_unavailable" });
    expect(streamed).not.toHaveBeenCalled();
    expect(
      (await MediaFiles.readImage(filename, signal(), png.length)).data
    ).toEqual(png);
  });
  it.each([
    "",
    "-",
    "https://private.example/file.png",
    "file:///private.png",
    "data:image/png;base64,private",
  ])("rejects non-path source %s without opening a file", async (source) => {
    await expect(MediaFiles.readImage(source, signal())).rejects.toMatchObject({
      code: "invalid_input",
    });
    expect(open).not.toHaveBeenCalled();
  });
  it("redacts filesystem failures and does not read cancelled input", async () => {
    const root = await temporary();
    for (const filename of [root, path.join(root, "private-missing.png")]) {
      await expect(
        MediaFiles.readImage(filename, signal())
      ).rejects.toMatchObject({
        code: "input_unavailable",
        message: "input_unavailable",
      });
    }
    vi.mocked(open).mockClear();
    const controller = new AbortController();
    controller.abort();
    await expect(
      MediaFiles.readImage(root, controller.signal)
    ).rejects.toMatchObject({
      code: "cancelled",
    });
    expect(open).not.toHaveBeenCalled();
  });
  it.skipIf(process.platform === "win32")(
    "rejects a FIFO without waiting for a writer",
    async () => {
      const filename = path.join(await temporary(), "input.pipe");
      execFileSync("mkfifo", [filename]);
      await expect(
        MediaFiles.readImage(filename, signal())
      ).rejects.toMatchObject({
        code: "input_unavailable",
      });
    }
  );
  it.each(["cancelled", "input_unavailable"])(
    "bounds a stalled open (%s) and closes a late handle",
    async (code) => {
      const filename = path.join(await temporary(), "late.png");
      await writeFile(filename, png);
      const original = vi.mocked(open).getMockImplementation()!;
      let complete!: (file: Awaited<ReturnType<typeof open>>) => void;
      vi.mocked(open).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            complete = resolve;
          })
      );
      vi.useFakeTimers();
      const controller = new AbortController();
      const reading = MediaFiles.readImage(filename, controller.signal);
      await Promise.all([
        expect(reading).rejects.toMatchObject({ code }),
        code === "cancelled"
          ? controller.abort()
          : vi.advanceTimersByTimeAsync(30_000),
      ]);
      vi.useRealTimers();
      const file = await original(filename, "r");
      const closed = vi.spyOn(file, "close");
      complete(file);
      await vi.waitFor(() => expect(closed).toHaveBeenCalledOnce());
      await expect(file.stat()).rejects.toBeDefined();
    }
  );
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
