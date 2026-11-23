// GRIDA-SEC-004 / GRIDA-SEC-014 — main-owned native workspace approval.
import { createHash } from "node:crypto";
import type {
  NativeChatApprovalAction,
  NativeChatCommandScope,
  NativeChatEscalatedCommandNetwork,
  NativeApprovalReviewFailure,
} from "@grida/desktop-bridge";
import fs from "node:fs/promises";
import path from "node:path";
import type { NativeHookLaunchProfile } from "./native-agent-hooks";
import type { NativeCommandProfile } from "./native-agent-command-profile";
import {
  atomicWrite,
  type WorkspaceDirectoryIdentity,
} from "@grida/daemon/server";

const SNAPSHOT = "co.grida/session/snapshot";
const APPROVALS = "co.grida/session/approvals";
const ANSWER = "co.grida/session/answer-approval";
const ID = /^[A-Za-z0-9_.:@/-]{1,256}$/;
const READ_TOOLS = ["read_file", "list_files", "search_text"] as const;
const MAX_PATH_BYTES = 4096;
const MAX_QUERY_BYTES = 128;
// The native exec_command tool accepts up to 64 KiB of encoded arguments.
const MAX_COMMAND_BYTES = 64 * 1024;
type ReadTool = (typeof READ_TOOLS)[number];

type Directory = Readonly<{
  id: string;
  name: string;
  path: string;
  identity?: WorkspaceDirectoryIdentity;
}>;

/** Selected by main from native workspace and folder-selection authority. */
export type NativeWorkspaceSelection = Readonly<{
  id: string;
  primary: Directory;
  additionalReadRoots: readonly Directory[];
  /** The full workspace chat may request per-action access. */
  allowScopedAccess?: true;
  /** Desktop-owned state, credentials, media, or other protected locations. */
  protectedPaths: readonly string[];
}>;

type ApprovalBasis = Readonly<{
  sessionId: string;
  turnId: string;
  waitId: string;
  sessionRevision: number;
  controlRevision: number;
  directory: string;
  root: string;
  reviewing?: true;
  reviewFailure?: NativeApprovalReviewFailure;
}>;

export type NativeApprovalReview = ApprovalBasis & NativeChatApprovalAction;

type ScopedAccess = Readonly<{
  commandEscalation?: boolean;
  project: { id: string; path: string };
  protectedPaths: readonly string[];
  workspaceId: string;
}>;

export type NativeApprovalDecision = "approve_once" | "decline";
export type NativeApprovalReceipt = Readonly<{
  sessionId: string;
  turnId: string;
  requestId: string;
  sessionRevision: number;
  journalPosition: number;
}>;

type Request = (method: string, params: unknown) => Promise<unknown>;

// A lost native response can be retried after the same workspace host reopens.
const issuedReviews = new WeakMap<NativeApprovalReview, string>();

export class NativeAgentPermissions {
  private readonly authority: string;

  static readonly capabilities = Object.freeze({
    [SNAPSHOT]: 1,
    [APPROVALS]: 1,
    [ANSWER]: 1,
  } as const);
  static readonly reconsideration = "co.grida/session/reconsider-denial";
  static readonly answerMethod = `_${ANSWER}`;

  constructor(
    private readonly request: Request,
    private readonly askRoots: ReadonlyMap<string, string>,
    private readonly scopedAccess?: ScopedAccess
  ) {
    this.authority = digest(
      JSON.stringify([
        [...askRoots].sort(([a], [b]) => a.localeCompare(b)),
        scopedAccess,
      ])
    );
  }

