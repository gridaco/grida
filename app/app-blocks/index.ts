// screen-preview-card-block
export * from "./screen-preview-card-block.boring";
import { boring_extended_screen_preview_card_block } from "./screen-preview-card-block.extension";

// --- +
////////

// register extensions here, will be automatically attatched to default boring editor scaffold.
export const extension = {
  "screen-preview-card-block": boring_extended_screen_preview_card_block,
};
export const extensions = Object.values(extension);
