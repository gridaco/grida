export type FormAgentAction =
  | FieldValueCahngeAction
  | FieldFileCahngeAction
  | FieldFileMetadataCahngeAction
  | SectionChangeAction
  | SectionNextAction
  | SectionPrevAction
  | SubmitAction;

type FieldValueCahngeAction = {
  type: "fields/value/change";
  id: string;
  value: string | boolean | number | string[];
};

type FieldFileCahngeAction = {
  type: "fields/files/change";
  id: string;
  files: File[];
};

type FieldFileMetadataCahngeAction = {
  type: "fields/files/metadata/change";
  id: string;
  index: number;
  metadata: { duration: number };
};

type SectionChangeAction = {
  type: "section/change";
  id: string;
};

type SectionNextAction = {
  type: "section/next";
};

type SectionPrevAction = {
  type: "section/prev";
};

type SubmitAction = {
  type: "form/submit";
};
