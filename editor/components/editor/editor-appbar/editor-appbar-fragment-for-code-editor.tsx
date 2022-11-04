import React from "react";
import styled from "@emotion/styled";
import { EditorAppbarIconButton } from "./editor-appbar-icon-button";
import { GithubIcon, NotificationBellIcon } from "icons";
import { EditorFrameworkConfigOnAppbar } from "../editor-framework-config-on-appbar";
import { EditorProgressIndicator } from "scaffolds/editor-progress-indicator";
import { colors } from "theme";

export function AppbarFragmentForRightSidebar({
  background = false,
  flex = 1,
}: {
  background?: boolean;
  flex?: number;
}) {
  const hasNotification = false;

  return (
    <RootWrapperAppbarFragmentForCodeEditor
      flex={flex}
      background={background ? colors.color_editor_bg_on_dark : "transparent"}
    >
      {/* disable temporarily */}
      <div style={{ flex: 1 }} />
      {/* <EditorFrameworkConfigOnAppbar /> */}
      <AppbarActions>
        {hasNotification && (
          <EditorAppbarIconButton onClick={() => {}}>
            <NotificationBellIcon size={24} color="#787878" />
          </EditorAppbarIconButton>
        )}
        <EditorProgressIndicator />
        <EditorAppbarIconButton
          onClick={() => {
            window.open("https://github.com/gridaco/designto-code/", "_blank");
          }}
        >
          <GithubIcon size={18} color="#787878" />
        </EditorAppbarIconButton>
      </AppbarActions>
    </RootWrapperAppbarFragmentForCodeEditor>
  );
}

const RootWrapperAppbarFragmentForCodeEditor = styled.div<{
  background: React.CSSProperties["background"];
  flex: number;
}>`
  z-index: 10;
  display: flex;
  justify-content: end;
  flex-direction: row;
  align-items: center;
  flex: ${(props) => props.flex};
  gap: 10px;
  align-self: stretch;
  box-sizing: border-box;
  padding-bottom: 14px;
  padding-top: 14px;
  padding-left: 12px;
  padding-right: 20px;
  background: ${(props) => props.background};
`;

const AppbarActions = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 14px;
  height: 24px;
  box-sizing: border-box;
`;
