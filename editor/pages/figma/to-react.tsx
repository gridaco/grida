import dynamic from "next/dynamic";
import React, { useEffect, useState } from "react";
import { MainImageRepository } from "@design-sdk/core/assets-repository";
import { ImageRepositories } from "@design-sdk/figma/asset-repository";
import { figmacomp, canvas, runner } from "../../components";
import { react } from "@designto/code";
import { nanoid } from "nanoid";
import { ReflectSceneNode } from "@design-sdk/core/nodes";
import styled from "@emotion/styled";
import { tokenize } from "@designto/token";

// set image repo for figma platform
MainImageRepository.instance = new ImageRepositories();

const CodemirrorEditor = dynamic(
  import("../../components/code-editor/code-mirror"),
  {
    ssr: false,
  }
);

export default function FigmaToReactDemoPage() {
  const [reflect, setReflect] = useState<ReflectSceneNode>();
  const [figmaDesignUrl, setFigmaDesignUrl] = useState<string>();

  const handleOnDesignImported = (reflect: ReflectSceneNode) => {
    setReflect(reflect);
  };

  const handleDesignUrlLoad = (url: string) => {
    setFigmaDesignUrl(url);
  };

  let widgetCode: string;
  if (reflect) {
    const _reflectWidget = tokenize(reflect);
    const _reactWidget = react.buildReactWidget(_reflectWidget);
    const _stringfiedReactwidget = react.buildReactApp(_reactWidget, {
      template: "cra",
    });

    widgetCode = _stringfiedReactwidget;
  }

  return (
    <>
      <canvas.FigmaEmbedCanvas url={figmaDesignUrl} />
      <figmacomp.FigmaScreenImporter
        onImported={handleOnDesignImported}
        onUrlEnter={handleDesignUrlLoad}
      />
      <ContentWrap>
        <CodemirrorEditor
          value={
            widgetCode
              ? widgetCode
              : "// No input design provided to be converted.."
          }
          options={{
            mode: "javascript",
            theme: "monokai",
            lineNumbers: true,
          }}
        />
        {widgetCode && (
          <div>
            <runner.ReactAppRunner source={widgetCode} />
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
