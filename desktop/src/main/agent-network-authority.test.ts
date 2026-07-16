import { describe, expect, it } from "vitest";
import { AgentNetworkAuthority } from "./agent-network-authority";

describe("AgentNetworkAuthority", () => {
  it("mints exact, per-spawn custom grants and revokes them", () => {
    const authority = new AgentNetworkAuthority("https://grida.co");
    const baseRevision = authority.revision;
    authority.approveCustomEndpoint("ollama", "http://localhost:11434/v1");
    const custom = authority
      .grants()
      .find((grant) => grant.id.startsWith("provider:custom:"));
    expect(custom?.origins).toEqual(["http://localhost:11434"]);
    expect(authority.revision).toBe(baseRevision + 1);

    authority.revokeCustomEndpoint("ollama");
    expect(
      authority
        .grants()
        .some((grant) => grant.id.startsWith("provider:custom:"))
    ).toBe(false);
    expect(authority.revision).toBe(baseRevision + 2);
  });

  it("does not rotate an unchanged approval", () => {
    const authority = new AgentNetworkAuthority("https://grida.co");
    authority.approveCustomEndpoint("ollama", "http://localhost:11434/v1");
    const first = authority.grants().at(-1)?.id;
    const revision = authority.revision;
    authority.approveCustomEndpoint("ollama", "http://localhost:11434/other");
    expect(authority.grants().at(-1)?.id).toBe(first);
    expect(authority.revision).toBe(revision);
  });

  it("rejects invalid endpoint ids and URL credentials", () => {
    const authority = new AgentNetworkAuthority("https://grida.co");
    expect(() =>
      authority.approveCustomEndpoint("../escape", "https://example.com")
    ).toThrow(/id/);
    expect(() =>
      authority.approveCustomEndpoint("local", "https://u:p@example.com")
    ).toThrow(/credentials/);
  });
});
