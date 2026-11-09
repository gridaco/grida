// GRIDA-SEC-004 — main owns workspace process and provider lifetimes.
import type { Workspace } from "@grida/daemon";
import type {
  NativeAgentChat,
  NativeAgentChatLaunch,
} from "./native-agent-chat";
import type { NativeAgentCutover } from "./native-agent-cutover";
import type { ActiveNativeChat } from "./native-chat-ipc";

const MAX_LIVE_WORKSPACES = 8;
type Project = Pick<Workspace, "id" | "root">;
type ProviderLaunch = Readonly<{
  launch: Omit<NativeAgentChatLaunch, "stateDirectory" | "cwd">;
  release?: () => void;
}>;
type Owner = {
  active: ActiveNativeChat & { chat: NativeAgentChat };
  release?: () => void;
};
type Slot = {
  root: string;
  opened: Promise<Owner>;
  visible: Promise<ActiveNativeChat>;
  owner?: Owner;
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

  current(workspaceId: string): ActiveNativeChat | null {
    if (this.stopping.signal.aborted) return null;
    const active = this.slots.get(workspaceId)?.owner?.active;
    return active?.chat.connected ? active : null;
  }

  async open(workspace: Project): Promise<ActiveNativeChat> {
    if (this.stopping.signal.aborted) throw closing();
    const { id, root } = workspace;
    const existing = this.slots.get(id);
    if (existing) {
      if (existing.root !== root)
        throw new Error("native_workspace_root_changed");
      const chat = existing.owner?.active.chat;
      if (!chat || chat.connected) return existing.visible;
      if (!chat.hasExited)
        throw new Error("native_workspace_disconnect_pending");
    } else if (this.slots.size >= MAX_LIVE_WORKSPACES) {
      throw new Error("native_workspace_capacity_reached");
    }

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
      return await this.start({ id, root });
    });
    const visible = opened.then((owner) => {
      if (this.stopping.signal.aborted) throw closing();
      slot.owner = owner;
      return owner.active;
    });
    const slot: Slot = { root, opened, visible };
    this.slots.set(id, slot);
    void opened.catch(() => {
      if (this.slots.get(id) === slot) this.slots.delete(id);
    });
    return visible;
  }

  close(): Promise<void> {
    if (this.closed) return this.closed;
    this.closed = Promise.resolve().then(() => this.drain());
    this.stopping.abort();
    return this.closed;
  }

  private async start(workspace: Project): Promise<Owner> {
    if (this.stopping.signal.aborted) throw closing();
    const candidate = await this.prepare(workspace, this.stopping.signal);
    try {
      if (this.stopping.signal.aborted) throw closing();
      const { chat } = await this.cutover.startWorkspace(workspace.id, {
        ...candidate.launch,
        cwd: workspace.root,
      });
      return {
        active: Object.freeze({ workspaceId: workspace.id, chat }),
        release: candidate.release,
      };
    } catch (error) {
      candidate.release?.();
      throw error;
    }
  }

  private async drain(): Promise<void> {
    const closed = await Promise.allSettled(
      [...this.slots.values()].map(async (slot) => {
        const owner = await slot.opened.catch(() => undefined);
        if (!owner) return;
        try {
          await owner.active.chat.close();
        } finally {
          owner.release?.();
        }
      })
    );
    this.slots.clear();
    if (closed.some((result) => result.status === "rejected"))
      throw new Error("native_workspace_shutdown_unverified");
  }
}

function closing() {
  return new Error("native_workspace_closing");
}
