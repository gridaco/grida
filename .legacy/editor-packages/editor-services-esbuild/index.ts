import { nanoid } from "nanoid";
import { build, initialize, Loader } from "esbuild-wasm";
import { fetchPlugin } from "./fetch.plugin";
import { unpkgPathPlugin } from "./unpkg-path.plugin";
import { loadTypes } from "@code-editor/estypes-resolver";

let serviceLoaded: boolean | null = null;

interface ESBuildRequest {
  /**
   * all input files to be bundled
   */
  files: {
    [key: string]: string;
  };
  /**
   * entry file, for example, app.tsx
   */
  entry: string;
  /**
   * tsconfig file path on {files}
   */
  tsconfig?: string | undefined;
  /**
   * extra definitions to be made, e.g. for setting process.env.X
   */
  define?: Record<string, string> | undefined;
}

const bundler = async ({ files, entry, tsconfig, define }: ESBuildRequest) => {
  if (!serviceLoaded) {
    await initialize({
      wasmURL: "https://unpkg.com/esbuild-wasm@0.14.34/esbuild.wasm",
      worker: true,
    });
    console.log("esbuild-wasm initialized");
    serviceLoaded = true;
  }

  try {
    const result = await build({
      entryPoints: [entry],
      bundle: true,
      write: false,
      tsconfig,
      loader: {
        ".tsx": "tsx",
        ".ts": "ts",
        ".js": "jsx",
        ".jsx": "jsx",
        ".css": "css",
      },
      metafile: true,
      legalComments: "none",
      plugins: [unpkgPathPlugin({ files }), fetchPlugin({ files })],
      define: {
        "process.env.NODE_ENV": `"production"`,
        global: "window",
      },
    });

    const imports = result.metafile?.inputs["a:" + entry].imports
      .map((el) => el.path.replace("a:https://unpkg.com/", ""))
      .filter((e) => !e.includes("/"));

    loadTypes(imports);

    // console.log("esbuild result: ", result);

    return { code: result.outputFiles[0].text, err: null };
  } catch (error: any) {
    return {
      code: null,
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
