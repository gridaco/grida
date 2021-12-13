import React, { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { DefaultEditorWorkspaceLayout } from "layouts/default-editor-workspace-layout";
import { Cards, HomeCardGroup, HomeSidebar } from "components/home";

export default function FilesPage() {
  return (
    <>
      <DefaultEditorWorkspaceLayout
        backgroundColor={"rgba(37, 37, 38, 1)"}
        leftbar={<HomeSidebar />}
      >
        <div style={{ padding: 80 }}>
          <h1>Files</h1>
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              gap: 20,
            }}
          >
            {[
              "HSozKEVWhh8saZa2vr1Nxd",
              "Gaznaw1QHppxvs9UkqNOb0",
              "Y0Gh77AqBoHH7dG1GtK3xF",
              "iypAHagtcSp3Osfo2a7EDz",
              "x7RRK6RwWtZuNakmbMLTVH",
            ].map((d) => (
              <Cards.File
                key={d}
                data={{
                  file: `${d}`,
                }}
                label={"File " + d}
                thumbnail={null}
              />
            ))}
          </div>
        </div>
      </DefaultEditorWorkspaceLayout>
    </>
  );
}
