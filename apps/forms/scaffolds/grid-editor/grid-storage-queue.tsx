import QueueProvider, { useQueue } from "@/lib/p-queue";
import React from "react";

type FileStorageQueryTask = {};
type FileStorageQueryResult = {};

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

export function useGridFileStorage() {
  return useQueue<FileStorageQueryResult, FileStorageQueryTask>();
}
