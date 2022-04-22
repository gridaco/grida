import React from "react";
import { Console } from "@code-editor/console-feed";
import { useEditorState } from "core/states";

export function EditorConsoleFeed({ style }: { style?: React.CSSProperties }) {
  const [state] = useEditorState();

  return (
    <div style={style}>
      <Console
        logs={state.devtoolsConsole?.logs ?? ([] as any)}
        variant="dark"
      />
    </div>
  );
}
