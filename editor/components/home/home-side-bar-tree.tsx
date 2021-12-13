import React, { memo, useCallback, useMemo, useState } from "react";
import styled from "@emotion/styled";
import { TreeView } from "@editor-ui/editor";
import { ListView } from "@editor-ui/listview";
import { PageRow } from "./home-side-bar-tree-item";
import { useRouter } from "next/router";

export function HomeSidebarTree() {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(router.pathname);

  const renderItem = useCallback(
    ({ id, name, path, depth, children }, index: number) => {
      return (
        <PageRow
          id={id}
          name={name}
          key={id}
          depth={depth}
          expanded={children?.length > 0 ? false : undefined}
          selected={selected == path}
          onAddClick={() => {}}
          onMenuClick={() => {}}
          onDoubleClick={() => {}}
          onPress={() => {
            setSelected(path);
            router.push(path);
          }}
          onClickChevron={() => {}}
          onContextMenu={() => {}}
        />
      );
    },
    [selected]
  );

  const pageInfo = [
    {
      id: "/",
      name: "Home",
      path: "/",
      depth: 0,
      children: [
        {
          id: "/#recents",
          name: "Recents",
          path: "/#recents",
          depth: 1,
        },
        {
          id: "/#files",
          name: "Files",
          path: "/#files",
          depth: 1,
        },
        {
          id: "/#scenes",
          name: "Scenes",
          path: "/#scenes",
          depth: 1,
        },
        {
          id: "/#components",
          name: "Components",
          path: "/#components",
          depth: 1,
        },
      ],
    },
    {
      id: "/files",
      name: "Files",
      path: "/files",
      depth: 0,
    },
    {
      id: "/components",
      name: "Components",
      path: "/components",
      depth: 0,
    },
    {
      id: "/integrations",
      name: "Import / Sync",
      path: "/integrations",
      depth: 0,
    },
    {
      id: "/docs",
      name: "Docs",
      path: "/docs",
      depth: 0,
    },
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
