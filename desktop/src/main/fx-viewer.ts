// GRIDA-SEC-016 — FX viewer observations and file intents carry no native authority.
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type {
  DesktopFxViewer,
  NativeEditorObservation,
} from "@grida/desktop-bridge";
import type { ObservedWorkbenchDocument } from "./browser-automation";

const execute = promisify(execFile);
const MAX_FIELD_BYTES = 512;
const MAX_ROUTE_BYTES = 512;
const DIGEST = /^[0-9a-f]{64}$/;
const ENTRY_ROUTE = /^\/p\/([a-f0-9]{64})\/(plans|runs)\/([a-f0-9]{64})\/$/;
const GET_CONTEXT = `() => {
  const viewer = window.fx_viewer;
  return typeof viewer?.getContext === "function"
    ? viewer.getContext({ includeNotes: true, includeValues: true })
    : null;
}`;

type Entry = DesktopFxViewer.Entry;

/** Durable catalog identity. A service address, tab, and document are live observations. */
export type FxViewerReference = Readonly<{
  workspaceId: string;
  entry: Entry;
}>;

type Subject = Readonly<{
  kind: Entry["entry_kind"];
  reference: Entry;
  workflow?: { id: string; source?: string };
}>;

type FileTarget =
  | {
      kind: "source";
      source: string;
      symbol?: string;
      recorded_digest?: string;
    }
  | {
      kind: "artifact";
      artifact: {
        digest: string;
        url: string | null;
        name: string;
        kind: string;
        size: number;
      };
    };

type FileReference = Readonly<{ subject: Subject; target: FileTarget }>;

type Scope = Readonly<{
  workspaceId: string;
  tabId: string;
  url: string;
  selected(): boolean;
  observe(
    url: string,
    script: string,
    signal: AbortSignal
  ): Promise<ObservedWorkbenchDocument | null>;
}>;

type Service = Readonly<{ base: string; instance: string }>;
type ProjectDirectory = Readonly<{ root: string; identity: string }>;

type UnavailableService = "stopped" | "incompatible" | "unavailable";

type ServiceLookup =
  | {
      state: "running";
      service: Service;
      project: ProjectDirectory;
      entry: Entry;
    }
  | { state: UnavailableService };

type Binding = Readonly<{
  project: ProjectDirectory;
  service: Service;
  entry: Entry;
  document: ObservedWorkbenchDocument;
  scope: Scope;
}>;

export type FxResolvedFile = Readonly<{
  workspaceId: string;
  relativePath: string;
}> &
  (
    | {
        artifact: { digest: string; size: number; name: string };
        sourceMatch?: undefined;
      }
    | { sourceMatch: "match" | "changed" | "unknown"; artifact?: undefined }
  );

type FileOpening = Readonly<{
  /** The workbench supplies fresh authority independent of a page message. */
  authorize(reference: FileReference): Promise<boolean>;
  /** Recheck current() at commit. Verify recorded bytes at use and open artifacts read-only. */
  open(
    document: FxResolvedFile,
    current: () => boolean,
    signal: AbortSignal
  ): Promise<boolean>;
}>;

export type FxViewerFileOutcome =
  | "opened"
  | "unavailable"
  | "not_authorized"
  | "stale"
  | "unknown";

export class FxViewer {
  constructor(
    private readonly workspaceProject: (
      workspaceId: string
    ) => Promise<ProjectDirectory | undefined>,
    private readonly command: (
      args: readonly string[],
      signal: AbortSignal
    ) => Promise<unknown>
  ) {}

  static async projectDirectory(
    root: string
  ): Promise<ProjectDirectory | undefined> {
    if (!path.isAbsolute(root)) return undefined;
    const stat = await fs.lstat(root, { bigint: true });
    if (!stat.isDirectory() || (await fs.realpath(root)) !== root)
      return undefined;
    return { root, identity: `${stat.dev}:${stat.ino}:${stat.birthtimeNs}` };
  }

