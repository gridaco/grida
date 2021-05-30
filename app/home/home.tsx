import React from "react";
import { HomeScaffold } from "../layouts/home-scaffold";
import { ContentCard } from "../cards";
export function Home() {
  return (
    <HomeScaffold navigation={<></>}>
      <>
        <ContentCard title="aha" description="hihi" />
      </>
    </HomeScaffold>
  );
}
