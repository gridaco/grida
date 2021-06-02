import React, { useState } from "react";
import styled from "@emotion/styled";
import TreeView from "@material-ui/lab/TreeView";
import ExpandMoreIcon from "@material-ui/icons/ExpandMore";
import ChevronRightIcon from "@material-ui/icons/ChevronRight";
import TreeItem from "@material-ui/lab/TreeItem";

interface LayerTree {
  id: string;
  type: string;
  name: string;
  children?: Array<LayerTree>;
}

export function LayerHierarchy(props: {
  data: LayerTree;
  onLayerSelect?: {
    single?: (id: string) => void;
    multi?: (ids: string[]) => void;
  };
}) {
  // make mode
  const selectionmode = props.onLayerSelect?.multi ? "multi" : "single";
  const [selections, setSelections] = useState<string[]>();

  const handleLayerClick = (id: string) => {
    if (selectionmode == "single") {
      props.onLayerSelect?.single?.(id);
    } else {
      setSelections([id, ...selections]);
      props.onLayerSelect?.multi?.(selections);
    }
  };

  const data = props.data;

  const renderTree = (nodes: LayerTree) => {
    if (!nodes) {
      return <>empty</>;
    }
    return (
      <TreeItem
        key={nodes.id}
        nodeId={nodes.id}
        label={nodes.name}
        onClick={() => handleLayerClick(nodes.id)}
      >
        {Array.isArray(nodes.children)
          ? nodes.children.map((node) => renderTree(node))
          : null}
      </TreeItem>
    );
  };

  return (
    <Wrapper>
      <div className="scene-tab">
        <span>SCENE</span>
        <span>FILES</span>
      </div>
      <>
        <TreeView
          defaultCollapseIcon={<ExpandMoreIcon />}
          defaultExpanded={["root"]}
          defaultExpandIcon={<ChevronRightIcon />}
        >
          {renderTree(data)}
        </TreeView>
      </>
    </Wrapper>
  );
}

const Wrapper = styled.div`
  flex: 1;
  min-width: 200px;
  height: 100%;
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
