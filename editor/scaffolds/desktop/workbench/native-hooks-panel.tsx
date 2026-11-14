import { Button } from "@app/ui/components/button";
import type {
  NativeChatController,
  NativeChatView,
} from "@/lib/agent-chat/native-chat-controller";

/** Registered lifecycle checks: inspect, import and remove. */
export function NativeHooksPanel({
  controller,
  state,
}: {
  controller: NativeChatController;
  state: NativeChatView;
}) {
  const inspection = state.hooks;
  return (
    <section
      data-testid="workspace-lifecycle-checks"
      aria-label="Lifecycle checks"
      className="flex flex-wrap items-center gap-2 text-xs"
    >
      <p className="basis-full text-muted-foreground">
        Review a check before trusting it. Checks have read-only workspace
        access and no network.
        {inspection?.activation === "restart_required" &&
          " Saved changes apply after restarting Desktop. Running work keeps its current checks."}
      </p>
      {inspection && (
        <p className="basis-full text-muted-foreground">
          {inspection.active.length} active · {inspection.saved.length} saved
        </p>
      )}
      {inspection?.saved.map((hook) => (
        <div
          key={hook.id}
          className="flex basis-full flex-wrap items-center gap-2 rounded border px-2 py-1"
        >
          <strong>{hook.id}</strong>
          <span>
            {hook.event}
            {hook.tool ? ` · ${hook.tool}` : ""} ·{" "}
            {hook.mode === "required" ? "Required" : "Observe"}
            {!hook.enabled && " · Disabled"}
          </span>
          <span className="basis-full break-all text-muted-foreground">
            {hook.source} · {hook.executable} · {hook.timeoutMs} ms
          </span>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={state.hooksBusy}
            onClick={() => void controller.removeHook(hook.id, hook.revision)}
          >
            Remove
          </Button>
        </div>
      ))}
      {inspection?.results?.map((result) => (
        <p key={`${result.operation}:${result.id}`} className="basis-full">
          {result.id} · {result.event}: {result.status}
          {result.reason ? ` · ${result.reason}` : ""}
        </p>
      ))}
      <Button
        type="button"
        size="xs"
        disabled={state.hooksBusy}
        onClick={() => void controller.importHook()}
      >
        Import check…
      </Button>
      <Button
        type="button"
        size="xs"
        variant="ghost"
        disabled={state.hooksBusy}
        onClick={() => void controller.refreshHooks()}
      >
        Refresh checks
      </Button>
      {state.hooksError && (
        <p role="alert" className="basis-full text-destructive">
          {state.hooksError}
        </p>
      )}
    </section>
  );
}
