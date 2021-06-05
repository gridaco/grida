import React from "react";
import { CodeSandBoxView } from "./code-sandbox-runner";

export function ReactAppRunner(props: {
  source: string;
  width: string | number;
  height: string | number;
  componentName;
}) {
  return (
    <>
      <CodeSandBoxView
        componentName={props.componentName}
        src={props.source}
        width={props.width}
        height={props.height}
      />
    </>
  );
}
