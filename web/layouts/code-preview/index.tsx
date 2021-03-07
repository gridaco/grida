import React, { useState } from 'react'
import {
  FLUTTER_COMPONENT_FULL_SOURCE,
  REACT_JSCSS_COMPONENT_FULL_SOURCE,
  HTML_COMPONENT_FULL_SOURCE,
} from "./snippets";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { a11yDark } from "react-syntax-highlighter/dist/cjs/styles/prism";
import { Flex, Box } from 'rebass';
import styled from '@emotion/styled';
import Image from 'next/image';
import { media } from 'utils/styled/media';
import { ThemeInterface } from 'utils/styled/theme';

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

const CodePreview = () => {
  const [currentPlatform, setCurrentPlatform] = useState<
  DevFrameworkDemoConfig
>(DEFAULT_DEMO_ITEM_FLUTTER);

  return (
    <AbosulteView width='50%'>
      <CodeView width="460px" height="770px" bg="#212121">
        <header>
          <span />
          <span />
          <span />
        </header>
        <div className="body">
          <SyntaxHighlighter language={currentPlatform.lang} style={a11yDark}>
            {currentPlatform.source}
          </SyntaxHighlighter>
        </div>
      </CodeView>
      <div className="platforms">
        {DEV_FRAMEWORKS.map(i => (
          <Image
            alt="platform"
            key={i.name}
            className="cursor"
            onClick={() => setCurrentPlatform(i)}
            src={`/assets/platform-icons/${i.name}/${currentPlatform.name === i.name ? "default" : "grey"
              }.png`}
            width="24"
            height="24"
          />
        ))}
      </div>
    </AbosulteView>
  )
}

export default CodePreview

const CodeView = styled(Box)`
  position: absolute;
  bottom: 0%;
  border-radius: 12px;

  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    width: 170%;
    min-width: 280px;
    height: 410px;
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

    pre {
        width: 95%;
        height: 95%;
        padding: 0px;
      }
  }
  
`

const AbosulteView = styled(Flex)`
  position: absolute;
  right: -20%;
  bottom: 15%;

  .platforms {
    width: 150%;
    position: absolute;
    bottom: -50px;
  }
  

  .platforms > div {
    width: 24px;
    height: 24px;
    margin-left: 28px !important;
  }

  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    right: 42.5%;
    bottom: 0%;
  }

`