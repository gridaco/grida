import styled from "@emotion/styled";
import React from "react";

import { snippets } from "sections/landingpage/design-once-run-anywhere/k";

import { SrcContent } from "./src-content";
import TabsHeader from "./tabs-header";

type Demos = "react" | "flutter" | "vanilla";

export default function DemoScaffoldPanel() {
  const [activeDemo, setActiveDemo] = React.useState<Demos>("react");
  const onTabSelect = (key: Demos) => {
    setActiveDemo(key);
  };

  const src = getsrc(activeDemo);

  return (
    <RootWrapperEditor>
      <TabsHeader onTabClick={onTabSelect} activeTab={activeDemo} />
      <Editor>
        <SrcContent key={activeDemo} language="typescript">
          {src}
        </SrcContent>
      </Editor>
    </RootWrapperEditor>
  );
}

const getsrc = (forDemo: Demos) => {
  switch (forDemo) {
    case "react":
      return snippets._DEMO_APP_SRC_TSX;
    case "flutter":
      return snippets._DEMO_APP_SRC_FLUTTER;
    case "vanilla":
      return snippets._DEMO_APP_SRC_HTML_ONLY;
    default:
      return "";
  }
};

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
  max-width: min(722px, 100vw);
  max-height: 626px;
  align-self: stretch;
  overflow: hidden;
  background-color: rgba(30, 30, 30, 1);
  position: relative;
`;
