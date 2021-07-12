import React, { useState } from "react";
import styled from "@emotion/styled";
import TreeView from "@material-ui/lab/TreeView";
import ExpandMoreIcon from "@material-ui/icons/ExpandMore";
import ChevronRightIcon from "@material-ui/icons/ChevronRight";
import TreeItem from "@material-ui/lab/TreeItem";
import { SideNavigation } from "../../side-navigation";

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
  const [expanded, setExpanded] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);

  const handleToggle = (event: React.ChangeEvent<{}>, nodeIds: string[]) => {
    setExpanded(nodeIds);
  };

  const handleSelect = (event: React.ChangeEvent<{}>, nodeIds: string[]) => {
    setSelected(nodeIds);
    handleLayerClick(nodeIds);
  };

  const handleLayerClick = (ids: string[]) => {
    if (selectionmode == "single") {
      const id = ids[ids.length - 1];
      props.onLayerSelect?.single?.(id);
    } else {
      setSelections(ids);
      props.onLayerSelect?.multi?.(selections);
    }
  };

  const data = props.data;

  const renderTree = (nodes: LayerTree) => {
    if (!nodes) {
      return <div style={{ padding: 24 }}>empty</div>;
    }
    return (
      <TreeItem key={nodes.id} nodeId={nodes.id} label={nodes.name}>
        {Array.isArray(nodes.children)
          ? nodes.children.map((node) => renderTree(node))
          : null}
      </TreeItem>
    );
  };

  return (
    <SideNavigation>
      <Wrapper>
        <div className="scene-tab">
          <span>SCENE</span>
          <span>FILES</span>
        </div>
        <>
          <TreeView
            defaultCollapseIcon={<ExpandMoreIcon />}
            defaultExpanded={[props.data?.id]}
            defaultExpandIcon={<ChevronRightIcon />}
            expanded={expanded}
            selected={selected}
            onNodeToggle={handleToggle}
            onNodeSelect={handleSelect}
          >
            {renderTree(data)}
          </TreeView>
        </>
      </Wrapper>
    </SideNavigation>
  );
}

const Wrapper = styled.div`
  flex: 0;
  display: flex;
  align-items: stretch;
  flex-direction: column;

  .scene-tab {
    margin: 30px 0px;

    span {
      cursor: pointer;
      margin-left: 16px;
      font-size: 12px;
    }
  }
`;
