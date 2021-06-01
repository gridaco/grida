import dynamic from "next/dynamic";
import React, { useEffect, useState } from "react";
import { MainImageRepository } from "@design-sdk/core/assets-repository";
import { ImageRepositories } from "@design-sdk/figma/asset-repository";
import { figmacomp, canvas, runner } from "../../components";
import * as react from "@designto/react";
import { ReflectSceneNode } from "@design-sdk/core/nodes";
import styled from "@emotion/styled";
import { tokenize } from "@designto/token";
import JSONTree from "react-json-tree";
import { DefaultEditorWorkspaceLayout } from "../../layout/default-editor-workspace-layout";
import { LayerHierarchy } from "../../components/editor-hierarchy";

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
  let widgetTree;
  if (reflect) {
    const _reflectWidget = tokenize(reflect);
    widgetTree = react.buildReactWidget(_reflectWidget);
    const _stringfiedReactwidget = react.buildReactApp(widgetTree, {
      template: "cra",
    });

    widgetCode = _stringfiedReactwidget;
  }

  return (
    <>
      <DefaultEditorWorkspaceLayout leftbar={<LayerHierarchy data={reflect} />}>
        <canvas.FigmaEmbedCanvas url={figmaDesignUrl} />
        <figmacomp.FigmaScreenImporter
          onImported={handleOnDesignImported}
          onUrlEnter={handleDesignUrlLoad}
        />
        <ContentWrap>
          <JSONTree data={widgetTree} />
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
      </DefaultEditorWorkspaceLayout>
    </>
  );
}

const ContentWrap = styled.div`
  display: flex;
  flex-direction: row;
  align-items: stretch;
`;
