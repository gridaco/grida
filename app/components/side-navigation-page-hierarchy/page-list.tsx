import React, { memo, useCallback, useMemo } from "react";
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

interface IPageInfo {
  id: string;
  name: string;
  parent?: string;
}

interface IPageInfoObj {
  id: string;
  name: string;
  children: IPageInfoObj[];
}

interface Props {
  selectedPageId: string;
  pageInfo: IPageInfo[];
  canDelete: boolean;
}

const PageListContent = memo(function PageListContent({
  selectedPageId,
  pageInfo,
  canDelete,
}: Props) {
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

  function absDepth(page: IPageInfo, abs_i: number): number {
    let depth = 0;
    let parentArr = abs_i;
    let _pageParent = page.parent;
    while (abs_i !== 0) {
      const res = pageInfo
        .slice(0, parentArr)
        .find((_page) => _page.id === _pageParent);
      if (!res) {
        break;
      }
      depth++;
      parentArr = pageInfo.indexOf(res);
      _pageParent = pageInfo[parentArr].parent;
    }
    return depth;
  }

  const pageElements = useMemo(() => {
    return pageInfo.map((page, i) => {
      const _depth = absDepth(page, i);

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
          (originOrder, targetOrder) => {
            dispatch({
              type: "move-page",
              originOrder,
              targetOrder,
              originParent: pageInfo[originOrder].parent, //todo
              targetParent: pageInfo[targetOrder].parent, // todo
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

  const pagesSort: IPageInfo[] = useMemo(() => {
    function createTree(nodes: IPageInfo[], parentId: string) {
      const _tree = nodes
        .filter((node) => node.parent === parentId)
        .reduce(
          (tree, node) => [
            ...tree,
            {
              ...node,
              children: createTree(nodes, node.id),
            },
          ],
          []
        );
      return _tree;
    }

    const tree = createTree(pages, pages[0].parent);
    let _arr = [];

    function treeArray(_tree: IPageInfoObj[]) {
      _tree.map((page) => {
        _arr.push(page);
        if (page.children.length > 0) {
          treeArray(page.children);
        }
      });
    }
    treeArray(tree);
    return _arr;
  }, [pages]);

  return (
    <PageListContent
      selectedPageId={state.selectedPage}
      pageInfo={pagesSort}
      canDelete={state.pages.length > 1}
    />
  );
}
