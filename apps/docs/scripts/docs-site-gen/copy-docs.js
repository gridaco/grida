const fse = require("fs-extra");
const path = require("path");

const origin = path.join(__dirname, "../../../../docs");
const dest = path.join(__dirname, "../../../docs/docs");

/**
 * copy all directory & containing files from origin to dest.
 * overrite conflicting directories and files under that directory, and print summury of the result.
 *
 * use fse.copySync() to copy files.
 */
function copyAll() {
  fse.copySync(origin, dest, { overwrite: true }, function (err) {
    if (err) {
      console.error(err);
    } else {
    }
  });
}

module.exports = copyAll;