  /** Publish a Rust v1 launch profile. The path is stable across exact restarts. */
  static async stage(
    stateDirectory: string,
    workspace: NativeWorkspaceSelection,
    hooks?: NativeHookLaunchProfile,
    command?: NativeCommandProfile
  ): Promise<{
    stateDirectory: string;
    profile: string;
    askRoots: ReadonlyMap<string, string>;
    scopedAccess?: ScopedAccess;
  }> {
    const { data, askRoots, scopedAccess } = await this.capture(
      workspace,
      hooks,
      command
    );
    // Use a content-derived filename so competing launches with different
    // trusted selections cannot exchange profile files before either starts.
    const base = await fs.realpath(path.dirname(stateDirectory));
    const directory = path.join(base, path.basename(stateDirectory));
    await fs
      .mkdir(directory, { mode: 0o700 })
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "EEXIST") throw error;
      });
    const metadata = await fs.lstat(directory);
    if (
      !metadata.isDirectory() ||
      metadata.uid !== process.geteuid?.() ||
      (metadata.mode & 0o7777) !== 0o700 ||
      (await fs.realpath(directory)) !== directory
    )
      throw new Error("native_agent_permission_state_not_private");
    const profile = path.join(directory, `permissions-${digest(data)}.json`);
    await atomicWrite(profile, data, { mode: 0o600, ensure_dir: false });
    return {
      stateDirectory: directory,
      profile,
      askRoots,
      scopedAccess,
    };
  }

  /** Validate a proposed hook selection without publishing a file or changing live work. */
  static async validateHookProfile(
    workspace: NativeWorkspaceSelection,
    hooks?: NativeHookLaunchProfile
  ): Promise<void> {
    await this.capture(workspace, hooks);
  }

  private static async capture(
    workspace: NativeWorkspaceSelection,
    hooks?: NativeHookLaunchProfile,
    command?: NativeCommandProfile
  ): Promise<{
    data: string;
    askRoots: ReadonlyMap<string, string>;
    scopedAccess?: ScopedAccess;
  }> {
    if (process.platform !== "darwin" && process.platform !== "linux")
      throw new Error("native_agent_permissions_platform_unsupported");
    if (!identity(workspace.id) || workspace.additionalReadRoots.length > 31)
      throw invalidProfile();
    const [primary, ...additional] = await Promise.all(
      [workspace.primary, ...workspace.additionalReadRoots].map(
        captureDirectory
      )
    );
    // Default preset: read, write and run commands in the project, under the
    // sandbox. See the permission policy.
    const directories = [
      {
        ...primary,
        read: "allow",
        ...(command
          ? { write: "allow", commandRead: "allow", commandReadWrite: "allow" }
          : hooks
            ? { commandRead: "allow" }
            : {}),
      },
      ...additional.map((directory) => ({ ...directory, read: "ask" })),
    ];
    if (
      new Set(directories.map((entry) => entry.id)).size !==
        directories.length ||
      new Set(directories.map((entry) => entry.path)).size !==
        directories.length
    )
      throw invalidProfile();

    const protectedPaths = [...new Set(workspace.protectedPaths)].sort();
    if (protectedPaths.some((entry) => !path.isAbsolute(entry)))
      throw invalidProfile();
    const scopedAccess =
      command && workspace.allowScopedAccess
        ? { workspaceId: workspace.id, project: primary, protectedPaths }
        : undefined;
    const data = JSON.stringify({
      version: 1,
      workspace: workspace.id,
      revision: command ? "default-v1" : "ask-me-v1",
      primary: primary.id,
      directories,
      protectedPaths,
      ...(command ? { allowFullAccess: true } : {}),
      ...(hooks ? { hooks: hooks.hooks } : {}),
      ...(command ? { command } : hooks ? { command: hooks.command } : {}),
    });
    if (Buffer.byteLength(data) > 64 * 1024) throw invalidProfile();
    return {
      data,
      scopedAccess,
      askRoots: new Map(additional.map((entry) => [entry.id, entry.path])),
    };
  }

  async list(
    sessionId: string,
    turnId: string
  ): Promise<readonly NativeApprovalReview[]> {
    if (!identity(sessionId) || !identity(turnId)) throw invalidApproval();
    const snapshot = object(await this.request(`_${SNAPSHOT}`, { sessionId }));
    const turn = [object(snapshot?.current), object(snapshot?.latest)].find(
      (value) => value?.turnId === turnId
    );
    const sessionRevision = snapshot?.sessionRevision;
    const controlRevision = turn?.controlRevision;
    if (
      snapshot?.sessionId !== sessionId ||
      !revision(sessionRevision) ||
      !revision(controlRevision)
    )
      throw invalidApproval();
    const pending = object(
      await this.request(`_${APPROVALS}`, { sessionId, turnId })
    );
    if (
      pending?.sessionId !== sessionId ||
      pending.turnId !== turnId ||
      pending.controlRevision !== controlRevision ||
      !Array.isArray(pending.approvals)
    )
      throw invalidApproval();
    const reviews = pending.approvals.map((entry: unknown) =>
      readReview(
        entry,
        sessionId,
        turnId,
        sessionRevision,
        controlRevision,
        this.askRoots,
        this.scopedAccess
      )
    );
    if (new Set(reviews.map(({ waitId }) => waitId)).size !== reviews.length)
      throw invalidApproval();
    const actionable = reviews.filter((review) => !review.reviewing);
    for (const review of actionable) issuedReviews.set(review, this.authority);
    return Object.freeze(actionable);
  }

  async reconsiderDenial(
    sessionId: string,
    turnId: string,
    reviewId: string
  ): Promise<void> {
    if (!identity(sessionId) || !identity(turnId) || !identity(reviewId))
      throw invalidApproval();
    const result = object(
      await this.request(`_${NativeAgentPermissions.reconsideration}`, {
        sessionId,
        turnId,
        reviewId,
      })
    );
    if (result?.recorded !== true) throw invalidApproval();
  }

  /** Use the review returned to main. A retry keeps its original revision basis. */
  async answer(
    review: NativeApprovalReview,
    decision: NativeApprovalDecision
  ): Promise<NativeApprovalReceipt> {
    const { sessionId, turnId, waitId, sessionRevision, controlRevision } =
      review;
    if (
      issuedReviews.get(review) !== this.authority ||
      (decision === "approve_once" &&
        review.tool === "exec_command" &&
        (!review.scope ||
          (review.sandboxPermissions === "require_escalated" &&
            (!review.access || !review.network)))) ||
      (decision !== "approve_once" && decision !== "decline")
    )
      throw invalidApproval();
    const requestId = `desktop-approval-${digest(
      JSON.stringify([
        sessionId,
        turnId,
        waitId,
        sessionRevision,
        controlRevision,
      ])
    )}`;
    const receipt = object(
      await this.request(NativeAgentPermissions.answerMethod, {
        sessionId,
        turnId,
        waitId,
        requestId,
        expectedSessionRevision: sessionRevision,
        expectedControlRevision: controlRevision,
        decision,
      })
    );
    if (
      receipt?.sessionId !== sessionId ||
      receipt.turnId !== turnId ||
      receipt.requestId !== requestId ||
      !revision(receipt.sessionRevision) ||
      !revision(receipt.journalPosition)
    )
      throw invalidApproval();
    return {
      sessionId,
      turnId,
      requestId,
      sessionRevision: receipt.sessionRevision,
      journalPosition: receipt.journalPosition,
    };
  }
}

