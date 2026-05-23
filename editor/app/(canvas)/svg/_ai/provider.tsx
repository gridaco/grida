"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { AgentTodos } from "@grida/agent-tools/todos";
import type { ModelTier } from "@/lib/ai/models";
import { useSvgDocStore } from "../_storage/context";
import { makeSvgEditorChat, type SvgEditorChat } from "./client-chat";
// IMPORTANT: pull from ./tiers (client-safe), not ./server-agent (server-only).
import { SVG_AGENT_DEFAULT_TIER } from "./tiers";

type SvgAgentContextValue = {
  chat: SvgEditorChat;
  todos: AgentTodos;
  tier: ModelTier;
  setTier: (tier: ModelTier) => void;
  /**
   * `true` once the doc store has finished hydrating from OPFS. Lets
   * callers gate first paint to avoid flashing `initialSvg` before the
   * persisted document loads in.
   */
  hydrated: boolean;
};

const SvgEditorChatContext = createContext<SvgAgentContextValue | null>(null);

export function AISvgChatProvider({ children }: { children: ReactNode }) {
  const store = useSvgDocStore();

  // Tier is held as both state (drives the Select UI) and a ref (read by
  // the chat transport's `body` getter on every send, including auto-resends
  // after a tool result lands). Splitting them lets the chat instance stay
  // stable across tier changes — no re-mount, no in-flight stream torn down.
  const [tier, setTierState] = useState<ModelTier>(SVG_AGENT_DEFAULT_TIER);
  const tierRef = useRef<ModelTier>(SVG_AGENT_DEFAULT_TIER);
  const setTier = useCallback((next: ModelTier) => {
    tierRef.current = next;
    setTierState(next);
  }, []);

  // Chat + todos are provider-lifetime. The doc store owns the AgentFs;
  // chat just borrows the reference. The editor mount lifecycle is the
  // store's job, not ours.
  const { chat, todos } = useMemo(() => {
    const todos = new AgentTodos();
    const chat = makeSvgEditorChat(store.getFs(), todos, () => tierRef.current);
    return { chat, todos };
  }, [store]);

  const hydrated = useSyncExternalStore(
    store.subscribe,
    store.isHydrated,
    store.isHydrated
  );

  const value = useMemo<SvgAgentContextValue>(
    () => ({ chat, todos, tier, setTier, hydrated }),
    [chat, todos, tier, setTier, hydrated]
  );

  return (
    <SvgEditorChatContext.Provider value={value}>
      {children}
    </SvgEditorChatContext.Provider>
  );
}

export function useSvgAgentChat(): SvgEditorChat {
  const value = useContext(SvgEditorChatContext);
  if (value === null) {
    throw new Error("useSvgAgentChat must be used inside <AISvgChatProvider>.");
  }
  return value.chat;
}

/**
 * `true` once the doc store has finished hydrating from the backend.
 * Use to defer first paint of UI that would otherwise flash
 * `initialSvg` before the persisted document loads.
 */
export function useSvgAgentHydrated(): boolean {
  const value = useContext(SvgEditorChatContext);
  if (value === null) {
    throw new Error(
      "useSvgAgentHydrated must be used inside <AISvgChatProvider>."
    );
  }
  return value.hydrated;
}

export function useSvgAgentTodos(): AgentTodos {
  const value = useContext(SvgEditorChatContext);
  if (value === null) {
    throw new Error(
      "useSvgAgentTodos must be used inside <AISvgChatProvider>."
    );
  }
  return value.todos;
}

/**
 * Tier picker handle: current selection + setter. Both consumers of this hook
 * (the `<TierSelect />` trigger and any future status chip) re-render on tier
 * change; the chat instance itself does not.
 */
export function useSvgAgentTier(): {
  tier: ModelTier;
  setTier: (tier: ModelTier) => void;
} {
  const value = useContext(SvgEditorChatContext);
  if (value === null) {
    throw new Error("useSvgAgentTier must be used inside <AISvgChatProvider>.");
  }
  return { tier: value.tier, setTier: value.setTier };
}
