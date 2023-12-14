import type { AppFramework } from "@base-sdk/base/dist/types/app-frameworks";
import type { AppLanguage } from "@base-sdk/base/dist/types/app-languages";
import type { ScenePreviewParams } from "@base-sdk/base/dist/features/scene-preview";
import { buildFlutterFrameUrl } from "@base-sdk/base/dist/frame-embed";
import React from "react";
import styled from "@emotion/styled";
import { ResizableIframeAppRunnerFrame } from "@app/scene-view/components";
import CircularProgress from "@material-ui/core/CircularProgress";

interface Props {
  data: ScenePreviewParams;
}

export function ScaffoldSceneappRunnerView(props: Props) {
  const data = props.data;
  return (
    <>
      {AppRunnerFrame({
        id: data.id,
        framework: data.framework,
        url: data.url, // TODO:
        preview: data.url,
        language: data.language,
        width: data.w ?? 1000,
        height: data.h ?? 1000,
      })}
    </>
  );
}

function AppRunnerFrame(props: {
  id: string;
  url: string;
  preview: string;
  framework: AppFramework;
  language: AppLanguage;
  width: number;
  height: number;
}) {
  // region check mode
  // const mode = checkFrameSourceMode(props.framework, props.url);
  // endregion check mode

  const loading = <CircularProgress />;

  if (!props.url && !props.id) {
    return loading;
  }

  const _emb_url = buildFlutterFrameUrl({
    id: props.id,
    src: props.url,
    mode: "url",
    language: "dart",
  });
  return (
    <>
      {/* TODO: add max width & initial height based on aspect ratio = w/h */}
      <ResizableIframeAppRunnerFrame width={props.width} height={props.height}>
        {/* <IFrame id={props.id} src={_emb_url} /> */}
      </ResizableIframeAppRunnerFrame>
    </>
  );
}

const IFrame = styled.iframe`
  background: #ffffff;

  border-radius: 2px;
  width: 100%;
  height: 100%;
`;