async function captureDirectory(directory: Directory) {
  if (
    !identity(directory.id) ||
    typeof directory.name !== "string" ||
    !directory.name.trim() ||
    Buffer.byteLength(directory.name) > 128 ||
    !path.isAbsolute(directory.path)
  )
    throw invalidProfile();
  const root = await fs.realpath(directory.path);
  const metadata = await fs.lstat(root, { bigint: true });
  const expected = directory.identity;
  if (
    root !== directory.path ||
    !metadata.isDirectory() ||
    root === path.parse(root).root ||
    metadata.birthtimeNs <= 0n ||
    (expected &&
      (String(metadata.dev) !== expected.device ||
        String(metadata.ino) !== expected.inode ||
        String(metadata.birthtimeNs) !== expected.birthTimeNs))
  )
    throw invalidProfile();
  const generation = digest(
    `${metadata.dev}:${metadata.ino}:${metadata.birthtimeNs}`
  );
  return { id: directory.id, name: directory.name, path: root, generation };
}

function readReview(
  entry: unknown,
  sessionId: string,
  turnId: string,
  sessionRevision: number,
  controlRevision: number,
  askRoots: ReadonlyMap<string, string>,
  scoped: ScopedAccess | undefined
): NativeApprovalReview {
  const row = object(entry);
  const request = object(row?.request);
  const effect = object(request?.effect);
  if (
    !effect ||
    !identity(row?.waitId) ||
    request?.session !== sessionId ||
    request.turn !== turnId ||
    !identity(request.directory) ||
    typeof request.root !== "string" ||
    Buffer.byteLength(request.root) > MAX_PATH_BYTES
  )
    throw invalidApproval();
  const { directory, root } = request;
  const reviewing = row.reviewing;
  if (reviewing !== undefined && typeof reviewing !== "boolean")
    throw invalidApproval();
  const failure = row.reviewFailure;
  if (
    failure !== undefined &&
    failure !== null &&
    failure !== "timed_out" &&
    failure !== "interrupted" &&
    failure !== "unavailable" &&
    failure !== "invalid_reply" &&
    failure !== "needs_human"
  )
    throw invalidApproval();
  const basis: ApprovalBasis = {
    sessionId,
    turnId,
    waitId: row.waitId,
    sessionRevision,
    controlRevision,
    directory,
    root,
    ...(reviewing && { reviewing }),
    ...(failure && { reviewFailure: failure }),
  };
  if (effect.kind === "command" || effect.kind === "escalated_command") {
    if (
      !scoped ||
      directory !== scoped.project.id ||
      root !== scoped.project.path ||
      !boundedText(effect.command, MAX_COMMAND_BYTES) ||
      !boundedText(effect.cwd, MAX_PATH_BYTES) ||
      !within(root, effect.cwd) ||
      !boundedText(effect.executable, MAX_PATH_BYTES) ||
      !path.isAbsolute(effect.executable)
    )
      throw invalidApproval();
    if (effect.kind === "escalated_command") {
      if (
        !scoped.commandEscalation ||
        !boundedText(effect.justification, 1024) ||
        !effect.justification.trim() ||
        /\p{Cc}/u.test(effect.justification)
      )
        throw invalidApproval();
      const knownEffect = Object.keys(effect).every((key) =>
        [
          "kind",
          "command",
          "justification",
          "cwd",
          "executable",
          "environment_names",
          "filesystem",
          "access",
          "network",
          "listen_port",
        ].includes(key)
      );
      const access = effect.access;
      const knownAccess = access === "read" || access === "read_write";
      const network = escalatedCommandNetwork(effect);
      const reported =
        knownEffect && knownAccess && network
          ? commandScope(effect)
          : undefined;
      const scope =
        reported?.resolvedCwd === effect.cwd &&
        reported.resolvedExecutable === effect.executable &&
        (access !== "read" || reported.writeRoots.length === 0)
          ? reported
          : undefined;
      return Object.freeze({
        ...basis,
        tool: "exec_command",
        sandboxPermissions: "require_escalated",
        command: effect.command,
        executable: effect.executable,
        cwd: effect.cwd,
        justification: effect.justification,
        environmentNames:
          scope?.environmentNames ??
          commandEnvironment(effect.environment_names),
        ...(scope && knownAccess && network && { scope, access, network }),
      });
    }
    if (
      (effect.finite !== undefined && typeof effect.finite !== "boolean") ||
      typeof effect.terminal !== "boolean" ||
      (effect.managed_network !== undefined &&
        typeof effect.managed_network !== "boolean") ||
      (effect.finite === true && (effect.terminal || effect.managed_network)) ||
      (effect.access !== "read" && effect.access !== "read_write")
    )
      throw invalidApproval();
    const network = object(effect.network);
    const knownEffect = Object.keys(effect).every((key) =>
      [
        "kind",
        "command",
        "cwd",
        "executable",
        "environment_names",
        "filesystem",
        "access",
        "terminal",
        "finite",
        "managed_network",
        "network",
      ].includes(key)
    );
    const knownDestination =
      !network ||
      Object.keys(network).every((key) => key === "host" || key === "port");
    const declared =
      knownEffect && knownDestination ? commandScope(effect) : undefined;
    const scope =
      declared?.resolvedCwd === effect.cwd &&
      declared.resolvedExecutable === effect.executable &&
      (effect.access !== "read" || declared.writeRoots.length === 0)
        ? declared
        : undefined;
    const command: Extract<NativeApprovalReview, { tool: "exec_command" }> = {
      ...basis,
      tool: "exec_command" as const,
      command: effect.command,
      cwd: effect.cwd,
      executable: effect.executable,
      access: effect.access,
      ...(effect.finite !== true && {
        process: effect.terminal ? ("terminal" as const) : ("session" as const),
      }),
      ...(effect.managed_network && { managedNetwork: true as const }),
      ...(scope && { scope }),
    };
    if (effect.network === undefined || effect.network === null)
      return Object.freeze(command);
    if (
      !network ||
      !boundedText(network.host, 253) ||
      !/^[a-z0-9.-]+$/.test(network.host) ||
      !commandPort(network.port)
    )
      throw invalidApproval();
    return Object.freeze({
      ...command,
      network: Object.freeze({ host: network.host, port: network.port }),
    });
  }
  const relative = effect.relative_path;
  if (
    typeof relative !== "string" ||
    Buffer.byteLength(relative) > MAX_PATH_BYTES ||
    path.isAbsolute(relative) ||
    relative.includes("\0") ||
    relative.split("/").includes("..")
  )
    throw invalidApproval();
  const external = directory === "external-file" && root === "/";
  if (external) {
    const target = path.join("/", relative);
    if (
      !scoped ||
      effect.kind !== "read" ||
      effect.tool !== "read_file" ||
      effect.query !== undefined ||
      !relative ||
      relative.split("/").some((part) => !part || part === ".") ||
      [
        scoped.project.path,
        ...askRoots.values(),
        ...scoped.protectedPaths,
      ].some((p) => within(p, target))
    )
      throw invalidApproval();
  } else if (askRoots.get(directory) !== root) throw invalidApproval();
  const tool =
    effect.kind === "read" && readTool(effect.tool) ? effect.tool : undefined;
  if (
    !tool ||
    (effect.query !== undefined &&
      (typeof effect.query !== "string" ||
        Buffer.byteLength(effect.query) > MAX_QUERY_BYTES))
  )
    throw invalidApproval();
  return Object.freeze({
    ...basis,
    tool,
    relativePath: relative,
    ...(typeof effect.query === "string" && { query: effect.query }),
  });
}

