"use client";

import React, { memo, useMemo, useContext, useCallback } from "react";
import type { FormAgentState } from "./state";
import type { ClientSectionRenderBlock } from "@/lib/forms";
import {
  DispatchContext,
  useDispatch,
  type Dispatcher,
  type FlatDispatcher,
} from "./dispatch";

const Context = React.createContext<FormAgentState | undefined>(undefined);

export const StateProvider = memo(function StateProvider({
  state,
  dispatch,
  children,
}: {
  state: FormAgentState;
  dispatch?: Dispatcher;
  children?: React.ReactNode;
}) {
  return (
    <Context.Provider value={state}>
      <DispatchContext.Provider value={dispatch ?? __noop}>
        {children}
      </DispatchContext.Provider>
    </Context.Provider>
  );
});

const __noop = () => {};

export const useFormAgentState = (): [FormAgentState, FlatDispatcher] => {
  const state = useContext(Context);

  if (!state) {
    throw new Error(`No StateProvider: this is a logical error.`);
  }

  const dispatch = useDispatch();

  return useMemo(() => [state, dispatch], [state, dispatch]);
};

export const useFormAgent = () => {
  const [state, dispatch] = useFormAgentState();

  const { sections, has_sections, last_section_id, current_section_id } = state;

  const current_section = useMemo(() => {
    return sections.find((section) => section.id === current_section_id) as
      | ClientSectionRenderBlock
      | undefined;
  }, [current_section_id, sections]);

  const primary_action_override_by_payment =
    current_section?.attributes?.contains_payment ?? false;

  const submit_hidden = has_sections
    ? primary_action_override_by_payment ||
      last_section_id !== current_section_id
    : false;

  const pay_hidden = !primary_action_override_by_payment;

  const has_previous = has_sections
    ? current_section_id !== sections[0].id
    : false;
  const previous_section_button_hidden = !has_previous;

  const has_next = has_sections
    ? current_section_id !== last_section_id
    : false;
  const next_section_button_hidden =
    !has_next || primary_action_override_by_payment;

  const onPrevious = useCallback(() => {
    dispatch({ type: "section/prev" });
  }, [dispatch]);

  const onNext = useCallback(() => {
    dispatch({ type: "section/next" });
  }, [dispatch]);

  return {
    ...state,
    current_section,
    primary_action_override_by_payment,
    submit_hidden,
    pay_hidden,
    has_previous,
    previous_section_button_hidden,
    has_next,
    next_section_button_hidden,
    onPrevious,
    onNext,
  };
};
