import React from "react";
import { HomeSidebarTree } from "./home-side-bar-tree";
import { SideNavigation } from "components/side-navigation";

export function HomeSidebar() {
  return (
    <SideNavigation>
      <div style={{ height: 50 }} />
      <HomeSidebarTree />
    </SideNavigation>
  );
}
