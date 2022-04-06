import { Monaco } from "@monaco-editor/react";

export function registerTypesWorker(monaco: Monaco) {
  const disposables: any = [];
  let typesWorker;

  const dependencies = {
    react: "@latest",
    "react-dom": "@latest",
    axios: "@latest",
  };

  if (!typesWorker) {
    typesWorker = new Worker(
      new URL(
        "../../../workers/fetch-types/fetch-types.worker.js",
        import.meta.url
      )
    );
  }

  Object.keys(dependencies).forEach((name) => {
    typesWorker.postMessage({
      name,
      version: dependencies[name],
    });
  });

  const createModule = (names) => {
    const temp = names.map((el) => `export * from './${el}'`);
    return temp.join("\n");
  };

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
