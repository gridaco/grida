import { Monaco } from "@monaco-editor/react";
import { nanoid } from "nanoid";
import { build, initialize, Loader } from "esbuild-wasm";
import { fetchPlugin } from "./fetch.plugin";
import { unpkgPathPlugin } from "./unpkg-path.plugin";
// import store from "../../redux";
// import { INIT_BUNDLER } from "../../redux/actions/bundler.actions";
// import { PRINT_CONSOLE } from "../../redux/actions/editor.actions";

declare const window: {
  monaco: Monaco;
};

let serviceLoaded: boolean | null = null;

const bundler = async (rawCode: string, lang: Loader) => {
  if (!serviceLoaded) {
    await initialize({
      wasmURL: "https://unpkg.com/esbuild-wasm@0.13.14/esbuild.wasm",
      worker: true,
    });
    serviceLoaded = true;
    // store.dispatch(INIT_BUNDLER());
    // store.dispatch(
    //   PRINT_CONSOLE({
    //     method: "info",
    //     data: ["Bundler initialized...Happy coding ❤️"],
    //   })
    // );
  }

  try {
    const result = await build({
      entryPoints: ["index.js"],
      bundle: true,
      write: false,
      metafile: true,
      legalComments: "none",
      plugins: [unpkgPathPlugin(), fetchPlugin(rawCode, lang)],
      define: {
        "process.env.NODE_ENV": `"production"`,
        global: "window",
      },
    });

    const imports = result.metafile?.inputs["a:index.js"].imports
      .map((el) => el.path.replace("a:https://unpkg.com/", ""))
      .filter((e) => !e.includes("/"));

    loadTypes(imports);

    return { code: result.outputFiles[0].text, err: null };
  } catch (error: any) {
    console.error("error: ", error);
    return {
      code: "",
      err: { method: "error", data: [error.message], id: nanoid() },
    };
  }
};

export const normalizeCss = (data: string) => {
  /**
   * Function to remove any new lines, quotes from imported css packages.
   */
  const escaped = data
    .replace(/\n/g, "")
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'");
  return `const style = document.createElement('style')
	style.innerText = '${escaped}';
	document.head.appendChild(style)`;
};

export default bundler;

let typesWorker;

const loadTypes = (types) => {
  const disposables: any = [];
  const monaco = window && window.monaco;

  const dependencies =
    types.map((e) => ({ name: e, version: "@latest" })) || [];

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
};
