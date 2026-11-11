"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import type {
  DesktopNativeChat,
  NativeChatProfileSelection,
} from "@grida/desktop-bridge";
import { Button } from "@app/ui/components/button";
import { NativeChatController } from "@/lib/agent-chat/native-chat-controller";

export function NativeConnectionRecovery({
  bridge,
  onConnected,
}: {
  bridge: DesktopNativeChat;
  onConnected: (selection: NativeChatProfileSelection) => void;
}) {
  const controller = useMemo(() => new NativeChatController(bridge), [bridge]);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.read,
    controller.read
  );
  useEffect(() => {
    controller.connectForSelection();
    return () => controller.disconnect();
  }, [controller]);
  return (
    <div
      data-testid="native-chat-connection-recovery"
      className="flex flex-col gap-2"
    >
      {state.profiles && (
        <select
          aria-label="Model connection"
          value=""
          disabled={state.profileBusy}
          className="rounded border bg-background px-2 py-1"
          onChange={(event) => {
            const value = event.currentTarget.value;
            const [kind, id] = value.split(":");
            if (kind !== "default" && kind !== "saved" && kind !== "new")
              return;
            const selection: NativeChatProfileSelection =
              kind === "default" ? { kind } : { kind, id };
            void controller.selectConnection(selection).then((selected) => {
              if (selected) onConnected(selection);
            });
          }}
        >
          <option value="" disabled>
            Choose a model connection…
          </option>
          <option value="default">Default connection</option>
          <optgroup label="Saved chats by model">
            {state.profiles.saved.map(
              ({ id, connection, model, available }) => (
                <option
                  key={`saved:${id}`}
                  value={`saved:${id}`}
                  disabled={!available}
                >
                  {connection} · {model}
                  {available ? "" : " (unavailable)"}
                </option>
              )
            )}
          </optgroup>
          <optgroup label="New chat with…">
            {state.profiles.choices.map(({ id, connection, model }) => (
              <option key={`new:${id}`} value={`new:${id}`}>
                {connection} · {model}
              </option>
            ))}
          </optgroup>
        </select>
      )}
      <Button
        type="button"
        size="xs"
        variant="ghost"
        disabled={state.profileBusy}
        onClick={() => void controller.readProfiles()}
      >
        Refresh models
      </Button>
      {state.profiles &&
        state.profiles.choices.length + state.profiles.saved.length === 0 && (
          <p>Add a provider in Desktop settings, then refresh models.</p>
        )}
      {state.profileError && (
        <p role="alert" className="text-destructive">
          {state.profileError}
        </p>
      )}
    </div>
  );
}
