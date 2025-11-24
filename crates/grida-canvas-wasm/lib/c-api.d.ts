declare type CAPIMethodResultOk<T> = {
  success: true;
  data: T;
};

declare type CAPIMethodResultError = {
  success: false;
  error: {
    message: string;
  };
};

declare type CAPIMethodResult<T> =
  | CAPIMethodResultOk<T>
  | CAPIMethodResultError;

declare type CPtr = number;
