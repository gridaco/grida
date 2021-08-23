import _, { Dictionary } from "lodash";
import { isOnRoot, PageId, PageRootKey } from "@core/state";

interface pageInfo {
  id: PageId;
  name: string;
  parent?: string; // fixme
  children?: pageInfo[];
}

/**
 *
 * groupbyPageParent is for grouping based on the parent value and sorting with the same depth .
 */
export function groupbyPageParent(arr: pageInfo[]): _.Dictionary<pageInfo[]> {
  var grouped: Dictionary<pageInfo[]> = _.groupBy(arr, (item) => {
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
  groupByKey: _.Dictionary<pageInfo[]>
): pageInfo[] {
  const arr: pageInfo[] = [];
  const rootArr = groupByKey[PageRootKey];

  /**
   * When calling for the first time,
   * put rootId as @param _arr  and add the root row sorted
   * through A to the array first.
   */
  function addChildAsArr(_arr: pageInfo[]) {
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
