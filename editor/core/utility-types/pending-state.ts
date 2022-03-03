export type PendingState<T> =
  | {
      type: "pending";
    }
  | {
      type: "success";
      value: T;
    }
  | {
      type: "failure";
      value: Error;
    };
