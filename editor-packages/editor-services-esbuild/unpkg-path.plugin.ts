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
      return {
        namespace: "a",
        path: new URL(args.path, unpkg_path + "/").href,
      };
    });
  },
});
