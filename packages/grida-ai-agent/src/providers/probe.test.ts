import { describe, expect, it } from "vitest";
import { probeEndpointModels, type ProbeFetch } from "./probe";

/** Fake fetch keyed by URL; anything unknown 404s. */
function fakeFetch(routes: Record<string, unknown>): ProbeFetch {
  return async (url) => {
    if (url in routes) {
      return new Response(JSON.stringify(routes[url]), { status: 200 });
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
