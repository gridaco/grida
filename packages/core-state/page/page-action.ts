export type PageAction =
  | [type: "movePage", sourceIndex: number, destinationIndex: number]
  | [type: "selectPage", pageId: string]
  | [type: "addPage", name: string]
  | [type: "deletePage"]
  | [type: "renamePage", name: string]
  | [type: "duplicatePage"];
