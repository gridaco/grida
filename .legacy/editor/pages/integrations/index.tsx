import React from "react";
import { DefaultEditorWorkspaceLayout } from "layouts/default-editor-workspace-layout";
import { HomeHeading, HomeSidebar } from "components/home";
import Link from "next/link";
import { colors } from "theme";

export default function IntegrationsPage() {
  return (
    <>
      <DefaultEditorWorkspaceLayout
        backgroundColor={colors.color_editor_bg_on_dark}
        leftbar={<HomeSidebar />}
      >
        <div style={{ padding: 80 }}>
          <>
            <HomeHeading>Integrations</HomeHeading>
            <Link href="/import">Import From URL</Link>
            <p>Assistant</p>
            <p>VSCode</p>
          </>
        </div>
      </DefaultEditorWorkspaceLayout>
    </>
  );
}
