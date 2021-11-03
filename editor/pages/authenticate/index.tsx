import React from "react";
import { useAuthState } from "@base-sdk-fp/auth-components-react";
import { useRouter } from "next/router";

export default function AuthenticationPage() {
  const router = useRouter();
  const authstate = useAuthState();
  switch (authstate) {
    case "loading": {
      return (
        <>
          <h6>Loading...</h6>
        </>
      );
    }
    case "signedin": {
      router.back();
      break;
    }
    case "expired":
    case "unauthorized": {
      return (
        <>
          <button
            onClick={() => {
              router.replace(
                "https://accounts.grida.co/signin?redirect_uri=" +
                  window.location.href
              );
            }}
          >
            sign in
          </button>
        </>
      );
    }
  }
}
