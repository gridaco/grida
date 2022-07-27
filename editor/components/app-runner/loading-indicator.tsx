import React from "react";
import styled from "@emotion/styled";
import { LoadingOneDotFadeInAndOutInfinite } from "components/loading";

export function RunnerLoadingIndicator({ size = 24 }: { size?: number }) {
  return (
    <Container size={size}>
      <Dot>
        <LoadingOneDotFadeInAndOutInfinite />
      </Dot>
    </Container>
  );
}

const Container = styled.div<{ size: number }>`
  background-color: black;
  width: ${(props) => props.size}px;
  height: ${(props) => props.size}px;
  border-radius: 4px;
  position: relative;
  box-shadow: 0px 2px 8px 0px rgba(0, 0, 0, 0.25);
`;

const Dot = styled.div`
  width: 4px;
  height: 4px;
  position: absolute;
  left: calc((calc((50% + 0px)) - 2px));
  top: calc((calc((50% + 0px)) - 2px));
`;
