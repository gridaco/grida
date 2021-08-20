import React from "react";
import styled from "@emotion/styled";
import DashboardAppbar, {
  IDashboardAppBar,
} from "../../components/appbar/dashboard.appbar";
import { DashboardSideNavigationBar } from "../../components/side-navigation-bar/dashboard.side-navigation-bar";

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
    <Wrapper>
      <DashboardAppbar {...dashboardProps} />
      <ContentWrapper>
        <DashboardSideNavigationBar />
        <ContentPage>{children}</ContentPage>
      </ContentWrapper>
      {rightChildren}
    </Wrapper>
  );
}

const Wrapper = styled.div`
  display: flex;
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
  margin-left: 200px;
`;
