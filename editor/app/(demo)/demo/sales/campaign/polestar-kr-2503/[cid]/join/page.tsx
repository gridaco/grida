import React from "react";
import { ScreenWindowRoot } from "@/theme/templates/kit/components";
import { mock } from "../../data";
import { notFound } from "next/navigation";
import Join from "./_flows/page";

type Params = {
  cid: string;
};

export default async function BPage({ params }: { params: Promise<Params> }) {
  const cid = (await params).cid;

  const d = mock.find((c) => c.cid === cid);
  if (!d) {
    return notFound();
  }

  return (
    <ScreenWindowRoot>
      <Join params={await params} />
    </ScreenWindowRoot>
  );
}
