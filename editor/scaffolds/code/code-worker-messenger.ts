import { createWorkerQueue } from "@code-editor/webworker-services-core";
import type { Result } from "@designto/code";
import { config } from "@designto/code/proc";
import assert from "assert";
import EventEmitter from "events";

let previewworker: Worker;

const bus = new EventEmitter();
const initialized = new Promise<void>((resolve) => {
  bus.once("initialized", () => {
    resolve();
  });
});

export function initialize(
  { filekey, authentication }: { filekey: string; authentication },
  onReady: () => void
) {
  console.info("initializing.. code ww");

  const __onready = () => {
    bus.emit("initialized");
    onReady();
  };

  if (!previewworker) {
    // initialize the worker and set the preferences.
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
    if (e.data.$type === "data-ready") {
      __onready();
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

export async function code({
  target,
  framework,
}: {
  target: string;
  framework: config.FrameworkConfig;
}): Promise<Result> {
  assert(framework, "framework config is required");
  return new Promise((resolve, reject) => {
    const handler = (e) => {
      const id = e.data.id;
      if (target === id) {
        switch (e.data.$type) {
          case "result":
            resolve(e.data);
            break;
          case "error":
            reject(new Error(e.data.message));
            break;
        }
        previewworker.removeEventListener("message", handler);
      }
    };

    previewworker.addEventListener("message", handler);

    initialized.then(() => {
      previewworker.postMessage({
        $type: "code",
        target,
        framework,
      });
    });
  });
}
