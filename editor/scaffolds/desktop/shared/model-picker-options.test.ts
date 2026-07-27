import {
  CHATGPT_PROVIDER_ID,
  CHATGPT_SUBSCRIPTION_MODEL_IDS,
  GG_PROVIDER_ID,
} from "@grida/agent";
import _models from "@grida/ai-models";
import { describe, expect, it } from "vitest";
import {
  model_picker_options,
  type ModelPickerSelection,
} from "./model-picker-options";

describe("model_picker_options", () => {
  it("builds the ChatGPT Subscription group from the exact allowlist", () => {
    const group = model_picker_options.chatGpt();

    expect(group.label).toBe("ChatGPT Subscription");
    expect(group.options.map((option) => option.selection.model_id)).toEqual(
      CHATGPT_SUBSCRIPTION_MODEL_IDS
    );
    expect(
      group.options.every(
        (option) => option.selection.provider_id === CHATGPT_PROVIDER_ID
      )
    ).toBe(true);
  });

  it("orders provider-owned groups and keeps every row tuple explicit", () => {
    const groups = model_picker_options.groups({
      chatGptReady: true,
      configuredByokProviderIds: ["vercel", "openrouter"],
      endpoints: [
        {
          id: "custom",
          label: "Custom",
          base_url: "https://example.com/v1",
          models: [{ id: "custom/model" }],
        },
        {
          id: "ollama",
          label: "Ollama",
          base_url: "http://localhost:11434/v1",
          models: [{ id: "llama3.3" }],
        },
      ],
    });

    expect(groups.map((group) => group.id)).toEqual([
      CHATGPT_PROVIDER_ID,
      GG_PROVIDER_ID,
      "openrouter",
      "vercel",
      "ollama",
      "custom",
    ]);
    for (const group of groups) {
      expect(
        group.options.every(
          (option) => option.selection.provider_id === group.id
        )
      ).toBe(true);
    }
  });

  it("always exposes the full Grida credit-backed catalog", () => {
    const grida = model_picker_options.grida();
    const catalogIds = Object.keys(_models.text.catalog);

    expect(grida.label).toBe("Grida");
    expect(grida.options.map((option) => option.selection.model_id)).toEqual(
      catalogIds
    );
    expect(
      grida.options.every(
        (option) => option.selection.provider_id === GG_PROVIDER_ID
      )
    ).toBe(true);
  });

  it("shows only ready subscription and configured non-Grida providers", () => {
    const signedOut = model_picker_options.groups({
      chatGptReady: false,
      configuredByokProviderIds: [],
      endpoints: [
        {
          id: "empty",
          base_url: "https://example.com/v1",
          models: [],
        },
      ],
    });

    expect(signedOut.map((group) => group.id)).toEqual([GG_PROVIDER_ID]);
  });

  it("keeps the subscription allowlist distinct from the hosted catalog", () => {
    const subscriptionIds = model_picker_options
      .chatGpt()
      .options.map((option) => option.selection.model_id);
    const gridaIds = model_picker_options
      .grida()
      .options.map((option) => option.selection.model_id);

    expect(subscriptionIds).toContain("openai/gpt-5.4");
    expect(subscriptionIds).not.toContain("openai/gpt-5.4-nano");
    expect(gridaIds).not.toContain("openai/gpt-5.4");
    expect(gridaIds).toContain("openai/gpt-5.4-nano");
  });

  it("labels subscription-only models and compares provider/model tuples", () => {
    const chatGpt: ModelPickerSelection = {
      provider_id: "chatgpt",
      model_id: "openai/gpt-5.4",
    };
    const byok: ModelPickerSelection = {
      provider_id: "openrouter",
      model_id: "openai/gpt-5.4",
    };

    expect(model_picker_options.label(chatGpt, [])).toBe("GPT-5.4");
    expect(model_picker_options.selected(chatGpt, chatGpt)).toBe(true);
    expect(model_picker_options.selected(byok, chatGpt)).toBe(false);
    expect(
      model_picker_options.selected(byok, {
        provider_id: GG_PROVIDER_ID,
        model_id: byok.model_id,
      })
    ).toBe(false);
  });
});
