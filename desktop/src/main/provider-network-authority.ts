import crypto from "node:crypto";
import { ProviderNetworkPolicy } from "../provider-network-policy";

/**
 * GRIDA-SEC-004 — main-process ownership of provider-network grants.
 *
 * Built-in provider origins exist for one Desktop spawn. Custom endpoint
 * grants are per-spawn capabilities. Main restores only saved destinations
 * matching its protected consent receipt; sidecar-writable config never mints
 * authority. Explicit Settings Connect/Save records that durable consent.
 */
export class ProviderNetworkAuthority {
  private readonly builtIns: ProviderNetworkPolicy.Grant[];
  private readonly mainOnly = ProviderNetworkPolicy.mainOnlyGrants();
  private readonly customByEndpoint = new Map<
    string,
    { baseUrl: string; grant: ProviderNetworkPolicy.Grant; active: boolean }
  >();
  private revisionValue = 1;

  constructor(ggOrigin: string) {
    this.builtIns = ProviderNetworkPolicy.builtInGrants(ggOrigin);
  }

  get revision(): number {
    return this.revisionValue;
  }

  grants(): ProviderNetworkPolicy.Grant[] {
    const custom = [...this.customByEndpoint.values()]
      .filter(({ active }) => active)
      .map(({ grant }) => grant);
    return [...this.builtIns, ...custom].map((grant) => ({
      ...grant,
      origins: [...grant.origins],
    }));
  }

  /** Grants Main may dispatch for native hosts: the published set plus the
   * Main-only grants the sidecar never receives. */
  nativeGrants(): ProviderNetworkPolicy.Grant[] {
    return [
      ...this.grants(),
      ...this.mainOnly.map((grant) => ({
        ...grant,
        origins: [...grant.origins],
      })),
    ];
  }

  isCustomGrant(grantId: string): boolean {
    for (const { grant } of this.customByEndpoint.values()) {
      if (grant.id === grantId) return true;
    }
    return false;
  }

  approvedEndpointGrant(endpointId: string, baseUrl: string): string | null {
    const current = this.customByEndpoint.get(endpointId);
    return current?.active && current.baseUrl === new URL(baseUrl).href
      ? current.grant.id
      : null;
  }

  approveCustomEndpoint(endpointId: string, baseUrl: string): void {
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(endpointId)) {
      throw new Error("custom endpoint id is invalid");
    }
    const origin = ProviderNetworkPolicy.canonicalOrigin(baseUrl);
    const canonicalBase = new URL(baseUrl).href;
    const current = this.customByEndpoint.get(endpointId);
    if (current?.baseUrl === canonicalBase) {
      if (current.active) return;
      current.active = true;
      this.revisionValue += 1;
      return;
    }
    this.customByEndpoint.set(endpointId, {
      baseUrl: canonicalBase,
      active: true,
      grant: {
        id: `provider:custom:${crypto.randomUUID()}`,
        lane: "provider",
        origins: [origin],
      },
    });
    this.revisionValue += 1;
  }

  revokeCustomEndpoint(endpointId: string): void {
    if (!this.customByEndpoint.delete(endpointId)) return;
    this.revisionValue += 1;
  }

  /** Hide grants from a replacement service until its config is reconciled.
   * Keep IDs for exact matches so an unchanged native chat can continue using
   * its captured network binding after a retained-service restart. */
  suspendCustomEndpoints(): void {
    if (![...this.customByEndpoint.values()].some(({ active }) => active))
      return;
    for (const value of this.customByEndpoint.values()) value.active = false;
    this.revisionValue += 1;
  }

  discardSuspendedEndpoints(): void {
    for (const [id, value] of this.customByEndpoint) {
      if (!value.active) this.customByEndpoint.delete(id);
    }
  }
}
