import ActionItem from "components/action-item";
import LandingpageText from "components/landingpage/text";
import React from "react";
import Image from "next/image";
import SectionLayout from "layout/section";
export default function GlobalizationQuickDemoSayHiSection() {
  return (
    <SectionLayout debug variant="content-default">
      <div>
        <LandingpageText variant="h2">
          Say hi to deisgn-first globalization
        </LandingpageText>
        <LandingpageText variant="body1">
          And goodbye to your spreadsheets.
        </LandingpageText>
      </div>
      <ActionItem label="Try the demo" href="/_development/todo" />
      <SectionLayout variant="full-width" inherit={false}>
        {/* todo: sizing */}
        <Image
          src="https://via.placeholder.com/150"
          width="100%"
          height="200px"
        />
      </SectionLayout>
    </SectionLayout>
  );
}
