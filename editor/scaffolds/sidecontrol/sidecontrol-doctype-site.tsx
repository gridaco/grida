"use client";

import React from "react";
import { useEditorState } from "../editor";
import { SideControlGlobal } from "./sidecontrol-global";
import { Align, Selection } from "./sidecontrol-node-selection";
import assert from "assert";

export function SideControlDoctypeSite() {
  const [state, dispatch] = useEditorState();

  assert(state.documents, "state.documents is required");
  if (state.documents["site/dev-collection"]!.selection.length === 0) {
    return <SideControlGlobal />;
  } else {
    return (
      <>
        <Align />
        <hr />
        <Selection />
      </>
    );
  }
}
