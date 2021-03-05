import React, { useState } from "react";
import { Flex, Button, Text, Box } from "rebass";
import styled from "@emotion/styled";
import Image from "next/image";
import {
  FLUTTER_COMPONENT_FULL_SOURCE,
  REACT_JSCSS_COMPONENT_FULL_SOURCE,
  HTML_COMPONENT_FULL_SOURCE,
} from "./snippets";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { a11yDark } from "react-syntax-highlighter/dist/cjs/styles/prism";

interface DevFrameworkDemoConfig {
  name: string;
  lang: string;
  source: string;
}

const DEFAULT_DEMO_ITEM_FLUTTER = {
  name: "flutter",
  lang: "dart",
  source: FLUTTER_COMPONENT_FULL_SOURCE,
};

const DEV_FRAMEWORKS: DevFrameworkDemoConfig[] = [
  DEFAULT_DEMO_ITEM_FLUTTER,
  {
    name: "html",
    lang: "html",
    source: HTML_COMPONENT_FULL_SOURCE,
  },
  {
    name: "react",
    lang: "tsx",
    source: REACT_JSCSS_COMPONENT_FULL_SOURCE,
  },
  {
    name: "svelte",
    lang: "svelte",
    source: REACT_JSCSS_COMPONENT_FULL_SOURCE,
  },
];

const CodeFrameworks = () => {
  const [currentPlatform, setCurrentPlatform] = useState<
    DevFrameworkDemoConfig
  >(DEFAULT_DEMO_ITEM_FLUTTER);

  return (
    <Flex
      flex={1}
      flexDirection="column"
      alignItems="flex-end"
      justifyContent="flex-end"
    >
      <CodeView width="460px" height="770px" bg="#212121">
        <header>
          <span />
          <span />
          <span />
        </header>
        <div className="body">
          <main>
            <SyntaxHighlighter language={currentPlatform.lang} style={a11yDark}>
              {currentPlatform.source}
            </SyntaxHighlighter>
          </main>
        </div>
      </CodeView>
      <Platforms>
        {DEV_FRAMEWORKS.map(i => (
          <Image
            key={i.name}
            className="cursor"
            onClick={() => setCurrentPlatform(i)}
            src={`/platform-icons/${i.name}/${
              currentPlatform.name === i.name ? "default" : "grey"
            }.png`}
            width="24"
            height="24"
          />
        ))}
      </Platforms>
      <BlankArea />
    </Flex>
  );
};

export default CodeFrameworks;

const Platforms = styled(Box)`
  div {
    width: 24px;
    height: 24px;
    margin-left: 28px !important;
  }
`;

const CodeView = styled(Box)`
  position: absolute;
  top: -35%;
  right: -20%;
  border-radius: 12px;

  @media (max-width: 940px) {
    top: -35%;
    right: -33% !important;
  }

  @media (max-width: 800px) {
    top: -35%;
    right: -38% !important;
  }

  @media (max-width: 720px) {
    width: 100%;
    height: 410px;
    top: auto;
    bottom: 5% !important;
    right: 0% !important;
  }

  header {
    display: flex;
    align-items: center;
    height: 50px;
    padding: 0px 20px;
    border-top-left-radius: 12px;
    border-top-right-radius: 12px;

    span {
      background-color: #3d3d3d;
      width: 16px;
      height: 16px;
      margin-right: 10px;
      border-radius: 50%;
    }
  }

  .body {
    width: 100%;
    height: calc(100% - 50px);
    display: flex;
    align-items: center;
    justify-content: center;

    main {
      width: 95%;
      height: 95%;
    }
  }
`;

const BlankArea = styled(Box)`
  height: 200px;
  width: 100%;

  @media (max-width: 720px) {
    display: none;
  }
`;
