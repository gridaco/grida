/**
 * Effectful companion to {@link InputResourcePolicy}.
 *
 * Source adapters describe what they actually hold (browser bytes, a Library
 * URL, an agent-visible path, or a host-mintable directory handle). The pure
 * policy selects one legal route; this module executes that route and returns
 * the representation it actually materialized. A composite route may degrade
 * to either declared single-leg fallback when only one encoder succeeds.
 * Composer cards receive display data only and never become the hidden source
 * of delivery semantics.
 */

import type { FileUIPart } from "ai";
import type { DirectoryScopeDescriptor } from "@grida/agent";
import { AgentDirectoryReference } from "./directory-reference";
import {
  lowerOperableFiles,
  readFileAsBase64,
  type EncodedOperableFile,
  type EncodedOperableResource,
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
        binaryTools?: boolean;
      };
      /**
       * Renderer-memory admission for raw operable twins retained in a draft.
       * Independent of the smaller, submit-time scratch seed budget.
       */
      operableTwinRetention?: {
        maxFiles: number;
        maxTotalBytes: number;
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
        kind: "provider-and-scratch-file";
        /** Original upload metadata and bytes, preserved byte-for-byte. */
        mimeType: string;
        size: number;
        base64: string;
        /** Provider-processed representation used for immediate perception. */
        provider: {
          name: string;
          mimeType: string;
          size: number;
          url: string;
          representation: "inline-bytes";
        };
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
        /** Stable prepared-resource identity retained by ComposerCore. */
        id: string;
        name: string;
        mime?: string;
        size?: number;
        path?: string;
        url?: string;
      }
    | {
        kind: "directory";
        /** Stable prepared-resource identity retained by ComposerCore. */
        id: string;
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
        /** The route actually materialized after effect-level fallback. */
        materializedRoute: InputResourcePolicy.Route;
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
    /** Final route selected for each successfully lowered resource. */
    routes: Array<{
      attachmentId: string;
      route: InputResourcePolicy.Route;
    }>;
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

  /**
   * Raw twins are base64 strings retained with the composer draft. Bound that
   * memory independently of the one-turn scratch budget: resources admitted
   * here can still be reallocated dynamically if other chips/reservations
   * change before submit; later rasters use the declared provider-only fallback.
   */
  export const OPERABLE_TWIN_RETENTION_LIMITS = {
    maxFiles: 16,
    maxTotalBytes: 32 * 1024 * 1024,
  } as const;

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
   * Preflight mandatory scratch-only members as one atomic batch before their
   * bytes are read. Composite rasters retain both per-file representations;
   * their optional scratch legs are allocated against the current aggregate
   * only at final lowering, so draft removal or reservation changes can restore
   * operability without rereading the user's source.
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
    const existingRequiredScratch = existing.flatMap((resource) =>
      resource.kind === "scratch-file" ? [{ size: resource.size }] : []
    );
    const incomingRequiredScratch = plans.flatMap(({ decision, facts }) =>
      isScratchOnlyDecision(decision) ? [{ size: facts.size ?? 0 }] : []
    );
    const requiredScratchRejection = scratchBatchRejection(
      [...existingRequiredScratch, ...incomingRequiredScratch],
      environment.attachment.scratch
    );
    const retainedTwins = existing.flatMap((resource) =>
      resource.kind === "provider-and-scratch-file"
        ? [{ size: resource.size }]
        : []
    );
    const retentionLimits =
      environment.attachment.operableTwinRetention ??
      OPERABLE_TWIN_RETENTION_LIMITS;
    for (const plan of plans) {
      if (!isProviderAndScratchDecision(plan.decision)) continue;
      const rejected = retainedTwinBatchRejection(
        [...retainedTwins, { size: plan.facts.size ?? 0 }],
        retentionLimits
      );
      if (rejected) {
        plan.decision = fallbackWithoutScratch(
          plan.facts,
          available,
          config,
          rejected
        );
      } else {
        retainedTwins.push({ size: plan.facts.size ?? 0 });
      }
    }
    const effects = { ...DEFAULT_EFFECTS, ...environment.effects };
    return Promise.all(
      plans.map(async ({ input, decision }): Promise<PrepareResult> => {
        if (decision.status === "reject") {
          return { status: "reject", reason: decision.reason, decision };
        }
        if (requiredScratchRejection && isScratchOnlyDecision(decision)) {
          return {
            status: "reject",
            decision,
            reason: requiredScratchRejection,
          };
        }
        try {
          const resource = await execute(
            input,
            decision.route,
            environment,
            effects
          );
          return resource
            ? {
                status: "accept",
                decision,
                materializedRoute: routeForPrepared(resource),
                resource,
              }
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
          id: resource.sourceId,
          name: resource.name,
          mime: resource.mimeType,
          size: resource.size,
          url: resource.url,
        };
      case "provider-and-scratch-file":
        return {
          kind: "file",
          id: resource.sourceId,
          name: resource.name,
          mime: resource.mimeType,
          size: resource.size,
          url: resource.provider.url,
        };
      case "scratch-file":
        return {
          kind: "file",
          id: resource.sourceId,
          name: resource.name,
          mime: resource.mimeType,
          size: resource.size,
        };
      case "directory-reference":
        return {
          kind: "directory",
          id: resource.sourceId,
          name: resource.name,
          ref: resource.ref,
        };
      case "path-reference":
        return {
          kind: "file",
          id: resource.sourceId,
          name: resource.name,
          mime: resource.mimeType,
          size: resource.size,
          path: resource.path,
        };
      case "url-reference":
        return {
          kind: "file",
          id: resource.sourceId,
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
    const operable: EncodedOperableResource[] = [];
    const scratchCandidates: Array<{
      attachmentId: string;
      resource: {
        name: string;
        mimeType: string;
        size: number;
        base64: string;
      };
      required: boolean;
      providerDelivered: boolean;
      /** Zero-based index among provider-native file parts in this message. */
      providerFileIndex?: number;
    }> = [];
    const directories: DirectoryScopeDescriptor[] = [];
    const references: Reference[] = [];
    const routeByAttachmentId = new Map<string, InputResourcePolicy.Route>();
    const rejected: Lowered["rejected"] = [];

    for (const { attachmentId, resource } of bound) {
      switch (resource.kind) {
        case "provider-file": {
          if (appendProviderFile(files, resource, input.provider)) {
            routeByAttachmentId.set(attachmentId, routeForPrepared(resource));
          } else {
            rejected.push({
              attachmentId,
              reason: "provider-capability-unavailable",
            });
          }
          break;
        }
        case "provider-and-scratch-file": {
          const providerFileIndex = files.length;
          const providerDelivered = appendProviderFile(
            files,
            resource.provider,
            input.provider
          );
          scratchCandidates.push({
            attachmentId,
            resource,
            required: !providerDelivered,
            providerDelivered,
            ...(providerDelivered ? { providerFileIndex } : {}),
          });
          break;
        }
        case "scratch-file":
          scratchCandidates.push({
            attachmentId,
            resource,
            required: true,
            providerDelivered: false,
          });
          break;
        case "directory-reference":
          directories.push(resource.ref);
          routeByAttachmentId.set(attachmentId, routeForPrepared(resource));
          break;
        case "path-reference":
          references.push({
            kind: "path",
            name: resource.name,
            path: resource.path,
            space: resource.space,
          });
          routeByAttachmentId.set(attachmentId, routeForPrepared(resource));
          break;
        case "url-reference":
          references.push({
            kind: "url",
            name: resource.name,
            url: resource.url,
          });
          routeByAttachmentId.set(attachmentId, routeForPrepared(resource));
          break;
      }
    }

    const requiredScratch = scratchCandidates.filter(
      (candidate) => candidate.required
    );
    const optionalScratch = scratchCandidates.filter(
      (candidate) => !candidate.required
    );
    const requiredScratchRejection = scratchBatchRejection(
      requiredScratch.map(({ resource }) => resource),
      input.scratch
    );
    const acceptedScratch: typeof scratchCandidates = [];
    const omittedScratch: Array<{
      candidate: (typeof scratchCandidates)[number];
      reason: InputResourcePolicy.UnavailableReason;
    }> = [];

    if (requiredScratchRejection) {
      for (const candidate of scratchCandidates) {
        omittedScratch.push({
          candidate,
          reason: requiredScratchRejection,
        });
      }
    } else {
      acceptedScratch.push(...requiredScratch);
      for (const candidate of optionalScratch) {
        const rejection = scratchBatchRejection(
          [
            ...acceptedScratch.map(({ resource }) => resource),
            candidate.resource,
          ],
          input.scratch
        );
        if (rejection) {
          omittedScratch.push({ candidate, reason: rejection });
        } else {
          acceptedScratch.push(candidate);
        }
      }
    }

    const acceptedScratchSet = new Set(acceptedScratch);
    for (const candidate of scratchCandidates) {
      const scratchDelivered = acceptedScratchSet.has(candidate);
      if (scratchDelivered) {
        const { attachmentId, resource } = candidate;
        operable.push({
          id: attachmentId,
          name: resource.name,
          mime: resource.mimeType,
          size: resource.size,
          base64: resource.base64,
          ...(candidate.providerFileIndex !== undefined
            ? { providerFileIndex: candidate.providerFileIndex }
            : {}),
        });
      }
      const route =
        scratchDelivered && candidate.providerDelivered
          ? ({
              kind: "attachment",
              via: "provider-and-scratch",
              from: "bytes",
              representation: "inline-bytes",
            } satisfies InputResourcePolicy.Route)
          : scratchDelivered
            ? ({
                kind: "attachment",
                via: "scratch",
                from: "bytes",
              } satisfies InputResourcePolicy.Route)
            : candidate.providerDelivered
              ? ({
                  kind: "attachment",
                  via: "provider",
                  from: "bytes",
                  representation: "inline-bytes",
                } satisfies InputResourcePolicy.Route)
              : undefined;
      if (route) routeByAttachmentId.set(candidate.attachmentId, route);
    }
    for (const { candidate, reason } of omittedScratch) {
      if (candidate.required || !candidate.providerDelivered) {
        rejected.push({ attachmentId: candidate.attachmentId, reason });
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

    const routes = bound.flatMap(({ attachmentId }) => {
      const route = routeByAttachmentId.get(attachmentId);
      return route ? [{ attachmentId, route }] : [];
    });
    return { files, extras, references, routes, rejected };
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
        route.via === "provider-and-scratch" &&
        route.from === "bytes" &&
        route.representation === "inline-bytes"
      ) {
        if (input.kind !== "browser-file") return null;
        const scratch = environment.attachment.scratch;
        if (!scratch) return null;
        const [providerResult, operableResult] = await Promise.allSettled([
          effects.encodeProviderFile(input.file, {
            outputMimes: environment.attachment.provider.inlineMimes,
          }),
          effects.encodeOperableFile(input.file, {
            maxBytes: scratch.maxFileBytes,
          }),
        ]);
        const provider =
          providerResult.status === "fulfilled" &&
          providerResult.value &&
          isValidEncodedProviderFile(
            providerResult.value,
            environment.attachment.provider.inlineMimes
          )
            ? providerResult.value
            : null;
        const operable =
          operableResult.status === "fulfilled" &&
          operableResult.value &&
          isValidEncodedOperableFile(
            operableResult.value,
            input.file.size,
            scratch.maxFileBytes
          )
            ? operableResult.value
            : null;
        if (provider && operable) {
          return {
            ...base,
            kind: "provider-and-scratch-file",
            name: operable.name,
            mimeType: operable.mime,
            size: operable.size,
            base64: operable.base64,
            provider: {
              name: provider.name,
              mimeType: provider.mime,
              size: provider.size,
              url: provider.url,
              representation: "inline-bytes",
            },
          };
        }
        if (provider) {
          return {
            ...base,
            kind: "provider-file",
            name: provider.name,
            mimeType: provider.mime,
            size: provider.size,
            url: provider.url,
            representation: "inline-bytes",
          };
        }
        if (operable) {
          return {
            ...base,
            kind: "scratch-file",
            name: operable.name,
            mimeType: operable.mime,
            size: operable.size,
            base64: operable.base64,
          };
        }
        return null;
      }
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

  function appendProviderFile(
    files: FileUIPart[],
    resource: Readonly<{
      name: string;
      mimeType: string;
      url: string;
      representation: "inline-bytes" | "remote-url";
    }>,
    capability: Readonly<Environment["attachment"]["provider"]>
  ): boolean {
    const supportedMimes =
      resource.representation === "inline-bytes"
        ? capability.inlineMimes
        : capability.remoteUrlMimes;
    if (!supportedMimes.includes(resource.mimeType)) return false;
    files.push({
      type: "file",
      url: resource.url,
      mediaType: resource.mimeType,
      filename: resource.name,
    });
    return true;
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

  function isScratchOnlyDecision(
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

  function isProviderAndScratchDecision(
    decision: InputResourcePolicy.Decision
  ): decision is Extract<InputResourcePolicy.Decision, { status: "accept" }> & {
    route: {
      kind: "attachment";
      via: "provider-and-scratch";
      from: "bytes";
      representation: "inline-bytes";
    };
  } {
    return (
      decision.status === "accept" &&
      decision.route.kind === "attachment" &&
      decision.route.via === "provider-and-scratch"
    );
  }

  function fallbackWithoutScratch(
    facts: Readonly<InputResourcePolicy.ResourceFacts>,
    available: Readonly<InputResourcePolicy.Capabilities>,
    config: InputResourcePolicy.Config,
    reason: InputResourcePolicy.UnavailableReason
  ): InputResourcePolicy.Decision {
    const fallback = InputResourcePolicy.decide(
      facts,
      {
        reference: available.reference,
        attachment: { provider: available.attachment.provider },
      },
      config
    );
    const trace = fallback.trace.map((entry) =>
      entry.preference === "provider-and-scratch-bytes-attachment" &&
      entry.reason === "scratch-unavailable"
        ? { ...entry, reason }
        : entry
    );
    return fallback.status === "accept"
      ? { ...fallback, trace }
      : {
          ...fallback,
          reason:
            fallback.reason === "scratch-unavailable"
              ? reason
              : fallback.reason,
          trace,
        };
  }

  function routeForPrepared(
    resource: Readonly<PreparedResource>
  ): InputResourcePolicy.Route {
    switch (resource.kind) {
      case "provider-file":
        return {
          kind: "attachment",
          via: "provider",
          from: resource.source === "library" ? "url" : "bytes",
          representation: resource.representation,
        };
      case "provider-and-scratch-file":
        return {
          kind: "attachment",
          via: "provider-and-scratch",
          from: "bytes",
          representation: "inline-bytes",
        };
      case "scratch-file":
        return { kind: "attachment", via: "scratch", from: "bytes" };
      case "directory-reference":
        return {
          kind: "reference",
          via: "host-scope",
          resource: "directory",
        };
      case "path-reference":
        return {
          kind: "reference",
          via: "path",
          space: resource.space,
        };
      case "url-reference":
        return { kind: "reference", via: "url" };
    }
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

  function retainedTwinBatchRejection(
    resources: readonly { size: number }[],
    limits: Readonly<
      NonNullable<Environment["attachment"]["operableTwinRetention"]>
    >
  ): InputResourcePolicy.UnavailableReason | null {
    if (resources.length > limits.maxFiles) {
      return "draft-operable-copy-budget-exceeded";
    }
    const totalBytes = resources.reduce(
      (sum, resource) => sum + resource.size,
      0
    );
    return totalBytes > limits.maxTotalBytes
      ? "draft-operable-copy-budget-exceeded"
      : null;
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
