import React, { useState } from "react";
import styled from "@emotion/styled";
import Hirachy from "../../../packages/editor-ui/lib/hirachy/hirachy";
import { MockStructData } from "./mock";

function Menubar() {
  const [expandIds, setExpandIds] = useState([]);
  const [currentIdx, setCurrentIdx] = useState("");

  const onExpand = (id: string) => {
    if (expandIds.includes(id)) {
      setExpandIds((d) => {
        return d.reduce((acc, v, ix) => {
          if (ix === d.indexOf(id)) {
            return acc;
          } else {
            acc.push(v);
            return acc;
          }
        }, []);
      });
    } else {
      setExpandIds((d) => [...d, id]);
    }
    setCurrentIdx(id)
  };

  return (
    <Wrapper>
      <Hirachy
        structs={MockStructData}
        expandIds={expandIds}
        currentId={currentIdx}
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
