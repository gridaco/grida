import { useEffect, useState } from "react";
import { designToCode, Result } from "@designto/code";
import { config } from "@grida/builder-config";
import {
  ImageRepository,
  MainImageRepository,
} from "@design-sdk/asset-repository";
import { useEditorState } from "core/states";
import { RemoteImageRepositories } from "@design-sdk/figma-remote/asset-repository";
import { useTargetContainer } from "hooks/use-target-node";
import { useFigmaImageService } from "scaffolds/editor";
import { usePreferences } from "@code-editor/preferences";
import assert from "assert";

export function useCode() {
  const [result, setResult] = useState<Result>();
  const { config: preferences } = usePreferences();
  const [state] = useEditorState();
  const resolver = useFigmaImageService();
  const enable_components =
    preferences.experimental.preview_feature_components_support === "enabled";
  const framework_config = preferences.framework;

  const { target: targetted, root } = useTargetContainer();

  const on_result = (result: Result) => {
    setResult(result);
  };

  useEffect(() => {
    assert(framework_config, "framework config is not set");

    const __target = targetted;
    const __framework_config = framework_config;
    if (__target && __framework_config) {
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
        repository: root.repository,
      };
      const build_config = {
        ...config.default_build_configuration,
        disable_components: !enable_components,
      };

      // build final code with asset fetch
      if (!MainImageRepository.instance.empty) {
        designToCode({
          input: _input,
          framework: __framework_config,
          asset_config: {
            asset_repository: MainImageRepository.instance,
            resolver: ({ keys: key }) =>
              resolver.fetch(key, { ensure: true, debounce: false }),
          },
          build_config: build_config,
        })
          .then(on_result)
          .catch(console.error);
      }
    }
  }, [targetted?.id, framework_config.framework]);

  return result;
}
