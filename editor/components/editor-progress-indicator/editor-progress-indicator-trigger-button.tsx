import React from "react";
import styled from "@emotion/styled";

export function EditorProgressIndicatorButton({
  isBusy = false,
}: {
  isBusy?: boolean;
}) {
  return (
    <Container>
      <svg
        width="16"
        height="12"
        viewBox="0 0 16 12"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M13.7455 5.74546L15.9 5.74546L13.0273 2.87273L10.1546 5.74546L12.3091 5.74546C12.3091 8.12264 10.3772 10.0545 8.00002 10.0545C7.27466 10.0545 6.58521 9.875 5.98911 9.55182L4.94057 10.6004C5.82393 11.1605 6.87248 11.4909 8.00002 11.4909C11.1744 11.4909 13.7455 8.91982 13.7455 5.74546ZM3.69093 5.74546C3.69093 3.36827 5.62284 1.43636 8.00002 1.43636C8.72539 1.43636 9.41484 1.61591 10.0109 1.93909L11.0595 0.890545C10.1761 0.330363 9.12757 -2.96033e-07 8.00002 -3.4532e-07C4.82566 -4.84076e-07 2.25457 2.57109 2.25457 5.74546L0.100023 5.74546L2.97275 8.61818L5.84548 5.74546L3.69093 5.74546Z"
          fill="#787878"
        />
      </svg>
      {isBusy && <IndicatorLine />}
    </Container>
  );
}

const Container = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: column;
  align-items: center;
  flex: none;
  gap: 2px;
  box-sizing: border-box;
`;

const IndicatorLine = styled.div`
  width: 20px;
  height: 4px;
  background-color: rgb(37, 98, 255);
  border-radius: 7px;
`;
