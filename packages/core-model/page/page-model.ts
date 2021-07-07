/**
 * Core Page model
 */
export interface Page {
  id: string;
  type: "boring-document" | "nothing-document";
  name: string;
  content: Fetchable<any>;
}

type ObjectLike = object | string;

/**
 * 1. fetch `() => Promise<T>`
 * 2. cached `() => T`
 * 3. static `T`
 */
type FetchOrCachedHandler<T extends ObjectLike> =
  | T
  | (() => T)
  | (() => Promise<T>);
type Fetchable<T extends ObjectLike> = T | (() => Promise<T>);

// export async function handle<T extends ObjectLike>(
//   input: Fetchable<T>,
//   handlers: {
//     fetch?: () => T;
//     cache?: () => T;
//   }
// ): Promise<T> {
//   if (typeof input == "function") {
//     return await input();
//   } else {
//     return input;
//   }
// }

export interface BoringDocumentPage extends Page {
  type: "boring-document";
  content: Fetchable<string>;
}
