type Join<K, P> = K extends string | number
  ? P extends string | number
    ? `${K}.${P}`
    : never
  : never;

type Prev = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

type Paths<T, D extends number = 10> = [D] extends [never]
  ? never
  : T extends object
    ? {
        [K in keyof T]-?: K extends string | number
          ? `${K}` | Join<K, Paths<T[K], Prev[D]>>
          : never;
      }[keyof T]
    : "";

type ValidPaths<T, D extends number = 10> = [D] extends [never]
  ? never
  : T extends object
    ? {
        [K in keyof T]-?: K extends string | number
          ?
              | `${K}`
              | (Paths<T[K], Prev[D]> extends infer P
                  ? P extends ""
                    ? never
                    : Join<K, P>
                  : never)
          : never;
      }[keyof T]
    : "";

// Exclude invalid paths with trailing dots
type ExcludeTrailingDot<T> = T extends `${infer _}.` ? never : T;
export type HandlebarsPath<T> = ExcludeTrailingDot<ValidPaths<T>>;
