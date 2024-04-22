"use client";

import FingerprintJS, { Agent, GetResult } from "@fingerprintjs/fingerprintjs";
import React, { useEffect } from "react";

export function FingerprintProvider({ children }: React.PropsWithChildren<{}>) {
  useEffect(() => {
    FingerprintJS.load().then((fp) => {
      window.fingerprint = fp;
      window.dispatchEvent(new CustomEvent("fingerprint"));
      fp.get().then((result) => {
        window.dispatchEvent(
          new CustomEvent("fingerprint", { detail: result })
        );
        // to be clear, event the same event after 100ms
        // consider moving this to receiver side.
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent("fingerprint", { detail: result })
          );
        }, 100);
      });
    });
  }, []);
  return <>{children}</>;
}

export function useFingerprint() {
  const [fp, set_fp] = React.useState<Agent | undefined>();

  const [result, set_result] = React.useState<GetResult | undefined>();

  useEffect(() => {
    // initially, if already loaded
    if (window.fingerprint) {
      set_fp(window.fingerprint);
      window.fingerprint.get().then(set_result);
    }

    const listener = (event: CustomEvent<GetResult>) => {
      set_fp(window.fingerprint);
      if (event.detail) {
        set_result(event.detail);
      }
    };
    window.addEventListener("fingerprint", listener);
    return () => {
      window.removeEventListener("fingerprint", listener);
    };
  }, []);

  return { fp, result };
}

interface CustomEventMap {
  fingerprint: CustomEvent<GetResult>;
}

declare global {
  interface Window {
    fingerprint?: Agent;
    addEventListener<K extends keyof CustomEventMap>(
      type: K,
      listener: (this: Document, ev: CustomEventMap[K]) => void
    ): void;
    removeEventListener<K extends keyof CustomEventMap>(
      type: K,
      listener: (this: Document, ev: CustomEventMap[K]) => void
    ): void;
    dispatchEvent<K extends keyof CustomEventMap>(ev: CustomEventMap[K]): void;
  }
}
