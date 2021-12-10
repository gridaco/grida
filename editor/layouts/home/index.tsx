import React from "react";
import { RecentDesignCardList } from "components/recent-design-card";
import { DefaultEditorWorkspaceLayout } from "layouts/default-editor-workspace-layout";
import { HomeSidebar } from "components/home";

export function HomeLayout() {
  return (
    <DefaultEditorWorkspaceLayout
      backgroundColor={"rgba(37, 37, 38, 1)"}
      leftbar={<HomeSidebar />}
    >
      <BodyContainer />
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
