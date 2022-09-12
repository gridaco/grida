import styled from "@emotion/styled";
import React from "react";
import { Box, BoxProps } from "rebass";
import { width, height } from "styled-system";

import icons, { IconList } from "./icons";

export type IconKey = keyof IconList;

interface IconProps extends BoxProps {
  name: IconKey;
  width?: number | number[];
  height?: any;
  isClickable?: boolean;
  isVerticalMiddle?: boolean;
}

const Icon = (props: IconProps) => {
  const {
    name,
    width,
    height,
    style,
    isClickable,
    isVerticalMiddle,
    ...boxStyle
  } = props;
  return (
    <ResponsiveBox
      width={width || icons[name].width}
      height={height || icons[name].height}
      style={{
        verticalAlign: isVerticalMiddle && "middle",
        cursor: isClickable && "pointer",
        ...style,
      }}
      {...(boxStyle as any)}
    >
      <svg viewBox={`0 0 ${icons[name].width} ${icons[name].height}`}>
        {icons[name].svg}
      </svg>
    </ResponsiveBox>
  );
};

export default React.forwardRef(Icon);

const ResponsiveBox = styled(Box)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  ${width};
  ${height};
  svg {
    flex: 1;
    display: block;
  }
`;
