import type { EditorFlatFormBlock } from "@/scaffolds/editor/state";

export type FormBlockTree<
  A = FormBlockTreeFolderBlock[] | EditorFlatFormBlock[],
> = import("@grida/forms").FormBlockTree<A>;

export type FormBlockTreeChild = FormBlockTreeFolderBlock | EditorFlatFormBlock;

export interface FormBlockTreeFolderBlock extends EditorFlatFormBlock {
  type: "section" | "group";
  children: EditorFlatFormBlock[];
}
