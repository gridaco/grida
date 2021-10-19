import styled from "@emotion/styled";
import { useRouter } from "next/router";
import React from "react";

import { useAuthState } from "utils/hooks/use-auth-state";

const _temporary_cors_signup_form_link =
  "https://docs.google.com/forms/d/e/1FAIpQLSdQy0fc4fLIBRZSyVyMkE0PSTMW7Yk1EzhhPgLBTwXddL1Wwg/viewform?usp=sf_link";

const this_web_base_url =
  process.env.NODE_ENV == "production"
    ? "https://grida.co"
    : "http://localhost:3000";

export default function TemporaryCorsServiceApiSignupProxyPage() {
  const loginstate = useAuthState();
  const router = useRouter();

  switch (loginstate) {
    case "expired":
    case "unauthorized":
      router.push(
        "https://accounts.grida.co/signup?redirect_uri=" +
          encodeURIComponent(this_web_base_url + router.asPath),
      );
      return <CorsLoadingStateTemporarySignupForApiKey />;
    case "signedin":
      router.replace(_temporary_cors_signup_form_link);
      return <CorsLoadingStateTemporarySignupForApiKey />;
    case "loading":
      return <CorsLoadingStateTemporarySignupForApiKey />;
  }
}

function CorsLoadingStateTemporarySignupForApiKey() {
  return (
    <RootWrapperCorsLoadingStateTemporarySignupForApiKey>
      <Frame1>
        <Loading>Loading...</Loading>
        <CheckingYourAuthenticationState>
          Checking your authentication state
        </CheckingYourAuthenticationState>
      </Frame1>
    </RootWrapperCorsLoadingStateTemporarySignupForApiKey>
  );
}

const RootWrapperCorsLoadingStateTemporarySignupForApiKey = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: center;
  flex: none;
  gap: 10px;
  min-height: 100vh;
  background-color: rgba(255, 255, 255, 1);
  box-sizing: border-box;
`;

const Frame1 = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: center;
  flex: none;
  gap: 8px;
  width: 249px;
  height: 47px;
  box-sizing: border-box;
`;

const Loading = styled.span`
  color: rgba(96, 96, 96, 1);
  text-overflow: ellipsis;
  font-size: 16px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 500;
  text-align: center;
`;

const CheckingYourAuthenticationState = styled.span`
  color: rgba(167, 167, 167, 1);
  text-overflow: ellipsis;
  font-size: 16px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: center;
`;
