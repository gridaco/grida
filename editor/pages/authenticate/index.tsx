import React from "react";
import { useAuthState } from "../../hooks";
import { useRouter } from "next/router";

export default function AuthenticationPage() {
  const router = useRouter();
  const authstate = useAuthState();
  switch (authstate) {
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
    case "loading":
    default: {
      return (
        <>
          <h6>Loading...</h6>
        </>
      );
    }
  }
}
