import type grida from "@grida/schema";

export type TMixed<T> = typeof grida.mixed | T;
