import { PageTree } from "./model";
import _, { Dictionary } from "lodash";
import {
  isOnRoot,
  PageId,
  PageParentId,
  PageReference,
  PageRootKey,
} from "@core/state";

interface IPage {
  id: string;
  parent?: string;
}

export function groupbyPageParent(
  arr: PageReference[]
): Dictionary<PageReference[]> {
  const _arr: PageReference[] = [];
  var grouped: Dictionary<PageReference[]> = _.groupBy(arr, (item) => {
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
    grouped[key].map((row: PageReference) => {
      _arr.push(row);
    });
  });

  _arr.map((row: PageReference, i: number) => {
    const isParentRow = !!grouped[row.id];
    const hasChildArr = _arr[i].children;

    if (isParentRow) {
      console.log(grouped[row.id]);
      grouped[row.id].map((_row) => {
        if (hasChildArr) {
          _arr[i].children.push(_row);
        } else {
          _arr[i].children[0] = _row;
        }
      });
    }
    return row;
  });
  console.log(_arr);

  return grouped;
}

export function sortAsGroupping(groupByKey: PageReference[]): PageTree {
  const arr: PageTree = [];
  //   const rootArr = groupByKey[PageRootKey];
  const _arr: PageReference[] = [];

  Object.keys(groupByKey).map((key: string, i: number) => {
    groupByKey[key].map((row: PageReference) => {
      _arr.push(row);
    });
  });
  //   console.log(_arr);

  //   _arr.map((t:PageReference)=>{
  //     if()
  //   })

  function pushArr(_arr: PageTree) {
    // _arr.map((row, i) => {
    //   arr.push(row);
    //   if (row.children) {
    //     pushArr(row.children);
    //   }
    // });
  }
  //   pushArr(groupByKey);

  //   console.log(arr);

  return arr;
}
