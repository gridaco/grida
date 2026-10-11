const fse = require("fs-extra");
const path = require("path");
const sources = require("../sources");

const origin = path.join(__dirname, "../../../../docs");
const dest = path.join(__dirname, "../../../docs/docs");

/**
 * copy all directory & containing files from origin to dest.
 * overrite conflicting directories and files under that directory, and print summury of the result.
 *
 * use fse.copySync() to copy files.
 */
function copyAll({ sources_optional = false } = {}) {
  // Mirror `/docs` into the Docusaurus content dir: remove stale files so
  // deletions in the source tree do not leave duplicate routes (e.g. README
  // vs index) in the build output.
  fse.emptyDirSync(dest);
  fse.copySync(origin, dest, {
    overwrite: true,
    filter: (src) => {
      const base = path.basename(src);
      return base !== ".DS_Store";
    },
  });
  // Then the docs authored in other repos, fetched at their pinned commits
  // (apps/docs/sources.json, docs/wg/platform/docs-sources.md).
  sources.materialize(origin, dest, { optional: sources_optional });
}

module.exports = copyAll;
