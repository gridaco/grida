import { PluginBuild } from "esbuild-wasm";
import { resolve } from "path";

const unpkg_path = "https://unpkg.com";

export const unpkgPathPlugin = ({
  files,
}: {
  files: { [key: string]: string };
}) => ({
  name: "unpkg-path-plugin",
  setup(build: PluginBuild) {
    /**
     * Resolve the entry file eg. `index.js`
     */
    build.onResolve({ filter: /.*/ }, ({ path }) => {
      if (files[path]) {
        return { path: path, namespace: "a" };
      }
      return null;
    });

    /**
     * Resolve relative modules imports
     */
    build.onResolve({ filter: /^\.+\// }, ({ path, resolveDir }) => {
      // if (resolveDir.startsWith("<dir>")) {
      const relative_import_from_files = resolve_relative_imports_from_files({
        importfrom: path,
        basepath: resolveDir,
        files,
      });
      if (relative_import_from_files) {
        return { path: relative_import_from_files.path, namespace: "a" };
      }
      // }

      const url = new URL(path, unpkg_path + resolveDir + "/").href;
      return {
        namespace: "a",
        path: url,
      };
    });

    /**
     * Resolve main module files
     */
    build.onResolve({ filter: /.*/ }, async ({ path }: any) => {
      const name = get_package_name(path);
      return {
        namespace: "a",
        path: new URL(name, unpkg_path + "/").href,
      };
    });
  },
});

const get_package_name = (path: string) => {
  // get the name of the package
  // @org/package-name -> "@org/package-name"
  // package/module -> "package"
  if (path.startsWith("@")) {
    return path;
  }
  return path.split("/")[0];
};

/**
 * the import statement does not have a file extension by default.
 * this function will return the dedicated file & absolute path of the file from the relative import statement.
 */
function resolve_relative_imports_from_files({
  importfrom,
  basepath,
  files,
}: {
  importfrom: string;
  basepath: string;
  files: { [key: string]: string };
}) {
  // if the import is somehow absolute, return it.
  const absfilecontent = files[importfrom];
  if (absfilecontent) {
    return {
      path: importfrom,
      contents: absfilecontent,
    };
  }

  // if the import is relative, resolve it.
  const abspath = resolve(basepath, importfrom);
  for (const vary of validimports(abspath)) {
    for (const key of Object.keys(files)) {
      if (key === vary) {
        return {
          path: key,
          contents: files[key],
        };
      }
    }
  }

  return null;
}

const validimports = (importfrom: string) => [
  importfrom,
  importfrom + "/",
  importfrom + ".js",
  importfrom + ".jsx",
  importfrom + ".ts",
  importfrom + ".tsx",
  importfrom + "/index.js",
  importfrom + "/index.jsx",
  importfrom + "/index.ts",
  importfrom + "/index.tsx",
];
