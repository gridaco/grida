import React from "react";
import styled from "@emotion/styled";
import { Struct } from "../layout/scene-explorer";
import HierachyItem from "./hienrarchy-item";

function HienrarchyItems(props: {
  level?: number;
  expandIds?: Array<string>;
  struct: Struct[];
  onExpand: (id: string) => void;
}) {
  const level = props.level ?? 0;
  const sceneStruct = props.struct ?? [];
  const expandIds = props.expandIds ?? [];

  return (
    <Wrapper>
      {sceneStruct.map((i, ix) => (
        <React.Fragment key={ix}>
          <HierachyItem
            struct={i}
            level={level}
            onExpand={() => props.onExpand(i.id)}
          />
          {i.child && expandIds.includes(i.id) && (
            <HienrarchyItems
              expandIds={expandIds}
              level={level + 1}
              struct={i.child}
              onExpand={props.onExpand}
            />
          )}
        </React.Fragment>
      ))}
    </Wrapper>
  );
}

export default HienrarchyItems;

const Wrapper = styled.div`
  flex: 1;

  .scene-tab {
    margin-bottom: 30px;
  }
`;
