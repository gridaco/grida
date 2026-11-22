import { describe, expect, it } from "vitest";
import { ChatModels } from "../chat-models";
import { bundledModelCatalogue } from "../bundled-models";
import type { ModelCatalogueSnapshot } from "../public-models.mjs";

const seed = bundledModelCatalogue();
const canonical = "openai/new-catalogue-model";
const sample = seed.text["openai/gpt-6.2-sol"]!;
const key = seed.text["openai/gpt-5.6-sol"]!.bindings.openrouter!;
const release: ModelCatalogueSnapshot = {
  version: "2.20990102.1",
  text: {
    [canonical]: {
      ...sample,
      id: canonical,
      bindings: {
        openai: { ...sample.bindings.openai!, wireModel: "api-selector" },
        openrouter: { ...key, wireModel: "router-selector", outputLimit: 2048 },
      },
    },
  },
  agents: {
    "openai-codex": {
      "account-selector": {
        canonicalModelId: canonical,
        serviceTiers: { fast: "priority" },
      },
    },
  },
};

describe("foreground chat catalogue resolution", () => {
  it("resolves the same listed canonical model to each connection's own selector", () => {
    const connections: [ChatModels.Connection, string][] = [
      [
        {
          provider: "chatgpt",
          selectors: ["unknown", "account-selector", "account-selector"],
        },
        "account-selector",
      ],
      [{ provider: "openrouter" }, "router-selector"],
      [
        { provider: "openai", models: new Set(["api-selector"]) },
        "api-selector",
      ],
    ];
    for (const [connection, wireModel] of connections) {
      const binding = ChatModels.resolve(release, connection, canonical);
      expect(ChatModels.list(release, connection)).toEqual([binding]);
      expect(binding).toMatchObject({ modelId: canonical, wireModel });
    }
    expect(
      ChatModels.resolve(release, { provider: "openrouter" }, canonical)
        ?.maxOutputTokens
    ).toBe(2048);
    expect(ChatModels.list(release, { provider: "vercel" })).toEqual([]);
    expect(
      ChatModels.list(release, {
        provider: "chatgpt",
        selectors: ["api-selector"],
      })
    ).toEqual([]);
  });

  it("offers an OpenAI API model only when the project's list has its wire ID", () => {
    const connection = {
      provider: "openai",
      models: new Set([canonical, "account-selector", "unknown"]),
    } as const;
    expect(ChatModels.list(release, connection)).toEqual([]);
    expect(ChatModels.resolve(release, connection, canonical)).toBeUndefined();
    expect(
      ChatModels.resolve(
        seed,
        { provider: "openai", models: new Set(["gpt-6.2-sol"]) },
        sample.id
      )
    ).toMatchObject({
      modelId: sample.id,
      wireModel: "gpt-6.2-sol",
      imageInput: false,
      reasoning: true,
      speeds: [],
    });
  });

  it.each([{ streaming: undefined }, { streaming: false }, { tools: false }])(
    "requires explicit OpenAI streaming and function-tool support (%j)",
    (capabilities) => {
      const row = release.text[canonical]!;
      const incompatible = {
        ...release,
        text: {
          [canonical]: {
            ...row,
            bindings: {
              openai: { ...row.bindings.openai!, ...capabilities },
            },
          },
        },
      };
      const connection = {
        provider: "openai",
        models: new Set(["api-selector"]),
      } as const;
      expect(ChatModels.list(incompatible, connection)).toEqual([]);
      expect(
        ChatModels.resolve(incompatible, connection, canonical)
      ).toBeUndefined();
    }
  );

  it("reauthorizes the retained OpenAI wire ID without substituting the current catalogue selector", () => {
    const connection = { provider: "openai" } as const;
    const retained = { wireModel: "previous-api-selector", imageInput: false };
    expect(
      ChatModels.resume(release, connection, canonical, retained)
    ).toMatchObject({
      modelId: canonical,
      ...retained,
      speeds: [],
    });
    const other = "openai/another";
    const reassigned = {
      ...release,
      text: {
        ...release.text,
        [other]: {
          ...sample,
          id: other,
          bindings: {
            openai: {
              ...sample.bindings.openai!,
              wireModel: retained.wireModel,
            },
          },
        },
      },
    };
    expect(
      ChatModels.resume(reassigned, connection, canonical, retained)
    ).toBeUndefined();
    expect(
      ChatModels.resume(release, connection, canonical, {
        ...retained,
        imageInput: true,
      })
    ).toBeUndefined();
    expect(
      ChatModels.resume(release, connection, canonical, {
        ...retained,
        speed: "fast",
      })
    ).toBeUndefined();
  });

  it("keeps an accepted selector while its original connection is eligible and refuses a reassigned selector", () => {
    const byok = { provider: "openrouter" } as const;
    const retained = { wireModel: "router-old", imageInput: true };
    expect(ChatModels.resume(release, byok, canonical, retained)).toMatchObject(
      retained
    );
    const other = "vendor/another";
    const reassigned = {
      ...release,
      text: {
        ...release.text,
        [other]: {
          ...sample,
          id: other,
          bindings: { openrouter: { ...key, wireModel: retained.wireModel } },
        },
      },
    };
    expect(
      ChatModels.resume(reassigned, byok, canonical, retained)
    ).toBeUndefined();
    const subscription = {
      provider: "chatgpt",
      selectors: ["old", "account-selector"],
    } as const;
    const capture = {
      wireModel: "old",
      imageInput: true,
      speed: "fast",
    } as const;
    expect(
      ChatModels.resume(release, subscription, canonical, capture)
    ).toMatchObject({ wireModel: "old", imageInput: true, speeds: ["fast"] });
    expect(
      ChatModels.resume(
        release,
        { provider: "chatgpt", selectors: ["account-selector"] },
        canonical,
        capture
      )
    ).toBeUndefined();
    expect(
      ChatModels.resume(
        {
          ...release,
          agents: {
            "openai-codex": {
              ...release.agents["openai-codex"],
              old: { canonicalModelId: other, serviceTiers: {} },
            },
          },
        },
        subscription,
        canonical,
        capture
      )
    ).toBeUndefined();
  });
});
