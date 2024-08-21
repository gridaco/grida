"use client";

import React from "react";
import { SidebarRoot } from "@/components/sidebar";
import { useEditorState } from "../editor";
import { SideControlDoctypeForm } from "./sidecontrol-doctype-form";
import { SideControlDoctypeSite } from "./sidecontrol-doctype-site";

export function SideControl() {
  const [state] = useEditorState();
  const { doctype } = state;

  return (
    <SidebarRoot side="right">
      <div className="h-5" />
      {doctype === "v0_form" && <SideControlDoctypeForm />}
      {doctype === "v0_site" && <SideControlDoctypeSite />}
    </SidebarRoot>
  );
}
