"use client";

import React, { useCallback, useEffect, useMemo } from "react";
import type StorageFileApi from "@supabase/storage-js/dist/module/packages/StorageFileApi";
import { produce } from "immer";

const EMPTY_FOLDER_PLACEHOLDER_FILE = ".emptyFolderPlaceholder";

function tree(
  objects: Record<string, FileNode>
): Array<EntityNode & { children?: Array<EntityNode & { children?: any[] }> }> {
  const result: any[] = [];

  const getFolder = (nodes: any[], name: string, tokens: string[]): any => {
    let folder = nodes.find((n) => n.type === "folder" && n.name === name);
    if (!folder) {
      folder = {
        type: "folder",
        name,
        key: tokens.join("/"),
        path_tokens: tokens,
        children: [],
      };
      nodes.push(folder);
    }
    return folder;
  };

  for (const file of Object.values(objects)) {
    const tokens = file.path_tokens;
    if (tokens.length === 0) continue;
    let current = result;
    // Walk through each token in the path
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (i === tokens.length - 1) {
        // Last token: add file node (skip placeholder file)
        if (file.name === ".emptyFolderPlaceholder") break;
        current.push(file);
      } else {
        // Folder token: get or create folder node
        const folder = getFolder(current, token, tokens.slice(0, i + 1));
        current = folder.children;
      }
    }
  }

  return result;
}

type PathTokens = string[];

type MinimalFile = {
  name: string;
  size: number;
  type: string;
};

type FileNode = {
  type: "file";
  name: string;
  key: string;
  path_tokens: PathTokens;
  mimetype: string;
  size: number;
  modified?: string;
  url: string;
  thumbnail?: string;
};

type FolderNode = {
  type: "folder";
  name: string;
  key: string;
  path_tokens: PathTokens;
  size?: number;
  modified?: string;
};

type EntityNode = FileNode | FolderNode;

type _BaseFileTask = {
  id: string;
  staus: "idle" | "completed" | "failed" | "progress";
  /**
   * 0~1
   */
  progress?: number;
  file: MinimalFile;
};

type StorageEditorUploadingTask = _BaseFileTask & {
  type: "upload";
};

type StorageEditorDeletingTask = _BaseFileTask & {
  type: "delete";
};

type StorageEditorTask = StorageEditorUploadingTask | StorageEditorDeletingTask;

type StorageApi = StorageFileApi & {
  rmrf: (path: string) => Promise<any>;
};

interface StorageEditorState {
  refreshkey: number;
  dir: string;
  tasks: StorageEditorTask[];
  objects: Record<string, FileNode>;
  api: StorageApi;
}

const StorageEditorContext = React.createContext<StorageEditorState | null>(
  null
);
const StorageEditorProvider = StorageEditorContext.Provider;
const StorageEditorDispatcherContext = React.createContext<
  (action: StorageEditorAction) => void
>(() => {});
const StorageEditorDispatcherProvider = StorageEditorDispatcherContext.Provider;

function __useDispatch() {
  const context = React.useContext(StorageEditorDispatcherContext);
  if (!context) {
    throw new Error("useDispatch must be used within a StorageEditorProvider");
  }
  return context;
}

function __useStorageEditorState() {
  const context = React.useContext(StorageEditorContext);
  if (!context) {
    throw new Error(
      "useStorageEditor must be used within a StorageEditorProvider"
    );
  }
  return context;
}

type StorageEditorAction =
  | { type: "list"; dir: string; objects: Record<string, FileNode> }
  | { type: "cd"; dir: string }
  | { type: "refresh" }
  | { type: "add"; key: string; object: FileNode }
  | { type: "remove"; key: string }
  | { type: "tasks/uploading/push"; task: StorageEditorUploadingTask }
  | { type: "tasks/uploading/complete"; id: string }
  | { type: "tasks/uploading/fail"; id: string }
  | { type: "tasks/deleting/push"; task: StorageEditorDeletingTask }
  | { type: "tasks/deleting/complete"; id: string }
  | { type: "tasks/deleting/fail"; id: string };

