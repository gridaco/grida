import { BoringDocument } from "@boring.so/document-model";

export type PageId = string;

export interface PageReference {
  id: PageId;
  type: "boring-document" | "nothing-document";
  name: string;
}

type NothingDocument = never; // change this when nothing engine is complete.
export type PageDocumentType = "boring-document" | "nothing-document";
export type PageDocumentLike = BoringDocument | NothingDocument;
/**
 * Core Page model
 */
export interface Page extends PageReference {
  id: PageId;
  type: PageDocumentType;
  name: string;
  document: PageDocumentLike;
  

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
  document: PageDocumentLike;
}
