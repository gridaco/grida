import React from "react";
import styled from "@emotion/styled";
import { DevtoolsTab } from "@code-editor/devtools";
import { WindowConsoleFeed } from "@code-editor/devtools";
import { colors } from "theme";

export function Devtools() {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        display: "flex",
        flexDirection: "column",
        background: colors.color_editor_bg_on_dark,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 12,
          padding: 12,
        }}
      >
        <DevtoolsTab label="Console" selected badge={0} />
        <DevtoolsTab label="Problems" badge={0} />
        <DevtoolsTab label="React DevTools" badge={0} />
        <DevtoolsTab label="Properties" badge={0} />
      </div>
      <WindowConsoleFeed
        style={{
          height: 200,
          overflow: "scroll",
        }}
      />
    </div>
  );
}
