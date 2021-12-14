import { fetch } from "@design-sdk/figma-remote";
import { FileResponse } from "@design-sdk/figma-remote-types";
import { FigmaFileStore } from "store/fimga-file-store/figma-file-store";

export class FigmaDesignRepository {
  constructor(
    readonly auth: { accessToken: string; personalAccessToken: string }
  ) {}
  async *fetchFile(fileId: string) {
    const store = new FigmaFileStore(fileId);
    const existing = await store.get();
    if (existing) {
      yield existing;
    }

    const _iter = fetch.fetchFile({ file: fileId, auth: this.auth });
    let next: IteratorResult<fetch.FetchFileGeneratorReturnType>;
    while ((next = await _iter.next()).done === false) {
      switch (next.value.__response_type) {
        case "pages":
          if (!existing) {
            yield next.value;
          }
          break;
        case "roots":
          if (!existing) {
            yield next.value;
            store.upsert(next.value);
          }
          break;
        case "whole":
          yield next.value;
          store.upsert(next.value);
          break;
      }
    }
  }
}
