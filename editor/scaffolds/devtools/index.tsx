import React, { useCallback, useEffect, useState } from "react";
import styled from "@emotion/styled";
import { DevtoolsTab } from "@code-editor/devtools";
import { colors } from "theme";
import { Resizable } from "re-resizable";
import { CaretDownIcon, CaretUpIcon, TrashIcon } from "@radix-ui/react-icons";
import { useDispatch } from "core/dispatch";
import { EditorConsoleFeed } from "./console-feed";
import { useEditorState } from "core/states";

const min_body_height = 120;
const max_body_height = 500;
const precalculated_bar_height = 44;
const expand_default_height = min_body_height + precalculated_bar_height;

const height_store = {
  get: () => {
    const stored = localStorage.getItem("devtools-height");
    if (stored) {
      return parseInt(stored);
    }
    return expand_default_height;
  },
  set: (height) => {
    localStorage.setItem("devtools-height", height.toString());
  },
};

export function Devtools() {
  const [expanded, setExpended] = useState(false);
  const [height, setHeight] = useState(
    expanded ? height_store.get() : precalculated_bar_height
  );

  const dispatch = useDispatch();

  const clearConsole = useCallback(() => {
    dispatch({
      type: "devtools-console-clear",
    });
  }, [dispatch]);

  // save height
  useEffect(() => {
    if (expanded) {
      height_store.set(height);
    }
  }, [height, expanded]);

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
        opacity: expanded ? 1 : 0.8,
        transition: "opacity 0.2s",
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
            setHeight(height_store.get());
          }
          setExpended(!expanded);
        }}
        onClearConsole={clearConsole}
      />
      <ContentBody hidden={!expanded} />
    </Resizable>
  );
}

function ContentBody({ hidden = false }: { hidden?: boolean }) {
  return (
    <EditorConsoleFeed
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
  onClearConsole,
}: {
  onToggleExpand: () => void;
  expanded: boolean;
  onClearConsole: () => void;
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
      <Tabs onClick={onToggleExpand} />
      <ControllerBarActionArea>
        {expanded ? (
          <TrashIcon onClick={onClearConsole} style={{ cursor: "pointer" }} />
        ) : null}
        {expanded ? (
          <CaretDownIcon
            onClick={onToggleExpand}
            style={{ cursor: "pointer" }}
          />
        ) : (
          <CaretUpIcon onClick={onToggleExpand} style={{ cursor: "pointer" }} />
        )}
      </ControllerBarActionArea>
    </div>
  );
}

const ControllerBarActionArea = styled.div`
  color: white;
  display: flex;
  gap: 10px;
`;

function Tabs({ onClick }: { onClick?: () => void }) {
  const [state] = useEditorState();
  const { devtoolsConsole } = state;

  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        flex: 1,
        gap: 12,
      }}
    >
      <DevtoolsTab
        label="Console"
        selected
        badge={devtoolsConsole?.logs?.length ?? 0}
        badgeType={
          devtoolsConsole?.logs?.find((l) => l.method === "error")
            ? "error"
            : "default"
        }
      />
      {/* <DevtoolsTab label="Problems" badge={0} />
      <DevtoolsTab label="React DevTools" badge={0} />
      <DevtoolsTab label="Properties"  /> */}
    </div>
  );
}
