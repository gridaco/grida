import React from "react";
import styled from "@emotion/styled";
import { useReflectTargetNode } from "../../query/from-figma";

export default function InspectAutolayout() {
  //
  const targetNodeConfig = useReflectTargetNode();
  const figmaNode = targetNodeConfig?.figma;
  const reflect = targetNodeConfig?.reflect;
  //

  return <p>{JSON.stringify(figmaNode)}</p>;
}
