import React, { useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import { useRouter } from "next/router";
import { CodeEditor } from "components/code-editor";
import { get_framework_config } from "query/to-code-options-from-query";
import { CodeOptionsControl } from "components/codeui-code-options-control";
import { designToCode, Result } from "@designto/code";
import { config } from "@grida/builder-config";
import {
  ImageRepository,
  MainImageRepository,
} from "@design-sdk/asset-repository";
import { useEditorState, useWorkspaceState } from "core/states";
import { useDispatch } from "core/dispatch";
import type { ReflectSceneNode } from "@design-sdk/figma-node";
import { RemoteImageRepositories } from "@design-sdk/figma-remote/asset-repository";
import { useTargetContainer } from "hooks/use-target-node";
import assert from "assert";
import { debounce } from "utils/debounce";
import { supportsScripting } from "config";
import ClientOnly from "components/client-only";

const preset_store = {
  get: () => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("code-options-contro-preset");
    }
  },
  set: (name: string) => {
    typeof window !== "undefined" &&
      localStorage.setItem("code-options-contro-preset", name);
  },
};

export function Code() {
  const router = useRouter();
  const [result, setResult] = useState<Result>();
  const dispatch = useDispatch();
  const wstate = useWorkspaceState();
  const [state] = useEditorState();
  const [framework_config, set_framework_config] = useState(
    wstate.preferences.framework_config
  );

  const { target: targetted, root } = useTargetContainer();

  const enable_components =
    wstate.preferences.enable_preview_feature_components_support;

  const targetStateRef =
    useRef<{
      node: ReflectSceneNode;
      config: config.FrameworkConfig;
    }>();
  targetStateRef.current = { node: targetted, config: framework_config };

  const on_result = (result: Result) => {
    if (
      result.framework.framework !==
        targetStateRef?.current?.config.framework ||
      result.id !== targetStateRef?.current?.node?.id
    ) {
      return;
    }

    setResult(result);
  };

  useEffect(() => {
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

      // build code without assets fetch
      designToCode({
        input: _input,
        framework: __framework_config,
        asset_config: { skip_asset_replacement: true },
        build_config: build_config,
      })
        .then(on_result)
        .catch(console.error);

      // build final code with asset fetch
      if (!MainImageRepository.instance.empty) {
        designToCode({
          input: root,
          framework: __framework_config,
          asset_config: { asset_repository: MainImageRepository.instance },
          build_config: build_config,
        })
          .then(on_result)
          .catch(console.error);
      }
    }
  }, [targetted?.id, framework_config]);

  const onChangeHandler = debounce((k, code) => {
    if (!result) {
      return;
    }
    if (!targetted) {
      return;
    }

    // currently react and vanilla are supported
    if (supportsScripting(framework_config.framework)) {
      dispatch({
        type: "code-editor-edit-component-code",
        framework: framework_config.framework,
        componentName: result.name,
        id: targetted.id,
        raw: code,
      });
    }
  }, 500);

  const { code, scaffold, name: componentName, framework } = result ?? {};
  return (
    <CodeEditorContainer>
      <ClientOnly>
        <CodeOptionsControl
          initialPreset={
            (router.query.framework as string) ?? preset_store.get()
          }
          fallbackPreset="react_default"
          onUseroptionChange={(o) => {
            preset_store.set(o.framework);
            let c;
            switch (o.framework) {
              case "react": {
                switch (o.styling) {
                  case "styled-components":
                    c = get_framework_config("react-with-styled-components");
                    break;
                  case "inline-css":
                    c = get_framework_config("react-with-inline-css");
                    break;
                  case "css-module":
                    c = get_framework_config("react-with-css-module");
                    break;
                  case "css":
                    // TODO:
                    break;
                }
                break;
              }
              case "react-native": {
                switch (o.styling) {
                  case "style-sheet":
                    c = get_framework_config("react-native-with-style-sheet");
                    break;
                  case "styled-components":
                    c = get_framework_config(
                      "react-native-with-styled-components"
                    );
                    break;
                  case "inline-style":
                    c = get_framework_config("react-native-with-inline-style");
                    break;
                }
                break;
              }
              case "solid-js": {
                switch (o.styling) {
                  case "styled-components":
                    c = get_framework_config("solid-with-styled-components");
                    break;
                  case "inline-css": {
                    c = get_framework_config("solid-with-inline-css");
                    break;
                  }
                }
                break;
              }
              case "flutter":
                c = get_framework_config(o.framework);
                break;
              case "vanilla":
                c = get_framework_config(o.framework);
                break;
            }

            assert(c);
            set_framework_config(c);
          }}
        />
      </ClientOnly>
      <CodeEditor
        key={code?.raw}
        height="100vh"
        options={{
          automaticLayout: true,
        }}
        onChange={onChangeHandler}
        files={
          code
            ? {
                // TODO: make this to match framework
                [filename[framework.framework]]: {
                  raw: scaffold.raw,
                  language: framework_config.language,
                  name: filename[framework.framework],
                },
              }
            : {
                loading: {
                  raw: "\n".repeat(100),
                  language: "text",
                  name: "loading",
                },
              }
        }
      />
    </CodeEditorContainer>
  );
}

const filename = {
  vanilla: "index.html",
  react: "app.tsx",
  "solid-js": "app.tsx",
  vue: "app.vue",
  flutter: "main.dart",
} as const;

const CodeEditorContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
`;
