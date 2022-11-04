import { designToCode } from "@designto/code";
import {
  ImageRepository,
  MainImageRepository,
} from "@design-sdk/asset-repository";
import { RemoteImageRepositories } from "@design-sdk/figma-remote/asset-repository";
import { config } from "@grida/builder-config";
import { preview_presets } from "@grida/builder-config-preset";
import { FigmaFileStore } from "@editor/figma-file";
import { convert } from "@design-sdk/figma-node-conversion";
import { mapper } from "@design-sdk/figma-remote";
import q from "@design-sdk/query";

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

let initialized = false;
let pages = [];

function initialize({ filekey, authentication }) {
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
    data = serialize(data);
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
      respond(await handle_preview(event, "without-asset"));
      respond(await handle_preview(event, "with-asset"));
      break;
    }
    case "code": {
      handle_code(event, "without-asset").then(respond);
      // handle_code(event, "with-asset").then(respond);
      break;
    }
  }
});

function serialize(result) {
  // the widget is a class with a recursive-referencing property, so it shall be removed before posting back to the client.
  delete result["widget"];
  return result;
}

async function handle_preview(event, type) {
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

    switch (type) {
      case "without-asset": {
        return await designToCode({
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
      }
      case "with-asset": {
        return await designToCode({
          input: _input,
          build_config: build_config,
          framework: framework_config,
          asset_config: {
            asset_repository: MainImageRepository.instance,
          },
        });
      }
    }
  } catch (error) {
    // respond({ error });
  }
}

async function handle_code(event, type) {
  const { framework: framework_config } = event.data;

  // requires all 2 data for faster query
  const { target } = event.data;
  const node = q.getNodeByIdFrom(target, pages);

  if (!node) {
    throw new Error("node not found");
  }

  const _input = {
    id: node.id,
    name: node.name,
    entry: node,
  };

  switch (type) {
    case "without-asset": {
      return await designToCode({
        input: _input,
        build_config: build_config,
        framework: framework_config,
        asset_config: {
          skip_asset_replacement: true,
        },
      });
    }
    case "with-asset": {
      return await designToCode({
        input: _input,
        build_config: build_config,
        framework: framework_config,
        asset_config: {
          asset_repository: MainImageRepository.instance,
        },
      });
    }
  }
}
