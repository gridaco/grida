import React from "react";
import Link from "next/link";

export function LinkWithDocsFallback({
  href,
  children,
}: React.PropsWithChildren<{ href: string }>) {
  const do_fallback_docs = href.startsWith("/docs");
  return (
    <Link href={href} locale={do_fallback_docs ? "en" : undefined}>
      {children}
    </Link>
  );
}
