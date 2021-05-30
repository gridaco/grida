import React from "react";
import { HomeScaffold } from "../layouts/home-scaffold";
import { ContentCard } from "../cards";
import Embed from "@boring-ui/embed";
import { Scaffold } from "@boringso/react-core";
export function Home() {
  return (
    <HomeScaffold navigation={<></>}>
      <>
        <ContentCard title="aha" description="hihi" />
        <Embed url="https://www.youtube.com/watch?v=RIZjZFoDhRc" />
        <Scaffold />
      </>
    </HomeScaffold>
  );
}
