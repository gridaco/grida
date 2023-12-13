import React, { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { variant } from "./interface";

/**
 *
 * @param props
 * @description
 * Start, end must have the same division.
 * @example
 * <Grid start="1/8" end="3/8" /> OK
 * @example
 * <Grid start="1/8" end="1/3" /> NO
 * @returns React Component
 */
function Grid(props: {
  start: variant;
  end: variant;
  children: React.ReactNode;
  margin?: string;
  marginTop?: string;
  marginBottom?: string;
  marginLeft?: string;
  marginRight?: string;
  padding?: string;
  paddingTop?: string;
  paddingBottom?: string;
  paddingLeft?: string;
  paddingRight?: string;
}) {
  const { children, start, end, ...style } = props;

  const [gridViewPostion, setGridViewPostion] = useState([]);

  useEffect(() => {
    const startPostion = start.toString().split("/")[0];
    const endPostion = end.toString().split("/")[0];

    setGridViewPostion([startPostion, endPostion]);
  }, [start, end]);

  return (
    <RootGridLayout>
      <Gird gridPostion={gridViewPostion} gridStyle={style}>
        {children}
      </Gird>
    </RootGridLayout>
  );
}

export { Grid };

const RootGridLayout = styled.div`
  display: grid;
  width: 100%;
  grid-template-columns: 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr;
`;
const Gird = styled.div<{ gridStyle: any; gridPostion: number[] }>`
  ${p => p.gridStyle as string}
  width: 100%;
  grid-column-start: ${p => p.gridPostion[0]};
  grid-column-end: ${p => p.gridPostion[1]};

  &${RootGridLayout} {
    background-color: black;
  }
`;
