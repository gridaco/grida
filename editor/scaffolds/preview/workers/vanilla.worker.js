import { designToCode } from "@designto/code";
import {
  ImageRepository,
  MainImageRepository,
} from "@design-sdk/asset-repository";
import { RemoteImageRepositories } from "@design-sdk/figma-remote/asset-repository";
import { config } from "@designto/config";
import { preview_presets } from "@grida/builder-config-preset";

const placeholderimg =
  "https://bridged-service-static.s3.us-west-1.amazonaws.com/placeholder-images/image-placeholder-bw-tile-100.png";

// : config.BuildConfiguration
const build_config = {
  ...config.default_build_configuration,
  disable_components: true,
  disable_detection: true,
  disable_flags_support: true,
};

// : config.VanillaPreviewFrameworkConfig
const framework_config = {
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

addEventListener("message", async (event) => {
  function respond(data) {
    setTimeout(() => {
      postMessage({ type: "response", ...data });
    }, 0);
  }

  try {
    const { input, authentication, filekey } = event.data;

    MainImageRepository.instance = new RemoteImageRepositories(filekey, {
      authentication: authentication,
    });

    MainImageRepository.instance.register(
      new ImageRepository(
        "fill-later-assets",
        "grida://assets-reservation/images/"
      )
    );

    const result = await designToCode({
      input: input,
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

    respond(result);
  } catch (error) {
    respond({ error });
  }
});
