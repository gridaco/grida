import React, { useState } from "react";
import { figmacomp, canvas } from "../../../components";
import { ReflectSceneNode } from "@design-sdk/core/nodes";
import JSONTree from "react-json-tree";
import { tokenize } from "@designto/token";

export default function FigmaToReflectWidgetTokenPage() {
  const [reflect, setReflect] = useState<ReflectSceneNode>();
  const [figmaNodeUrl, setFigmaNodeUrl] = useState<string>();

  const handleOnDesignImported = (reflect: ReflectSceneNode) => {
    setReflect(reflect);
  };

  const handleFigmaUrlEnter = (url: string) => {
    setFigmaNodeUrl(url);
  };

  let tokenTree;
  if (reflect) {
    tokenTree = tokenize(reflect);
  }

  return (
    <>
      <canvas.FigmaEmbedCanvas url={figmaNodeUrl} />
      <figmacomp.FigmaScreenImporter
        onImported={handleOnDesignImported}
        onUrlEnter={handleFigmaUrlEnter}
      />
      <JSONTree hideRoot data={tokenTree} />
    </>
  );
}
