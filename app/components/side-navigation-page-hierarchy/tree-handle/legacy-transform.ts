///
/// DEPRECATED - remove this file safely.
///

import _, { Dictionary } from "lodash";
import { isOnRoot, PageId, PageRootKey } from "@core/state";

interface PageInfo {
  id: PageId;
  name: string;
  parent?: string; // fixme
  children?: PageInfo[];
}

/**
 *
 * groupbyPageParent is for grouping based on the parent value and sorting with the same depth .
 */
export function groupbyPageParent(arr: PageInfo[]): _.Dictionary<PageInfo[]> {
  var grouped: Dictionary<PageInfo[]> = _.groupBy(arr, (item) => {
    if (isOnRoot(item)) {
      return PageRootKey;
    }
    return item.parent;
  });

  Object.keys(grouped).map((key: string, i: number) => {
    grouped[key].sort(function (a: any, b: any) {
      if (a.sort > b.sort) {
        return 1;
      }
      if (a.sort < b.sort) {
        return -1;
      }
      return 0;
    });
  });

  return grouped;
}

/**
 * sortAsGroupping is for sorting the order (only arr's index) in which the treeview is rendered.
 **/
export function sortAsGroupping(
  groupByKey: _.Dictionary<PageInfo[]>
): PageInfo[] {
  const arr: PageInfo[] = [];
  const rootArr = groupByKey[PageRootKey];

  /**
   * When calling for the first time,
   * put rootId as @param _arr  and add the root row sorted
   * through A to the array first.
   */
  function addChildAsArr(_arr: PageInfo[]) {
    _arr.forEach((row) => {
      arr.push(row);
      const rowChild = groupByKey[row.id];
      if (rowChild !== undefined) {
        addChildAsArr(rowChild);
      }
    });
  }

  addChildAsArr(rootArr);

  return arr;
}
