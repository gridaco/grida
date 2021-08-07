import React, { memo, useCallback, useMemo, useState } from "react";
import { PlusIcon } from "@radix-ui/react-icons";
import { Spacer } from "@editor-ui/spacer";
import { Button } from "@editor-ui/button";
import { ListView } from "@editor-ui/listview";
import { MenuItem } from "@editor-ui/context-menu";
import styled from "@emotion/styled";
import { useApplicationState, useDispatch } from "@core/app-state";

import { PageMenuItemType } from "./page-menu-item-type";
import { PageRow } from "./page-row-item";
import { PageParentId, PageRoot } from "@core/state";
import { isOnRoot } from "@core/model/page";
import { groupbyPageParent, sortAsGroupping } from "./tree-handle";

const Container = styled.div(({ theme }) => ({
  height: "200px",
  display: "flex",
  flexDirection: "column",
}));

const Header = styled.div(({ theme }) => ({
  ...theme.textStyles.small,
  userSelect: "none",
  cursor: "pointer",
  fontWeight: 500,
  paddingTop: "8px",
  paddingRight: "8px",
  paddingBottom: "0px",
  paddingLeft: "20px",
  display: "flex",
  alignItems: "center",
}));

interface IPageData<T = any> {
  id: string;
  name: string;
  parent?: PageParentId;
  children?: IPageData[];
}

interface PageListContentProps {
  selectedPageId: string;
  pageInfo?: IPageData[];
  canDelete: boolean;
}

const PageListContent = memo(function PageListContent({
  selectedPageId,
  pageInfo,
  canDelete,
}: PageListContentProps) {
  const dispatch = useDispatch();

  const menuItems: MenuItem<PageMenuItemType>[] = useMemo(
    () => [
      { value: "duplicate", title: "Duplicate Page" },
      { value: "rename", title: "Rename Page" },
      ...(canDelete
        ? [{ value: "delete" as PageMenuItemType, title: "Delete Page" }]
        : []),
    ],
    [canDelete]
  );

  const handleSelectMenuItem = useCallback(
    (value: PageMenuItemType) => {
      switch (value) {
        case "rename": {
          const name = prompt("New page Name");

          if (name)
            dispatch({
              type: "rename-current-page",
              name: name,
            });
          break;
        }
        case "duplicate": {
          dispatch({ type: "duplicate-current-page" });
          break;
        }
        case "delete":
          dispatch({ type: "delete-current-page" });
          break;
      }
    },
    [dispatch]
  );

  const handleAddPage = useCallback(
    (parent: PageParentId) => {
      const name = prompt("New page Name");
      if (name !== null)
        dispatch({
          type: "add-page",
          name,
          parent,
        });
    },
    [dispatch]
  );

  function getpage(id): IPageData {
    return pageInfo.find((p) => p.id == id);
  }
  function getRowDepth(page: IPageData, depth: number): number {
    if (!isOnRoot(page)) {
      depth++;
      const parentArr = getpage(page.parent);
      depth = getRowDepth(parentArr, depth);
    }
    return depth;
  }

  const pageElements = useMemo(() => {
    return pageInfo.map((page, i) => {
      let initDepth = 0;
      const _depth = getRowDepth(page, initDepth);

      return (
        <PageRow
          name={page.name}
          depth={_depth}
          id={page.id}
          key={page.id}
          expanded={true}
          selected={selectedPageId === page.id}
          onAddClick={() => {
            handleAddPage(page.id);
          }}
          onMenuClick={() => {
            console.log("not implemented");
          }}
          onClick={() => {
            dispatch({
              type: "select-page",
              page: page.id,
            });
          }}
          menuItems={menuItems}
          onSelectMenuItem={handleSelectMenuItem}
          onContextMenu={() => {
            dispatch({
              type: "select-page",
              page: page.id,
            });
          }}
        />
      );
    });
  }, [pageInfo, selectedPageId, menuItems, handleSelectMenuItem, dispatch]);

  return (
    <Container>
      <Header>
        Pages
        <Spacer.Horizontal />
        <Button
          id="add-page"
          tooltip="Add a new page"
          onClick={() => {
            handleAddPage(PageRoot);
          }}
        >
          <PlusIcon />
        </Button>
      </Header>
      <ListView.Root
        sortable={true}
        onMoveItem={useCallback(
          (originindex, targetindex) => {
            console.log(originindex, targetindex);
            const movingitem = pageInfo[originindex];
            console.log("movingitem", movingitem);
            const originorder = pageInfo
              .filter((p) => movingitem.parent === p.parent)
              .indexOf(movingitem);

            const targetteditem = pageInfo[targetindex]; // FIXME:
            const targetorder = pageInfo
              .filter((p) => targetteditem.parent === p.parent)
              .indexOf(targetteditem);

            dispatch({
              type: "move-page",
              originOrder: originorder,
              targetOrder: targetorder,
              originParent: movingitem.parent,
              targetParent: targetteditem.parent,
            });
          },
          [pageInfo, dispatch]
        )}
      >
        {pageElements}
      </ListView.Root>
    </Container>
  );
});

export function PageList() {
  const [state] = useApplicationState();
  const pages = state.pages;

  const grounpAsPages = groupbyPageParent(pages);
  console.log(pages, grounpAsPages);

  const sortAsPages = sortAsGroupping(grounpAsPages);

  return (
    <PageListContent
      selectedPageId={state.selectedPage}
      pageInfo={sortAsPages}
      canDelete={state.pages.length > 1}
    />
  );
}
