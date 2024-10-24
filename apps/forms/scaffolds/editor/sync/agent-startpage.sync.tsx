"use client";

import React, { useEffect, useMemo } from "react";
import { createClientFormsClient } from "@/lib/supabase/client";
import { useDebounce, usePrevious } from "@uidotdev/usehooks";
import { FormStartPageSchema } from "@/types";
import { useEditorState } from "@/scaffolds/editor/use-editor";
import equal from "deep-equal";

export function useSyncFormAgentStartPage() {
  const [state] = useEditorState();
  const { document_id, documents } = state;
  const template = documents["form/startpage"]?.template;
  const debounced = useDebounce(template, 1000);
  const prev = usePrevious(debounced);
  const supabase = useMemo(() => createClientFormsClient(), []);

  useEffect(() => {
    // sync to server
    if (!equal(prev, debounced)) {
      supabase
        .from("form_document")
        .update({
          start_page: debounced
            ? ({
                $schema: "https://forms.grida.co/schemas/v1/startpage.json",
                template_id: debounced.name,
                data: debounced.values,
              } satisfies FormStartPageSchema)
            : null,
        })
        .eq("id", document_id!)
        .then(({ error }) => {
          if (error) console.error(error);
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