function reducer(
  state: StorageEditorState,
  action: StorageEditorAction
): StorageEditorState {
  return produce(state, (draft) => {
    switch (action.type) {
      case "list": {
        // seed objects in dir
        Object.assign(draft.objects, action.objects);
        break;
      }
      case "cd": {
        draft.dir = action.dir;
        break;
      }
      case "add": {
        const { key, object } = action;
        draft.objects[key] = { ...object, key };
        break;
      }
      case "remove": {
        delete draft.objects[action.key];
        break;
      }
      case "refresh": {
        draft.refreshkey++;
        break;
      }
      case "tasks/uploading/push": {
        draft.tasks.push(action.task);
        break;
      }
      case "tasks/uploading/complete": {
        const t = draft.tasks.find((task) => task.id === action.id);
        if (t) {
          t.staus = "completed";
          t.progress = 1;
        }
        break;
      }
      case "tasks/uploading/fail": {
        const t = draft.tasks.find((task) => task.id === action.id);
        if (t) {
          t.staus = "failed";
          t.progress = 0;
        }
        break;
      }
      case "tasks/deleting/push": {
        draft.tasks.push(action.task);
        break;
      }
      case "tasks/deleting/complete": {
        const t = draft.tasks.find((task) => task.id === action.id);
        if (t) {
          t.staus = "completed";
          t.progress = 1;
        }
        break;
      }
      case "tasks/deleting/fail": {
        const t = draft.tasks.find((task) => task.id === action.id);
        if (t) {
          t.staus = "failed";
          t.progress = 0;
        }
        break;
      }
    }
  });
}

interface IStorageEditor extends Omit<StorageEditorState, "objects" | "api"> {
  nodes: EntityNode[];
  upload: (file: File) => Promise<any>;
  mkdir: (name: string) => Promise<any>;
  cd: (dir: string) => void;
  mv: (path: string, newPath: string) => Promise<any>;
  // download: (path: string) => Promise<any>;
  list: (path: string) => Promise<any>;
  refresh: () => void;
  rm: (path: string, recursive?: boolean) => Promise<any>;
}

