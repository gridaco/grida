"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { DesktopBridge } from "@grida/desktop-bridge";
import { Switch } from "@app/ui/components/switch";
import { SettingsComposer } from "@/lib/desktop/settings-composer";

export function ComposerSettings({
  api,
}: {
  api: NonNullable<DesktopBridge["composerPredictions"]>;
}) {
  const [controller] = useState(() => new SettingsComposer(api));
  useEffect(() => {
    const disconnect = controller.connect();
    window.addEventListener("focus", controller.refresh);
    return () => {
      window.removeEventListener("focus", controller.refresh);
      disconnect();
    };
  }, [controller]);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.read,
    controller.read
  );
  return (
    <section data-testid="settings-composer" className="space-y-5">
      <h2 className="text-lg font-semibold tracking-tight">Chat</h2>
      {state.unavailable ? (
        <p className="text-sm text-muted-foreground">
          Prompt suggestions require native chat, which is unavailable in this
          Desktop session.
        </p>
      ) : (
        <div className="flex items-center justify-between gap-4 rounded-xl border p-4">
          <div>
            <label htmlFor="show-predictions" className="text-sm font-medium">
              Suggest the next prompt
            </label>
            <p
              id="show-predictions-description"
              className="mt-1 text-xs text-muted-foreground"
            >
              Suggestions use an extra request on this chat’s connection with an
              eligible economy model or your local model. Provider usage limits
              or charges may apply. Press Tab to edit before sending.
            </p>
          </div>
          <Switch
            id="show-predictions"
            aria-describedby="show-predictions-description"
            disabled={!state.preference || state.saving}
            checked={state.preference?.enabled ?? false}
            onCheckedChange={(checked) => void controller.set(checked)}
          />
        </div>
      )}
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
    </section>
  );
}
