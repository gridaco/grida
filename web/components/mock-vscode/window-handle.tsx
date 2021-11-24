import styled from "@emotion/styled";
import React from "react";

function WindowHandle() {
  return (
    <RootWrapperWindowHandle>
      <Controls>
        <Close></Close>
        <Minimize></Minimize>
        <Fullscreen></Fullscreen>
      </Controls>
    </RootWrapperWindowHandle>
  );
}

const RootWrapperWindowHandle = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: start;
  flex: 1;
  gap: 10px;
  border-top-left-radius: 10px;
  border-top-right-radius: 10px;
  border-bottom-right-radius: 0px;
  border-bottom-left-radius: 0px;
  align-self: stretch;
  background-color: rgba(60, 60, 60, 1);
  box-sizing: border-box;
  padding-bottom: 8px;
  padding-top: 6px;
  padding-left: 9px;
  padding-right: 56px;
`;

const Controls = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: start;
  flex: none;
  gap: 7px;
  width: 50px;
  height: 12px;
  box-sizing: border-box;
`;

const Close = styled.div`
  width: 12px;
  height: 12px;
  background-color: rgba(236, 106, 95, 1);
  border-radius: 6px;
`;

const Minimize = styled.div`
  width: 12px;
  height: 12px;
  background-color: rgba(245, 191, 79, 1);
  border-radius: 6px;
`;

const Fullscreen = styled.div`
  width: 12px;
  height: 12px;
  background-color: rgba(98, 198, 85, 1);
  border-radius: 6px;
`;

export default WindowHandle;
