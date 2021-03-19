import React, { useState } from "react";
import {
  FLUTTER_COMPONENT_FULL_SOURCE,
  REACT_JSCSS_COMPONENT_FULL_SOURCE,
  HTML_COMPONENT_FULL_SOURCE,
} from "./snippets";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { a11yDark } from "react-syntax-highlighter/dist/cjs/styles/prism";
import { Flex, Box } from "rebass";
import styled from "@emotion/styled";
import Image from "next/image";
import { media } from "utils/styled/media";
import { ThemeInterface } from "utils/styled/theme";
import SectionLayout from "layout/section";
import CodePreviewMobile from "./mobile";

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
    <React.Fragment>
      <Mobile>
        <CodePreviewMobile />
      </Mobile>
      <Desktop>
        <SectionLayout variant="full-width" inherit={false}>
          <Flex width="100%">
            <Box width="25%" height="1px" />
            <Box width="25%" height="1px" />
            <ViewWrapper
              width="37%"
              flexDirection="column"
              alignItems={[
                "flex-start",
                "flex-start",
                "flex-start",
                "flex-start",
                "flex-end",
              ]}
            >
              <CodeView width="460px" height="770px" bg="#212121">
                <header>
                  <span />
                  <span />
                  <span />
                </header>
                <div className="body">
                  <SyntaxHighlighter
                    language={currentPlatform.lang}
                    style={a11yDark}
                  >
                    {currentPlatform.source}
                  </SyntaxHighlighter>
                </div>
              </CodeView>
              <Platforms className="platforms">
                {DEV_FRAMEWORKS.map(i => (
                  <Image
                    alt="bridged supported design platforms"
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
            </ViewWrapper>
            <Box width={["0px", "0px", "0px", "0px", "13%"]} height="1px" />
          </Flex>
        </SectionLayout>
      </Desktop>
    </React.Fragment>

    // <AbosulteView width='50%'>

    // </AbosulteView>
  );
};

export default CodePreview;

const ViewWrapper = styled(Flex)`
  ${props =>
    media(
      (props.theme as ThemeInterface).breakpoints[0],
      (props.theme as ThemeInterface).breakpoints[3],
    )} {
    transform: translateX(45%);
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

const CodeView = styled(Box)`
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

const Mobile = styled.div`
  display: none;
  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    display: block;
  }
`;

const Desktop = styled.div`
  display: block;
  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    display: none;
  }
`;
