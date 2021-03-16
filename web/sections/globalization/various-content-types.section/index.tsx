import ActionItem from "components/action-item";
import LandingpageText from "components/landingpage/text";
import SectionLayout from "layout/section";
import React from "react";

export default function GlobalizationUnimitYourStoryTellingSection() {
  return (
    <SectionLayout debug>
      <div key="text-layout">
        <LandingpageText variant="h2">
          Unlimit your story telling
        </LandingpageText>
        <LandingpageText variant="body1">
          From simple text to blogs, audio and graphic resources. You can all
          manage them as a same translatables. Tell your story without any
          missing sentences.
        </LandingpageText>
        <ActionItem label="Learn more" href="/_development/todo" />
      </div>
    </SectionLayout>
  );
}
