import { useRouter } from "next/router";
import React, { useEffect } from "react";

import {
  getAnonymousFigmaAccessTokenOneshot,
  saveFigmaAccessToken__localstorage,
} from "utils/instant-demo/figma-anonymous-auth";

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
        saveFigmaAccessToken__localstorage(d);
        window.close();
      });
    }
  }, [router]);
  return <>Authenticating...</>;
}
