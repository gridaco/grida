import React from "react";
import { Scaffold, InitialDocumentProp } from "@boringso/react-core";
import { boring_extended_import_design_with_url } from "../built-in-pages/getting-started-components";
import { extensions as default_extensions } from "../app-blocks";
const extensions = [
  ...default_extensions,
  boring_extended_import_design_with_url,
];

export function BoringScaffold(props: { initial: InitialDocumentProp }) {
  //@ts-ignore (todo: inspect warning)
  return <Scaffold {...props} extensions={extensions} />;
}
