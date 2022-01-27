import React, { useEffect, useState } from "react";
import { vanilla_presets } from "@grida/builder-config-preset";
import { designToCode, Result } from "@designto/code";
import { config } from "@designto/config";
import {
  ImageRepository,
  MainImageRepository,
} from "@design-sdk/core/assets-repository";
import type { ReflectSceneNode } from "@design-sdk/figma-node";
import { VanillaRunner } from "components/app-runner/vanilla-app-runner";
import { colorFromFills } from "@design-sdk/core/utils/colors";

export function Preview({ target }: { target: ReflectSceneNode }) {
  const [preview, setPreview] = useState<Result>();

  const on_preview_result = (result: Result) => {
    setPreview(result);
  };

  useEffect(() => {
    const __target = target; // root.entry;
    if (__target) {
      const _input = {
        id: __target.id,
        name: __target.name,
        entry: __target,
      };
      const build_config: config.BuildConfiguration = {
        ...config.default_build_configuration,
        disable_components: true,
        disable_detection: true,
        disable_flags_support: true,
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
        .catch((e) => {
          console.error("error while making first paint preview.", e);
        });

      if (!MainImageRepository.instance.empty) {
        designToCode({
          input: _input,
          build_config: build_config,
          framework: vanilla_presets.vanilla_default,
          asset_config: { asset_repository: MainImageRepository.instance },
        })
          .then(on_preview_result)
          .catch((e) => {
            console.error(
              "error while making preview with image repo provided.",
              e
            );
          });
      }
    }
  }, [target?.id]);

  const bg = colorFromFills(target.fills);

  if (!preview) {
    return (
      <div
        style={{
          width: target.width,
          height: target.height,
          backgroundColor: bg ? "#" + bg.hex : "transparent",
          borderRadius: 1,
        }}
      />
    );
  }

  return (
    <VanillaRunner
      key={preview.scaffold.raw}
      style={{
        borderRadius: 1,
      }}
      source={preview.scaffold.raw}
      width="100%"
      height="100%"
      componentName={preview.name}
    />
  );
}
