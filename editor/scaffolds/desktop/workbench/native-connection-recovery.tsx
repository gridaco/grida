"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import type {
  DesktopNativeChat,
  NativeChatProfileSelection,
} from "@grida/desktop-bridge";
import type { ComposerCatalog } from "@/kits/composer";
import { NativeModelPicker } from "./native-chat-controls";
import { AgentComposerInput } from "../shared/agent-composer-input";
import { NativeChatController } from "@/lib/agent-chat/native-chat-controller";

const EMPTY_CATALOG: ComposerCatalog = { commands: [], mentions: [] };

/**
 * The chat before any model connection is usable. It keeps the ordinary pane
 * layout and composer; the composer's model picker is the way forward. A note
 * appears only when the person must act somewhere else first.
 */
export function NativeConnectionRecovery({
  bridge,
  note,
  onConnected,
}: {
  bridge: DesktopNativeChat;
  note?: string;
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
  const empty =
    !!state.profiles &&
    state.profiles.choices.length + state.profiles.saved.length === 0;
  return (
    <div
      data-testid="native-chat-connection-recovery"
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex min-h-0 flex-1 flex-col justify-end gap-1 px-3 py-4 text-xs text-muted-foreground">
        {note && <p>{note}</p>}
        {empty && (
          <p>Add a provider in Desktop settings, then refresh models.</p>
        )}
        {state.profileError && (
          <p role="alert" className="text-destructive">
            {state.profileError}
          </p>
        )}
      </div>
      <div className="shrink-0 p-3">
        <AgentComposerInput
          catalog={EMPTY_CATALOG}
          className="@container"
          attach={false}
          operableFiles={false}
          canSubmit={false}
          placeholder="Choose a model to start chatting…"
          onSubmit={() => {}}
          isStreaming={false}
          onStop={() => {}}
          toolbarEnd={
            <NativeModelPicker
              profiles={state.profiles}
              busy={state.profileBusy}
              defaultUnavailable
              onRefresh={() => void controller.readProfiles()}
              onSelect={(selection: NativeChatProfileSelection) => {
                void controller.selectConnection(selection).then((selected) => {
                  if (selected) onConnected(selection);
                });
              }}
            />
          }
        />
      </div>
    </div>
  );
}
