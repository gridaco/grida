import React from "react";
import styled from "@emotion/styled";
import DashboardAppbar, {
  IDashboardAppBar,
} from "../../components/appbar/dashboard.appbar";
import { DashboardSideNavigationBar } from "../../components/side-navigation-bar/dashboard.side-navigation-bar";
import { HomeScaffold } from "../../../ui/editor-ui/packages/editor-ui-workspace";
import { EditorThemeProvider } from "../../../ui/editor-ui/packages/editor-ui-theme";
import { TopBar } from "../../../app/components";

interface IDashboardLayout extends IDashboardAppBar {
  children?: React.ReactNode;
  rightChildren?: React.ReactNode;
}

export default function DashboardLayout({
  children,
  rightChildren,
  ...dashboardProps
}: IDashboardLayout) {
  return (
    <EditorThemeProvider light>
      <Wrapper>
        {/* <DashboardAppbar {...dashboardProps} /> */}
        <TopBar controlDoubleClick={() => {}} />
        <ContentPage>{children}</ContentPage>
        <ContentWrapper>{/* <DashboardSideNavigationBar /> */}</ContentWrapper>
        {/* {rightChildren} */}
      </Wrapper>
    </EditorThemeProvider>
  );
}

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
`;

const ContentWrapper = styled.div`
  display: flex;
  flex: 1;
`;

const ContentPage = styled.main`
  flex: 1;
  padding: 0 72px;
  padding-top: 80px;
  padding-bottom: 55px;
  /* margin-left: 200px; */
`;
