import React from "react";
import styled from "@editor-ui/theme";

interface Props {
  controlDoubleClick: (e?) => void;
  children?: JSX.Element | JSX.Element[] | undefined;
  enabled?: boolean;
}

// TEMPORARY COMPONENT!!!
// TO BE UPDATED LATER ON @editor-ui/theme

export function BarDragArea(props: Props) {
  const enabled = props.enabled === undefined ? true : props.enabled;
  return (
    <>
      {enabled && (
        <Wrapper onDoubleClick={props.controlDoubleClick}>
          {props.children}
        </Wrapper>
      )}
    </>
  );
}

const Wrapper = styled.div(({ theme }) => ({
  /** https://www.electronjs.org/docs/api/frameless-window#draggable-region - this is also present on side nav bar*/
  WebkitAppRegion: "drag",
  width: "100%",
  height: "56px",
  position: "absolute",
  top: 0,
  zIndex: 999,
}));
