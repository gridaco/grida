import * as monaco from "monaco-editor";
import { formatCode as formatDartCode } from "dart-style";
import { createWorkerQueue } from "@code-editor/webworker-services-core";

export let __dangerous__lastFormattedValue__global: string;

export function registerDocumentPrettier(editor, monaco) {
  const disposables: monaco.IDisposable[] = [];
  let prettierWorker;

  const dartFormattingEditProvider = {
    provideDocumentFormattingEdits: (model, options, token) => {
      try {
        const raw = model.getValue();
        const { code, error } = formatDartCode(raw);
        if (error) return [];
        __dangerous__lastFormattedValue__global = code;
        return [
          {
            range: model.getFullModelRange(),
            text: code,
          },
        ];
      } catch (_) {
        // ignore. this is caused by disposed model
      }
    },
  };

  const prettierFormattingEditProvider = {
    async provideDocumentFormattingEdits(model, _options, _token) {
      if (!prettierWorker) {
        prettierWorker = createWorkerQueue(
          new Worker(new URL("./workers/prettier.worker.js", import.meta.url))
        );
      }

      try {
        const { canceled, error, pretty } = await prettierWorker?.emit({
          text: model.getValue(),
          language: model._languageId,
        });

        if (canceled || error) return [];
        __dangerous__lastFormattedValue__global = pretty;
        return [
          {
            range: model.getFullModelRange(),
            text: pretty,
          },
        ];
      } catch (_) {
        // ignore. this is caused by disposed model
      }
    },
  };

  disposables.push(
    monaco.languages.registerDocumentFormattingEditProvider(
      "javascript",
      prettierFormattingEditProvider
    )
  );

  disposables.push(
    monaco.languages.registerDocumentFormattingEditProvider(
      "typescript",
      prettierFormattingEditProvider
    )
  );

  disposables.push(
    monaco.languages.registerDocumentFormattingEditProvider(
      "dart",
      dartFormattingEditProvider
    )
  );

  disposables.push(
    monaco.languages.registerDocumentFormattingEditProvider(
      "html",
      prettierFormattingEditProvider
    )
  );

  disposables.push(
    monaco.languages.registerDocumentFormattingEditProvider(
      "css",
      prettierFormattingEditProvider
    )
  );

  editor.getAction("editor.action.formatDocument").run();

  return {
    dispose() {
      disposables.forEach((disposable) => disposable.dispose());
      if (prettierWorker) {
        prettierWorker.terminate();
      }
    },
  };
}
