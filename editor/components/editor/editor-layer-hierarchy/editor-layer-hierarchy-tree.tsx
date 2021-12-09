import React, { memo, useCallback, useMemo, useState } from "react";

import styled from "@emotion/styled";
import { TreeView } from "@editor-ui/editor";
import { ListView } from "@editor-ui/listview";
import { LayerRow } from "./editor-layer-hierarchy-item";

export function EditorLayerHierarchy() {
  const renderItem = useCallback(
    ({ id, name, depth }, index: number, { isDragging }: ListView.ItemInfo) => {
      return (
        <LayerRow
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
    { id: "1", name: "Screen", depth: 0 },
    { id: "2", name: "Layer 1", depth: 0 },
    { id: "3", name: "Layer 2", depth: 0 },
    { id: "4", name: "Layer 3", depth: 0 },
    { id: "5", name: "Layer 4", depth: 0 },
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
