import React from "react";
import styled from "@emotion/styled";
import Image from "next/image";
import { Flex } from "rebass";

export default function LiveDesignDemoFrame() {
  return (
    <DesignFramePreview bg="#fff">
      <Image src="/design_source.png" width="440px" height="540px" />
    </DesignFramePreview>
  );
}

const DesignFramePreview = styled(Flex)`
  box-shadow: 0px 4px 128px 32px rgba(0, 0, 0, 0.08);
  width: 350px;
  height: 542px;
  top: 15%;
  position: absolute;
  border-radius: 12px;
  left: 40%;
  align-items: center;
  justify-content: center;

  div {
    width: 252px;
    height: 300px;
  }

  @media (max-width: 800px) {
    width: 400px;
    height: 500px;
    top: 15%;
    left: 45%;
  }

  @media (max-width: 720px) {
    width: 280px;
    height: 350px;
    top: 20%;
    left: -5%;
  }

  @media (max-width: 400px) {
    width: 280px;
    height: 350px;
    top: 20%;
    left: 0% !important;
  }
`;
