import { designToCode } from "@designto/code";
import {
  ImageRepository,
  MainImageRepository,
} from "@design-sdk/asset-repository";
import { RemoteImageRepositories } from "@design-sdk/figma-remote/asset-repository";
import { config } from "@grida/builder-config";
import { preview_presets } from "@grida/builder-config-preset";
import { FigmaFileStore } from "@editor/figma-file-store";
import { convert } from "@design-sdk/figma-node-conversion";
import { mapper } from "@design-sdk/figma-remote";

const placeholderimg =
  "https://bridged-service-static.s3.us-west-1.amazonaws.com/placeholder-images/image-placeholder-bw-tile-100.png";

/**
 * @type {config.BuildConfiguration}
 */
const build_config = {
  ...config.default_build_configuration,
  disable_components: true,
  disable_detection: true,
  disable_flags_support: true,
};

/**
 * @type {config.VanillaPreviewFrameworkConfig}
 */
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

let initialized = false;
let pages = [];

function initialize({ filekey, authentication }) {
  console.info("initializing.. wwpreview");
  // ------- setup image repo with auth + filekey -------
  MainImageRepository.instance = new RemoteImageRepositories(filekey, {
    authentication: authentication,
  });

  MainImageRepository.instance.register(
    new ImageRepository(
      "fill-later-assets",
      "grida://assets-reservation/images/"
    )
  );
  // ----------------------------------------------------

  // setup indexed db connection for reading the file.
  // ⛔️ the assumbtion is that file does not change during the app is running.

  const store = new FigmaFileStore(filekey);
  // 1. read the raw data from indexed db
  store.get().then((raw) => {
    // 2. format the data to reflect
    pages = pagesFrom(raw);

    // 3. set the data status as 'ready'
    initialized = true;
    postMessage({ $type: "data-ready" });
  });
  // (the below requests can be operated after when this processes are complete)
}

function pagesFrom(file) {
  return file.document.children.map((page) => ({
    id: page.id,
    name: page.name,
    children: page["children"]?.map((child) => {
      const _mapped = mapper.mapFigmaRemoteToFigma(child);
      return convert.intoReflectNode(_mapped);
    }),
    flowStartingPoints: page.flowStartingPoints,
    backgroundColor: page.backgroundColor,
    type: "canvas",
  }));
}

addEventListener("message", async (event) => {
  function respond(data) {
    setTimeout(() => {
      postMessage({ $type: "result", ...data });
    }, 0);
  }

  if (event.data.$type === "initialize") {
    initialize({
      filekey: event.data.filekey,
      authentication: event.data.authentication,
    });
    return;
  }

  if (!initialized) {
    return;
  }

  switch (event.data.$type) {
    case "initialize": {
      // unreachable
      break;
    }
    case "preview": {
      try {
        // requires all 2 data for faster query
        const { page, target } = event.data;
        const node = pages
          .find((p) => p.id === page)
          .children.find((c) => c.id === target);

        const _input = {
          id: node.id,
          name: node.name,
          entry: node,
        };

        const result = await designToCode({
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

        respond(result);

        const result_w_img = await designToCode({
          input: _input,
          build_config: build_config,
          framework: framework_config,
          asset_config: {
            asset_repository: MainImageRepository.instance,
          },
        });

        respond(result_w_img);
      } catch (error) {
        // respond({ error });
      }

      break;
    }
  }
});
