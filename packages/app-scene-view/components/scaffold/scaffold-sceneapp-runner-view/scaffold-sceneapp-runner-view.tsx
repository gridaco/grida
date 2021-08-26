import { QuicklookQueryParams } from "@base-sdk/base/features/quicklook";
import { AppFramework } from "../../../../../externals/base-sdk/base/types/app-frameworks";
import { AppLanguage } from "../../../../../externals/base-sdk/base/types/app-languages";
import {
  buildFlutterFrameUrl,
  checkFrameSourceMode,
} from "@base-sdk/base/frame-embed";
import React from "react";
import styled from "@emotion/styled";
import { ResizableIframeAppRunnerFrame } from "@app/scene-view/components";
import CircularProgress from "@material-ui/core/CircularProgress";
import { appRunnerConfig } from "..";

interface Props {
  data: appRunnerConfig;
}

export function ScaffoldSceneappRunnerView(props: Props) {
  const data = props.data;

  return (
    <>
      {AppRunnerFrame({
        id: data.id,
        framework: data.framework,
        source: data.source, // TODO:
        preview: data.url,
        language: data.language,
        width: data.w,
        height: data.h,
      })}
    </>
  );
}

function AppRunnerFrame(props: {
  id: string;
  source: string;
  preview: string;
  framework: AppFramework;
  language: AppLanguage;
  width: number;
  height: number;
}) {
  // region check mode
  const mode = checkFrameSourceMode(props.framework, props.source);
  // endregion check mode

  const loading = <CircularProgress />;

  if (!props.source && !props.id) {
    return loading;
  }

  const _emb_url = buildFlutterFrameUrl({
    id: props.id,
    src: props.source,
    mode: "url",
    language: "dart",
  });
  return (
    <>
      {/* TODO: add max width & initial height based on aspect ratio = w/h */}
      <ResizableIframeAppRunnerFrame width={props.width} height={props.height}>
        <IFrame id={props.id} src={_emb_url} />
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
