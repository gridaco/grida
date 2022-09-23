import styled from "@emotion/styled";
import CodePreview from "layouts/landingpage/code-preview";
import DesignPlatforms from "layouts/landingpage/design-platforms";
import SectionLayout from "layouts/section";
import React from "react";
import { Flex } from "theme-ui";

import BlankArea from "components/blank-area";
import LandingpageText from "components/landingpage/text";
import { media } from "utils/styled/media";
import { useTranslation } from "next-i18next";

const DesignToCode = () => {
  const { t } = useTranslation("page-index", {
    keyPrefix: "section/instant",
  });
  return (
    <SectionLayout alignContent="start" backgroundColor="rgba(0,0,0,0)">
      <Flex
        style={{
          width: "100%",
        }}
        sx={{
          flexDirection: ["column", "row", "row", "row"],
        }}
      >
        <Flex
          className="text-platform"
          style={{
            flexDirection: "column",
          }}
        >
          <Title variant="h2">{t("heading")}</Title>
          <Description variant="body1">{t("p")}</Description>
          <DesignPlatforms />
        </Flex>
        <Flex
          className="code-view"
          sx={{
            width: ["100%", "50%", "50%", "50%"],
            justifyContent: ["flex-start", "flex-end", "flex-end", "flex-end"],
          }}
        >
          <CodePreview />
        </Flex>
      </Flex>
      {/* <SectionLayout
        className="design-to-code-absoulte-view"
        variant="full-width"
        inherit={false}
        notAutoAllocateHeight
      >
        <Positioner>
          <DesignPlatforms />
          <CodePreview />
        </Positioner>
      </SectionLayout> */}
      <BlankArea height={[100, 190]} />
    </SectionLayout>
  );
};

export default DesignToCode;

export const Title = styled(LandingpageText)`
  margin-bottom: 10px;
  z-index: 99;
`;

const Description = styled(LandingpageText)`
  max-width: 520px;
  margin-top: 20px !important;
  z-index: 99;

  ${props => media("0px", props.theme.breakpoints[0])} {
    max-width: calc(100vw - 40px);
  }
`;
