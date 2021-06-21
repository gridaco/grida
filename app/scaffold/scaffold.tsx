import React from "react";
import { HomeScaffold } from "../layouts/home-scaffold";
import { ContentCard } from "../cards";
import { Scaffold as BoringScaffold } from "@boringso/react-core";
import { SideNavigation } from "../components";
import { EditorThemeProvider } from "@editor-ui/theme";
import { ThemeProvider, useTheme } from "@emotion/react";
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
  // const navigation = <></>;
  return (
    <EditorThemeProvider light>
      <HomeScaffold
        navigation={navigation}
        controlDoubleClick={props.controlDoubleClick}
      >
        <>
          {/* test */}
          <BuiltIn_GettingStarted />
          {/* <BoringScaffold extensions={[]} /> */}
        </>
      </HomeScaffold>
    </EditorThemeProvider>
  );
}
