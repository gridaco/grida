import produce from "immer";
import path from "path";
import type {
  Action,
  FilterAction,
  FoldAction,
  FoldAllAction,
  MakeDirAction,
  MoveAction,
  NewSectionAction,
  UnfoldAction,
  UnfoldAllAction,
} from "./action";
import type { DashboardFolderItem, DashboardState } from "./state";

export function reducer(state: DashboardState, action: Action): DashboardState {
  switch (action.type) {
    case "hierarchy/new-section": {
      const { name } = <NewSectionAction>action;
      return produce(state, (draft) => {
        draft.hierarchy.sections.push({
          $type: "folder",
          name: name,
          id: name, // add confliction check
          path: name, // add confliction check
          contents: [],
        });
      });
    }

    case "filter": {
      const { query } = <FilterAction>action;
      return produce(state, (draft) => {
        draft.filter.query = query;
        // TODO:
        // draft.hierarchy
      });
    }

    case "hierarchy/mkdir": {
      const { cwd: dirname, name: seedname } = <MakeDirAction>action;
      return produce(state, (draft) => {
        const dir = draft.hierarchy.sections.find((s) => s.path === dirname);

        const siblings = dir?.contents.filter((c) => c.$type == "folder") || [];
        const name = newDirName({
          seed: seedname,
          siblings: siblings.map((s) => s.name as string),
        });

        const path = `${dirname}/${name}`;
        if (dir) {
          dir.contents.push({
            $type: "folder",
            name: name,
            id: path,
            path: path,
            contents: [],
          });
        }
      });
    }

    case "hierarchy/mv": {
      const { source, dest } = <MoveAction>action;

      console.log("move", source, dest);
      return produce(state, (draft) => {
        // // 1. check if dest is a valid directory
        // const destFolder = findFolder(dest, {
        //   directories: state.hierarchy.sections,
        // });
        // console.log("destDir", destFolder);
        // if (!destFolder) {
        //   return;
        // }
        // // 2. move each source under dest
        // for (const src of source) {
        //   console.log("moving", src, "to", dest);
        //   const srcFolder = draft.hierarchy.sections.find(
        //     (s) => s.path === src
        //   );
        //   const srcParent = draft.hierarchy.sections.find((s) =>
        //     s.contents.find((c) => c.path === src)
        //   );
        //   if (!srcParent) {
        //     continue;
        //   }
        //   // 2.1 remove src from srcParent
        //   srcParent.contents = srcParent.contents.filter(
        //     (c) => c.path !== srcFolder.path
        //   );
        //   // 2.2 add src to dest
        //   destFolder.contents.push(srcFolder);
        //   console.log("srcParent", srcParent);
        //   console.log("destDir", destFolder);
        // }
      });
    }

    case "hierarchy/fold": {
      const { path } = <FoldAction>action;
      return produce(state, (draft) => {
        draft.hierarchyFoldings.push(path);
      });
    }

    case "hierarchy/unfold": {
      const { path } = <UnfoldAction>action;
      return produce(state, (draft) => {
        draft.hierarchyFoldings = draft.hierarchyFoldings.filter(
          (p) => p !== path
        );
      });
    }

    case "hierarchy/fold-all": {
      const {} = <FoldAllAction>action;
      return produce(state, (draft) => {
        draft.hierarchyFoldings = state.hierarchy.sections.map((s) => s.path);
      });
    }

    case "hierarchy/unfold-all": {
      const {} = <UnfoldAllAction>action;
      return produce(state, (draft) => {
        draft.hierarchyFoldings.length = 0;
      });
    }
  }

  throw new Error(
    `[dashboard/reducer] - unknown action type "${action["type"]}"`
  );
}

/**
 * if seedname not provided, get confliction free initial name with format "Untitled" or "Untitled (n)"
 * if seedname provided, get confliction free name with format "seedname" or "seedname (n)"
 * @param seed
 * @param siblings
 */
function newDirName({
  seed = "Untitled folder",
  siblings,
}: {
  seed?: string | undefined;
  siblings: Array<string>;
}): string {
  if (siblings.indexOf(seed) === -1) {
    return seed;
  }

  let i = 1;
  while (true) {
    const name = `${seed} (${i})`;
    if (siblings.indexOf(name) === -1) {
      return name;
    }
    i++;
  }
}

/**
 * find item under hierarchy
 *
 * @param directories the root directories to begin search with. it will loop recursively through all directories
 */
function findFolder(
  path: string,
  { directories }: { directories: Array<DashboardFolderItem> }
) {
  for (const dir of directories) {
    if (dir.path === path) {
      return dir;
    }

    if (dir.$type === "folder") {
      const found = findFolder(path, {
        directories: dir.contents.filter(
          (d) => d.$type === "folder"
        ) as Array<DashboardFolderItem>,
      });
      if (found) {
        return found;
      }
    }
  }
}

// Visual File system
// mv
// mkdir
// rm
// rename
// fold
// unfold
// order
// tag
// search
