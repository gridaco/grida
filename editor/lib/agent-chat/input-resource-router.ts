/**
 * Effectful companion to {@link InputResourcePolicy}.
 *
 * Source adapters describe what they actually hold (browser bytes, a Library
 * URL, an agent-visible path, or a host-mintable directory handle). The pure
 * policy selects one legal route; this module executes exactly that route and
 * returns a typed prepared resource. Composer cards receive display data only
 * and never become the hidden source of delivery semantics.
 */

import type { FileUIPart } from "ai";
import type { DirectoryScopeDescriptor } from "@grida/agent";
import { AgentDirectoryReference } from "./directory-reference";
import {
  lowerOperableFiles,
  readFileAsBase64,
  type EncodedOperableFile,
} from "./file-attachment";
import {
  IMAGE_ATTACHMENT_POLICY,
  IMAGE_TRANSCODE_OUTPUT_MIMES,
  encodeImageFile,
  encodeLibraryImageUrl,
  isSupportedImageType,
} from "./image-attachment";
import { InputResourcePolicy } from "./input-resource-policy";
import { ScratchSeedBudget } from "./scratch-seed-budget";
import type { SendExtras } from "./build-agent-send";

export namespace InputResourceRouter {
  export type BrowserFileSource = "paste" | "picker" | "drop";

  export type Input =
    | {
        kind: "browser-file";
        id: string;
        source: BrowserFileSource;
        file: File;
      }
    | {
        kind: "browser-directory";
        id: string;
        source: "drop";
        directory: File;
      }
    | {
        kind: "library-file";
        id: string;
        source: "library";
        name: string;
        mimeType: string;
        url: string;
        size?: number;
      }
    | {
        kind: "path-reference";
        id: string;
        source: "workspace" | "mention" | "template";
        name: string;
        path: string;
        space: "workspace" | "reference";
        mimeType?: string;
        size?: number;
      };

  /** Dynamic feasibility, deliberately separate from policy preference. */
  export type Environment = {
    reference: {
      path: boolean;
      url: boolean;
      /** Present only when the trusted host can mint a directory scope. */
      attachDirectory?: (directory: File) => Promise<DirectoryScopeDescriptor>;
    };
    attachment: {
      provider: {
        /** Exact native MIME types accepted as inline/data bytes. */
        inlineMimes: readonly string[];
        /** Exact native MIME types accepted as provider-fetchable URLs. */
        remoteUrlMimes: readonly string[];
      };
      /** Present only when this chat has a tool-visible scratch binding. */
      scratch?: ScratchSeedBudget.Limits & {
        reservation?: ScratchSeedBudget.Reservation;
      };
    };
    /** Test/host injection points. Production uses the existing encoders. */
    effects?: Partial<Effects>;
  };

  export type Effects = {
    /** Materialize a byte-backed file for provider-native delivery. */
    encodeProviderFile: (
      file: File,
      capability: { outputMimes: readonly string[] }
    ) => Promise<EncodedProviderFile | null>;
    /** Materialize a URL source into bounded inline/data bytes. */
    encodeProviderUrl: (
      input: { url: string; name: string; mimeType: string },
      capability: { outputMimes: readonly string[] }
    ) => Promise<EncodedProviderFile | null>;
    encodeOperableFile: (
      file: File,
      policy: { readonly maxBytes: number }
    ) => Promise<EncodedOperableFile | null>;
  };

  export type EncodedProviderFile = {
    name: string;
    mime: string;
    size: number;
    url: string;
  };

  type PreparedBase = {
    source: InputResourcePolicy.Source;
    sourceId: string;
    dedupeKey?: string;
    name: string;
    mimeType?: string;
    size?: number;
  };

  export type PreparedResource =
    | (PreparedBase & {
        kind: "provider-file";
        mimeType: string;
        url: string;
        representation: "inline-bytes" | "remote-url";
      })
    | (PreparedBase & {
        kind: "scratch-file";
        mimeType: string;
        size: number;
        base64: string;
      })
    | (PreparedBase & {
        kind: "directory-reference";
        ref: DirectoryScopeDescriptor;
      })
    | (PreparedBase & {
        kind: "path-reference";
        path: string;
        space: "workspace" | "reference";
      })
    | (PreparedBase & {
        kind: "url-reference";
        url: string;
      });

  /** Policy-free shape consumed by the generic composer card API. */
  export type Card =
    | {
        kind: "file";
        name: string;
        mime?: string;
        size?: number;
        path?: string;
        url?: string;
      }
    | {
        kind: "directory";
        name: string;
        ref: DirectoryScopeDescriptor;
      };

