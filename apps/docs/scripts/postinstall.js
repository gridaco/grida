const setup_docs = require("./setup-docs");

// `--sources=optional` (postinstall): docs sources are best-effort, so an
// install never fails on fetching them. `content:setup` (the build) is strict.
setup_docs({
  sources_optional: process.argv.includes("--sources=optional"),
});
