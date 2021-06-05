import React, { useEffect, useState } from "react";
import { figmacomp, canvas } from "../../components";
import { ReflectSceneNode } from "@design-sdk/core/nodes";
import { tokenize } from "@designto/token";
import {
  JsonTree,
  WidgetTree,
} from "../../components/visualization/json-visualization/json-tree";
import {
  FigmaTargetNodeConfig,
  parseFileAndNodeIdFromUrl_Figma,
} from "@design-sdk/core/utils/figma-api-utils";
import { useRouter } from "next/router";
import { extractFromFigmaQueryParams } from "../../query/from-figma";
import { Figma } from "@design-sdk/figma";
import { fetchTargetAsReflect } from "../../components/figma/screen-importer";
import { DefaultEditorWorkspaceLayout } from "../../layout/default-editor-workspace-layout";
import { LayerHierarchy } from "../../components/editor-hierarchy";
import { WorkspaceContentPanelGridLayout } from "../../layout/panel/workspace-content-panel-grid-layout";
import { WorkspaceContentPanel } from "../../layout/panel";
import { WorkspaceBottomPanelDockLayout } from "../../layout/panel/workspace-bottom-panel-dock-layout";

export default function FigmaToReflectWidgetTokenPage() {
  const [figmaNode, setFigmaNode] = useState<Figma.SceneNode>();
  const [reflect, setReflect] = useState<ReflectSceneNode>();
  const [figmaNodeUrl, setFigmaNodeUrl] = useState<string>();
  const [
    targetnodeConfig,
    setTargetnodeConfig,
  ] = useState<FigmaTargetNodeConfig>();

  const router = useRouter();

  useEffect(() => {
    const params = extractFromFigmaQueryParams(router);
    if (params.figma_target_url) {
      setFigmaNodeUrl(params.figma_target_url);
      const targetnodeconfig = parseFileAndNodeIdFromUrl_Figma(
        params.figma_target_url
      );
      setTargetnodeConfig(targetnodeconfig);
      fetchTargetAsReflect(targetnodeconfig.file, targetnodeconfig.node).then(
        (res) => {
          setReflect(res.reflect);
          setFigmaNode(res.figma);
        }
      );
    }
  }, [router]);

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
      {!figmaNodeUrl && (
        <figmacomp.FigmaScreenImporter
          onImported={handleOnDesignImported}
          onTargetEnter={handleFigmaUrlEnter}
        />
      )}
      <DefaultEditorWorkspaceLayout leftbar={<LayerHierarchy data={reflect} />}>
        <WorkspaceContentPanelGridLayout>
          <WorkspaceContentPanel>
            <canvas.FigmaEmbedCanvas
              src={{ url: figmaNodeUrl }}
              width="100%"
              height="100%"
            />
          </WorkspaceContentPanel>

          <WorkspaceBottomPanelDockLayout>
            <WorkspaceContentPanel>
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "stretch",
                }}
              >
                <div style={{ flex: 1 }}>
                  <WidgetTree data={figmaNode} />
                </div>
                <div style={{ flex: 1 }}>
                  <WidgetTree data={reflect} />
                </div>
                <div style={{ flex: 1 }}>
                  <JsonTree hideRoot data={tokenTree} />
                </div>
              </div>
            </WorkspaceContentPanel>
          </WorkspaceBottomPanelDockLayout>
        </WorkspaceContentPanelGridLayout>
      </DefaultEditorWorkspaceLayout>
    </>
  );
}
