// GRIDA-SEC-004 — external runs are exposed only to the owning workspace frame.
import type { IpcMainInvokeEvent, WebContents, WebFrameMain } from "electron";
import type { NativeExternalStatus } from "@grida/desktop-bridge";
import { ipc_sender } from "./ipc-sender";
import type { NativeExternalRuns } from "./native-external-runs";

type Owner = Pick<
  NativeExternalRuns,
  "selection" | "latest" | "start" | "stop"
>;
type Scope = {
  owner: Owner;
  sender: WebContents;
  frame: WebFrameMain;
  href: string;
  revision: number;
  observed?: string;
  release(): void;
};

export class NativeExternalRunIpc {
  private readonly scopes = new WeakMap<WebContents, Scope>();

  constructor(
    private readonly origin: string,
    private readonly admitted: (sender: WebContents) => boolean,
    private readonly owner: () => Owner | undefined
  ) {}

  async status(
    event: IpcMainInvokeEvent
  ): Promise<NativeExternalStatus | null> {
    const scope = this.scope(event);
    if (!scope) return null;
    const revision = ++scope.revision;
    const run = await this.read(scope, () => scope.owner.latest());
    if (scope.revision === revision) scope.observed = run?.runId;
    return { name: scope.owner.selection.name, run };
  }

  async start(event: IpcMainInvokeEvent, id: unknown, text: unknown) {
    const scope = this.requireScope(event);
    if (typeof id !== "string" || typeof text !== "string")
      throw failure("input_invalid");
    const revision = ++scope.revision;
    const run = await this.read(scope, () =>
      scope.owner.start(id, text, () => this.requireCurrent(scope))
    );
    if (scope.revision === revision) scope.observed = run.runId;
    return run;
  }

  async stop(event: IpcMainInvokeEvent, id: unknown) {
    const scope = this.requireScope(event);
    if (typeof id !== "string" || scope.observed !== id)
      throw failure("observation_changed");
    return this.read(scope, () => scope.owner.stop(id));
  }

  private async read<T>(scope: Scope, operation: () => Promise<T>): Promise<T> {
    try {
      const result = await operation();
      this.requireCurrent(scope);
      return result;
    } catch (error) {
      this.requireCurrent(scope);
      // Paths and operating-system errors stay inside Main.
      if (
        error instanceof Error &&
        /^native_external_[a-z0-9_]{1,64}$/.test(error.message)
      )
        throw error;
      throw failure("unavailable");
    }
  }

  private requireScope(event: IpcMainInvokeEvent): Scope {
    const scope = this.scope(event);
    if (!scope) throw failure("scope_changed");
    return scope;
  }

  private scope({
    sender,
    senderFrame: frame,
  }: IpcMainInvokeEvent): Scope | undefined {
    if (!frame || sender.isDestroyed() || sender.mainFrame !== frame) return;
    const existing = this.scopes.get(sender);
    const owner = this.owner();
    const href = frame.url;
    if (!href || !owner || !this.matches(sender, frame, href, owner)) {
      existing?.release();
      return;
    }
    if (
      existing?.frame === frame &&
      existing.href === href &&
      existing.owner === owner
    )
      return existing;
    existing?.release();
    const scope: Scope = {
      owner,
      sender,
      frame,
      href,
      revision: 0,
      release: () => {
        if (this.scopes.get(sender) === scope) this.scopes.delete(sender);
        unwatch();
      },
    };
    const unwatch = ipc_sender.watchNavigation(sender, scope.release);
    this.scopes.set(sender, scope);
    return scope;
  }

  private requireCurrent(scope: Scope) {
    if (
      this.scopes.get(scope.sender) !== scope ||
      this.owner() !== scope.owner ||
      !this.matches(scope.sender, scope.frame, scope.href, scope.owner)
    )
      throw failure("scope_changed");
  }

  private matches(
    sender: WebContents,
    frame: WebFrameMain,
    href: string,
    owner: Owner
  ): boolean {
    if (
      sender.isDestroyed() ||
      sender.isLoadingMainFrame() ||
      sender.mainFrame !== frame ||
      frame.url !== href ||
      !this.admitted(sender) ||
      !ipc_sender.isAllowed(href, this.origin)
    )
      return false;
    const url = new URL(href);
    const ids = url.searchParams.getAll("id");
    return (
      url.pathname === "/desktop/workspace" &&
      ids.length === 1 &&
      ids[0] === owner.selection.workspaceId
    );
  }
}

function failure(reason: string) {
  return new Error("native_external_" + reason);
}
