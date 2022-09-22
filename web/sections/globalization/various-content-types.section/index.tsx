import styled from "@emotion/styled";
import ActionItem from "components/action-item";
import BlankArea from "components/blank-area";
import LandingpageText from "components/landingpage/text";
import SectionLayout from "layouts/section";
import Image from "next/image";
import React from "react";
import { Flex } from "theme-ui";

export default function GlobalizationUnimitYourStoryTellingSection() {
  return (
    <SectionLayout variant="content-default" alignContent="center">
      <Flex style={{ width: "100%" }}>
        <Flex style={{ width: "50%" }}>
          <Image
            src="https://via.placeholder.com/1440"
            height="480px"
            width="100%"
          />
        </Flex>
        <Flex
          key="text-layout"
          style={{
            width: "50%",
            flexDirection: "column",
          }}
        >
          <LandingpageText variant="h2">
            Unlimit your story telling
          </LandingpageText>
          <Description variant="body1">
            From simple text to blogs, audio and graphic resources. You can all
            manage them as a same translatables. Tell your story without any
            missing sentences.
          </Description>
          <ActionItem label="Learn more" href="/_development/todo" />
        </Flex>
      </Flex>
      <BlankArea height={[150, 300]} />
    </SectionLayout>
  );
}

const Description = styled(LandingpageText)`
  margin-top: 35px;
  margin-bottom: 25px;
`;
