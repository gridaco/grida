import React, { useEffect, useState } from "react";
import Head from "next/head";
import { DefaultEditorWorkspaceLayout } from "layouts/default-editor-workspace-layout";
import {
  Cards,
  HomeCardGroup,
  HomeHeading,
  HomeSidebar,
} from "components/home";
import { WorkspaceRepository } from "repository";
import { FileResponseRecord } from "@editor/figma-file";
import { colors } from "theme";

export default function FilesPage() {
  const repository = new WorkspaceRepository();
  const [files, setFiles] = useState<FileResponseRecord[]>([]);
  useEffect(() => {
    repository.getFiles().then(setFiles);
  }, []);

  return (
    <>
      <Head>
        <title>Grida | files</title>
      </Head>
      <DefaultEditorWorkspaceLayout
        backgroundColor={colors.color_editor_bg_on_dark}
        leftbar={<HomeSidebar />}
      >
        <div style={{ padding: 80 }}>
          <HomeHeading>Files</HomeHeading>
          <HomeCardGroup
            cards={files.map((d) => (
              <Cards.File key={d.key} data={d} />
            ))}
          />
        </div>
      </DefaultEditorWorkspaceLayout>
    </>
  );
}
