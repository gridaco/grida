import React from "react";
import { RecentDesignCardList } from "components/recent-design-card";
import { DefaultEditorWorkspaceLayout } from "layouts/default-editor-workspace-layout";
import { SideNavigation } from "components/side-navigation";

export function HomeLayout() {
  return (
    <DefaultEditorWorkspaceLayout
      backgroundColor={"rgba(37, 37, 38, 1)"}
      leftbar={<SideNavigation>{}</SideNavigation>}
    >
      <BodyContainer />
      {/* <Link href="/figma">from figma</Link>
      <br />
      <br />
      <Link href="/preferences">Preferences (set access token)</Link> */}
    </DefaultEditorWorkspaceLayout>
  );
}

function BodyContainer() {
  return (
    <div style={{ padding: 24 }}>
      <RecentDesignSection />
    </div>
  );
}

function RecentDesignSection() {
  return (
    <>
      <RecentDesignCardList />
    </>
  );
}