  export type PreparationFailure =
    | InputResourcePolicy.UnavailableReason
    | "preparation-failed"
    | "directory-reference-failed";

  export type PrepareResult =
    | {
        status: "accept";
        decision: Extract<InputResourcePolicy.Decision, { status: "accept" }>;
        resource: PreparedResource;
      }
    | {
        status: "reject";
        decision: InputResourcePolicy.Decision;
        reason: PreparationFailure;
      };

  export type BoundResource = {
    /** The stable id assigned by ComposerCore. */
    attachmentId: string;
    resource: PreparedResource;
  };

  export type Reference =
    | {
        kind: "path";
        name: string;
        path: string;
        space: "workspace" | "reference";
      }
    | { kind: "url"; name: string; url: string };

  export type Lowered = {
    files: FileUIPart[];
    extras?: SendExtras;
    references: Reference[];
    rejected: Array<{
      attachmentId: string;
      reason: InputResourcePolicy.UnavailableReason;
    }>;
  };

  const DEFAULT_EFFECTS: Effects = {
    // Today's provider-byte capability is raster-only. A future exact MIME
    // capability can inject a broader encoder without changing route policy.
    encodeProviderFile: (file, capability) =>
      encodeImageFile(file, IMAGE_ATTACHMENT_POLICY, capability.outputMimes),
    encodeProviderUrl: (input, capability) =>
      encodeLibraryImageUrl(
        input.url,
        input.name,
        input.mimeType,
        IMAGE_ATTACHMENT_POLICY,
        capability.outputMimes
      ),
    encodeOperableFile: readFileAsBase64,
  };

  export function capabilities(
    environment: Readonly<Environment>
  ): InputResourcePolicy.Capabilities {
    return {
      reference: {
        path: environment.reference.path,
        url: environment.reference.url,
        hostScope: {
          // There is intentionally no renderer/daemon file-scope contract yet.
          file: false,
          directory: environment.reference.attachDirectory !== undefined,
        },
      },
      attachment: {
        provider: environment.attachment.provider,
        scratch: environment.attachment.scratch,
      },
    };
  }

  export async function prepare(
    input: Readonly<Input>,
    environment: Readonly<Environment>,
    config: InputResourcePolicy.Config = InputResourcePolicy.CURRENT
  ): Promise<PrepareResult> {
    const [result] = await prepareBatch([input], environment, config);
    return result;
  }

  /**
   * Plan a gesture as one atomic batch before any byte-backed scratch input is
   * read. Existing prepared resources and non-composer reservations participate
   * in the same budget, while provider/reference routes remain independent.
   */
  export async function prepareBatch(
    inputs: readonly Readonly<Input>[],
    environment: Readonly<Environment>,
    config: InputResourcePolicy.Config = InputResourcePolicy.CURRENT,
    existing: readonly Readonly<PreparedResource>[] = []
  ): Promise<PrepareResult[]> {
    const available = capabilities(environment);
    const plans = inputs.map((input) => {
      const facts = describe(input);
      return {
        input,
        facts,
        decision: InputResourcePolicy.decide(facts, available, config),
      };
    });
    const existingScratch = existing.flatMap((resource) =>
      resource.kind === "scratch-file" ? [{ size: resource.size }] : []
    );
    const incomingScratch = plans.flatMap(({ decision, facts }) =>
      isScratchDecision(decision) ? [{ size: facts.size ?? 0 }] : []
    );
    const scratchRejection = scratchBatchRejection(
      [...existingScratch, ...incomingScratch],
      environment.attachment.scratch
    );

    const effects = { ...DEFAULT_EFFECTS, ...environment.effects };
    return Promise.all(
      plans.map(async ({ input, decision }): Promise<PrepareResult> => {
        if (decision.status === "reject") {
          return { status: "reject", reason: decision.reason, decision };
        }
        if (scratchRejection && isScratchDecision(decision)) {
          return { status: "reject", decision, reason: scratchRejection };
        }
        try {
          const resource = await execute(
            input,
            decision.route,
            environment,
            effects
          );
          return resource
            ? { status: "accept", decision, resource }
            : {
                status: "reject",
                decision,
                reason: preparationFailure(decision.route),
              };
        } catch {
          return {
            status: "reject",
            decision,
            reason: preparationFailure(decision.route),
          };
        }
      })
    );
  }

