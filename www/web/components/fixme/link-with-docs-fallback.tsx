import React from "react";
import Link from "next/link";

export function LinkWithDocsFallback({
  href,
  children,
  ...props
}: React.ComponentProps<typeof Link>) {
  const do_fallback_docs = String(href).startsWith("/docs");

  return (
    <Link href={href} locale={do_fallback_docs ? "en" : undefined} {...props}>
      {children}
    </Link>
  );
}
