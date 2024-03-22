"use client";

import FingerprintJS, { Agent } from "@fingerprintjs/fingerprintjs";
import React, { useEffect } from "react";

export function FingerprintProvider({ children }: React.PropsWithChildren<{}>) {
  useEffect(() => {
    FingerprintJS.load().then((fp) => {
      window.fingerprint = fp;
    });
  }, []);
  return <>{children}</>;
}

declare global {
  interface Window {
    fingerprint?: Agent;
  }
}
