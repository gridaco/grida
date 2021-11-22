import styled from "@emotion/styled";
import React from "react";

import { media } from "utils/styled/media";
import { ThemeInterface } from "utils/styled/theme";

interface BlankAreaProps {
  height: number[];
}

export default function BlankArea(props: BlankAreaProps) {
  const { height } = props;
  return <Div height={height} />;
}

const Div = styled.div<BlankAreaProps>`
  width: 100%;
  background-color: rgba(0, 0, 0, 0);
  height: ${p => p.height[1]}px;

  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    height: ${p => p.height[0]}px;
  }
`;
