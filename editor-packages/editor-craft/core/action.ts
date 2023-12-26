export type Action = any;

export type NewTextNodeAction = {
  type: "(craft)/nodes/text/new";
  initial: {
    value: string;
    color: string;
  };
};
