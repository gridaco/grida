import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
export default function VSCodeEmbedGridaExplorerPreview() {
  const router = useRouter();
  const [isEmpty, setIsEmpty] = useState(true);

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

  return <div>VSCodeEmbedGridaExplorerPreview</div>;
}

function EmptyState() {
  return <div>EmptyState</div>;
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
