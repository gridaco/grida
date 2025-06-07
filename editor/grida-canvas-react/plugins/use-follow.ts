import * as React from "react";
import { useSyncExternalStoreWithSelector } from "use-sync-external-store/shim/with-selector";
import { EditorFollowPlugin } from "@/grida-canvas/plugins/follow";
import equal from "fast-deep-equal";

export function useFollowPlugin(plugin: EditorFollowPlugin) {
  const state = useSyncExternalStoreWithSelector(
    plugin.subscribe.bind(plugin),
    plugin.snapshot.bind(plugin),
    plugin.snapshot.bind(plugin),
    (s) => s,
    equal
  );

  return React.useMemo(
    () => ({
      isFollowing: state.isFollowing,
      cursor: state.cursor,
      follow: (cursor_id: string) => plugin.follow(cursor_id),
      unfollow: () => plugin.unfollow(),
    }),
    [state, plugin]
  );
}
