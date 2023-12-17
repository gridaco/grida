import { OnLoadResult, PluginBuild, Loader } from "esbuild-wasm";
import axios from "axios";
import localforage from "localforage";
import { normalizeCss } from ".";
import { dirname } from "path";

const fileCache = localforage.createInstance({
  name: "filecache",
});

const loader = (path: string): Loader => {
  if (path.endsWith(".css")) {
    return "css";
  }
  if (path.endsWith(".ts")) {
    return "ts";
  }
  if (path.endsWith(".tsx")) {
    return "tsx";
  }
  return "jsx";
};

export const fetchPlugin = ({
  files,
}: {
  files: { [key: string]: string };
}) => ({
  name: "fetch-plugin",

  setup(build: PluginBuild) {
    build.onLoad({ filter: /.*/ }, ({ path }) => {
      if (files[path]) {
        return {
          loader: loader(path),
          contents: files[path],
          resolveDir: dirname(path),
        };
      }

      return null;
    });

    build.onLoad({ filter: /.*/ }, async (args: any) => {
      /**
       * Check if module is already in filecache
       * if yes? return it immediately
       *
       * if not, fetch it from unpkg and cache it
       * and return the result
       */
      const cachedResult = await fileCache.getItem<OnLoadResult>(args.path);

      if (cachedResult) {
        return cachedResult;
      }

      return null;
    });

    build.onLoad({ filter: /.css$/ }, async (args: any) => {
      const { data, request } = await axios.get(args.path);

      const contents = normalizeCss(data);

      const result: OnLoadResult = {
        loader: "jsx",
        contents,
        resolveDir: new URL("./", request.responseURL).pathname,
      };

      await fileCache.setItem(args.path, result);

      return result;
    });

    build.onLoad({ filter: /.*/ }, async ({ path }) => {
      const { data, request } = await axios.get(path);

      const result: OnLoadResult = {
        loader: "jsx",
        contents: data,
        resolveDir: new URL("./", request.responseURL).pathname,
      };

      await fileCache.setItem(path, result);

      return result;
    });
  },
});

// const libSource = ReactTypes.toString()

// 	const libUri = "ts:filename/facts.d.ts";
// 	monaco.languages.typescript.javascriptDefaults.addExtraLib(libSource, libUri);

// 	monaco.editor.createModel(libSource, "typescript", monaco.Uri.parse(libUri));
