import { describe, expect, it } from "vitest";
import type { EndpointProviderConfig } from "@grida/agent";
import { registered_models } from "./registered-models";

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
      "gg"
    );
    expect(resolved?.label).toBe("GPT-5.6 Luna");
    expect(resolved?.imageInputMimes).toContain("image/jpeg");
  });

  it("still resolves the static catalog when no endpoint owns the id", () => {
    expect(registered_models.resolve("openai/gpt-5.6-luna", [])).toMatchObject({
      label: "GPT-5.6 Luna",
    });
  });
});
