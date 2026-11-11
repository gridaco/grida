"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import type {
  DesktopNativeChat,
  NativeChatProfileSelection,
} from "@grida/desktop-bridge";
import { NativeModelPicker } from "./native-chat-controls";
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
      <NativeModelPicker
        profiles={state.profiles}
        busy={state.profileBusy}
        onRefresh={() => void controller.readProfiles()}
        onSelect={(selection: NativeChatProfileSelection) => {
          void controller.selectConnection(selection).then((selected) => {
            if (selected) onConnected(selection);
          });
        }}
      />
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
