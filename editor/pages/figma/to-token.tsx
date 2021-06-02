import React, { useState } from "react";
import { figmacomp, canvas } from "../../components";
import { ReflectSceneNode } from "@design-sdk/core/nodes";
import { tokenize } from "@designto/token";
import { JsonTree } from "../../components/visualization/json-visualization/json-tree";
import { FigmaTargetNodeConfig } from "@design-sdk/core/utils/figma-api-utils";

export default function FigmaToReflectWidgetTokenPage() {
  const [reflect, setReflect] = useState<ReflectSceneNode>();
  const [figmaNodeUrl, setFigmaNodeUrl] = useState<string>();

  const handleOnDesignImported = (reflect: ReflectSceneNode) => {
    setReflect(reflect);
  };

  const handleFigmaUrlEnter = (target: FigmaTargetNodeConfig) => {
    setFigmaNodeUrl(target.url);
  };

  let tokenTree;
  if (reflect) {
    tokenTree = tokenize(reflect);
  }

  return (
    <>
      <canvas.FigmaEmbedCanvas src={{ url: figmaNodeUrl }} />
      <figmacomp.FigmaScreenImporter
        onImported={handleOnDesignImported}
        onTargetEnter={handleFigmaUrlEnter}
      />

      <JsonTree hideRoot data={tokenTree} />
    </>
  );
}
