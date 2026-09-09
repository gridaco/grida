// GRIDA-SEC-013 — file flags and JSON share validation before authority.
import { MediaOperations } from "@grida/ai";
import { catalog } from "@app/ai-catalog";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Cli } from "./cli";
import { MediaFiles } from "./media-files";
import { MediaInput } from "./media-input";

const operations = new MediaOperations({ catalog: catalog.snapshot.view() });
const roots: string[] = [];
// A complete 1x1 PNG: local intake tests do not rely on output-only signature stubs.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  "base64"
);
const signal = () => new AbortController().signal;
async function file(name: string, data: string | Uint8Array) {
  const root = await mkdtemp(path.join(tmpdir(), "grida-cli-input-"));
  roots.push(root);
  const target = path.join(root, name);
  await writeFile(target, data);
  return target;
}
function invocation(
  flags: string[],
  provider = "openrouter",
  model = "openai/gpt-image-2"
) {
  const value = Cli.parse([
    "generate",
    "--provider",
    provider,
    "--model",
    model,
    "--out",
    "./result",
    ...flags,
  ]);
  if (value.command !== "generate") throw new Error("Expected generation");
  return value;
}
async function input(
  flags: string[],
  provider?: string,
  model?: string,
  stdin = Readable.from([])
) {
  const request = invocation(flags, provider, model);
  const descriptor = MediaInput.inspect(operations, request);
  const value = await MediaInput.read(descriptor, request, signal(), stdin);
  const selector = {
    provider: descriptor.provider_id,
    model_id: descriptor.model_id,
    kind: descriptor.kind,
    variant: descriptor.variant,
  };
  return { descriptor, value, parsed: operations.parseInput(selector, value) };
}
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("MediaInput", () => {
  it("preserves literal text and schema-typed values, including zero and false", async () => {
    const literal = "  literal @missing.json\n";
    const generated = await input([
      "--prompt",
      literal,
      "--param",
      "seed=0",
      "--param",
      "quality=001",
    ]);
    expect(generated.value).toEqual({
      prompt: literal,
      seed: 0,
      quality: "001",
    });
    const sfx = await input(
      [
        "--prompt",
        "a=b",
        "--param",
        "loop=false",
        "--param",
        "duration_seconds=4",
      ],
      "elevenlabs",
      "eleven_text_to_sound_v2"
    );
    expect(sfx.value).toEqual({
      prompt: "a=b",
      loop: false,
      duration_seconds: 4,
    });
    const speech = await input(
      ["--text", literal, "--voice", "001"],
      "elevenlabs",
      "eleven_v3"
    );
    expect(speech.parsed).toMatchObject({
      input: { text: literal },
      selection: { voice_id: "001" },
    });
  });

  it("makes local and HTTPS references explicit, preserves order, and matches JSON", async () => {
    const local = await file("image with spaces.bin", PNG);
    const result = await input([
      "--prompt",
      "paint",
      "--reference",
      local,
      "--reference",
      "https://example.com/second.png",
    ]);
    const expected = {
      prompt: "paint",
      references: [
        `data:image/png;base64,${PNG.toString("base64")}`,
        "https://example.com/second.png",
      ],
    };
    expect(result.descriptor.variant).toBe("references");
    expect(result.value).toEqual(expected);
    const json = await file("request.json", JSON.stringify(expected));
    const alternate = await input([
      "--variant",
      "references",
      "--input",
      `@${json}`,
    ]);
    expect(result.parsed).toEqual(alternate.parsed);
    expect(await readFile(local)).toEqual(PNG);
  });

  it("reads speech/generation files or stdin as UTF-8 without stripping whitespace", async () => {
    const content = "\n  Hello, 그리다.  \n";
    const local = await file("prompt.txt", content);
    expect((await input(["--prompt-file", local])).value).toEqual({
      prompt: content,
    });
    expect(
      (
        await input(
          ["--text-file", "-", "--voice", "voice"],
          "elevenlabs",
          "eleven_v3",
          Readable.from([Buffer.from(content)])
        )
      ).value
    ).toEqual({ text: content, voice_id: "voice" });
  });

  it("lowers a local 3D image to the existing SDK byte contract", async () => {
    const local = await file("object.png", PNG);
    const result = await input(["--image", local], "fal", "fal-ai/trellis-2");
    expect(result.parsed).toMatchObject({
      kind: "three-d",
      input: { image: { data: new Uint8Array(PNG), media_type: "image/png" } },
    });
  });

  it("uses the published inline video contract and the same native parser as JSON", async () => {
    const local = await file("frame.png", PNG);
    const friendly = await input(
      [
        "--prompt",
        "animate",
        "--image",
        local,
        "--param",
        "duration=4",
        "--param",
        "resolution=1280x720",
        "--param",
        "generate_audio=false",
      ],
      "fal",
      "google/veo-3.1-lite"
    );
    expect(friendly.descriptor.variant).toBe("image");
    expect(friendly.parsed).toMatchObject({
      input: {
        image: { data: new Uint8Array(PNG), media_type: "image/png" },
        duration: 4,
        resolution: "1280x720",
        generate_audio: false,
      },
    });
    const json = await file("video.json", JSON.stringify(friendly.value));
    const explicit = await input(
      ["--variant", "image", "--input", `@${json}`],
      "fal",
      "google/veo-3.1-lite"
    );
    expect(friendly.parsed).toEqual(explicit.parsed);
  });

  it("uses the operation's lower decoded byte limit before encoding", async () => {
    vi.spyOn(MediaFiles, "readImage").mockResolvedValue({
      data: new Uint8Array(8_000_001),
      media_type: "image/png",
    });
    await expect(
      input(
        ["--prompt", "animate", "--image", "frame.png"],
        "fal",
        "google/veo-3.1-lite"
      )
    ).rejects.toThrow(/decoded limit of 8000000 bytes/);
  });

  it("checks unsupported fields and collisions before touching files", async () => {
    const read = vi.spyOn(MediaFiles, "readImage");
    for (const flags of [
      ["--image", "never-read.png", "--prompt", "not accepted"],
      ["--image", "never-read.png", "--param", "image=bad"],
    ])
      await expect(
        input(flags, "fal", "fal-ai/trellis-2")
      ).rejects.toBeInstanceOf(Cli.Failure);
    await expect(
      input(["--prompt-file", "never-read.txt", "--param", "prompt=duplicate"])
    ).rejects.toThrow(/more than once/);
    expect(read).not.toHaveBeenCalled();
  });

  it.each([
    ["--prompt", "a", "--param", "unknown=private-value"],
    ["--prompt", "a", "--param", "seed=NaN"],
    ["--prompt", "a", "--param", "seed= "],
    ["--prompt", "a", "--param", "references=[]"],
    [
      "--prompt",
      "a",
      "--reference",
      "private-missing.png",
      "--variant",
      "text",
    ],
    ["--text", "wrong modality"],
    ["--reference", "http://example.com/image.png"],
  ])("rejects bad input without echoing values: %j", async (...flags) => {
    let failure: unknown;
    try {
      await input(flags);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Cli.Failure);
    expect(String(failure)).not.toContain("private-");
  });

  it("keeps URL-only video bindings explicit and refuses local files before reading", async () => {
    const read = vi.spyOn(MediaFiles, "readImage");
    await expect(
      input(
        ["--prompt", "animate", "--image", "private-file.png"],
        "openrouter",
        "google/veo-3.1"
      )
    ).rejects.toBeInstanceOf(Cli.Failure);
    expect(read).not.toHaveBeenCalled();
    const result = await input(
      ["--prompt", "animate", "--image", "https://example.com/frame.png"],
      "openrouter",
      "google/veo-3.1"
    );
    expect(result.value).toEqual({
      prompt: "animate",
      image_url: "https://example.com/frame.png",
    });
  });

  it("bounds the encoded aggregate, even when each image fits its file limit", async () => {
    vi.spyOn(MediaFiles, "readImage").mockResolvedValue({
      data: new Uint8Array(7 * 1024 * 1024),
      media_type: "image/png",
    });
    await expect(
      input([
        "--prompt",
        "paint",
        "--reference",
        "a.png",
        "--reference",
        "b.png",
      ])
    ).rejects.toThrow(/assembled input exceeds 16 MiB/);
  });

  it("passes the remaining aggregate allowance into the next file read", async () => {
    const paths: string[] = [];
    for (const size of [6, 5, 8]) {
      const bytes = Buffer.alloc(size * 1024 * 1024);
      PNG.copy(bytes);
      paths.push(await file("padded.png", bytes));
    }
    const reads = vi.spyOn(MediaFiles, "readImage");
    await expect(
      input([
        "--prompt",
        "paint",
        ...paths.flatMap((source) => ["--reference", source]),
      ])
    ).rejects.toThrow(/--reference: cannot read/);
    expect(reads.mock.calls.map((call) => call[2])).toEqual(
      [16, 10, 5].map((mib) => mib * 1024 * 1024)
    );
  });

  it("shows human input guidance without changing the JSON descriptor", () => {
    const descriptor = MediaInput.inspect(
      operations,
      invocation(["--image", "object.png"], "fal", "fal-ai/trellis-2")
    );
    const before = JSON.stringify(descriptor);
    expect(MediaInput.describe(descriptor).join("\n")).toMatch(
      /--image FILE.*decoded maximum/s
    );
    expect(MediaInput.describe(descriptor).join("\n")).toContain(
      "grida generate --provider 'fal'"
    );
    expect(JSON.stringify(descriptor)).toBe(before);
  });

  it("advertises local files only on schemas that can accept their bytes", () => {
    const reference = MediaInput.inspect(
      operations,
      invocation(["--reference", "ref.png"])
    );
    expect(MediaInput.localImageFlags(reference)).toEqual(["--reference"]);
    const local = operations.inspect({
      kind: "video",
      provider: "fal",
      model_id: "google/veo-3.1-lite",
      variant: "image",
    });
    expect(MediaInput.localImageFlags(local)).toEqual(["--image"]);
    expect(MediaInput.describe(local).join("\n")).toContain(
      "Local images: PNG/JPEG/static WebP"
    );
    const remote = operations.inspect({
      kind: "video",
      provider: "openrouter",
      model_id: "google/veo-3.1",
      variant: "image",
    });
    const text = operations.inspect({
      kind: "image",
      provider: "openrouter",
      model_id: "openai/gpt-image-2",
      variant: "text",
    });
    for (const descriptor of [remote, text]) {
      expect(MediaInput.localImageFlags(descriptor)).toEqual([]);
      const help = MediaInput.describe(descriptor).join("\n");
      expect(help).toContain("does not accept local image files");
      expect(help).not.toContain("Local images: PNG/JPEG/static WebP");
      expect(help).not.toContain("--image FILE");
      expect(help).not.toContain("./input.png");
    }
    expect(MediaInput.describe(remote).join("\n")).toContain(
      "--image HTTPS-URL"
    );
    // A changed upstream reference rule cannot inherit local support from its model name.
    const changed = structuredClone(reference);
    const props = changed.input_schema.properties as {
      references: { items: { "x-grida-url": { schemes: string[] } } };
    };
    props.references.items["x-grida-url"].schemes = ["https"];
    expect(MediaInput.localImageFlags(changed)).toEqual([]);
    expect(MediaInput.describe(changed).join("\n")).toContain(
      "--reference HTTPS-URL"
    );
  });
});
