"use client";

import React, { useCallback, useEffect, useMemo } from "react";
import { StateProvider, useEditorState } from "./provider";
import { reducer } from "./reducer";
import { FormEditorState } from "./state";
import { FieldEditPanel } from "../panels/field-edit-panel";
import { FormFieldDefinition, NewFormFieldInit } from "@/types";
import { createClientClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";
import { FormFieldUpsert, EditorApiResponse } from "@/types/private/api";

export function FormEditorProvider({
  initial,
  children,
}: React.PropsWithChildren<{ initial: FormEditorState }>) {
  const [state, dispatch] = React.useReducer(reducer, initial);

  return (
    <StateProvider state={state} dispatch={dispatch}>
      <FormResponsesProvider>
        <FieldEditPanelProvider>{children}</FieldEditPanelProvider>
      </FormResponsesProvider>
    </StateProvider>
  );
}

function FormResponsesProvider({ children }: React.PropsWithChildren<{}>) {
  const [state, dispatch] = useEditorState();

  const supabase = useMemo(() => createClientClient(), []);

  const fetchResponses = useCallback(async () => {
    // fetch the responses
    const { data, error } = await supabase
      .from("response")
      .select(
        `
            *,
            fields:response_field(*)
        `
      )
      .eq("form_id", state.form_id)
      .limit(state.responses_pagination_rows ?? 100);

    if (error) {
      throw new Error();
    }

    return data;
  }, [supabase, state.responses_pagination_rows, state.form_id]);

  const fetchResponse = useCallback(
    async (id: string) => {
      const { data, error } = await supabase
        .from("response")
        .select(
          `
            *,
            fields:response_field(*)
          `
        )
        .eq("id", id)
        .single();

      if (error) {
        throw new Error();
      }

      return data;
    },
    [supabase]
  );

  const initially_fetched_responses = React.useRef(false);

  useEffect(() => {
    // initially fetch the responses
    // this should be done only once
    if (initially_fetched_responses.current) {
      return;
    }

    initially_fetched_responses.current = true;

    const feed = fetchResponses().then((data) => {
      dispatch({
        type: "editor/response/feed",
        data: data,
      });
    });

    toast.promise(feed, {
      loading: "Fetching responses...",
      success: "Responses fetched",
      error: "Failed to fetch responses",
    });
  }, [dispatch, fetchResponses]);

  useEffect(() => {
    const changes = supabase
      .channel("table-filter-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "grida_forms",
          table: "response",
          filter: `form_id=eq.${state.form_id}`,
        },
        (payload) => {
          const { old, new: _new } = payload;

          if (_new) {
            // fetch the response in detail (delay is required for nested fields to be available)
            setTimeout(() => {
              const newresponse = fetchResponse(
                (_new as { id: string }).id
              ).then((data) => {
                console.log("new response", data);
                dispatch({
                  type: "editor/response/feed",
                  data: [data],
                });
              });

              toast.promise(newresponse, {
                loading: "Fetching new response...",
                success: "New response fetched",
                error: "Failed to fetch new response",
              });
            }, 1000);
          }
        }
      )
      .subscribe();

    return () => {
      changes.unsubscribe();
    };
  }, [dispatch, fetchResponse, state.form_id, supabase]);

  return <>{children}</>;
}

function FieldEditPanelProvider({ children }: React.PropsWithChildren<{}>) {
  const [state, dispatch] = useEditorState();

  const field = useMemo(() => {
    return state.fields.find((f) => f.id === state.focus_field_id);
  }, [state.focus_field_id, state.fields]);

  const closeFieldPanel = useCallback(
    (options: { refresh: boolean }) => {
      dispatch({
        type: "editor/field/edit",
        open: false,
        refresh: options.refresh,
      });
    },
    [dispatch]
  );

  const onSaveField = useCallback(
    (init: NewFormFieldInit) => {
      const data: FormFieldUpsert = {
        ...init,
        options: init.options?.length ? init.options : undefined,
        //
        id: state.focus_field_id,
        form_id: state.form_id,
      };

      console.log("saving..", data);

      const promise = fetch("/private/editor/fields", {
        body: JSON.stringify(data),
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      })
        .then(async (res) => {
          if (!res.ok) {
            throw new Error("Failed to save field");
          }

          const { data } =
            (await res.json()) as EditorApiResponse<FormFieldDefinition>;

          // else save the field
          dispatch({
            type: "editor/field/save",
            field_id: data.id,
            data: data,
          });
        })
        .finally(() => {
          closeFieldPanel({ refresh: true });
        });

      toast.promise(promise, {
        loading: "Saving field...",
        success: "Field saved",
        error: "Failed to save field",
      });
    },
    [closeFieldPanel, state.form_id, state.focus_field_id, dispatch]
  );

  const is_existing_field = !!field;

  return (
    <>
      <FieldEditPanel
        key={field?.name || state.field_edit_panel_refresh_key}
        open={state.is_field_edit_panel_open}
        title={is_existing_field ? "Edit Field" : "New Field"}
        disableAI={is_existing_field}
        formResetKey={state.field_edit_panel_refresh_key}
        init={
          field
            ? {
                name: field.name,
                type: field.type,
                label: field.label ?? "",
                helpText: field.help_text ?? "",
                placeholder: field.placeholder ?? "",
                // options: field.options,
                required: field.required,
              }
            : undefined
        }
        onOpenChange={(open) => {
          dispatch({ type: "editor/field/edit", open });
        }}
        onSave={onSaveField}
      />

      {children}
    </>
  );
}