  static async run(
    executable: string,
    args: readonly string[],
    signal: AbortSignal
  ): Promise<unknown> {
    if (!path.isAbsolute(executable)) return null;
    try {
      const { stdout } = await execute(executable, [...args], {
        env: { GRIDA_FX_NETWORK: "off" },
        signal,
        timeout: 4000,
        maxBuffer: 64 * 1024,
      });
      return JSON.parse(stdout) as unknown;
    } catch (error) {
      const failure = error as {
        code?: unknown;
        killed?: boolean;
        stdout?: unknown;
      };
      if (
        !signal.aborted &&
        failure.killed === false &&
        failure.code === 1 &&
        typeof failure.stdout === "string"
      ) {
        try {
          return JSON.parse(failure.stdout) as unknown;
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  async resolvePreview(
    reference: { workspaceId: string; entry: unknown },
    signal: AbortSignal
  ): Promise<DesktopFxViewer.Preview> {
    try {
      const result = await this.serviceFor(reference, signal);
      if (result.state !== "running") return result;
      const entry = result.entry;
      return {
        state: "service_ready",
        url: `${result.service.base}/p/${entry.project_id}/${entry.entry_kind}s/${entry.entry_id}/`,
      };
    } catch {
      return { state: "unavailable" };
    }
  }

  async captureSelected(
    scope: Scope,
    signal: AbortSignal
  ): Promise<NativeEditorObservation | null> {
    try {
      const binding = await this.bind(scope, signal);
      const context = binding && this.context(binding);
      if (!binding || !context || !(await this.recheck(binding, signal)))
        return null;
      return {
        kind: "selection",
        surface: "fx-viewer",
        sampledAt: context.sampledAt,
        payload: {
          tabId: scope.tabId,
          documentId: binding.document.id,
          subject: context.subject,
          scopeId: context.scopeId,
          selection: context.selection,
          ...(context.retained ? { retained: true } : {}),
        },
      };
    } catch {
      return null;
    }
  }

  /** Consumes a portable activation only with an independently authorized workbench action. */
  async activateFile(
    scope: Scope,
    raw: unknown,
    opening: FileOpening,
    signal: AbortSignal
  ): Promise<FxViewerFileOutcome> {
    let dispatched = false;
    try {
      const reference = fileReference(raw);
      if (!reference) return "unavailable";
      const binding = await this.bind(scope, signal);
      if (!binding) return "unavailable";
      if (
        !sameEntry(reference.subject.reference, binding.entry) ||
        !this.context(binding)
      )
        return "stale";
      const current = () =>
        !signal.aborted && scope.selected() && binding.document.current();
      if (!current()) return "stale";
      if (!(await opening.authorize(reference))) return "not_authorized";
      if (!(await this.recheckFile(binding, signal))) return "stale";
      const result = await this.command(
        [
          "files",
          "resolve",
          "--service-entry",
          "--project",
          binding.project.root,
          "--reference",
          JSON.stringify(reference),
          "--json",
        ],
        signal
      );
      const document = fileDocument(binding, reference, result);
      if (!document) return "unavailable";
      if (!(await this.recheckFile(binding, signal))) return "stale";
      dispatched = true;
      if (!(await opening.open(document, current, signal)))
        return current() ? "unavailable" : "stale";
      return binding.document.current() && !signal.aborted
        ? "opened"
        : "unknown";
    } catch {
      return dispatched ? "unknown" : "unavailable";
    }
  }

  private async bind(
    scope: Scope,
    signal: AbortSignal
  ): Promise<Binding | null> {
    const destination = entryDestination(scope.url);
    if (!destination || !scope.selected() || signal.aborted) return null;
    const { entry, base } = destination;
    const lookup = await this.serviceFor(
      { workspaceId: scope.workspaceId, entry },
      signal
    );
    if (
      lookup.state !== "running" ||
      lookup.service.base !== base ||
      !scope.selected() ||
      signal.aborted
    )
      return null;
    const document = await scope.observe(scope.url, GET_CONTEXT, signal);
    return document?.current() && scope.selected()
      ? {
          entry,
          project: lookup.project,
          service: lookup.service,
          document,
          scope,
        }
      : null;
  }

  private async recheck(
    binding: Binding,
    signal: AbortSignal
  ): Promise<boolean> {
    const current = () =>
      !signal.aborted && binding.scope.selected() && binding.document.current();
    if (!current()) return false;
    const lookup = await this.serviceFor(
      { workspaceId: binding.scope.workspaceId, entry: binding.entry },
      signal
    );
    return (
      lookup.state === "running" &&
      sameProject(lookup.project, binding.project) &&
      lookup.service.instance === binding.service.instance &&
      lookup.service.base === binding.service.base &&
      current()
    );
  }

  private async recheckFile(
    binding: Binding,
    signal: AbortSignal
  ): Promise<boolean> {
    if (!(await this.recheck(binding, signal))) return false;
    const { scope } = binding;
    const document = await scope.observe(scope.url, GET_CONTEXT, signal);
    return (
      document?.id === binding.document.id &&
      document.current() &&
      scope.selected() &&
      this.context({ ...binding, document }) !== null
    );
  }

  private async serviceFor(
    reference: { workspaceId: string; entry: unknown },
    signal: AbortSignal
  ): Promise<ServiceLookup> {
    const unavailable = { state: "unavailable" } as const;
    const entry = parseEntry(reference.entry);
    if (
      !entry ||
      !/^[a-f0-9]{16}$/.test(reference.workspaceId) ||
      signal.aborted
    )
      return unavailable;
    const project = await this.workspaceProject(reference.workspaceId);
    if (!project || !path.isAbsolute(project.root) || signal.aborted)
      return unavailable;
    const status = record(
      await this.command(
        ["status", "--project-root", project.root, "--json"],
        signal
      )
    );
    if (
      status?.kind !== "fx-service-status-v1" ||
      status.protocol_version !== 1 ||
      status.project_id !== entry.project_id ||
      signal.aborted ||
      !sameProject(
        await this.workspaceProject(reference.workspaceId),
        project
      ) ||
      signal.aborted
    )
      return unavailable;
    if (status.state === "stopped" || status.state === "incompatible")
      return { state: status.state };
    const base = loopback(status.url);
    return status.state === "running" &&
      digest(status.instance_id) &&
      base?.pathname === "/"
      ? {
          state: "running",
          project,
          entry,
          service: { base: base.origin, instance: status.instance_id },
        }
      : unavailable;
  }

  private context(binding: Binding) {
    const raw = record(binding.document.value);
    const subject = parseSubject(raw?.subject);
    const sampledAt = raw?.sampled_at;
    const scopeId = raw?.scope_id;
    if (
      !subject ||
      !sameEntry(subject.reference, binding.entry) ||
      typeof sampledAt !== "number" ||
      !Number.isSafeInteger(sampledAt) ||
      sampledAt < 1 ||
      sampledAt > 8.64e15 ||
      (scopeId !== null && !evidenceId(scopeId)) ||
      (raw?.retained !== undefined && raw.retained !== true)
    )
      return null;
    const selection =
      raw?.selection === null ? null : parseSelection(raw?.selection);
    if (!selection && raw?.selection !== null) return null;
    return {
      subject,
      sampledAt,
      scopeId,
      selection,
      retained: raw?.retained === true,
    };
  }
}

function entryDestination(
  value: string
): { entry: Entry; base: string } | null {
  const url = loopback(value);
  const parts = url?.pathname.match(ENTRY_ROUTE);
  if (!url || !parts) return null;
  return {
    base: url.origin,
    entry: {
      kind: "service_entry",
      project_id: parts[1]!,
      entry_kind: parts[2] === "plans" ? "plan" : "run",
      entry_id: parts[3]!,
    },
  };
}

function loopback(value: unknown): URL | null {
  if (
    typeof value !== "string" ||
    value.length > MAX_ROUTE_BYTES ||
    !URL.canParse(value)
  )
    return null;
  const url = new URL(value);
  return url.href === value &&
    url.protocol === "http:" &&
    url.hostname === "127.0.0.1" &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash
    ? url
    : null;
}

function parseSubject(value: unknown): Subject | null {
  const subject = record(value);
  const reference = parseEntry(subject?.reference);
  if (!reference || reference.entry_kind !== subject?.kind) return null;
  const workflow = record(subject?.workflow);
  return {
    kind: reference.entry_kind,
    reference,
    ...(evidenceId(workflow?.id) && {
      workflow: {
        id: workflow.id,
        ...(portableSource(workflow.source) && { source: workflow.source }),
      },
    }),
  };
}

function parseEntry(value: unknown): Entry | null {
  const entry = record(value);
  if (
    entry?.kind !== "service_entry" ||
    Object.keys(entry).length !== 4 ||
    !digest(entry.project_id) ||
    !digest(entry.entry_id) ||
    (entry.entry_kind !== "plan" && entry.entry_kind !== "run")
  )
    return null;
  return {
    kind: "service_entry",
    project_id: entry.project_id,
    entry_kind: entry.entry_kind,
    entry_id: entry.entry_id,
  };
}

function parseSelection(
  value: unknown
): Record<string, string | number[] | null> | null {
  const selection = record(value);
  if (!selection) return null;
  const {
    kind,
    instance_id,
    path,
    step,
    take,
    scope_id,
    note_id,
    value_id,
    side,
  } = selection;
  switch (kind) {
    case "instance":
      if (!evidenceId(instance_id)) return null;
      return {
        kind,
        instance_id,
        ...(evidenceId(path) && { path }),
        ...(evidenceId(step) && { step }),
        ...(Array.isArray(take) &&
          take.length > 0 &&
          take.length <= 32 &&
          take.every(
            (item: unknown) =>
              typeof item === "number" && Number.isSafeInteger(item) && item > 0
          ) && { take: take as number[] }),
      };
    case "pending_repeat":
      return evidenceId(path) ? { kind, path } : null;
    case "scope":
      return evidenceId(scope_id) ? { kind, scope_id } : null;
    case "scope_boundary":
      return evidenceId(scope_id) && (side === "input" || side === "output")
        ? { kind, scope_id, side }
        : null;
    case "note":
      return evidenceId(note_id) && (scope_id === null || evidenceId(scope_id))
        ? { kind, note_id, scope_id }
        : null;
    case "value":
      return evidenceId(value_id) && (scope_id === null || evidenceId(scope_id))
        ? { kind, value_id, scope_id }
        : null;
    default:
      return null;
  }
}

function fileReference(value: unknown): FileReference | null {
  const ref = record(value);
  const subject = parseSubject(ref?.subject);
  const target = record(ref?.target);
  if (!subject || !target) return null;
  if (
    target.kind === "source" &&
    portableSource(target.source) &&
    (target.symbol === undefined ||
      (identifier(target.symbol) &&
        /^[A-Za-z_][A-Za-z_0-9]*$/.test(target.symbol))) &&
    (target.recorded_digest === undefined || digest(target.recorded_digest))
  ) {
    return {
      subject,
      target: {
        kind: "source",
        source: target.source,
        ...(typeof target.symbol === "string" && { symbol: target.symbol }),
        ...(typeof target.recorded_digest === "string" && {
          recorded_digest: target.recorded_digest,
        }),
      },
    };
  }
  const artifact = record(target.artifact);
  if (
    target.kind !== "artifact" ||
    !artifact ||
    !digest(artifact.digest) ||
    !identifier(artifact.kind) ||
    !evidenceId(artifact.name) ||
    typeof artifact.size !== "number" ||
    !Number.isSafeInteger(artifact.size) ||
    artifact.size < 0
  )
    return null;
  // Native lookup matches recorded evidence. The guest's link URL has no role in resolution.
  return {
    subject,
    target: {
      kind: "artifact",
      artifact: {
        digest: artifact.digest,
        url: null,
        name: artifact.name,
        kind: artifact.kind,
        size: artifact.size,
      },
    },
  };
}

function fileDocument(
  binding: Binding,
  reference: FileReference,
  value: unknown
): FxResolvedFile | null {
  const result = record(value);
  const target = record(result?.target);
  const localPath = result?.local_path;
  if (
    result?.kind !== "fx-file-resolution-v1" ||
    typeof localPath !== "string" ||
    localPath.length > 4096 ||
    !path.isAbsolute(localPath) ||
    target?.kind !== reference.target.kind
  )
    return null;
  const relativePath = path.relative(binding.project.root, localPath);
  if (
    !relativePath ||
    path.isAbsolute(relativePath) ||
    relativePath.split(path.sep).includes("..") ||
    relativePath.includes("\\") ||
    relativePath.includes("\0")
  )
    return null;
  const workspaceId = binding.scope.workspaceId;
  if (reference.target.kind === "source") {
    const sourceMatch = result.source_match;
    return target.source === reference.target.source &&
      (sourceMatch === "match" ||
        sourceMatch === "changed" ||
        sourceMatch === "unknown")
      ? { workspaceId, relativePath, sourceMatch }
      : null;
  }
  const expected = reference.target.artifact;
  const artifact = record(target.artifact);
  return artifact?.digest === expected.digest &&
    artifact.size === expected.size &&
    result.source_match === null
    ? {
        workspaceId,
        relativePath,
        artifact: {
          digest: expected.digest,
          size: expected.size,
          name: evidenceId(artifact.name)
            ? artifact.name
            : path.basename(relativePath),
        },
      }
    : null;
}

function sameEntry(a: Entry, b: Entry): boolean {
  return (
    a.project_id === b.project_id &&
    a.entry_id === b.entry_id &&
    a.entry_kind === b.entry_kind
  );
}

function sameProject(
  a: ProjectDirectory | undefined,
  b: ProjectDirectory
): boolean {
  return a?.root === b.root && a.identity === b.identity;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function identifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    Buffer.byteLength(value) <= MAX_FIELD_BYTES &&
    !/[\p{Cc}\p{Cs}]/u.test(value)
  );
}

function evidenceId(value: unknown): value is string {
  return identifier(value) && !/^[\\/]|^[A-Za-z]:|^file:|:\/\//i.test(value);
}

function portableSource(value: unknown): value is string {
  return (
    identifier(value) &&
    !/[\\:]/.test(value) &&
    value.split("/").every((part) => part && part !== "." && part !== "..")
  );
}

function digest(value: unknown): value is string {
  return typeof value === "string" && DIGEST.test(value);
}
