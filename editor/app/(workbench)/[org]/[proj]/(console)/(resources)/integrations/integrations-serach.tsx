"use client";

import type React from "react";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { SearchIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function IntegrationsSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") || "");
  const [isPending, startTransition] = useTransition();

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();

    startTransition(() => {
      // Create new URLSearchParams
      const params = new URLSearchParams(searchParams);

      // Update or remove the 'q' parameter based on searchQuery
      if (searchQuery) {
        params.set("q", searchQuery);
      } else {
        params.delete("q");
      }

      // Update the URL
      router.push(`/integrations?${params.toString()}`);
    });
  }

  function clearSearch() {
    setSearchQuery("");
    startTransition(() => {
      const params = new URLSearchParams(searchParams);
      params.delete("q");
      router.push(`/integrations?${params.toString()}`);
    });
  }

  return (
    <form
      onSubmit={handleSearch}
      className="relative w-full md:w-[200px] lg:w-[300px]"
    >
      <SearchIcon className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
      <Input
        type="search"
        placeholder="Search integrations..."
        className="pl-8 pr-8"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />
      {searchQuery && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-0 top-0 size-9"
          onClick={clearSearch}
        >
          <X className="size-4" />
          <span className="sr-only">Clear search</span>
        </Button>
      )}
    </form>
  );
}
