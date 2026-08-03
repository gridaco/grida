import { describe, expect, it } from "vitest";
import { LocalGltfBundle } from "./local-gltf-bundle";

describe("LocalGltfBundle.open", () => {
  it("marks GLB stable and JSON glTF experimental", () => {
    const glb = LocalGltfBundle.open([file("ship.glb", minimalGlb())]);
    const gltf = LocalGltfBundle.open([
      file("ship.gltf", JSON.stringify({ asset: { version: "2.0" } })),
    ]);

    expect(glb.entry).toMatchObject({
      virtualPath: "ship.glb",
      format: "glb",
      stability: "stable",
    });
    expect(gltf.entry).toMatchObject({
      virtualPath: "ship.gltf",
      format: "gltf",
      stability: "experimental",
    });
  });

  it("requires exactly one entry", () => {
    expect(() => LocalGltfBundle.open([file("mesh.bin", [0])])).toThrow(
      "does not contain"
    );
    expect(() =>
      LocalGltfBundle.open([
        file("a.glb", minimalGlb()),
        file("b.gltf", JSON.stringify({ asset: { version: "2.0" } })),
      ])
    ).toThrow("exactly one");
  });

  it("rejects duplicate and oversized selections before reading", () => {
    expect(() =>
      LocalGltfBundle.open([
        file("bundle/model.glb", minimalGlb()),
        file("bundle/model.glb", minimalGlb()),
      ])
    ).toThrow("duplicate path");

    const oversized = {
      name: "model.glb",
      webkitRelativePath: "",
      size: LocalGltfBundle.LIMITS.maxInputBytes + 1,
    } as File;
    expect(() => LocalGltfBundle.open([oversized])).toThrow("256 MiB");
  });
});

describe("LocalGltfBundle.resolve", () => {
  const bundle = LocalGltfBundle.open([
    file("asset/model.gltf", JSON.stringify({ asset: { version: "2.0" } })),
    file("asset/textures/albedo map.png", [1], "image/png"),
  ]);

  it("maps relative, percent-encoded sidecars within the selected bundle", () => {
    expect(bundle.resolve("./textures/albedo%20map.png").name).toBe(
      "albedo map.png"
    );
  });

  it("recovers one uniquely named sidecar when a file picker flattens paths", () => {
    const flattened = LocalGltfBundle.open([
      file("model.gltf", JSON.stringify({ asset: { version: "2.0" } })),
      file("albedo.png", [1], "image/png"),
    ]);

    expect(flattened.resolve("textures/albedo.png").name).toBe("albedo.png");
  });

  it("rejects an ambiguous flattened sidecar name", () => {
    const ambiguous = LocalGltfBundle.open([
      file("model.gltf", JSON.stringify({ asset: { version: "2.0" } })),
      file("first/albedo.png", [1], "image/png"),
      file("second/albedo.png", [2], "image/png"),
    ]);

    expect(() => ambiguous.resolve("textures/albedo.png")).toThrow("ambiguous");
  });

  it.each([
    "../secret.bin",
    "%2e%2e/secret.bin",
    "http://example.com/mesh.bin",
    "https://example.com/mesh.bin",
    "//example.com/mesh.bin",
    "file:///tmp/mesh.bin",
    "/absolute/mesh.bin",
    "textures%2falbedo.png",
  ])("rejects unsafe URI %s", (uri) => {
    expect(() => bundle.resolve(uri)).toThrow();
  });

  it("reports a missing local sidecar", () => {
    expect(() => bundle.resolve("mesh.bin")).toThrow("missing local resource");
  });
});

