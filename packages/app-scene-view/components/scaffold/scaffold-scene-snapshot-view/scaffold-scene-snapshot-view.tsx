import React from "react";
import { ScreenPreviewCardBlock } from "@app/blocks/screen-preview-card-block";
import styled from "@emotion/styled";

/**
 * Interface will be merged into size after component update later
 */

interface Props {
  width: number;
  height: number;
  previewUrl: string;
}

interface IWrapper {
  size: {
    width: number;
    height: number;
  };
}

export function ScaffoldSceneSnapshotView(props: Props) {
  return (
    <Wrapper size={{ width: props.width, height: props.height }}>
      <ScreenPreviewCardBlock url={props.previewUrl} snapshot={true} />
    </Wrapper>
  );
}

const Wrapper = styled.div<IWrapper>`
  width: fit-content;
  height: fit-content;
  /* width: ${(props) => `${props.size.width}px`};
  height: ${(props) => `${props.size.height}px`}; */
  position: relative;
  display: inline-block;
  overflow: hidden;
  margin: 0;
  max-width: 100%;
  img {
    /* display: block; */
    /* position: absolute; */
    /* top: 50%; */
    /* left: 50%; */
    width: 100%;
    /* transform: translate(-50%, -50%); */
  }
`;
