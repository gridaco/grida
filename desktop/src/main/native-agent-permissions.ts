// GRIDA-SEC-004 / GRIDA-SEC-014 — main-owned native workspace approval.
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { NativeHookLaunchProfile } from "./native-agent-hooks";
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
  /** Desktop-owned state, credentials, media, or other protected locations. */
  protectedPaths: readonly string[];
}>;

export type NativeApprovalReview = Readonly<{
  sessionId: string;
  turnId: string;
  waitId: string;
  sessionRevision: number;
  controlRevision: number;
  directory: string;
  root: string;
  tool: ReadTool;
  relativePath: string;
  query?: string;
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
const issuedReviews = new WeakSet<NativeApprovalReview>();

export class NativeAgentPermissions {
  static readonly capabilities = Object.freeze({
    [SNAPSHOT]: 1,
    [APPROVALS]: 1,
    [ANSWER]: 1,
  } as const);
  static readonly answerMethod = `_${ANSWER}`;

  constructor(
    private readonly request: Request,
    private readonly askRoots: ReadonlyMap<string, string>
  ) {}

  /** Publish a Rust v1 launch profile. The path is stable across exact restarts. */
  static async stage(
    stateDirectory: string,
    workspace: NativeWorkspaceSelection,
    hooks?: NativeHookLaunchProfile
  ): Promise<{
    stateDirectory: string;
    profile: string;
    askRoots: ReadonlyMap<string, string>;
  }> {
    const { data, askRoots } = await this.capture(workspace, hooks);
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
    hooks?: NativeHookLaunchProfile
  ): Promise<{ data: string; askRoots: ReadonlyMap<string, string> }> {
    if (process.platform !== "darwin" && process.platform !== "linux")
      throw new Error("native_agent_permissions_platform_unsupported");
    if (!identity(workspace.id) || workspace.additionalReadRoots.length > 31)
      throw invalidProfile();
    const [primary, ...additional] = await Promise.all(
      [workspace.primary, ...workspace.additionalReadRoots].map(
        captureDirectory
      )
    );
    const directories = [
      { ...primary, read: "allow", ...(hooks ? { commandRead: "allow" } : {}) },
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
    const data = JSON.stringify({
      version: 1,
      workspace: workspace.id,
      revision: "ask-me-v1",
      primary: primary.id,
      directories,
      protectedPaths,
      ...(hooks ? { hooks: hooks.hooks, command: hooks.command } : {}),
    });
    if (Buffer.byteLength(data) > 64 * 1024) throw invalidProfile();
    return {
      data,
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
        this.askRoots
      )
    );
    if (new Set(reviews.map(({ waitId }) => waitId)).size !== reviews.length)
      throw invalidApproval();
    return Object.freeze(reviews);
  }

  /** Use the review returned to main. A retry keeps its original revision basis. */
  async answer(
    review: NativeApprovalReview,
    decision: NativeApprovalDecision
  ): Promise<NativeApprovalReceipt> {
    const { sessionId, turnId, waitId, sessionRevision, controlRevision } =
      review;
    if (
      !issuedReviews.has(review) ||
      this.askRoots.get(review.directory) !== review.root ||
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
  askRoots: ReadonlyMap<string, string>
): NativeApprovalReview {
  const row = object(entry);
  const request = object(row?.request);
  const effect = object(request?.effect);
  if (
    !identity(row?.waitId) ||
    request?.session !== sessionId ||
    request.turn !== turnId ||
    !identity(request.directory) ||
    typeof request.root !== "string" ||
    Buffer.byteLength(request.root) > MAX_PATH_BYTES ||
    askRoots.get(request.directory) !== request.root ||
    effect?.kind !== "read" ||
    !readTool(effect.tool) ||
    typeof effect.relative_path !== "string" ||
    Buffer.byteLength(effect.relative_path) > MAX_PATH_BYTES ||
    path.isAbsolute(effect.relative_path) ||
    effect.relative_path.split("/").includes("..") ||
    (effect.query !== undefined &&
      (typeof effect.query !== "string" ||
        Buffer.byteLength(effect.query) > MAX_QUERY_BYTES))
  )
    throw invalidApproval();
  const review = Object.freeze({
    sessionId,
    turnId,
    waitId: row.waitId,
    sessionRevision,
    controlRevision,
    directory: request.directory,
    root: request.root,
    tool: effect.tool,
    relativePath: effect.relative_path,
    ...(typeof effect.query === "string" ? { query: effect.query } : {}),
  });
  issuedReviews.add(review);
  return review;
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
