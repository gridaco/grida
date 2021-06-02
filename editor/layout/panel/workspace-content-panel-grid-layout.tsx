import React from "react";
import { WorkspaceContentPanel } from "./workspace-content-panel";
export function WorkspaceContentPanelGridLayout(props: {
  children: JSX.Element | JSX.Element[];
}) {
  const onlyPanelChilds = () => {
    return React.Children.map(props.children, (child) => {
      if (child.type == WorkspaceContentPanel) {
        return child;
      }
    });
  };

  return <>{onlyPanelChilds()}</>;
}
