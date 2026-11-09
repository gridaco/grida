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
    authority.approveCustomEndpoint("ollama", "http://LOCALHOST:11434/v1");
    expect(authority.grants().at(-1)?.id).toBe(first);
    expect(authority.revision).toBe(revision);
  });

  it("invalidates a native launch when the approved base path changes", () => {
    const authority = new AgentNetworkAuthority("https://grida.co");
    const base = "http://localhost:11434/v1";
    const next = "http://localhost:11434/other";
    authority.approveCustomEndpoint("ollama", base);
    const previous = authority.approvedEndpointGrant("ollama", base);
    expect(previous).toMatch(/^provider:custom:/);
    expect(authority.approvedEndpointGrant("ollama", next)).toBeNull();
    authority.approveCustomEndpoint("ollama", next);
    expect(authority.approvedEndpointGrant("ollama", base)).toBeNull();
    expect(authority.approvedEndpointGrant("ollama", next)).not.toBe(previous);
    expect(authority.grants().some((grant) => grant.id === previous)).toBe(
      false
    );
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
