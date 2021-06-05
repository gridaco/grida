import React, { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { MainImageRepository } from "@design-sdk/core/assets-repository";
import { ImageRepositories } from "@design-sdk/figma/asset-repository";
import { figmacomp } from "../../components";
import { ReflectSceneNode } from "@design-sdk/core/nodes";
import { DefaultEditorWorkspaceLayout } from "../../layout/default-editor-workspace-layout";
import { LayerHierarchy } from "../../components/editor-hierarchy";
import { PreviewAndRunPanel } from "../../components/preview-and-run";
import {
  FigmaTargetNodeConfig,
  parseFileAndNodeIdFromUrl_Figma,
} from "@design-sdk/core/utils/figma-api-utils";
import {
  WorkspaceContentPanel,
  WorkspaceContentPanelGridLayout,
} from "../../layout/panel";
import { WorkspaceBottomPanelDockLayout } from "../../layout/panel/workspace-bottom-panel-dock-layout";
import { WidgetTree } from "../../components/visualization/json-visualization/json-tree";
import { MonacoEditor } from "../../components/code-editor";
import { tokenize } from "@designto/token";
import * as react from "@designto/react";
import { useRouter } from "next/router";
import { fetchTargetAsReflect } from "../../components/figma/screen-importer";
import { mapGrandchildren } from "@design-sdk/core/utils";
// set image repo for figma platform
MainImageRepository.instance = new ImageRepositories();

interface FigmaToReactRouterQueryParams {
  figma_target_url: string;
}

export default function FigmaToReactDemoPage() {
  const [reflect, setReflect] = useState<ReflectSceneNode>();
  const [targetSelectionNodeId, setTargetSelectionNodeId] = useState<string>();
  const [
    targetnodeConfig,
    setTargetnodeConfig,
  ] = useState<FigmaTargetNodeConfig>();

  const router = useRouter();

  useEffect(() => {
    const targetUrl = ((router.query as any) as FigmaToReactRouterQueryParams)
      ?.figma_target_url;
    if (targetUrl) {
      console.log("target url loaded from query parm", targetUrl);
      const targetnodeconfig = parseFileAndNodeIdFromUrl_Figma(targetUrl);
      setTargetnodeConfig(targetnodeconfig);
      fetchTargetAsReflect(targetnodeconfig.file, targetnodeconfig.node).then(
        (reflect) => {
          console.log("setting reflect", reflect);
          setReflect(reflect);
        }
      );
    }
  }, [router]);

  const handleOnDesignImported = (reflect: ReflectSceneNode) => {
    setReflect(reflect);
  };

  const handleTargetAquired = (target: FigmaTargetNodeConfig) => {
    // update url query param
    ((router.query as any) as FigmaToReactRouterQueryParams).figma_target_url =
      target.url;
    router.push(router);
    //

    // update config
    setTargetnodeConfig(target);
  };

  const handleOnSingleLayerSelect = (id: string) => {
    const newTarget = mapGrandchildren(reflect).find((r) => r.id == id);
    console.log("newTarget", id, newTarget);
    if (newTarget) {
      setTargetSelectionNodeId(id);
      setReflect(newTarget);
    }
    // const searchForNodeWithIdInTree = (
    //   r: ReflectSceneNode,
    //   id: string
    // ): ReflectSceneNode => {
    //   if (r.id == id) {
    //     return r;
    //   } else {
    //     r.children?.find((r) => {
    //       return searchForNodeWithIdInTree(r, id);
    //     });
    //     return undefined;
    //   }
    // };
    // const targetReflectSubset = searchForNodeWithIdInTree(reflect, id);
    // if (targetReflectSubset) {
    //   setReflect(targetReflectSubset);
    // } else {
    //   console.warn("selection is invalid");
    // }
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
    <div key={reflect?.id}>
      <DefaultEditorWorkspaceLayout
        leftbar={
          <LayerHierarchy
            data={reflect}
            onLayerSelect={{ single: handleOnSingleLayerSelect }}
          />
        }
      >
        {!targetnodeConfig && (
          <figmacomp.FigmaScreenImporter
            onImported={handleOnDesignImported}
            onTargetEnter={handleTargetAquired}
          />
        )}

        <WorkspaceContentPanelGridLayout>
          <WorkspaceContentPanel>
            <PreviewAndRunPanel
              key={targetnodeConfig?.url ?? reflect?.id}
              config={{
                src: widgetCode,
                platform: "web",
                sceneSize: {
                  w: reflect?.width,
                  h: reflect?.height,
                },
                fileid: targetnodeConfig?.file,
                sceneid: targetnodeConfig?.node,
              }}
            />
          </WorkspaceContentPanel>
          <WorkspaceContentPanel>
            <InspectionPanelContentWrap>
              <MonacoEditor
                key={widgetCode}
                height="100vh"
                options={{
                  automaticLayout: true,
                }}
                defaultValue={
                  widgetCode
                    ? widgetCode
                    : "// No input design provided to be converted.."
                }
              />
            </InspectionPanelContentWrap>
          </WorkspaceContentPanel>
          <WorkspaceBottomPanelDockLayout>
            <WorkspaceContentPanel>
              <WidgetTree data={widgetTree} />
            </WorkspaceContentPanel>
          </WorkspaceBottomPanelDockLayout>
        </WorkspaceContentPanelGridLayout>
      </DefaultEditorWorkspaceLayout>
    </div>
  );
}

const InspectionPanelContentWrap = styled.div`
  display: flex;
  flex-direction: row;
  align-items: stretch;
`;
