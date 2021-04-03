import React, { useState } from "react";
import styled from "@emotion/styled";
import Hirachy from "../../../packages/editor-ui/lib/hirachy/hirachy";
import { MockStructData } from "./mock";
import { useRecoilState, useRecoilValue } from "recoil";
import { currentSelectedIdState, structState } from "state/demo";

function Menubar() {
  const [expandIds, setExpandIds] = useState([]);
  const [selectId, setSelectId] = useRecoilState(currentSelectedIdState)
  const struct = useRecoilValue(structState);

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
    setSelectId(id === selectId ? "" : id)
  };

  return (
    <Wrapper>
      <Hirachy
        structs={struct}
        expandIds={expandIds}
        currentId={selectId}
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
