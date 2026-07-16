import crypto from "node:crypto";
import { AgentNetworkPolicy } from "../agent-network-policy";

/**
 * GRIDA-SEC-004 — main-process ownership of provider-network grants.
 *
 * Built-in provider origins exist for one Desktop spawn. Custom endpoint
 * grants are memory-only and appear only after a native, human-visible
 * approval. They intentionally expire on relaunch: persisting a grant where
 * the sidecar or one of its descendants can rewrite it would turn endpoint
 * config into network authority.
 */
export class AgentNetworkAuthority {
  private readonly builtIns: AgentNetworkPolicy.Grant[];
  private readonly customByEndpoint = new Map<
    string,
    AgentNetworkPolicy.Grant
  >();
  private revisionValue = 1;

  constructor(ggOrigin: string) {
    this.builtIns = AgentNetworkPolicy.builtInGrants(ggOrigin);
  }

  get revision(): number {
    return this.revisionValue;
  }

  grants(): AgentNetworkPolicy.Grant[] {
    return [...this.builtIns, ...this.customByEndpoint.values()].map(
      (grant) => ({ ...grant, origins: [...grant.origins] })
    );
  }

  isCustomGrant(grantId: string): boolean {
    for (const grant of this.customByEndpoint.values()) {
      if (grant.id === grantId) return true;
    }
    return false;
  }

  approveCustomEndpoint(endpointId: string, baseUrl: string): void {
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(endpointId)) {
      throw new Error("custom endpoint id is invalid");
    }
    const origin = AgentNetworkPolicy.canonicalOrigin(baseUrl);
    const current = this.customByEndpoint.get(endpointId);
    if (current?.origins[0] === origin) return;
    this.customByEndpoint.set(endpointId, {
      id: `provider:custom:${crypto.randomUUID()}`,
      lane: "provider",
      origins: [origin],
    });
    this.revisionValue += 1;
  }

  revokeCustomEndpoint(endpointId: string): void {
    if (!this.customByEndpoint.delete(endpointId)) return;
    this.revisionValue += 1;
  }
}