function escalatedCommandNetwork(
  effect: Record<string, unknown>
): NativeChatEscalatedCommandNetwork | undefined {
  if (effect.network === "denied" && !Object.hasOwn(effect, "listen_port"))
    return Object.freeze({ kind: "denied" });
  if (effect.network === "managed" && !Object.hasOwn(effect, "listen_port"))
    return Object.freeze({ kind: "managed" });
  if (effect.network === "listen" && commandPort(effect.listen_port))
    return Object.freeze({ kind: "listen", port: effect.listen_port });
}

function commandPort(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= 65535
  );
}

function commandScope(
  effect: Record<string, unknown>
): NativeChatCommandScope | undefined {
  if (effect.filesystem == null) return undefined;
  const fs = object(effect.filesystem);
  if (
    fs &&
    !Object.keys(fs).every((key) =>
      [
        "disk_read",
        "read_roots",
        "write_roots",
        "runtime_roots",
        "private_temp_write",
        "resolved_executable",
        "resolved_cwd",
      ].includes(key)
    )
  )
    return undefined;
  if (
    !fs ||
    !boundedText(fs.resolved_executable, MAX_PATH_BYTES) ||
    !path.isAbsolute(fs.resolved_executable) ||
    !boundedText(fs.resolved_cwd, MAX_PATH_BYTES) ||
    !path.isAbsolute(fs.resolved_cwd) ||
    typeof fs.disk_read !== "boolean" ||
    typeof fs.private_temp_write !== "boolean"
  )
    throw invalidApproval();
  const roots = (value: unknown): readonly string[] => {
    if (
      !Array.isArray(value) ||
      value.length > 64 ||
      !value.every(
        (item): item is string =>
          boundedText(item, MAX_PATH_BYTES) && path.isAbsolute(item)
      )
    )
      throw invalidApproval();
    return Object.freeze([...value]);
  };
  return Object.freeze({
    diskRead: fs.disk_read,
    resolvedExecutable: fs.resolved_executable,
    resolvedCwd: fs.resolved_cwd,
    readRoots: roots(fs.read_roots),
    writeRoots: roots(fs.write_roots),
    runtimeRoots: roots(fs.runtime_roots),
    privateTempWrite: fs.private_temp_write,
    environmentNames: commandEnvironment(effect.environment_names),
  });
}

function commandEnvironment(names: unknown): readonly string[] {
  if (
    !Array.isArray(names) ||
    names.length > 512 ||
    !names.every(
      (name): name is string =>
        boundedText(name, 24 * 1024) && !name.includes("=")
    )
  )
    throw invalidApproval();
  return Object.freeze([...names]);
}

function within(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    path.isAbsolute(target) && relative !== ".." && !relative.startsWith("../")
  );
}

function boundedText(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !value.includes("\0") &&
    Buffer.byteLength(value) <= maximum
  );
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readTool(value: unknown): value is ReadTool {
  return READ_TOOLS.some((tool) => tool === value);
}

function identity(value: unknown): value is string {
  return typeof value === "string" && ID.test(value);
}

function revision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function invalidProfile(): Error {
  return new Error("native_agent_permission_profile_invalid");
}

function invalidApproval(): Error {
  return new Error("native_agent_approval_invalid");
}
