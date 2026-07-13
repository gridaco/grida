/**
 * Pure presentation policy for resources supplied with an agent turn.
 *
 * The policy chooses HOW an already-described resource should reach the agent.
 * It never reads bytes, mints host scopes, or grants filesystem authority.
 * Those effects belong to the router and daemon. Keeping the decision pure
 * makes every source (paste, picker, drop, Library, workspace) share one
 * explicit, table-testable routing contract.
 */
export namespace InputResourcePolicy {
  export type Source =
    | "paste"
    | "picker"
    | "drop"
    | "library"
    | "workspace"
    | "mention"
    | "template";

  export type ResourceFacts = {
    id: string;
    kind: "file" | "directory";
    name: string;
    mimeType?: string;
    size?: number;
    source: Source;
    /** An encoding class supplied by the source adapter. It is separate from
     * provider capability: a supported raster remains raster bytes when the
     * active model cannot perceive its MIME type. */
    media: "raster-image" | "other";
    available: {
      /** A byte body is held by the renderer (File/Blob/data). */
      bytes?: true;
      /** An agent-visible path already exists; no host acquisition is needed. */
      path?: { space: "workspace" | "reference" };
      /** A stable URL can be named or delivered to a provider. */
      url?: true;
      /** A trusted host can exchange the source handle for a reference. */
      hostScope?: { resource: "file" | "directory" };
      /** Provider-delivery representations an encoder/source adapter can
       * actually produce. These are distinct from the source MIME. */
      provider?: {
        fromBytes?: { outputMimes: readonly string[] };
        fromUrl?: {
          /** MIME types a source adapter can produce after materializing the
           * URL into inline bytes. */
          inlineOutputMimes?: readonly string[];
          /** The MIME type when the original URL is delivered unchanged. */
          remoteMime?: string;
        };
      };
    };
  };

  export type Capabilities = {
    reference: {
      path: boolean;
      url: boolean;
      hostScope: {
        file: boolean;
        directory: boolean;
      };
    };
    attachment: {
      provider: {
        /** Exact MIME types accepted as inline/data bytes. */
        inlineMimes: readonly string[];
        /** Exact MIME types accepted as provider-fetchable remote URLs. */
        remoteUrlMimes: readonly string[];
      };
      /** Absent when the surface has no tool-visible scratch. */
      scratch?: ScratchSeedBudget.Limits;
    };
  };

  export type Preference =
    | "path-reference"
    | "url-reference"
    | "host-scope-reference"
    | "provider-url-inline-attachment"
    | "provider-url-remote-attachment"
    | "provider-bytes-attachment"
    | "scratch-attachment";

  export type Route =
    | {
        kind: "reference";
        via: "path";
        space: "workspace" | "reference";
      }
    | { kind: "reference"; via: "url" }
    | {
        kind: "reference";
        via: "host-scope";
        resource: "file" | "directory";
      }
    | {
        kind: "attachment";
        via: "provider";
        from: "url" | "bytes";
        representation: "inline-bytes" | "remote-url";
      }
    | { kind: "attachment"; via: "scratch"; from: "bytes" };

  export type UnavailableReason =
    | "representation-unavailable"
    | "reference-capability-unavailable"
    | "provider-capability-unavailable"
    | "scratch-unavailable"
    | "file-too-large"
    | "scratch-file-count-exceeded"
    | "scratch-budget-exceeded"
    | "directory-cannot-be-attached"
    | "directory-reference-required";

  export type TraceEntry = {
    preference: Preference;
    available: boolean;
    reason?: UnavailableReason;
  };

  export type Decision =
    | {
        status: "accept";
        configId: string;
        ruleId: string;
        route: Route;
        trace: readonly TraceEntry[];
      }
    | {
        status: "reject";
        configId: string;
        ruleId: string;
        reason: UnavailableReason;
        trace: readonly TraceEntry[];
      };

