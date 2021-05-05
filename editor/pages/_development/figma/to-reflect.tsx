import React, { useState } from "react";
import { figmacomp, canvas, runner } from "../../../components";
import { ReflectSceneNode } from "@design-sdk/core/nodes";
import JSONTree from "react-json-tree";

export default function FigmaToReflectNodePage() {
  const [reflect, setReflect] = useState<ReflectSceneNode>();

  const handleOnDesignImported = (reflect: ReflectSceneNode) => {
    setReflect(reflect);
  };

  return (
    <>
      <canvas.DefaultCanvas />
      <figmacomp.FigmaScreenImporter onImported={handleOnDesignImported} />
      <JSONTree data={reflect} />
    </>
  );
}
