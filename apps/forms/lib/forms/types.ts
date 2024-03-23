import type { EditorFlatFormBlock } from "@/scaffolds/editor/state";

export interface FormBlockTree {
  depth: number;
  children: FormBlockTreeFolderBlock[] | EditorFlatFormBlock[];
}

export type FormBlockTreeChild = FormBlockTreeFolderBlock | EditorFlatFormBlock;

export interface FormBlockTreeFolderBlock extends EditorFlatFormBlock {
  type: "section" | "group";
  children: EditorFlatFormBlock[];
}
