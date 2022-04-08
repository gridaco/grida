import * as monaco from "monaco-editor";
import { formatCode as formatDartCode } from "dart-style";
import { createWorkerQueue } from "../../../workers";

export function registerDocumentPrettier(editor, monaco) {
  const disposables: monaco.IDisposable[] = [];
  let prettierWorker;

  const dartFormattingEditProvider = {
    provideDocumentFormattingEdits: (model, options, token) => {
      const raw = model.getValue();
      const { code, error } = formatDartCode(raw);
      if (error) return [];
      return [
        {
          range: model.getFullModelRange(),
          text: code,
        },
      ];
    },
  };

  const prettierFormattingEditProvider = {
    async provideDocumentFormattingEdits(model, _options, _token) {
      if (!prettierWorker) {
        prettierWorker = createWorkerQueue(
          new Worker(
            new URL(
              "../../../workers/prettier/prettier.worker.js",
              import.meta.url
            )
          )
        );
      }

      const { canceled, error, pretty } = await prettierWorker?.emit({
        text: model.getValue(),
        language: model._languageId,
      });

      if (canceled || error) return [];

      return [
        {
          range: model.getFullModelRange(),
          text: pretty,
        },
      ];
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
