"use client";

import React, { useCallback, useEffect, useMemo } from "react";
import { createBrowserFormsClient } from "@/lib/supabase/client";
import { useDebounce, usePrevious } from "@uidotdev/usehooks";
import type { FormStartPageSchema } from "@/grida-forms-hosted/types";
import { useEditorState } from "@/scaffolds/editor/use-editor";
import equal from "deep-equal";

export function useSyncFormAgentStartPage() {
  const [state, dispatch] = useEditorState();
  const { document_id, documents } = state;
  const startpagestate = documents["form/startpage"]?.state;
  const document = startpagestate?.document;
  const debounced = useDebounce(document, 1000);
  const prev = usePrevious(debounced);
  const supabase = useMemo(() => createBrowserFormsClient(), []);

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
                __schema_version: "0.0.1-beta.1+20250303",
                template_id: startpagestate!.template_id,
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