  export type Rule = {
    id: string;
    when: (resource: Readonly<ResourceFacts>) => boolean;
    prefer: readonly Preference[];
  };

  export type Config = {
    id: string;
    rules: readonly Rule[];
  };

  /** Today's product behavior, expressed centrally rather than in React:
   * existing paths stay references; directories become host scopes; Library
   * images and byte images become provider parts; other bytes go to scratch. */
  export const CURRENT: Config = {
    id: "current",
    rules: [
      {
        id: "directory",
        when: (resource) => resource.kind === "directory",
        prefer: ["host-scope-reference"],
      },
      {
        id: "existing-path",
        when: (resource) => resource.available.path !== undefined,
        prefer: ["path-reference"],
      },
      {
        id: "url-image",
        when: (resource) =>
          resource.kind === "file" &&
          resource.media === "raster-image" &&
          resource.available.url === true,
        prefer: [
          "provider-url-inline-attachment",
          "provider-url-remote-attachment",
        ],
      },
      {
        id: "byte-image",
        when: (resource) =>
          resource.kind === "file" &&
          resource.media === "raster-image" &&
          resource.available.bytes === true,
        prefer: ["provider-bytes-attachment"],
      },
      {
        id: "byte-file",
        when: (resource) =>
          resource.kind === "file" && resource.available.bytes === true,
        prefer: ["scratch-attachment"],
      },
    ],
  };

  /** Reference-first policy proposed for local agents. It changes preference,
   * not feasibility: bytes-only paste remains an attachment, and a local file
   * cannot become a reference until the host exposes a file-scope adapter. */
  export const REFERENCE_FIRST: Config = {
    id: "reference-first",
    rules: [
      {
        id: "directory",
        when: (resource) => resource.kind === "directory",
        prefer: ["host-scope-reference"],
      },
      {
        id: "available-reference",
        when: (resource) =>
          resource.available.path !== undefined ||
          resource.available.url === true ||
          resource.available.hostScope !== undefined,
        prefer: [
          "path-reference",
          "host-scope-reference",
          "url-reference",
          "provider-url-inline-attachment",
          "provider-url-remote-attachment",
          "provider-bytes-attachment",
          "scratch-attachment",
        ],
      },
      {
        id: "byte-image",
        when: (resource) =>
          resource.kind === "file" &&
          resource.media === "raster-image" &&
          resource.available.bytes === true,
        prefer: ["provider-bytes-attachment"],
      },
      {
        id: "byte-file",
        when: (resource) =>
          resource.kind === "file" && resource.available.bytes === true,
        prefer: ["scratch-attachment"],
      },
    ],
  };

  export function decide(
    resource: Readonly<ResourceFacts>,
    capabilities: Readonly<Capabilities>,
    config: Config = CURRENT
  ): Decision {
    const rule = config.rules.find((candidate) => candidate.when(resource));
    if (!rule) {
      return {
        status: "reject",
        configId: config.id,
        ruleId: "no-match",
        reason: "representation-unavailable",
        trace: [],
      };
    }

    const trace: TraceEntry[] = [];
    for (const preference of rule.prefer) {
      const candidate = resolve(preference, resource, capabilities);
      if (candidate.route) {
        trace.push({ preference, available: true });
        return {
          status: "accept",
          configId: config.id,
          ruleId: rule.id,
          route: candidate.route,
          trace,
        };
      }
      trace.push({
        preference,
        available: false,
        reason: candidate.reason,
      });
    }

    return {
      status: "reject",
      configId: config.id,
      ruleId: rule.id,
      // A missing fallback representation must not hide the reason an actually
      // available preferred representation was refused (for example: a folder
      // handle exists, but this surface cannot mint directory scopes).
      reason:
        trace.findLast((entry) => entry.reason !== "representation-unavailable")
          ?.reason ?? "representation-unavailable",
      trace,
    };
  }

