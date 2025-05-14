import React from "react";
import styled from "@emotion/styled";

export const HomeLogo = ({ size = 42 }: { size?: number }) => {
  return (
    <HomeLogo42 size={size}>
      {/* TODO: replace asset */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 42 42"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M27.6584 13.8687L27.5796 28.2889L41.5271 41.9212V27.7373V27.5009L41.525 27.4989C41.3978 19.9495 35.2382 13.8687 27.6584 13.8687Z"
          fill="white"
        />
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M26.02 7.17866C19.0948 7.95373 13.7111 13.8284 13.7111 20.9606V27.5797L13.9475 42L0 28.3677V13.8687V13.7899L0.000217973 13.7901C0.042516 6.16679 6.23543 0 13.8687 0C19.1022 0 23.6587 2.89894 26.02 7.17866Z"
          fill="white"
        />
      </svg>
    </HomeLogo42>
  );
};

const HomeLogo42 = styled.div<{ size: number }>`
  width: ${(p) => p.size}px;
  height: ${(p) => p.size}px;
  position: relative;
  -webkit-user-drag: none;
  user-select: none;
`;
