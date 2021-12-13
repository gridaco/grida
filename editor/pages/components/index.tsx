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
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              gap: 20,
            }}
          >
            {[1, 2, 3, 4, 5].map((d) => (
              <Cards.Component
                data={{
                  file: d.toString(),
                  id: d.toString(),
                }}
                key={d}
                label={"Component " + d}
                thumbnail={null}
              />
            ))}
          </div>
        </div>
      </DefaultEditorWorkspaceLayout>
    </>
  );
}
