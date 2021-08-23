import React from "react";
import { useRouter } from "next/router";
import styled from "@emotion/styled";

import { navigations } from "./dashboard.constants";
import ListItem from "./dashboard.side-item";
import DashboardSideFooter from "./dashboard.side-footer";

export function DashboardSideNavigationBar() {
  const router = useRouter();
  const { pathname } = router;

  return (
    <ListContainer>
      <NavigationList>
        {navigations.map(({ path, ...navigation }, navigationIndex) => (
          <ListItem
            key={navigationIndex}
            path={path}
            router={router}
            isSelected={path === pathname}
            {...navigation}
          />
        ))}
      </NavigationList>
      <DashboardSideFooter />
    </ListContainer>
  );
}

const ListContainer = styled.nav`
  height: 100%;
  background-color: white;
  width: 200px;
  position: fixed;
  left: 0;
  bottom: 0;
  padding-top: 80px;
  display: flex;
  flex-direction: column;
`;

const NavigationList = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  border-right: 1px solid #efefef;
`;
