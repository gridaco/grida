import React, { useState } from "react";
import styled from "@emotion/styled";
import Hirachy from "../../../packages/editor-ui/lib/hirachy/hirachy";
import { MockStructData } from "./mock";

function Menubar() {
  const [expandIds, setExpandIds] = useState([]);

  const onExpand = (id: string) => {
    setExpandIds((d) => [...d, id]);
  };

  return (
    <Wrapper>
      <Hirachy
        structs={MockStructData}
        expandIds={expandIds}
        onExpand={onExpand}
      />
    </Wrapper>
  );
}

export default Menubar;

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 250px;
  width: 100%;
  background-color: #121212;
`;
