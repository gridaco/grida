import styled from "@emotion/styled";
import React from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus as colorscheme } from "react-syntax-highlighter/dist/cjs/styles/prism";

import TabsHeader from "./tabs-header";

export default function Panel({ code = "// hello" }: { code?: string }) {
  return (
    <RootWrapperEditor>
      <TabsHeader></TabsHeader>
      <Editor>
        <SyntaxHighlighter language="typescript" style={colorscheme}>
          {code}
        </SyntaxHighlighter>
      </Editor>
    </RootWrapperEditor>
  );
}

const RootWrapperEditor = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: start;
  flex: 1;
  gap: 0;
  align-self: stretch;
  box-sizing: border-box;
`;

const Editor = styled.div`
  width: 722px;
  height: 626px;
  overflow: hidden;
  background-color: rgba(30, 30, 30, 1);
  position: relative;
`;
