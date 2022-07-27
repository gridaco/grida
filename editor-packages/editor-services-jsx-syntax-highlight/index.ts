import { Monaco } from "@monaco-editor/react";
import { createWorkerQueue } from "@code-editor/webworker-services-core";

import type { editor } from "monaco-editor";
export function registerJsxHighlighter(
  editor: editor.IStandaloneCodeEditor,
  monaco: Monaco
) {
  const { worker: syntaxWorker } = createWorkerQueue(
    new Worker(new URL("./workers/syntax-highlight.worker.js", import.meta.url))
  );

  const highlightHandler = () => {
    const title = "app.js";
    const model = editor.getModel();
    const version = model?.getVersionId();
    const lang = model?.getLanguageId();

    if (lang === "javascript" || "typescript") {
      const code = model?.getValue();
      syntaxWorker.postMessage({
        code,
        title,
        version,
      });
    }
  };

  editor.onDidChangeModel(highlightHandler);

  editor.onDidChangeModelContent(highlightHandler);

  let oldDecor = editor.getModel()?.getAllDecorations();

  syntaxWorker.addEventListener("message", (event) => {
    const { classifications } = event.data;

    requestAnimationFrame(() => {
      const decorations = classifications.map((classification) => ({
        range: new monaco.Range(
          classification.startLine,
          classification.start,
          classification.endLine,
          classification.end
        ),
        options: {
          inlineClassName: classification.type
            ? `${classification.kind} ${classification.type}-of-${classification.parentKind}`
            : classification.kind,
        },
      }));

      // @ts-ignore
      oldDecor = editor.deltaDecorations(oldDecor, decorations);
    });
  });
}
