import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import VanillaPreview from "@code-editor/vanilla-preview";
export default function VSCodeEmbedGridaExplorerPreview() {
  const router = useRouter(); // use router only for loading initial params.
  const [isEmpty, setIsEmpty] = useState(false); // TODO: set to false when publishing - true on only dev.

  useEffect(() => {
    // subscribes to user's message
    const listener = (event) => {
      //
    };

    window.addEventListener("message", listener);
    return () => {
      window.removeEventListener("message", listener);
    };
  }, []);

  if (isEmpty) {
    return <EmptyState />;
  }

  return <PreviewState srcDoc={`<div>Hello</div>`} />;
}

function EmptyState({ message = "Nothing is selected" }: { message?: string }) {
  return <div>{message}</div>;
}

function PreviewState({ srcDoc }: { srcDoc: string }) {
  return (
    <VanillaPreview
      type={"responsive"}
      id={""}
      data={srcDoc}
      margin={0}
      borderRadius={0}
      origin_size={{
        width: 375,
        height: 812,
      }}
    />
  );
}

interface EventFromClient<T = any> {
  __signature: "event-from-client";
  payload: T;
}

interface UpdatePreviewCommand {
  type: "update-preview";
  preview: {
    srcDoc: string;
  };
}

interface ClearPreviewCommand {
  type: "clear-preview";
}
