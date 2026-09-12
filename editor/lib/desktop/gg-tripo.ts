// GRIDA-SEC-006 — see /SECURITY.md
// GRIDA-GG: desktop — explicit funding and scoped-session recovery for Tripo.
import { secrets, type ModelGenerationGenerateRequest } from "./bridge";
import * as session from "./gg-session";

/** Readiness and execution shared by Tripo generation and rigging. */
export namespace GridaGatewayTripo {
  export type Provider = ModelGenerationGenerateRequest["provider"];
  export type State = Readonly<{
    byok: "checking" | "ready" | "missing" | "error";
    hosted: session.GridaGatewaySessionState | null;
  }>;
  export type Connection = Readonly<{
    ready: boolean;
    label: string;
    href?: string;
    retry?: boolean;
  }>;
  type Dependencies = {
    hasKey: () => Promise<boolean>;
    ensureFresh: typeof session.ensureFresh;
    forceRefresh: typeof session.forceRefresh;
  };
  const dependencies: Dependencies = {
    hasKey: () => secrets.hasKey("tripo"),
    ensureFresh: session.ensureFresh,
    forceRefresh: session.forceRefresh,
  };

  /** Key presence and session metadata only; no credentials are retained. */
  export class Access {
    private state: State;
    private generation = 0;
    private listeners = new Set<() => void>();

    constructor(
      readonly hostedSupported: boolean,
      private readonly deps: Pick<
        Dependencies,
        "hasKey" | "ensureFresh"
      > = dependencies
    ) {
      this.state = {
        byok: "checking",
        hosted: hostedSupported ? null : { kind: "unsupported" },
      };
    }

    readonly getSnapshot = (): State => this.state;
    readonly subscribe = (listener: () => void): (() => void) => {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    };

    readonly refresh = async (): Promise<void> => {
      const generation = ++this.generation;
      await Promise.all([
        Promise.resolve()
          .then(this.deps.hasKey)
          .then(
            (present) =>
              this.publish(generation, { byok: present ? "ready" : "missing" }),
            () => this.publish(generation, { byok: "error" })
          ),
        this.hostedSupported
          ? Promise.resolve()
              .then(this.deps.ensureFresh)
              .then(
                (hosted) => this.publish(generation, { hosted }),
                () => this.publish(generation, { hosted: { kind: "error" } })
              )
          : Promise.resolve(),
      ]);
    };

    connect(): () => void {
      void this.refresh();
      const refresh = () => void this.refresh();
      const visible = () => {
        if (!document.hidden) refresh();
      };
      window.addEventListener("focus", refresh);
      document.addEventListener("visibilitychange", visible);
      return () => {
        this.generation++;
        window.removeEventListener("focus", refresh);
        document.removeEventListener("visibilitychange", visible);
      };
    }

    private publish(generation: number, patch: Partial<State>): void {
      if (generation !== this.generation) return;
      this.state = { ...this.state, ...patch };
      for (const listener of this.listeners) listener();
    }
  }

  export function connection(provider: Provider, state: State): Connection {
    if (provider === "tripo") {
      switch (state.byok) {
        case "ready":
          return { ready: true, label: "Tripo · Your API key" };
        case "checking":
          return { ready: false, label: "Checking connection…" };
        case "missing":
          return {
            ready: false,
            label: "Connect your Tripo API key",
            href: "/desktop/settings#provider-tripo",
          };
        case "error":
          return {
            ready: false,
            label: "Tripo connection unavailable",
            retry: true,
          };
      }
    }
    if (!state.hosted)
      return { ready: false, label: "Checking Grida credits…" };
    if (state.hosted.kind === "active")
      return {
        ready: true,
        label: `Grida credits · ${state.hosted.organization.name}`,
      };
    return {
      ready: false,
      label: sessionError(state.hosted.kind),
      ...(state.hosted.kind === "signed_out"
        ? { href: "/desktop/auth/sign-in" }
        : state.hosted.kind === "no_organization"
          ? { href: "/organizations/new" }
          : state.hosted.kind === "error"
            ? { retry: true }
            : {}),
    };
  }

  /** A chosen BYOK lane never mints a session or falls back to org credits. */
  export async function execute<T>(
    provider: Provider,
    operation: () => Promise<T>,
    deps: Pick<Dependencies, "ensureFresh" | "forceRefresh"> = dependencies
  ): Promise<T> {
    if (provider === "tripo") return operation();
    const initial = await deps.ensureFresh();
    if (initial.kind !== "active") throw new Error(sessionError(initial.kind));
    try {
      return await operation();
    } catch (cause) {
      // The native bridge keeps accepted-task identity in the message because
      // Electron drops custom Error fields. Never submit an accepted task twice.
      const message = cause instanceof Error ? cause.message : String(cause);
      const hasTask =
        message.includes("Tripo task:") ||
        (typeof cause === "object" && cause !== null && "task_id" in cause);
      if (!session.isGgTokenExpired(cause) || hasTask) throw cause;
    }
    const refreshed = await deps.forceRefresh();
    if (refreshed.kind !== "active")
      throw new Error(sessionError(refreshed.kind));
    return operation();
  }

  function sessionError(
    kind: Exclude<session.GridaGatewaySessionState["kind"], "active">
  ): string {
    switch (kind) {
      case "signed_out":
        return "Sign in to use Grida credits";
      case "no_organization":
        return "Choose or create a Grida organization";
      case "unsupported":
        return "Update Desktop to use Grida credits for Tripo";
      case "error":
        return "Could not connect to Grida credits. Try again.";
    }
  }
}
