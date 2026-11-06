import oklch from "../json/oklch.json";

// Hover over the first array access notation and make sure it shows `(property) 50: OKLCH`.
// Hover over the second array access notation and make sure it shows `(property) 0: number (lightness)`.
// If these don't show, typings are improperly set up and typescript is using default shape typing.
const importCheck = oklch.amber[50][0];

export default importCheck;
