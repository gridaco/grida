import React from "react";
import { Scaffold as BoringScaffold } from "@boringso/react-core";

export function ImportedScreenPageTemplate() {
  const initialContent = `this is imported screen`;
  const initialTitle = `New screen`;
  return (
    <BoringScaffold
      initialTitle={initialTitle}
      initialContent={initialContent}
    />
  );
}
