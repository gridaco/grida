import { describe, expect, it, vi } from "vitest";
import { ModelGenerationForm } from "./model-generation-form";

const image = () =>
  new File([new Uint8Array([1, 2, 3])], "reference.png", { type: "image/png" });
const draft = () => ({
  modelId: "tripo/h3.1" as ModelGenerationForm.ModelId,
  variant: "text" as ModelGenerationForm.Variant,
  prompt: "  A brass robot  ",
  images: {} as Partial<Record<ModelGenerationForm.View, File>>,
  settings: { ...ModelGenerationForm.defaults },
});

describe("ModelGenerationForm", () => {
  it("makes one explicit model-generation request with normalized text", async () => {
    expect(await ModelGenerationForm.request(draft())).toEqual({
      model_id: "tripo/h3.1",
      provider: "tripo",
      variant: "text",
      input: {
        prompt: "A brass robot",
        texture: true,
        pbr: true,
        texture_quality: "standard",
        geometry_quality: "standard",
      },
    });
  });

  it.each(["tripo/p1", "tripo/p2"] as const)(
    "omits unsupported geometry controls for %s",
    async (modelId) => {
      const input = draft();
      input.modelId = modelId;
      input.settings.geometry_quality = "detailed";
      const request = await ModelGenerationForm.request(input);
      expect(request.input).not.toHaveProperty("geometry_quality");
    }
  );

  it("does not send texture quality or enabled PBR when texture is off", async () => {
    const input = draft();
    input.settings.texture = false;
    const request = await ModelGenerationForm.request(input);
    expect(request.input).toMatchObject({ texture: false, pbr: false });
    expect(request.input).not.toHaveProperty("texture_quality");
  });

  it("encodes one image with data field and excludes stale prompt/other views", async () => {
    const input = draft();
    input.variant = "image";
    input.images = { front: image(), right: image() };
    expect((await ModelGenerationForm.request(input)).input).toMatchObject({
      image: { data: "AQID", media_type: "image/png" },
    });
    expect((await ModelGenerationForm.request(input)).input).not.toHaveProperty(
      "prompt"
    );
    expect((await ModelGenerationForm.request(input)).input).not.toHaveProperty(
      "images"
    );
  });

  it("keeps named multiview positions, without filling absent views", async () => {
    const input = draft();
    input.variant = "multiview";
    input.images = { front: image(), right: image() };
    const request = await ModelGenerationForm.request(input);
    expect(request.input).toHaveProperty("images", {
      front: { data: "AQID", media_type: "image/png" },
      right: { data: "AQID", media_type: "image/png" },
    });
    expect(request.input).not.toHaveProperty("prompt");
  });

  it("requires front plus another view before reading image bytes", async () => {
    const file = image();
    const read = vi.spyOn(file, "arrayBuffer");
    const input = draft();
    input.variant = "multiview";
    input.images = { front: file };
    await expect(ModelGenerationForm.request(input)).rejects.toThrow(
      "at least one"
    );
    input.images = { left: file };
    await expect(ModelGenerationForm.request(input)).rejects.toThrow(
      "front view"
    );
    expect(read).not.toHaveBeenCalled();
  });

  it("validates every view before loading any image", async () => {
    const file = image();
    const read = vi.spyOn(file, "arrayBuffer");
    const input = draft();
    input.variant = "multiview";
    input.images = {
      front: file,
      back: new File(["x"], "bad.webp", { type: "image/webp" }),
    };
    await expect(ModelGenerationForm.request(input)).rejects.toThrow(
      "PNG or JPEG"
    );
    expect(read).not.toHaveBeenCalled();
  });

  it("rejects empty and oversized reference images", () => {
    expect(() =>
      ModelGenerationForm.validateImage(
        new File([], "empty.png", { type: "image/png" })
      )
    ).toThrow("empty");
    expect(() =>
      ModelGenerationForm.validateImage(
        new File(
          [new Uint8Array(ModelGenerationForm.maxImageBytes + 1)],
          "large.jpg",
          { type: "image/jpeg" }
        )
      )
    ).toThrow("8 MiB");
  });

  it("honors model and geometry-specific face bounds", async () => {
    const input = draft();
    input.settings.face_limit = "1500001";
    await expect(ModelGenerationForm.request(input)).rejects.toThrow(
      "Face limit"
    );
    input.settings.geometry_quality = "detailed";
    expect((await ModelGenerationForm.request(input)).input).toHaveProperty(
      "face_limit",
      1500001
    );
    input.modelId = "tripo/p1";
    input.settings.face_limit = "49";
    await expect(ModelGenerationForm.request(input)).rejects.toThrow(
      "Face limit"
    );
  });

  it("preserves seed zero and rejects malformed integer controls", async () => {
    const input = draft();
    input.settings.seed = "0";
    expect((await ModelGenerationForm.request(input)).input).toHaveProperty(
      "seed",
      0
    );
    input.settings.seed = "NaN";
    await expect(ModelGenerationForm.request(input)).rejects.toThrow(
      "whole number"
    );
    input.settings.seed = "";
    input.settings.face_limit = "3.5";
    await expect(ModelGenerationForm.request(input)).rejects.toThrow(
      "whole number"
    );
  });

  it("bounds text by Unicode characters", async () => {
    const input = draft();
    input.prompt = "🪑".repeat(1024);
    await expect(ModelGenerationForm.request(input)).resolves.toHaveProperty(
      "variant",
      "text"
    );
    input.prompt += "x";
    await expect(ModelGenerationForm.request(input)).rejects.toThrow("1,024");
  });

  it("estimates each selected operation and option from its catalogue pricing", () => {
    expect(
      ModelGenerationForm.estimatedCredits(
        "tripo/h3.1",
        "text",
        ModelGenerationForm.defaults
      )
    ).toBe(20);
    expect(
      ModelGenerationForm.estimatedCredits("tripo/h3.1", "multiview", {
        ...ModelGenerationForm.defaults,
        geometry_quality: "detailed",
        texture_quality: "extreme",
      })
    ).toBe(70);
    expect(
      ModelGenerationForm.estimatedCredits("tripo/p2", "image", {
        ...ModelGenerationForm.defaults,
        texture: false,
      })
    ).toBe(100);
  });
});
