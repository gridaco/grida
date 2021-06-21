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

interface Props {
  selectedPageId: string;
  pageInfo: { id: string; name: string }[];
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
              type: "renamePage",
              name: name,
            });
          break;
        }
        case "duplicate": {
          dispatch({ type: "duplicatePage" });
          break;
        }
        case "delete":
          dispatch({ type: "deletePage" });
          break;
      }
    },
    [dispatch]
  );

  const handleAddPage = useCallback(() => {
    const name = prompt("New page Name");

    if (name !== null)
      dispatch({
        type: "addPage",
        name,
      });
  }, [dispatch]);

  const pageElements = useMemo(() => {
    return pageInfo.map((page) => (
      <PageRow
        name={page.name}
        depth={0}
        id={page.id}
        key={page.id}
        selected={selectedPageId === page.id}
        onAddClick={handleAddPage}
        onMenuClick={() => {
          console.log("not implemented");
        }}
        onClick={() => {
          dispatch({
            type: "selectPage",
            page: page.id,
          });
        }}
        menuItems={menuItems}
        onSelectMenuItem={handleSelectMenuItem}
        onContextMenu={() => {
          dispatch({
            type: "selectPage",
            page: page.id,
          });
        }}
      />
    ));
  }, [pageInfo, selectedPageId, menuItems, handleSelectMenuItem, dispatch]);

  return (
    <Container>
      <Header>
        Pages
        <Spacer.Horizontal />
        <Button id="add-page" tooltip="Add a new page" onClick={handleAddPage}>
          <PlusIcon />
        </Button>
      </Header>
      <ListView.Root
        sortable={true}
        onMoveItem={useCallback(
          (originOrder, targetOrder) => {
            dispatch({
              type: "movePage",
              originOrder,
              targetOrder,
              originParent: "", // todo
              targetParent: "", // todo
            });
          },
          [dispatch]
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

  return (
    <PageListContent
      selectedPageId={state.selectedPage}
      pageInfo={pages}
      canDelete={state.pages.length > 1}
    />
  );
}
