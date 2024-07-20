"use client";

import React from "react";
import { useSearchParams } from "next/navigation";

export function SupportsDarkMode({ children }: React.PropsWithChildren<{}>) {
  const searchParams = useSearchParams();

  const qdark = searchParams.get("dark");
  const isDark = qdark === "true" || qdark === "1";

  return <div className={isDark ? "dark" : ""}>{children}</div>;
}
