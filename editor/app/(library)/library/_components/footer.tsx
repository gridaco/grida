import React from "react";
import { GridaLogo } from "@/components/grida-logo";
import Link from "next/link";

export default function LibraryFooter() {
  return (
    <footer className="flex flex-col items-center justify-center gap-2 p-4 bg-background py-20">
      <GridaLogo className="size-4" />
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <Link href="/library/license" className="hover:underline">
          License
        </Link>
        <Link href="/library/random" className="hover:underline">
          Random
        </Link>
        <Link href="/tools" className="hover:underline">
          Tools
        </Link>
      </div>
    </footer>
  );
}
