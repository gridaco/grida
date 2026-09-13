import { describe, expect, it } from "vitest";
import { AgentNetworkPolicy } from "./agent-network-policy";

const grants = AgentNetworkPolicy.builtInGrants("https://grida.co/path");

describe("AgentNetworkPolicy", () => {
  it("authorizes only built-in provider origins and suffixes", () => {
    const exact = AgentNetworkPolicy.authorize(grants, {
      grant_id: AgentNetworkPolicy.BUILTIN_PROVIDER_GRANT_ID,
      method: "POST",
      url: "https://openrouter.ai/api/v1/chat/completions",
      headers: [["authorization", "Bearer secret"]],
    });
    expect(exact.url.origin).toBe("https://openrouter.ai");

    expect(
      AgentNetworkPolicy.authorize(grants, {
        grant_id: AgentNetworkPolicy.BUILTIN_PROVIDER_GRANT_ID,
        method: "GET",
        url: "https://jobs.queue.fal.run/request/1",
        headers: [],
      }).url.hostname
    ).toBe("jobs.queue.fal.run");

    expect(() =>
      AgentNetworkPolicy.authorize(grants, {
        grant_id: AgentNetworkPolicy.BUILTIN_PROVIDER_GRANT_ID,
        method: "GET",
        url: "https://example.com/",
        headers: [],
      })
    ).toThrow(/not granted/);
    expect(() =>
      AgentNetworkPolicy.authorize(grants, {
        grant_id: AgentNetworkPolicy.BUILTIN_PROVIDER_GRANT_ID,
        method: "GET",
        url: "https://result.vercel-ai.com/video.mp4",
        headers: [],
      })
    ).toThrow(/not granted/);
  });

  it("pins ChatGPT subscription auth and inference to exact provider origins", () => {
    // GRIDA-SEC-008 — token exchange and Responses inference use the
    // credential-bearing provider lane, never the provider-asset lane.
    for (const url of [
      "https://auth.openai.com/oauth/token",
      "https://chatgpt.com/backend-api/codex/responses",
    ]) {
      expect(
        AgentNetworkPolicy.authorize(grants, {
          grant_id: AgentNetworkPolicy.BUILTIN_PROVIDER_GRANT_ID,
          method: "POST",
          url,
          headers: [["authorization", "Bearer transient"]],
        }).url.origin
      ).toBe(new URL(url).origin);
      expect(() =>
        AgentNetworkPolicy.authorize(grants, {
          grant_id: AgentNetworkPolicy.PROVIDER_ASSET_GRANT_ID,
          method: "GET",
          url,
          headers: [],
        })
      ).toThrow(/not granted/);
    }

    for (const url of [
      "https://evil.auth.openai.com/oauth/token",
      "https://auth.openai.com.attacker.example/oauth/token",
      "https://api.chatgpt.com/backend-api/codex/responses",
      "https://chatgpt.com.attacker.example/backend-api/codex/responses",
    ]) {
      expect(() =>
        AgentNetworkPolicy.authorize(grants, {
          grant_id: AgentNetworkPolicy.BUILTIN_PROVIDER_GRANT_ID,
          method: "POST",
          url,
          headers: [],
        })
      ).toThrow(/not granted/);
    }
  });

  it("admits ElevenLabs only on the exact credential-bearing provider origin", () => {
    const url =
      "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128";
    expect(
      AgentNetworkPolicy.authorize(grants, {
        grant_id: AgentNetworkPolicy.BUILTIN_PROVIDER_GRANT_ID,
        method: "POST",
        url,
        headers: [["xi-api-key", "secret"]],
      }).url.origin
    ).toBe("https://api.elevenlabs.io");

    expect(() =>
      AgentNetworkPolicy.authorize(grants, {
        grant_id: AgentNetworkPolicy.PROVIDER_ASSET_GRANT_ID,
        method: "GET",
        url,
        headers: [],
      })
    ).toThrow(/not granted/);

    for (const denied of [
      "https://evil.api.elevenlabs.io/v1/sound-generation",
      "https://api.elevenlabs.io.attacker.example/v1/sound-generation",
    ]) {
      expect(() =>
        AgentNetworkPolicy.authorize(grants, {
          grant_id: AgentNetworkPolicy.BUILTIN_PROVIDER_GRANT_ID,
          method: "POST",
          url: denied,
          headers: [],
        })
      ).toThrow(/not granted/);
    }
  });

  it("pins custom grants to a canonical exact origin", () => {
    const custom: AgentNetworkPolicy.Grant = {
      id: "custom:ollama",
      lane: "provider",
      origins: [
        AgentNetworkPolicy.canonicalOrigin("http://localhost:11434/v1"),
      ],
    };
    expect(
      AgentNetworkPolicy.authorize([custom], {
        grant_id: custom.id,
        method: "GET",
        url: "http://localhost:11434/api/tags",
        headers: [],
      }).url.pathname
    ).toBe("/api/tags");
    expect(() =>
      AgentNetworkPolicy.authorize([custom], {
        grant_id: custom.id,
        method: "GET",
        url: "http://localhost:11435/api/tags",
        headers: [],
      })
    ).toThrow(/not granted/);
  });

  it.each([
    "/v3/generation/text-to-model",
    "/v3/files",
    "/v3/animations/rig-check",
    "/v3/animations/rig",
  ])("admits Tripo %s credentials only on its exact API origin", (route) => {
    const url = `https://openapi.tripo3d.ai${route}`;
    expect(
      AgentNetworkPolicy.authorize(grants, {
        grant_id: AgentNetworkPolicy.BUILTIN_PROVIDER_GRANT_ID,
        method: "POST",
        url,
        headers: [["authorization", "Bearer synthetic-tripo"]],
      }).url.origin
    ).toBe("https://openapi.tripo3d.ai");
    for (const denied of [
      "https://evil.openapi.tripo3d.ai/v3/files",
      "https://openapi.tripo3d.ai.attacker.example/v3/files",
      "https://openapi.tripo3d.ai:444/v3/files",
      "http://openapi.tripo3d.ai/v3/files",
    ]) {
      expect(() =>
        AgentNetworkPolicy.authorize(grants, {
          grant_id: AgentNetworkPolicy.BUILTIN_PROVIDER_GRANT_ID,
          method: "POST",
          url: denied,
          headers: [],
        })
      ).toThrow(/not granted/);
    }
    expect(() =>
      AgentNetworkPolicy.authorize(grants, {
        grant_id: AgentNetworkPolicy.PROVIDER_ASSET_GRANT_ID,
        method: "GET",
        url,
        headers: [],
      })
    ).toThrow(/not granted/);
  });

  it("reserves the larger body bound only for first-party multipart file uploads", () => {
    const request = AgentNetworkPolicy.authorize(grants, {
      grant_id: AgentNetworkPolicy.BUILTIN_PROVIDER_GRANT_ID,
      method: "POST",
      url: "https://openapi.tripo3d.ai/v3/files",
      headers: [["content-type", "multipart/form-data; boundary=grida-upload"]],
    });
    expect(AgentNetworkPolicy.maxRequestBodyBytes(request)).toBe(
      64 * 1024 * 1024
    );
    for (const change of [
      { method: "PUT" },
      { url: new URL("https://openapi.tripo3d.ai/v3/animations/rig") },
      { url: new URL("https://openapi.tripo3d.ai/v3/files?other=1") },
      { url: new URL("https://openrouter.ai/v3/files") },
      { headers: new Headers({ "content-type": "application/json" }) },
      { grant: { ...request.grant, id: "custom-endpoint" } },
      { grant: { ...request.grant, lane: "download" as const } },
    ])
      expect(
        AgentNetworkPolicy.maxRequestBodyBytes({ ...request, ...change })
      ).toBe(32 * 1024 * 1024);
    expect(AgentNetworkPolicy.maxRequestBodyBytes(null)).toBe(32 * 1024 * 1024);
  });

  it.each([
    "https://cdn.tripo3d.ai",
    "https://tripo-data.rg1.data.tripo3d.com",
  ])("admits %s only as credential-free exact-origin downloads", (origin) => {
    const url = `${origin}/tasks/id/model.glb?signature=x`;
    expect(
      AgentNetworkPolicy.authorize(grants, {
        grant_id: AgentNetworkPolicy.PROVIDER_ASSET_GRANT_ID,
        method: "GET",
        url,
        headers: [],
      }).grant.lane
    ).toBe("download");
    for (const { error, ...metadata } of [
      {
        grant_id: AgentNetworkPolicy.BUILTIN_PROVIDER_GRANT_ID,
        url,
        headers: [["authorization", "Bearer synthetic"]],
        error: "provider-network destination is not granted",
      },
      {
        grant_id: AgentNetworkPolicy.PROVIDER_ASSET_GRANT_ID,
        url,
        headers: [["authorization", "Bearer synthetic"]],
        error: "provider-asset header authorization is not allowed",
      },
      {
        grant_id: AgentNetworkPolicy.PROVIDER_ASSET_GRANT_ID,
        url: "https://other.data.tripo3d.com/model.glb",
        headers: [],
        error: "provider-network destination is not granted",
      },
      {
        grant_id: AgentNetworkPolicy.PROVIDER_ASSET_GRANT_ID,
        url: `${origin}.attacker.example/model.glb`,
        headers: [],
        error: "provider-network destination is not granted",
      },
      {
        grant_id: AgentNetworkPolicy.PROVIDER_ASSET_GRANT_ID,
        url: `${origin}:8443/model.glb`,
        headers: [],
        error: "provider-network destination is not granted",
      },
      {
        grant_id: AgentNetworkPolicy.PROVIDER_ASSET_GRANT_ID,
        url: url.replace("https:", "http:"),
        headers: [],
        error: "provider-network destination is not granted",
      },
    ])
      expect(() =>
        AgentNetworkPolicy.authorize(grants, {
          ...metadata,
          method: "GET",
          headers: metadata.headers as [string, string][],
        })
      ).toThrow(error);
  });

  it("rejects URL credentials and dangerous request headers", () => {
    expect(() =>
      AgentNetworkPolicy.canonicalOrigin("https://u:p@example.com/v1")
    ).toThrow(/credentials/);
    expect(() =>
      AgentNetworkPolicy.authorize(grants, {
        grant_id: AgentNetworkPolicy.BUILTIN_PROVIDER_GRANT_ID,
        method: "POST",
        url: "https://openrouter.ai/v1",
        headers: [["Proxy-Authorization", "Basic leak"]],
      })
    ).toThrow(/forbidden/);
    expect(() =>
      AgentNetworkPolicy.authorize(grants, {
        grant_id: AgentNetworkPolicy.BUILTIN_PROVIDER_GRANT_ID,
        method: "POST",
        url: "https://openrouter.ai/v1",
        headers: [["x", "bad\r\nInjected: yes"]],
      })
    ).toThrow(/invalid/);
  });

  it("keeps provider-asset downloads credential-free and GET/HEAD-only", () => {
    expect(
      AgentNetworkPolicy.authorize(grants, {
        grant_id: AgentNetworkPolicy.PROVIDER_ASSET_GRANT_ID,
        method: "GET",
        url: "https://v3.fal.media/video.mp4?signature=x",
        headers: [["range", "bytes=0-1023"]],
      }).grant.lane
    ).toBe("download");
    expect(() =>
      AgentNetworkPolicy.authorize(grants, {
        grant_id: AgentNetworkPolicy.PROVIDER_ASSET_GRANT_ID,
        method: "POST",
        url: "https://v3.fal.media/video.mp4",
        headers: [],
      })
    ).toThrow(/method/);
    expect(() =>
      AgentNetworkPolicy.authorize(grants, {
        grant_id: AgentNetworkPolicy.PROVIDER_ASSET_GRANT_ID,
        method: "GET",
        url: "https://v3.fal.media/video.mp4",
        headers: [["authorization", "Bearer leak"]],
      })
    ).toThrow(/not allowed/);
    expect(() =>
      AgentNetworkPolicy.authorize(grants, {
        grant_id: AgentNetworkPolicy.PROVIDER_ASSET_GRANT_ID,
        method: "GET",
        url: "https://attacker.example/encoded-secret",
        headers: [],
      })
    ).toThrow(/not granted/);
  });

  it("treats wildcard origins as strict subdomains, not the apex", () => {
    const suffixOnly: AgentNetworkPolicy.Grant = {
      id: "suffix-only",
      lane: "provider",
      origins: ["https://*.example.com"],
    };
    expect(
      AgentNetworkPolicy.grantAllowsUrl(
        suffixOnly,
        new URL("https://api.example.com/v1")
      )
    ).toBe(true);
    expect(
      AgentNetworkPolicy.grantAllowsUrl(
        suffixOnly,
        new URL("https://example.com/v1")
      )
    ).toBe(false);
  });
});

