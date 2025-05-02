"use client";

import React, { useEffect, useState } from "react";
import { listCategories } from "../actions";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Library } from "@/lib/library";
import Link from "next/link";

//

function useCategories() {
  const [categories, setCategories] = useState<Library.Category[] | undefined>(
    undefined
  );
  useEffect(() => {
    listCategories().then((categories) => {
      setCategories(categories);
    });
  }, []);

  return categories;
}

export default function Categories() {
  const categories = useCategories();

  return (
    <div className="flex flex-wrap gap-2">
      {categories ? (
        <>
          {categories?.map((category) => (
            <Link key={category.id} href={`/library/${category.id}`}>
              <Badge
                variant="secondary"
                className="h-9 rounded-md px-3 py-2 text-sm cursor-pointer font-normal"
              >
                {category.name}
              </Badge>
            </Link>
          ))}
        </>
      ) : (
        <>
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="w-20 h-9" />
          ))}
        </>
      )}
    </div>
  );
}
