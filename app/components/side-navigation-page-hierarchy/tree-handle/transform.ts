import { TreeArray } from "treearray";
import { PageReference } from "@core/model";
import { PageRootKey } from "@core/state";

type PageInfoWithDepth = PageReference & { depth: number };
export function transform(pages: PageReference[]): PageInfoWithDepth[] {
  const _ta = new TreeArray(pages, PageRootKey);
  return _ta.asTreeArray();
}
