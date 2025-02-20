"use client";
import React from "react";
import { useEditorState } from "../editor";
import { Spinner } from "@/components/spinner";

export function SavingIndicator() {
  const [state] = useEditorState();
  const { saving } = state;
  if (saving) {
    return (
      <div className="flex items-center gap-2 opacity-50">
        <Spinner />
        <span className="text-xs">Saving...</span>
      </div>
    );
  }
  return <></>;
}
