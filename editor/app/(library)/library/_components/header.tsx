"use client";

import React, { Suspense } from "react";
import { GridaLogo } from "@/components/grida-logo";
import { Input } from "@/components/ui/input";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export default function LibraryHeader() {
  return (
    <header className="flex items-center justify-between gap-4 px-4 md:px-6 py-2 sticky top-0 bg-background z-10 border-b">
      <div className="flex-none md:flex-1 flex justify-start">
        <Link href="/library">
          <GridaLogo className="size-5" />
        </Link>
      </div>
      <div className="flex-1 flex justify-center">
        <Suspense>
          <Search />
        </Suspense>
      </div>
      <div className="hidden md:flex flex-1 justify-end"></div>
    </header>
  );
}

function Search() {
  const searchParams = useSearchParams();
  const search = searchParams.get("search") || "";
  return (
    <form method="get" action="/library" className="w-full max-w-xl">
      <Input
        type="search"
        name="search"
        autoComplete="off"
        placeholder="Search"
        defaultValue={search}
        className="w-full px-4 h-12 bg-muted rounded-lg border-none"
      />
    </form>
  );
}
