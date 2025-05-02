"use client";

import React from "react";
import { GridaLogo } from "@/components/grida-logo";
import { Input } from "@/components/ui/input";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export default function LibraryHeader() {
  const searchParams = useSearchParams();
  const search = searchParams.get("search") || "";
  return (
    <header className="flex items-center justify-between px-6 py-2 sticky top-0 bg-background z-10 border-b">
      <div className="flex-1 flex justify-start">
        <Link
          href="/home"
          className="text-2xl font-semibold flex items-center gap-2"
        >
          <GridaLogo />
        </Link>
      </div>
      <div className="flex-1 flex justify-center">
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
      </div>
      <div className="flex-1 flex justify-end"></div>
    </header>
  );
}
