const copy = require("./docs-site-gen/copy-docs");
const mv_translations = require("./docs-site-gen/copy-translations");

function setup_docs({ sources_optional = false } = {}) {
  copy({ sources_optional });
  mv_translations();
}

module.exports = setup_docs;
