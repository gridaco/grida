import React from "react";
import styled from "@emotion/styled";
import { useComponentSize } from "react-use-size";
import {
  ScalingContentIframe,
  ScalingHtmlContentFrameProps,
} from "../scaling-content-iframe";

const Container = styled.div<{ height: number }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  align-content: center;
  justify-content: center;
  flex: 0 1 0;
  height: ${(props) => (props.height ? props.height + "px" : "auto")};
  min-height: 100%;
`;

export type ScalingContentProps = Omit<
  ScalingHtmlContentFrameProps,
  "parentSize"
>;

export function ScalingContent(props: ScalingContentProps) {
  const { ref: sizingref, width } = useComponentSize();
  const [scaledHeight, setScaledHeight] = React.useState(1);
  return (
    <Container ref={sizingref} height={scaledHeight}>
      <ScalingContentIframe
        {...props}
        parentWidth={width}
        onScaleChange={(s, m) => {
          const scaledheight = props.origin_size.height * s - m * 2;
          setScaledHeight(scaledheight);
        }}
      />
    </Container>
  );
}
