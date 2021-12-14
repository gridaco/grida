import React, { useEffect, useState } from "react";
import { DefaultEditorWorkspaceLayout } from "layouts/default-editor-workspace-layout";
import {
  Cards,
  HomeCardGroup,
  HomeHeading,
  HomeSidebar,
} from "components/home";
import { WorkspaceRepository } from "repository";
import { FileResponseRecord } from "store/fimga-file-store/figma-file-store";

export default function FilesPage() {
  const repository = new WorkspaceRepository();
  const [files, setFiles] = useState<FileResponseRecord[]>([]);
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
              <Cards.File key={d.key} data={d} label={d.name} />
            ))}
          />
        </div>
      </DefaultEditorWorkspaceLayout>
    </>
  );
}
