import React from "react";
import styled from "@emotion/styled";
import { Resizable as _Resizable, ResizableProps } from "re-resizable";

// @ts-ignore
export const Resizable = styled(_Resizable)`
  .handle {
    z-index: 99;
    &:hover {
      background-color: rgba(255, 255, 255, 0.1);
    }
    &:active {
      background-color: rgba(255, 255, 255, 0.2);
    }
    transition: background-color 0.1s ease-in-out;
  }
`;

export type { ResizableProps };
