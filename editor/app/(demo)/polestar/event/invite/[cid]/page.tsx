import React from "react";
import { ScreenWindowRoot } from "@/theme/templates/kit/components";
import Invite from "./main";

type Params = {
  cid: string;
};

export default async function Page({ params }: { params: Promise<Params> }) {
  return (
    <ScreenWindowRoot>
      <Invite params={await params} />
    </ScreenWindowRoot>
  );
}
