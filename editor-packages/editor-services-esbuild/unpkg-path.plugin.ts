import { PluginBuild } from "esbuild-wasm";

const unpkg_path = "https://unpkg.com";

export const unpkgPathPlugin = () => ({
  name: "unpkg-path-plugin",
  setup(build: PluginBuild) {
    /**
     * Resolve the entry file eg. `index.js`
     */
    build.onResolve({ filter: /^index\.js$/ }, (args: any) => {
      return { path: args.path, namespace: "a" };
    });

    /**
     * Resolve relative modules imports
     */
    build.onResolve({ filter: /^\.+\// }, (args: any) => {
      const url = new URL(args.path, unpkg_path + args.resolveDir + "/").href;
      return {
        namespace: "a",
        path: url,
      };
    });

    /**
     * Resolve main module files
     */
    build.onResolve({ filter: /.*/ }, async (args: any) => {
      const name = get_package_name(args.path);
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
