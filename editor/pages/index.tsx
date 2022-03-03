import { HomeInput } from "scaffolds/home-input";
import { HomeDashboard } from "scaffolds/home-dashboard";
import React from "react";
import { useAuthState } from "hooks/use-auth-state";

export default function Home() {
  const authstate = useAuthState();

  // region - dev injected
  return <HomeDashboard />;
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
