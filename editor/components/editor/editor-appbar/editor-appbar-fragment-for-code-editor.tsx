import React from "react";
import styled from "@emotion/styled";
import { useRouter } from "next/router";
import { EditorAppbarIconButton } from "./editor-appbar-icon-button";
import { GithubIcon, NotificationBellIcon } from "icons";
import { EditorFrameworkConfigOnAppbar } from "../editor-framework-config-on-appbar";

export function AppbarFragmentForCodeEditor() {
  const router = useRouter();
  const hasNotification = false;

  return (
    <RootWrapperAppbarFragmentForCodeEditor>
      <EditorFrameworkConfigOnAppbar />
      <AppbarActions>
        {hasNotification && (
          <EditorAppbarIconButton onClick={() => {}}>
            <NotificationBellIcon size={24} color="#787878" />
          </EditorAppbarIconButton>
        )}
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

const RootWrapperAppbarFragmentForCodeEditor = styled.div`
  z-index: 10;
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: center;
  flex: 1;
  gap: 10px;
  align-self: stretch;
  box-sizing: border-box;
  padding-bottom: 14px;
  padding-top: 14px;
  padding-left: 12px;
  padding-right: 20px;
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