  export function card(resource: Readonly<PreparedResource>): Card {
    switch (resource.kind) {
      case "provider-file":
        return {
          kind: "file",
          name: resource.name,
          mime: resource.mimeType,
          size: resource.size,
          url: resource.url,
        };
      case "scratch-file":
        return {
          kind: "file",
          name: resource.name,
          mime: resource.mimeType,
          size: resource.size,
        };
      case "directory-reference":
        return {
          kind: "directory",
          name: resource.name,
          ref: resource.ref,
        };
      case "path-reference":
        return {
          kind: "file",
          name: resource.name,
          mime: resource.mimeType,
          size: resource.size,
          path: resource.path,
        };
      case "url-reference":
        return {
          kind: "file",
          name: resource.name,
          mime: resource.mimeType,
          size: resource.size,
          url: resource.url,
        };
    }
  }

  /**
   * Lower only the typed decisions retained by the composer owner. No card
   * fields or generic payload records are inspected. Provider capability is
   * checked again because the user may switch models after adding an image.
   */
  export function lower(
    bound: readonly BoundResource[],
    input: {
      provider: Environment["attachment"]["provider"];
      scratch?: Environment["attachment"]["scratch"];
    }
  ): Lowered {
    const files: FileUIPart[] = [];
    const operable: Array<EncodedOperableFile & { id: string }> = [];
    const scratchCandidates: Array<{
      attachmentId: string;
      resource: Extract<PreparedResource, { kind: "scratch-file" }>;
    }> = [];
    const directories: DirectoryScopeDescriptor[] = [];
    const references: Reference[] = [];
    const rejected: Lowered["rejected"] = [];

    for (const { attachmentId, resource } of bound) {
      switch (resource.kind) {
        case "provider-file":
          if (
            !(
              resource.representation === "inline-bytes"
                ? input.provider.inlineMimes
                : input.provider.remoteUrlMimes
            ).includes(resource.mimeType)
          ) {
            rejected.push({
              attachmentId,
              reason: "provider-capability-unavailable",
            });
            break;
          }
          files.push({
            type: "file",
            url: resource.url,
            mediaType: resource.mimeType,
            filename: resource.name,
          });
          break;
        case "scratch-file":
          scratchCandidates.push({ attachmentId, resource });
          break;
        case "directory-reference":
          directories.push(resource.ref);
          break;
        case "path-reference":
          references.push({
            kind: "path",
            name: resource.name,
            path: resource.path,
            space: resource.space,
          });
          break;
        case "url-reference":
          references.push({
            kind: "url",
            name: resource.name,
            url: resource.url,
          });
          break;
      }
    }

    const scratchRejection = scratchBatchRejection(
      scratchCandidates.map(({ resource }) => resource),
      input.scratch
    );
    if (scratchRejection) {
      for (const { attachmentId } of scratchCandidates) {
        rejected.push({ attachmentId, reason: scratchRejection });
      }
    } else {
      for (const { attachmentId, resource } of scratchCandidates) {
        operable.push({
          id: attachmentId,
          name: resource.name,
          mime: resource.mimeType,
          size: resource.size,
          base64: resource.base64,
        });
      }
    }

    const upload = lowerOperableFiles(operable, {
      reservedPaths: input.scratch?.reservation?.paths,
    });
    const directoryContext =
      AgentDirectoryReference.fromDescriptors(directories);
    const contexts = [upload.context, directoryContext].filter(
      (context): context is NonNullable<typeof context> => context !== null
    );
    const extras: SendExtras | undefined =
      upload.scratchSeed.length > 0 || contexts.length > 0
        ? {
            ...(upload.scratchSeed.length > 0
              ? { scratchSeed: upload.scratchSeed }
              : {}),
            contexts,
          }
        : undefined;

    return { files, extras, references, rejected };
  }

  export function describe(
    input: Readonly<Input>
  ): InputResourcePolicy.ResourceFacts {
    switch (input.kind) {
      case "browser-file":
        return {
          id: input.id,
          kind: "file",
          name: input.file.name,
          mimeType: input.file.type || undefined,
          size: input.file.size,
          source: input.source,
          media: isSupportedImageType(input.file.type)
            ? "raster-image"
            : "other",
          available: {
            bytes: true,
            ...(isSupportedImageType(input.file.type)
              ? {
                  provider: {
                    fromBytes: {
                      outputMimes: [
                        input.file.type,
                        ...IMAGE_TRANSCODE_OUTPUT_MIMES,
                      ],
                    },
                  },
                }
              : {}),
          },
        };
      case "browser-directory":
        return {
          id: input.id,
          kind: "directory",
          name: input.directory.name,
          source: input.source,
          media: "other",
          available: { hostScope: { resource: "directory" } },
        };
      case "library-file":
        return {
          id: input.id,
          kind: "file",
          name: input.name,
          mimeType: input.mimeType,
          size: input.size,
          source: input.source,
          media: isSupportedImageType(input.mimeType)
            ? "raster-image"
            : "other",
          available: {
            url: true,
            provider: {
              fromUrl: {
                inlineOutputMimes: [
                  input.mimeType,
                  ...IMAGE_TRANSCODE_OUTPUT_MIMES,
                ],
                remoteMime: input.mimeType,
              },
            },
          },
        };
      case "path-reference":
        return {
          id: input.id,
          kind: "file",
          name: input.name,
          mimeType: input.mimeType,
          size: input.size,
          source: input.source,
          media: isSupportedImageType(input.mimeType)
            ? "raster-image"
            : "other",
          available: { path: { space: input.space } },
        };
    }
  }

