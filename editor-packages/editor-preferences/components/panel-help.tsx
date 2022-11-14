import React from "react";
import styled from "@emotion/styled";
import useSysTheme from "use-sys-theme";

export function HelpPanel({ url = "https://grida.co/docs" }: { url: string }) {
  // theme of docs site
  const systemtheme = useSysTheme();

  return (
    <RootWrapperHelpPanel>
      <HelpHeader>
        <Help>Help</Help>
      </HelpHeader>
      <iframe
        width="100%"
        height="100%"
        style={{
          background: systemtheme === "light" ? "white" : "transparent",
        }}
        src={url}
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
