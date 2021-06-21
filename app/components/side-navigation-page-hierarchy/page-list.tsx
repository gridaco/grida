import React, { memo, useCallback, useMemo } from "react";
import { PlusIcon } from "@radix-ui/react-icons";
import { Spacer } from "@editor-ui/spacer";
import { Button } from "@editor-ui/button";
import { ListView } from "@editor-ui/listview";
import { MenuItem } from "@editor-ui/context-menu";
import styled from "@emotion/styled";
import { useApplicationState, useDispatch } from "@core/app-state";

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

type MenuItemType = "duplicate" | "rename" | "delete";

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

  const menuItems: MenuItem<MenuItemType>[] = useMemo(
    () => [
      { value: "duplicate", title: "Duplicate Page" },
      { value: "rename", title: "Rename Page" },
      ...(canDelete
        ? [{ value: "delete" as MenuItemType, title: "Delete Page" }]
        : []),
    ],
    [canDelete]
  );

  const handleSelectMenuItem = useCallback(
    (value: MenuItemType) => {
      switch (value) {
        case "rename": {
          const name = prompt("New page Name");

          if (name) dispatch("renamePage", name);
          break;
        }
        case "duplicate": {
          dispatch("duplicatePage");
          break;
        }
        case "delete":
          dispatch("deletePage");
          break;
      }
    },
    [dispatch]
  );

  const handleAddPage = useCallback(() => {
    const name = prompt("New page Name");

    if (name !== null) dispatch("addPage", name);
  }, [dispatch]);

  const pageElements = useMemo(() => {
    return pageInfo.map((page) => (
      <ListView.Row<MenuItemType>
        id={page.id}
        key={page.id}
        selected={selectedPageId === page.id}
        onClick={() => {
          dispatch("selectPage", page.id);
        }}
        menuItems={menuItems}
        onSelectMenuItem={handleSelectMenuItem}
        onContextMenu={() => {
          dispatch("selectPage", page.id);
        }}
      >
        <Spacer.Horizontal size={6 + 15} />
        {page.name}
      </ListView.Row>
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
          (sourceIndex, destinationIndex) => {
            dispatch("movePage", sourceIndex, destinationIndex);
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

  const pageInfo = state.pages;
  // useDeepArray(
  //   state.pages.map((page) => ({
  //     do_objectID: page.id,
  //     name: page.name,
  //   }))
  // );

  return (
    <PageListContent
      selectedPageId={state.selectedPage}
      pageInfo={pageInfo}
      canDelete={state.pages.length > 1}
    />
  );
}
