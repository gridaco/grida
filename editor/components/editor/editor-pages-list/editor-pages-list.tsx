import React, { useCallback } from "react";
import styled from "@emotion/styled";
import { TreeView } from "@editor-ui/hierarchy";
import { EditorPageItem } from "./editor-page-item";
import { useEditorState } from "core/states";
import { useDispatch } from "core/dispatch";

const Container = styled.div<{ expanded: boolean }>(({ theme, expanded }) => ({
  ...(expanded ? { height: "200px" } : { flex: "0 0 auto" }),
  display: "flex",
  flexDirection: "column",
}));

export type PageInfo = {
  id: string;
  name: string;
  type: "home" | "canvas" | "components" | "styles" | "assets";
};

export function EditorPagesList() {
  const [state] = useEditorState();
  const dispatch = useDispatch();
  const pages = [
    // default pages
    { id: "home", name: "Dashboard", type: "home" },
    // design canvas pages
    ...(state.design?.pages ?? []),
  ];

  return (
    <Container expanded={true}>
      <TreeView.Root
        sortable={false}
        scrollable={false}
        data={pages}
        keyExtractor={useCallback((item: PageInfo) => item.id, [])}
        renderItem={useCallback(
          (page: PageInfo, index) => {
            const selected = page.id === state.selectedPage;
            return (
              <EditorPageItem
                key={page.id}
                type={page.type}
                selected={selected}
                id={page.id}
                name={page.name}
                onPress={() => {
                  dispatch({
                    type: "select-page",
                    page: page.id,
                  });
                }}
              />
            );
          },
          [state.selectedPage]
        )}
      />
    </Container>
  );
}
