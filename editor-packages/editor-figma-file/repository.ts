import { fetch } from "@design-sdk/figma-remote";
import { FigmaFileStore, FigmaFileMetaStore } from "./stores";
import type { FileResponseRecord } from "./stores";

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
    const metastore = new FigmaFileMetaStore();
    const store = new FigmaFileStore(fileId);
    const existing = await store.get();
    if (existing) {
      // everytime the file is consumed consider it as used, we upsert the file so that the lastUsed can be updated.
      metastore.upsert(existing.key, existing);
      return { ...existing, __initial: false } as TFetchFileForApp;
    } else {
      throw new Error("file not found");
    }
  }

  async *fetchFile(filekey: string) {
    const metastore = new FigmaFileMetaStore();
    const store = new FigmaFileStore(filekey);
    const existing = await store.get();
    if (existing) {
      // everytime the file is consumed consider it as used, we upsert the file so that the lastUsed can be updated.
      metastore.upsert(existing.key, existing);
      yield {
        ...existing,
        __initial: false,
        __type: "file-fetched-for-app",
      } as TFetchFileForApp;
    }

    const _iter = fetch.fetchFile({ file: filekey, auth: this.auth });
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
            metastore.upsert(filekey, next.value);
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
            metastore.upsert(filekey, next.value);
          }
          break;
        case "whole":
          yield {
            ...next.value,
            __initial: false,
            __type: "file-fetched-for-app",
          } as TFetchFileForApp;
          store.upsert(next.value);
          metastore.upsert(filekey, next.value);
          break;
      }
    }
  }
}
