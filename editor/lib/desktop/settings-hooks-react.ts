"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { getDesktopBridge } from "./bridge";
import { SettingsHooks } from "./settings-hooks";

export function useSettingsHooks() {
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
  return { controller, state };
}
