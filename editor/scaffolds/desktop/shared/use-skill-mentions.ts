"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { DesktopNativeChat } from "@grida/desktop-bridge";
import { SkillMentions } from "@/lib/agent-chat/skill-mentions";

export function useSkillMentions(
  read: DesktopNativeChat["skills"],
  workspaceId?: string
) {
  const catalog = useMemo(
    () => new SkillMentions.Catalog(read, workspaceId),
    [read, workspaceId]
  );
  useEffect(() => catalog.release, [catalog]);
  const mentions = useSyncExternalStore(
    catalog.subscribe,
    catalog.read,
    catalog.read
  );
  return {
    mentions: read ? mentions : undefined,
    refresh: read ? catalog.refresh : undefined,
  };
}
