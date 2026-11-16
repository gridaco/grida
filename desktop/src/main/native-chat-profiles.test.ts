import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { catalog } from "@grida/ai/catalogue";
import {
  CHATGPT_SUBSCRIPTION_DEFAULT_MODEL_ID,
  CHATGPT_SUBSCRIPTION_MODEL_IDS,
  CHATGPT_SUBSCRIPTION_RETIRED_MODEL_IDS,
  GG_PROVIDER_ID,
} from "@grida/ai-host";
import { NativeChatProfiles } from "./native-chat-profiles";

describe("NativeChatProfiles image eligibility", () => {
  it("intersects exact canonical input facts with the implemented native routes", async () => {
    const generated = JSON.parse(
      await fs.readFile(
        new URL(
          "../../../crates/grida-agent/data/openrouter-png-models.json",
          import.meta.url
        ),
        "utf8"
      )
    ) as { models: string[] };
    const choices = catalog.text.listed_models().map((model) => model.id);
    expect(
      choices
        .filter((model) => NativeChatProfiles.imageInput("openrouter", model))
        .sort()
    ).toEqual([...generated.models].sort());
    const responses = JSON.parse(
      await fs.readFile(
        new URL(
          "../../../crates/grida-agent/data/responses-png-models.json",
          import.meta.url
        ),
        "utf8"
      )
    ) as { models: string[] };
    for (const model of CHATGPT_SUBSCRIPTION_MODEL_IDS) {
      expect(NativeChatProfiles.imageInput("chatgpt", model)).toBe(
        responses.models.includes(model.replace(/^openai\//, ""))
      );
      expect(NativeChatProfiles.imageInput("vercel", model)).toBe(false);
      expect(NativeChatProfiles.imageInput("local-endpoint", model)).toBe(
        false
      );
    }
    expect(
      NativeChatProfiles.imageInput(GG_PROVIDER_ID, "openai/gpt-5.6-sol")
    ).toBe(true);
    expect(
      NativeChatProfiles.imageInput(GG_PROVIDER_ID, "openai/gpt-6.1-sol")
    ).toBe(false);
    expect(NativeChatProfiles.imageInput("openrouter", "unknown/model")).toBe(
      false
    );
  });
});

describe("NativeChatProfiles subscription identity", () => {
  it("offers only supported subscription models under the captured OAuth connection", () => {
    const choices = NativeChatProfiles.subscriptionChoices("a".repeat(64));
    expect(
      choices.map(({ providerId, modelId, connection }) => ({
        providerId,
        modelId,
        connection,
      }))
    ).toEqual(
      CHATGPT_SUBSCRIPTION_MODEL_IDS.map((modelId) => ({
        providerId: "chatgpt",
        modelId,
        connection: "ChatGPT Subscription",
      }))
    );
    expect(new Set(choices.map(({ id }) => id)).size).toBe(choices.length);
    expect(
      choices.every(
        ({ id, model }) => NativeChatProfiles.validId(id) && model.length > 0
      )
    ).toBe(true);
    expect(
      NativeChatProfiles.subscriptionChoices("b".repeat(64)).map(({ id }) => id)
    ).not.toEqual(choices.map(({ id }) => id));
    expect(NativeChatProfiles.subscriptionChoices("a".repeat(64))).toEqual(
      choices
    );
    expect(choices[0].modelId).toBe(CHATGPT_SUBSCRIPTION_DEFAULT_MODEL_ID);
    expect(choices.map(({ model }) => model)).toEqual([
      "GPT-6.1 Sol",
      "GPT-6 Astra",
      "GPT-6.1 Terra",
      "GPT-6 Luna",
      "GPT-6 Sol",
      "GPT-5.6 Sol",
      "GPT-5.6 Terra",
      "GPT-5.6 Luna",
    ]);
  });

  it.runIf(process.platform !== "win32")(
    "keeps mixed active and retired saved selections readable without offering retired execution",
    async () => {
      const directory = await fs.mkdtemp(
        path.join(await fs.realpath(os.tmpdir()), "grida-saved-subscription-")
      );
      try {
        const scope = "a".repeat(64);
        const choices = NativeChatProfiles.subscriptionChoices(scope);
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
            { ...entries[0], id: "f".repeat(64), modelId: "openai/unreviewed" },
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
