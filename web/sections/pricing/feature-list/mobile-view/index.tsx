import React, { useState } from "react";
import styled from "@emotion/styled";
import { Flex, Text, Heading } from "rebass";
import Icon from "components/icon";
import SectionLayout from "layouts/section";
import FeatureChoice from "components/feature-choice";

// TODO
interface FeatureProps {
  data: any;
}

const choice = ["Free", "Team", "Extra Usage"];

const FeatureListMobileView: React.FC<FeatureProps> = ({ data }) => {
  return (
    <Flex flexDirection="column">
      <Heading fontSize="32px" mb="25px">
        Features
      </Heading>
      <Wrapper
        width="100%"
        flexDirection="column"
        justifyContent="space-between"
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
