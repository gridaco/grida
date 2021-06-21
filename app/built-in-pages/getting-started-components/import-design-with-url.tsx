import React from "react";
import styled from "@emotion/styled";

import { NodeViewWrapper } from "@boringso/react-core";

export function ImportDesignWithUrl() {
  return (
    <NodeViewWrapper>
      <_RootWrapper>
        <input></input>
        <button>Import</button>
      </_RootWrapper>
    </NodeViewWrapper>
  );
}

const _RootWrapper = styled.div``;
