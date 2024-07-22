"use client";
import React, { useCallback } from "react";
import { useEditorState } from "@/scaffolds/editor";
import { Spinner } from "@/components/spinner";
import { ReloadIcon } from "@radix-ui/react-icons";
import { Button } from "@/components/ui/button";

export function GridRefresh() {
  const [state, dispatch] = useEditorState();
  const { datagrid_isloading } = state;

  const onRefresh = useCallback(() => {
    dispatch({ type: "editor/data-grid/refresh" });
  }, [dispatch]);

  return (
    <Button disabled={datagrid_isloading} onClick={onRefresh} variant="ghost">
      <span className="me-2">
        {datagrid_isloading ? <Spinner /> : <ReloadIcon />}
      </span>
      Refresh
    </Button>
  );
}
