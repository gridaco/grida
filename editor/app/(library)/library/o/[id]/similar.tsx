"use client";

import React, { useEffect } from "react";
import { similar } from "../../actions";
import { type Library } from "@/lib/library";
import Gallery from "../../_components/gallery";

export default function Similar({ object_id }: { object_id: string }) {
  const [sims, setSims] = React.useState<Library.ObjectDetail[]>();
  useEffect(() => {
    similar(object_id).then((res) => {
      if (res.data) {
        setSims(res.data);
      }
    });
  }, [object_id]);

  return <Gallery objects={sims} />;
}
