import React, { useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";

interface LayerTree {
  id: string;
  type: string;
  name: string;
  children?: Array<LayerTree>;
}

export function LayerHierarchy(props: { data: LayerTree }) {
  const [expandIds, setExpandIds] = useState([]);
  const fileInput = useRef(null);

  const onExpandStruct = (id: string) => {
    setExpandIds((d) => [...d, id]);
  };

  const onFileUpload = (e) => {
    const reader = new FileReader();
    e.preventDefault();
    reader.onload = function () {
      console.log(reader.result);
    };
    try {
      reader.readAsText(e.target.files[0], "UTF-8");
    } catch (e) {
      console.error(`ERROR : import ( json ... + etc )\ndetail : ${e}`);
    }
  };

  return (
    <Wrapper>
      <input
        ref={fileInput}
        type="file"
        style={{ display: "none" }}
        onChange={onFileUpload}
        accept=".json"
      />
      <div className="scene-tab">
        <span>SCENE</span>
        <span onClick={() => fileInput.current.click()}>FILES</span>
      </div>
    </Wrapper>
  );
}

const Wrapper = styled.div`
  flex: 1;
  min-width: 200px;
  background-color: #2a2e39;

  .scene-tab {
    margin: 30px 0px;

    span {
      cursor: pointer;
      margin-left: 16px;
      color: #fff;
      font-size: 12px;
    }
  }
`;
