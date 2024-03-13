const fs = require("fs");
const path = require("path");

const setup_docs = require("./setup-docs");

const watch_dir = path.join(__dirname, "../../../../docs");

// watch `watch_dir` for changes
console.log(`Watching ${watch_dir} for changes...`);
fs.watch(watch_dir, { recursive: true }, (event, filename) => {
  console.log(`${filename} changed`);
  // run setup script on change
  setup_docs();
});
