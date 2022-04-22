import { createWorkerQueue } from "@code-editor/webworker-services-core";
import type { Result } from "@designto/code";

let previewworker: Worker;
export function initialize(filekey: string, authentication) {
  // initialize the worker and set the preferences.
  if (!previewworker) {
    const { worker } = createWorkerQueue(
      new Worker(new URL("./workers/canvas-preview.worker.js", import.meta.url))
    );

    previewworker = worker;
  }

  previewworker.postMessage({
    $type: "init",
    filekey,
    authentication,
  });

  return () => {
    if (previewworker) {
      previewworker.terminate();
    }
  };
}

export function preview(
  node: string,
  onResult: (result: Result) => void,
  onError?: (error: Error) => void
) {
  previewworker.postMessage({
    $type: "preview",
    node,
  });

  previewworker.addEventListener("message", (e) => {
    // TODO: add id matcher (?)
    switch (e.data.$type) {
      case "result":
        onResult(e.data);
        break;
      case "error":
        onError(new Error(e.data.message));
        break;
    }
  });
}
