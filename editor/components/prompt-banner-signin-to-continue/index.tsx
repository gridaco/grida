import styled from "@emotion/styled";
import React from "react";
import { useAuthState } from "hooks";
import { useRouter } from "next/router";
import { ArrowRightIcon } from "@radix-ui/react-icons";
const __is_prod = process.env.NODE_ENV == "production";
const __overide_show_if_dev = true;

export function SigninToContinuePrmoptProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const authstate = useAuthState();

  const shouldshow = authstate == "expired" || authstate == "unauthorized";

  return (
    <>
      {children}
      {((__is_prod && shouldshow) || (!__is_prod && __overide_show_if_dev)) && (
        <SigninToContinueBannerPrmopt />
      )}
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
      <Container>
        <h5>Ready to build your Apps with Grida?</h5>
        <CTAButton onClick={onnextclick}>
          Sign Up
          <ArrowRightIcon width={20} height={20} />
        </CTAButton>
      </Container>
    </Positioner>
  );
}

const Positioner = styled.div`
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 40px 40px;

  z-index: 998;
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: center;
  box-sizing: border-box;

  a {
    margin: 0px 2px;
    text-decoration: underline;
  }
`;

const Container = styled.div`
  width: 100%;
  max-width: 600px;
  min-width: 400px;
  background-color: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(21px);
  color: white;
  display: flex;
  justify-content: space-between;
  flex-direction: row;
  align-items: center;
  flex: none;
  padding: 16px 24px;
  border-radius: 48px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  gap: 48px;
  box-sizing: border-box;
  box-shadow: 0px 4px 32px rgba(0, 0, 0, 0.24);

  h5 {
    color: white;
    margin: 0;
    text-overflow: ellipsis;
    font-weight: 500;
  }
`;

const CTAButton = styled.button`
  cursor: pointer;
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 4px;
  border-radius: 24px;
  background-color: transparent;
  border: 1px solid rgba(255, 255, 255, 0.4);
  box-sizing: border-box;
  padding: 8px 16px;

  outline: none;

  color: white;
  text-overflow: ellipsis;
  font-weight: 500;
  text-align: left;

  :hover {
    opacity: 0.9;
    scale: 1.02;
  }

  :focus {
    opacity: 0.9;
  }

  transition: all 0.1s ease-in-out;
`;