  async function execute(
    input: Readonly<Input>,
    route: Readonly<InputResourcePolicy.Route>,
    environment: Readonly<Environment>,
    effects: Readonly<Effects>
  ): Promise<PreparedResource | null> {
    const base = preparedBase(input);
    if (route.kind === "attachment") {
      if (
        route.via === "provider" &&
        route.from === "bytes" &&
        route.representation === "inline-bytes"
      ) {
        if (input.kind !== "browser-file") return null;
        const encoded = await effects.encodeProviderFile(input.file, {
          outputMimes: environment.attachment.provider.inlineMimes,
        });
        return encoded &&
          isValidEncodedProviderFile(
            encoded,
            environment.attachment.provider.inlineMimes
          )
          ? {
              ...base,
              kind: "provider-file",
              name: encoded.name,
              mimeType: encoded.mime,
              size: encoded.size,
              url: encoded.url,
              representation: "inline-bytes",
            }
          : null;
      }
      if (
        route.via === "provider" &&
        route.from === "url" &&
        route.representation === "inline-bytes"
      ) {
        if (input.kind !== "library-file") return null;
        const encoded = await effects.encodeProviderUrl(input, {
          outputMimes: environment.attachment.provider.inlineMimes,
        });
        return encoded &&
          isValidEncodedProviderFile(
            encoded,
            environment.attachment.provider.inlineMimes
          )
          ? {
              ...base,
              kind: "provider-file",
              name: encoded.name,
              mimeType: encoded.mime,
              size: encoded.size,
              url: encoded.url,
              representation: "inline-bytes",
            }
          : null;
      }
      if (
        route.via === "provider" &&
        route.from === "url" &&
        route.representation === "remote-url"
      ) {
        if (input.kind !== "library-file") return null;
        return {
          ...base,
          kind: "provider-file",
          mimeType: input.mimeType,
          url: input.url,
          representation: "remote-url",
        };
      }
      if (route.via === "scratch" && route.from === "bytes") {
        if (input.kind !== "browser-file") return null;
        const scratch = environment.attachment.scratch;
        if (!scratch) return null;
        const encoded = await effects.encodeOperableFile(input.file, {
          maxBytes: scratch.maxFileBytes,
        });
        return encoded &&
          isValidEncodedOperableFile(
            encoded,
            input.file.size,
            scratch.maxFileBytes
          )
          ? {
              ...base,
              kind: "scratch-file",
              name: encoded.name,
              mimeType: encoded.mime,
              size: encoded.size,
              base64: encoded.base64,
            }
          : null;
      }
      return null;
    }

    if (route.via === "host-scope") {
      if (
        route.resource !== "directory" ||
        input.kind !== "browser-directory" ||
        !environment.reference.attachDirectory
      ) {
        return null;
      }
      const ref = await environment.reference.attachDirectory(input.directory);
      if (!AgentDirectoryReference.isDescriptor(ref)) return null;
      return {
        ...base,
        kind: "directory-reference",
        name: ref.name,
        dedupeKey: `directory:${ref.id}`,
        ref,
      };
    }
    if (route.via === "path") {
      if (input.kind !== "path-reference") return null;
      return {
        ...base,
        kind: "path-reference",
        path: input.path,
        space: route.space,
      };
    }
    if (route.via === "url") {
      if (input.kind !== "library-file") return null;
      return { ...base, kind: "url-reference", url: input.url };
    }
    return null;
  }

  /**
   * Inline provider delivery has one honest wire shape: a bounded data URL
   * whose declared MIME and decoded byte count match the prepared metadata.
   */
  function isValidEncodedProviderFile(
    encoded: Readonly<EncodedProviderFile>,
    providerMimes: readonly string[]
  ): boolean {
    const prefix = `data:${encoded.mime};base64,`;
    if (!encoded.url.startsWith(prefix)) return false;
    const decoded = canonicalBase64DecodedBytes(
      encoded.url.slice(prefix.length)
    );
    return (
      providerMimes.includes(encoded.mime) &&
      decoded !== null &&
      Number.isSafeInteger(encoded.size) &&
      encoded.size >= 0 &&
      encoded.size === decoded &&
      decoded <= IMAGE_ATTACHMENT_POLICY.maxBytes
    );
  }

