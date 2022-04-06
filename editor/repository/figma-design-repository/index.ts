import { fetch } from "@design-sdk/figma-remote";
import { FileResponse } from "@design-sdk/figma-remote-types";
import {
  FigmaFileStore,
  FileResponseRecord,
} from "store/fimga-file-store/figma-file-store";

export type TFetchFileForApp = (
  | fetch.FetchFileGeneratorReturnType
  | FileResponseRecord
) & {
  /**
   * rather this fetch is a initail fetch. this is used when blocking the user interaction until first initial whole file fetching on first entry.
   */
  __initial: boolean;

  __type: "file-fetched-for-app";
};

export class FigmaDesignRepository {
  constructor(
    readonly auth: { accessToken: string; personalAccessToken: string }
  ) {}

  static async fetchCachedFile(fileId: string) {
    const store = new FigmaFileStore(fileId);
    const existing = await store.get();
    if (existing) {
      return { ...existing, __initial: false } as TFetchFileForApp;
    } else {
      throw new Error("file not found");
    }
  }

  async *fetchFile(fileId: string) {
    const store = new FigmaFileStore(fileId);
    const existing = await store.get();
    if (existing) {
      yield { ...existing, __initial: false } as TFetchFileForApp;
    }

    const _iter = fetch.fetchFile({ file: fileId, auth: this.auth });
    let next: IteratorResult<fetch.FetchFileGeneratorReturnType>;
    while ((next = await _iter.next()).done === false) {
      switch (next.value.__response_type) {
        case "pages":
          if (!existing) {
            yield {
              ...next.value,
              __initial: true,
              __type: "file-fetched-for-app",
            } as TFetchFileForApp;
            store.upsert(next.value);
          }
          break;
        case "roots":
          if (!existing) {
            yield {
              ...next.value,
              __initial: true,
              __type: "file-fetched-for-app",
            } as TFetchFileForApp;
            store.upsert(next.value);
          }
          break;
        case "whole":
          yield {
            ...next.value,
            __initial: false,
            __type: "file-fetched-for-app",
          } as TFetchFileForApp;
          store.upsert(next.value);
          break;
      }
    }
  }
}
