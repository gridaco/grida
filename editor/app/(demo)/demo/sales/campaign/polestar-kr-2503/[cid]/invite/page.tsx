import React from "react";
import { ScreenWindowRoot } from "@/theme/templates/kit/components";
import TMP_Invite from "./component";

type Params = {
  cid: string;
};

export default async function Page({ params }: { params: Promise<Params> }) {
  return (
    <ScreenWindowRoot>
      <TMP_Invite params={await params} />
    </ScreenWindowRoot>
  );
}
