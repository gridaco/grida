import dynamic from "next/dynamic";
import React, { useEffect, useState } from "react";
import { MainImageRepository } from "@design-sdk/core/assets-repository";
import { ImageRepositories } from "@design-sdk/figma/asset-repository";
import { figmacomp, canvas, runner } from "../../../components";
import { react } from "@designto/code";
import { nanoid } from "nanoid";
import { ReflectSceneNode } from "@design-sdk/core/nodes";
import styled from "@emotion/styled";

// set image repo for figma platform
MainImageRepository.instance = new ImageRepositories();

const CodemirrorEditor = dynamic(
  import("../../../components/code-editor/code-mirror"),
  {
    ssr: false,
  }
);

export default function FigmaToReactDemoPage() {
  const [reflect, setReflect] = useState<ReflectSceneNode>();

  const handleOnDesignImported = (reflect: ReflectSceneNode) => {
    setReflect(reflect);
  };

  // todo
  const widgetCode = "Not loaded";

  return (
    <>
      <canvas.DefaultCanvas />
      <figmacomp.FigmaScreenImporter onImported={handleOnDesignImported} />
      <ContentWrap>
        <CodemirrorEditor
          value={
            widgetCode
              ? widgetCode
              : "// No input design provided to be converted.."
          }
          options={{
            mode: "dart",
            theme: "monokai",
            lineNumbers: true,
          }}
        />
        {widgetCode && (
          <div>
            <runner.ReactAppRunner />
            <br />
          </div>
        )}
      </ContentWrap>
    </>
  );
}

const ContentWrap = styled.div`
  display: flex;
  flex-direction: row;
  align-items: stretch;
`;
