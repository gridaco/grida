import styled from "@emotion/styled";
import SectionLayout from "layouts/section";
import Image from "next/image";
import React, { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus as colorscheme } from "react-syntax-highlighter/dist/cjs/styles/prism";
import { Flex, Box } from "rebass";

import { media } from "utils/styled/media";

import {
  DevFrameworkDemoConfig,
  DEFAULT_DEMO_ITEM,
  DEV_FRAMEWORKS,
} from "./data";
import CodePreviewMobile from "./mobile";

const CodePreview = () => {
  const [currentPlatform, setCurrentPlatform] = useState<
    DevFrameworkDemoConfig
  >(DEFAULT_DEMO_ITEM);

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
              <CodeView width="460px" height="770px" bg="rgb(30, 30, 30)">
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
                    alt="Grida supported design platforms"
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
  position: relative;
  top: 156px;
  ${props => media(props.theme.breakpoints[0], props.theme.breakpoints[3])} {
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
  border-radius: 8px;

  header {
    display: flex;
    align-items: center;
    height: 40px;
    padding: 0px 20px;
    border-top-left-radius: 8px;
    border-top-right-radius: 8px;

    span {
      background-color: #3d3d3d;
      width: 12px;
      height: 12px;
      margin-right: 10px;
      border-radius: 50%;
    }
  }

  .body {
    width: 100%;
    height: calc(100% - 40px);
    display: flex;
    align-items: center;
    justify-content: center;
    border-bottom-left-radius: 8px;
    border-bottom-right-radius: 8px;

    pre {
      /* hide scrollbar */
      ::-webkit-scrollbar {
        display: none;
      }
      -ms-overflow-style: none; /* IE and Edge */
      scrollbar-width: none; /* Firefox */
      /* -- */
      width: 95%;
      height: 95%;
      padding: 0px !important;
      border-bottom-left-radius: 8px;
      border-bottom-right-radius: 8px;
    }
  }
`;

const Mobile = styled.div`
  display: none;
  ${props => media("0px", props.theme.breakpoints[0])} {
    display: block;
  }
`;

const Desktop = styled.div`
  display: block;
  ${props => media("0px", props.theme.breakpoints[0])} {
    display: none;
  }
`;
