import { loadTypes } from "@code-editor/estypes-resolver";

const react_preset_dependencies = [
  "react",
  "react-dom",
  "prop-types",
  "react-router",
  "react-router-dom",
  "styled-components",
  "@emotion/styled",
  "@emotion/react",
  "axios",
];

/**
 * load the preset dependencies on initial boot (e.g. react)
 */
export function registerPresetTypes() {
  // load the react presets
  loadTypes(react_preset_dependencies);
}
