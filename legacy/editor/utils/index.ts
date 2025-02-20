export type UnwrapArray<T> = T extends (infer U)[] ? U : T;

export type NonUndefined<T> = T extends undefined ? never : T;
