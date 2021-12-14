import React, { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { DefaultEditorWorkspaceLayout } from "layouts/default-editor-workspace-layout";
import { HomeHeading, HomeSidebar } from "components/home";
import Link from "next/link";

export default function IntegrationsPage() {
  return (
    <>
      <DefaultEditorWorkspaceLayout
        backgroundColor={"rgba(37, 37, 38, 1)"}
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
