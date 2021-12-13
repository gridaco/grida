import React, { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { DefaultEditorWorkspaceLayout } from "layouts/default-editor-workspace-layout";
import {
  Cards,
  HomeCardGroup,
  HomeHeading,
  HomeSidebar,
} from "components/home";
import { WorkspaceRepository } from "repository";

export default function ComponentsPage() {
  const repository = new WorkspaceRepository();

  const [components, setComponents] = useState([]);

  useEffect(() => {
    repository.getRecentComponents().then(setComponents);
  }, []);

  return (
    <>
      <DefaultEditorWorkspaceLayout
        backgroundColor={"rgba(37, 37, 38, 1)"}
        leftbar={<HomeSidebar />}
      >
        <div style={{ padding: 80 }}>
          <HomeHeading>Components</HomeHeading>
          <HomeCardGroup
            cards={[
              components.map((d) => (
                <Cards.Component
                  key={d.id}
                  data={d}
                  label={d.name}
                  thumbnail={d.thumbnail}
                />
              )),
            ]}
          />
        </div>
      </DefaultEditorWorkspaceLayout>
    </>
  );
}
