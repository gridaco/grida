import React, { useCallback } from "react";
import { TreeView } from "@editor-ui/editor";
import { useDashboard } from "../core/provider";
import { HierarchyRow, IconContainer, LayerIcon } from "../components";
import { NextRouter, useRouter } from "next/router";
import type { DashboardItem } from "../core/state";

export function DashboardHierarchy() {
  const router = useRouter();
  const { hierarchy, selectNode, selection } = useDashboard();
  const { sections } = hierarchy;

  // const data = sections.reduce((acc, item) => {
  //   return [...acc, ...item.items];
  // }, []);

  const renderItem = useCallback(
    (item: DashboardItem, i: number) => {
      const selected = selection.includes(item.id);
      const depth = getHierarchyDepth(item.path);

      return (
        <HierarchyRow
          key={item.path} // todo: update - this needs to be a unique path
          selected={selected}
          depth={depth}
          name={item.name}
          onPress={() => {
            if (item.$type === "folder") {
              // this is dirty workaround for awaiting the router to update first from the editor-reducer caused by the select node action.
              setTimeout(() => {
                pushhash(router, item.path);
              }, 10);
            }

            selectNode(item.id);
          }}
          icon={
            <IconContainer>
              <LayerIcon type={item.$type as any} selected={selected} />
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
      data={sections}
      keyExtractor={useCallback((item: any) => item.id, [])}
      renderItem={renderItem}
    />
  );
}

function pushhash(router: NextRouter, hash: string) {
  router
    .push(
      {
        // add anchor to url
        hash: hash,
      },
      null,
      {
        shallow: true,
      }
    )
    .catch((e) => {
      // workaround for https://github.com/vercel/next.js/issues/37362
      if (!e.cancelled) {
        throw e;
      }
    });
}

/**
 * get the depth via the path (ignore the first slash)
 * @param path
 * @returns
 */
function getHierarchyDepth(path: string): number {
  const splits = path.split("/");
  if (splits[0] === "") {
    return splits.length - 2;
  }
  return splits.length - 1;
}
