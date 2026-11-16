import { describe, expect, it } from "vitest";
import { ProviderNetworkPolicy } from "./provider-network-policy";

const grants = ProviderNetworkPolicy.builtInGrants("https://grida.co/path");

describe("ProviderNetworkPolicy", () => {
  it("authorizes only built-in provider origins and suffixes", () => {
    const exact = ProviderNetworkPolicy.authorize(grants, {
      grant_id: ProviderNetworkPolicy.BUILTIN_PROVIDER_GRANT_ID,
      method: "POST",
      url: "https://openrouter.ai/api/v1/chat/completions",
      headers: [["authorization", "Bearer secret"]],
    });
    expect(exact.url.origin).toBe("https://openrouter.ai");

    expect(
      ProviderNetworkPolicy.authorize(grants, {
        grant_id: ProviderNetworkPolicy.BUILTIN_PROVIDER_GRANT_ID,
        method: "GET",
        url: "https://jobs.queue.fal.run/request/1",
        headers: [],
      }).url.hostname
    ).toBe("jobs.queue.fal.run");

    expect(() =>
      ProviderNetworkPolicy.authorize(grants, {
        grant_id: ProviderNetworkPolicy.BUILTIN_PROVIDER_GRANT_ID,
        method: "GET",
        url: "https://example.com/",
        headers: [],
      })
    ).toThrow(/not granted/);
    expect(() =>
      ProviderNetworkPolicy.authorize(grants, {
        grant_id: ProviderNetworkPolicy.BUILTIN_PROVIDER_GRANT_ID,
        method: "GET",
        url: "https://result.vercel-ai.com/video.mp4",
        headers: [],
      })
    ).toThrow(/not granted/);
  });

  it("pins ChatGPT subscription auth and inference to a Main-only grant", () => {
    // GRIDA-SEC-008 — token exchange and Responses inference use a
    // credential-bearing provider grant the sidecar never receives, never the
    // built-in provider grant or the provider-asset lane.
    const native = [...grants, ...ProviderNetworkPolicy.mainOnlyGrants()];
    for (const url of [
      "https://auth.openai.com/oauth/token",
      "https://chatgpt.com/backend-api/codex/responses",
    ]) {
      expect(() =>
        ProviderNetworkPolicy.authorize(grants, {
          grant_id: ProviderNetworkPolicy.BUILTIN_PROVIDER_GRANT_ID,
          method: "POST",
          url,
          headers: [],
        })
      ).toThrow(/not granted/);
      expect(
        ProviderNetworkPolicy.authorize(native, {
          grant_id: ProviderNetworkPolicy.CHATGPT_SUBSCRIPTION_GRANT_ID,
          method: "POST",
          url,
          headers: [["authorization", "Bearer transient"]],
        }).url.origin
      ).toBe(new URL(url).origin);
      expect(() =>
        ProviderNetworkPolicy.authorize(grants, {
          grant_id: ProviderNetworkPolicy.PROVIDER_ASSET_GRANT_ID,
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
        ProviderNetworkPolicy.authorize(native, {
          grant_id: ProviderNetworkPolicy.CHATGPT_SUBSCRIPTION_GRANT_ID,
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
      ProviderNetworkPolicy.authorize(grants, {
        grant_id: ProviderNetworkPolicy.BUILTIN_PROVIDER_GRANT_ID,
        method: "POST",
        url,
        headers: [["xi-api-key", "secret"]],
      }).url.origin
    ).toBe("https://api.elevenlabs.io");

    expect(() =>
      ProviderNetworkPolicy.authorize(grants, {
        grant_id: ProviderNetworkPolicy.PROVIDER_ASSET_GRANT_ID,
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
        ProviderNetworkPolicy.authorize(grants, {
          grant_id: ProviderNetworkPolicy.BUILTIN_PROVIDER_GRANT_ID,
          method: "POST",
          url: denied,
          headers: [],
        })
      ).toThrow(/not granted/);
    }
  });

  it("pins custom grants to a canonical exact origin", () => {
    const custom: ProviderNetworkPolicy.Grant = {
      id: "custom:ollama",
      lane: "provider",
      origins: [
        ProviderNetworkPolicy.canonicalOrigin("http://localhost:11434/v1"),
      ],
    };
    expect(
      ProviderNetworkPolicy.authorize([custom], {
        grant_id: custom.id,
        method: "GET",
        url: "http://localhost:11434/api/tags",
        headers: [],
      }).url.pathname
    ).toBe("/api/tags");
    expect(() =>
      ProviderNetworkPolicy.authorize([custom], {
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
      ProviderNetworkPolicy.authorize(grants, {
        grant_id: ProviderNetworkPolicy.BUILTIN_PROVIDER_GRANT_ID,
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
        ProviderNetworkPolicy.authorize(grants, {
          grant_id: ProviderNetworkPolicy.BUILTIN_PROVIDER_GRANT_ID,
          method: "POST",
          url: denied,
          headers: [],
        })
      ).toThrow(/not granted/);
    }
    expect(() =>
      ProviderNetworkPolicy.authorize(grants, {
        grant_id: ProviderNetworkPolicy.PROVIDER_ASSET_GRANT_ID,
        method: "GET",
        url,
        headers: [],
      })
    ).toThrow(/not granted/);
  });

  it("reserves the larger body bound only for first-party multipart file uploads", () => {
    const request = ProviderNetworkPolicy.authorize(grants, {
      grant_id: ProviderNetworkPolicy.BUILTIN_PROVIDER_GRANT_ID,
      method: "POST",
      url: "https://openapi.tripo3d.ai/v3/files",
      headers: [["content-type", "multipart/form-data; boundary=grida-upload"]],
    });
    expect(ProviderNetworkPolicy.maxRequestBodyBytes(request)).toBe(
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
        ProviderNetworkPolicy.maxRequestBodyBytes({ ...request, ...change })
      ).toBe(32 * 1024 * 1024);
    expect(ProviderNetworkPolicy.maxRequestBodyBytes(null)).toBe(
      32 * 1024 * 1024
    );
  });

  it.each([
    "https://cdn.tripo3d.ai",
    "https://tripo-data.rg1.data.tripo3d.com",
  ])("admits %s only as credential-free exact-origin downloads", (origin) => {
    const url = `${origin}/tasks/id/model.glb?signature=x`;
    expect(
      ProviderNetworkPolicy.authorize(grants, {
        grant_id: ProviderNetworkPolicy.PROVIDER_ASSET_GRANT_ID,
        method: "GET",
        url,
        headers: [],
      }).grant.lane
    ).toBe("download");
    for (const { error, ...metadata } of [
      {
        grant_id: ProviderNetworkPolicy.BUILTIN_PROVIDER_GRANT_ID,
        url,
        headers: [["authorization", "Bearer synthetic"]],
        error: "provider-network destination is not granted",
      },
      {
        grant_id: ProviderNetworkPolicy.PROVIDER_ASSET_GRANT_ID,
        url,
        headers: [["authorization", "Bearer synthetic"]],
        error: "provider-asset header authorization is not allowed",
      },
      {
        grant_id: ProviderNetworkPolicy.PROVIDER_ASSET_GRANT_ID,
        url: "https://other.data.tripo3d.com/model.glb",
        headers: [],
        error: "provider-network destination is not granted",
      },
      {
        grant_id: ProviderNetworkPolicy.PROVIDER_ASSET_GRANT_ID,
        url: `${origin}.attacker.example/model.glb`,
        headers: [],
        error: "provider-network destination is not granted",
      },
      {
        grant_id: ProviderNetworkPolicy.PROVIDER_ASSET_GRANT_ID,
        url: `${origin}:8443/model.glb`,
        headers: [],
        error: "provider-network destination is not granted",
      },
      {
        grant_id: ProviderNetworkPolicy.PROVIDER_ASSET_GRANT_ID,
        url: url.replace("https:", "http:"),
        headers: [],
        error: "provider-network destination is not granted",
      },
    ])
      expect(() =>
        ProviderNetworkPolicy.authorize(grants, {
          ...metadata,
          method: "GET",
          headers: metadata.headers as [string, string][],
        })
      ).toThrow(error);
  });

  it("rejects URL credentials and dangerous request headers", () => {
    expect(() =>
      ProviderNetworkPolicy.canonicalOrigin("https://u:p@example.com/v1")
    ).toThrow(/credentials/);
    expect(() =>
      ProviderNetworkPolicy.authorize(grants, {
        grant_id: ProviderNetworkPolicy.BUILTIN_PROVIDER_GRANT_ID,
        method: "POST",
        url: "https://openrouter.ai/v1",
        headers: [["Proxy-Authorization", "Basic leak"]],
      })
    ).toThrow(/forbidden/);
    expect(() =>
      ProviderNetworkPolicy.authorize(grants, {
        grant_id: ProviderNetworkPolicy.BUILTIN_PROVIDER_GRANT_ID,
        method: "POST",
        url: "https://openrouter.ai/v1",
        headers: [["x", "bad\r\nInjected: yes"]],
      })
    ).toThrow(/invalid/);
  });

  it("keeps provider-asset downloads credential-free and GET/HEAD-only", () => {
    expect(
      ProviderNetworkPolicy.authorize(grants, {
        grant_id: ProviderNetworkPolicy.PROVIDER_ASSET_GRANT_ID,
        method: "GET",
        url: "https://v3.fal.media/video.mp4?signature=x",
        headers: [["range", "bytes=0-1023"]],
      }).grant.lane
    ).toBe("download");
    expect(() =>
      ProviderNetworkPolicy.authorize(grants, {
        grant_id: ProviderNetworkPolicy.PROVIDER_ASSET_GRANT_ID,
        method: "POST",
        url: "https://v3.fal.media/video.mp4",
        headers: [],
      })
    ).toThrow(/method/);
    expect(() =>
      ProviderNetworkPolicy.authorize(grants, {
        grant_id: ProviderNetworkPolicy.PROVIDER_ASSET_GRANT_ID,
        method: "GET",
        url: "https://v3.fal.media/video.mp4",
        headers: [["authorization", "Bearer leak"]],
      })
    ).toThrow(/not allowed/);
    expect(() =>
      ProviderNetworkPolicy.authorize(grants, {
        grant_id: ProviderNetworkPolicy.PROVIDER_ASSET_GRANT_ID,
        method: "GET",
        url: "https://attacker.example/encoded-secret",
        headers: [],
      })
    ).toThrow(/not granted/);
  });

  it("treats wildcard origins as strict subdomains, not the apex", () => {
    const suffixOnly: ProviderNetworkPolicy.Grant = {
      id: "suffix-only",
      lane: "provider",
      origins: ["https://*.example.com"],
    };
    expect(
      ProviderNetworkPolicy.grantAllowsUrl(
        suffixOnly,
        new URL("https://api.example.com/v1")
      )
    ).toBe(true);
    expect(
      ProviderNetworkPolicy.grantAllowsUrl(
        suffixOnly,
        new URL("https://example.com/v1")
      )
    ).toBe(false);
  });
});

// GRIDA-SEC-004 / GRIDA-SEC-006 / GRIDA-GG: provider — signed uploads are not credential destinations.
describe("Tripo hosted upload grant", () => {
  const upload = {
    grant_id: ProviderNetworkPolicy.TRIPO_UPLOAD_GRANT_ID,
    method: "PUT",
    url: "https://tripo-data.s3.us-west-2.amazonaws.com/input.glb?signature=synthetic",
    headers: [["content-type", "application/octet-stream"]] as [
      string,
      string,
    ][],
  };
  it("authorizes bounded binary PUT only on the exact signed-upload origin", () => {
    const request = ProviderNetworkPolicy.authorize(grants, upload);
    expect(ProviderNetworkPolicy.maxRequestBodyBytes(request)).toBe(60_000_000);
    expect(
      ProviderNetworkPolicy.maxRequestBodyBytes({ ...request, method: "POST" })
    ).toBe(32 * 1024 * 1024);
    expect(() =>
      ProviderNetworkPolicy.authorize(grants, {
        ...upload,
        grant_id: ProviderNetworkPolicy.BUILTIN_PROVIDER_GRANT_ID,
      })
    ).toThrow(/not granted|not allowed|forbidden/);
    expect(() =>
      ProviderNetworkPolicy.authorize(grants, {
        ...upload,
        grant_id: ProviderNetworkPolicy.PROVIDER_ASSET_GRANT_ID,
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
      ProviderNetworkPolicy.authorize(grants, {
        ...upload,
        ...override,
      } as ProviderNetworkPolicy.RequestMetadata)
    ).toThrow(/not granted|not allowed|forbidden/);
  });
});

// GRIDA-SEC-004 — discovery grants no account, inference or asset authority.
describe("anonymous GG discovery", () => {
  const request = {
    grant_id: ProviderNetworkPolicy.BUILTIN_PROVIDER_GRANT_ID,
    method: "GET",
    url: "https://gateway.grida.ai/v1/models",
    headers: [["accept", "application/json"]] as [string, string][],
  };
  it.each(["/v1/models", "/v1/endpoints", "/schemas/operations.json"])(
    "permits only a body-free anonymous GET of %s",
    (path) => {
      const allowed = ProviderNetworkPolicy.authorize(grants, {
        ...request,
        url: `https://gateway.grida.ai${path}`,
      });
      expect(allowed.url.pathname).toBe(path);
      expect(ProviderNetworkPolicy.maxRequestBodyBytes(allowed)).toBe(0);
    }
  );
  it.each([
    { method: "POST" },
    { method: "HEAD" },
    { url: "https://gateway.grida.ai/v1/chat/completions" },
    { url: "https://gateway.grida.ai/v1/models?query=secret" },
    { url: "https://gateway.grida.ai/schemas/operations.json/" },
    { url: "https://gateway.grida.ai:444/v1/models" },
    { url: "https://sub.gateway.grida.ai/v1/models" },
    { url: "https://gateway.grida.ai.attacker.example/v1/models" },
    { url: "http://gateway.grida.ai/v1/models" },
    { headers: [["authorization", "Bearer secret"]] },
    { headers: [["xi-api-key", "secret"]] },
    { headers: [["content-type", "application/json"]] },
    { grant_id: ProviderNetworkPolicy.PROVIDER_ASSET_GRANT_ID },
  ])("refuses widening the public metadata boundary", (change) => {
    expect(() =>
      ProviderNetworkPolicy.authorize(grants, {
        ...request,
        ...change,
      } as ProviderNetworkPolicy.RequestMetadata)
    ).toThrow(/not allowed|not granted/);
  });
});
