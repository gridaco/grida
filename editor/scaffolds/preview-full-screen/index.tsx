import React, { useEffect, useState } from "react";
import { useEditorState } from "core/states";
import styled from "@emotion/styled";
import { vanilla_presets } from "@grida/builder-config-preset";
import { designToCode, Result } from "@designto/code";
import { config } from "@designto/config";
import {
  ImageRepository,
  MainImageRepository,
} from "@design-sdk/core/assets-repository";
import { RemoteImageRepositories } from "@design-sdk/figma-remote/lib/asset-repository/image-repository";
import { VanillaRunner } from "components/app-runner/vanilla-app-runner";
import { useTargetContainer, useWindowSize } from "hooks";
import Close from "@material-ui/icons/Close";
import ClientOnly from "components/client-only";

export function FullScreenPreview({ onClose }: { onClose: () => void }) {
  const [state] = useEditorState();
  const [preview, setPreview] = useState<Result>();
  const windowsize = useWindowSize();
  const target = useTargetContainer();

  const on_preview_result = (result: Result) => {
    setPreview(result);
  };

  useEffect(() => {
    const __target = target?.target; // root.entry;
    if (__target) {
      if (!MainImageRepository.isReady) {
        // this is not the smartest way, but the image repo has a design flaw.
        // this happens when the target node is setted on the query param on first load, when the image repo is not set by the higher editor container.
        MainImageRepository.instance = new RemoteImageRepositories(
          state.design.key,
          {
            // setting this won't load any image btw. (just to prevent errors)
            authentication: { accessToken: "" },
          }
        );
        MainImageRepository.instance.register(
          new ImageRepository(
            "fill-later-assets",
            "grida://assets-reservation/images/"
          )
        );
      }

      const _input = {
        id: __target.id,
        name: __target.name,
        entry: __target,
      };
      const build_config = {
        ...config.default_build_configuration,
        disable_components: true,
      };

      // ----- for preview -----
      designToCode({
        input: _input,
        build_config: build_config,
        framework: vanilla_presets.vanilla_default,
        asset_config: {
          skip_asset_replacement: false,
          asset_repository: MainImageRepository.instance,
          custom_asset_replacement: {
            type: "static",
            resource:
              "https://bridged-service-static.s3.us-west-1.amazonaws.com/placeholder-images/image-placeholder-bw-tile-100.png",
          },
        },
      })
        .then(on_preview_result)
        .catch(console.error);

      if (!MainImageRepository.instance.empty) {
        designToCode({
          input: target.root,
          build_config: build_config,
          framework: vanilla_presets.vanilla_default,
          asset_config: { asset_repository: MainImageRepository.instance },
        })
          .then(on_preview_result)
          .catch(console.error);
      } else {
        console.error("MainImageRepository is empty");
      }
    }
  }, [target?.target?.id]);

  //
  return (
    <RootWrapperFullScreenRunnerViewLayout>
      <FullscreenPreviewAppbar>
        <AppbarControlSizeInputs>
          <StaticSizeInput value={windowsize.width ?? 0} suffix={"W"} />
          <StaticSizeInput value={windowsize.height ?? 0} suffix={"H"} />
        </AppbarControlSizeInputs>
        <AppbarActionsSegment>
          <CloseButton onClick={onClose} />
        </AppbarActionsSegment>
      </FullscreenPreviewAppbar>
      <Body>
        {preview && (
          <VanillaRunner
            key={preview.scaffold.raw}
            style={{
              alignSelf: "stretch",
              borderRadius: 0,
              // TODO: do not specify static bg color
              background: "white",
              flexGrow: 1,
              border: "none",
              margin: 0,
              padding: 0,
            }}
            enableInspector={false}
            source={preview.scaffold.raw}
            width="100%"
            height="100%"
            componentName={preview.name}
          />
        )}
      </Body>
    </RootWrapperFullScreenRunnerViewLayout>
  );
}

const StaticSizeInput = ({
  value,
  suffix,
}: {
  value: number;
  suffix: string;
}) => {
  return (
    <WidthInput>
      <Value>{value}</Value>
      <ValueSuffixText>{suffix}</ValueSuffixText>
    </WidthInput>
  );
};

const CloseButton = ({ onClick }: { onClick: () => void }) => {
  return (
    <CloseButtonBase onClick={onClick}>
      <ClientOnly>
        <Close style={{ color: "white" }} />
      </ClientOnly>
    </CloseButtonBase>
  );
};

const RootWrapperFullScreenRunnerViewLayout = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: center;
  flex: none;
  height: 100vh;
  overflow: hidden;
  box-sizing: border-box;
`;

const FullscreenPreviewAppbar = styled.div`
  height: 50px;
  overflow: hidden;
  background-color: rgba(17, 17, 17, 1);
  position: relative;
  align-self: stretch;
`;

const AppbarControlSizeInputs = styled.div`
  display: flex;
  justify-content: space-between;
  flex-direction: row;
  align-items: flex-start;
  flex: none;
  width: 170px;
  box-sizing: border-box;
  position: absolute;
  left: calc((calc((50% + 0px)) - 85px));
  top: calc((calc((50% + 0px)) - 12px));
`;

const WidthInput = styled.div`
  width: 68px;
  height: 24px;
  position: relative;
`;

const Value = styled.span`
  color: rgba(255, 255, 255, 1);
  text-overflow: ellipsis;
  font-size: 11px;
  font-family: Inter, sans-serif;
  font-weight: 500;
  text-align: left;
  position: absolute;
  left: 8px;
  top: 5px;
`;

const ValueSuffixText = styled.span`
  color: rgba(182, 182, 182, 1);
  text-overflow: ellipsis;
  font-size: 11px;
  font-family: Inter, sans-serif;
  font-weight: 500;
  text-align: left;
  position: absolute;
  left: 54px;
  top: 6px;
`;

const AppbarActionsSegment = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: flex-start;
  flex: none;
  gap: 21px;
  box-sizing: border-box;
  position: absolute;
  top: calc((calc((50% + 0px)) - 13px));
  right: 24px;
`;

const CloseButtonBase = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 10px;
  box-shadow: 0px 4px 12px 0px rgba(0, 0, 0, 0.1);
  border-radius: 4px;
  width: 34px;
  height: 26px;
  background-color: rgba(43, 43, 43, 1);
  box-sizing: border-box;
`;

const IconsMdiClose = styled.img`
  width: 20px;
  height: 20px;
  object-fit: cover;
`;

const Body = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: center;
  flex: 1;
  height: 100%;
  align-self: stretch;
  box-sizing: border-box;
`;
