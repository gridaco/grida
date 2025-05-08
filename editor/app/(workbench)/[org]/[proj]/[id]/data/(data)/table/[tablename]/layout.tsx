"use client";

import React, { use } from "react";
import { useEditorState } from "@/scaffolds/editor";
import Invalid from "@/components/invalid";
import { GDocSchemaTable, GDocTable } from "@/scaffolds/editor/state";

export default function Layout(
  props: Readonly<{
    children: React.ReactNode;
    params: Promise<{
      tablename: string;
    }>;
  }>
) {
  const params = use(props.params);

  const { children } = props;

  const [{ tables }] = useEditorState();
  const { tablename } = params;

  const tb = tables.find((table) => table.name === tablename);

  const isvalid = valid(tb);

  if (!isvalid) {
    return <Invalid />;
  }

  return <>{children}</>;
}

function valid(tb?: GDocTable): tb is GDocSchemaTable {
  return !!tb && typeof tb.id === "string";
}
