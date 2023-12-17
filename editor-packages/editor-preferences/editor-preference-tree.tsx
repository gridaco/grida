import React, { useCallback, useMemo } from "react";
import { TreeView } from "@editor-ui/hierarchy";
import type { PreferenceRouteInfo } from "./core";
import { EditorPreferenceRouteItem } from "./editor-preference-route-item";
import { useDispatch, usePreferences } from "./editor-preference";
import { visit } from "tree-visit";
import { ExpansionStateStore } from "./stores";

// const depth = useMemo(() => route.split("/").length - 1, [route]);

// const [expanded, setExpanded] = useState(
//   expandable ? ExpansionStateStore.get(route) : undefined
// );

// useEffect(() => {
//   if (expandable) {
//     ExpansionStateStore.set(route, expanded);
//   }
// }, [expanded]);

export function EditorPreferenceTree() {
  const state = usePreferences();
  const dispatch = useDispatch();

  const { route, routes } = state;

  const [expands, setExpands] = React.useState<string[]>([]);

  const findchildren = useCallback(
    (route: string) => {
      return routes.filter((r) => r.route !== route && r.route.includes(route));
    },
    [state.routes]
  );

  return (
    <TreeView.Root
      sortable={false}
      scrollable={false}
      data={routes}
      keyExtractor={useCallback((item: PreferenceRouteInfo) => item.route, [])}
      renderItem={useCallback(
        (item: PreferenceRouteInfo, index) => {
          const selected = item.route === route;
          const depth = item.route.split("/").length - 1;
          const expandable = useMemo(
            () => findchildren(item.route).length > 0,
            [item.route]
          );

          return (
            <EditorPreferenceRouteItem
              key={item.route}
              // expanded={}
              selected={selected}
              route={item.route}
              name={item.name}
              onPress={() => {
                dispatch({
                  type: "route",
                  route: item.route,
                });
              }}
              depth={depth}
            />
          );
        },
        [state.route]
      )}
    />
  );
}
