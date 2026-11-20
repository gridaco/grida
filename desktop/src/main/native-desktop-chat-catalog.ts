// GRIDA-SEC-004 / GRIDA-SEC-014 — catalog roots and state directories come from Main.
import {
  NativeChatCatalog,
  readClosedChatCatalog,
} from "./native-chat-catalog";
import { LiveChatCatalog } from "./live-chat-catalog";
import { NativeAgentProcess } from "./native-agent-process";
import type { DesktopChatCatalogQuery } from "@grida/desktop-bridge";
import type { NativeDesktopAgent } from "./native-desktop-agent";
import { servicesSidecarClient } from "./services-sidecar-client";

type CatalogAgent = Pick<
  NativeDesktopAgent,
  | "catalogGeneration"
  | "catalogLocation"
  | "catalogRegistryDirectory"
  | "catalogWorkspace"
  | "onCatalogReset"
  | "withCatalogStore"
>;

const unavailableWorkspace = new Set([
  "workspace_not_registered",
  "native_workspace_not_registered",
  "native_workspace_root_changed",
  "native_workspace_root_denied",
  "native_chat_workspace_invalid",
]);

export function createDesktopChatCatalog(
  native: CatalogAgent | null | undefined,
  resourcesPath: string
) {
  if (!native) return undefined;
  const locations = async () => {
    const workspaces = await servicesSidecarClient.listWorkspaces();
    if (workspaces.length > 256)
      throw new Error("native_chat_catalog_workspace_limit");
    const admitted = [];
    for (const { id } of workspaces) {
      try {
        admitted.push(await native.catalogLocation(id));
      } catch (error) {
        // An unmounted or revoked root stays registered. Its denial is local.
        if (
          !(error instanceof Error) ||
          !unavailableWorkspace.has(error.message)
        )
          throw error;
      }
    }
    return admitted;
  };
  const legacy = new NativeChatCatalog({
    workspaces: async () =>
      (await locations()).map(({ id, cwd }) => ({ id, root: cwd })),
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
  const live = new LiveChatCatalog({
    directory: native.catalogRegistryDirectory,
    locations,
    resolve: (id) => native.catalogWorkspace(id),
    start: (manifest, changed) =>
      NativeAgentProcess.startCatalog(resourcesPath, manifest, changed),
  });
  servicesSidecarClient.onWorkspaceMembershipChange(() =>
    live.membershipChanged()
  );
  native.onCatalogReset = (shutdown) => live.reset(shutdown);
  return {
    list: async (query: DesktopChatCatalogQuery, check: () => void) =>
      (await live.list(query, check)) ?? legacy.list(query, check),
    live,
  };
}
export type DesktopChatCatalog = NonNullable<
  ReturnType<typeof createDesktopChatCatalog>
>;
