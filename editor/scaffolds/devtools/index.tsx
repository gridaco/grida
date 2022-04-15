import React, { useState } from "react";
import styled from "@emotion/styled";
import { DevtoolsTab, WindowConsoleFeed } from "@code-editor/devtools";
import { colors } from "theme";
import { Resizable } from "re-resizable";
import { AngleDownIcon } from "icons/icon-angle-down";
import { AngleUpIcon } from "icons/icon-angle-up";
import { TrashIcon } from "icons/icon-trash";

const min_body_height = 120;
const max_body_height = 500;
const precalculated_bar_height = 44;
const expand_default_height = min_body_height + precalculated_bar_height;

export function Devtools() {
  const [expanded, setExpended] = useState(false);
  const [height, setHeight] = useState(precalculated_bar_height);
  return (
    <Resizable
      maxHeight={max_body_height}
      onResizeStart={(e, di) => {
        if (!expanded && di === "top") {
          setExpended(true);
          setHeight(expand_default_height);
        }
      }}
      onResizeStop={(e, di, r, { height: dh }) => {
        const nh = height + dh;
        setHeight(nh);
        if (nh <= precalculated_bar_height) {
          setExpended(false);
        }
      }}
      enable={{
        top: true,
        right: false,
        bottom: false,
        left: false,
      }}
      size={{
        width: "auto",
        height: height,
      }}
      minHeight={precalculated_bar_height}
      style={{
        opacity: 0.95,
        overflow: "hidden",
        marginLeft: 21,
        marginRight: 21,
        marginBottom: 16,
        boxShadow: "0px 4px 32px 4px rgba(0, 0, 0, 0.25)",
        border: "solid 1px rgba(255, 255, 255, 0.04)",
        borderRadius: 6,
        boxSizing: "border-box",
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        display: "flex",
        flexDirection: "column",
        background: colors.color_editor_bg_on_dark,
      }}
    >
      <ControllerBar
        expanded={expanded}
        onToggleExpand={() => {
          if (expanded) {
            setHeight(precalculated_bar_height);
          } else {
            setHeight(expand_default_height);
          }
          setExpended(!expanded);
        }}
      />
      <ContentBody hidden={!expanded} />
    </Resizable>
  );
}

function ContentBody({ hidden = false }: { hidden?: boolean }) {
  return (
    <WindowConsoleFeed
      style={{
        display: hidden ? "none" : "flex",
        minHeight: 120,
        flexDirection: "column-reverse",
        overflow: "scroll",
      }}
    />
  );
}

function ControllerBar({
  onToggleExpand,
  expanded,
}: {
  onToggleExpand: () => void;
  expanded: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        userSelect: "none",
        alignItems: "center",
        padding: 12,
      }}
    >
      <Tabs />
      <ControllerBarActionArea>
        {expanded ? (
          <TrashIcon
            onClick={() => {
              console.clear();
            }}
            style={{ cursor: "pointer" }}
          />
        ) : null}
        {expanded ? (
          <AngleDownIcon
            onClick={onToggleExpand}
            style={{ cursor: "pointer" }}
          />
        ) : (
          <AngleUpIcon onClick={onToggleExpand} style={{ cursor: "pointer" }} />
        )}
      </ControllerBarActionArea>
    </div>
  );
}

const ControllerBarActionArea = styled.div`
  display: flex;
  gap: 10px;
`;

function Tabs() {
  return (
    <div
      style={{
        display: "flex",
        flex: 1,
        gap: 12,
      }}
    >
      <DevtoolsTab label="Console" selected badge={0} />
      {/* <DevtoolsTab label="Problems" badge={0} />
      <DevtoolsTab label="React DevTools" badge={0} />
      <DevtoolsTab label="Properties"  /> */}
    </div>
  );
}
