import type {
  DesktopNativeExternalAgent,
  NativeExternalRun,
  NativeExternalStatus,
} from "@grida/desktop-bridge";

const MAX_TEXT_BYTES = 64 * 1024;
const POLL_MS = 600;
const encoder = new TextEncoder();

type View = Readonly<{
  status: NativeExternalStatus | null;
  observationCurrent: boolean;
  open: boolean;
  draft: string;
  pending: boolean;
  action: "start" | "stop" | null;
  error: string | null;
}>;
type Request = Readonly<{ id: string; text: string }>;

export class NativeExternalAgentController {
  private readonly listeners = new Set<() => void>();
  private lifetime?: object;
  private reading?: object;
  private pending?: Request;
  private unconfirmedStop?: string;
  private timer?: ReturnType<typeof setTimeout>;
  private view: View = {
    status: null,
    observationCurrent: false,
    open: false,
    draft: "",
    pending: false,
    action: null,
    error: null,
  };

  constructor(private readonly bridge: DesktopNativeExternalAgent) {}

  readonly read = () => this.view;
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  connect(): void {
    if (this.lifetime) return;
    this.lifetime = {};
    void this.refresh();
  }

  disconnect(): void {
    this.lifetime = undefined;
    this.reading = undefined;
    clearTimeout(this.timer);
    this.update({
      status: null,
      observationCurrent: false,
      open: false,
      action: null,
      error: null,
    });
  }

  setOpen(open: boolean): void {
    if (!this.lifetime || (open && !this.view.status)) return;
    this.update({ open, ...(open && { observationCurrent: false }) });
    if (open) void this.refresh();
    else clearTimeout(this.timer);
  }

  changeDraft(text: string): void {
    if (!this.pending && !this.view.action) this.update({ draft: text });
  }

  get canRun(): boolean {
    const { open, status, action, draft } = this.view;
    return !!(
      open &&
      status &&
      !action &&
      !active(status.run) &&
      released(status.run) &&
      (this.pending ||
        (this.view.observationCurrent && draft.trim() && !this.draftTooLong))
    );
  }

  get draftTooLong(): boolean {
    return encoder.encode(this.view.draft).length > MAX_TEXT_BYTES;
  }

  get canStop(): boolean {
    return this.view.open && !this.view.action && active(this.view.status?.run);
  }

  async refresh(): Promise<void> {
    const lifetime = this.lifetime;
    if (!lifetime || this.reading || this.view.action) return;
    clearTimeout(this.timer);
    const reading = (this.reading = {});
    const owns = () => this.lifetime === lifetime && this.reading === reading;
    try {
      const status = await this.bridge.status();
      if (!owns()) return;
      this.update({
        status,
        observationCurrent: true,
        ...(status === null && { open: false }),
        ...this.confirm(status?.run),
        ...(this.pending || this.unconfirmedStop ? {} : { error: null }),
      });
      this.poll();
    } catch {
      if (!owns()) return;
      this.update({
        observationCurrent: false,
        error: this.view.error ?? "Couldn't check the local agent's status.",
      });
    } finally {
      if (owns()) this.reading = undefined;
    }
  }

  async start(): Promise<void> {
    const lifetime = this.lifetime;
    if (!lifetime || !this.canRun) return;
    const request = (this.pending ??= {
      id: crypto.randomUUID(),
      text: this.view.draft,
    });
    this.begin("start");
    let unconfirmed = false;
    try {
      const run = await this.bridge.start(request.id, request.text);
      if (this.lifetime !== lifetime) return;
      if (run.runId !== request.id) throw new Error("run_changed");
      this.setRun(run);
    } catch {
      if (this.lifetime !== lifetime) return;
      unconfirmed = true;
      this.update({
        error: "Couldn't confirm the run. Your draft is ready to retry.",
      });
    } finally {
      if (this.lifetime === lifetime) {
        this.update({ action: null });
        if (unconfirmed) await this.refresh();
        else this.poll();
      }
    }
  }

  async stop(runId: string): Promise<void> {
    const lifetime = this.lifetime;
    if (!lifetime || !this.canStop || this.view.status?.run?.runId !== runId)
      return;
    this.begin("stop");
    this.unconfirmedStop = runId;
    let unconfirmed = false;
    try {
      const run = await this.bridge.stop(runId);
      if (this.lifetime !== lifetime) return;
      if (run.runId !== runId) throw new Error("run_changed");
      this.setRun(run);
    } catch {
      if (this.lifetime !== lifetime) return;
      unconfirmed = true;
      this.update({
        error: "Couldn't confirm Stop. Check the run's current status.",
      });
    } finally {
      if (this.lifetime === lifetime) {
        this.update({ action: null });
        if (unconfirmed) await this.refresh();
        else this.poll();
      }
    }
  }

  private begin(action: NonNullable<View["action"]>) {
    this.reading = undefined;
    clearTimeout(this.timer);
    this.update({ action, pending: !!this.pending, error: null });
  }

  private confirm(run: NativeExternalRun | null | undefined): Partial<View> {
    if (!run) return {};
    if (run.runId === this.unconfirmedStop && !active(run))
      this.unconfirmedStop = undefined;
    if (this.pending?.id !== run.runId) return {};
    this.pending = undefined;
    return {
      pending: false,
      ...(run.disposition !== "not_dispatched" && { draft: "" }),
    };
  }

  private setRun(run: NativeExternalRun) {
    const status = this.view.status;
    if (!status) return;
    this.update({
      status: { ...status, run },
      observationCurrent: true,
      ...this.confirm(run),
    });
  }

  private poll() {
    clearTimeout(this.timer);
    if (
      this.view.open &&
      this.view.observationCurrent &&
      active(this.view.status?.run)
    )
      this.timer = setTimeout(() => void this.refresh(), POLL_MS);
  }

  private update(changes: Partial<View>) {
    this.view = { ...this.view, ...changes };
    for (const listener of this.listeners) listener();
  }
}

function active(run: NativeExternalRun | null | undefined): boolean {
  return run?.disposition === "starting" || run?.disposition === "running";
}

function released(run: NativeExternalRun | null): boolean {
  return !run || run.disposition === "not_dispatched" || run.cleanupVerified;
}
