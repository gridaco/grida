export type PendingState_Pending<T> = {
  type: "pending";
  value?: Partial<T>;
};

export type PendingState_Success<T> = {
  type: "success";
  value: T;
};

export type PendingState_Failure<T> = {
  type: "failure";
  value?: Error;
};

export type PendingState<T> =
  | PendingState_Pending<T>
  | PendingState_Success<T>
  | PendingState_Failure<T>;
