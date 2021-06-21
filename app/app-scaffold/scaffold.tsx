import React from "react";
import { HomeScaffold } from "@editor-ui/workspace";
import { SideNavigation, TopBar } from "../components";
import { EditorThemeProvider } from "@editor-ui/theme";
import { BuiltIn_GettingStarted } from "../built-in-pages/getting-started/getting-started";

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

  const topBar = <TopBar controlDoubleClick={props.controlDoubleClick} />;

  return (
    <EditorThemeProvider light>
      <HomeScaffold
        navigation={navigation}
        topBar={topBar}
        controlDoubleClick={props.controlDoubleClick}
      >
        <>
          <BuiltIn_GettingStarted />
          {/* <CurrentPage/> */}
        </>
      </HomeScaffold>
    </EditorThemeProvider>
  );
}
