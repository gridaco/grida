import React from "react";
import Head from "next/head";

import { HomeInput } from "scaffolds/home-input";
import { HomeDashboard } from "scaffolds/home-dashboard";
import { useAuthState } from "hooks/use-auth-state";

export default function Home() {
  const authstate = useAuthState();

  // region - dev injected
  return (
    <>
      <Head>
        <title>Grida | Home</title>
      </Head>
      <HomeDashboard />
    </>
  );
  // endregion

  switch (authstate) {
    case "loading":
    case "expired":
    case "unauthorized":
    default:
      return <HomeInput />;
    case "signedin":
      return <HomeDashboard />;
  }
}
