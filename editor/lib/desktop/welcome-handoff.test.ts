import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { welcome_handoff } from "./welcome-handoff";

class MemoryStorage {
  readonly #values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.#values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.#values.set(key, value);
  }

  removeItem(key: string): void {
    this.#values.delete(key);
  }
}

describe("welcome_handoff", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    vi.stubGlobal("window", { sessionStorage: storage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips a valid provider-aware handoff", () => {
    welcome_handoff.set("workspace-a", {
      prompt: "Make a launch deck",
      model_id: "openai/gpt-5.6-sol",
      provider_id: "chatgpt",
    });

    expect(welcome_handoff.peek("workspace-a")).toEqual({
      prompt: "Make a launch deck",
      model_id: "openai/gpt-5.6-sol",
      provider_id: "chatgpt",
    });
  });

  it("accepts a handoff without a provider", () => {
    welcome_handoff.set("workspace-a", {
      prompt: "Make a launch deck",
      model_id: "openai/gpt-5.6-sol",
    });

    expect(welcome_handoff.peek("workspace-a")).toEqual({
      prompt: "Make a launch deck",
      model_id: "openai/gpt-5.6-sol",
    });
  });

  it("rejects a persisted non-string provider identifier", () => {
    storage.setItem(
      "grida.welcome.pendingPrompt.workspace-a",
      JSON.stringify({
        prompt: "Make a launch deck",
        model_id: "openai/gpt-5.6-sol",
        provider_id: { id: "chatgpt" },
      })
    );

    expect(welcome_handoff.peek("workspace-a")).toBeNull();
  });
});
