import { css } from "@emotion/react";
import styled from "@emotion/styled";

export const FeaturedCard = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;

  background-image: url("/_/assistant/featured-cta-background.png");
  background-repeat: no-repeat;
  background-position: right;
  background-size: 600px;

  max-height: 600px;
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

  h2 {
    font-size: 40px;
    font-family: "Helvetica Neue", sans-serif;
    font-weight: 700;
    line-height: 95%;
  }

  p {
    font-size: 18px;
    max-width: 400px;
  }
`;