describe("LocalGltfBundle.read", () => {
  it("keeps a self-contained GLB byte-for-byte", async () => {
    const source = minimalGlb();
    const prepared = await LocalGltfBundle.open([
      file("model.glb", source),
    ]).read();

    expect(new Uint8Array(prepared)).toEqual(source);
  });

  it("folds JSON glTF buffers and images into a self-contained GLB", async () => {
    const document = {
      asset: { version: "2.0" },
      buffers: [{ uri: "mesh.bin", byteLength: 4 }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 4 }],
      images: [{ uri: "textures/albedo.png" }],
    };
    const prepared = await LocalGltfBundle.open([
      file("asset/model.gltf", JSON.stringify(document)),
      file("asset/mesh.bin", [1, 2, 3, 4]),
      file(
        "asset/textures/albedo.png",
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
        "image/png"
      ),
    ]).read();
    const parsed = inspectGlb(new Uint8Array(prepared));

    expect(parsed.document.buffers).toEqual([{ byteLength: 12 }]);
    expect(parsed.document.bufferViews).toEqual([
      { buffer: 0, byteOffset: 0, byteLength: 4 },
      { buffer: 0, byteOffset: 4, byteLength: 8 },
    ]);
    expect(parsed.document.images).toEqual([
      { bufferView: 1, mimeType: "image/png" },
    ]);
    expect([...parsed.binary]).toEqual([
      1, 2, 3, 4, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
  });

  it("decodes data buffers without asking Three to fetch them", async () => {
    const document = {
      asset: { version: "2.0" },
      buffers: [
        {
          uri: "data:application/octet-stream;base64,AQIDBA==",
          byteLength: 4,
        },
      ],
      bufferViews: [{ buffer: 0, byteLength: 4 }],
    };
    const prepared = await LocalGltfBundle.open([
      file("model.gltf", JSON.stringify(document)),
    ]).read();

    expect([...inspectGlb(new Uint8Array(prepared)).binary]).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it("validates data images embedded in GLB JSON", async () => {
    const source = encodeTestGlb({
      asset: { version: "2.0" },
      images: [{ uri: "data:image/svg+xml,%3Csvg%2F%3E" }],
    });

    await expect(
      LocalGltfBundle.open([file("model.glb", source)]).read()
    ).rejects.toThrow("must be PNG, JPEG, WebP, or AVIF");
  });

  it("rejects remote, traversing, missing, and unsupported image resources", async () => {
    const cases = [
      {
        document: {
          asset: { version: "2.0" },
          buffers: [{ uri: "https://example.com/mesh.bin", byteLength: 4 }],
        },
        files: [],
      },
      {
        document: {
          asset: { version: "2.0" },
          buffers: [{ uri: "../mesh.bin", byteLength: 4 }],
        },
        files: [file("mesh.bin", [1, 2, 3, 4])],
      },
      {
        document: {
          asset: { version: "2.0" },
          buffers: [{ uri: "mesh.bin", byteLength: 4 }],
        },
        files: [],
      },
      {
        document: {
          asset: { version: "2.0" },
          images: [{ uri: "texture.svg" }],
        },
        files: [file("texture.svg", "<svg/>", "image/svg+xml")],
      },
    ];

    for (const { document, files } of cases) {
      const bundle = LocalGltfBundle.open([
        file("model.gltf", JSON.stringify(document)),
        ...files,
      ]);
      await expect(bundle.read()).rejects.toThrow();
    }
  });

  it("rejects malformed GLB and non-2.0 JSON glTF", async () => {
    await expect(
      LocalGltfBundle.open([file("bad.glb", new Uint8Array(20))]).read()
    ).rejects.toThrow("magic");
    await expect(
      LocalGltfBundle.open([
        file("old.gltf", JSON.stringify({ asset: { version: "1.0" } })),
      ]).read()
    ).rejects.toThrow("glTF 2.0");
  });

  it("fails closed on required extensions that need optional decoders", async () => {
    for (const extension of [
      "KHR_draco_mesh_compression",
      "KHR_texture_basisu",
      "EXT_meshopt_compression",
      "ACME_unknown_extension",
    ]) {
      const bundle = LocalGltfBundle.open([
        file(
          "model.gltf",
          JSON.stringify({
            asset: { version: "2.0" },
            extensionsRequired: [extension],
          })
        ),
      ]);
      await expect(bundle.read()).rejects.toThrow(
        `Required glTF extension not enabled: ${extension}`
      );
    }
  });

  it("accepts required extensions handled by the decoder-free viewer", async () => {
    const prepared = await LocalGltfBundle.open([
      file(
        "model.gltf",
        JSON.stringify({
          asset: { version: "2.0" },
          extensionsRequired: ["KHR_materials_unlit"],
        })
      ),
    ]).read();

    expect(inspectGlb(new Uint8Array(prepared)).document).toMatchObject({
      extensionsRequired: ["KHR_materials_unlit"],
    });
  });
});

function file(
  virtualPath: string,
  data: string | Uint8Array | readonly number[],
  type = ""
): File {
  const name = virtualPath.split("/").at(-1) ?? virtualPath;
  let contents: BlobPart;
  if (typeof data === "string") {
    contents = data;
  } else {
    const copy = new Uint8Array(new ArrayBuffer(data.length));
    copy.set(data);
    contents = copy.buffer;
  }
  const result = new File([contents], name, { type });
  Object.defineProperty(result, "webkitRelativePath", {
    configurable: true,
    value: virtualPath.includes("/") ? virtualPath : "",
  });
  return result;
}

function minimalGlb(): Uint8Array {
  return encodeTestGlb({ asset: { version: "2.0" } });
}

function encodeTestGlb(document: object): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(document));
  const jsonLength = (json.byteLength + 3) & ~3;
  const output = new Uint8Array(20 + jsonLength);
  const view = new DataView(output.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, output.byteLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  output.fill(0x20, 20);
  output.set(json, 20);
  return output;
}

function inspectGlb(bytes: Uint8Array): Readonly<{
  document: Record<string, unknown>;
  binary: Uint8Array;
}> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const document = JSON.parse(
    new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)).trimEnd()
  ) as Record<string, unknown>;
  const binaryHeader = 20 + jsonLength;
  if (binaryHeader + 8 > bytes.byteLength) {
    return { document, binary: new Uint8Array() };
  }
  const binaryLength = view.getUint32(binaryHeader, true);
  return {
    document,
    binary: bytes.subarray(binaryHeader + 8, binaryHeader + 8 + binaryLength),
  };
}
