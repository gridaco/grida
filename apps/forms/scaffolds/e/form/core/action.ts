export type FormAgentAction =
  | FieldValueCahngeAction
  | SectionChangeAction
  | SectionNextAction
  | SectionPrevAction
  | SubmitAction;

type FieldValueCahngeAction = {
  type: "fields/value/change";
  id: string;
  value: string;
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
