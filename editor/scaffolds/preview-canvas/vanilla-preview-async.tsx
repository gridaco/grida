import React, { useEffect, useState } from "react";
import { config } from "@grida/builder-config";
import { preview_presets } from "@grida/builder-config-preset";
import { designToCode, Result } from "@designto/code";
import { MainImageRepository } from "@design-sdk/asset-repository";
import { cachekey, cache } from "./cache";
import { blurred_bg_fill } from "./util";
import { PreviewContent } from "./preview-content";
import type { VanillaPreviewProps } from "./prop-type";

const placeholderimg =
  "https://bridged-service-static.s3.us-west-1.amazonaws.com/placeholder-images/image-placeholder-bw-tile-100.png";

const build_config: config.BuildConfiguration = {
  ...config.default_build_configuration,
  disable_components: true,
  disable_detection: true,
  disable_flags_support: true,
};

const framework_config: config.VanillaPreviewFrameworkConfig = {
  ...preview_presets.default,
  additional_css_declaration: {
    declarations: [
      {
        key: {
          name: "body",
          selector: "tag",
        },
        style: {
          contain: "layout style paint",
        },
      },
    ],
  },
};

export function D2CVanillaPreview({
  target,
  isZooming,
  isPanning,
}: VanillaPreviewProps) {
  const [preview, setPreview] = useState<Result>();
  const key = cachekey(target);

  const on_preview_result = (result: Result, __image: boolean) => {
    if (preview) {
      if (preview.code === result.code) {
        return;
      }
    }
    setPreview(result);
    cache.set(target.filekey as string, { ...result, __image });
  };

  const hide_preview = isZooming || isPanning;

  useEffect(() => {
    if (hide_preview) {
      // don't make preview if zooming.
      return;
    }

    if (preview) {
      return;
    }

    const d2c_firstload = () => {
      return designToCode({
        input: _input,
        build_config: build_config,
        framework: framework_config,
        asset_config: {
          skip_asset_replacement: false,
          asset_repository: MainImageRepository.instance,
          custom_asset_replacement: {
            type: "static",
            resource: placeholderimg,
          },
        },
      });
    };

    const d2c_imageload = () => {
      if (!MainImageRepository.instance.empty) {
        designToCode({
          input: _input,
          build_config: build_config,
          framework: framework_config,
          asset_config: { asset_repository: MainImageRepository.instance },
        })
          .then((r) => {
            on_preview_result(r, true);
          })
          .catch((e) => {
            console.error(
              "error while making preview with image repo provided.",
              e
            );
          });
      }
    };

    const _input = target
      ? {
          id: target.id,
          name: target.name,
          entry: target,
        }
      : null;

    const cached = cache.get(key);
    if (cached) {
      setPreview(cached);
      if (cached.__image) {
        return;
      }
      if (_input) {
        d2c_imageload();
      }
    } else {
      if (_input) {
        d2c_firstload()
          .then((r) => {
            on_preview_result(r, false);
            // if the result contains a image and needs to be fetched,
            if (r.code.raw.includes(placeholderimg)) {
              // TODO: we don't yet have other way to know if image is used, other than checking if placeholder image is used. - this needs to be updated in d2c module to include used images meta in the result.
              d2c_imageload();
            }
          })
          .catch(console.error);
      }
    }
  }, [target?.id, isZooming, isPanning]);

  const bg_color_str = blurred_bg_fill(target);

  return (
    <PreviewContent
      id={target.id}
      name={target.name}
      source={preview?.scaffold?.raw}
      width={target.width}
      height={target.height}
      backgroundColor={
        !preview && bg_color_str // clear bg after preview is rendered.
      }
    />
  );
}