  /**
   * Keep injected/test encoders behind the same byte-integrity contract as the
   * default raw-file encoder. The daemon repeats these checks authoritatively,
   * but rejecting here prevents a malformed prepared resource from reaching the
   * composer and turning a later submit into an all-or-nothing run rejection.
   */
  function isValidEncodedOperableFile(
    encoded: Readonly<EncodedOperableFile>,
    sourceBytes: number,
    maxBytes: number
  ): boolean {
    const decoded = canonicalBase64DecodedBytes(encoded.base64);
    return (
      decoded !== null &&
      Number.isSafeInteger(encoded.size) &&
      encoded.size >= 0 &&
      encoded.size === sourceBytes &&
      encoded.size === decoded &&
      decoded <= maxBytes
    );
  }

  /**
   * Validate canonical RFC 4648 base64 and return its decoded byte count without
   * allocating a second multi-megabyte body. The final quantum's unused bits
   * must be zero; accepting e.g. `AB==` would disagree with the daemon's
   * decode-and-reencode canonicality check.
   */
  function canonicalBase64DecodedBytes(base64: string): number | null {
    if (base64.length === 0) return 0;
    if (base64.length % 4 !== 0 || !CANONICAL_BASE64.test(base64)) return null;

    let padding = 0;
    if (base64.endsWith("==")) {
      padding = 2;
      const finalSextet = BASE64_ALPHABET.indexOf(base64[base64.length - 3]);
      if ((finalSextet & 0b1111) !== 0) return null;
    } else if (base64.endsWith("=")) {
      padding = 1;
      const finalSextet = BASE64_ALPHABET.indexOf(base64[base64.length - 2]);
      if ((finalSextet & 0b11) !== 0) return null;
    }
    return (base64.length / 4) * 3 - padding;
  }

  const CANONICAL_BASE64 =
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
  const BASE64_ALPHABET =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  function preparationFailure(
    route: Readonly<InputResourcePolicy.Route>
  ): PreparationFailure {
    return route.kind === "reference" && route.via === "host-scope"
      ? "directory-reference-failed"
      : "preparation-failed";
  }

  function isScratchDecision(
    decision: InputResourcePolicy.Decision
  ): decision is Extract<InputResourcePolicy.Decision, { status: "accept" }> & {
    route: { kind: "attachment"; via: "scratch"; from: "bytes" };
  } {
    return (
      decision.status === "accept" &&
      decision.route.kind === "attachment" &&
      decision.route.via === "scratch"
    );
  }

  function scratchBatchRejection(
    resources: readonly { size: number }[],
    limits:
      | Readonly<NonNullable<Environment["attachment"]["scratch"]>>
      | undefined
  ): InputResourcePolicy.UnavailableReason | null {
    if (resources.length === 0) return null;
    if (!limits) return "scratch-unavailable";
    const reservation = limits.reservation ?? ScratchSeedBudget.NONE;
    if (resources.some((resource) => resource.size > limits.maxFileBytes)) {
      return "file-too-large";
    }
    if (reservation.fileCount + resources.length > limits.maxFiles) {
      return "scratch-file-count-exceeded";
    }
    const totalBytes = resources.reduce(
      (sum, resource) => sum + resource.size,
      reservation.totalBytes
    );
    return totalBytes > limits.maxTotalBytes ? "scratch-budget-exceeded" : null;
  }

  function preparedBase(input: Readonly<Input>): PreparedBase {
    switch (input.kind) {
      case "browser-file":
        return {
          source: input.source,
          sourceId: input.id,
          name: input.file.name,
          mimeType: input.file.type || undefined,
          size: input.file.size,
        };
      case "browser-directory":
        return {
          source: input.source,
          sourceId: input.id,
          name: input.directory.name,
        };
      case "library-file":
        return {
          source: input.source,
          sourceId: input.id,
          dedupeKey: `library:${input.id}`,
          name: input.name,
          mimeType: input.mimeType,
          size: input.size,
        };
      case "path-reference":
        return {
          source: input.source,
          sourceId: input.id,
          dedupeKey: `path:${input.space}:${input.path}`,
          name: input.name,
          mimeType: input.mimeType,
          size: input.size,
        };
    }
  }
}
