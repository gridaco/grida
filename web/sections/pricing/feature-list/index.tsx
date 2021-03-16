import React from "react";
import styled from "@emotion/styled";
import FeatureListMobileView from "./mobile-view";
import FeatureListDesktopView from "./desktop-view";
import { Flex } from "rebass";
import { DesktopView } from "utils/styled/styles";
import { media } from "utils/styled/media";
import { ThemeInterface } from "utils/styled/theme";

const featureDataList = [
  {
    id: 1,
    title: "Authentication",
    feature: [
      {
        id: 1,
        name: "Phone Auth - US, Canada, and India (by requests)",
        price: ["100 / Mo", "50,000 / Mo", "$1 / 2K"],
      },
      {
        id: 2,
        name: "Phone Auth - All other countries",
        price: ["100 / Mo", "50,000 / Mo", "$1 / 2K"],
      },
      {
        id: 3,
        name: "Other Authentication services",
        price: ["Free", "Free", "Free"],
      },
    ],
  },
  {
    id: 2,
    title: "Asset Storage",
    feature: [
      {
        id: 1,
        name: "Storage Capacity",
        price: ["0.5 GiB", "30 GiB", "$0.023/GiB"],
      },
      {
        id: 2,
        name: "Read Access",
        price: ["$999/GB", "$999/GB", "$999/GB"],
      },
      {
        id: 3,
        name: "Multiple buckets per project",
        price: ["X", "$999/GB", "Free"],
      },
    ],
  },
  {
    id: 3,
    title: "Database",
    feature: [
      {
        id: 1,
        name: "feature",
        price: ["$999/GB", "$999/GB", "$999/GB"],
      },
      {
        id: 2,
        name: "feature",
        price: ["$999/GB", "$999/GB", "$999/GB"],
      },
    ],
  },
  {
    id: 4,
    title: "Capacity - Objects",
    feature: [
      {
        id: 1,
        name: "objects such as design screen, component, or layer.",
        price: ["5000", "100,000", "$1/1M"],
      },
      {
        id: 2,
        name: "feature",
        price: ["$999/GB", "$999/GB", "$999/GB"],
      },
    ],
  },
  {
    id: 5,
    title: "Code blocks",
    feature: [
      {
        id: 1,
        name: "code blocks",
        price: ["100,000", "Unlimited", "X"],
      },
      {
        id: 2,
        name: "feature",
        price: ["$999/GB", "$999/GB", "$999/GB"],
      },
    ],
  },
];

const FeatureList: React.FC = () => {
  return (
    <Flex
      width="100%"
      mb={["176px", "146px", "146px", "146px"]}
      justifyContent="center"
    >
      <DesktopView style={{ position: "relative" }}>
        <FeatureListDesktopView data={featureDataList} />
      </DesktopView>

      <Mobile>
        <FeatureListMobileView data={featureDataList} />
      </Mobile>
    </Flex>
  );
};

const Mobile = styled(Flex)`
  display: none;

  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    display: flex;
    width: 100%;
    position: relative;
  }
`;

export default FeatureList;
