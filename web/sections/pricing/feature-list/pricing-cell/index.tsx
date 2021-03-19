import styled from "@emotion/styled";
import React from "react";
import { Flex } from "rebass";

export default function ResponsivePricingCell(props: {
  price: string | boolean | null;
  flex: string;
}) {
  const { price } = props;
  let displayString;
  if (typeof price == "string") {
    displayString = price;
  } else if (typeof price == "boolean") {
    // TODO change this to icon
    displayString = price ? "yes" : "no";
  } else {
    displayString = "-";
  }
  return <DesktopCell flex={props.flex}>{displayString}</DesktopCell>;
}

const DesktopCell = styled(Flex)`
  font-weight: normal;
  font-size: 18px;
  text-align: center;
  justify-content: center;
  color: #7e7e7e;
`;
