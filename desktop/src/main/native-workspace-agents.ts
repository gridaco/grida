// GRIDA-SEC-004 — main owns workspace process and provider lifetimes.
import path from "node:path";
import type { Workspace } from "@grida/daemon";
import type { WorkspaceDirectoryIdentity } from "@grida/daemon/server";
import type {
  NativeAgentChat,
  NativeAgentChatLaunch,
} from "./native-agent-chat";
import type { NativeChatStore } from "./native-chat-store";
import { NativeAgentTerminationPending } from "./native-agent-process";
import type { ActiveNativeChat } from "./native-chat-ipc";

/** Live agent processes: workspaces, their connections, documents and decks. */
const MAX_LIVE_WORKSPACES = 8;
type Project =
  | (Pick<Workspace, "id" | "root"> & {
      identity?: WorkspaceDirectoryIdentity;
      requireDirectoryCurrent?: () => void;
      nestedDeck?: {
        parentWorkspaceId: string;
        protectedPaths: readonly string[];
        requireCurrent(): Promise<void>;
      };
    })
  | { id: string; requireCurrent(): void };
type ProviderLaunch = Readonly<{
  launch: Omit<NativeAgentChatLaunch, "stateDirectory" | "cwd">;
  release?: () => void;
}>;
type ChatProfile = Readonly<{
  id: string;
  prepare(signal: AbortSignal): Promise<ProviderLaunch>;
  /** Revalidate the initiating selection without becoming part of its route. */
  admit?(): void;
  /** Publish a new choice only after its worker starts successfully. */
  commit?(): Promise<void>;
}>;
type Owner = {
  active: ActiveNativeChat & { chat: NativeAgentChat };
  gatewayScope?: string;
  release?: () => void;
};
type Slot = {
  workspace: Project;
  profile?: ChatProfile;
  opened: Promise<Owner>;
  visible: Promise<ActiveNativeChat>;
  stopping: AbortController;
  owner?: Owner;
  retirement?: Promise<void>;
};

export class NativeWorkspaceAgents {
  private readonly slots = new Map<string, Slot>();
  private readonly stopping = new AbortController();
  private readonly transitions = new Map<
    string,
    {
      workspace: Project;
      key: string;
      result?: Promise<ActiveNativeChat>;
    }
  >();
  private readonly recoveries = new Set<string>();
  private readonly workspaceGenerations = new Map<string, number>();
  private closed: Promise<void> | undefined;

  constructor(
    private readonly store: Pick<NativeChatStore, "startWorkspace"> &
      Partial<Pick<NativeChatStore, "startDocument">>,
    private readonly prepare: (
      workspace: Project,
      signal: AbortSignal
    ) => Promise<ProviderLaunch>
  ) {}

  current(workspaceId: string, profileId?: string): ActiveNativeChat | null {
    return this.active(slotKey(workspaceId, profileId));
  }

  /** Catalog metadata shares the one workspace store across model profiles. */
  catalogOwner(workspaceId: string): ActiveNativeChat | null {
    for (const [key, slot] of this.slots) {
      if (
        "root" in slot.workspace &&
        !slot.workspace.nestedDeck &&
        slot.workspace.id === workspaceId
      ) {
        const active = this.active(key);
        if (active) return active;
      }
    }
    return null;
  }

  gatewayScope(workspaceId: string, profileId?: string): string | undefined {
    if (profileId === undefined) {
      for (const [key, slot] of this.slots)
        if (
          "root" in slot.workspace &&
          !slot.workspace.nestedDeck &&
          slot.workspace.id === workspaceId &&
          this.active(key) &&
          slot.owner?.gatewayScope
        )
          return slot.owner.gatewayScope;
      return undefined;
    }
    const key = slotKey(workspaceId, profileId);
    return this.active(key)
      ? this.slots.get(key)?.owner?.gatewayScope
      : undefined;
  }

  currentDocument(key: string): ActiveNativeChat | null {
    return this.active(documentSlot(key));
  }

  currentNestedDeck(key: string): ActiveNativeChat | null {
    return this.active(nestedDeckSlot(key));
  }

  private active(key: string): ActiveNativeChat | null {
    if (this.stopping.signal.aborted) return null;
    const slot = this.slots.get(key);
    if (!slot || slot.stopping.signal.aborted) return null;
    try {
      if ("root" in slot.workspace) slot.workspace.requireDirectoryCurrent?.();
    } catch {
      return null;
    }
    const active = slot.owner?.active;
    return active?.chat.connected ? active : null;
  }

