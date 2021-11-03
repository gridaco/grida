import React from "react";
import Draggable from "react-draggable";
import styled from "@emotion/styled";

const PIP = ({ children }) => {
  return (
    <div>
      <Draggable>
        <PipWindow>{children}</PipWindow>
      </Draggable>
    </div>
  );
};

const PipWindow = styled.div`
  background-color: #242d36;
  z-index: 100;
  position: fixed;
  font-size: 14px;
  font-weight: 200;
  line-height: 1.5;
  color: rgb(248, 248, 249);
  box-sizing: content-box;
  box-shadow: 1px 3px 3px 0 rgb(0 0 0 / 20%), 1px 3px 15px 2px rgb(0 0 0 / 20%);
  border-radius: 0.28571429rem;
  :hover {
    cursor: grab;
  }

  :active {
    cursor: grabbing;
    outline: -webkit-focus-ring-color auto 1px;
    outline-color: -webkit-focus-ring-color;
    outline-style: auto;
    outline-width: 1px;
  }
`;

export default PIP;
