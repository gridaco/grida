import styled from "@emotion/styled";
import React, { useEffect } from "react";
import { useAuthState } from "hooks";
import { useRouter } from "next/router";

const __is_dev = process.env.NODE_ENV == "development";

export function SigninToContinueBannerPrmoptProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const authstate = useAuthState();

  const shouldshow = authstate == "expired" || authstate == "unauthorized";

  return (
    <>
      {children}
      {!__is_dev && shouldshow && <SigninToContinueBannerPrmopt />}
    </>
  );
}

export function SigninToContinueBannerPrmopt() {
  const router = useRouter();
  const onnextclick = () => {
    const signinurl = `https://accounts.grida.co/signin?redirect_uri=${window.location.href}`;
    router.replace(signinurl);
  };

  return (
    <Positioner>
      <Contents>
        <Desc>Ready to build your apps with Grida?</Desc>
        <NextButton onClick={onnextclick}>Next</NextButton>
      </Contents>
    </Positioner>
  );
}

const Positioner = styled.div`
  display: flex;
  align-items: center;
  flex-direction: column;
  justify-content: center;
  align-items: flex-end;

  position: fixed;
  bottom: 0;
  left: 0px;
  right: 0px;

  background-color: #fff;
  z-index: 998;

  justify-content: center;
  flex-direction: column;
  align-items: end;
  box-sizing: border-box;
  padding: 16px 20px;

  a {
    margin: 0px 2px;
    text-decoration: underline;
  }
`;

const Contents = styled.div`
  display: flex;
  justify-content: flex-end;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 48px;
  width: 439px;
  height: 59px;
  box-sizing: border-box;
`;

const Desc = styled.span`
  color: rgba(0, 0, 0, 1);
  text-overflow: ellipsis;
  font-size: 16px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 500;
  text-align: center;
`;

const NextButton = styled.button`
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 10px;
  border-radius: 4px;
  width: 116px;
  height: 59px;
  background-color: rgba(45, 66, 255, 1);
  box-sizing: border-box;
  padding: 10px 10px;

  outline: none;
  border: none;

  color: rgba(255, 255, 255, 1);
  text-overflow: ellipsis;
  font-size: 21px;
  font-family: "Helvetica Neue", sans-serif;
  font-weight: 400;
  text-align: left;

  :hover {
    opacity: 0.9;
  }

  :focus {
    opacity: 0.9;
  }
`;
