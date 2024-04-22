"use client";

import { useFingerprint } from "@/scaffolds/fingerprint";
import React, { useEffect, useState } from "react";

export function FormLoading({ children }: React.PropsWithChildren<{}>) {
  const [loading, setLoading] = useState(true);

  const { result } = useFingerprint();

  useEffect(() => {
    if (result?.visitorId) {
      setLoading(false);
    }
  }, [result?.visitorId]);

  if (loading) {
    return <></>;
  }

  return <>{children}</>;
}
