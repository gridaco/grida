import { useRouter } from "next/router";
import React, { useEffect } from "react";

import { getAnonymousFigmaAccessTokenOneshot } from "utils/instant-demo/figma-anonymous-auth";

export default function FigmaInstantAuthCallback() {
  const router = useRouter();

  // e.g http://localhost:3000/figma-instant-auth-callback?code=5HBd1JhxxxxjMHoLLCINTPJ&state=JHh9htGOmfXNdffsU-8
  const { code, state } = router.query;

  // TODO: do close window.
  useEffect(() => {
    if (code) {
      // issue a access token with the code.
      getAnonymousFigmaAccessTokenOneshot({
        code: code as string,
        state: state as string,
      }).then(d => {
        window.sessionStorage.setItem(
          "figma-access-token-anonymous-for-session",
          d.accessToken,
        );
        window.postMessage("figma-instnat-auth-callback-complete", "*");
        window.close();
      });
    }
  }, [router]);
  return <>Authenticating...</>;
}
