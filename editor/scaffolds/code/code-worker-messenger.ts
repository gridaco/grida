import { createWorkerQueue } from "@code-editor/webworker-services-core";
import type { Result } from "@designto/code";

let previewworker: Worker;
export function initialize(
  { filekey, authentication }: { filekey: string; authentication },
  onReady: () => void
) {
  // initialize the worker and set the preferences.
  if (!previewworker) {
    const { worker } = createWorkerQueue(
      new Worker(new URL("./workers/code.worker.js", import.meta.url))
    );

    previewworker = worker;
  }

  previewworker.postMessage({
    $type: "initialize",
    filekey,
    authentication,
  });

  previewworker.addEventListener("message", (e) => {
    if (e.data.$type === "data-readt") {
      onReady();
    }
  });

  return () => {
    if (previewworker) {
      previewworker.terminate();
    }
  };
}

export function preview(
  { target, page }: { target: string; page: string },
  onResult: (result: Result) => void,
  onError?: (error: Error) => void
) {
  previewworker.postMessage({
    $type: "preview",
    page,
    target,
  });

  const handler = (e) => {
    const id = e.data.id;
    if (target === id) {
      switch (e.data.$type) {
        case "result":
          onResult(e.data);
          break;
        case "error":
          onError(new Error(e.data.message));
          break;
      }
    }
  };

  previewworker.addEventListener("message", handler);

  return () => {
    previewworker.removeEventListener("message", handler);
  };
}

export function code(
  { target, page }: { target: string; page: string },
  onResult: (result: Result) => void,
  onError?: (error: Error) => void
) {
  previewworker.postMessage({
    $type: "code",
    page,
    target,
  });

  const handler = (e) => {
    const id = e.data.id;
    if (target === id) {
      switch (e.data.$type) {
        case "result":
          onResult(e.data);
          break;
        case "error":
          onError(new Error(e.data.message));
          break;
      }
    }
  };

  previewworker.addEventListener("message", handler);

  return () => {
    previewworker.removeEventListener("message", handler);
  };
}
