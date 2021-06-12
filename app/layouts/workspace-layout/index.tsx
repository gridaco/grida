import React from "react";
import styled from "@emotion/styled";
function Layout() {
  return (
    <RootWrapperLayout>
      <Workspace>
        <SideNavigation>
          <Rectangle1></Rectangle1>
        </SideNavigation>
        <TopBarAndAreaFrame>
          <TopBar></TopBar>
          <ContentArea></ContentArea>
        </TopBarAndAreaFrame>
      </Workspace>
    </RootWrapperLayout>
  );
}

const RootWrapperLayout = styled.div`
  display: flex;
  flex-direction: row;
`;
const Workspace = styled.div`
  display: flex;
  flex-direction: row;
`;
const SideNavigation = styled.div`
  display: flex;
  flex-direction: column;
  align-items: start;
`;
const Rectangle1 = styled.em`
  color: red;
`;
const TopBarAndAreaFrame = styled.div`
  display: flex;
  flex-direction: column;
  align-items: start;
`;
const TopBar = styled.em`
  color: red;
`;
const ContentArea = styled.em`
  color: red;
`;
export default Layout;
