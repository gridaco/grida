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
import { colors } from "theme";

export default function ComponentsPage() {
  const repository = new WorkspaceRepository();

  const [components, setComponents] = useState([]);

  useEffect(() => {
    repository.getRecentComponents().then(setComponents);
  }, []);

  return (
    <>
      <DefaultEditorWorkspaceLayout
        backgroundColor={colors.color_editor_bg_on_dark}
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
