import ActionItem from "components/action-item";
import LandingpageText from "components/landingpage/text";
import React from "react";
import Image from "next/image";
import SectionLayout from "layouts/section";
import styled from "@emotion/styled";
import BlankArea from "components/blank-area";

export default function GlobalizationQuickDemoSayHiSection() {
  return (
    <SectionLayout variant="content-default" alignContent="start">
      <LandingpageText variant="h2">Say hi to</LandingpageText>
      <LandingpageText variant="h2">deisgn-first</LandingpageText>
      <LandingpageText variant="h2">globalization</LandingpageText>
      <Description variant="body1">
        And goodbye to your spreadsheets.
      </Description>
      <ActionItem label="Try the demo" href="/_development/todo" />
      <SectionLayout variant="full-width" inherit={false}>
        {/* todo: sizing */}
        <Image
          loading="eager"
          src="https://via.placeholder.com/1440.png"
          alt="placeholder"
          height={800}
          width={800}
        />
      </SectionLayout>
      <BlankArea height={[150, 300]} />
    </SectionLayout>
  );
}

const Description = styled(LandingpageText)`
  margin-top: 25px;
  margin-bottom: 55px;
`;
