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
  max-width: 1200px;
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

  button {
    border-radius: 4px;
    padding: 10px 16px;
    font-size: 18px;
    font-family: "Roboto Mono", sans-serif;
    font-weight: 500;
    border: none;
    outline: none;
    cursor: pointer;

    :hover {
      opacity: 0.8;
    }

    :disabled {
      opacity: 0.5;
    }

    :active {
      opacity: 1;
    }

    :focus {
    }
  }

  button.primary {
    background-color: rgba(0, 0, 0, 0.9);
    color: white;
  }

  input {
    background-color: rgba(0, 0, 0, 0.02);
    border: solid 1px rgba(0, 0, 0, 0.04);
    border-radius: 4px;
    padding: 10px 16px;
    box-sizing: border-box;
    color: rgba(0, 0, 0, 0.8);
    font-size: 18px;
    font-family: "Roboto Mono", sans-serif;
    font-weight: 400;
    text-align: start;

    ::placeholder {
      color: rgba(0, 0, 0, 0.5);
      font-size: 18px;
      font-family: "Roboto Mono", sans-serif;
      font-weight: 400;
    }
  }
`;
