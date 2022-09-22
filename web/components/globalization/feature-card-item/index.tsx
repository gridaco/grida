import styled from "@emotion/styled";
import LandingpageText from "components/landingpage/text";
import React from "react";
import { FeatureListupCardItemDisplayData } from "./interface";

export default function FeatureCardItem(props: {
  data: FeatureListupCardItemDisplayData;
}) {
  return (
    <Card>
      <LandingpageText variant="h4">{props.data.title}</LandingpageText>
      <Description variant="body1">{props.data.description}</Description>
    </Card>
  );
}

const Card = styled.div`
  display: flex;
  flex-direction: column;
  box-shadow: 0px 4px 128px 32px rgba(0, 0, 0, 0.08);
  border-radius: 8px;
  padding: 48px;
`;

const Description = styled(LandingpageText)`
  margin-top: 32px;
`;
