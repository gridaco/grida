import React, { memo, useCallback, useMemo, useState } from "react";
import styled from "@emotion/styled";
import { TreeView } from "@editor-ui/editor";
import { PageRow } from "./home-side-bar-tree-item";
import { useRouter } from "next/router";
import { flatten } from "components/editor/editor-layer-hierarchy/editor-layer-heriarchy-controller";
interface PresetPage {
  id: string;
  name: string;
  path: string;
  depth: number;
  children?: PresetPage[];
}

const preset_pages: PresetPage[] = [
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
      // {
      //   id: "/#scenes",
      //   name: "Scenes",
      //   path: "/#scenes",
      //   depth: 1,
      // },
      // {
      //   id: "/#components",
      //   name: "Components",
      //   path: "/#components",
      //   depth: 1,
      // },
    ],
  },
  {
    id: "/files",
    name: "Files",
    path: "/files",
    depth: 0,
  },
  // {
  //   id: "/components",
  //   name: "Components",
  //   path: "/components",
  //   depth: 0,
  // },
  // {
  //   id: "/integrations",
  //   name: "Import / Sync",
  //   path: "/integrations",
  //   depth: 0,
  // },
  {
    id: "help",
    name: "Help",
    path: "",
    depth: 0,
    children: [
      {
        id: "bug-report",
        name: "Bug report",
        path: "https://github.com/gridaco/designto-code/issues/new",
        depth: 1,
      },
      {
        id: "Github",
        name: "Github",
        path: "https://github.com/gridaco/designto-code/",
        depth: 1,
      },
      {
        id: "docs",
        name: "Docs",
        path: "https://github.com/gridaco/designto-code/tree/main/docs",
        depth: 1,
      },
    ],
  },
  {
    id: "Figma",
    name: "Figma",
    path: "",
    depth: 0,
    children: [
      {
        id: "setup-figma-pat",
        name: "Set Access Token",
        path: "/preferences/access-tokens",
        depth: 1,
      },
    ],
  },
];

export function HomeSidebarTree() {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(router.asPath);

  const renderItem = useCallback(
    ({ id, name, path, depth, children }, index: number) => {
      return (
        <PageRow
          id={id}
          name={name}
          key={id}
          depth={depth}
          expanded={children?.length > 0 ? true : undefined}
          selected={selected == path}
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

  const pages = preset_pages.map((pageroot) => flatten(pageroot)).flat();
  return (
    <TreeView.Root
      data={pages}
      keyExtractor={useCallback((item: any) => item.id, [])}
      renderItem={renderItem}
    />
  );
}
