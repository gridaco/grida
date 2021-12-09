import { HomeInputLayout } from "layout/home-input";
import { HomeLayout } from "layout/home";
import React from "react";
import { useAuthState } from "hooks/use-auth-state";

export default function Home() {
  const authstate = useAuthState();

  switch (authstate) {
    case "loading":
    case "expired":
    case "unauthorized":
    default:
      return <HomeInputLayout />;
    case "signedin":
      return <HomeLayout />;
  }
}
