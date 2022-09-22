import React, { useState } from "react";
import styled from "@emotion/styled";
import { Flex, Text, Heading } from "theme-ui";
import FeatureChoice from "components/feature-choice";

// TODO
interface FeatureProps {
  data: any;
}

const choice = ["Free", "Team", "Extra Usage"];

const FeatureListMobileView: React.FC<FeatureProps> = ({ data }) => {
  return (
    <Flex
      style={{
        flexDirection: "column",
      }}
    >
      <Heading
        style={{
          fontSize: "32px",
        }}
        mb="25px"
      >
        Features
      </Heading>
      <Wrapper
        style={{
          width: "100%",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        {choice.map(i => (
          <FeatureChoice titleList={i} featureData={data} key={i} />
        ))}
      </Wrapper>
    </Flex>
  );
};

const Wrapper = styled(Flex)`
  &:last-child {
    margin-bottom: 0px;
  }
`;

export default FeatureListMobileView;
