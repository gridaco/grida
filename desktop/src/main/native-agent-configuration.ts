// GRIDA-SEC-004 — keep private configuration revisions in Main.
import type { NativeContextLimit } from "@grida/desktop-bridge";
import { NativeAgentFingerprint } from "./native-agent-fingerprint";

type Revision = string | null;
export type ContextLimitBasis = Readonly<
  Omit<NativeContextLimit, "reviewId"> & { revision: Revision }
>;

export class NativeAgentConfiguration {
  static readonly capabilities = {
    "co.grida/config/inspect": 1,
  } as const;

  constructor(
    private readonly request: (
      method: string,
      params: object
    ) => Promise<unknown>
  ) {}

  async inspect(): Promise<ContextLimitBasis> {
    const inspection = record(
      await this.request("_co.grida/config/inspect", {})
    );
    if (
      record(inspection.field).key !== "context.max_input_tokens" ||
      typeof inspection.exact_input_counting !== "boolean"
    )
      throw invalid();
    const fileRevision = revision(inspection.file_revision);
    const active = snapshot(inspection.active);
    const source =
      inspection.file_diagnostic !== null
        ? "invalid"
        : fileRevision === active.revision
          ? "active"
          : "pending";
    return Object.freeze({
      limit: active.limit,
      exactCounting: inspection.exact_input_counting,
      source,
      revision: fileRevision,
    });
  }
}

function snapshot(value: unknown): {
  revision: Revision;
  limit: number | null;
} {
  const active = record(value);
  return {
    revision: revision(active.source_revision),
    limit: contextLimitValue(
      record(record(active.defaults).context).max_input_tokens
    ),
  };
}

function contextLimitValue(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
    throw invalid();
  return value;
}

function revision(value: unknown): Revision {
  if (value === null) return null;
  if (!NativeAgentFingerprint.is(value)) throw invalid();
  return value;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw invalid();
  return value as Record<string, unknown>;
}

function invalid(): Error {
  return new Error("native_context_limit_protocol_invalid");
}