  async open(
    workspace: Project,
    profile?: ChatProfile,
    admit?: () => void
  ): Promise<ActiveNativeChat> {
    if (!("root" in workspace) || workspace.nestedDeck)
      return this.openOwned(workspace, profile, admit);
    const existing = this.transitions.get(workspace.id);
    if (existing) {
      if (!sameProject(existing.workspace, workspace, false))
        throw new Error("native_workspace_root_changed");
      for (const slot of this.slots.values())
        if (
          slot.workspace.id === workspace.id &&
          !sameProject(slot.workspace, workspace, false)
        )
          throw new Error("native_workspace_root_changed");
      if (
        existing.key === slotKey(workspace.id, profile?.id) &&
        existing.result &&
        !this.recoveries.has(workspace.id)
      ) {
        (profile?.admit ?? admit)?.();
        const active = await existing.result;
        (profile?.admit ?? admit)?.();
        return active;
      }
      throw new Error("native_chat_model_change_busy");
    }
    const transition: {
      workspace: Project;
      key: string;
      result?: Promise<ActiveNativeChat>;
    } = {
      workspace,
      key: slotKey(workspace.id, profile?.id),
    };
    this.transitions.set(workspace.id, transition);
    try {
      transition.result = this.openOwned(workspace, profile, admit);
      return await transition.result;
    } finally {
      if (!this.recoveries.has(workspace.id))
        this.transitions.delete(workspace.id);
    }
  }

  private async openOwned(
    workspace: Project,
    profile?: ChatProfile,
    admit?: () => void
  ): Promise<ActiveNativeChat> {
    if (this.stopping.signal.aborted) throw closing();
    const { id } = workspace;
    if ("root" in workspace) workspace.requireDirectoryCurrent?.();
    const nested = "root" in workspace ? workspace.nestedDeck : undefined;
    if (nested && profile) throw new Error("native_chat_profiles_unavailable");
    if (
      [...this.slots.values()].some(
        (slot) =>
          "root" in slot.workspace === "root" in workspace &&
          slot.workspace.id === id &&
          slot.stopping.signal.aborted
      )
    )
      throw closing();
    const key =
      "root" in workspace
        ? nested
          ? nestedDeckSlot(id)
          : slotKey(id, profile?.id)
        : documentSlot(id);
    if ("root" in workspace) {
      for (const slot of this.slots.values()) {
        if (
          "root" in slot.workspace &&
          slot.workspace.id === id &&
          !slot.owner?.active.chat.hasExited &&
          !sameProject(slot.workspace, workspace, false)
        )
          throw new Error("native_workspace_root_changed");
      }
    }
    const existing = this.slots.get(key);
    if (existing) {
      const chat = existing.owner?.active.chat;
      if ("root" in existing.workspace)
        existing.workspace.requireDirectoryCurrent?.();
      if (!sameProject(existing.workspace, workspace, chat?.hasExited ?? false))
        throw new Error("native_workspace_root_changed");
      if (!chat || chat.connected) return existing.visible;
      if (!chat.hasExited)
        throw new Error("native_workspace_disconnect_pending");
      existing.stopping.abort();
    } else if (
      this.slots.size >= MAX_LIVE_WORKSPACES &&
      ![...this.slots.values()].some(
        (slot) => "root" in slot.workspace && slot.workspace.id === id
      )
    ) {
      if (this.live() >= MAX_LIVE_WORKSPACES)
        throw new Error("native_workspace_capacity_reached");
      this.reclaimExited(key);
    }

    // The store owns one worker. A different connection may replace it only
    // after native admission has been sealed for every chat in that store.
    const siblings =
      "root" in workspace && !nested
        ? [...this.slots].filter(
            ([other, slot]) =>
              other !== key &&
              "root" in slot.workspace &&
              !slot.workspace.nestedDeck &&
              slot.workspace.id === id
          )
        : [];
    const stopping = new AbortController();
    const signal = AbortSignal.any([this.stopping.signal, stopping.signal]);
    const generation = this.workspaceGenerations.get(id);
    const opened = Promise.resolve().then(async () => {
      const candidate = await (profile
        ? profile.prepare(signal)
        : this.prepare(workspace, signal));
      let handed = false;
      let replaced = false;
      let started: Owner | undefined;
      try {
        if (signal.aborted) throw closing();
        (profile?.admit ?? admit)?.();
        for (const [, sibling] of siblings) {
          const owner = await sibling.opened;
          if (!owner.active.chat.hasExited)
            await owner.active.chat.prepareModelChange();
        }
        if (siblings.length) {
          await this.drain(siblings);
          replaced = true;
        }
        if (existing?.owner) {
          // Exit was observed by the process owner. The store will reconcile
          // retained work; replacing the connection is not a retry of a turn.
          try {
            await existing.owner.active.chat.close();
          } catch {
            // Work cleanup can remain unverified after an abrupt child exit.
          } finally {
            existing.owner.release?.();
          }
        }
        handed = true;
        started = await this.start(workspace, signal, profile, candidate);
        if (signal.aborted) throw closing();
        (profile?.admit ?? admit)?.();
        await profile?.commit?.();
        return started;
      } catch (error) {
        if (!handed) candidate.release?.();
        if (started) {
          try {
            await started.active.chat.close();
          } finally {
            started.release?.();
          }
        }
        // A preparation response may be lost after native admission sealed.
        // Such a worker is replaced with the original route, never unlocked.
        if (
          !signal.aborted &&
          (replaced ||
            siblings.some(
              ([, sibling]) => sibling.owner?.active.chat.modelChangePending
            ))
        ) {
          await this.drain(siblings);
          if (
            signal.aborted ||
            generation !== this.workspaceGenerations.get(id)
          )
            throw closing();
          if (
            error instanceof NativeAgentTerminationPending &&
            !error.hasExited
          ) {
            this.recoveries.add(id);
            void error.terminated
              .then(() => {
                if (
                  !signal.aborted &&
                  generation === this.workspaceGenerations.get(id)
                )
                  return this.restore(siblings);
              })
              .catch(() => {})
              .finally(() => {
                this.recoveries.delete(id);
                this.transitions.delete(id);
              });
          } else {
            try {
              await this.restore(siblings);
            } catch {
              throw new Error("native_chat_model_change_restore_failed");
            }
          }
          throw new Error(
            error instanceof NativeAgentTerminationPending && !error.hasExited
              ? "native_chat_model_change_recovery_pending"
              : "native_chat_model_change_failed_restored",
            { cause: error }
          );
        }
        throw error;
      }
    });
    const visible = opened.then((owner) => {
      if (signal.aborted) throw closing();
      slot.owner = owner;
      return owner.active;
    });
    const slot: Slot = { workspace, profile, opened, visible, stopping };
    this.slots.set(key, slot);
    void opened.catch((error: unknown) => this.retireSlot(key, slot, error));
    return visible;
  }

