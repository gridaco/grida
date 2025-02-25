import React from "react";
import styled from "@editor-ui/theme";
import { css } from "@emotion/react";

interface Props {
  controlDoubleClick: (e?) => void;
  children?: JSX.Element | JSX.Element[] | undefined;
  enabled?: boolean;
  isMain?: boolean;
}

// TEMPORARY COMPONENT!!!
// TO BE UPDATED LATER ON @editor-ui/theme

export function BarDragArea(props: Props) {
  const enabled = props.enabled === undefined ? true : props.enabled;
  return (
    <>
      {enabled && (
        <Wrapper onDoubleClick={props.controlDoubleClick} isMain={props.isMain}>
          {props.children}
        </Wrapper>
      )}
    </>
  );
}

const Wrapper = styled.div<{ isMain: boolean }>`
  /** https://www.electronjs.org/docs/api/frameless-window#draggable-region - this is also present on side nav bar*/
  -webkit-app-region: drag;
  width: 100%;
  height: 56px;

  /* isMain is contorl top bar style (use only top-bar and bar-drag-area) */
  ${(props) =>
    props.isMain
      ? css``
      : css`
          position: absolute;
          top: 0;
          z-index: 999;
        `}
`;
