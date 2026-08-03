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
