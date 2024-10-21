"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef } from "react";
import { createClientFormsClient } from "@/lib/supabase/client";
import { usePrevious } from "@uidotdev/usehooks";
import equal from "deep-equal";
import { FormPageBackgroundSchema, FormStyleSheetV1Schema } from "@/types";
import { useEditorState } from "../use-editor";

/**
 * sync agent theme to server
 */
export function useSyncFormAgenthTheme() {
  const [state] = useEditorState();
  const { document_id, theme } = state;
  const prev = usePrevious(state.theme);
  const supabase = useMemo(() => createClientFormsClient(), []);

  useEffect(() => {
    if (!prev) {
      return;
    }

    // sync theme to server

    if (!equal(prev, state.theme)) {
      supabase
        .from("form_document")
        .update({
          lang: theme.lang,
          is_powered_by_branding_enabled: theme.is_powered_by_branding_enabled,
          stylesheet: {
            appearance: theme.appearance,
            custom: theme.customCSS,
            "font-family": theme.fontFamily,
            palette: theme.palette,
            section: theme.section,
          } satisfies FormStyleSheetV1Schema,
          background: theme.background satisfies
            | FormPageBackgroundSchema
            | undefined as {},
        })
        .eq("id", document_id!)
        .then(({ error }) => {
          if (error) console.error(error);
        });
      return;
    }
  }, [
    state.theme,
    prev,
    supabase,
    document_id,
    theme.is_powered_by_branding_enabled,
    theme.lang,
    theme.appearance,
    theme.customCSS,
    theme.fontFamily,
    theme.palette,
    theme.section,
    theme.background,
  ]);
}

export function FormAgentThemeSyncProvider({
  children,
}: React.PropsWithChildren<{}>) {
  useSyncFormAgenthTheme();
  return <>{children}</>;
}