function useStorageEditor(): IStorageEditor {
  const {
    dir,
    refreshkey,
    objects: __all_nodes,
    tasks,
    api,
  } = __useStorageEditorState();
  const dispatch = __useDispatch();

  const root = useMemo(() => tree(__all_nodes), [__all_nodes]);

  const current_dir_nodes: EntityNode[] = useMemo(() => {
    if (!dir) return root;
    const tokens = dir.split("/").filter(Boolean);
    let current = root;
    for (const token of tokens) {
      const folder = current.find(
        (node) => node.type === "folder" && node.name === token
      );
      if (!folder || !folder.children) return [];
      current = folder.children;
    }
    return current;
  }, [dir, root]);

  const __list = useCallback(
    async (dir: string, objects: Record<string, FileNode>) => {
      dispatch({ type: "list", dir, objects });
    },
    [dispatch]
  );

  const __cd = useCallback(
    (dir: string) => {
      dispatch({ type: "cd", dir });
    },
    [dispatch]
  );

  const __refresh = useCallback(() => {
    dispatch({ type: "refresh" });
  }, [dispatch]);

  const __add = useCallback(
    (key: string, object: FileNode) => {
      dispatch({ type: "add", key, object });
    },
    [dispatch]
  );

  const __remove = useCallback(
    (key: string) => {
      dispatch({ type: "remove", key });
    },
    [dispatch]
  );

  const __task_push_uploading = useCallback(
    (id: string, file: File) => {
      dispatch({
        type: "tasks/uploading/push",
        task: { type: "upload", id: id, staus: "progress", progress: 0, file },
      });
    },
    [dispatch]
  );

  const __task_complete_uploading = useCallback(
    (id: string) => {
      dispatch({ type: "tasks/uploading/complete", id });
    },
    [dispatch]
  );

  const __task_fail_uploading = useCallback(
    (id: string) => {
      dispatch({ type: "tasks/uploading/fail", id });
    },
    [dispatch]
  );

  const __task_push_deleting = useCallback(
    (id: string, file: MinimalFile) => {
      dispatch({
        type: "tasks/deleting/push",
        task: { type: "delete", id, staus: "progress", file },
      });
    },
    [dispatch]
  );

  const __task_complete_deleting = useCallback(
    (id: string) => {
      dispatch({ type: "tasks/deleting/complete", id });
    },
    [dispatch]
  );

  const __task_fail_deleting = useCallback(
    (id: string) => {
      dispatch({ type: "tasks/deleting/fail", id });
    },
    [dispatch]
  );

  const upload = useCallback(
    async (file: File, _dir: string = dir) => {
      const key = _dir ? `${_dir}/${file.name}` : file.name;
      __task_push_uploading(key, file);

      const { data, error } = await api.upload(key, file);
      if (error) {
        //
        __task_fail_uploading(key);
      } else {
        //
        const url = api.getPublicUrl(key).data.publicUrl;

        // await __mock_elay();
        // const url = URL.createObjectURL(file);
        const newFile: EntityNode = {
          type: "file",
          name: file.name,
          key: key,
          path_tokens: key.split("/").filter(Boolean),
          mimetype: file.type,
          size: file.size,
          modified: new Date().toISOString(),
          url: url,
          thumbnail: url,
        };
        __add(key, newFile);
        __task_complete_uploading(key);
        return newFile;
      }
    },
    [
      api,
      dir,
      __add,
      __task_push_uploading,
      __task_complete_uploading,
      __task_fail_uploading,
    ]
  );

  const mkdir = useCallback(
    async (name: string) => {
      const newdir = `${dir}/${name}`;
      upload(
        new File([], EMPTY_FOLDER_PLACEHOLDER_FILE, {
          type: "application/octet-stream",
        }),
        newdir
      );
    },
    [dir, upload]
  );

  const mv = useCallback(
    async (from: string, to: string) => {
      const { data, error } = await api.move(from, to);
      const file = __all_nodes[from];
      if (!file) return;
      __add(to, file);
      __remove(from);
    },
    [api, __all_nodes, __add, __remove]
  );

  const rm = useCallback(
    async (key: string, recursive?: boolean) => {
      const file = __all_nodes[key];

      if (!file || file.type !== "file") return;
      __task_push_deleting(key, {
        name: file.name,
        size: file.size,
        type: file.type,
      });

      const { data, error } = await api.remove([key]);

      if (error) {
        __task_fail_deleting(key);
        return;
      }

      __remove(key);
      __task_complete_deleting(key);
    },
    [
      api,
      __all_nodes,
      __task_push_deleting,
      __remove,
      __task_complete_deleting,
      __task_fail_deleting,
    ]
  );

  const list = useCallback(
    async (path: string) => {
      const { data, error } = await api.list(path);
      if (error) {
        console.error("[error while list]", error);
        return;
      }

      const objects = data.reduce(
        (acc, maybefile) => {
          const id = maybefile.id;
          if (id === null) {
            // if id === null, it means it's a folder with .emptyFolderPlaceholder file
            // the client does not return the .emptyFolderPlaceholder file
            const key = [
              path,
              maybefile.name,
              EMPTY_FOLDER_PLACEHOLDER_FILE,
            ].join("/");
            acc[key] = {
              type: "file",
              name: EMPTY_FOLDER_PLACEHOLDER_FILE,
              key: key,
              path_tokens: key.split("/").filter(Boolean),
              mimetype: "application/octet-stream",
              size: 0,
              modified: new Date().toISOString(),
              url: "",
              thumbnail: "",
            };
            return acc;
          }
          const name = maybefile.name;
          const key = [path, maybefile.name].join("/");
          const url = api.getPublicUrl(key).data.publicUrl;
          acc[key] = {
            type: "file",
            name: name,
            key: key,
            path_tokens: key.split("/").filter(Boolean),
            mimetype: maybefile.metadata["mimetype"],
            size: maybefile.metadata["size"],
            modified: maybefile.metadata["lastModified"],
            url: url,
            thumbnail: url,
          };
          return acc;
        },
        {} as Record<string, FileNode>
      );

      __list(path, objects);
    },
    [api, __list]
  );

  // #region lifecycle hooks
  useEffect(() => {
    // [list & seed]
    list(dir);
    // console.log("seed", dir, data, error);
  }, [dir, list, refreshkey]);
  // #endregion

  return {
    refreshkey,
    dir,
    tasks,
    nodes: current_dir_nodes,
    upload,
    mkdir,
    cd: __cd,
    mv,
    rm,
    refresh: __refresh,
    list,
  };
}

function generatePaths(segments: string[]): PathTokens[] {
  return segments.map((_, i) => segments.slice(0, i + 1));
}

export {
  reducer,
  generatePaths,
  StorageEditorProvider,
  StorageEditorDispatcherProvider,
  useStorageEditor,
  StorageEditorProvider as default,
};

export type {
  FileNode,
  StorageApi,
  StorageEditorTask,
  StorageEditorUploadingTask,
  EntityNode,
};
