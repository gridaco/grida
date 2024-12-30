import type { grida } from "@/grida";

export type TChange<T> =
  | {
      type: "set";
      value: T;
    }
  | {
      type: "delta";
      value: T;
    };

export type TMixed<T> = typeof grida.mixed | T;
