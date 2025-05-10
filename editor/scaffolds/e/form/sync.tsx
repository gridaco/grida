"use client";

import React, { useEffect } from "react";
import { useFormAgentState } from "@/lib/formstate";
import { useDebounce, usePrevious } from "@uidotdev/usehooks";
import { Env } from "@/env";

export function SessionDataSyncProvider({
  session_id,
  children,
}: React.PropsWithChildren<{
  session_id?: string;
}>) {
  const [state] = useFormAgentState();

  const prevRecord = usePrevious(state.fields);
  const debouncedRecord = useDebounce(state.fields, 300);

  useEffect(() => {
    if (!session_id) return;
    const syncToServer = async (
      field_id: string,
      value: string | number | boolean | string[] | undefined | null
    ) => {
      try {
        fetch(`${Env.web.HOST}/v1/session/${session_id}/field/${field_id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ value: value }),
        });
      } catch (error) {}
    };

    if (prevRecord) {
      Object.keys(debouncedRecord).forEach((field) => {
        if (debouncedRecord[field] !== prevRecord[field]) {
          syncToServer(field, debouncedRecord[field].value);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedRecord]);

  return <>{children}</>;
}
