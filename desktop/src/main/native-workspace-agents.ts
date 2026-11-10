// GRIDA-SEC-004 — main owns workspace process and provider lifetimes.
import type { Workspace } from "@grida/daemon";
import type { WorkspaceDirectoryIdentity } from "@grida/daemon/server";
import type {
  NativeAgentChat,
  NativeAgentChatLaunch,
} from "./native-agent-chat";
import type { NativeAgentCutover } from "./native-agent-cutover";
import { NativeAgentTerminationPending } from "./native-agent-process";
import type { ActiveNativeChat } from "./native-chat-ipc";

const MAX_LIVE_WORKSPACES = 8;
type Project =
  | (Pick<Workspace, "id" | "root"> & {
      identity?: WorkspaceDirectoryIdentity;
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
}>;
type Owner = {
  active: ActiveNativeChat & { chat: NativeAgentChat };
  gatewayScope?: string;
  release?: () => void;
};
type Slot = {
  workspace: Project;
  opened: Promise<Owner>;
  visible: Promise<ActiveNativeChat>;
  stopping: AbortController;
  owner?: Owner;
  retirement?: Promise<void>;
};

export class NativeWorkspaceAgents {
  private readonly slots = new Map<string, Slot>();
  private readonly stopping = new AbortController();
  private closed: Promise<void> | undefined;

  constructor(
    private readonly cutover: Pick<NativeAgentCutover, "startWorkspace"> &
      Partial<Pick<NativeAgentCutover, "startDocument">>,
    private readonly prepare: (
      workspace: Project,
      signal: AbortSignal
    ) => Promise<ProviderLaunch>
  ) {}

  current(workspaceId: string, profileId?: string): ActiveNativeChat | null {
    return this.active(slotKey(workspaceId, profileId));
  }

  gatewayScope(workspaceId: string, profileId?: string): string | undefined {
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
    const active = slot.owner?.active;
    return active?.chat.connected ? active : null;
  }

  async open(
    workspace: Project,
    profile?: ChatProfile
  ): Promise<ActiveNativeChat> {
    if (this.stopping.signal.aborted) throw closing();
    const { id } = workspace;
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
    const existing = this.slots.get(key);
    if (existing) {
      const chat = existing.owner?.active.chat;
      if (!sameProject(existing.workspace, workspace, chat?.hasExited ?? false))
        throw new Error("native_workspace_root_changed");
      if (!chat || chat.connected) return existing.visible;
      if (!chat.hasExited)
        throw new Error("native_workspace_disconnect_pending");
      existing.stopping.abort();
    } else if (this.slots.size >= MAX_LIVE_WORKSPACES) {
      throw new Error("native_workspace_capacity_reached");
    }

    const stopping = new AbortController();
    const signal = AbortSignal.any([this.stopping.signal, stopping.signal]);
    const opened = Promise.resolve().then(async () => {
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
      return await this.start(workspace, signal, profile);
    });
    const visible = opened.then((owner) => {
      if (signal.aborted) throw closing();
      slot.owner = owner;
      return owner.active;
    });
    const slot: Slot = { workspace, opened, visible, stopping };
    this.slots.set(key, slot);
    void opened.catch((error: unknown) => this.retireSlot(key, slot, error));
    return visible;
  }

  close(): Promise<void> {
    if (this.closed) return this.closed;
    this.closed = Promise.resolve().then(() => this.drain(this.slots));
    this.stopping.abort();
    return this.closed;
  }

  closeWorkspace(workspaceId: string): Promise<void> {
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
    profile?: ChatProfile
  ): Promise<Owner> {
    if (signal.aborted) throw closing();
    const candidate = await (profile
      ? profile.prepare(signal)
      : this.prepare(workspace, signal));
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

  private async startProject(
    workspace: Project,
    launch: ProviderLaunch["launch"],
    profile?: ChatProfile
  ) {
    if ("root" in workspace) {
      if (workspace.nestedDeck) await workspace.nestedDeck.requireCurrent();
      const options = { ...launch, cwd: workspace.root };
      return profile
        ? this.cutover.startWorkspace(workspace.id, options, profile.id)
        : this.cutover.startWorkspace(workspace.id, options);
    }
    if (!this.cutover.startDocument || profile)
      throw new Error("native_chat_document_unavailable");
    workspace.requireCurrent();
    return this.cutover.startDocument(workspace.id, launch);
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
        if (error instanceof NativeAgentTerminationPending && !error.hasExited)
          throw error;
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
    if (error instanceof NativeAgentTerminationPending && !error.hasExited)
      void error.terminated.then(remove);
    else remove();
  }
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
