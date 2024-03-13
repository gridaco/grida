export interface BlocksEditorState {
  blocks: FormBlock[];
}

export interface FormBlock {
  type: string;
  data: any;
}
