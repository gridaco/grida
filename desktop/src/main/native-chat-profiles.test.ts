import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  bundledModelCatalogue,
  catalog,
  ChatModels,
} from "@grida/ai/catalogue";
import { CHATGPT_SUBSCRIPTION_RETIRED_MODEL_IDS } from "@grida/ai-host";
import { NativeChatProfiles } from "./native-chat-profiles";

const seed = bundledModelCatalogue();
const selectors = Object.keys(seed.agents["openai-codex"] ?? {});
const offered = ChatModels.list(seed, { provider: "chatgpt", selectors });

describe("NativeChatProfiles image eligibility", () => {
  it("keeps the gateway adapter on its supported image route", () => {
    expect(NativeChatProfiles.gatewayImageInput("openai/gpt-5.6-sol")).toBe(
      true
    );
    expect(NativeChatProfiles.gatewayImageInput("openai/gpt-6.1-sol")).toBe(
      false
    );
  });
});

describe("NativeChatProfiles subscription identity", () => {
  it("uses the account offer order and binds each receipt to its sign-in", () => {
    const ordered = ChatModels.list(seed, {
      provider: "chatgpt",
      selectors: ["gpt-6.2-astra", "unknown", "gpt-6.2-sol"],
    });
    const choices = NativeChatProfiles.subscriptionChoices(
      "a".repeat(64),
      ordered
    );
    expect(choices.map(({ model }) => model)).toEqual([
      "GPT-6.2 Astra",
      "GPT-6.2 Sol",
    ]);
    for (const choice of choices) {
      expect(choice).toMatchObject({
        contextWindow: 1_050_000,
        imageInput: true,
        reasoning: true,
        connection: "ChatGPT Subscription",
        providerId: "chatgpt",
      });
      expect(choice.id).toBe(
        NativeChatProfiles.subscriptionBinding("a".repeat(64), choice.modelId)
      );
      expect(choice.id).not.toBe(
        NativeChatProfiles.subscriptionBinding("b".repeat(64), choice.modelId)
      );
    }
  });

  it.runIf(process.platform !== "win32")(
    "keeps mixed active and retired saved selections readable without offering retired execution",
    async () => {
      const directory = await fs.mkdtemp(
        path.join(await fs.realpath(os.tmpdir()), "grida-saved-subscription-")
      );
      try {
        const scope = "a".repeat(64);
        const choices = NativeChatProfiles.subscriptionChoices(
          scope,
          offered
        ).map(({ id, model, modelId, connection, providerId }) => ({
          id,
          model,
          modelId,
          connection,
          providerId,
        }));
        const entries = [
          choices.find(({ modelId }) => modelId === "openai/gpt-5.6-sol")!,
          ...CHATGPT_SUBSCRIPTION_RETIRED_MODEL_IDS.map((modelId) => ({
            id: NativeChatProfiles.subscriptionBinding(scope, modelId),
            providerId: "chatgpt",
            modelId,
            connection: "ChatGPT Subscription",
            model: modelId.replace(/^openai\/gpt-/, "GPT-"),
          })),
        ];
        const filename = path.join(directory, "chat-profiles.json");
        await fs.writeFile(filename, JSON.stringify(entries), { mode: 0o600 });
        expect(await NativeChatProfiles.read(directory)).toEqual(entries);
        expect(choices.map(({ id }) => id)).toContain(entries[0].id);
        for (const retired of entries.slice(1))
          expect(choices.map(({ id }) => id)).not.toContain(retired.id);
        await NativeChatProfiles.remember(directory, choices[0], () => {});
        expect(await NativeChatProfiles.read(directory)).toEqual([
          ...entries,
          choices[0],
        ]);
        await fs.writeFile(
          filename,
          JSON.stringify([
            ...entries,
            {
              ...entries[0],
              id: "f".repeat(64),
              modelId: "openai/invalid model",
            },
          ])
        );
        await expect(NativeChatProfiles.read(directory)).rejects.toThrow(
          "native_chat_profiles_invalid"
        );
      } finally {
        await fs.rm(directory, { recursive: true, force: true });
      }
    }
  );
});

describe("NativeChatProfiles.outputLimit", () => {
  it("gives an own-key launch the model's catalogue output limit, bounded by the agent", () => {
    const entry = catalog.text.catalog["openai/gpt-6.1-terra"];
    expect(entry.outputLimit).toBeGreaterThan(65_536);
    // A long reply, such as a large file in one tool call, is not cut off at
    // a small fixed allowance.
    expect(NativeChatProfiles.outputLimit("openai/gpt-6.1-terra")).toBe(65_536);
    const models = Object.values(catalog.text.catalog);
    expect(models.map(({ id }) => NativeChatProfiles.outputLimit(id))).toEqual(
      models.map(({ outputLimit }) =>
        outputLimit > 0 ? Math.min(outputLimit, 65_536) : undefined
      )
    );
  });

  it("keeps the agent default for a model the catalogue does not list", () => {
    expect(NativeChatProfiles.outputLimit("fixture")).toBeUndefined();
  });
});
