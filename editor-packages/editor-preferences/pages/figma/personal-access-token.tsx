import React from "react";
import styled from "@emotion/styled";
import { PageContentLayout } from "../../layouts";
import { TextField } from "../../components";

export default function EditorPreferenceFigmaPersonalAccessTokenPage() {
  return (
    <PageContentLayout direction="row" spacebetween>
      <div>
        <h1>Personal Access Tokens</h1>
        <TextField disabled value="ftk_xxxxxxxx" />
      </div>
      <HelpPanel />
    </PageContentLayout>
  );
}

function HelpPanel() {
  return (
    <RootWrapperHelpPanel>
      <HelpHeader>
        <Help>Help</Help>
      </HelpHeader>
      <iframe
        width="100%"
        height="100%"
        src="https://grida.co/docs/with-figma/guides/how-to-get-personal-access-token"
      />
    </RootWrapperHelpPanel>
  );
}

const RootWrapperHelpPanel = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  border: solid 1px rgba(255, 255, 255, 0.1);
  align-self: stretch;
  width: 400px;
  height: 100%;
  box-sizing: border-box;
  flex-shrink: 0;
`;

const HelpHeader = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  align-self: stretch;
  box-sizing: border-box;
  padding: 16px;
  flex-shrink: 0;
`;

const Help = styled.span`
  color: white;
  text-overflow: ellipsis;
  font-size: 12px;
  font-family: Roboto, sans-serif;
  font-weight: 400;
  text-align: left;
  opacity: 0.5;
`;
