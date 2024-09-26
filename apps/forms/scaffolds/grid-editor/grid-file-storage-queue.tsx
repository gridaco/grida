import QueueProvider, { useQueue } from "@/lib/p-queue";
import React, { useEffect, useMemo } from "react";
import type { DataGridFileRef } from "../grid";

type FileStorageQueryTask = {
  provider: string;
  bucket: string;
  paths: string[];
};

type FileStorageQueryResult = {
  attribute: string;
  pk: string;
  files: DataGridFileRef[];
  //
};

export function GridFileStorageQueueProvider({
  children,
}: React.PropsWithChildren<{}>) {
  const resolver = async (t: FileStorageQueryTask) => {
    return { data: [], error: null };
  };

  return (
    <QueueProvider<FileStorageQueryTask, FileStorageQueryTask>
      batch={50}
      throttle={250}
      config={{}}
      resolver={resolver}
    >
      {children}
    </QueueProvider>
  );
}

export function useGridFileStorageQueue() {
  return useQueue<FileStorageQueryResult, FileStorageQueryTask>();
}

export function useFiles(key: {
  attribute: string;
  pk: string;
}): DataGridFileRef[] | null {
  const { store, add } = useGridFileStorageQueue();

  const files = useMemo(() => {
    const it = store.find(
      (t) =>
        t.data && t.data.attribute === key.attribute && t.data.pk === key.pk
    );
    if (it && it.data) {
      return it.data.files;
    }
  }, [store, key]);

  useEffect(() => {
    if (files) return;
    add({ provider: "", bucket: "", paths: [] });
  }, [key, files]);

  return files || null;
}
