import React, { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { DefaultEditorWorkspaceLayout } from "layouts/default-editor-workspace-layout";
import { Cards, HomeCardGroup, HomeSidebar } from "components/home";

export default function ComponentsPage() {
  return (
    <>
      <DefaultEditorWorkspaceLayout
        backgroundColor={"rgba(37, 37, 38, 1)"}
        leftbar={<HomeSidebar />}
      >
        <div style={{ padding: 80 }}>
          <h1>Components</h1>
        </div>
      </DefaultEditorWorkspaceLayout>
    </>
  );
}
