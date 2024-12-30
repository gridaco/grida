import React from "react";
import { HomeScaffold } from "@editor-ui/workspace";
import { SideNavigation, TopBar } from "../components";
import { EditorThemeProvider } from "@editor-ui/theme";
import { CurrentPage } from "../built-in-pages/current";
import { ModalContextProvider } from "@editor-ui/dialog";

export function Scaffold(props: {
  mode: "desktop" | "browser";
  controlDoubleClick: () => void;
}) {
  const navigation = (
    <SideNavigation
      // if desktop && mac, show top draggable
      top={props.mode == "desktop"}
      controlDoubleClick={props.controlDoubleClick}
    />
  );

  const topBar = (
    <TopBar controlDoubleClick={props.controlDoubleClick} isMain={true} />
  );
  return (
    <EditorThemeProvider light>
      <ModalContextProvider>
        <HomeScaffold
          navigation={navigation}
          topBar={topBar}
          controlDoubleClick={props.controlDoubleClick}
        >
          <>
            <CurrentPage />
          </>
        </HomeScaffold>
      </ModalContextProvider>
    </EditorThemeProvider>
  );
}
