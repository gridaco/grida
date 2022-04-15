import { nanoid } from "nanoid";
import { build, initialize, Loader } from "esbuild-wasm";
import { fetchPlugin } from "./fetch.plugin";
import { unpkgPathPlugin } from "./unpkg-path.plugin";
import { loadTypes } from "@code-editor/estypes-resolver";

let serviceLoaded: boolean | null = null;

const bundler = async (rawCode: string, lang: Loader) => {
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

    // console.log("esbuild result: ", result);

    return { code: result.outputFiles[0].text, err: null };
  } catch (error: any) {
    console.error("esbuild error: ", error);
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
