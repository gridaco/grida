import React, { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { DefaultEditorWorkspaceLayout } from "layouts/default-editor-workspace-layout";
import { Cards, HomeCardGroup, HomeSidebar } from "components/home";
import { RecentDesignCardList } from "./recent-design-card-list";
import { WorkspaceRepository } from "repository/workspace-repository";

export function HomeDashboard() {
  const repository = new WorkspaceRepository();
  const [recents, setRecents] = useState([]);
  const [files, setFiles] = useState([]);
  const scenes = [];
  const components = [];
  useEffect(() => {
    const recents = repository.getRecents({});
    recents.then(setRecents);

    const files = repository.getFiles();
    files.then(setFiles);
  }, []);

  return (
    <DefaultEditorWorkspaceLayout
      backgroundColor={"rgba(37, 37, 38, 1)"}
      leftbar={<HomeSidebar />}
    >
      <div style={{ height: "100vh", overflow: "scroll" }}>
        <div style={{ margin: 80 }}>
          <h1>Home</h1>
          <GroupsContainer>
            <RecentDesignSection recents={recents} />
            {files && !!files.length && <FilesSection files={files} />}
            {scenes && !!scenes.length && <ScenesSection scenes={scenes} />}
            {components && !!components.length && (
              <ComponentsSection components={components} />
            )}
          </GroupsContainer>
        </div>
      </div>
    </DefaultEditorWorkspaceLayout>
  );
}

const GroupsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 80px;
`;

function RecentDesignSection({ recents }: { recents }) {
  return (
    <HomeCardGroup
      anchor={"#recents"}
      label={"Recents"}
      cards={[<RecentDesignCardList recents={recents} />]}
    />
  );
}

function FilesSection({ files }: { files }) {
  return (
    <HomeCardGroup
      anchor={"#files"}
      label={"Files"}
      cards={files.map((file) => (
        <Cards.File
          key={file.id}
          data={file}
          label={file.name}
          thumbnail={file.thumbnail}
        />
      ))}
    />
  );
}

function ScenesSection({ scenes }: { scenes }) {
  return (
    <HomeCardGroup
      anchor={"#scenes"}
      label={"Scenes"}
      cards={scenes.map((file) => (
        <Cards.Scene label={file.name} thumbnail={file.thumbnail} />
      ))}
    />
  );
}

function ComponentsSection({ components }: { components }) {
  return (
    <HomeCardGroup
      anchor={"#components"}
      label={"Components"}
      cards={components.map((file) => (
        <Cards.Scene label={file.name} thumbnail={file.thumbnail} />
      ))}
    />
  );
}
