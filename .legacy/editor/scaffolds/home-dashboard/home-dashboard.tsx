import React, { useEffect, useMemo, useState } from "react";
import styled from "@emotion/styled";
import { DefaultEditorWorkspaceLayout } from "layouts/default-editor-workspace-layout";
import {
  Cards,
  HomeCardGroup,
  HomeHeading,
  HomeSidebar,
} from "components/home";
import { RecentDesignCardList } from "./recent-design-card-list";
import { WorkspaceRepository } from "repository/workspace-repository";
import { colors } from "theme";

export function HomeDashboard() {
  const repository = useMemo(() => new WorkspaceRepository(), []);

  const [recents, setRecents] = useState([]);
  const [files, setFiles] = useState([]);
  const [components, setComponents] = useState([]);
  const [scenes, setScenes] = useState([]);

  useEffect(() => {
    repository.getRecents({}).then(setRecents);

    repository.getFiles().then(setFiles);

    // repository.getRecentScenes().then(setScenes);

    // repository.getRecentComponents().then(setComponents);
  }, []);

  return (
    <DefaultEditorWorkspaceLayout
      backgroundColor={colors.color_editor_bg_on_dark}
      leftbar={<HomeSidebar />}
    >
      <div
        style={{
          height: "100vh",
          overflow: "scroll",
          padding: 80,
        }}
      >
        <HomeHeading>Home</HomeHeading>
        <GroupsContainer>
          <RecentDesignSection recents={recents} />
          {files && !!files.length && <FilesSection files={files} />}
          {scenes && !!scenes.length && <ScenesSection scenes={scenes} />}
          {components && !!components.length && (
            <ComponentsSection components={components} />
          )}
        </GroupsContainer>
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
      cards={[<RecentDesignCardList key="recents" recents={recents} />]}
    />
  );
}

function FilesSection({ files }: { files }) {
  return (
    <HomeCardGroup
      anchor={"#files"}
      label={"Files"}
      cards={files.map((file) => (
        <Cards.File key={file.id} data={file} label={file.name} />
      ))}
    />
  );
}

function ScenesSection({ scenes }: { scenes }) {
  return (
    <HomeCardGroup
      anchor={"#scenes"}
      label={"Scenes"}
      cards={scenes.map((scene) => (
        <Cards.Scene
          key={scene.id}
          data={scene}
          label={scene.name}
          thumbnail={scene.thumbnail}
        />
      ))}
    />
  );
}

function ComponentsSection({ components }: { components }) {
  return (
    <HomeCardGroup
      anchor={"#components"}
      label={"Components"}
      cards={components.map((c) => (
        <Cards.Component
          key={c.id}
          data={c}
          label={c.name}
          thumbnail={c.thumbnail}
        />
      ))}
    />
  );
}
