import { k } from "@designto/react";
import React from "react";
import { CodeSandBoxView } from "./code-sandbox-runner";

export function ReactAppRunner(props: {
  source: string;
  width: string | number;
  height: string | number;
  componentName: string;
}) {
  return (
    <>
      <CodeSandBoxView
        sandbox={{
          files: {
            "App.tsx": {
              content: k.create_react_app_typescript_starter.app_tsx(
                props.source
              ),
              isBinary: false,
            },
            "index.tsx": {
              content: k.create_react_app_typescript_starter.index_tsx(
                props.componentName
              ),
              isBinary: false,
            },
            "tsconfig.json": {
              content: k.create_react_app_typescript_starter.tsconfig_json,
              isBinary: false,
            },
            "package.json": {
              content: k.create_react_app_typescript_starter.package_json,
              isBinary: false,
            },
          },
          template: k.create_react_app_typescript_starter.template as any,
        }}
        width={props.width}
        height={props.height}
      />
    </>
  );
}