  /** Slots whose agent process can still run work. */
  private live(): number {
    let live = 0;
    for (const slot of this.slots.values())
      if (!slot.owner?.active.chat.hasExited) live++;
    return live;
  }

  /**
   * An exited agent keeps no work running; release its slot so it does not
   * hold capacity until the same workspace reopens. A reopen replaces it.
   */
  private reclaimExited(except: string): void {
    for (const [key, slot] of this.slots)
      if (key !== except && slot.owner?.active.chat.hasExited)
        void this.drainSlot(key, slot).catch(() => {});
  }

  close(): Promise<void> {
    if (this.closed) return this.closed;
    this.closed = Promise.resolve().then(() => this.drain(this.slots));
    this.stopping.abort();
    return this.closed;
  }

  closeWorkspace(workspaceId: string): Promise<void> {
    this.workspaceGenerations.set(
      workspaceId,
      (this.workspaceGenerations.get(workspaceId) ?? 0) + 1
    );
    return this.drain(
      [...this.slots].filter(
        ([, slot]) =>
          "root" in slot.workspace &&
          (slot.workspace.nestedDeck?.parentWorkspaceId ??
            slot.workspace.id) === workspaceId
      )
    );
  }

  closeDocument(documentKey: string): Promise<void> {
    return this.closeSlot(documentSlot(documentKey));
  }

  closeNestedDeck(key: string): Promise<void> {
    return this.closeSlot(nestedDeckSlot(key));
  }

  private closeSlot(key: string): Promise<void> {
    const slot = this.slots.get(key);
    return slot ? this.drain([[key, slot]]) : Promise.resolve();
  }

