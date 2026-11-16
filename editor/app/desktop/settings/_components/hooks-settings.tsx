"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { FileCodeIcon, Loader2, RefreshCwIcon } from "lucide-react";
import type { NativeHookEvent } from "@grida/desktop-bridge";
import { Button } from "@app/ui/components/button";
import { getDesktopBridge } from "@/lib/desktop/bridge";
import { SettingsHooks } from "@/lib/desktop/settings-hooks";

const EVENT_LABELS: Record<NativeHookEvent, string> = {
  session_start: "Turn starts or resumes",
  before_input: "Before input",
  before_tool: "Before tool use",
  after_tool: "After tool use",
  before_completion: "Before completion",
};

export function HooksSettings() {
  const [controller] = useState(
    () => new SettingsHooks.Controller(() => getDesktopBridge()?.hooks)
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.read,
    controller.read
  );
  useEffect(() => {
    const refresh = () => void controller.refresh();
    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      controller.cancel();
    };
  }, [controller]);
  const inspection = state.inspection;
  const busy = state.loading || state.action !== null;
  return (
    <section data-testid="settings-hooks" className="space-y-5">
      <header>
        <h2 className="text-lg font-semibold tracking-tight">Hooks</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Run checks at selected points in agent work. Hooks are configured in
          your global config.toml and apply across workspaces.
        </p>
      </header>
      {state.loading && !inspection ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading hooks…
        </p>
      ) : !state.supported ? (
        <p className="text-sm text-muted-foreground">
          Update Desktop to configure global hooks.
        </p>
      ) : (
        <>
          <div className="space-y-3 rounded-xl border p-4">
            <p className="break-all font-mono text-xs text-muted-foreground">
              {inspection?.configPath}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void controller.openConfig()}
              >
                <FileCodeIcon className="size-3.5" />
                Open config.toml
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => void controller.reload()}
              >
                <RefreshCwIcon className="size-3.5" />
                Reload
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              New or changed hooks need review before they can run. Changes
              apply to new agent connections. Restart Desktop to update existing
              connections; running work keeps its captured hooks.
            </p>
          </div>
          {inspection?.diagnostics.map((message, index) => (
            <p key={index} role="alert" className="text-sm text-destructive">
              {message}
            </p>
          ))}
          {inspection &&
            inspection.hooks.length === 0 &&
            inspection.diagnostics.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No hooks configured. Add hook definitions to config.toml, then
                reload.
              </p>
            )}
          <ul className="space-y-3">
            {inspection?.hooks.map((hook) => (
              <li key={hook.id} className="space-y-2 rounded-xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">{hook.id}</h3>
                  <span className="text-xs text-muted-foreground">
                    {!hook.enabled
                      ? "Disabled"
                      : hook.trusted
                        ? "Trusted"
                        : "Needs review"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {EVENT_LABELS[hook.event]}
                  {hook.tool ? ` · ${hook.tool}` : ""} ·{" "}
                  {hook.mode === "required" ? "Required" : "Observe"} ·{" "}
                  {hook.timeoutMs} ms
                </p>
                <code className="block break-all text-xs">
                  {[hook.executable, ...hook.arguments]
                    .map((arg) => JSON.stringify(arg))
                    .join(" ")}
                </code>
                {!hook.trusted && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void controller.review(hook.id)}
                  >
                    {state.action === hook.id && (
                      <Loader2 className="size-3.5 animate-spin" />
                    )}
                    Review hook
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
    </section>
  );
}
