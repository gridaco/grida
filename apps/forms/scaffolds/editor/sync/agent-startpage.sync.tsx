"use client";

import React, { useCallback, useEffect, useMemo } from "react";
import { createClientFormsClient } from "@/lib/supabase/client";
import { useDebounce, usePrevious } from "@uidotdev/usehooks";
import { FormStartPageSchema } from "@/types";
import { useEditorState } from "@/scaffolds/editor/use-editor";
import equal from "deep-equal";

export function useSyncFormAgentStartPage() {
  const [state, dispatch] = useEditorState();
  const { document_id, documents } = state;
  const template = documents["form/startpage"]?.template;
  const debounced = useDebounce(template, 1000);
  const prev = usePrevious(debounced);
  const supabase = useMemo(() => createClientFormsClient(), []);

  const setSaving = useCallback(
    (saving: boolean) => dispatch({ type: "saving", saving: saving }),
    [dispatch]
  );

  useEffect(() => {
    // sync to server
    if (!equal(prev, debounced)) {
      setSaving(true);
      supabase
        .from("form_document")
        .update({
          start_page: debounced
            ? ({
                __schema_version: "2024-10-24",
                ...debounced,
              } satisfies FormStartPageSchema as {})
            : null,
        })
        .eq("id", document_id!)
        .then(({ error }) => {
          if (error) console.error(error);
          setSaving(false);
        });
      return;
    }
  }, [debounced, prev, supabase, document_id]);
}

export function FormAgentStartPageSyncProvider({
  children,
}: React.PropsWithChildren<{}>) {
  useSyncFormAgentStartPage();
  return <>{children}</>;
}
