"use client";

import React, { useState, useEffect } from "react";
import Gallery, { GallerySkeleton } from "../../_components/gallery";
import { similar } from "../../actions";
import type { Library } from "@/lib/library";

export default function Similar({ object_id }: { object_id: string }) {
  const [sims, setSims] = useState<Library.ObjectDetail[]>();
  useEffect(() => {
    similar(object_id).then((res) => {
      if (res.data) {
        setSims(res.data);
      }
    });
  }, [object_id]);

  const next = async (range: [number, number]) => {
    const objects = await similar(object_id, { range });
    return objects.data!;
  };

  if (!sims) {
    return <GallerySkeleton />;
  }

  return <Gallery objects={sims} next={next} />;
}
