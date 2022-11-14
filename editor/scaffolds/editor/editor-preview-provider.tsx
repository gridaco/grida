import React, { useCallback, useEffect, useMemo } from "react";
import { useEditorState } from "core/states";
import { usePreferences } from "@code-editor/preferences";
import { useTargetContainer } from "hooks";
import { useDispatch } from "core/dispatch";
import { preview_presets } from "@grida/builder-config-preset";
import { designToCode, Result } from "@designto/code";
import { config } from "@grida/builder-config";
import { MainImageRepository } from "@design-sdk/asset-repository";
import { WidgetKey } from "@reflect-ui/core";
import { supportsPreview } from "config";
import { stable as dartservices } from "dart-services";
import Client, { FlutterProject } from "@flutter-daemon/client";
import bundler from "@code-editor/esbuild-services";

const esbuild_base_html_code = `<div id="root"></div>`;

const flutter_bundler: "dart-services" | "flutter-daemon" = "flutter-daemon";

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

  const { config: preferences } = usePreferences();
  const [state] = useEditorState();
  const dispatch = useDispatch();

  const { sceneId: targetid, entry } = state.code.runner || {};
  const { files } = state.code;
  const { target, root } = useTargetContainer(targetid);

  const updateBuildingState = useCallback(
    (isBuilding: boolean) => {
      dispatch({
        type: "preview-update-building-state",
        isBuilding,
      });
    },
    [dispatch]
  );

  const onInitialVanillaPreviewResult = useCallback(
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

  const onVanillaPreviewResult = useCallback(
    ({
      key,
      initialSize,
      raw,
    }: {
      key: WidgetKey;
      initialSize: { width: number; height: number };
      raw: string;
    }) => {
      dispatch({
        type: "preview-set",
        data: {
          loader: "vanilla-html",
          viewtype: "unknown",
          widgetKey: key,
          componentName: target.name,
          fallbackSource: raw,
          source: raw,
          initialSize: initialSize,
          isBuilding: false,
          meta: {
            bundler: "vanilla",
            framework: "vanilla",
            reason: "update",
          },
          updatedAt: Date.now(),
        },
      });
    },
    [dispatch, target]
  );

  const onEsbuildReactPreviewResult = useCallback(
    ({
      key,
      initialSize,
      bundledjs,
    }: {
      key: WidgetKey;
      initialSize: { width: number; height: number };
      bundledjs: string;
    }) => {
      dispatch({
        type: "preview-set",
        data: {
          loader: "vanilla-esbuild-template",
          viewtype: "unknown",
          widgetKey: key,
          componentName: target.name,
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
      consoleLog({
        method: "info",
        data: ["compiled esbuild-react", key, target.name],
      });
    },
    [dispatch, target]
  );

  const onDartServicesFlutterBuildComplete = useCallback(
    ({
      key,
      js,
      initialSize,
    }: {
      key: WidgetKey;
      js: string;
      initialSize: { width: number; height: number };
    }) => {
      dispatch({
        type: "preview-set",
        data: {
          loader: "vanilla-flutter-template",
          viewtype: "unknown",
          widgetKey: key,
          componentName: target.name,
          fallbackSource: state.currentPreview?.fallbackSource,
          source: js,
          initialSize: initialSize,
          isBuilding: false,
          meta: {
            bundler: "dart-services",
            framework: "flutter",
            reason: "update",
          },
          updatedAt: Date.now(),
        },
      });
      consoleLog({
        method: "info",
        data: ["compiled flutter app", key, target.name],
      });
    },
    [dispatch, target]
  );

  const onFlutterDaemonBuildComplete = useCallback(
    ({
      key,
      initialSize,
      source,
    }: {
      key: WidgetKey;
      initialSize: { width: number; height: number };
      source: string;
    }) => {
      dispatch({
        type: "preview-set",
        data: {
          loader: "flutter-daemon-view",
          viewtype: "unknown",
          widgetKey: key,
          componentName: target.name,
          fallbackSource: state.currentPreview?.fallbackSource,
          source: source,
          initialSize: initialSize,
          isBuilding: false,
          meta: {
            bundler: "flutter-daemon",
            framework: "flutter",
            reason: "update",
          },
          updatedAt: Date.now(),
        },
      });
    },
    [dispatch, target]
  );

  const consoleLog = useCallback(
    (p: { method; data }) => {
      dispatch({
        type: "devtools-console",
        log: p,
      });
    },
    [dispatch]
  );

  const _is_mode_requires_preview_build = state.mode.value === "code";

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
      .then(onInitialVanillaPreviewResult)
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
          onInitialVanillaPreviewResult(r, true);
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
    if (!preferences.framework) {
      return;
    }
    if (!state.code.runner) {
      return;
    }
    if (supportsPreview(preferences.framework.framework)) {
      try {
        updateBuildingState(true);

        const wkey = new WidgetKey({
          originName: target.name,
          id: target.id,
        });

        const initialSize = {
          width: target.width,
          height: target.height,
        };

        switch (preferences.framework.framework) {
          case "react": {
            bundler({
              files: Object.keys(files).reduce((acc, key) => {
                acc[key] = files[key].content;
                return acc;
              }, {}),
              entry: entry,
            })
              .then((d) => {
                if (d.err == null) {
                  if (d.code) {
                    onEsbuildReactPreviewResult({
                      key: wkey,
                      initialSize: initialSize,
                      bundledjs: d.code,
                    });
                  }
                } else {
                  consoleLog({ ...d.err });
                }
              })
              .catch((e) => {
                consoleLog({ method: "error", data: [e.message] });
              })
              .finally(() => {
                updateBuildingState(false);
              });
            break;
          }
          case "vanilla": {
            onVanillaPreviewResult({
              key: wkey,
              initialSize,
              raw: state.code.files[state.code.runner.entry].content,
            });
            break;
          }
          case "flutter": {
            // TODO: currnetly, we don't support multi file compile for flutter
            const main = state.code.files[state.code.runner.entry].content;

            is_daemon_running(local_flutter_daemon_server_url).then(
              (daemon_available) => {
                consoleLog({
                  method: "info",
                  data: ["running flutter app with local daemon"],
                });
                if (daemon_available) {
                  FlutterDaemon.instance.initProject(main).then(() => {
                    setTimeout(() => {
                      FlutterDaemon.instance.save(main).then(() => {
                        FlutterDaemon.instance.webLaunchUrl().then((url) => {
                          updateBuildingState(false);
                          onFlutterDaemonBuildComplete({
                            key: wkey,
                            source: url,
                            initialSize: initialSize,
                          });
                        });
                      });
                    }, 500);
                  });
                } else {
                  dartservices
                    .compileComplete(main)
                    .then((r) => {
                      if (!r.error) {
                        onDartServicesFlutterBuildComplete({
                          key: wkey,
                          initialSize: initialSize,
                          js: r.result,
                        });
                      } else {
                        consoleLog({ method: "error", data: [r.error] });
                      }
                    })
                    .catch((e) => {
                      consoleLog({ method: "error", data: [e.message] });
                    })
                    .finally(() => {
                      updateBuildingState(false);
                    });
                }
              }
            );
            break;
          }
          default:
            throw new Error(
              `Unsupported framework: ${preferences.framework.framework}`
            );
        }
      } catch (e) {
        console.error(e);
      }
    }
  }, [JSON.stringify(state.code.files), entry, preferences.framework]);

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

function is_daemon_running(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    var ws = new WebSocket(url);
    ws.addEventListener("error", (e) => {
      // @ts-ignore
      if (e.target.readyState === 3) {
        resolve(false);
      }
    });
    ws.addEventListener("open", () => {
      resolve(true);
      ws.close();
    });
  });
}

const local_flutter_daemon_server_url = "ws://localhost:43070";

class FlutterDaemon {
  private static _instance: FlutterDaemon;
  static get instance() {
    if (!FlutterDaemon._instance) {
      FlutterDaemon._instance = new FlutterDaemon();
    }
    return FlutterDaemon._instance;
  }
  static client: Client;
  static project: FlutterProject;
  constructor() {
    if (!FlutterDaemon.client) {
      FlutterDaemon.client = new Client(local_flutter_daemon_server_url);
    }
  }

  async initProject(initial: string) {
    if (!FlutterDaemon.project) {
      FlutterDaemon.project = await FlutterDaemon.client.project(
        "preview",
        "preview",
        { "lib/main.dart": initial }
      );
    }
    return FlutterDaemon.project;
  }

  async save(content) {
    await FlutterDaemon.project.writeFile("lib/main.dart", content, true);
  }

  async webLaunchUrl() {
    return await FlutterDaemon.project.webLaunchUrl();
  }
}
