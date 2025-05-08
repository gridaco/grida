"use client";

import React, { useCallback, useEffect, useMemo } from "react";
import { produce } from "immer";
import { vfs } from "@/lib/vfs";
import type { StorageClient } from "@supabase/storage-js";

type StorageFileApi = ReturnType<StorageClient["from"]>;

const EMPTY_FOLDER_PLACEHOLDER_FILE = ".emptyFolderPlaceholder";

type MinimalFile = {
  name: string;
  size: number;
  type: string;
};

type _BaseFileTask = {
  id: string;
  staus: "idle" | "completed" | "failed" | "progress";
  /**
   * 0~1
   */
  progress?: number;
  reason?: string;
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
  loading: boolean;
  /**
   * bucket id
   */
  bucket_id: string;

  /**
   * bucket is public
   */
  public: boolean;

  /**
   * refresh key to refresh (list) current dir
   */
  refreshkey: number;

  /**
   * base path of the storage, relative to the bucket
   */
  basepath: string;

  /**
   * current directory
   */
  dir: string;

  /**
   * absolute directory (basepath + dir)
   */
  absdir: string;

  tasks: StorageEditorTask[];
  objects: Record<string, vfs.FileNode>;
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
  const dispatch = React.useContext(StorageEditorDispatcherContext);
  if (!dispatch) {
    throw new Error("useDispatch must be used within a StorageEditorProvider");
  }

  const __set_loading = useCallback(
    async (loading: boolean) => {
      dispatch({ type: "loading", loading });
    },
    [dispatch]
  );

  const __list = useCallback(
    async (dir: string | string[], objects: Record<string, vfs.FileNode>) => {
      dispatch({ type: "list", dir: vfs.pathstr(dir), objects });
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
    (key: string, object: vfs.FileNode) => {
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
    (id: string, reason?: string) => {
      dispatch({ type: "tasks/uploading/fail", id, reason });
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

  return {
    dispatch,
    __set_loading,
    __list,
    __cd,
    __refresh,
    __add,
    __remove,
    __task_push_uploading,
    __task_complete_uploading,
    __task_fail_uploading,
    __task_push_deleting,
    __task_complete_deleting,
    __task_fail_deleting,
  };
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
  | { type: "loading"; loading: boolean }
  | { type: "list"; dir: string; objects: Record<string, vfs.FileNode> }
  | { type: "cd"; dir: string }
  | { type: "refresh" }
  | { type: "add"; key: string; object: vfs.FileNode }
  | { type: "remove"; key: string }
  | { type: "tasks/uploading/push"; task: StorageEditorUploadingTask }
  | { type: "tasks/uploading/complete"; id: string }
  | { type: "tasks/uploading/fail"; id: string; reason?: string }
  | { type: "tasks/deleting/push"; task: StorageEditorDeletingTask }
  | { type: "tasks/deleting/complete"; id: string }
  | { type: "tasks/deleting/fail"; id: string };

function reducer(
  state: StorageEditorState,
  action: StorageEditorAction
): StorageEditorState {
  return produce(state, (draft) => {
    switch (action.type) {
      case "loading": {
        draft.loading = action.loading;
        break;
      }
      case "list": {
        // seed objects in dir
        // TODO: this won't clear removed files
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
          t.reason = action.reason;
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
  root: vfs.EntityNode[];
  nodes: vfs.EntityNode[];
  upload: (file: File) => Promise<any>;
  mkdir: (name: string) => Promise<any>;
  cd: (dir: string) => void;
  mv: (path: string, newPath: string) => Promise<any>;
  // download: (path: string) => Promise<any>;
  list: (path: string | string[]) => Promise<any>;
  refresh: () => void;
  rm: (path: string, recursive?: boolean) => Promise<any>;
  getPublicUrl: (path: string) => string;
}

function useStorageEditor(): IStorageEditor {
  const {
    loading,
    bucket_id,
    public: _public,
    basepath,
    dir,
    refreshkey,
    objects: __all_nodes,
    tasks,
    api,
  } = __useStorageEditorState();

  const {
    __set_loading,
    __list,
    __cd,
    __refresh,
    __add,
    __remove,
    __task_push_uploading,
    __task_complete_uploading,
    __task_fail_uploading,
    __task_push_deleting,
    __task_complete_deleting,
    __task_fail_deleting,
  } = __useDispatch();

  const root = useMemo(() => vfs.tree(__all_nodes), [__all_nodes]);

  const absdir = useMemo(
    () => [basepath, dir].filter(Boolean).join("/"),
    [basepath, dir]
  );

  const current_dir_nodes: vfs.EntityNode[] = useMemo(() => {
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

  const abspath = useCallback(
    (path: string | string[]) =>
      [basepath, vfs.pathstr(path)].filter(Boolean).join("/"),
    [basepath]
  );

  const upload = useCallback(
    async (file: File, _dir: string = dir) => {
      const key = _dir ? `${_dir}/${file.name}` : file.name;
      __task_push_uploading(key, file);

      const { data, error } = await api.upload(abspath(key), file);
      if (error) {
        __task_fail_uploading(key, error.message);
      } else {
        //
        const url = api.getPublicUrl(abspath(key)).data.publicUrl;

        // await __mock_elay();
        // const url = URL.createObjectURL(file);
        const newFile: vfs.EntityNode = {
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
      abspath,
      dir,
      __add,
      __task_push_uploading,
      __task_complete_uploading,
      __task_fail_uploading,
    ]
  );

  const mkdir = useCallback(
    async (name: string) => {
      upload(
        new File([], EMPTY_FOLDER_PLACEHOLDER_FILE, {
          type: "application/octet-stream",
        }),
        dir + "/" + name
      );
    },
    [dir, upload]
  );

  const mv = useCallback(
    async (from: string, to: string) => {
      const { data, error } = await api.move(abspath(from), abspath(to));
      const file = __all_nodes[from];
      if (!file) return;
      __add(to, file);
      __remove(from);
    },
    [api, abspath, __all_nodes, __add, __remove]
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

      const { data, error } = await api.remove([abspath(key)]);

      if (error) {
        __task_fail_deleting(key);
        return;
      }

      __remove(key);
      __task_complete_deleting(key);
    },
    [
      api,
      abspath,
      __all_nodes,
      __task_push_deleting,
      __remove,
      __task_complete_deleting,
      __task_fail_deleting,
    ]
  );

  const list = useCallback(
    async (path: string | string[]) => {
      const { data, error } = await api.list(abspath(path));
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
          const url = api.getPublicUrl(abspath(key)).data.publicUrl;
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
        {} as Record<string, vfs.FileNode>
      );

      __list(path, objects);
    },
    [api, abspath, __list]
  );

  return {
    bucket_id,
    public: _public,
    loading,
    basepath,
    refreshkey,
    dir,
    absdir,
    tasks,
    nodes: current_dir_nodes,
    root,
    upload,
    mkdir,
    cd: __cd,
    mv,
    rm,
    refresh: __refresh,
    list,
    getPublicUrl: (p) => {
      const path = abspath(p);
      return api.getPublicUrl(path).data.publicUrl;
    },
  };
}

export function useSeedList() {
  const { __set_loading } = __useDispatch();
  const { loading, list, refreshkey, dir } = useStorageEditor();
  // #region lifecycle hooks
  useEffect(() => {
    // [list & seed]
    __set_loading(true);
    list(dir).finally(() => __set_loading(false));
  }, [list, __set_loading, dir, refreshkey]);
  // #endregion
}

export {
  reducer,
  StorageEditorProvider,
  StorageEditorDispatcherProvider,
  useStorageEditor,
  StorageEditorProvider as default,
};

export type { StorageApi, StorageEditorTask, StorageEditorUploadingTask };
