import React from "react";
import { CodeSandBoxView } from "./code-sandbox-runner";

export function ReactAppRunner(props: { source: string }) {
  return (
    <>
      <CodeSandBoxView source={props.source} />
    </>
  );
}
