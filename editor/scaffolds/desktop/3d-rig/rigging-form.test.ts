import { describe, expect, it } from "vitest";
import { RiggingForm } from "./rigging-form";

function glb(json: object): File {
  const text = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = Math.ceil(text.length / 4) * 4;
  const bytes = new Uint8Array(20 + jsonLength);
  bytes.fill(32, 20);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.length, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.set(text, 20);
  return new File([bytes], "source.glb", { type: "model/gltf-binary" });
}

describe("RiggingForm", () => {
  // GRIDA-GG: desktop — explicit funding preserves compatible model and mesh input.
  it("keeps the checked GLB and skeleton options when selecting Grida credits", () => {
    const mesh = { data: "AAAA", media_type: "model/gltf-binary" } as const;
    const direct = RiggingForm.request(
      "tripo/rig-v1.0",
      mesh,
      "biped",
      "mixamo"
    );
    const hosted = RiggingForm.request(
      "tripo/rig-v1.0",
      mesh,
      "biped",
      "mixamo",
      "gg"
    );
    expect(hosted).toEqual({ ...direct, provider: "gg" });
    expect(hosted.input.mesh).toBe(mesh);
  });
  it("admits a self-contained GLB as inline mesh bytes", async () => {
    const mesh = await RiggingForm.mesh(
      glb({ asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [] }] })
    );
    expect(mesh.media_type).toBe("model/gltf-binary");
    expect(atob(mesh.data).slice(0, 4)).toBe("glTF");
  });

  it("rejects empty, invalid, and oversized source files before upload", async () => {
    await expect(RiggingForm.mesh(new File([], "empty.glb"))).rejects.toThrow(
      "empty"
    );
    await expect(
      RiggingForm.mesh(new File(["not a model"], "invalid.glb"))
    ).rejects.toThrow();
    await expect(
      RiggingForm.mesh(new File(["not a model"], "source.obj"))
    ).rejects.toThrow("GLB");
    const oversized = new File(["x"], "large.glb");
    Object.defineProperty(oversized, "size", {
      value: RiggingForm.maxMeshBytes + 1,
    });
    await expect(RiggingForm.mesh(oversized)).rejects.toThrow("60 MB");
  });

  it("rejects external model dependencies before provider upload", async () => {
    await expect(
      RiggingForm.mesh(
        glb({
          asset: { version: "2.0" },
          buffers: [{ uri: "https://example.com/private.bin", byteLength: 4 }],
        })
      )
    ).rejects.toThrow();
  });

  it("selects only models compatible with the detected skeleton", () => {
    expect(
      RiggingForm.compatibleModels("biped").map((model) => model.id)
    ).toEqual(["tripo/rig-v1.0"]);
    expect(
      RiggingForm.compatibleModels("quadruped").map((model) => model.id)
    ).toEqual(["tripo/rig-v2.5"]);
  });

  it("preserves bone naming and refuses mismatched body types", () => {
    const mesh = { data: "AAAA", media_type: "model/gltf-binary" } as const;
    expect(
      RiggingForm.request("tripo/rig-v1.0", mesh, "biped", "mixamo").input.spec
    ).toBe("mixamo");
    expect(() =>
      RiggingForm.request("tripo/rig-v1.0", mesh, "quadruped", "tripo")
    ).toThrow("compatible");
    expect(() =>
      RiggingForm.request("tripo/rig-v2.5", mesh, "biped", "tripo")
    ).toThrow("compatible");
  });
});
