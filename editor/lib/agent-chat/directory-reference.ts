/** Pure lowering from the composer's honest `directory-ref` parts to the
 * AI-SDK `data-*` context token persisted and claimed by the agent runtime. */
import {
  DIRECTORY_SCOPE_MOUNT_ROOT,
  USER_DIRECTORY_REFERENCES,
  type DirectoryScopeDescriptor,
} from "@grida/agent";
import type { ContextPart } from "./build-agent-send";

type DirectoryPartLike = {
  type: string;
  ref?: unknown;
};

export namespace AgentDirectoryReference {
  /** Lower validated, host-minted descriptors without reclassifying them. */
  export function fromDescriptors(
    descriptors: readonly DirectoryScopeDescriptor[]
  ): ContextPart | null {
    if (descriptors.length === 0) return null;
    return {
      type: USER_DIRECTORY_REFERENCES,
      data: { directories: [...descriptors] },
    };
  }

  export function extract(
    parts: readonly DirectoryPartLike[]
  ): ContextPart | null {
    const directories = parts.flatMap((part) => {
      if (part.type !== "directory-ref" || !isDescriptor(part.ref)) return [];
      return [part.ref];
    });
    return fromDescriptors(directories);
  }

  export function isDescriptor(
    value: unknown
  ): value is DirectoryScopeDescriptor {
    if (!value || typeof value !== "object") return false;
    const ref = value as Record<string, unknown>;
    return (
      ref.kind === "scope" &&
      typeof ref.id === "string" &&
      /^dir_[0-9a-f-]{36}$/i.test(ref.id) &&
      typeof ref.name === "string" &&
      ref.name.length > 0 &&
      ref.name.length <= 255 &&
      ref.path === `${DIRECTORY_SCOPE_MOUNT_ROOT}/${ref.id}` &&
      ref.access === "read"
    );
  }
}
