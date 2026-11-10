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
type Project = Pick<Workspace, "id" | "root"> & {
  identity?: WorkspaceDirectoryIdentity;
};
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
    private readonly cutover: Pick<NativeAgentCutover, "startWorkspace">,
    private readonly prepare: (
      workspace: Project,
      signal: AbortSignal
    ) => Promise<ProviderLaunch>
  ) {}

  current(workspaceId: string, profileId?: string): ActiveNativeChat | null {
    if (this.stopping.signal.aborted) return null;
    const slot = this.slots.get(slotKey(workspaceId, profileId));
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
    if (
      [...this.slots.values()].some(
        (slot) => slot.workspace.id === id && slot.stopping.signal.aborted
      )
    )
      throw closing();
    const key = slotKey(id, profile?.id);
    const existing = this.slots.get(key);
    if (existing) {
      const chat = existing.owner?.active.chat;
      if (
        existing.workspace.root !== workspace.root ||
        (!chat?.hasExited &&
          JSON.stringify(existing.workspace.identity) !==
            JSON.stringify(workspace.identity))
      )
        throw new Error("native_workspace_root_changed");
      if (!chat || chat.connected) return existing.visible;
      if (!chat.hasExited)
        throw new Error("native_workspace_disconnect_pending");
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
      [...this.slots].filter(([, slot]) => slot.workspace.id === workspaceId)
    );
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
      const launch = { ...candidate.launch, cwd: workspace.root };
      const { chat } = profile
        ? await this.cutover.startWorkspace(workspace.id, launch, profile.id)
        : await this.cutover.startWorkspace(workspace.id, launch);
      return {
        active: Object.freeze({
          workspaceId: workspace.id,
          ...(workspace.identity && { directoryIdentity: workspace.identity }),
          chat,
        }),
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

function closing() {
  return new Error("native_workspace_closing");
}

function slotKey(workspaceId: string, profileId?: string): string {
  return profileId ? JSON.stringify([workspaceId, profileId]) : workspaceId;
}
