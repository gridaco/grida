# Tree data in array form utilities

## Sorting with insert, move between parent (group / hierarchy)

```ts
import { movementDiff } from "treearray";

movementDiff({
  item: { id: "target", sort: 0 },
  prevgroup: {
    id: "target's previous parent",
    children: [
      { id: "target", sort: 0 },
      { id: "2", sort: 2 },
      { id: "3", sort: 3 },
      { id: "4", sort: 5 },
    ],
  },
  postgroup: {
    id: "target's new parent",
    children: [
      { id: "0", sort: 0 },
      { id: "1", sort: 2 },
      { id: "3", sort: 3 },
    ],
  },
  prevorder: 0,
  postorder: 1,
  options: {
    bigstep: 1000, // optional, defaults to 1
    smallstep: 1, // optional, defaults to 1
  },
});
```
