import React, { useCallback, useEffect, useMemo } from "react";
import { useEditorState } from "core/states";
import { preview_presets } from "@grida/builder-config-preset";
import { designToCode, Result } from "@designto/code";
import { config } from "@designto/config";
import { MainImageRepository } from "@design-sdk/core/assets-repository";
import bundler from "@code-editor/esbuild-services";
import assert from "assert";
import { useDispatch } from "core/dispatch";
import { useTargetContainer } from "hooks";
import { WidgetKey } from "@reflect-ui/core";

const esbuild_base_html_code = `<div id="root"></div>`;

/**
 * This is a queue handler of d2c requests.
 * Since the d2c can share cache and is a async process, we need this middleware wrapper to handle it elegantly.
 * @returns
 */
export function EditorPreviewDataProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // listen to changes
  // handle changes, dispatch with results

  const [state] = useEditorState();
  const dispatch = useDispatch();

  const { target, root } = useTargetContainer();

  const updateBuildingState = useCallback(
    (isBuilding: boolean) => {
      dispatch({
        type: "preview-update-building-state",
        isBuilding,
      });
    },
    [dispatch]
  );

  const onVanillaPreviewResult = useCallback(
    (result: Result, isAssetUpdate?: boolean) => {
      dispatch({
        type: "preview-set",
        data: {
          loader: "vanilla-html",
          viewtype: "unknown",
          widgetKey: result.widget.key,
          componentName: result.name,
          fallbackSource: result.scaffold.raw,
          source: result.scaffold.raw,
          initialSize: {
            width: result.widget?.["width"],
            height: result.widget?.["height"],
          },
          isBuilding: false,
          meta: {
            bundler: "vanilla",
            framework: result.framework.framework,
            reason: isAssetUpdate ? "fill-assets" : "initial",
          },
          updatedAt: Date.now(),
        },
      });
    },
    [dispatch]
  );

  const onEsbuildReactPreviewResult = useCallback(
    ({
      key,
      initialSize,
      bundledjs,
      componentName,
    }: {
      key: WidgetKey;
      initialSize: { width: number; height: number };
      bundledjs: string;
      componentName: string;
    }) => {
      dispatch({
        type: "preview-set",
        data: {
          loader: "vanilla-esbuild-template",
          viewtype: "unknown",
          widgetKey: key,
          componentName: componentName,
          fallbackSource: state.currentPreview?.fallbackSource,
          source: {
            html: esbuild_base_html_code,
            javascript: bundledjs,
          },
          initialSize: initialSize,
          isBuilding: false,
          meta: {
            bundler: "esbuild-wasm",
            framework: "react",
            reason: "update",
          },
          updatedAt: Date.now(),
        },
      });
    },
    [dispatch]
  );

  const _is_mode_requires_preview_build =
    state.canvasMode === "fullscreen-preview" ||
    state.canvasMode === "isolated-view";

  useEffect(() => {
    if (!_is_mode_requires_preview_build) {
      return;
    }

    if (!MainImageRepository.isReady) {
      return;
    }

    if (!target) {
      return;
    }

    const _input = {
      id: target.id,
      name: target.name,
      entry: target,
    };

    const build_config = {
      ...config.default_build_configuration,
      disable_components: true,
    };

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
      .then(onVanillaPreviewResult)
      .catch(console.error);

    if (!MainImageRepository.instance.empty) {
      updateBuildingState(true);
      designToCode({
        input: root,
        build_config: build_config,
        framework: preview_presets.default,
        asset_config: { asset_repository: MainImageRepository.instance },
      })
        .then((r) => {
          onVanillaPreviewResult(r, true);
        })
        .catch(console.error)
        .finally(() => {
          updateBuildingState(false);
        });
    }
  }, [_is_mode_requires_preview_build, target?.id]);

  //   // ------------------------
  //   // ------ for esbuild -----
  useEffect(() => {
    if (
      !target ||
      !state.editingModule ||
      // now only react is supported.
      state.editingModule.framework !== "react"
    ) {
      return;
    }

    const { raw, componentName } = state.editingModule;
    assert(componentName, "component name is required");
    assert(raw, "raw input code is required");
    updateBuildingState(true);
    bundler(transform(raw, componentName), "tsx")
      .then((d) => {
        if (d.err == null) {
          if (d.code) {
            onEsbuildReactPreviewResult({
              key: new WidgetKey({
                originName: target.name,
                id: target.id,
              }),
              initialSize: {
                width: target.width,
                height: target.height,
              },
              bundledjs: d.code,
              componentName: componentName,
            });
          }
        }
      })
      .finally(() => {
        updateBuildingState(false);
      });
  }, [state.editingModule?.framework, state.editingModule?.raw]);

  return <>{children}</>;
}

// function esbuildit(state: EditorState) {

// }

const transform = (s, n) => {
  return `import React from 'react'; import ReactDOM from 'react-dom';
${s}
const App = () => <><${n}/></>
ReactDOM.render(<App />, document.querySelector('#root'));`;
};
