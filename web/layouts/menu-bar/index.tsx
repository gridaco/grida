import React, { memo } from "react";
import styled from "@emotion/styled";
import Hirachy from "../../../packages/editor-ui/lib/hirachy/hirachy";
import { useRecoilState, useRecoilValue } from "recoil";
import { currentSelectedIdState, structState } from "state/demo";

export default memo(function Menubar() {
  const [selectId, setSelectId] = useRecoilState(currentSelectedIdState);
  const struct = useRecoilValue(structState);

  return (
    <Wrapper className="menu-bar-area" onClick={() => setSelectId("")}>
      <div className="wrapper-only-hirachy" onClick={(e) => e.stopPropagation()}>
        <Hirachy
          structs={struct}
          selectId={selectId}
          onSelect={(id: string) => setSelectId(id)}
        />
      </div>
    </Wrapper>
  );
})

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 250px;
  width: 100%;
  background-color: #121212;

  .wrapper-only-hirachy {
    width: 100%;
  }
`;
