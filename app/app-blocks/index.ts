// screen-preview-card-block
export * from "./screen-preview-card-block.boring";
import { boring_extended_screen_preview_card_block } from "./screen-preview-card-block.extension";
import { boring_extended_screen_scaffold_code_block } from "./scaffold-code-block.extension";
// --- +
////////

// register extensions here, will be automatically attatched to default boring editor scaffold.
export const extension = {
  "screen-preview-card-block": boring_extended_screen_preview_card_block,
  "scaffold-code-block": boring_extended_screen_scaffold_code_block,
};
export const extensions = Object.values(extension);