  function resolve(
    preference: Preference,
    resource: Readonly<ResourceFacts>,
    capabilities: Readonly<Capabilities>
  ): { route?: Route; reason?: UnavailableReason } {
    switch (preference) {
      case "path-reference": {
        if (resource.kind === "directory") {
          return { reason: "directory-reference-required" };
        }
        const path = resource.available.path;
        if (!path) return { reason: "representation-unavailable" };
        if (!capabilities.reference.path) {
          return { reason: "reference-capability-unavailable" };
        }
        return { route: { kind: "reference", via: "path", ...path } };
      }
      case "url-reference":
        if (resource.kind === "directory") {
          return { reason: "directory-reference-required" };
        }
        if (!resource.available.url) {
          return { reason: "representation-unavailable" };
        }
        return capabilities.reference.url
          ? { route: { kind: "reference", via: "url" } }
          : { reason: "reference-capability-unavailable" };
      case "host-scope-reference": {
        const scope = resource.available.hostScope;
        if (!scope) return { reason: "representation-unavailable" };
        if (resource.kind !== scope.resource) {
          return {
            reason:
              resource.kind === "directory"
                ? "directory-reference-required"
                : "representation-unavailable",
          };
        }
        if (!capabilities.reference.hostScope[scope.resource]) {
          return { reason: "reference-capability-unavailable" };
        }
        return {
          route: {
            kind: "reference",
            via: "host-scope",
            resource: scope.resource,
          },
        };
      }
      case "provider-url-inline-attachment":
        return providerRoute("url", "inline-bytes", resource, capabilities);
      case "provider-url-remote-attachment":
        return providerRoute("url", "remote-url", resource, capabilities);
      case "provider-bytes-attachment":
        return providerRoute("bytes", "inline-bytes", resource, capabilities);
      case "scratch-attachment": {
        if (resource.kind === "directory") {
          return { reason: "directory-cannot-be-attached" };
        }
        if (!resource.available.bytes) {
          return { reason: "representation-unavailable" };
        }
        const scratch = capabilities.attachment.scratch;
        if (!scratch) return { reason: "scratch-unavailable" };
        if (
          resource.size !== undefined &&
          resource.size > scratch.maxFileBytes
        ) {
          return { reason: "file-too-large" };
        }
        return {
          route: { kind: "attachment", via: "scratch", from: "bytes" },
        };
      }
    }
  }

  function providerRoute(
    from: "url" | "bytes",
    representation: "inline-bytes" | "remote-url",
    resource: Readonly<ResourceFacts>,
    capabilities: Readonly<Capabilities>
  ): { route?: Route; reason?: UnavailableReason } {
    if (resource.kind === "directory") {
      return { reason: "directory-cannot-be-attached" };
    }
    if (
      (from === "url" && !resource.available.url) ||
      (from === "bytes" && !resource.available.bytes)
    ) {
      return { reason: "representation-unavailable" };
    }
    const providerRepresentation = resource.available.provider;
    const possibleMimes =
      from === "bytes"
        ? representation === "inline-bytes"
          ? (providerRepresentation?.fromBytes?.outputMimes ?? [])
          : []
        : representation === "inline-bytes"
          ? (providerRepresentation?.fromUrl?.inlineOutputMimes ?? [])
          : providerRepresentation?.fromUrl?.remoteMime
            ? [providerRepresentation.fromUrl.remoteMime]
            : [];
    if (possibleMimes.length === 0) {
      return { reason: "representation-unavailable" };
    }
    const providerMimes =
      representation === "inline-bytes"
        ? capabilities.attachment.provider.inlineMimes
        : capabilities.attachment.provider.remoteUrlMimes;
    if (!possibleMimes.some((mime) => providerMimes.includes(mime))) {
      return { reason: "provider-capability-unavailable" };
    }
    return {
      route: {
        kind: "attachment",
        via: "provider",
        from,
        representation,
      },
    };
  }
}
import type { ScratchSeedBudget } from "./scratch-seed-budget";
