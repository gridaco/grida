import React from "react";
import styled from "@emotion/styled";
import {
  PageContentLayout,
  TextField,
  PreferencePageProps,
} from "@code-editor/preferences";
import { useEditorState } from "core/states";

function EditorPreferenceFigmaPage({}: PreferencePageProps) {
  const [state] = useEditorState();
  const { key: filekey, name, pages, lastModified, version } = state.design;
  const frames = pages.reduce((acc, p) => acc + p.children.length, 0);

  return (
    <PageContentLayout>
      <h1>About this file</h1>
      <div>
        <TextField
          fullWidth
          disabled
          value={"https://www.figma.com/file/" + filekey}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            padding: 12,
          }}
        >
          <MetaData label="File Name" value={name} />
          <MetaData label="Last Updated" value={lastModified.toString()} />
          <MetaData label="Frames Count" value={frames.toString()} />
          <MetaData label="Version" value={version} />
        </div>
      </div>
    </PageContentLayout>
  );
}

export default EditorPreferenceFigmaPage;

function MetaData({ label, value }: { label: string; value: string }) {
  return (
    <MetaDataRow
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "row",
      }}
    >
      <label>{label}</label>
      <span>{value}</span>
    </MetaDataRow>
  );
}

const MetaDataRow = styled.div`
  display: flex;
  flex-direction: row;

  color: white;
  font-size: 12px;

  label {
    width: 100px;
    opacity: 0.5;
    font-size: 0.8em;
  }

  span {
    flex: 1;
    opacity: 0.8;
    font-size: 0.8em;
  }
`;
