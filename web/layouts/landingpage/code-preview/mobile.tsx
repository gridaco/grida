import styled from "@emotion/styled";
import Image from "next/image";
import React, { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus as colorscheme } from "react-syntax-highlighter/dist/cjs/styles/prism";
import { Box } from "rebass";

import {
  FLUTTER_COMPONENT_FULL_SOURCE,
  REACT_JSCSS_COMPONENT_FULL_SOURCE,
  HTML_COMPONENT_FULL_SOURCE,
} from "./snippets";

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

const CodePreviewMobile = () => {
  const [currentPlatform, setCurrentPlatform] = useState<
    DevFrameworkDemoConfig
  >(DEFAULT_DEMO_ITEM_FLUTTER);

  return (
    <div>
      <CodeView height="420px" bg="#212121">
        <header>
          <span />
          <span />
          <span />
        </header>
        <div className="body">
          <SyntaxHighlighter
            language={currentPlatform.lang}
            style={colorscheme}
          >
            {currentPlatform.source}
          </SyntaxHighlighter>
        </div>
      </CodeView>
      <Platforms className="platforms">
        {DEV_FRAMEWORKS.map(i => (
          <Image
            loading="eager"
            alt="Grida supported platforms icon"
            key={i.name}
            className="cursor"
            onClick={() => setCurrentPlatform(i)}
            src={`/assets/platform-icons/${i.name}/${
              currentPlatform.name === i.name ? "default" : "grey"
            }.png`}
            width="24"
            height="24"
          />
        ))}
      </Platforms>
    </div>
  );
};

const CodeView = styled(Box)`
  width: calc(100vw - 40px);
  bottom: 0%;
  border-radius: 12px;

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
    border-bottom-left-radius: 12px;
    border-bottom-right-radius: 12px;

    pre {
      width: 95%;
      height: 95%;
      padding: 0px !important;
      border-bottom-left-radius: 12px;
      border-bottom-right-radius: 12px;
    }
  }
`;

const Platforms = styled.div`
  margin-top: 20px;
  div {
    width: 24px;
    height: 24px;
    margin-right: 28px !important;
  }
`;

export default CodePreviewMobile;
