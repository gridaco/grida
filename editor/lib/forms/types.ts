import type { EditorFlatFormBlock } from "@/scaffolds/editor/state";

export interface FormBlockTree<
  A = FormBlockTreeFolderBlock[] | EditorFlatFormBlock[],
> {
  depth: number;
  children: A;
}

export type FormBlockTreeChild = FormBlockTreeFolderBlock | EditorFlatFormBlock;

export interface FormBlockTreeFolderBlock extends EditorFlatFormBlock {
  type: "section" | "group";
  children: EditorFlatFormBlock[];
}
