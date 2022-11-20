import React, { useCallback } from "react";
import { TreeView } from "@editor-ui/editor";
import { useDashboard } from "../core/provider";
import { HierarchyRow, IconContainer, LayerIcon } from "../components";
import type { DashboardItem } from "../core/state";

export function DashboardHierarchy() {
  const { hierarchy, selectNode, selection } = useDashboard();
  const { sections } = hierarchy;

  const data = sections.reduce((acc, item) => {
    return [...acc, ...item.items];
  }, []);

  const renderItem = useCallback(
    (item: DashboardItem, i: number) => {
      const selected = selection.includes(item.id);
      const depth = item.path.split("/").length - 1;
      return (
        <HierarchyRow
          key={item.path} // todo: update - this needs to be a unique path
          selected={selected}
          depth={depth}
          name={item.name}
          onPress={() => {
            selectNode(item.id);
          }}
          icon={
            <IconContainer>
              <LayerIcon type={item.type as any} selected={selected} />
            </IconContainer>
          }
          onMenuClick={() => {
            //
          }}
        />
      );
    },
    [selection, selectNode]
  );

  return (
    <TreeView.Root
      data={data}
      keyExtractor={useCallback((item: any) => item.id, [])}
      renderItem={renderItem}
    />
  );
}
