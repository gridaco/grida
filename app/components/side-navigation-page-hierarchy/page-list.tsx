import React, { memo, useCallback, useMemo, useState } from "react";
import { PlusIcon } from "@radix-ui/react-icons";
import { Spacer, TreeView } from "@editor-ui/editor";
import { Button } from "@editor-ui/button";
import { ListView } from "@editor-ui/listview";
import { MenuItem } from "@editor-ui/context-menu";
import styled from "@emotion/styled";
import { useApplicationState, useDispatch } from "@core/app-state";

import { PageMenuItemType } from "./page-menu-item-type";
import { PageRow } from "./page-row-item";
import { PageParentId, PageRoot } from "@core/state";
import { isOnRoot } from "@core/model/page";
import { transform } from "./tree-handle";

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
  depth: number;
  parent?: PageParentId;
  children?: IPageData[];
  data?: T;
}

interface PageListContentProps {
  selectedPageId: string;
  pageInfo?: IPageData[];
  canDelete: boolean;
}

function AddPageButton(props: { callbck }) {
  return (
    <Button
      id="add-page"
      tooltip="Add a new page"
      onClick={() => {
        props.callbck(PageRoot);
      }}
    >
      <PlusIcon />
    </Button>
  );
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

  const renderItem = useCallback(
    (
      { id, name, depth }: IPageData,
      index: number,
      { isDragging }: ListView.ItemInfo
    ) => {
      return (
        <PageRow
          name={name}
          depth={depth}
          id={id}
          key={id}
          expanded={false}
          selected={selectedPageId === id}
          onAddClick={() => {
            handleAddPage(id);
          }}
          onMenuClick={() => {
            console.log("not implemented");
          }}
          onDoubleClick={() => {
            console.log("on double click");
          }}
          onPress={() => {
            dispatch({
              type: "select-page",
              page: id,
            });
          }}
          // menuItems={menuItems}
          onSelectMenuItem={handleSelectMenuItem}
          onContextMenu={() => {
            dispatch({
              type: "select-page",
              page: id,
            });
          }}
        />
      );
    },
    [dispatch, menuItems, selectedPageId]
  );

  return (
    <Container>
      <Header>
        <AddPageButton callbck={handleAddPage} />
      </Header>
      <TreeView.Root
        sortable={true}
        data={pageInfo}
        // pressEventName="onClick"
        keyExtractor={useCallback((item: any) => item.id, [])}
        onMoveItem={useCallback(
          (originindex, targetindex, pos) => {
            console.log(originindex, targetindex, pos);
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
              id: movingitem.id,
              originOrder: originorder,
              targetOrder: targetorder,
              originParent: movingitem.parent,
              targetParent: targetteditem.parent,
              movingPositon: pos,
            });
          },
          [pageInfo, dispatch]
        )}
        acceptsDrop={() => true}
        // @ts-ignore
        renderItem={renderItem}
      ></TreeView.Root>
    </Container>
  );
});

export function PageList() {
  const [state] = useApplicationState();
  const tree = transform(state.pages);
  return (
    <PageListContent
      selectedPageId={state.selectedPage}
      // @ts-ignore
      pageInfo={tree}
      canDelete={tree.length > 1}
    />
  );
}
