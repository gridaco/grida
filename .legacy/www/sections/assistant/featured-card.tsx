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

    @media screen and (max-width: 768px) {
      font-size: 40px;
    }
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
    opacity: 0.7;
    margin-top: 16px;
    margin-bottom: 24px;
  }

  .cta {
    display: flex;
    @media screen and (max-width: 768px) {
      flex-direction: column;
    }

    flex-direction: row;
    gap: 16px;
    font-size: 16px;
    margin-top: 32px;

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

    button.primary {
      background: rgba(0, 0, 0, 0.95) !important;
      color: white;

      &:hover {
        background: rgba(0, 0, 0, 1);
        scale: 1.05;
        opacity: 1;
      }
    }

    button {
      cursor: pointer;
      opacity: 0.95;
      font-size: 18px;
      font-weight: 500;
      padding: 16px 32px;
      border-radius: 4px;
      border: none;
      background: rgba(0, 0, 0, 0.01);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;

      &:hover {
        background: rgba(0, 0, 0, 0.05);
        scale: 1.05;
        opacity: 1;
      }

      &:active {
        background: rgba(0, 0, 0, 0.1);
        scale: 1;
        opacity: 1;
      }

      transition: all 0.15s ease-in-out;
    }
  }
`;
