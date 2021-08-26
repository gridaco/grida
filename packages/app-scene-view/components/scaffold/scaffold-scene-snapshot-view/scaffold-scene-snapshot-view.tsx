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
  width: ${(props) => `${props.size.width}px`};
  height: ${(props) => `${props.size.height}px`};
  img {
    width: 100%;
    margin: auto 0;
    display: block;
  }
`;