  private async start(
    workspace: Project,
    signal: AbortSignal,
    profile?: ChatProfile,
    prepared?: ProviderLaunch
  ): Promise<Owner> {
    const candidate =
      prepared ??
      (await (profile
        ? profile.prepare(signal)
        : this.prepare(workspace, signal)));
    try {
      if (signal.aborted) throw closing();
      const opened = await this.startProject(
        workspace,
        candidate.launch,
        profile
      );
      const identity = "root" in workspace ? workspace.identity : undefined;
      return {
        active: Object.freeze({
          workspaceId: workspace.id,
          ...("root" in workspace && {
            workspaceName: path.basename(workspace.root) || "This project",
          }),
          profileId: profile?.id ?? null,
          ...(identity && { directoryIdentity: identity }),
          chat: opened.chat,
        }),
        gatewayScope: candidate.launch.gatewayScope,
        release: candidate.release,
      };
    } catch (error) {
      try {
        candidate.release?.();
      } catch (releaseError) {
        // A provider cleanup failure must preserve the exact child watcher.
        if (!(error instanceof NativeAgentTerminationPending))
          throw releaseError;
      }
      throw error;
    }
  }

  /** Reacquire the prior connection; its closed worker and leases stay retired. */
  private async restore(siblings: readonly [string, Slot][]): Promise<void> {
    for (const [key, previous] of siblings) {
      if (this.stopping.signal.aborted) throw closing();
      const stopping = new AbortController();
      const signal = AbortSignal.any([this.stopping.signal, stopping.signal]);
      const opened = this.start(previous.workspace, signal, previous.profile);
      const visible = opened.then((owner) => {
        if (signal.aborted) throw closing();
        slot.owner = owner;
        return owner.active;
      });
      const slot: Slot = {
        workspace: previous.workspace,
        profile: previous.profile,
        opened,
        visible,
        stopping,
      };
      this.slots.set(key, slot);
      void opened.catch((error: unknown) => this.retireSlot(key, slot, error));
      await visible;
    }
  }

  private async startProject(
    workspace: Project,
    launch: ProviderLaunch["launch"],
    profile?: ChatProfile
  ) {
    if ("root" in workspace) {
      if (workspace.nestedDeck) await workspace.nestedDeck.requireCurrent();
      workspace.requireDirectoryCurrent?.();
      const options = {
        ...launch,
        cwd: workspace.root,
        ...(launch.lookupProviderRoute &&
          profile && { inputRouteConnectionId: profile.id }),
      };
      return profile
        ? this.store.startWorkspace(workspace.id, options, profile.id)
        : this.store.startWorkspace(workspace.id, options);
    }
    if (!this.store.startDocument || profile)
      throw new Error("native_chat_document_unavailable");
    workspace.requireCurrent();
    return this.store.startDocument(workspace.id, launch);
  }

  private async drain(slots: Iterable<[string, Slot]>): Promise<void> {
    const closed = await Promise.allSettled(
      [...slots].map(([id, slot]) => this.drainSlot(id, slot))
    );
    if (closed.some((result) => result.status === "rejected"))
      throw new Error("native_workspace_shutdown_unverified");
  }

  private drainSlot(id: string, slot: Slot): Promise<void> {
    if (slot.retirement) return slot.retirement;
    slot.stopping.abort();
    slot.retirement = slot.opened.then(
      async (owner) => {
        try {
          await owner.active.chat.close();
          this.retireSlot(id, slot);
        } catch (error) {
          this.retireSlot(id, slot, error);
          throw error;
        } finally {
          owner.release?.();
        }
      },
      (error: unknown) => {
        const pending = pendingTermination(error);
        if (pending && !pending.hasExited) throw error;
      }
    );
    return slot.retirement;
  }

  private retireSlot(id: string, slot: Slot, error?: unknown): void {
    const remove = () => {
      if (this.slots.get(id) === slot) this.slots.delete(id);
    };
    // Startup can fail before a chat attachment exists. Keep the workspace
    // occupied until the exact child and its pipes have closed.
    const pending = pendingTermination(error);
    if (pending && !pending.hasExited) void pending.terminated.then(remove);
    else remove();
  }
}

function pendingTermination(
  error: unknown
): NativeAgentTerminationPending | undefined {
  return error instanceof NativeAgentTerminationPending
    ? error
    : error instanceof Error &&
        error.cause instanceof NativeAgentTerminationPending
      ? error.cause
      : undefined;
}

function sameProject(left: Project, right: Project, exited: boolean): boolean {
  if (!("root" in left)) return !("root" in right);
  return (
    "root" in right &&
    left.root === right.root &&
    (exited || JSON.stringify(left.identity) === JSON.stringify(right.identity))
  );
}

function closing() {
  return new Error("native_workspace_closing");
}

function slotKey(workspaceId: string, profileId?: string): string {
  return JSON.stringify(["workspace", workspaceId, profileId]);
}

function documentSlot(key: string): string {
  return JSON.stringify(["document", key]);
}

function nestedDeckSlot(key: string): string {
  return JSON.stringify(["nested-deck", key]);
}
