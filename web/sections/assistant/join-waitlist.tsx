import styled from "@emotion/styled";
import React from "react";

export function JoinWaitlistSection() {
  return (
    <div
      style={{
        display: "flex",
        padding: "40px",
        justifyContent: "center",
      }}
    >
      <CardWrapper>
        <h1>Join the waitlist</h1>
        <button>Register</button>
      </CardWrapper>
    </div>
  );
}

const CardWrapper = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;

  padding: 160px 80px;

  background-color: white;
  border: solid 1px rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  position: relative;
  box-shadow: 0px 4px 48px 24px rgba(0, 0, 0, 0.04);

  h1 {
    font-size: 74px;
    font-family: "Helvetica Neue", sans-serif;
    font-weight: 700;
    line-height: 95%;
  }
`;
