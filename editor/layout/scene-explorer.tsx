import React, { useEffect, useState } from "react";
import styled from "@emotion/styled";
import HierachyItem from "../components/hienrarchy-item";
import HienrarchyItems from "../components/hienrarchy-items";
import cuid from "cuid";

type SceneType = "layout" | "text" | "icon" | "image";

export interface Struct {
  id: string;
  title: string;
  type: SceneType;
  child?: Struct[];
}

const mockSceneStruct: Struct[] = [
  {
    id: cuid(),
    title: "Horizontal List",
    type: "layout",
    child: [
      {
        id: cuid(),
        title: "Component",
        type: "layout",
        child: [
          {
            id: cuid(),
            title: "Layout",
            type: "layout",
            child: [
              {
                id: cuid(),
                title: "Image",
                type: "image",
              },
              {
                id: cuid(),
                title: "Icon Button",
                type: "layout",
              },
            ],
          },
          {
            id: cuid(),
            title: "Text",
            type: "text",
          },
        ],
      },
    ],
  },
  {
    id: cuid(),
    title: "Section",
    type: "layout",
    child: [
      {
        id: cuid(),
        title: "Text",
        type: "text",
        child: [],
      },
      {
        id: cuid(),
        title: "Vertical List",
        type: "layout",
        child: [
          {
            id: cuid(),
            title: "Component",
            type: "layout",
          },
          {
            id: cuid(),
            title: "Component",
            type: "layout",
          },
          {
            id: cuid(),
            title: "Component",
            type: "layout",
          },
        ],
      },
    ],
  },
];

function SceneExplorer() {
  const [expandIds, setExpandIds] = useState([]);

  const onExpandStruct = (id: string) => {
    setExpandIds(d => [...d, id]);
  };

  return (
    <Wrapper>
      <div className="scene-tab">
        <span>SCENE</span>
        <span>FILES</span>
      </div>
      <HienrarchyItems
        expandIds={expandIds}
        struct={mockSceneStruct}
        onExpand={onExpandStruct}
      />
    </Wrapper>
  );
}

export default SceneExplorer;

const Wrapper = styled.div`
  flex: 1;
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
