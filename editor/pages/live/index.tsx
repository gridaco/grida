import React, { useState, useEffect } from "react";
import Pusher from "pusher-js";
import LoadingLayout from "layouts/loading-overlay";
import { useFigmaNode } from "hooks";
import { designToCode, Result } from "@designto/code";
import { TargetNodeConfig } from "../../query/target-node";
import {
  WorkspaceContentPanel,
  WorkspaceContentPanelGridLayout,
} from "layouts/panel";
import { PreviewAndRunPanel } from "components/preview-and-run";
import { CodeEditor } from "components/code-editor";
import {
  ImageRepository,
  MainImageRepository,
} from "@design-sdk/asset-repository";
import { RemoteImageRepositories } from "@design-sdk/figma-remote/asset-repository";
import { DesignInput } from "@grida/builder-config/input";
import { config, FrameworkConfig, output } from "@grida/builder-config";
import {
  react_presets,
  flutter_presets,
  vanilla_presets,
} from "@grida/builder-config-preset";
import {} from "hooks";

const _base_url =
  "https://ahzdf5x4q3.execute-api.us-west-1.amazonaws.com/production"; // "https://assistant-live-session.grida.cc";

const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY, {
  // 'live-session-from-assistant'
  cluster: "us3",
  authEndpoint: _base_url + "/pusher/auth",
});

export default function LiveSessionPage() {
  // const [channel, setChannel] = useState<string>();
  const [lastmessage, setLastmessage] = useState<string>();
  const [filekey, setFilekey] = useState<string>();
  const [nodeid, setNodeid] = useState<string>();

  useEffect(() => {
    // TODO: - add auth guard

    // subscribe once wheb the page is loaded
    const subscription = pusher.subscribe("private-live-session"); // channel
    subscription.bind("client-select", (d) => {
      console.log(d);
      setLastmessage(JSON.stringify(d));
      setFilekey(d.filekey);
      setNodeid(d.node);
    });
  }, []);

  return (
    <div>
      {lastmessage ? (
        <div key={filekey + nodeid}>
          <DesignProxyPage file={filekey} node={nodeid} />
        </div>
      ) : (
        <>
          <LoadingLayout
            title="Select design on figma"
            content="Design selected on figma will be displayed here. On Assistant, Menu - Live - Connect"
          />
        </>
      )}
    </div>
  );
}

function DesignProxyPage({ file, node }: { file: string; node: string }) {
  const design = useFigmaNode({
    type: "use-file-node-id",
    file: file,
    node: node,
    use_session_cache: true,
  });

  console.log("design", design);

  if (design) {
    return <ResultProxyPage design={design} />;
  } else {
    return <LoadingLayout />;
  }
}

function ResultProxyPage({ design }: { design: TargetNodeConfig }) {
  const [result, setResult] = useState<Result>();
  const [preview, setPreview] = useState<Result>();

  const framework_config = react_presets.react_default;
  const preview_runner_framework = vanilla_presets.vanilla_default;

  useEffect(() => {
    const { reflect, raw } = design;
    const { id, name } = reflect;
    // ------------------------------------------------------------
    // other platforms are not supported yet
    // set image repo for figma platform
    MainImageRepository.instance = new RemoteImageRepositories(design.file);
    MainImageRepository.instance.register(
      new ImageRepository(
        "fill-later-assets",
        "grida://assets-reservation/images/"
      )
    );
    // ------------------------------------------------------------
    designToCode({
      input: DesignInput.fromApiResponse({ entry: reflect, raw }),
      framework: framework_config,
      asset_config: { asset_repository: MainImageRepository.instance },
      build_config: {
        ...config.default_build_configuration,
        disable_components: true,
      },
    }).then((result) => {
      setResult(result);
    });
    // ----- for preview -----
    designToCode({
      input: {
        id: id,
        name: name,
        entry: reflect,
      },
      build_config: {
        ...config.default_build_configuration,
        disable_components: true,
      },
      framework: preview_runner_framework,
      asset_config: { asset_repository: MainImageRepository.instance },
    }).then((result) => {
      setPreview(result);
    });
  }, []);

  if (!result || !preview) {
    return <LoadingLayout />;
  }

  const { code, scaffold, name: componentName } = result;
  return (
    <WorkspaceContentPanelGridLayout>
      <WorkspaceContentPanel disableBorder>
        <PreviewAndRunPanel
          key={design.url ?? design.reflect?.id}
          config={{
            src: preview.scaffold.raw,
            platform: preview_runner_framework.framework,
            componentName: componentName,
            sceneSize: {
              w: design.reflect?.width,
              h: design.reflect?.height,
            },
            initialMode: "run",
            fileid: design.file,
            sceneid: design.node,
          }}
        />
      </WorkspaceContentPanel>
      <WorkspaceContentPanel key={design.node} disableBorder>
        <CodeEditor
          // key={code.raw}
          height="100vh"
          options={{
            automaticLayout: true,
          }}
          files={{
            "index.tsx": {
              raw: code
                ? code.raw
                : "// No input design provided to be converted..",
              language: framework_config.language,
              name: "index.tsx",
            },
          }}
        />
      </WorkspaceContentPanel>
    </WorkspaceContentPanelGridLayout>
  );
}
