"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  peek,
  refresh,
  subscribe,
  type ChatGptSubscriptionState,
} from "./chatgpt-subscription";

const SERVER_SNAPSHOT: ChatGptSubscriptionState = { kind: "unsupported" };

/** Thin React edge over the shared, testable subscription-status store. */
export function useChatGptSubscription(): ChatGptSubscriptionState {
  const state = useSyncExternalStore(subscribe, peek, () => SERVER_SNAPSHOT);
  useEffect(() => {
    const refreshStatus = () => {
      void refresh();
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshStatus();
    };

    refreshStatus();
    // Settings has its own BrowserWindow. Re-check the secret-free DTO when
    // this window becomes active again so connect/sign-out is reflected
    // without reloading the workspace.
    window.addEventListener("focus", refreshStatus);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refreshStatus);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);
  return state;
}
