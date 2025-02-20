import { Monaco } from "@monaco-editor/react";

declare const window: {
  monaco: Monaco;
};

let typesWorker;

export function loadTypes(types: string[]) {
  const disposables: any = [];
  const monaco = window && window.monaco;

  const dependencies = types.map((e) => ({ name: e, version: "latest" })) || [];

  if (!typesWorker) {
    typesWorker = new Worker(
      new URL("./workers/fetch-types.worker.js", import.meta.url)
    );
  }

  dependencies.forEach((dep) => {
    typesWorker.postMessage({
      name: dep.name,
      version: dep.version,
    });
  });

  typesWorker.addEventListener("message", (event) => {
    // name,
    // version,
    // typings: result,
    const key = `node_modules/${event.data.name}/index.d.ts`;
    const source = event.data.typings[key];

    // const path = `${MONACO_LIB_PREFIX}${event.data.name}`;
    const libUri = `file:///node_modules/@types/${event.data.name}/index.d.ts`;

    disposables.push(
      monaco.languages.typescript.javascriptDefaults.addExtraLib(source, libUri)
    );
    disposables.push(
      monaco.languages.typescript.typescriptDefaults.addExtraLib(source, libUri)
    );

    // When resolving definitions and references, the editor will try to use created models.
    // Creating a model for the library allows "peek definition/references" commands to work with the library.
  });

  return {
    dispose() {
      disposables.forEach((d) => d.dispose());
      if (typesWorker) {
        typesWorker.terminate();
      }
    },
  };
}
