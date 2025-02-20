"use client";
import { useFormAgentState } from "@/lib/formstate";
import { usePrevious } from "@uidotdev/usehooks";
import React, { useEffect } from "react";
import { FormAgentMessagingInterface } from "./emit";
import equal from "deep-equal";

/**
 * This shall be provided on top of every form agent context pages, including
 * - formview
 * - complete
 * - error
 * - ...
 *
 * This emmits window related events including..
 * - hashchange
 * - popstate
 */
export function FormAgentGlobalWindowMessagingInterface({
  children,
}: React.PropsWithChildren<{}>) {
  useEffect(() => {
    const cb_onload_interface_ready = () => {
      console.log("[MESSAGE] | forms.grida.co | onload");
      FormAgentMessagingInterface.emit({
        type: "form_view_loaded",
        loaded: true,
      });

      FormAgentMessagingInterface.emit({
        type: "messaging_interface_ready",
        ready: true,
        initial: true,
      });
    };

    const cb_hashchange = (ev: HashChangeEvent) => {
      console.log("[MESSAGE] | forms.grida.co | hashchange", ev);
      FormAgentMessagingInterface.emit({
        type: "hashchange",
        newURL: ev.newURL,
        oldURL: ev.oldURL,
      });
    };

    const cb_popstate = (ev: PopStateEvent) => {
      FormAgentMessagingInterface.emit({ type: "popstate" });
    };

    // Check if the document is already loaded
    if (document.readyState === "complete") {
      cb_onload_interface_ready(); // Manually invoke if already loaded
    } else {
      window.addEventListener("load", cb_onload_interface_ready);
    }

    window.addEventListener("hashchange", cb_hashchange);
    window.addEventListener("popstate", cb_popstate);
    // window.addEventListener('submit') // this is handled by formview

    return () => {
      window.removeEventListener("hashchange", cb_hashchange);
      window.removeEventListener("popstate", cb_popstate);
    };
  }, []);

  return <>{children}</>;
}

export function FormAgentMessagingInterfaceProvider() {
  const [state] = useFormAgentState();
  const prevRecord = usePrevious(state);

  useEffect(() => {
    if (!prevRecord) return;
    if (equal(prevRecord.fields, state.fields)) return;
    FormAgentMessagingInterface.emit({
      type: "change",
      ...state,
    });
  }, [prevRecord, state]);

  return <></>;
}
