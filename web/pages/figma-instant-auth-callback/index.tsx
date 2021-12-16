import styled from "@emotion/styled";
import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";

import {
  getAnonymousFigmaAccessTokenOneshot,
  saveFigmaAccessToken__localstorage,
} from "utils/instant-demo/figma-anonymous-auth";

export default function FigmaInstantAuthCallback() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);

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
        setAuthenticated(true);
        window.close();
      });
    }
  }, [router]);
  return (
    <Wrapper>
      <PrompText>
        {!authenticated
          ? "Authenticating..."
          : "Authenticated: You can now close this window"}
      </PrompText>
    </Wrapper>
  );
}

const Wrapper = styled.div`
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  align-content: center;
  justify-content: center;
`;

const PrompText = styled.p`
  font-size: 1rem;
  font-weight: 500;
  color: #3333336e;
`;
