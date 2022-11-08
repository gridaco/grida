import React, { useCallback } from "react";
import { TreeView } from "@editor-ui/hierarchy";
import type { PreferenceRouteInfo } from "./core";
import { EditorPreferenceRouteItem } from "./editor-preference-route-item";
import { useDispatch, usePreferences } from "./editor-preference";

export function EditorPreferenceTree() {
  const state = usePreferences();
  const dispatch = useDispatch();

  return (
    <TreeView.Root
      sortable={false}
      scrollable={false}
      data={state.routes}
      keyExtractor={useCallback((item: PreferenceRouteInfo) => item.id, [])}
      renderItem={useCallback(
        (item: PreferenceRouteInfo, index) => {
          const selected = item.id === state.route;
          return (
            <EditorPreferenceRouteItem
              key={item.id}
              // type={item.type}
              selected={selected}
              id={item.id}
              name={item.name}
              onPress={() => {
                dispatch({
                  type: "route",
                  route: item.id,
                });
              }}
            />
          );
        },
        [state.route]
      )}
    />
  );
}
