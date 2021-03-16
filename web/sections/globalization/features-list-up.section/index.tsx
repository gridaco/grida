import FeatureCardItem from "components/globalization/feature-card-item";
import { FeatureListupCardItemDisplayData } from "components/globalization/feature-card-item/interface";
import LandingpageText from "components/landingpage/text";
import SectionLayout from "layout/section";
import React from "react";

const FEATURES: FeatureListupCardItemDisplayData[] = [
  {
    title: "git & branches",
    description:
      "Bridged Globalization is desiged for developers inside and outside. With powerful Extensions and code generation tech, you’ll feel that everything is alright and comfortable.",
    artwork: undefined,
  },
];

export default function GlobalizationFeaturesListupSection() {
  return (
    <SectionLayout variant="content-overflow-1">
      <LandingpageText variant="h2" textAlign="center">
        Ready to be extended.
      </LandingpageText>
      <div key="features-grid-list">
        {FEATURES.map(i => {
          return <FeatureCardItem data={i} />;
        })}
      </div>
    </SectionLayout>
  );
}
