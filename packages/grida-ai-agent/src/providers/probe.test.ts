import { describe, expect, it } from "vitest";
import { probeEndpointModels, type ProbeFetch } from "./probe";

/** Fake fetch keyed by URL; POSTs may key on `url body.model`. */
function fakeFetch(routes: Record<string, unknown>): ProbeFetch {
  return async (url, init) => {
    let key = url;
    if (init.method === "POST" && init.body) {
      const model = (JSON.parse(init.body) as { model?: string }).model;
      if (model && `${url} ${model}` in routes) key = `${url} ${model}`;
    }
    if (key in routes) {
      return new Response(JSON.stringify(routes[key]), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  };
}

const BASE = "http://localhost:11434/v1";

describe("probeEndpointModels", () => {
  it("reads Ollama /api/tags with capability mapping", async () => {
    const result = await probeEndpointModels(
      BASE,
      fakeFetch({
        "http://localhost:11434/api/tags": {
          models: [
            { name: "gemma4:31b-mlx", capabilities: ["completion", "tools"] },
            { name: "tinyllama:1b", capabilities: ["completion"] },
            { name: "old-model:7b" }, // older Ollama: no capabilities field
          ],
        },
      })
    );
    expect(result).toEqual({
      ok: true,
      source: "ollama",
      models: [
        { id: "gemma4:31b-mlx", tool_call: true },
        { id: "tinyllama:1b", tool_call: false },
        { id: "old-model:7b", tool_call: undefined },
      ],
    });
  });

  it("fills the context window — loaded allocation beats the model max", async () => {
    const result = await probeEndpointModels(
      BASE,
      fakeFetch({
        "http://localhost:11434/api/tags": {
          models: [
            { name: "loaded:31b", capabilities: ["tools"] },
            { name: "cold:7b", capabilities: ["tools"] },
            { name: "opaque:1b", capabilities: ["tools"] },
          ],
        },
        // `loaded:31b` is running with a capped allocation — /api/ps is
        // the server's truth and must win over the /api/show maximum.
        "http://localhost:11434/api/ps": {
          models: [{ name: "loaded:31b", context_length: 32_768 }],
        },
        "http://localhost:11434/api/show loaded:31b": {
          model_info: { "gemma4.context_length": 262_144 },
        },
        "http://localhost:11434/api/show cold:7b": {
          model_info: { "llama.context_length": 131_072 },
        },
        // `opaque:1b`: /api/show 404s → contextWindow stays unset.
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const byId = new Map(result.models.map((m) => [m.id, m.contextWindow]));
    expect(byId.get("loaded:31b")).toBe(32_768);
    expect(byId.get("cold:7b")).toBe(131_072);
    expect(byId.get("opaque:1b")).toBeUndefined();
  });

  it("falls back to the OpenAI /models listing (ids only)", async () => {
    const result = await probeEndpointModels(
      "http://localhost:4000/v1",
      fakeFetch({
        "http://localhost:4000/v1/models": {
          object: "list",
          data: [{ id: "gpt-proxy-a" }, { id: "gpt-proxy-b" }],
        },
      })
    );
    expect(result).toEqual({
      ok: true,
      source: "openai",
      models: [{ id: "gpt-proxy-a" }, { id: "gpt-proxy-b" }],
    });
  });

  it("reports unreachable endpoints without throwing", async () => {
    const result = await probeEndpointModels(BASE, async () => {
      throw new Error("ECONNREFUSED");
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/is the server running/);
  });

  it("rejects non-http(s) and malformed base URLs", async () => {
    for (const url of ["file:///etc/passwd", "not a url"]) {
      const result = await probeEndpointModels(url, fakeFetch({}));
      expect(result.ok).toBe(false);
    }
  });

  it("skips malformed rows instead of failing the probe", async () => {
    const result = await probeEndpointModels(
      BASE,
      fakeFetch({
        "http://localhost:11434/api/tags": {
          models: [{ name: "good:1b" }, { nope: true }, "junk", { name: "" }],
        },
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.models.map((m) => m.id)).toEqual(["good:1b"]);
  });
});
