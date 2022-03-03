export * from "./builtin-demo-file-card";
export * from "./builtin-import-new-design-card";

import { ComponentCard } from "./card-variant-component";
import { FileCard } from "./card-variant-file";
import { SceneCard } from "./card-variant-scene";
export const Cards = {
  Component: ComponentCard,
  Scene: SceneCard,
  File: FileCard,
};
