import React, { useEffect, useState } from "react";
import { preview_presets } from "@grida/builder-config-preset";
import { designToCode, Result } from "@designto/code";
import { config } from "@designto/config";
import { MainImageRepository } from "@design-sdk/core/assets-repository";
import { VanillaRunner } from "components/app-runner/vanilla-app-runner";
import { IsolatedCanvas } from "components/canvas";
import { PreviewAndRunPanel } from "components/preview-and-run";
import { useEditorState } from "core/states";
import { useTargetContainer } from "hooks";
import { Dialog } from "@material-ui/core";
import { FullScreenPreview } from "scaffolds/preview-full-screen";

export function IsolateModeCanvas({ onClose }: { onClose: () => void }) {
  const [state] = useEditorState();
  const [preview, setPreview] = useState<Result>();
  const [fullscreen, setFullscreen] = useState(false);

  const { target, root } = useTargetContainer();

  const on_preview_result = (result: Result) => {
    //@ts-ignore
    // if (result.id == targetStateRef?.current?.id) {
    setPreview(result);
    // }
  };

  useEffect(() => {
    const __target = target; // root.entry;
    if (__target) {
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
        framework: preview_presets.default,
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
          input: root,
          build_config: build_config,
          framework: preview_presets.default,
          asset_config: { asset_repository: MainImageRepository.instance },
        })
          .then(on_preview_result)
          .catch(console.error);
      } else {
        console.error("MainImageRepository is empty");
      }
    }
  }, [target?.id]);

  return (
    <>
      <Dialog
        fullScreen
        onClose={() => {
          setFullscreen(false);
        }}
        open={fullscreen}
      >
        <FullScreenPreview
          onClose={() => {
            setFullscreen(false);
          }}
        />
      </Dialog>

      <IsolatedCanvas
        key={target?.id}
        onExit={onClose}
        onFullscreen={() => {
          setFullscreen(true);
        }}
        defaultSize={{
          width: target?.width ?? 375,
          height: target?.height ?? 812,
        }}
      >
        {preview ? (
          <VanillaRunner
            key={preview.scaffold.raw}
            style={{
              borderRadius: 4,
              boxShadow: "0px 0px 48px #00000020",
            }}
            source={preview.scaffold.raw}
            width="100%"
            height="100%"
            componentName={preview.name}
          />
        ) : (
          <EditorCanvasSkeleton />
        )}
      </IsolatedCanvas>
    </>
  );
}

const EditorCanvasSkeleton = () => {
  return (
    <PreviewAndRunPanel
      config={{
        src: "",
        platform: "vanilla",
        componentName: "loading",
        sceneSize: {
          w: 375,
          h: 812,
        },
        initialMode: "run",
        fileid: "loading",
        sceneid: "loading",
        hideModeChangeControls: true,
      }}
    />
  );
};
