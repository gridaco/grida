import React from "react";
import { PIP, ResizablePIP } from "@code-editor/preview-pip";
export default function EmbedForVSCodeExtensionPage() {
  return (
    <>
      <ResizablePIP
        width={100}
        height={100}
        minConstraints={[100, 100]}
        maxConstraints={[500, 500]}
      >
        <div>content</div>
      </ResizablePIP>
    </>
  );
}
