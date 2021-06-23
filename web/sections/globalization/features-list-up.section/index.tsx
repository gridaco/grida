import styled from "@emotion/styled";
import BlankArea from "components/blank-area";
import FeatureCardItem from "components/globalization/feature-card-item";
import { FeatureListupCardItemDisplayData } from "components/globalization/feature-card-item/interface";
import LandingpageText from "components/landingpage/text";
import SectionLayout from "layout/section";
import React from "react";
import { Box } from "rebass";

const FEATURES: FeatureListupCardItemDisplayData[] = [
  {
    title: "git & branches",
    description:
      "Grida Globalization is desiged for developers inside and outside. With powerful Extensions and code generation tech, you’ll feel that everything is alright and comfortable.",
    artwork: undefined,
  },
  {
    title: "git & branches",
    description:
      "Grida Globalization is desiged for developers inside and outside. With powerful Extensions and code generation tech, you’ll feel that everything is alright and comfortable.",
    artwork: undefined,
  },
  {
    title: "git & branches",
    description:
      "Grida Globalization is desiged for developers inside and outside. With powerful Extensions and code generation tech, you’ll feel that everything is alright and comfortable.",
    artwork: undefined,
  },
  {
    title: "git & branches",
    description:
      "Grida Globalization is desiged for developers inside and outside. With powerful Extensions and code generation tech, you’ll feel that everything is alright and comfortable.",
    artwork: undefined,
  },
];

export default function GlobalizationFeaturesListupSection() {
  return (
    <SectionLayout variant="content-overflow-1" alignContent="center">
      <LandingpageText variant="h2" textAlign="center">
        Ready to be extended.
      </LandingpageText>
      <FlatGridList key="features-grid-list">
        {FEATURES.map(i => {
          return <FeatureCardItem data={i} />;
        })}
      </FlatGridList>
      <BlankArea height={[150, 300]} />
    </SectionLayout>
  );
}

const FlatGridList = styled(Box)`
  margin-top: 100px;
  width: 100%;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-columns: repeat(auto-fill, minmax(425px, 1fr));
  grid-column-gap: 1.5rem;
  grid-row-gap: 2.5rem;
`;
