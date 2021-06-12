import React from "react";
import { HomeScaffold } from "../layouts/home-scaffold";
import { ContentCard } from "../cards";
import { Scaffold as BoringScaffold } from "@boringso/react-core";

export function Home() {
  return (
    <HomeScaffold navigation={<></>}>
      <>
        <BoringScaffold />
      </>
    </HomeScaffold>
  );
}
