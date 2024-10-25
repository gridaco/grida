"use client";

import React from "react";
import { useEditorState } from "../editor";
import { SideControlGlobal } from "./sidecontrol-global";
import { SelectedNodeProperties } from "./sidecontrol-selected-node";
import assert from "assert";

export function SideControlDoctypeSite() {
  const [state, dispatch] = useEditorState();

  assert(state.documents, "state.documents is required");
  if (state.documents["form/collection"]!.selected_node_id) {
    return <SelectedNodeProperties />;
  } else {
    return <SideControlGlobal />;
  }
}
