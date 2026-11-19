// GRIDA-SEC-004 / GRIDA-SEC-014 — catalog roots and state directories come from Main.
import {
  NativeChatCatalog,
  readClosedChatCatalog,
} from "./native-chat-catalog";
import type { NativeDesktopAgent } from "./native-desktop-agent";
import { servicesSidecarClient } from "./services-sidecar-client";

export function createDesktopChatCatalog(
  native: NativeDesktopAgent | null | undefined,
  resourcesPath: string
): NativeChatCatalog | undefined {
  if (!native) return undefined;
  return new NativeChatCatalog({
    workspaces: () => servicesSidecarClient.listWorkspaces(),
    resolve: (id) => native.catalogWorkspace(id),
    generation: () => native.catalogGeneration,
    read: (workspace, cursor) =>
      native.withCatalogStore(
        workspace.id,
        workspace.root,
        async (active, directory) => {
          if (active) {
            if (!active.messageActivityCatalog)
              throw new Error("native_chat_catalog_query_unavailable");
            return active.messageActivityCatalog(cursor);
          }
          return directory
            ? readClosedChatCatalog(
                resourcesPath,
                directory,
                workspace.root,
                cursor
              )
            : {
                sessions: [],
                _meta: {
                  "co.grida/runningSessionIds": [],
                  "co.grida/inputNeededSessionIds": [],
                },
              };
        }
      ),
  });
}
