import React, { useEffect, useState } from "react";
import { DefaultEditorWorkspaceLayout } from "layouts/default-editor-workspace-layout";
import {
  Cards,
  HomeCardGroup,
  HomeHeading,
  HomeSidebar,
} from "components/home";
import { WorkspaceRepository } from "repository";

export default function FilesPage() {
  const repository = new WorkspaceRepository();
  const [files, setFiles] = useState([]);
  useEffect(() => {
    repository.getFiles().then(setFiles);
  }, []);

  return (
    <>
      <DefaultEditorWorkspaceLayout
        backgroundColor={"rgba(37, 37, 38, 1)"}
        leftbar={<HomeSidebar />}
      >
        <div style={{ padding: 80 }}>
          <HomeHeading>Files</HomeHeading>
          <HomeCardGroup
            cards={files.map((d) => (
              <Cards.File key={d.id} data={d} label={d.name} thumbnail={null} />
            ))}
          />
        </div>
      </DefaultEditorWorkspaceLayout>
    </>
  );
}
