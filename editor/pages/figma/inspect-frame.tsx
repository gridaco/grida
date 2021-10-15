import React from "react";
import { MonacoEditor } from "../../components/code-editor";
import { SceneNode } from "@design-sdk/figma-types";
import { useDesign } from "../../query-hooks";
import LoadingLayout from "../../layout/loading-overlay";

/**
 * shows layout related data as json in a monaco editor
 * @returns
 */
export default function InspectAutolayout() {
  //
  const design = useDesign();
  if (!design) {
    return <LoadingLayout />;
  }
  const { node, reflect, raw, remote, figma } = design;
  //

  const inspectionTarget = figma && extractOnlyAutolayoutProoperties(figma);

  return (
    <>
      <MonacoEditor
        key={figma?.id}
        height="100vh"
        defaultLanguage="json"
        defaultValue={JSON.stringify(inspectionTarget, null, 2)}
      />
    </>
  );
}

interface _LiteAutolayoutInspectionRepresentative {
  type: string;
  id: string;
  name: string;
  width: number;
  height: number;
  children?: _LiteAutolayoutInspectionRepresentative[];
  layoutAlign: string;
  layoutGrow: number;
  layoutMode: string;
  primaryAxisSizingMode: string;
  counterAxisSizingMode: string;
  primaryAxisAlignItems: string;
  counterAxisAlignItems: string;
  padding: {
    l: number;
    b: number;
    t: number;
    r: number;
  };
}
function extractOnlyAutolayoutProoperties(
  node: SceneNode
): _LiteAutolayoutInspectionRepresentative {
  if (
    node.type == "FRAME" ||
    node.type == "INSTANCE" ||
    node.type == "COMPONENT"
  ) {
    let children: _LiteAutolayoutInspectionRepresentative[] = undefined;
    if ("children" in node) {
      children = node.children.map((c) => extractOnlyAutolayoutProoperties(c));
    }

    return {
      type: node.type,
      id: node.id,
      name: node.name,
      width: node.width,
      height: node.height,
      children: children,
      layoutAlign: node.layoutAlign,
      layoutGrow: node.layoutGrow,
      layoutMode: node.layoutMode,
      primaryAxisSizingMode: node.primaryAxisSizingMode,
      counterAxisSizingMode: node.counterAxisSizingMode,
      primaryAxisAlignItems: node.primaryAxisAlignItems,
      counterAxisAlignItems: node.counterAxisAlignItems,
      padding: {
        l: node.paddingLeft,
        r: node.paddingRight,
        b: node.paddingBottom,
        t: node.paddingTop,
      },
    };
  }
}
