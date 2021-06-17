import React from "react";
import { HomeScaffold } from "../layouts/home-scaffold";
import { ContentCard } from "../cards";
import { Scaffold as BoringScaffold } from "@boringso/react-core";
import { SideNavigation } from "../components";
import { EditorThemeProvider } from "@editor-ui/theme";
import { ThemeProvider, useTheme } from "@emotion/react";

export function Home() {
  const navigation = <SideNavigation />;
  // const navigation = <></>;
  return (
    <EditorThemeProvider light>
      <HomeScaffold navigation={navigation}>
        <>
          <BoringScaffold />
        </>
      </HomeScaffold>
    </EditorThemeProvider>
  );
}
