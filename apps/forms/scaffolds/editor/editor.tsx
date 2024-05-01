"use client";

import React, { useCallback, useEffect, useMemo } from "react";
import { StateProvider, useEditorState } from "./provider";
import { reducer } from "./reducer";
import {
  FormEditorInit,
  FormEditorState,
  initialFormEditorState,
} from "./state";
import { FieldEditPanel, FormFieldSave } from "../panels/field-edit-panel";
import { FormFieldDefinition, FormFieldInit } from "@/types";
import { createClientFormsClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";
import { FormFieldUpsert, EditorApiResponse } from "@/types/private/api";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { ResponseEditPanel } from "../panels/response-edit-panel";
import { fmt_hashed_local_id } from "@/utils/fmt";
import { CustomerEditPanel } from "../panels/customer-panel";

export function FormEditorProvider({
  initial,
  children,
}: React.PropsWithChildren<{ initial: FormEditorInit }>) {
  const [state, dispatch] = React.useReducer(
    reducer,
    initialFormEditorState(initial)
  );

  return (
    <StateProvider state={state} dispatch={dispatch}>
      <TooltipProvider>
        <FieldEditPanelProvider>
          <ResponseEditPanelProvider>
            <CustomerPanelProvider>{children}</CustomerPanelProvider>
          </ResponseEditPanelProvider>
        </FieldEditPanelProvider>
      </TooltipProvider>
    </StateProvider>
  );
}

export function InitialResponsesProvider({
  children,
}: React.PropsWithChildren<{}>) {
  const [state, dispatch] = useEditorState();

  const supabase = useMemo(() => createClientFormsClient(), []);

  const initially_fetched_responses = React.useRef(false);

  const fetchResponses = useCallback(
    async (limit: number = 100) => {
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
        .order("local_id")
        .limit(limit);

      if (error) {
        throw new Error();
      }

      return data;
    },
    [supabase, state.form_id]
  );

  useEffect(() => {
    // initially fetch the responses
    // this should be done only once
    if (initially_fetched_responses.current) {
      return;
    }

    initially_fetched_responses.current = true;

    const feed = fetchResponses(state.responses_pagination_rows).then(
      (data) => {
        dispatch({
          type: "editor/response/feed",
          data: data,
          reset: true,
        });
      }
    );

    toast.promise(feed, {
      loading: "Fetching responses...",
      success: "Responses fetched",
      error: "Failed to fetch responses",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, fetchResponses]);

  // TODO: this gets called twice after the first hook, initially.
  useEffect(() => {
    // re-fetch when the pagination rows change, only if the initial fetch is done
    if (!initially_fetched_responses.current) {
      return;
    }

    const feed = fetchResponses(state.responses_pagination_rows).then(
      (data) => {
        dispatch({
          type: "editor/response/feed",
          data: data,
          reset: true,
        });
      }
    );

    toast.promise(feed, {
      loading: "Fetching responses...",
      success: "Responses fetched",
      error: "Failed to fetch responses",
    });
  }, [dispatch, fetchResponses, state.responses_pagination_rows]);

  return <>{children}</>;
}

export function FormResponsesProvider({
  children,
}: React.PropsWithChildren<{}>) {
  const [state, dispatch] = useEditorState();

  const supabase = useMemo(() => createClientFormsClient(), []);

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

          // if deleted, the `new` is empty object `{}`
          const new_id: string | undefined = (_new as { id: string }).id;

          if (new_id) {
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

              toast.promise(
                newresponse,
                {
                  loading: "Fetching new response...",
                  success: "New response",
                  error: "Failed to fetch new response",
                },
                { id: new_id }
              );
            }, 1000);
          } else {
            // deleted
            dispatch({
              type: "editor/response/delete",
              id: (old as { id: string }).id,
            });
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
    (init: FormFieldSave) => {
      const data: FormFieldUpsert = {
        ...init,
        options: init.options?.length ? init.options : undefined,
        //
        id: state.focus_field_id ?? undefined,
        form_id: state.form_id,
        data: init.data,
      };

      console.log("[EDITOR] saving..", data);

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
        enableAI={!is_existing_field}
        mode={is_existing_field ? "edit" : "new"}
        formResetKey={state.field_edit_panel_refresh_key}
        init={
          field
            ? {
                id: field.id,
                name: field.name,
                type: field.type,
                label: field.label ?? "",
                help_text: field.help_text ?? "",
                placeholder: field.placeholder ?? "",
                required: field.required,
                pattern: field.pattern,
                autocomplete: field.autocomplete,
                data: field.data,
                accept: field.accept,
                multiple: field.multiple ?? undefined,
                options: field.options,
                // TODO: add inventory support
                // options_inventory: undefined,
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

function ResponseEditPanelProvider({ children }: React.PropsWithChildren<{}>) {
  const [state, dispatch] = useEditorState();

  const response = useMemo(() => {
    return state.responses?.find((r) => r.id === state.focus_response_id);
  }, [state.responses, state.focus_response_id]);

  return (
    <>
      <ResponseEditPanel
        key={response?.id}
        title={`Response ${response?.local_id ? fmt_hashed_local_id(response?.local_id) : ""}`}
        open={state.is_response_edit_panel_open}
        init={{ response, field_defs: state.fields }}
        onOpenChange={(open) => {
          dispatch({ type: "editor/responses/edit", open });
        }}
      />
      {children}
    </>
  );
}

function CustomerPanelProvider({ children }: React.PropsWithChildren<{}>) {
  const [state, dispatch] = useEditorState();

  const customer = useMemo(() => {
    return state.responses?.find((r) => r.id === state.focus_customer_id);
  }, [state.responses, state.focus_customer_id]);

  return (
    <>
      <CustomerEditPanel
        key={customer?.id}
        title={`Response ${customer?.local_id ? fmt_hashed_local_id(customer?.local_id) : ""}`}
        open={state.is_customer_edit_panel_open}
        // init={{ response: customer, field_defs: state.fields }}
        onOpenChange={(open) => {
          dispatch({ type: "editor/customers/edit", open });
        }}
      />
      {children}
    </>
  );
}
