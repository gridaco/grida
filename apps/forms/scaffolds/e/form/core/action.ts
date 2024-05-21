export type FormAgentAction = FieldValueCahngeAction;

type FieldValueCahngeAction = {
  type: "fields/value/change";
  id: string;
  value: string;
};
