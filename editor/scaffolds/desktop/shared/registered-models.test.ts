import { describe, expect, it } from "vitest";
import type { EndpointProviderConfig } from "@grida/agent";
import type { CurrentGGModel } from "@/lib/desktop/gg-models";
import { registered_models } from "./registered-models";

const currentGG: CurrentGGModel = {
  id: "openai/gpt-5.6-luna",
  label: "GPT-5.6 Luna",
  kind: "text",
  created: 0,
  owned_by: "openai",
  interfaces: ["chat.completions"],
  input_modalities: ["text", "image"],
  output_modalities: ["text"],
  operation_ids: [],
  capabilities: { image_input: true, tools: true },
  limits: { context_tokens: 200_000, max_output_tokens: 8_192 },
};

const endpoint: EndpointProviderConfig = {
  id: "endpoint-local",
  label: "Local",
  base_url: "http://127.0.0.1:11434/v1",
  models: [
    {
      id: "openai/gpt-5.6-luna",
      label: "Local collision",
      multimodal: false,
      overrides: { imageInputMimes: ["image/png"] },
    },
  ],
};

describe("registered_models", () => {
  it("resolves capabilities from the endpoint that a colliding id pins", () => {
    expect(
      registered_models.providerIdForModel("openai/gpt-5.6-luna", [endpoint])
    ).toBe("endpoint-local");
    expect(
      registered_models.resolve(
        "openai/gpt-5.6-luna",
        [endpoint],
        "endpoint-local"
      )
    ).toMatchObject({
      label: "Local collision",
      imageInputMimes: ["image/png"],
    });
  });

  it("does not leak endpoint capabilities into another explicit provider", () => {
    const resolved = registered_models.resolve(
      "openai/gpt-5.6-luna",
      [endpoint],
      "gg",
      [currentGG]
    );
    expect(resolved?.label).toBe("GPT-5.6 Luna");
    expect(resolved?.imageInputMimes).toContain("image/jpeg");
  });

  it("keeps known capabilities for a released host without discovery, never a colliding endpoint", () => {
    const native = registered_models.resolve(
      currentGG.id,
      [endpoint],
      "gg",
      null
    );
    expect(native?.label).toBe("GPT-5.6 Luna");
    expect(native?.imageInputMimes).toContain("image/jpeg");
    expect(
      registered_models.resolve("fixture/future-text", [endpoint], "gg", null)
    ).toBeUndefined();
  });

  it("withholds GG capabilities until discovery confirms the offering", () => {
    expect(
      registered_models.resolve(currentGG.id, [endpoint], "gg")
    ).toBeUndefined();
  });

  it("resolves new GG text IDs without manufacturing image MIME permissions", () => {
    const model = {
      ...currentGG,
      id: "fixture/future-text",
      label: "Future text",
    };
    expect(
      registered_models.resolve(model.id, [endpoint], "gg", [model])
    ).toMatchObject({
      label: "Future text",
      contextWindow: 200_000,
      outputLimit: 8_192,
      imageInputMimes: [],
    });
  });

  it("still resolves the static catalog when no endpoint owns the id", () => {
    expect(registered_models.resolve("openai/gpt-5.6-luna", [])).toMatchObject({
      label: "GPT-5.6 Luna",
    });
  });
});
