import React from "react";
import styled from "@emotion/styled";

export const HomeLogo = ({ size = 42 }: { size?: number }) => {
  return (
    <HomeLogo42 size={size}>
      {/* TODO: replace asset */}
      <LogoShapeOnlyArtwork
        src="https://s3-us-west-2.amazonaws.com/figma-alpha-api/img/b255/41fd/5561b9a9e4b1fc7bffb16600f95b232a"
        alt="image of LogoShapeOnlyArtwork"
      ></LogoShapeOnlyArtwork>
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

const LogoShapeOnlyArtwork = styled.img`
  object-fit: cover;
  position: absolute;
  left: 0px;
  top: 0px;
  right: 0px;
  bottom: 0px;
`;