// GRIDA-SEC-004 / GRIDA-SEC-006 / GRIDA-GG: provider — signed uploads are not credential destinations.
describe("Tripo hosted upload grant", () => {
  const upload = {
    grant_id: AgentNetworkPolicy.TRIPO_UPLOAD_GRANT_ID,
    method: "PUT",
    url: "https://tripo-data.s3.us-west-2.amazonaws.com/input.glb?signature=synthetic",
    headers: [["content-type", "application/octet-stream"]] as [
      string,
      string,
    ][],
  };
  it("authorizes bounded binary PUT only on the exact signed-upload origin", () => {
    const request = AgentNetworkPolicy.authorize(grants, upload);
    expect(AgentNetworkPolicy.maxRequestBodyBytes(request)).toBe(60_000_000);
    expect(
      AgentNetworkPolicy.maxRequestBodyBytes({ ...request, method: "POST" })
    ).toBe(32 * 1024 * 1024);
    expect(() =>
      AgentNetworkPolicy.authorize(grants, {
        ...upload,
        grant_id: AgentNetworkPolicy.BUILTIN_PROVIDER_GRANT_ID,
      })
    ).toThrow(/not granted|not allowed|forbidden/);
    expect(() =>
      AgentNetworkPolicy.authorize(grants, {
        ...upload,
        grant_id: AgentNetworkPolicy.PROVIDER_ASSET_GRANT_ID,
        method: "GET",
        headers: [],
      })
    ).toThrow(/not granted|not allowed|forbidden/);
  });
  it.each([
    { method: "POST" },
    { method: "GET" },
    { url: "https://tripo-data.s3.us-west-2.amazonaws.com:444/input" },
    { url: "https://sub.tripo-data.s3.us-west-2.amazonaws.com/input" },
    { url: "http://tripo-data.s3.us-west-2.amazonaws.com/input" },
    { url: "https://tripo-data.s3.us-west-2.amazonaws.com/" },
    { headers: [["content-type", "application/json"]] },
    {
      headers: [
        ["content-type", "application/octet-stream"],
        ["authorization", "Bearer secret"],
      ],
    },
    {
      headers: [
        ["content-type", "application/octet-stream"],
        ["xi-api-key", "secret"],
      ],
    },
    {
      headers: [
        ["content-type", "application/octet-stream"],
        ["cookie", "secret"],
      ],
    },
  ])("rejects upload authority widening", (override) => {
    expect(() =>
      AgentNetworkPolicy.authorize(grants, {
        ...upload,
        ...override,
      } as AgentNetworkPolicy.RequestMetadata)
    ).toThrow(/not granted|not allowed|forbidden/);
  });
});
