import React, { memo, useCallback, useMemo, useState } from "react";
import styled from "@emotion/styled";
import { TreeView } from "@editor-ui/editor";
import { ListView } from "@editor-ui/listview";
import { PageRow } from "./home-side-bar-tree-item";

export function HomeSidebarTree() {
  const renderItem = useCallback(
    ({ id, name, depth }, index: number, { isDragging }: ListView.ItemInfo) => {
      return (
        <PageRow
          name={name}
          depth={depth}
          id={id}
          key={id}
          expanded={false}
          selected={false}
          onAddClick={() => {}}
          onMenuClick={() => {}}
          onDoubleClick={() => {}}
          onPress={() => {}}
          onSelectMenuItem={() => {}}
          onContextMenu={() => {}}
        />
      );
    },
    []
  );

  const pageInfo = [
    { id: "1", name: "Page 1", depth: 0 },
    { id: "2", name: "Page 2", depth: 0 },
    { id: "3", name: "Page 3", depth: 0 },
    { id: "4", name: "Page 4", depth: 0 },
    { id: "5", name: "Page 5", depth: 0 },
  ];
  return (
    <TreeView.Root
      sortable={true}
      data={pageInfo}
      keyExtractor={useCallback((item: any) => item.id, [])}
      // onMoveItem={}
      acceptsDrop={() => false}
      renderItem={renderItem}
    />
  );
}
