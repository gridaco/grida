import styled from "@emotion/styled";
import SectionLayout from "layout/section";
import React from "react";
import { Flex } from "rebass";

import BlankArea from "components/blank-area";
import { media } from "utils/styled/media";
import { DesktopView } from "utils/styled/styles";
import { ThemeInterface } from "utils/styled/theme";

import FeatureListDesktopView from "./desktop-view";
import FeatureListMobileView from "./mobile-view";

const featureDataList = [
  {
    id: "features/code-generation",
    title: "Code generation",
    feature: [
      {
        name: "Unlimited platforms support - Flutter, React, Vue and more",
        price: [true, true, null],
      },
      {
        name: "Supported platforms per project",
        price: ["1", "Unlimited", null],
      },
      {
        name: "Max requests per hour",
        price: ["100", "10,000", "$0.001 / 1K"],
      },
    ],
  },
  {
    id: "features/projects",
    title: "Projects",
    feature: [
      {
        name: "Unlimited public projects",
        price: [true, true, null],
      },
      {
        name: "Unlimited private projects",
        price: [false, true, null],
      },
      {
        name: "Collaborators per project",
        price: ["2 / project", "Unlimited", null],
      },
    ],
  },
  {
    id: "features/handoff",
    title: "Handoff",
    feature: [
      {
        name: "Unlimited handoff",
        price: [true, true, null],
      },
    ],
  },
  {
    id: "features/asset-storage",
    title: "Asset Storage",
    feature: [
      {
        name: "Storage Capacity",
        price: ["0.5 GiB", "30 GiB", "$0.023/GiB"],
      },
      {
        name: "Read Access",
        price: ["20,000 / Mo", "200,000 / Mo", "$0.005 / 1K"],
      },
      {
        name: "Multiple buckets per project",
        price: [false, true, null],
      },
    ],
  },
  {
    id: "features/objects",
    title: "Capacity - Objects",
    feature: [
      {
        name: "objects such as design screen, component, or layer.",
        price: ["5000", "100,000", "$1/1M"],
      },
      {
        name: "Objects version management",
        price: ["5 Versions", "Unlimited", null],
      },
    ],
  },
  {
    id: "features/code-blocks",
    title: "Code blocks",
    feature: [
      {
        name: "code blocks",
        price: ["100,000", "Unlimited", null],
      },
      {
        name: "code block version management",
        price: ["5 Versions", "Unlimited", null],
      },
    ],
  },
];

const FeatureList: React.FC = () => {
  return (
    <SectionLayout variant="content-default">
      <DesktopView style={{ position: "relative", width: "100%" }}>
        <FeatureListDesktopView data={featureDataList} />
      </DesktopView>

      <Mobile>
        <FeatureListMobileView data={featureDataList} />
      </Mobile>
      <BlankArea height={[195, 334]} />
    </SectionLayout>
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
